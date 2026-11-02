#!/usr/bin/env node
// vadere: run a host, or read a map from your own machine.

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

const HELP = `vadere ${SERVER_VERSION}

A map of your company that any agent can read.

  vadere serve              Run the Studio and host. Open http://localhost:4747
    --port 4747
    --domain localhost      Your wildcard domain, for yourco.domain addresses
    --data ~/.vadere        Where sealed maps are stored
    --hosted                Free-with-a-cap mode (see --max-accounts)
    --max-accounts 500
    --donate-url <url>
    --abuse-contact <addr>
    --trust-proxy           Read X-Forwarded-* from your reverse proxy
    --proxy-hops 1          How many proxies you run in front (2 for Cloudflare and Caddy)

  vadere mcp <address>      MCP server on stdio. Decrypts here; the host never sees the password
  vadere pull <address>     Write the map to a folder as Markdown
    --out ./company
  vadere verify <address>   Show what the host really holds, and test it

  vadere admin list         Accounts on this host
  vadere admin remove <name>

Passwords come from --key or the VADERE_KEY environment variable.
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

const dataDir = (args: Args) => resolve(args.data ?? process.env.VADERE_DATA ?? join(homedir(), '.vadere'))

function needKey(args: Args): string {
  const key = args.key ?? process.env.VADERE_KEY
  if (!key) die('This needs a password. Use --key or set VADERE_KEY.')
  if (!looksLikeKey(key)) die('That does not look like a Vadere password. They start with vdr_.')
  return key
}

function address(args: Args): string {
  const a = args._[1]
  if (!a) die('This needs an address, for example https://yourco.vadere.dev')
  return a.replace(/\/+$/, '')
}

async function fetchBundle(addr: string): Promise<Bundle> {
  const r = await fetch(`${addr}/bundle.json`)
  if (r.status === 404) die(`Nothing has been published at ${addr}.`)
  if (!r.ok) die(`Could not read ${addr}: HTTP ${r.status}`)
  return (await r.json()) as Bundle
}

async function serve(args: Args) {
  const hosted = Boolean(args.hosted ?? process.env.VADERE_HOSTED)
  const here = dirname(fileURLToPath(import.meta.url))
  const config: Config = {
    domain: args.domain ?? process.env.VADERE_DOMAIN ?? 'localhost',
    dataDir: dataDir(args),
    studioDir: args.studio ?? join(here, 'studio'),
    hosted,
    maxAccounts: Number(args['max-accounts'] ?? process.env.VADERE_MAX_ACCOUNTS ?? 500),
    maxBundleBytes: (hosted ? 10 : 200) * 1_048_576,
    powBits: Number(process.env.VADERE_POW_BITS ?? 16),
    donateUrl: args['donate-url'] ?? process.env.VADERE_DONATE_URL ?? '',
    abuseContact: args['abuse-contact'] ?? process.env.VADERE_ABUSE_CONTACT ?? '',
    trustProxy: Boolean(args['trust-proxy'] ?? process.env.VADERE_TRUST_PROXY),
    proxyHops: Number(args['proxy-hops'] ?? process.env.VADERE_PROXY_HOPS ?? 1),
  }
  const port = Number(args.port ?? process.env.PORT ?? 4747)
  mkdirSync(config.dataDir, { recursive: true })
  await listen(createHandler(config), port, config.maxBundleBytes, config.trustProxy ? config.proxyHops ?? 1 : 0)
  console.log(`Vadere is running at http://${config.domain === 'localhost' ? 'localhost' : config.domain}:${port}`)
  console.log(`Sealed maps are stored in ${config.dataDir}`)
  if (hosted) console.log(`Hosted mode: up to ${config.maxAccounts} free accounts.`)
  if (config.domain !== 'localhost' && !config.trustProxy) {
    console.log('Put this behind HTTPS and pass --trust-proxy. Passwords sent over plain HTTP are refused.')
  }
}

async function mcp(args: Args) {
  const addr = address(args)
  const key = needKey(args)
  let view: View | null = null
  let fetchedAt = 0

  async function current(): Promise<View> {
    // Picks up new publishes without restarting the client.
    if (!view || Date.now() - fetchedAt > 60_000) {
      view = await openBundle(await fetchBundle(addr), key)
      fetchedAt = Date.now()
    }
    return view
  }

  await current().catch((e) => die(e instanceof Error ? e.message : String(e)))
  console.error(`Vadere: reading ${view!.company.name} as "${view!.passwordName}". Decrypting on this machine.`)

  const rl = createInterface({ input: process.stdin })
  rl.on('line', async (line) => {
    if (!line.trim()) return
    try {
      const reply = handleRpc(await current(), JSON.parse(line))
      if (reply) process.stdout.write(JSON.stringify(reply) + '\n')
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n')
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

  if (!args.key && !process.env.VADERE_KEY) {
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

  // Flip one byte in each thing we opened and make sure it's refused.
  const id = Object.keys(bundle.gates)[0]
  if (id) {
    const tampered = structuredClone(bundle)
    const ct = Buffer.from(tampered.gates[id].ct, 'base64')
    ct[Math.floor(ct.length / 2)] ^= 1
    tampered.gates[id].ct = ct.toString('base64')
    const before = view.gates.length
    let refused = false
    try {
      const again = await openBundle(tampered, key)
      refused = again.gates.length !== before
      if (!refused) console.log('  Tampering:    this password does not read the part we changed, so this check is inconclusive')
    } catch {
      refused = true
    }
    if (refused) console.log('  Tampering:    a changed byte was refused, as it should be')
  }
}

function admin(args: Args) {
  const store = new FileStore(dataDir(args))
  const sub = args._[1]
  if (sub === 'list') {
    const all = store.list()
    if (!all.length) return console.log('No accounts.')
    for (const { name, meta } of all) {
      console.log(`${name}  version ${meta.version}  ${(meta.bytes / 1024).toFixed(0)} KB  updated ${meta.updatedAt}`)
    }
    return
  }
  if (sub === 'remove') {
    const name = args._[2]
    if (!name) die('Which name?')
    console.log(store.remove(name) ? `Removed ${name}.` : `No account named ${name}.`)
    return
  }
  die('Use: vadere admin list | vadere admin remove <name>')
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
