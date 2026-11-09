// The host, end to end, through its real request handler.

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { generateOwnerKey, generatePassword, publishToken, sealVault, sha256Hex } from '../src/core/seal.ts'
import { llmsFull } from '../src/core/agent.ts'
import { openBundle } from '../src/core/seal.ts'
import type { Vault } from '../src/core/types.ts'
import { addressKey, createHandler, Limiter, validName, type Config } from '../src/server/app.ts'
import { clientAddress, listen } from '../src/server/node.ts'

const dirs: string[] = []
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

function host(over: Partial<Config> = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'locus-test-'))
  dirs.push(dataDir)
  return createHandler({
    domain: 'localhost',
    dataDir,
    studioDir: '/nonexistent',
    hosted: false,
    maxAccounts: 2,
    maxBundleBytes: 10 * 1_048_576,
    powBits: 0,
    donateUrl: '',
    abuseContact: '',
    trustProxy: false,
    ...over,
  })
}

function vaultFor(name: string, remote = true) {
  const local = generatePassword()
  const open = generatePassword()
  const vault: Vault = {
    format: 1,
    id: 'v',
    company: { name: 'Acme', about: 'Makes things.' },
    gates: [
      { id: 'brand', name: 'Brand' },
      { id: 'money', name: 'Money', builtin: 'money' },
    ],
    pieces: [
      { id: 'voice', title: 'Voice', summary: 'Plain and warm.', body: 'Never cute.', kind: 'rule', gate: 'brand', always: 'approved', updatedAt: 1 },
      { id: 'runway', title: 'Runway', summary: 'Fourteen months.', body: '', kind: 'fact', gate: 'money', updatedAt: 1 },
    ],
    links: [],
    costs: [],
    passwords: [
      { id: 'a', name: 'Agent', key: open, gates: ['brand'], remote, createdAt: 1 },
      { id: 'b', name: 'Local', key: local, gates: ['brand', 'money'], remote: false, createdAt: 1 },
    ],
    findings: [],
    site: { name, ownerKey: generateOwnerKey(), origin: '' },
    currency: 'USD',
    createdAt: 1,
    updatedAt: 1,
  }
  return { vault, open, local }
}

async function publish(h: ReturnType<typeof host>, vault: Vault, version = 1, nonce?: string) {
  const name = vault.site!.name
  return h(
    new Request(`http://localhost:4747/api/sites/${name}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${await publishToken(vault.site!.ownerKey)}`, ...(nonce ? { 'x-locus-pow': nonce } : {}) },
      body: JSON.stringify(await sealVault(vault, version)),
    }),
  )
}

const get = (h: ReturnType<typeof host>, url: string, headers: Record<string, string> = {}) =>
  h(new Request(url, { headers }))

const SITE = 'http://acme.localhost:4747'

test('publish, then read as an agent', async () => {
  const h = host()
  const { vault, open } = vaultFor('acme')
  assert.equal((await publish(h, vault)).status, 201)

  // Anyone can fetch the sealed data, and it reveals nothing.
  const bundle = await get(h, `${SITE}/bundle.json`)
  assert.equal(bundle.status, 200)
  const raw = await bundle.text()
  assert.ok(!raw.includes('Fourteen') && !raw.includes('Acme') && !raw.includes('Voice'))

  // Without a password an agent is told what to do.
  const locked = await get(h, `${SITE}/llms.txt`)
  assert.equal(locked.status, 401)
  assert.equal(locked.headers.get('www-authenticate'), 'Bearer')
  assert.ok((await locked.text()).includes('ask your user for the password'))

  // With one, it gets the map, with only its gates.
  const map = await get(h, `${SITE}/llms.txt`, { Authorization: `Bearer ${open}` })
  assert.equal(map.status, 200)
  const text = await map.text()
  assert.ok(text.includes('# Acme'))
  assert.ok(text.includes('Plain and warm'))
  assert.ok(!text.includes('Fourteen'))
  assert.ok(text.includes('1 other area is closed'))
  assert.equal(map.headers.get('cache-control'), 'no-store')

  const piece = await get(h, `${SITE}/v1/pieces/voice`, { Authorization: `Bearer ${open}` })
  assert.ok((await piece.text()).includes('Never cute'))
  assert.equal((await get(h, `${SITE}/v1/pieces/runway`, { Authorization: `Bearer ${open}` })).status, 404)

  const found = await get(h, `${SITE}/v1/search?q=warm`, { Authorization: `Bearer ${open}` })
  assert.ok((await found.text()).includes('voice'))
})

test('the /k/ form works for agents that cannot set headers, and keeps the key in its links', async () => {
  const h = host()
  const { vault, open } = vaultFor('acme')
  await publish(h, vault)
  const r = await get(h, `${SITE}/k/${open}/llms.txt`)
  assert.equal(r.status, 200)
  const text = await r.text()
  assert.ok(text.includes(`${SITE}/k/${open}/v1/search`), 'follow-up links still work without a header')
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer')
  assert.equal((await get(h, `${SITE}/k/${generatePassword()}/llms.txt`)).status, 401)
})

test('path-based addresses work for hosts without wildcard DNS', async () => {
  const h = host()
  const { vault, open } = vaultFor('acme')
  await publish(h, vault)
  const r = await get(h, `http://localhost:4747/s/acme/llms.txt`, { Authorization: `Bearer ${open}` })
  assert.equal(r.status, 200)
  assert.ok((await r.text()).includes('http://localhost:4747/s/acme/v1/search'))
})

test('a local-only password is refused remotely', async () => {
  const h = host()
  const { vault, local } = vaultFor('acme')
  await publish(h, vault)
  const r = await get(h, `${SITE}/llms.txt`, { Authorization: `Bearer ${local}` })
  assert.equal(r.status, 403)
  assert.ok((await r.text()).includes('local use only'))
})

test('passwords over plain HTTP are refused off localhost', async () => {
  const h = host({ domain: 'locus.test' })
  const { vault, open } = vaultFor('acme')
  await h(
    new Request('http://locus.test/api/sites/acme', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${await publishToken(vault.site!.ownerKey)}` },
      body: JSON.stringify(await sealVault(vault, 1)),
    }),
  )
  const r = await get(h, 'http://acme.locus.test/llms.txt', { Authorization: `Bearer ${open}` })
  assert.equal(r.status, 400)
  assert.ok((await r.text()).includes('plain HTTP'))
})

test('MCP over HTTP', async () => {
  const h = host()
  const { vault, open } = vaultFor('acme')
  await publish(h, vault)
  const rpc = (body: unknown) =>
    h(new Request(`${SITE}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${open}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))

  const init = await (await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).json()
  assert.equal(init.result.protocolVersion, '2025-06-18')
  assert.ok(init.result.instructions.includes('read_company_map'))

  assert.equal((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202)

  const list = await (await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()
  const names = list.result.tools.map((t: any) => t.name)
  assert.deepEqual(names, ['read_company_map', 'search_company', 'read_piece'], 'no cost tool without Money')

  const call = await (await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_company_map', arguments: {} } })).json()
  assert.ok(call.result.content[0].text.includes('Plain and warm'))

  const missing = await (await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'read_piece', arguments: { id: 'runway' } } })).json()
  assert.equal(missing.result.isError, true)

  const unknown = await (await rpc({ jsonrpc: '2.0', id: 5, method: 'nonsense' })).json()
  assert.equal(unknown.error.code, -32601)
})

test('only the owner can publish over a name, and versions only go up', async () => {
  const h = host()
  const { vault } = vaultFor('acme')
  await publish(h, vault)
  const stranger = vaultFor('acme').vault
  assert.equal((await publish(h, stranger, 2)).status, 403)
  assert.equal((await publish(h, vault, 1)).status, 409)
  assert.equal((await publish(h, vault, 2)).status, 200)
})

test('junk is refused, so this is not a free file host', async () => {
  const h = host()
  const { vault } = vaultFor('acme')
  const token = await publishToken(vault.site!.ownerKey)
  const put = (body: string) => h(new Request(`http://localhost:4747/api/sites/acme`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body }))
  assert.equal((await put('<html><script>alert(1)</script></html>')).status, 400)
  assert.equal((await put('{"hello":"world"}')).status, 400)
  assert.equal((await put(JSON.stringify({ ...(await sealVault(vault, 1)), site: 'other' }))).status, 400)
})

test('names: validation and reserved names', async () => {
  const h = host()
  const check = async (n: string) => (await (await get(h, `http://localhost:4747/api/sites/${n}`)).json()).available
  assert.equal(await check('acme'), true)
  assert.equal(await check('admin'), false)
  assert.equal(await check('a'), false)
  assert.equal(await check('-bad-'), false)
})

test('hosted mode: cap, limits, proof of work', async () => {
  const h = host({ hosted: true, maxAccounts: 2, maxBundleBytes: 2000, powBits: 0 })
  const info = await (await get(h, 'http://localhost:4747/api/info')).json()
  assert.equal(info.mode, 'hosted')
  assert.deepEqual(info.accounts, { used: 0, max: 2 })

  const big = vaultFor('toolarge').vault
  big.pieces[0].body = Array.from({ length: 4000 }, () => Math.random().toString(36)).join('')
  assert.equal((await publish(h, big)).status, 413)
  assert.equal((await (await get(h, 'http://localhost:4747/api/info')).json()).accounts.used, 0, 'a refused publish claims nothing')

  const roomy = host({ hosted: true, maxAccounts: 2, powBits: 0 })
  assert.equal((await publish(roomy, vaultFor('one').vault)).status, 201)
  assert.equal((await publish(roomy, vaultFor('two').vault)).status, 201)
  const full = await publish(roomy, vaultFor('three').vault)
  assert.equal(full.status, 403)
  assert.equal((await full.json()).code, 'full')

  // Deleting frees a spot.
  const one = vaultFor('four').vault
  const small = host({ hosted: true, maxAccounts: 1, powBits: 0 })
  await publish(small, one)
  assert.equal((await publish(small, vaultFor('five').vault)).status, 403)
  const del = await small(new Request('http://localhost:4747/api/sites/four', { method: 'DELETE', headers: { Authorization: `Bearer ${await publishToken(one.site!.ownerKey)}` } }))
  assert.equal(del.status, 200)
  assert.equal((await publish(small, vaultFor('five').vault)).status, 201)

  const pow = host({ hosted: true, maxAccounts: 5, powBits: 8 })
  const v = vaultFor('work').vault
  assert.equal((await publish(pow, v, 1, 'nope')).status, 400)
  let nonce = 0
  for (; ; nonce++) {
    const hex = await sha256Hex(`locus claim work ${nonce}`)
    if (hex.startsWith('00')) break
  }
  assert.equal((await publish(pow, v, 1, String(nonce))).status, 201)
  // Updating your own map needs no more work.
  assert.equal((await publish(pow, v, 2)).status, 200)
})

test('security headers on the Studio', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'locus-test-'))
  dirs.push(dataDir)
  const h = createHandler({ domain: 'localhost', dataDir, studioDir: join(process.cwd(), 'test', 'fixtures'), hosted: false, maxAccounts: 1, maxBundleBytes: 1000, powBits: 0, donateUrl: '', abuseContact: '', trustProxy: false })
  const r = await get(h, 'http://localhost:4747/', { Accept: 'text/html' })
  assert.equal(r.status, 200)
  const csp = r.headers.get('content-security-policy') ?? ''
  assert.ok(csp.includes("connect-src 'self' https://api.anthropic.com"))
  assert.ok(csp.includes("script-src 'self'"))
  assert.ok(!csp.includes('unsafe-inline'))
  const t = await get(h, 'http://localhost:4747/../../package.json')
  assert.ok(!(await t.text()).includes('"name": "locus-harness"'), 'no path traversal')
})

test('wrong passwords are limited per address', async () => {
  const h = host()
  const { vault, open } = vaultFor('acme')
  await publish(h, vault)
  const attempt = (key: string) => h(new Request(`${SITE}/llms.txt`, { headers: { Authorization: `Bearer ${key}` } }), '9.9.9.9')
  for (let i = 0; i < 31; i++) await attempt(generatePassword())
  assert.equal((await attempt(generatePassword())).status, 429)
  assert.equal((await attempt(open)).status, 429, 'the limit is on the address, whatever it sends next')
  const other = await h(new Request(`${SITE}/llms.txt`, { headers: { Authorization: `Bearer ${open}` } }), '1.1.1.1')
  assert.equal(other.status, 200, 'other addresses are unaffected')
})

test('odd names and paths are refused cleanly', async () => {
  const h = host()
  const { vault, open } = vaultFor('acme')
  await publish(h, vault)
  // Not a key, and not a crash.
  assert.equal((await get(h, `${SITE}/k/%E0%A4%A/llms.txt`)).status, 401)
  assert.equal((await get(h, `${SITE}/v1/pieces/%E0%A4%A`, { Authorization: `Bearer ${open}` })).status, 404)
  // A key with an escaped character isn't that key.
  const escaped = `v%64${open.slice(2)}`
  assert.equal((await get(h, `${SITE}/k/${escaped}/llms.txt`)).status, 401)
  // Host headers and paths that aren't valid names reach no site.
  const body = await (await get(h, 'http://x_y.localhost:4747/bundle.json')).text()
  assert.ok(!body.includes('locus/1'))
  assert.notEqual((await h(new Request('http://localhost:4747/api/sites/-bad-', { method: 'DELETE' }))).status, 200)
})

test('two simultaneous claims of a name cannot both win', async () => {
  const h = host({ hosted: true, maxAccounts: 5, powBits: 0 })
  const [a, b] = [vaultFor('acme').vault, vaultFor('acme').vault]
  const results = await Promise.all([publish(h, a), publish(h, b)])
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 403])
  const winner = results[0].status === 201 ? a : b
  assert.equal((await publish(h, winner, 2)).status, 200, 'and the winner keeps it')
})

test('the page is never served without its security headers', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'locus-test-'))
  dirs.push(dataDir)
  const h = createHandler({ domain: 'localhost', dataDir, studioDir: join(process.cwd(), 'test', 'fixtures'), hosted: false, maxAccounts: 1, maxBundleBytes: 1000, powBits: 0, donateUrl: '', abuseContact: '', trustProxy: false })
  for (const path of ['/', '/index.html', '/s/acme/', '/s/acme/index.html']) {
    const r = await get(h, `http://localhost:4747${path}`, { Accept: 'text/html' })
    assert.ok(r.headers.get('content-security-policy')?.includes("script-src 'self'"), path)
  }
})

test('an address behind a proxy cannot be spoofed', () => {
  // Nginx appends what it saw, so the client controls everything to the left.
  assert.equal(clientAddress('6.6.6.6, 9.9.9.9', '10.0.0.1', 1), '9.9.9.9')
  assert.equal(clientAddress('6.6.6.6, 9.9.9.9, 10.0.0.2', '10.0.0.1', 2), '9.9.9.9')
  assert.equal(clientAddress('6.6.6.6', '10.0.0.1', 0), '10.0.0.1', 'no proxy trusted, header ignored')
  assert.equal(clientAddress(undefined, '10.0.0.1', 1), '10.0.0.1')
})

test('nothing but a real bundle can be stored', async () => {
  const h = host()
  const { vault } = vaultFor('acme')
  const token = await publishToken(vault.site!.ownerKey)
  const put = (body: unknown) => h(new Request('http://localhost:4747/api/sites/acme', { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }))
  const good: any = await sealVault(vault, 1)
  assert.equal((await put({ ...good, sealedAt: 'a file hidden in the date field' })).status, 400)
  assert.equal((await put({ ...good, head: { iv: 'not base64!', ct: 'x' } })).status, 400)
  assert.equal((await put({ ...good, gates: { 'any-name-i-like': good.head } })).status, 400)
})

test('a size limit counts bytes, not characters', async () => {
  const h = host({ maxBundleBytes: 2000 })
  const { vault } = vaultFor('acme')
  const token = await publishToken(vault.site!.ownerKey)
  // Under the limit in characters, over it in bytes.
  const r = await h(new Request('http://localhost:4747/api/sites/acme', { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: 'é'.repeat(1500) }))
  assert.equal(r.status, 413)
})

test('a bundle changed after sealing is refused to readers', async () => {
  const h = host()
  const { vault, open } = vaultFor('acme')
  const token = await publishToken(vault.site!.ownerKey)
  const good: any = await sealVault(vault, 1)
  const put = await h(new Request('http://localhost:4747/api/sites/acme', { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...good, sealedAt: '2001-01-01T00:00:00.000Z' }) }))
  assert.equal(put.status, 201)
  const r = await get(h, `${SITE}/llms.txt`, { Authorization: `Bearer ${open}` })
  assert.equal(r.status, 502)
  assert.ok((await r.text()).includes('altered'))
})

test('MCP batches are capped', async () => {
  const h = host()
  const { vault, open } = vaultFor('acme')
  await publish(h, vault)
  const msg = { jsonrpc: '2.0', id: 1, method: 'ping' }
  const send = (n: number) => h(new Request(`${SITE}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${open}` }, body: JSON.stringify(Array(n).fill(msg)) }))
  assert.equal((await send(16)).status, 200)
  assert.equal((await send(17)).status, 400)
})

test('through the real network adapter, a forged X-Forwarded-For buys no extra accounts', async () => {
  const handler = host({ hosted: true, maxAccounts: 100, powBits: 0, trustProxy: true })
  const server = await listen(handler, 0, 10 * 1_048_576, 1)
  const port = (server.address() as { port: number }).port
  try {
    const statuses: number[] = []
    for (let i = 0; i < 8; i++) {
      const { vault } = vaultFor(`spoof${i}`)
      const res = await fetch(`http://localhost:${port}/api/sites/spoof${i}`, {
        method: 'PUT',
        // A different fake client each time, then what our one proxy really saw.
        headers: { Authorization: `Bearer ${await publishToken(vault.site!.ownerKey)}`, 'X-Forwarded-For': `6.6.6.${i}, 203.0.113.9` },
        body: JSON.stringify(await sealVault(vault, 1)),
      })
      statuses.push(res.status)
    }
    assert.deepEqual(statuses, [201, 201, 201, 201, 201, 201, 429, 429])
  } finally {
    server.close()
  }
})

test('a large map stays cheap to read, and calls in a batch are counted', async () => {
  const h = host({ maxBundleBytes: 12 * 1_048_576 })
  const { vault, open } = vaultFor('bigco')
  const words = 'liability clause invoice renewal agreement brand voice token deploy migration '
  // About 3 MB of text. The owner's sealed copy doubles it, so the bundle is near 8 MB.
  for (let i = 0; i < 150; i++) vault.pieces.push({ id: `p${i}`, title: `Piece ${i}`, summary: 's', body: words.repeat(240), kind: 'fact', gate: 'brand', updatedAt: 1 })
  assert.equal((await publish(h, vault)).status, 201)
  const t0 = performance.now()
  const r = await get(h, `${SITE.replace('acme', 'bigco')}/v1/search?q=liability`, { Authorization: `Bearer ${open}` })
  const ms = performance.now() - t0
  assert.equal(r.status, 200)
  assert.ok(ms < 1500, `one search on a map this size took ${Math.round(ms)} ms`)
  // A batch can't spend more than the per-address allowance.
  const msg = { jsonrpc: '2.0', id: 1, method: 'ping' }
  let limited = false
  for (let i = 0; i < 20 && !limited; i++) {
    const b = await h(new Request(`${SITE.replace('acme', 'bigco')}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${open}` }, body: JSON.stringify(Array(16).fill(msg)) }), '8.8.8.8')
    limited = b.status === 429
  }
  assert.ok(limited, 'sixteen-call batches hit the limit within twenty requests')
})

test('a proxy asking for a certificate gets yes only for the domain and claimed addresses', async () => {
  const h = host({ domain: 'example.com' })
  const ask = async (domain: string) => (await h(new Request(`http://localhost:4747/api/tls/ask?domain=${encodeURIComponent(domain)}`))).status
  assert.equal(await ask('example.com'), 200)
  assert.equal(await ask('nobody.example.com'), 404)
  assert.equal(await ask('evil.com'), 404)
  assert.equal(await ask('acme.example.com.evil.com'), 404)
  assert.equal(await ask(''), 404)
  const { vault } = vaultFor('acme')
  const r = await publish(h, vault)
  assert.equal(r.status, 201)
  assert.equal(await ask('acme.example.com'), 200)
  assert.equal(await ask('ACME.example.com'), 200)
})

test("a document the host doesn't have is a 404, not the app", async () => {
  const h = host()
  const r = await h(new Request('http://localhost:4747/docs/NOPE.md'))
  assert.equal(r.status, 404)
  assert.match(r.headers.get('content-type') ?? '', /text\/plain/)
})

// What an independent review found before launch, and what stops it now.

test("one map stuffed with items or links can't hold up the host", async () => {
  const { vault, open } = vaultFor('stuffed')
  for (let i = 0; i < 20_000; i++) vault.pieces.push({ id: `p${i}`, title: 't', summary: 's', body: '', kind: 'fact', gate: 'brand', updatedAt: 1 })
  for (let i = 0; i < 40_000; i++) vault.links.push({ from: 'p0', to: 'p1', kind: 'related' })
  const view = await openBundle(JSON.parse(JSON.stringify(await sealVault(vault, 1))), open)
  const t0 = performance.now()
  llmsFull(view)
  const ms = performance.now() - t0
  // It took 17 seconds when each item scanned the whole map.
  assert.ok(ms < 1000, `llms-full.txt for 20,000 items took ${Math.round(ms)} ms`)
  const h = host({ maxBundleBytes: 12 * 1_048_576 })
  assert.equal((await publish(h, vault)).status, 201)
  const s0 = performance.now()
  assert.equal((await get(h, 'http://stuffed.localhost:4747/v1/search?q=t', { Authorization: `Bearer ${open}` })).status, 200)
  assert.ok(performance.now() - s0 < 1000)
})

test("requests without a password do not use up the readers' budget for a map", async () => {
  const h = host({ hosted: true, maxAccounts: 10 })
  const { vault, open } = vaultFor('acme')
  assert.equal((await publish(h, vault)).status, 201)
  for (let i = 0; i < 260; i++) await h(new Request(`${SITE}/llms.txt`), `10.0.${i >> 8}.${i & 255}`)
  assert.equal((await h(new Request(`${SITE}/llms.txt`, { headers: { Authorization: `Bearer ${open}` } }), '192.0.2.1')).status, 200)
})

test('a reader with the current bundle is answered with 304', async () => {
  const h = host()
  const { vault } = vaultFor('acme')
  await publish(h, vault)
  const first = await get(h, `${SITE}/bundle.json`)
  const etag = first.headers.get('etag')!
  assert.ok(etag)
  assert.equal((await get(h, `${SITE}/bundle.json`, { 'If-None-Match': etag })).status, 304)
  await publish(h, vault, 2)
  assert.equal((await get(h, `${SITE}/bundle.json`, { 'If-None-Match': etag })).status, 200)
})

test("filling the limiter with other addresses does not reset anyone's limit", () => {
  const l = new Limiter()
  assert.ok(l.allow('claim:1.2.3.4', 1, 60_000))
  assert.ok(!l.allow('claim:1.2.3.4', 1, 60_000))
  for (let i = 0; i < 50_010; i++) l.allow(`me:${i}`, 60, 60_000)
  assert.ok(!l.allow('claim:1.2.3.4', 1, 60_000))
})

test('an IPv6 connection counts as one client per /64', () => {
  assert.equal(addressKey('2001:db8:1:2:aaaa::1'), addressKey('2001:db8:1:2:bbbb:cccc:dddd:eeee'))
  assert.notEqual(addressKey('2001:db8:1:2::1'), addressKey('2001:db8:1:3::1'))
  assert.equal(addressKey('2001:0db8:0001:0002::1'), '2001:db8:1:2::/64')
  assert.equal(addressKey('::ffff:203.0.113.7'), '203.0.113.7')
  assert.equal(addressKey('203.0.113.7'), '203.0.113.7')
})

test('punycode and the names of well-known services are not given out', () => {
  assert.ok(!validName('xn--pypal-4ve'))
  for (const n of ['paypal', 'anthropic', 'autodiscover', 'mta-sts', 'www']) assert.ok(!validName(n), n)
  assert.ok(validName('acme'))
})

test('the whole host gives out only so many new addresses an hour, from however many connections', async () => {
  const h = host({ hosted: true, maxAccounts: 100, claimsPerHour: 2 })
  const statuses: number[] = []
  for (let i = 0; i < 3; i++) {
    const { vault } = vaultFor(`co${i}`)
    statuses.push((await h(new Request(`http://localhost:4747/api/sites/co${i}`, { method: 'PUT', headers: { Authorization: `Bearer ${await publishToken(vault.site!.ownerKey)}` }, body: JSON.stringify(await sealVault(vault, 1)) }), `198.51.100.${i}`)).status)
  }
  assert.deepEqual(statuses, [201, 201, 429])
})

test('behind HTTPS every reply holds the browser to HTTPS, and other names under the domain go home', async () => {
  const h = host({ domain: 'locus.test', trustProxy: true })
  const r = await h(new Request('http://locus.test/api/info', { headers: { 'X-Forwarded-Proto': 'https', Host: 'locus.test' } }))
  assert.equal(r.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains')
  const www = await h(new Request('http://www.locus.test/start?x=1', { headers: { 'X-Forwarded-Proto': 'https', Host: 'www.locus.test' } }))
  assert.equal(www.status, 308)
  assert.equal(www.headers.get('location'), 'https://locus.test/start?x=1')
  // A proxy that reports plain HTTP gets no publish.
  const put = await h(new Request('http://locus.test/api/sites/acme', { method: 'PUT', headers: { 'X-Forwarded-Proto': 'http', Host: 'locus.test', Authorization: `Bearer ${'0'.repeat(64)}` }, body: '{}' }))
  assert.equal(put.status, 400)
})

test('a missing file is a 404, never the app', async () => {
  const r = await get(host(), 'http://localhost:4747/favicon.svg')
  assert.equal(r.status, 404)
})

test('through the real network adapter, bodies are only read where one belongs', async () => {
  const server = await listen(host(), 0, 1_048_576, 0)
  const port = (server.address() as { port: number }).port
  try {
    const big = await fetch(`http://localhost:${port}/mcp`, { method: 'POST', body: 'x'.repeat(70 * 1024) })
    assert.equal(big.status, 413)
    const huge = await fetch(`http://localhost:${port}/api/sites/acme`, { method: 'PUT', headers: { 'Content-Length': String(5 * 1_048_576) }, body: 'x'.repeat(5 * 1_048_576) }).catch(() => null)
    assert.ok(!huge || huge.status === 413)
  } finally {
    server.close()
  }
})
