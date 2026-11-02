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
//
// Only the platform's Web Crypto is used, so the same code runs in a browser
// and in Node with no dependencies.

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

interface Envelope {
  name: string
  head: string
  gates: { part: string; key: string }[]
  closedGates: number
}

/** Fields the owner keeps that no reader needs. */
function forReaders(p: Piece): Piece {
  // Unapproved proposals must never reach an agent as instructions.
  const out: Piece = { ...p }
  if (out.always === 'proposed') delete out.always
  if (out.mcp && !out.mcp.approved) delete out.mcp
  // Where pieces sit on the owner's map could hint at what's behind closed gates.
  delete out.x
  delete out.y
  return out
}

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
  const gates: Bundle['gates'] = {}
  for (const gate of vault.gates) {
    const part = gateParts.get(gate.id)!
    const pieces = vault.pieces.filter((p) => p.gate === gate.id).map(forReaders)
    const links = vault.links.filter((l) => pieceGate.get(l.from) === gate.id && pieceGate.get(l.to) === gate.id)
    const value: GatePart = { gate, pieces, links }
    if (gate.id === money?.id) value.costs = vault.costs
    gates[part] = await sealPart(gateKeys.get(gate.id)!, aad(site, version, part), value)
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
  for (const { a, b, links } of crossing.values()) {
    const { id, key } = await bridgeKeys(gateKeys.get(a)!, gateKeys.get(b)!)
    bridges[id] = await sealPart(key, aad(site, version, id), links)
  }

  // One envelope per password. New gate keys every time, so a removed password
  // can't read anything published after it was removed.
  const passwords: Bundle['passwords'] = {}
  for (const pw of vault.passwords) {
    const id = await passwordId(pw.key)
    // In map order, so a reader sees the same order as the Studio's preview.
    const known = vault.gates.filter((g) => pw.gates.includes(g.id)).map((g) => g.id)
    const envelope: Envelope = {
      name: pw.name,
      head: bytesToB64(headKey),
      gates: known.map((g) => ({ part: gateParts.get(g)!, key: bytesToB64(gateKeys.get(g)!) })),
      closedGates: vault.gates.length - known.length,
    }
    const wrap = await fromSecret(pw.key, `wrap ${site}`)
    passwords[id] = { remote: pw.remote, sealed: await sealPart(wrap, aad(site, version, `password ${id}`), envelope) }
  }

  const head: Head = { company: vault.company, currency: vault.currency }

  // The owner's full copy, for signing in on another device. The owner key
  // itself is left out: whoever opens this already has it.
  const ownerCopy: Vault = { ...vault, site: { ...vault.site!, ownerKey: '' } }
  const ownerWrap = await fromSecret(ownerKey, `owner ${site}`)

  return {
    format: FORMAT,
    site,
    version,
    sealedAt: new Date().toISOString(),
    head: await sealPart(headKey, aad(site, version, 'head'), head),
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

  const head = await openPart<Head>(b64ToBytes(envelope.head), aad(site, version, 'head'), bundle.head)

  const parts = await Promise.all(
    envelope.gates.map(async ({ part, key: k }) => {
      const sealed = bundle.gates[part]
      if (!sealed) throw new Error('This map is damaged: a gate is missing.')
      return openPart<GatePart>(b64ToBytes(k), aad(site, version, part), sealed)
    }),
  )

  const links = parts.flatMap((p) => p.links)

  // Every pair of open gates might have a bridge. The ID comes from both keys,
  // so a closed gate's bridges can't even be located.
  const keys = envelope.gates.map((g) => b64ToBytes(g.key))
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const { id: bridgeId, key: bridgeKey } = await bridgeKeys(keys[i], keys[j])
      const sealed = bundle.bridges[bridgeId]
      if (sealed) links.push(...(await openPart<Link[]>(bridgeKey, aad(site, version, bridgeId), sealed)))
    }
  }

  const moneyPart = parts.find((p) => p.costs)

  return {
    site,
    version,
    sealedAt: bundle.sealedAt,
    passwordName: envelope.name,
    company: head.company,
    currency: head.currency,
    gates: parts.map((p) => p.gate),
    closedGates: envelope.closedGates,
    pieces: parts.flatMap((p) => p.pieces),
    links,
    costs: moneyPart?.costs ?? null,
    remote: entry.remote,
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
    s && typeof s.iv === 'string' && typeof s.ct === 'string' && Object.keys(s).length === 2
  const b = x as Bundle
  if (!b || b.format !== FORMAT || b.site !== site) return false
  if (!Number.isInteger(b.version) || b.version < 1) return false
  if (typeof b.sealedAt !== 'string' || !isSealed(b.head) || !isSealed(b.owner)) return false
  if (!b.gates || !b.bridges || !b.passwords) return false
  if (!Object.values(b.gates).every(isSealed)) return false
  if (!Object.values(b.bridges).every(isSealed)) return false
  if (!Object.values(b.passwords).every((p: any) => typeof p?.remote === 'boolean' && isSealed(p.sealed))) return false
  const allowed = new Set(['format', 'site', 'version', 'sealedAt', 'head', 'gates', 'bridges', 'passwords', 'owner'])
  return Object.keys(b).every((k) => allowed.has(k))
}
