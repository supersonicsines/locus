// Signing in with Google, for who owns which names on a host. Nothing more.
//
// Google never touches a map or a recovery key: it only says who someone is. The
// host keeps a keyed hash of Google's id for that person, and never their email or
// name. Those ride in that browser's own cookie, signed, so the page can show them back.
//
// Node built-ins, fetch and Web Crypto only.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Google {
  clientId: string
  clientSecret: string
}

/** Where Google's sign-in lives. Tests and the dev preview point these at a fake; the CLI never does. */
export interface GoogleEndpoints {
  authorize: string
  token: string
}

export const GOOGLE_ENDPOINTS: GoogleEndpoints = {
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
}

export const SESSION_COOKIE = 'locus_session'
export const STATE_COOKIE = 'locus_auth'
const SESSION_SECONDS = 30 * 24 * 3600
const STATE_SECONDS = 10 * 60

export interface Session {
  /** A keyed hash of Google's id for this person. The only thing about them the host ever writes down. */
  uid: string
  name: string
  email: string
  exp: number
}

/** What the host expects back from Google, kept in the browser until it comes back. */
interface Pending {
  state: string
  verifier: string
  nonce: string
  next: string
  exp: number
}

const enc = new TextEncoder()
const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
const random = () => b64url(crypto.getRandomValues(new Uint8Array(32)))

/** Compares two strings in time that doesn't depend on where they differ. */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Where to go after signing in: a path on this host and nothing else. One slash, then
 * anything but a second slash or a backslash, in plain printable characters, because a
 * browser quietly drops tabs and newlines and `/\t/evil` would become `//evil`.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || next.length > 1000) return '/'
  if (!/^\/(?![/\\])[\x21-\x7e]*$/.test(next) || next.includes('\\')) return '/'
  if (next.startsWith('/api/')) return '/'
  return next
}

/** The key that signs cookies and turns Google's ids into account ids. Given, or made once and kept beside the maps. */
export function sessionSecret(dataDir: string, given?: string): string {
  if (given) return given
  const file = join(dataDir, 'session-secret')
  try {
    writeFileSync(file, `${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')}\n`, { mode: 0o600, flag: 'wx' })
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== 'EEXIST') throw e
  }
  const secret = readFileSync(file, 'utf8').trim()
  if (secret.length < 32) throw new Error(`${file} is too short to be a session secret. Delete it and start again; that signs everyone out and forgets which Google account owns which address.`)
  return secret
}

export function readCookie(header: string | null, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return undefined
}

const cookie = (name: string, value: string, path: string, maxAge: number, secure: boolean) =>
  `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`

export const clearSessionCookie = (secure: boolean) => cookie(SESSION_COOKIE, '', '/', 0, secure)
const clearStateCookie = (secure: boolean) => cookie(STATE_COOKIE, '', '/api/auth', 0, secure)

/** Why a sign-in failed, in a word that can go in a URL and says nothing else. */
export type Failure = 'denied' | 'expired' | 'state' | 'google' | 'token' | 'unverified'

/** What Google's token endpoint said about who signed in. Read only from a reply to our own request, over TLS, authenticated by the client secret. */
function problem(c: any, clientId: string, nonce: string): Failure | null {
  if (!c || typeof c !== 'object') return 'token'
  if (c.iss !== 'accounts.google.com' && c.iss !== 'https://accounts.google.com') return 'token'
  const audience = c.aud === clientId || (Array.isArray(c.aud) && c.aud.includes(clientId) && c.azp === clientId)
  if (!audience) return 'token'
  if (typeof c.exp !== 'number' || c.exp * 1000 <= Date.now()) return 'token'
  if (typeof c.nonce !== 'string' || !sameText(c.nonce, nonce)) return 'token'
  if (typeof c.sub !== 'string' || !c.sub || c.sub.length > 255) return 'token'
  if ((c.email_verified !== true && c.email_verified !== 'true') || typeof c.email !== 'string') return 'unverified'
  return null
}

export function createAuth(opts: { google: Google; secret: string; endpoints?: GoogleEndpoints; fetch?: typeof fetch }) {
  const { google } = opts
  const endpoints = opts.endpoints ?? GOOGLE_ENDPOINTS
  const fetcher = opts.fetch ?? fetch
  const key = crypto.subtle.importKey('raw', enc.encode(opts.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])

  // Each use has its own prefix, so nothing signed for one can stand in for another.
  const hmac = async (text: string) => new Uint8Array(await crypto.subtle.sign('HMAC', await key, enc.encode(text)))

  async function seal(label: string, value: object): Promise<string> {
    const body = b64url(enc.encode(JSON.stringify(value)))
    return `${body}.${b64url(await hmac(`${label}.${body}`))}`
  }

  async function unseal(label: string, raw: string | undefined): Promise<Record<string, unknown> | null> {
    if (!raw || raw.length > 4096) return null
    const [body, sig, extra] = raw.split('.')
    if (!body || !sig || extra !== undefined) return null
    if (!sameText(sig, b64url(await hmac(`${label}.${body}`)))) return null
    try {
      const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null
    } catch {
      return null
    }
  }

  /** Google's id for someone, turned into one this host can count by and nobody else can link back. */
  const uidOf = async (sub: string) => Buffer.from(await hmac(`google:${sub}`)).toString('hex').slice(0, 32)

  async function idTokenClaims(code: string, verifier: string, redirectUri: string): Promise<unknown> {
    const r = await fetcher(endpoints.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ code, client_id: google.clientId, client_secret: google.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }).toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    if (!r.ok) throw new Error('The token endpoint refused.')
    const text = await r.text()
    if (text.length > 65_536) throw new Error('The token endpoint said too much.')
    const idToken = JSON.parse(text)?.id_token
    if (typeof idToken !== 'string') throw new Error('No id_token.')
    const parts = idToken.split('.')
    if (parts.length !== 3) throw new Error('Not a JWT.')
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  }

  return {
    /** Where to send the browser, and the cookie that remembers what to expect back. */
    async start(redirectUri: string, next: string | null, secure: boolean): Promise<{ location: string; cookie: string }> {
      const pending: Pending = { state: random(), verifier: random(), nonce: random(), next: safeNext(next), exp: Date.now() + STATE_SECONDS * 1000 }
      const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(pending.verifier))))
      const query = new URLSearchParams({
        client_id: google.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state: pending.state,
        nonce: pending.nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      })
      return { location: `${endpoints.authorize}?${query}`, cookie: cookie(STATE_COOKIE, await seal('state', pending), '/api/auth', STATE_SECONDS, secure) }
    },

    /** Checks what came back, and asks Google who it was. A session, or a word for why not. Never logs or keeps the code or any token. */
    async finish(url: URL, cookieHeader: string | null, redirectUri: string, secure: boolean): Promise<{ next: string; cookies: string[] } | { failed: Failure; cookies: string[] }> {
      const cookies = [clearStateCookie(secure)]
      const fail = (failed: Failure) => ({ failed, cookies })
      if (url.searchParams.has('error')) return fail('denied')
      const pending = await unseal('state', readCookie(cookieHeader, STATE_COOKIE))
      if (!pending || typeof pending.exp !== 'number' || pending.exp <= Date.now()) return fail('expired')
      if (typeof pending.state !== 'string' || typeof pending.verifier !== 'string' || typeof pending.nonce !== 'string') return fail('expired')
      if (!sameText(url.searchParams.get('state') ?? '', pending.state)) return fail('state')
      const code = url.searchParams.get('code')
      if (!code || code.length > 4096) return fail('state')

      let claims: any
      try {
        claims = await idTokenClaims(code, pending.verifier, redirectUri)
      } catch {
        return fail('google')
      }
      const why = problem(claims, google.clientId, pending.nonce)
      if (why) return fail(why)

      const session = {
        v: 1,
        uid: await uidOf(claims.sub),
        name: typeof claims.name === 'string' ? claims.name.slice(0, 100) : '',
        email: String(claims.email).slice(0, 254),
        exp: Date.now() + SESSION_SECONDS * 1000,
      }
      cookies.push(cookie(SESSION_COOKIE, await seal('session', session), '/', SESSION_SECONDS, secure))
      return { next: safeNext(typeof pending.next === 'string' ? pending.next : '/'), cookies }
    },

    /** Who this browser is signed in as. Anything tampered with, expired or from another version is nobody. */
    async session(cookieHeader: string | null): Promise<Session | null> {
      const s = await unseal('session', readCookie(cookieHeader, SESSION_COOKIE))
      if (!s || s.v !== 1 || typeof s.uid !== 'string' || !/^[0-9a-f]{32}$/.test(s.uid) || typeof s.exp !== 'number' || s.exp <= Date.now()) return null
      return { uid: s.uid, name: typeof s.name === 'string' ? s.name : '', email: typeof s.email === 'string' ? s.email : '', exp: s.exp }
    },

    uidOf,
  }
}

export type Auth = ReturnType<typeof createAuth>
