// Sealing. This file is the whole cryptosystem, so it is written to be read.
//
//   - A password or owner key is 130 random bits, generated, never chosen.
//     That's why there's no Argon2 here: a slow hash only helps a guessable
//     secret, and these can't be guessed. See docs/SECURITY.md.
//   - HKDF-SHA-256 turns a key into purpose-specific keys.
//   - Each gate has a random AES-256-GCM key, new on every publish.
//   - A password's sealed envelope holds the keys to the gates it opens.
//   - A link between two gates is sealed under a key derived from both gates,
//     so only a password that opens both can read it.
//   - Every envelope also lists the hash of every part its reader may read. Gate
//     keys are shared, so AES-GCM alone only proves "someone with this gate's key
//     wrote this", and that includes other readers. The manifest is sealed under
//     this password's own key, so nobody else can change what it vouches for.
//
// Only the platform's Web Crypto is used, so the same code runs in a browser
// and in Node with no dependencies.

import { costForReaders, pieceForReaders } from './readers.ts'
import type { Bundle, Company, Cost, Gate, Link, Piece, Sealed, Vault, View } from './types.ts'

const subtle = globalThis.crypto.subtle
const FORMAT = 'vadere/1'
const enc = new TextEncoder()
const dec = new TextDecoder()

// Encoding

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz' // Crockford base32, lowercase

function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function randomBase32(chars: number): string {
  const r = globalThis.crypto.getRandomValues(new Uint8Array(chars))
  let s = ''
  // 256 is a multiple of 32, so masking is uniform.
  for (const b of r) s += ALPHABET[b & 31]
  return s
}

// Keys

/** 26 base32 characters is 130 bits. */
const KEY_CHARS = 26

export function generatePassword(): string {
  return 'vdr_' + randomBase32(KEY_CHARS)
}

export function generateOwnerKey(): string {
  return 'vdo_' + randomBase32(KEY_CHARS)
}

const KEY_SHAPE = /^vd[ro]_[0-9a-hjkmnp-tv-z]{26}$/

export function looksLikeKey(s: string): boolean {
  return KEY_SHAPE.test(s)
}

export function newId(chars = 10): string {
  return randomBase32(chars)
}

async function hkdf(ikm: Uint8Array<ArrayBuffer>, info: string, bytes = 32): Promise<Uint8Array<ArrayBuffer>> {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(FORMAT), info: enc.encode(info) },
    key,
    bytes * 8,
  )
  return new Uint8Array(bits)
}

const fromSecret = (secret: string, info: string, bytes = 32) => hkdf(enc.encode(secret), info, bytes)

/** Public handle for a password. Lets a client find its envelope without trying all of them. */
export async function passwordId(key: string): Promise<string> {
  const b = await fromSecret(key, 'password id', 8)
  return hex(b)
}

/** Sent when publishing. The host stores only a hash of this. */
export async function publishToken(ownerKey: string): Promise<string> {
  return hex(await fromSecret(ownerKey, 'publish token'))
}

export async function sha256Hex(s: string): Promise<string> {
  return hex(new Uint8Array(await subtle.digest('SHA-256', enc.encode(s))))
}

// Parts

/**
 * Padmé padding (Nikitin et al., 2019). Hides a part's exact length so sizes
 * reveal little, with at most 12% overhead. Parts below 1 KiB round up to 1 KiB.
 */
export function paddedLength(n: number): number {
  const L = Math.max(n, 1024)
  const E = Math.floor(Math.log2(L))
  const S = Math.floor(Math.log2(E)) + 1
  const mask = 2 ** (E - S) - 1
  return Math.floor((L + mask) / (mask + 1)) * (mask + 1)
}

function pad(plain: Uint8Array): Uint8Array<ArrayBuffer> {
  const total = paddedLength(plain.length + 4)
  const out = new Uint8Array(total)
  new DataView(out.buffer).setUint32(0, plain.length)
  out.set(plain, 4)
  return out
}

function unpad(padded: Uint8Array): Uint8Array {
  const n = new DataView(padded.buffer, padded.byteOffset, padded.byteLength).getUint32(0)
  if (n + 4 > padded.length) throw new Error('bad padding')
  return padded.subarray(4, 4 + n)
}

/** Binds a part to this site, this version and this slot, so parts can't be swapped around. */
const aad = (site: string, version: number, part: string) => enc.encode(`${FORMAT}|${site}|${version}|${part}`)

async function sealPart(keyBytes: Uint8Array<ArrayBuffer>, ad: Uint8Array<ArrayBuffer>, value: unknown): Promise<Sealed> {
  const key = await subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ad }, key, pad(enc.encode(JSON.stringify(value))))
  return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) }
}

async function openPart<T>(keyBytes: Uint8Array<ArrayBuffer>, ad: Uint8Array<ArrayBuffer>, sealed: Sealed): Promise<T> {
  const key = await subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(sealed.iv), additionalData: ad },
    key,
    b64ToBytes(sealed.ct),
  )
  return JSON.parse(dec.decode(unpad(new Uint8Array(plain)))) as T
}

// Bridges: links that cross between two gates.

function concatSorted(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const [x, y] = hex(a) < hex(b) ? [a, b] : [b, a]
  const out = new Uint8Array(x.length + y.length)
  out.set(x, 0)
  out.set(y, x.length)
  return out
}

async function bridgeKeys(a: Uint8Array, b: Uint8Array) {
  const ikm = concatSorted(a, b)
  return { id: hex(await hkdf(ikm, 'bridge id', 8)), key: await hkdf(ikm, 'bridge key') }
}

// What each part holds

interface Head {
  company: Company
  currency: string
}

interface GatePart {
  gate: Gate
  pieces: Piece[]
  links: Link[]
  costs?: Cost[]
}

/** Everything a reader may trust, fixed by whoever sealed this envelope. */
interface Manifest {
  head: string
  /** Hash of each gate part, by position in Envelope.gates. */
  gates: string[]
  /** Each bridge this reader must find: positions of its two gates, and its hash. */
  bridges: { a: number; b: number; hash: string }[]
  sealedAt: string
  remote: boolean
}

interface Envelope {
  name: string
  head: string
  gates: { part: string; key: string }[]
  closedGates: number
  manifest: Manifest
}

const hashOf = (s: Sealed) => sha256Hex(`${s.iv}.${s.ct}`)

// Limits keep a hostile bundle from costing the host real CPU.
export const MAX_GATES = 64
export const MAX_PASSWORDS = 256
const MAX_BRIDGES = (MAX_GATES * (MAX_GATES - 1)) / 2

// Seal

export async function sealVault(vault: Vault, version: number): Promise<Bundle> {
  const site = vault.site?.name
  const ownerKey = vault.site?.ownerKey
  if (!site || !ownerKey) throw new Error('A map needs a name and an owner key before it can be sealed.')

  const random = () => globalThis.crypto.getRandomValues(new Uint8Array(32))
  const gateKeys = new Map<string, Uint8Array<ArrayBuffer>>(vault.gates.map((g) => [g.id, random()]))
  const gateParts = new Map<string, string>(vault.gates.map((g) => [g.id, randomBase32(16)]))
  const headKey = random()

  const pieceGate = new Map(vault.pieces.map((p) => [p.id, p.gate]))
  const money = vault.gates.find((g) => g.builtin === 'money')

  // Gates, each holding its own pieces and the links that stay inside it.
  if (vault.gates.length > MAX_GATES) throw new Error(`A map can have at most ${MAX_GATES} gates.`)
  if (vault.passwords.length > MAX_PASSWORDS) throw new Error(`A map can have at most ${MAX_PASSWORDS} passwords.`)

  const sealedAt = new Date().toISOString()
  const gates: Bundle['gates'] = {}
  const gateHash = new Map<string, string>()
  for (const gate of vault.gates) {
    const part = gateParts.get(gate.id)!
    const pieces = vault.pieces.filter((p) => p.gate === gate.id).map(pieceForReaders)
    const links = vault.links.filter((l) => pieceGate.get(l.from) === gate.id && pieceGate.get(l.to) === gate.id)
    const value: GatePart = { gate, pieces, links }
    if (gate.id === money?.id) value.costs = vault.costs.map(costForReaders)
    gates[part] = await sealPart(gateKeys.get(gate.id)!, aad(site, version, part), value)
    gateHash.set(gate.id, await hashOf(gates[part]))
  }

  // Bridges: links between two different gates.
  const crossing = new Map<string, { a: string; b: string; links: Link[] }>()
  for (const link of vault.links) {
    const a = pieceGate.get(link.from)
    const b = pieceGate.get(link.to)
    if (!a || !b || a === b) continue
    const pair = [a, b].sort().join('|')
    if (!crossing.has(pair)) crossing.set(pair, { a, b, links: [] })
    crossing.get(pair)!.links.push(link)
  }
  const bridges: Bundle['bridges'] = {}
  const bridgeHash = new Map<string, string>()
  for (const [pair, { a, b, links }] of crossing) {
    const { id, key } = await bridgeKeys(gateKeys.get(a)!, gateKeys.get(b)!)
    bridges[id] = await sealPart(key, aad(site, version, id), links)
    bridgeHash.set(pair, await hashOf(bridges[id]))
  }

  const head: Head = { company: vault.company, currency: vault.currency }
  const sealedHead = await sealPart(headKey, aad(site, version, 'head'), head)
  const headHash = await hashOf(sealedHead)

  // One envelope per password. New gate keys every time, so a removed password
  // can't read anything published after it was removed.
  const passwords: Bundle['passwords'] = {}
  for (const pw of vault.passwords) {
    const id = await passwordId(pw.key)
    // In map order, so a reader sees the same order as the Studio's preview.
    const known = vault.gates.filter((g) => pw.gates.includes(g.id)).map((g) => g.id)
    const readableBridges: Manifest['bridges'] = []
    for (let a = 0; a < known.length; a++) {
      for (let b = a + 1; b < known.length; b++) {
        const hash = bridgeHash.get([known[a], known[b]].sort().join('|'))
        if (hash) readableBridges.push({ a, b, hash })
      }
    }
    const envelope: Envelope = {
      name: pw.name,
      head: bytesToB64(headKey),
      gates: known.map((g) => ({ part: gateParts.get(g)!, key: bytesToB64(gateKeys.get(g)!) })),
      closedGates: vault.gates.length - known.length,
      manifest: {
        head: headHash,
        gates: known.map((g) => gateHash.get(g)!),
        bridges: readableBridges,
        sealedAt,
        remote: pw.remote,
      },
    }
    const wrap = await fromSecret(pw.key, `wrap ${site}`)
    passwords[id] = { remote: pw.remote, sealed: await sealPart(wrap, aad(site, version, `password ${id}`), envelope) }
  }

  // The owner's full copy, for signing in on another device. The owner key
  // itself is left out: whoever opens this already has it.
  const ownerCopy: Vault = { ...vault, site: { ...vault.site!, ownerKey: '' } }
  const ownerWrap = await fromSecret(ownerKey, `owner ${site}`)

  return {
    format: FORMAT,
    site,
    version,
    sealedAt,
    head: sealedHead,
    gates,
    bridges,
    passwords,
    owner: await sealPart(ownerWrap, aad(site, version, 'owner'), ownerCopy),
  }
}

// Open

export class WrongPassword extends Error {
  constructor() {
    super('That password does not open this map.')
    this.name = 'WrongPassword'
  }
}

/** The password is right, but what's stored isn't what the owner sealed for it. */
export class AlteredBundle extends Error {
  constructor() {
    super('This map has been altered or damaged, so it was refused.')
    this.name = 'AlteredBundle'
  }
}

export async function openBundle(bundle: Bundle, key: string): Promise<View> {
  const id = await passwordId(key)
  const entry = bundle.passwords[id]
  if (!entry) throw new WrongPassword()
  const { site, version } = bundle

  let envelope: Envelope
  try {
    const wrap = await fromSecret(key, `wrap ${site}`)
    envelope = await openPart<Envelope>(wrap, aad(site, version, `password ${id}`), entry.sealed)
  } catch {
    throw new WrongPassword()
  }

  // Nothing is believed until it matches what this password's own envelope vouches for.
  const m = envelope.manifest
  if (!m || m.sealedAt !== bundle.sealedAt || m.remote !== entry.remote) throw new AlteredBundle()
  if (m.gates.length !== envelope.gates.length) throw new AlteredBundle()
  if (envelope.gates.length > MAX_GATES || m.bridges.length > MAX_BRIDGES) throw new AlteredBundle()
  if (new Set(envelope.gates.map((g) => g.part)).size !== envelope.gates.length) throw new AlteredBundle()
  if ((await hashOf(bundle.head)) !== m.head) throw new AlteredBundle()

  const head = await openPart<Head>(b64ToBytes(envelope.head), aad(site, version, 'head'), bundle.head)

  const parts: GatePart[] = []
  for (const [i, { part, key: k }] of envelope.gates.entries()) {
    const sealed = bundle.gates[part]
    if (!sealed || (await hashOf(sealed)) !== m.gates[i]) throw new AlteredBundle()
    parts.push(await openPart<GatePart>(b64ToBytes(k), aad(site, version, part), sealed))
  }

  const links = parts.flatMap((p) => p.links)

  // The ID comes from both gates' keys, so a closed gate's bridges can't even be
  // located. The manifest says which must exist, so one can't quietly go missing.
  const keys = envelope.gates.map((g) => b64ToBytes(g.key))
  for (const { a, b, hash } of m.bridges) {
    if (!keys[a] || !keys[b] || a === b) throw new AlteredBundle()
    const { id: bridgeId, key: bridgeKey } = await bridgeKeys(keys[a], keys[b])
    const sealed = bundle.bridges[bridgeId]
    if (!sealed || (await hashOf(sealed)) !== hash) throw new AlteredBundle()
    links.push(...(await openPart<Link[]>(bridgeKey, aad(site, version, bridgeId), sealed)))
  }

  const moneyPart = parts.find((p) => p.costs)

  return {
    site,
    version,
    sealedAt: m.sealedAt,
    passwordName: envelope.name,
    company: head.company,
    currency: head.currency,
    gates: parts.map((p) => p.gate),
    closedGates: envelope.closedGates,
    pieces: parts.flatMap((p) => p.pieces),
    links,
    costs: moneyPart?.costs ?? null,
    remote: m.remote,
  }
}

export async function openOwnerCopy(bundle: Bundle, ownerKey: string): Promise<Vault> {
  try {
    const wrap = await fromSecret(ownerKey, `owner ${bundle.site}`)
    const vault = await openPart<Vault>(wrap, aad(bundle.site, bundle.version, 'owner'), bundle.owner)
    if (vault.site) vault.site.ownerKey = ownerKey
    return vault
  } catch {
    throw new WrongPassword()
  }
}

/** A cheap structural check the host can run without any keys. */
export function isBundleShaped(x: unknown, site: string): x is Bundle {
  const isSealed = (s: any) =>
    s && typeof s.iv === 'string' && typeof s.ct === 'string' && Object.keys(s).length === 2 &&
    /^[A-Za-z0-9+/]{16}$/.test(s.iv) && /^[A-Za-z0-9+/]+={0,2}$/.test(s.ct)
  const b = x as Bundle
  if (!b || b.format !== FORMAT || b.site !== site) return false
  if (!Number.isInteger(b.version) || b.version < 1) return false
  // Fields the host can't check by decrypting mustn't be a place to store anything else.
  if (typeof b.sealedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(b.sealedAt)) return false
  if (!isSealed(b.head) || !isSealed(b.owner)) return false
  const isMap = (m: unknown) => !!m && typeof m === 'object' && !Array.isArray(m)
  if (!isMap(b.gates) || !isMap(b.bridges) || !isMap(b.passwords)) return false
  const gateIds = Object.keys(b.gates)
  const bridgeIds = Object.keys(b.bridges)
  const passwordIds = Object.keys(b.passwords)
  if (gateIds.length > MAX_GATES || bridgeIds.length > MAX_BRIDGES || passwordIds.length > MAX_PASSWORDS) return false
  if (!gateIds.every((id) => /^[0-9a-hjkmnp-tv-z]{16}$/.test(id))) return false
  if (![...bridgeIds, ...passwordIds].every((id) => /^[0-9a-f]{16}$/.test(id))) return false
  if (!Object.values(b.gates).every(isSealed)) return false
  if (!Object.values(b.bridges).every(isSealed)) return false
  if (!Object.values(b.passwords).every((p: any) => typeof p?.remote === 'boolean' && isSealed(p.sealed) && Object.keys(p).length === 2)) return false
  const allowed = new Set(['format', 'site', 'version', 'sealedAt', 'head', 'gates', 'bridges', 'passwords', 'owner'])
  return Object.keys(b).every((k) => allowed.has(k))
}
