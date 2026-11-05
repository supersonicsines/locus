// Test helpers: what someone holding one password can do with the bytes.
// These mirror seal.ts on purpose, because an attacker would too.

import type { Bundle, Sealed } from '../src/core/types.ts'
import { passwordId } from '../src/core/seal.ts'

const subtle = globalThis.crypto.subtle
const enc = new TextEncoder()
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64')
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))

export const aad = (site: string, version: number, part: string) => enc.encode(`locus/1|${site}|${version}|${part}`)

async function derive(secret: string, info: string) {
  const key = await subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('locus/1'), info: enc.encode(info) }, key, 256))
}

export async function openWith(keyBytes: Uint8Array, ad: Uint8Array, s: Sealed): Promise<any> {
  const key = await subtle.importKey('raw', keyBytes as any, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) as any, additionalData: ad as any }, key, unb64(s.ct) as any))
  const n = new DataView(plain.buffer).getUint32(0)
  return JSON.parse(new TextDecoder().decode(plain.subarray(4, 4 + n)))
}

export async function sealWith(keyBytes: Uint8Array, ad: Uint8Array, value: unknown): Promise<Sealed> {
  const key = await subtle.importKey('raw', keyBytes as any, 'AES-GCM', false, ['encrypt'])
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const data = enc.encode(JSON.stringify(value))
  const padded = new Uint8Array(data.length + 4)
  new DataView(padded.buffer).setUint32(0, data.length)
  padded.set(data, 4)
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ad as any }, key, padded))
  return { iv: b64(iv), ct: b64(ct) }
}

export async function envelopeOf(bundle: Bundle, password: string) {
  const id = await passwordId(password)
  const wrap = await derive(password, `wrap ${bundle.site}`)
  const value = await openWith(wrap, aad(bundle.site, bundle.version, `password ${id}`), bundle.passwords[id].sealed)
  return { id, wrap, envelope: value }
}

export const keyOf = unb64
