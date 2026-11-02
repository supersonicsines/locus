// The host, end to end, through its real request handler.

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { generateOwnerKey, generatePassword, publishToken, sealVault, sha256Hex } from '../src/core/seal.ts'
import type { Vault } from '../src/core/types.ts'
import { createHandler, type Config } from '../src/server/app.ts'

const dirs: string[] = []
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

function host(over: Partial<Config> = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'vadere-test-'))
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
      headers: { Authorization: `Bearer ${await publishToken(vault.site!.ownerKey)}`, ...(nonce ? { 'x-vadere-pow': nonce } : {}) },
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
  assert.ok(text.includes('1 other gate is closed'))
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
  const h = host({ domain: 'vadere.test' })
  const { vault, open } = vaultFor('acme')
  await h(
    new Request('http://vadere.test/api/sites/acme', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${await publishToken(vault.site!.ownerKey)}` },
      body: JSON.stringify(await sealVault(vault, 1)),
    }),
  )
  const r = await get(h, 'http://acme.vadere.test/llms.txt', { Authorization: `Bearer ${open}` })
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
    const hex = await sha256Hex(`vadere claim work ${nonce}`)
    if (hex.startsWith('00')) break
  }
  assert.equal((await publish(pow, v, 1, String(nonce))).status, 201)
  // Updating your own map needs no more work.
  assert.equal((await publish(pow, v, 2)).status, 200)
})

test('security headers on the Studio', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'vadere-test-'))
  dirs.push(dataDir)
  const h = createHandler({ domain: 'localhost', dataDir, studioDir: join(process.cwd(), 'test', 'fixtures'), hosted: false, maxAccounts: 1, maxBundleBytes: 1000, powBits: 0, donateUrl: '', abuseContact: '', trustProxy: false })
  const r = await get(h, 'http://localhost:4747/', { Accept: 'text/html' })
  assert.equal(r.status, 200)
  const csp = r.headers.get('content-security-policy') ?? ''
  assert.ok(csp.includes("connect-src 'self' https://api.anthropic.com"))
  assert.ok(csp.includes("script-src 'self'"))
  assert.ok(!csp.includes('unsafe-inline'))
  const t = await get(h, 'http://localhost:4747/../../package.json')
  assert.ok(!(await t.text()).includes('"name": "vadere"'), 'no path traversal')
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
