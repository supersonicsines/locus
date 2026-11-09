#!/usr/bin/env node
// locus: run a host, or read a map from your own machine.

import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { exportFiles } from '../core/agent.ts'
import { handleRpc, SERVER_VERSION } from '../core/mcp.ts'
import { openBundle, looksLikeKey } from '../core/seal.ts'
import type { Bundle, View } from '../core/types.ts'
import { createHandler, FileStore, type Config } from '../server/app.ts'
import { listen } from '../server/node.ts'

const HELP = `locus ${SERVER_VERSION}

A map of your company that any agent can read.

  locus serve               Run the Studio and host. Open http://localhost:4747
    --port 4747             Or LOCUS_PORT, or the PORT a host such as Railway sets
    --domain localhost      Your wildcard domain, for yourco.domain addresses
    --data ~/.locus         Where sealed maps are stored
    --hosted                Free-with-a-cap mode (see --max-accounts)
    --max-accounts 500
    --donate-url <url>
    --abuse-contact <addr>
    --trust-proxy           Read X-Forwarded-* from your reverse proxy
    --proxy-hops 1          How many proxies you run in front (2 for Cloudflare and Caddy)
    --google-client-id <id> Sign in with Google: both, or neither. See docs/SECURITY.md
    --google-client-secret  Better set as LOCUS_GOOGLE_CLIENT_SECRET, out of the process list
    --maps-per-account 3    With Google in hosted mode, the addresses each account can take

  locus mcp <address>       MCP server on stdio. Decrypts here; the host never sees the password
  locus pull <address>      Write the map to a folder as Markdown
    --out ./company
  locus verify <address>    Show what the host really holds, and test it

  locus admin list          Accounts on this host
  locus admin remove <name>

Passwords come from --key or the LOCUS_KEY environment variable.
Every flag of serve can also be set as LOCUS_<FLAG>, such as LOCUS_DOMAIN or LOCUS_TRUST_PROXY=1.
LOCUS_SESSION_SECRET signs sign-in cookies. Without it, one is made once and kept in the data folder.
`

interface Args {
  _: string[]
  [flag: string]: any
}

function parseArgs(argv: string[]): Args {
  const out: Args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const name = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) out[name] = true
      else out[name] = argv[++i]
    } else out._.push(a)
  }
  return out
}

function die(message: string): never {
  console.error(message)
  process.exit(1)
}

// A switch set in the environment, as a host such as Railway sets it. "false", "0", "no" and "off" mean off, which Boolean() alone would read as on.
// Anything else that's set means on: a typo in LOCUS_HOSTED must leave the limits on, not quietly take them off.
const on = (v: unknown) => (typeof v === 'string' ? v.trim() !== '' && !/^(0|false|no|off)$/i.test(v.trim()) : Boolean(v))

// A number set in a flag or the environment. A typo or an empty value must never turn a limit off, so it stops the host with the reason.
function num(name: string, v: unknown, fallback: number, least = 0): number {
  if (v === undefined || v === true) return fallback
  const n = Number(String(v).trim())
  if (String(v).trim() === '' || !Number.isFinite(n) || n < least) die(`${name} must be a number of at least ${least}, not "${v}".`)
  return n
}

// A value set in a flag or the environment. A flag with nothing after it is a mistake, not "on".
function text(name: string, v: unknown): string | undefined {
  if (v === undefined) return undefined
  if (v === true) die(`${name} needs a value.`)
  return String(v).trim() || undefined
}

const dataDir = (args: Args) => resolve(args.data ?? process.env.LOCUS_DATA ?? join(homedir(), '.locus'))

function needKey(args: Args): string {
  const key = args.key ?? process.env.LOCUS_KEY
  if (!key) die('This needs a password. Use --key or set LOCUS_KEY.')
  if (!looksLikeKey(key)) die('That does not look like a Locus password. They start with lcr_.')
  return key
}

function address(args: Args): string {
  const a = args._[1]
  if (!a) die('This needs an address, for example https://yourco.example.com')
  return a.replace(/\/+$/, '')
}

async function fetchBundle(addr: string): Promise<Bundle> {
  const r = await fetch(`${addr}/bundle.json`)
  if (r.status === 404) die(`Nothing has been published at ${addr}.`)
  if (!r.ok) die(`Could not read ${addr}: HTTP ${r.status}`)
  return (await r.json()) as Bundle
}

/** Sign in with Google needs both halves of the client. Half of one stops the host with the reason, rather than quietly running without it. */
function googleClient(args: Args): Config['google'] {
  const clientId = text('--google-client-id or LOCUS_GOOGLE_CLIENT_ID', args['google-client-id'] ?? process.env.LOCUS_GOOGLE_CLIENT_ID)
  const clientSecret = text('--google-client-secret or LOCUS_GOOGLE_CLIENT_SECRET', args['google-client-secret'] ?? process.env.LOCUS_GOOGLE_CLIENT_SECRET)
  if (!clientId && !clientSecret) return undefined
  if (!clientId || !clientSecret) die(`Sign in with Google needs both a client ID and a client secret, and only the ${clientId ? 'ID' : 'secret'} is set. Set LOCUS_GOOGLE_CLIENT_ID and LOCUS_GOOGLE_CLIENT_SECRET, or neither.`)
  return { clientId, clientSecret }
}

function sessionSecretFromEnv(): string | undefined {
  const v = process.env.LOCUS_SESSION_SECRET
  if (v === undefined) return undefined
  if (v.trim().length < 32) die('LOCUS_SESSION_SECRET must be at least 32 characters. Leave it unset and the host makes one and keeps it in the data folder.')
  return v.trim()
}

async function serve(args: Args) {
  const hosted = on(args.hosted ?? process.env.LOCUS_HOSTED)
  const here = dirname(fileURLToPath(import.meta.url))
  const google = googleClient(args)
  const domain = (args.domain ?? process.env.LOCUS_DOMAIN ?? 'localhost').trim()
  // A scheme, a path or capitals would quietly send every address to the Studio.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(domain)) {
    die(`LOCUS_DOMAIN must be a bare domain in lower case, such as example.com, not "${domain}".`)
  }
  const config: Config = {
    domain,
    dataDir: dataDir(args),
    studioDir: args.studio ?? join(here, 'studio'),
    hosted,
    maxAccounts: num('--max-accounts or LOCUS_MAX_ACCOUNTS', args['max-accounts'] ?? process.env.LOCUS_MAX_ACCOUNTS, 500),
    maxBundleBytes: (hosted ? 10 : 200) * 1_048_576,
    powBits: num('LOCUS_POW_BITS', process.env.LOCUS_POW_BITS, 16),
    donateUrl: args['donate-url'] ?? process.env.LOCUS_DONATE_URL ?? '',
    abuseContact: args['abuse-contact'] ?? process.env.LOCUS_ABUSE_CONTACT ?? '',
    trustProxy: on(args['trust-proxy'] ?? process.env.LOCUS_TRUST_PROXY),
    proxyHops: num('--proxy-hops or LOCUS_PROXY_HOPS', args['proxy-hops'] ?? process.env.LOCUS_PROXY_HOPS, 1, 1),
    claimsPerHour: num('LOCUS_CLAIMS_PER_HOUR', process.env.LOCUS_CLAIMS_PER_HOUR, 30, 1),
    google,
    sessionSecret: google ? sessionSecretFromEnv() : undefined,
    mapsPerAccount: num('--maps-per-account or LOCUS_MAPS_PER_ACCOUNT', args['maps-per-account'] ?? process.env.LOCUS_MAPS_PER_ACCOUNT, 3, 1),
  }
  const port = num('--port, LOCUS_PORT or PORT', args.port ?? process.env.LOCUS_PORT ?? process.env.PORT, 4747, 1)
  mkdirSync(config.dataDir, { recursive: true })
  const server = await listen(createHandler(config), port, config.maxBundleBytes, config.trustProxy ? config.proxyHops ?? 1 : 0)
  // A platform stops the host with SIGTERM on every deploy. Stop taking requests, let those in flight finish, then go.
  const stop = () => {
    server.close(() => process.exit(0))
    server.closeIdleConnections()
    setTimeout(() => process.exit(0), 5_000).unref()
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  console.log(`Locus is running at http://${config.domain === 'localhost' ? 'localhost' : config.domain}:${port}`)
  console.log(`Sealed maps are stored in ${config.dataDir}`)
  if (hosted) console.log(`Hosted mode: up to ${config.maxAccounts} free accounts.`)
  if (google) console.log(hosted ? `Sign in with Google is on. A new address needs it, and each Google account can take ${config.mapsPerAccount}.` : 'Sign in with Google is on.')
  if (config.domain !== 'localhost' && !config.trustProxy) {
    console.log('Put this behind HTTPS and pass --trust-proxy. Passwords sent over plain HTTP are refused.')
  }
}

async function mcp(args: Args) {
  const addr = address(args)
  const key = needKey(args)
  let view: View | null = null
  let fetchedAt = 0
  let etag = ''

  async function current(): Promise<View> {
    // Picks up new publishes without restarting the client. If the host is away for a moment, as it is during a redeploy, the last good copy carries on and it tries again on the next request.
    if (view && Date.now() - fetchedAt > 60_000) {
      try {
        // Unchanged since the last look, the host says so in a few bytes rather than sending the whole map again.
        const r = await fetch(`${addr}/bundle.json`, { headers: etag ? { 'If-None-Match': etag } : {} })
        if (r.status === 304) fetchedAt = Date.now()
        else if (r.ok) {
          view = await openBundle((await r.json()) as Bundle, key)
          fetchedAt = Date.now()
          etag = r.headers.get('etag') ?? ''
        }
      } catch {
        // Still the last good copy. A bundle that fails its checks is refused here too, and the last good one stands.
      }
    }
    return view!
  }

  try {
    view = await openBundle(await fetchBundle(addr), key)
    fetchedAt = Date.now()
  } catch (e) {
    die(e instanceof Error ? e.message : String(e))
  }
  console.error(`Locus: reading ${view!.company.name} as "${view!.passwordName}". Decrypting on this machine.`)

  const rl = createInterface({ input: process.stdin })
  rl.on('line', async (line) => {
    if (!line.trim()) return
    let request: { id?: unknown }
    try {
      request = JSON.parse(line)
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n')
      return
    }
    try {
      const reply = handleRpc(await current(), request as Parameters<typeof handleRpc>[1])
      if (reply) process.stdout.write(JSON.stringify(reply) + '\n')
    } catch (e) {
      // Answered with the request's own id, so the client knows which call failed and the session carries on.
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32603, message: e instanceof Error ? e.message : 'Internal error' } }) + '\n')
    }
  })
  rl.on('close', () => process.exit(0))
}

async function pull(args: Args) {
  const addr = address(args)
  const key = needKey(args)
  const out = resolve(args.out ?? 'company')
  const view = await openBundle(await fetchBundle(addr), key).catch((e) => die(e.message))
  const files = exportFiles(view)
  for (const f of files) {
    const path = resolve(out, f.path)
    // Names in a map come from whoever published it, so they get no say in where files land.
    if (!path.startsWith(out + sep)) die(`Refusing to write outside ${out}: ${f.path}`)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, f.text)
  }
  console.log(`Wrote ${files.length} files to ${out}. Point your agent at COMPANY_MAP.md first.`)
}

function entropy(b64: string): number {
  const bytes = Buffer.from(b64, 'base64')
  const counts = new Array(256).fill(0)
  for (const v of bytes) counts[v]++
  let h = 0
  for (const c of counts) {
    if (!c) continue
    const p = c / bytes.length
    h -= p * Math.log2(p)
  }
  return h
}

async function verify(args: Args) {
  const addr = address(args)
  const bundle = await fetchBundle(addr)
  const raw = JSON.stringify(bundle)
  const parts = [bundle.head, bundle.owner, ...Object.values(bundle.gates), ...Object.values(bundle.bridges), ...Object.values(bundle.passwords).map((p) => p.sealed)]
  const largest = parts.reduce((a, b) => (b.ct.length > a.ct.length ? b : a), parts[0])
  const e = entropy(largest.ct)

  console.log(`What ${addr} holds, as anyone can download it:\n`)
  console.log(`  Name:         ${bundle.site}`)
  console.log(`  Version:      ${bundle.version}, sealed ${bundle.sealedAt}`)
  console.log(`  Size:         ${(raw.length / 1024).toFixed(1)} KB`)
  console.log(`  Gates:        ${Object.keys(bundle.gates).length}, names sealed`)
  console.log(`  Links across: ${Object.keys(bundle.bridges).length} sealed groups`)
  console.log(`  Passwords:    ${Object.keys(bundle.passwords).length}, names sealed`)
  console.log(`  Randomness:   ${e.toFixed(3)} bits per byte in the largest part (ciphertext is close to 8)`)

  const flatText = parts.map((p) => Buffer.from(p.ct, 'base64').toString('latin1')).join('')
  const leaks = ['"title"', '"pieces"', '"gate"', '"summary"', '"amount"'].filter((w) => flatText.includes(w))
  console.log(`  Plaintext:    ${leaks.length ? `FOUND ${leaks.join(', ')}` : 'none of the data format appears in the ciphertext'}`)
  if (leaks.length || e < 7.5) process.exitCode = 1

  if (!args.key && !process.env.LOCUS_KEY) {
    console.log('\nThat is everything the host stores. Add --key to test a password too.')
    return
  }

  const key = needKey(args)
  const view = await openBundle(bundle, key).catch((err) => die(`\n${err.message}`))
  console.log(`\nWith password "${view.passwordName}", on this machine:\n`)
  console.log(`  Opens:        ${view.gates.map((g) => g.name).join(', ') || 'nothing'}`)
  console.log(`  Closed:       ${view.closedGates} gates, which this password has no key for`)
  console.log(`  Reads:        ${view.pieces.length} pieces, ${view.links.length} links`)
  console.log(`  Prices:       ${view.costs ? `${view.costs.length} services` : 'sealed'}`)

  // Flip one byte in the map's header, which every password reads and every password's envelope vouches for, and make sure it's refused.
  {
    const tampered = structuredClone(bundle)
    const ct = Buffer.from(tampered.head.ct, 'base64')
    ct[Math.floor(ct.length / 2)] ^= 1
    tampered.head.ct = ct.toString('base64')
    let refused = false
    try {
      await openBundle(tampered, key)
    } catch {
      refused = true
    }
    console.log(refused ? '  Tampering:    a changed byte was refused, as it should be' : '  Tampering:    A CHANGED BYTE WAS ACCEPTED. Do not trust this host or this copy of Locus.')
    if (!refused) process.exitCode = 1
  }
}

function admin(args: Args) {
  const store = new FileStore(dataDir(args))
  const sub = args._[1]
  if (sub === 'list') {
    const all = store.list()
    if (!all.length) return console.log('No accounts.')
    for (const { name, meta } of all) {
      // Whether a Google account claimed it, and nothing about which one.
      console.log(`${name}  version ${meta.version}  ${(meta.bytes / 1024).toFixed(0)} KB  updated ${meta.updatedAt}${meta.owner ? '  claimed with Google' : ''}`)
    }
    return
  }
  if (sub === 'remove') {
    const name = args._[2]
    if (!name) die('Which name?')
    console.log(store.remove(name) ? `Removed ${name}.` : `No account named ${name}.`)
    return
  }
  die('Use: locus admin list | locus admin remove <name>')
}

const args = parseArgs(process.argv.slice(2))
const command = args._[0] ?? 'serve'

if (args.help || args.h || command === 'help') {
  console.log(HELP)
} else if (args.version) {
  console.log(SERVER_VERSION)
} else {
  const run: Record<string, () => unknown> = {
    serve: () => serve(args),
    mcp: () => mcp(args),
    pull: () => pull(args),
    verify: () => verify(args),
    admin: () => admin(args),
  }
  if (!run[command]) die(`Unknown command: ${command}\n\n${HELP}`)
  Promise.resolve(run[command]()).catch((e) => die(e instanceof Error ? e.message : String(e)))
}
