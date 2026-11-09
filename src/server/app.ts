// The host. It claims names, stores sealed bundles and serves addresses.
//
// It has no dependencies and no logs of requests. A plain fetch-style handler,
// so it can move to another runtime later without a rewrite.
//
// Two paths touch plaintext, and only while answering a request: a Bearer header
// and a /k/ URL. Everything else handles ciphertext only.
//
// Signing in with Google, when it's on, says who owns which names. It never
// decrypts anything and never stands in for a recovery key (auth.ts).

import { readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { extname, join, normalize, sep } from 'node:path'
import { costsText, llmsFull, llmsTxt, lockedText, PACKAGE, pieceText, searchText } from '../core/agent.ts'
import { handleRpc, SERVER_VERSION } from '../core/mcp.ts'
import { AlteredBundle, isBundleShaped, looksLikeKey, openBundle, passwordId, sha256Hex, WrongPassword } from '../core/seal.ts'
import type { Bundle, View } from '../core/types.ts'
import { clearSessionCookie, createAuth, sessionSecret, type Google, type GoogleEndpoints } from './auth.ts'
import { FileStore } from './store.ts'

export interface Config {
  domain: string
  dataDir: string
  studioDir: string
  hosted: boolean
  maxAccounts: number
  maxBundleBytes: number
  powBits: number
  donateUrl: string
  abuseContact: string
  trustProxy: boolean
  proxyHops?: number
  /** Hosted mode: how many new addresses the whole host gives out in an hour, whoever asks. */
  claimsPerHour?: number
  /** Sign in with Google. In hosted mode a new address then needs it, and each account gets `mapsPerAccount`. */
  google?: Google
  /** Signs cookies and keys account ids. Without one, one is made once and kept in the data folder. */
  sessionSecret?: string
  mapsPerAccount?: number
  /** Tests and the dev preview only: a stand-in Google. Never set from the CLI or the environment. */
  googleEndpoints?: GoogleEndpoints
  googleFetch?: typeof fetch
}

export const RESERVED = new Set(
  [
    'www app api admin mail smtp ftp root status static assets cdn docs help support blog locus dashboard account accounts login signin signup billing about security abuse',
    // Names mail clients, browsers and resolvers look up by themselves.
    'autodiscover autoconfig mta-sts webmail imap pop pop3 mx ns ns1 ns2 localhost wpad postmaster hostmaster webmaster noreply no-reply',
    // Well-known services, so nobody can stand up a page here that passes for theirs.
    'anthropic claude openai chatgpt google gmail apple icloud microsoft outlook paypal stripe github gitlab coinbase binance metamask amazon aws facebook meta instagram whatsapp twitter telegram discord slack notion figma railway vercel cloudflare',
  ]
    .join(' ')
    .split(' '),
)

const NAME = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/

/** Punycode names can spell one thing and show another, so none are given out. */
export function validName(name: string): boolean {
  return NAME.test(name) && !RESERVED.has(name) && !name.startsWith('xn--')
}

/**
 * The key a client's limits are kept under. An IPv6 connection usually holds a whole /64, so it counts as one client;
 * otherwise anyone with one could step through addresses and never reach a limit.
 */
export function addressKey(ip: string): string {
  const v4 = ip.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i)
  if (v4) return v4[1]
  if (!ip.includes(':')) return ip
  const bare = ip.split('%')[0].toLowerCase()
  const halves = bare.split('::')
  if (halves.length > 2) return bare
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const groups = halves.length === 2 ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
}

const HSTS = 'max-age=31536000; includeSubDomains'

const BASE_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
}

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // The Studio can reach this host and Claude, and nothing else. Check it in the page's headers.
  "connect-src 'self' https://api.anthropic.com",
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  // The security policy and the self-hosting guide, readable in a browser as they are.
  '.md': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
}

function res(body: BodyInit | null, status: number, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...BASE_HEADERS, ...headers } })
}

const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  res(JSON.stringify(value), status, { 'Content-Type': 'application/json', ...headers })

const textReply = (body: string, status = 200, headers: Record<string, string> = {}) =>
  res(body, status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...CORS, ...headers })

const NO_STORE = { 'Cache-Control': 'no-store' }

/** A reply that sets cookies. More than one Set-Cookie can't go through a plain record of headers. */
function withCookies(status: number, cookies: string[], headers: Record<string, string>, body: string | null = null): Response {
  const h = new Headers({ ...BASE_HEADERS, ...NO_STORE, ...headers })
  for (const c of cookies) h.append('Set-Cookie', c)
  return new Response(body, { status, headers: h })
}

const redirect = (location: string, cookies: string[] = []) => withCookies(302, cookies, { Location: location })

// A small limiter. Per process, in memory, and it forgets on restart, which is fine for this.
export class Limiter {
  private hits = new Map<string, { n: number; until: number }>()
  private swept = 0
  allow(key: string, max: number, windowMs: number): boolean {
    const now = Date.now()
    // Only what has run out is forgotten, at most once a second. Clearing everything would let anyone with enough addresses reset every limit.
    if (this.hits.size > 50_000 && now - this.swept > 1000) {
      this.swept = now
      for (const [k, h] of this.hits) if (h.until < now) this.hits.delete(k)
    }
    const h = this.hits.get(key)
    if (!h || h.until < now) {
      this.hits.set(key, { n: 1, until: now + windowMs })
      return true
    }
    h.n++
    return h.n <= max
  }
  /** Checks a limit without counting against it. */
  over(key: string, max: number): boolean {
    const h = this.hits.get(key)
    return !!h && h.until >= Date.now() && h.n > max
  }
}

const BAD_PASSWORDS_PER_MINUTE = 30
const AUTH_PATHS = /^\/api\/(me|auth\/.*)$/
// Each remote read decrypts and may search the whole map, so one map can only ask so much.
const SITE_READS_PER_MINUTE = { hosted: 240, self: 1200 }
// Downloads cost bandwidth, the one thing that grows with how often it's asked, so each client has a budget.
const BUNDLES_PER_MINUTE = 60
const FILES_PER_MINUTE = 600
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.json', '.md', '.map', '.txt', '.wasm'])
const MAX_RPC_BATCH = 16

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Leading zero bits of a SHA-256, for the small proof-of-work on claiming a name. */
export async function powOk(name: string, nonce: string, bits: number): Promise<boolean> {
  if (bits <= 0) return true
  const hex = await sha256Hex(`locus claim ${name} ${nonce}`)
  let zero = 0
  for (const ch of hex) {
    const v = parseInt(ch, 16)
    if (v === 0) {
      zero += 4
      continue
    }
    zero += Math.clz32(v) - 28
    break
  }
  return zero >= bits
}

export function createHandler(config: Config) {
  const store = new FileStore(config.dataDir)
  const limiter = new Limiter()
  const auth = config.google
    ? createAuth({ google: config.google, secret: sessionSecret(config.dataDir, config.sessionSecret), endpoints: config.googleEndpoints, fetch: config.googleFetch })
    : null
  // In hosted mode with Google on, a new address needs an account, and an account has a cap. That replaces the proof of work.
  const signinToClaim = config.hosted && !!auth
  const mapsPerAccount = config.mapsPerAccount ?? 3

  function siteFromHost(host: string): string | null {
    const h = host.split(':')[0].toLowerCase()
    if (h === config.domain) return null
    if (!h.endsWith(`.${config.domain}`)) return null
    const label = h.slice(0, -config.domain.length - 1)
    if (label === 'www' || label === 'app' || !NAME.test(label)) return null
    return label
  }

  /**
   * For a reverse proxy that gets certificates as they're needed, such as Caddy's on-demand TLS: yes for this host's own domain and
   * for an address someone has claimed, no for anything else. So a self-hoster gets HTTPS on every address without a wildcard
   * certificate or a DNS plugin, and nobody can make the proxy ask for certificates for names that don't exist. It says nothing an
   * address's own bundle.json doesn't.
   */
  function tlsAsk(url: URL): Response {
    const domain = (url.searchParams.get('domain') ?? '').toLowerCase()
    if (domain === config.domain) return res('ok', 200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
    const site = siteFromHost(domain)
    return site && store.has(site) ? res('ok', 200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }) : res('no', 404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
  }

  function proto(req: Request): string {
    if (config.trustProxy) {
      // The last entry is the one our own proxy wrote. Any before it came from the client.
      const p = req.headers.get('x-forwarded-proto')
      if (p) return p.split(',').at(-1)!.trim()
    }
    return new URL(req.url).protocol.replace(':', '')
  }

  const isLocal = (host: string) => /(^|\.)localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$/.test(host)

  function hostOf(req: Request): string {
    return req.headers.get('host') ?? new URL(req.url).host
  }

  /** Accounts belong to the host itself, never to an address on it. */
  function atRoot(req: Request): boolean {
    const h = hostOf(req).split(':')[0].toLowerCase()
    return h === config.domain || h === 'localhost' || h === '127.0.0.1'
  }

  /** A request from another site can't sign anyone out or spend their account. A missing Origin is a tool such as curl, not a page. */
  function sameOrigin(req: Request): boolean {
    const origin = req.headers.get('origin')
    if (origin === null) return true
    try {
      return new URL(origin).host === hostOf(req)
    } catch {
      return false
    }
  }

  const ownedBy = (uid: string) => store.list().filter((s) => s.meta.owner === uid).map((s) => s.name)

  const gzipped = new Map<string, { mtime: number; body: Uint8Array<ArrayBuffer> }>()

  /** A file from the Studio's build, compressed once and kept, since the build doesn't change while the host runs. */
  function fileReply(file: string, rel: string, req: Request | null): Response {
    const immutable = rel.startsWith('assets/')
    const headers: Record<string, string> = {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      Vary: 'Accept-Encoding',
    }
    const wantsGzip = /\bgzip\b/.test(req?.headers.get('accept-encoding') ?? '')
    if (wantsGzip && COMPRESSIBLE.has(extname(file))) {
      const mtime = statSync(file).mtimeMs
      let hit = gzipped.get(file)
      if (!hit || hit.mtime !== mtime) {
        hit = { mtime, body: new Uint8Array(gzipSync(readFileSync(file))) }
        gzipped.set(file, hit)
      }
      return res(hit.body, 200, { ...headers, 'Content-Encoding': 'gzip' })
    }
    return res(readFileSync(file), 200, headers)
  }

  function serveStatic(pathname: string, req: Request | null = null): Response {
    let rel: string
    try {
      rel = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '')
    } catch {
      return res('Bad path', 400)
    }
    // The page must never be served without its security headers.
    if (rel === 'index.html') return serveIndex(req)
    const file = join(config.studioDir, rel)
    if (rel && !rel.includes('..') && file.startsWith(config.studioDir + sep)) {
      try {
        if (statSync(file).isFile()) return fileReply(file, rel, req)
      } catch {}
    }
    // A file or document that isn't here is missing, not the home page: a link to one should say so, and an image should fail as one.
    if (extname(rel) || rel.startsWith('docs/') || rel.startsWith(`docs${sep}`)) return res('Not found.\n', 404, { 'Content-Type': 'text/plain; charset=utf-8' })
    return serveIndex(req)
  }

  /** The page. A card's image has to be a full address, so the host's own is written in; on an address too, the card is the host's. */
  function serveIndex(req: Request | null = null): Response {
    try {
      let page = readFileSync(join(config.studioDir, 'index.html'), 'utf8')
      if (req && config.domain !== 'localhost') page = page.replace('content="/social.png"', `content="${proto(req)}://${config.domain}/social.png"`)
      return res(page, 200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Content-Security-Policy': CSP,
        'X-Frame-Options': 'DENY',
      })
    } catch {
      return res('The Studio has not been built. Run npm run build.', 500, { 'Content-Type': 'text/plain' })
    }
  }

  function accounts() {
    return config.hosted ? { used: store.count(), max: config.maxAccounts } : null
  }

  async function handleApi(req: Request, url: URL, ip: string): Promise<Response> {
    const parts = url.pathname.split('/').filter(Boolean)

    if (parts[1] === 'info' && req.method === 'GET') {
      const host = hostOf(req)
      const port = host.includes(':') ? `:${host.split(':')[1]}` : ''
      return json({
        version: SERVER_VERSION,
        mode: config.hosted ? 'hosted' : 'self',
        address: `${proto(req)}://{name}.${config.domain}${port}`,
        site: siteFromHost(host),
        accounts: accounts(),
        donateUrl: config.donateUrl,
        abuseContact: config.abuseContact,
        powBits: config.hosted && !signinToClaim ? config.powBits : 0,
        maxBundleBytes: config.maxBundleBytes,
        google: !!auth && atRoot(req),
        signinToClaim,
        mapsPerAccount: signinToClaim ? mapsPerAccount : null,
      })
    }

    if (parts[1] !== 'sites' || !parts[2]) return json({ error: 'not found' }, 404)
    const name = parts[2]

    if (req.method === 'GET') {
      if (!NAME.test(name)) return json({ available: false, reason: 'invalid' })
      const meta = store.meta(name)
      if (meta) return json({ available: false, reason: 'taken', version: meta.version })
      if (RESERVED.has(name)) return json({ available: false, reason: 'reserved' })
      return json({ available: true })
    }

    // A recovery key sent over plain HTTP can be read on the way. Behind a proxy that says the request came in that way, refuse it.
    if ((req.method === 'PUT' || req.method === 'DELETE') && config.trustProxy && proto(req) === 'http' && !isLocal(hostOf(req))) {
      return json({ error: 'Publishing needs HTTPS.' }, 400)
    }

    if (req.method === 'PUT') {
      if (!validName(name)) return json({ error: "That address isn't available. Choose another." }, 400)
      if (!limiter.allow(`put:${ip}`, 30, 60_000)) return json({ error: 'Too many publishes from your connection. Wait a minute.' }, 429)
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: 'Missing publish token.' }, 401)

      const raw = await req.text()
      const size = Buffer.byteLength(raw)
      if (size > config.maxBundleBytes) {
        const mb = Math.round(config.maxBundleBytes / 1_048_576)
        return json({ error: `This map is too big to go live here: its encrypted copy is over the ${mb} MB limit. Take something off the map, or run your own host.`, code: 'too-large' }, 413)
      }
      let bundle: unknown
      try {
        bundle = JSON.parse(raw)
      } catch {
        return json({ error: 'That is not a Locus bundle.' }, 400)
      }
      if (!isBundleShaped(bundle, name)) return json({ error: 'That is not a Locus bundle.' }, 400)

      // Finish everything that can wait first. From reading the account to writing it
      // there's no await, so two claims of one name can't both win.
      const tokenHash = await sha256Hex(token)
      const claimNonce = req.headers.get('x-locus-pow') ?? ''
      const powPassed = config.hosted && !signinToClaim && !store.has(name) ? await powOk(name, claimNonce, config.powBits) : true
      // Who's claiming, if anyone is signed in. Only a new name asks; an update is the publish token's alone.
      const session = auth && !store.has(name) && sameOrigin(req) ? await auth.session(req.headers.get('cookie')) : null
      const meta = store.meta(name)
      const now = new Date().toISOString()

      if (meta) {
        if (!timingSafeEqual(meta.tokenHash, tokenHash)) {
          return json({ error: "That address is taken, and this recovery key doesn't match it. Choose another address.", code: 'taken' }, 403)
        }
        if (bundle.version <= meta.version) {
          return json({ error: `A newer version (${meta.version}) is already live.`, code: 'stale', version: meta.version }, 409)
        }
        store.save(name, raw, { ...meta, updatedAt: now, version: bundle.version, bytes: size })
        return json({ ok: true, version: bundle.version })
      }

      // A name is claimed by its first successful publish, so there are no empty reservations.
      if (signinToClaim && !session) {
        return json({ error: 'Sign in with Google to take a new address on this host.', code: 'signin' }, 401)
      }
      if (config.hosted) {
        if (!limiter.allow(`claim:${ip}`, 6, 3_600_000)) {
          return json({ error: 'Too many new accounts from your connection. Try again in an hour.' }, 429)
        }
        if (!powPassed) return json({ error: 'Proof of work failed.', code: 'pow' }, 400)
        if (signinToClaim) {
          const owned = ownedBy(session!.uid).length
          if (owned >= mapsPerAccount) {
            return json({ error: `This Google account already has ${owned === 1 ? 'an address' : `${owned} addresses`} here, which is as many as one account can have.`, code: 'account-full', maps: owned, max: mapsPerAccount }, 403)
          }
        }
        if (store.count() >= config.maxAccounts) {
          return json({ error: 'Every free account is taken.', code: 'full', accounts: accounts() }, 403)
        }
        // However many connections a script spreads itself over, the whole host only gives out so many addresses an hour.
        if (!limiter.allow('claim:host', config.claimsPerHour ?? 30, 3_600_000)) {
          return json({ error: 'Many new addresses have been taken in the last hour. Try again later.', code: 'busy' }, 429)
        }
      }
      store.save(name, raw, { tokenHash, createdAt: now, updatedAt: now, version: bundle.version, bytes: size, ...(session ? { owner: session.uid } : {}) })
      return json({ ok: true, version: bundle.version, claimed: true }, 201)
    }

    if (req.method === 'DELETE') {
      if (!NAME.test(name)) return json({ error: 'No such account.' }, 404)
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      const meta = store.meta(name)
      if (!meta) return json({ error: 'No such account.' }, 404)
      if (!timingSafeEqual(meta.tokenHash, await sha256Hex(token))) return json({ error: "That recovery key doesn't match." }, 403)
      store.remove(name)
      return json({ ok: true })
    }

    return json({ error: 'not found' }, 404)
  }

  // Signing in with Google. Only at the host's own domain, never at an address on it.
  async function handleAuth(req: Request, url: URL, ip: string): Promise<Response> {
    const secure = proto(req) === 'https'
    const path = url.pathname

    if (path === '/api/me' && req.method === 'GET') {
      if (!limiter.allow(`me:${ip}`, 60, 60_000)) return json({ error: 'Too many requests. Slow down.' }, 429, NO_STORE)
      const session = auth ? await auth.session(req.headers.get('cookie')) : null
      if (!session) return json({ signedIn: false }, 200, NO_STORE)
      return json({ signedIn: true, name: session.name, email: session.email, maps: ownedBy(session.uid).sort() }, 200, NO_STORE)
    }

    if (path === '/api/auth/signout' && req.method === 'POST') {
      // A header a form can't send, so another site can't sign anyone out.
      if (req.headers.get('x-locus') !== '1' || !sameOrigin(req)) return json({ error: 'Refused.' }, 403, NO_STORE)
      return withCookies(200, [clearSessionCookie(secure)], { 'Content-Type': 'application/json' }, JSON.stringify({ ok: true }))
    }

    if (!auth || req.method !== 'GET') return json({ error: 'not found' }, 404)
    const failed = (why: string, cookies: string[] = []) => redirect(`/?signin=failed&why=${why}`, cookies)
    // Google sends the browser back here, and Google is told this same address, so both ends derive it the same way.
    const redirectUri = `${proto(req)}://${hostOf(req)}/api/auth/google/callback`

    if (path === '/api/auth/google/start') {
      if (!limiter.allow(`auth:${ip}`, 20, 60_000)) return failed('busy')
      const { location, cookie } = await auth.start(redirectUri, url.searchParams.get('next'), secure)
      return redirect(location, [cookie])
    }

    if (path === '/api/auth/google/callback') {
      if (!limiter.allow(`auth:${ip}`, 20, 60_000)) return failed('busy')
      const done = await auth.finish(url, req.headers.get('cookie'), redirectUri, secure)
      return 'failed' in done ? failed(done.failed, done.cookies) : redirect(done.next, done.cookies)
    }

    return json({ error: 'not found' }, 404)
  }

  // Remote reads: the only place the host handles a password.
  async function openFor(name: string, key: string, ip: string): Promise<{ view?: View; fail?: Response }> {
    if (limiter.over(`bad:${ip}`, BAD_PASSWORDS_PER_MINUTE)) {
      return { fail: textReply('Too many wrong passwords. Wait a minute.\n', 429) }
    }
    const raw = store.bundle(name)!
    const bundle = JSON.parse(raw) as Bundle
    const id = await passwordId(key)
    const entry = bundle.passwords[id]
    if (entry && !entry.remote) {
      return {
        fail: textReply(
          `This password is set to local use only, so this host will not decrypt with it.\nDecrypt on your own machine instead: LOCUS_KEY=<password> npx -y ${PACKAGE} mcp <address>\n`,
          403,
        ),
      }
    }
    try {
      return { view: await openBundle(bundle, key) }
    } catch (e) {
      if (e instanceof WrongPassword) {
        limiter.allow(`bad:${ip}`, BAD_PASSWORDS_PER_MINUTE, 60_000)
        return { fail: textReply('That password does not open this map.\n', 401, { 'WWW-Authenticate': 'Bearer' }) }
      }
      if (e instanceof AlteredBundle) return { fail: textReply(`${e.message}\n`, 502) }
      throw e
    }
  }

  async function handleSite(req: Request, url: URL, name: string, prefix: string, ip: string): Promise<Response> {
    if (req.method === 'OPTIONS') return res(null, 204, CORS)

    let path = url.pathname.slice(prefix.length) || '/'

    // Key in the URL, for agents that can't set a header.
    let key = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    let base = `${proto(req)}://${hostOf(req)}${prefix}`
    const k = path.match(/^\/k\/([^/]+)(\/.*)?$/)
    if (k) {
      // A key never needs escaping, so anything escaped isn't one.
      key = k[1]
      path = k[2] || '/llms.txt'
      base = `${base}/k/${k[1]}`
    }

    const AGENT_PATHS = /^\/(llms\.txt|llms-full\.txt|mcp|v1\/.*)$/
    const isAgentPath = AGENT_PATHS.test(path)

    // Signing in belongs to the host, not to an address on it.
    if (AUTH_PATHS.test(path)) return json({ error: 'not found' }, 404)

    if (!isAgentPath && path !== '/' && path !== '/bundle.json') {
      if (path.startsWith('/assets/') || extname(path)) {
        if (!limiter.allow(`files:${ip}`, FILES_PER_MINUTE, 60_000)) return res('Too many requests. Slow down.\n', 429, { 'Content-Type': 'text/plain; charset=utf-8' })
        return serveStatic(path, req)
      }
    }

    const exists = store.has(name)

    if (path === '/bundle.json') {
      const meta = store.meta(name)
      if (!meta) return json({ error: 'No map here.' }, 404, CORS)
      if (!limiter.allow(`bundle:${ip}`, BUNDLES_PER_MINUTE, 60_000)) return json({ error: 'Too many requests. Slow down.' }, 429, CORS)
      // A reader that already has this version is told so in a few bytes, rather than sent the whole map again.
      const etag = `"${meta.version}-${meta.bytes}"`
      const cache = { 'Cache-Control': 'no-cache', ETag: etag, ...CORS }
      if (req.headers.get('if-none-match') === etag) return res(null, 304, cache)
      return res(store.bundle(name), 200, { 'Content-Type': 'application/json', ...cache })
    }

    if (path === '/' && !k) {
      const wantsHtml = (req.headers.get('accept') ?? '').includes('text/html')
      if (wantsHtml) return serveIndex(req)
      if (!exists) return textReply(`Nothing has been published at ${name}.\n`, 404)
      return textReply(lockedText(name, `${proto(req)}://${hostOf(req)}${prefix}`))
    }

    if (!isAgentPath) return serveIndex(req)
    if (!exists) return textReply(`Nothing has been published at ${name}.\n`, 404)

    if (!limiter.allow(`agent:${ip}`, 240, 60_000)) return textReply('Too many requests. Slow down.\n', 429)

    if (path === '/mcp' && req.method === 'GET') {
      return textReply('This MCP server speaks JSON over POST.\n', 405, { Allow: 'POST' })
    }

    if (!key || !looksLikeKey(key)) {
      return textReply(lockedText(name, `${proto(req)}://${hostOf(req)}${prefix}`), 401, { 'WWW-Authenticate': 'Bearer' })
    }

    // Refuse to accept a password over plain HTTP from the open internet.
    if (proto(req) === 'http' && !isLocal(hostOf(req))) {
      return textReply(`Refusing a password over plain HTTP. Use HTTPS, or decrypt locally: LOCUS_KEY=<password> npx -y ${PACKAGE} mcp <address>\n`, 400)
    }

    const { view, fail } = await openFor(name, key, ip)
    if (!view) return fail!
    // Counted only once a password has opened the map, so nobody without one can use up its readers' budget.
    if (!limiter.allow(`site:${name}`, config.hosted ? SITE_READS_PER_MINUTE.hosted : SITE_READS_PER_MINUTE.self, 60_000)) return textReply('This map is being read too often. Slow down.\n', 429)

    if (path === '/mcp') {
      if (req.method !== 'POST') return textReply('Use POST.\n', 405)
      let body: any
      try {
        body = await req.json()
      } catch {
        return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400, CORS)
      }
      const noStore = { 'Cache-Control': 'no-store', ...CORS }
      if (Array.isArray(body)) {
        if (body.length > MAX_RPC_BATCH) return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batch too large' } }, 400, CORS)
        // Each call in a batch does the work of a request, so each counts as one.
        for (let i = 1; i < body.length; i++) {
          if (!limiter.allow(`agent:${ip}`, 240, 60_000)) return textReply('Too many requests. Slow down.\n', 429)
        }
        const out = body.map((m) => handleRpc(view, m)).filter(Boolean)
        return out.length ? json(out, 200, noStore) : res(null, 202, noStore)
      }
      const reply = handleRpc(view, body)
      return reply ? json(reply, 200, noStore) : res(null, 202, noStore)
    }

    if (path === '/llms.txt') return textReply(llmsTxt(view, { kind: 'http', base }))
    if (path === '/llms-full.txt') return textReply(llmsFull(view))
    if (path === '/v1/search') {
      const q = url.searchParams.get('q') ?? ''
      if (!q.trim()) return textReply('Add ?q=your+words\n', 400)
      return textReply(searchText(view, q))
    }
    if (path === '/v1/costs') {
      const t = costsText(view)
      return t ? textReply(t) : textReply('Costs are closed to this password.\n', 403)
    }
    const piece = path.match(/^\/v1\/pieces\/([^/]+)$/)
    if (piece) {
      const t = pieceText(view, safeDecode(piece[1]))
      return t ? textReply(t) : textReply('No such piece is readable with this password.\n', 404)
    }
    return textReply('Not found. Start at /llms.txt\n', 404)
  }

  return async function handler(req: Request, ip = 'unknown'): Promise<Response> {
    const response = await route(req, addressKey(ip))
    // Every address is a subdomain of the host, so one header holds them all to HTTPS.
    if (proto(req) === 'https' && !isLocal(hostOf(req))) response.headers.set('Strict-Transport-Security', HSTS)
    return response
  }

  async function route(req: Request, ip: string): Promise<Response> {
    const url = new URL(req.url)
    const site = siteFromHost(hostOf(req))
    // The page needs this on every address, to know what it's looking at.
    if (url.pathname === '/api/info') return handleApi(req, url, ip)
    if (url.pathname === '/api/tls/ask') return tlsAsk(url)
    if (AUTH_PATHS.test(url.pathname)) return site || !atRoot(req) ? json({ error: 'not found' }, 404) : handleAuth(req, url, ip)
    if (site) return handleSite(req, url, site, '', ip)

    // www., app. and anything deeper under the host's own domain are the Studio at another origin, with its own storage. Send them home.
    const host = hostOf(req).split(':')[0].toLowerCase()
    if (config.domain !== 'localhost' && host.endsWith(`.${config.domain}`) && (req.method === 'GET' || req.method === 'HEAD')) {
      return res(null, 308, { Location: `${proto(req)}://${config.domain}${url.pathname}${url.search}` })
    }

    const pathMatch = url.pathname.match(/^\/s\/([a-z0-9-]+)(\/.*)?$/)
    if (pathMatch && NAME.test(pathMatch[1])) return handleSite(req, url, pathMatch[1], `/s/${pathMatch[1]}`, ip)

    if (url.pathname.startsWith('/api/')) return handleApi(req, url, ip)
    if (req.method !== 'GET' && req.method !== 'HEAD') return res('Method not allowed', 405)
    if (url.pathname === '/') return serveIndex(req)
    if (extname(url.pathname) && !limiter.allow(`files:${ip}`, FILES_PER_MINUTE, 60_000)) return res('Too many requests. Slow down.\n', 429, { 'Content-Type': 'text/plain; charset=utf-8' })
    return serveStatic(url.pathname, req)
  }
}

export type Handler = ReturnType<typeof createHandler>
export { FileStore }
