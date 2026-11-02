// The host. It claims names, stores sealed bundles and serves addresses.
//
// It has no dependencies and no logs of requests. A plain fetch-style handler,
// so it can move to another runtime later without a rewrite.
//
// Two paths touch plaintext, and only while answering a request: a Bearer header
// and a /k/ URL. Everything else handles ciphertext only.

import { readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { costsText, llmsFull, llmsTxt, lockedText, pieceText, searchText } from '../core/agent.ts'
import { handleRpc, SERVER_VERSION } from '../core/mcp.ts'
import { isBundleShaped, looksLikeKey, openBundle, passwordId, sha256Hex, WrongPassword } from '../core/seal.ts'
import type { Bundle, View } from '../core/types.ts'
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
}

export const RESERVED = new Set(
  'www app api admin mail smtp ftp root status static assets cdn docs help support blog vadere dashboard account accounts login signin signup billing about security abuse'.split(' '),
)

const NAME = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/

export function validName(name: string): boolean {
  return NAME.test(name) && !RESERVED.has(name)
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
}

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

// A small limiter. Per process, in memory, and it forgets on restart, which is fine for this.
class Limiter {
  private hits = new Map<string, { n: number; until: number }>()
  allow(key: string, max: number, windowMs: number): boolean {
    const now = Date.now()
    if (this.hits.size > 50_000) this.hits.clear()
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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Leading zero bits of a SHA-256, for the small proof-of-work on claiming a name. */
export async function powOk(name: string, nonce: string, bits: number): Promise<boolean> {
  if (bits <= 0) return true
  const hex = await sha256Hex(`vadere claim ${name} ${nonce}`)
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

  function siteFromHost(host: string): string | null {
    const h = host.split(':')[0].toLowerCase()
    if (h === config.domain) return null
    if (!h.endsWith(`.${config.domain}`)) return null
    const label = h.slice(0, -config.domain.length - 1)
    if (label.includes('.') || label === 'www' || label === 'app') return null
    return label
  }

  function proto(req: Request): string {
    if (config.trustProxy) {
      const p = req.headers.get('x-forwarded-proto')
      if (p) return p.split(',')[0].trim()
    }
    return new URL(req.url).protocol.replace(':', '')
  }

  const isLocal = (host: string) => /(^|\.)localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$/.test(host)

  function hostOf(req: Request): string {
    return req.headers.get('host') ?? new URL(req.url).host
  }

  function serveStatic(pathname: string): Response {
    let rel: string
    try {
      rel = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '')
    } catch {
      return res('Bad path', 400)
    }
    const file = join(config.studioDir, rel)
    if (rel && !rel.includes('..') && file.startsWith(config.studioDir + sep)) {
      try {
        if (statSync(file).isFile()) {
          const immutable = rel.startsWith('assets/')
          return res(readFileSync(file), 200, {
            'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
            'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
          })
        }
      } catch {}
    }
    return serveIndex()
  }

  function serveIndex(): Response {
    try {
      return res(readFileSync(join(config.studioDir, 'index.html')), 200, {
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
        powBits: config.hosted ? config.powBits : 0,
        maxBundleBytes: config.maxBundleBytes,
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

    if (req.method === 'PUT') {
      if (!validName(name)) return json({ error: 'That name is not available.' }, 400)
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: 'Missing publish token.' }, 401)

      const raw = await req.text()
      if (raw.length > config.maxBundleBytes) {
        const mb = Math.round(config.maxBundleBytes / 1_048_576)
        return json({ error: `This map is over the ${mb} MB limit.`, code: 'too-large' }, 413)
      }
      let bundle: unknown
      try {
        bundle = JSON.parse(raw)
      } catch {
        return json({ error: 'That is not a Vadere bundle.' }, 400)
      }
      if (!isBundleShaped(bundle, name)) return json({ error: 'That is not a Vadere bundle.' }, 400)

      const tokenHash = await sha256Hex(token)
      const meta = store.meta(name)
      const now = new Date().toISOString()

      if (meta) {
        if (!timingSafeEqual(meta.tokenHash, tokenHash)) {
          return json({ error: 'That name is taken, and this owner key does not match it.', code: 'taken' }, 403)
        }
        if (bundle.version <= meta.version) {
          return json({ error: `A newer version (${meta.version}) is already live.`, code: 'stale', version: meta.version }, 409)
        }
        store.save(name, raw, { ...meta, updatedAt: now, version: bundle.version, bytes: raw.length })
        return json({ ok: true, version: bundle.version })
      }

      // A name is claimed by its first successful publish, so there are no empty reservations.
      if (config.hosted) {
        if (!limiter.allow(`claim:${ip}`, 6, 3_600_000)) {
          return json({ error: 'Too many new accounts from this address. Try again in an hour.' }, 429)
        }
        const nonce = req.headers.get('x-vadere-pow') ?? ''
        if (!(await powOk(name, nonce, config.powBits))) return json({ error: 'Proof of work failed.', code: 'pow' }, 400)
        if (store.count() >= config.maxAccounts) {
          return json({ error: 'Every free account is taken.', code: 'full', accounts: accounts() }, 403)
        }
      }
      store.save(name, raw, { tokenHash, createdAt: now, updatedAt: now, version: bundle.version, bytes: raw.length })
      return json({ ok: true, version: bundle.version, claimed: true }, 201)
    }

    if (req.method === 'DELETE') {
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      const meta = store.meta(name)
      if (!meta) return json({ error: 'No such account.' }, 404)
      if (!timingSafeEqual(meta.tokenHash, await sha256Hex(token))) return json({ error: 'That owner key does not match.' }, 403)
      store.remove(name)
      return json({ ok: true })
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
          'This password is set to local use only, so this host will not decrypt with it.\nDecrypt on your own machine instead: npx vadere mcp <address>\n',
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
      key = decodeURIComponent(k[1])
      path = k[2] || '/llms.txt'
      base = `${base}/k/${k[1]}`
    }

    const AGENT_PATHS = /^\/(llms\.txt|llms-full\.txt|mcp|v1\/.*)$/
    const isAgentPath = AGENT_PATHS.test(path)

    if (!isAgentPath && path !== '/' && path !== '/bundle.json') {
      if (path.startsWith('/assets/') || extname(path)) return serveStatic(path)
    }

    const exists = store.has(name)

    if (path === '/bundle.json') {
      if (!exists) return json({ error: 'No map here.' }, 404, CORS)
      return res(store.bundle(name), 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', ...CORS })
    }

    if (path === '/' && !k) {
      const wantsHtml = (req.headers.get('accept') ?? '').includes('text/html')
      if (wantsHtml) return serveIndex()
      if (!exists) return textReply(`Nothing has been published at ${name}.\n`, 404)
      return textReply(lockedText(name, `${proto(req)}://${hostOf(req)}${prefix}`))
    }

    if (!isAgentPath) return serveIndex()
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
      return textReply('Refusing a password over plain HTTP. Use HTTPS, or decrypt locally: npx vadere mcp <address>\n', 400)
    }

    const { view, fail } = await openFor(name, key, ip)
    if (!view) return fail!

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
      const t = pieceText(view, decodeURIComponent(piece[1]))
      return t ? textReply(t) : textReply('No such piece is readable with this password.\n', 404)
    }
    return textReply('Not found. Start at /llms.txt\n', 404)
  }

  return async function handler(req: Request, ip = 'unknown'): Promise<Response> {
    const url = new URL(req.url)
    const site = siteFromHost(hostOf(req))
    // The page needs this on every address, to know what it's looking at.
    if (url.pathname === '/api/info') return handleApi(req, url, ip)
    if (site) return handleSite(req, url, site, '', ip)

    const pathMatch = url.pathname.match(/^\/s\/([a-z0-9-]+)(\/.*)?$/)
    if (pathMatch) return handleSite(req, url, pathMatch[1], `/s/${pathMatch[1]}`, ip)

    if (url.pathname.startsWith('/api/')) return handleApi(req, url, ip)
    if (req.method !== 'GET' && req.method !== 'HEAD') return res('Method not allowed', 405)
    return url.pathname === '/' ? serveIndex() : serveStatic(url.pathname)
  }
}

export type Handler = ReturnType<typeof createHandler>
export { FileStore }
