// Signing in with Google, end to end through the real handler, against a stand-in Google.

import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { generateOwnerKey, generatePassword, publishToken, sealVault, sha256Hex } from '../src/core/seal.ts'
import type { Vault } from '../src/core/types.ts'
import { createHandler, type Config } from '../src/server/app.ts'
import { safeNext } from '../src/server/auth.ts'
import { listen } from '../src/server/node.ts'
import { FileStore } from '../src/server/store.ts'

const CLIENT_ID = 'test-client.apps.googleusercontent.com'
const CLIENT_SECRET = 'test-client-secret'
const SECRET = 'a-session-secret-that-is-long-enough-for-tests'
const ROOT = 'http://localhost:4747'
const EMAIL = 'test.person@example.com'
const NAME = 'Test Person'

const dirs: string[] = []
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')

/**
 * A stand-in for Google: it hands out a code for an authorize URL, and its token endpoint
 * checks the code, the client secret, the redirect URI and the PKCE verifier as Google would.
 * `claims` lets a test change what the id_token says.
 */
function fakeGoogle() {
  const codes = new Map<string, { nonce: string; challenge: string; sub: string; redirectUri: string }>()
  let claims = (c: Record<string, unknown>) => c
  const calls: URLSearchParams[] = []
  const tokenEndpoint = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), 'https://google.test/token')
    const body = new URLSearchParams(String(init?.body))
    calls.push(body)
    const entry = codes.get(body.get('code') ?? '')
    const verifier = body.get('code_verifier') ?? ''
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    if (!entry || body.get('client_secret') !== CLIENT_SECRET || body.get('client_id') !== CLIENT_ID || body.get('redirect_uri') !== entry.redirectUri || challenge !== entry.challenge || body.get('grant_type') !== 'authorization_code') {
      return new Response('{"error":"invalid_grant"}', { status: 400 })
    }
    codes.delete(body.get('code')!)
    const now = Math.floor(Date.now() / 1000)
    const payload = claims({ iss: 'https://accounts.google.com', aud: CLIENT_ID, azp: CLIENT_ID, sub: entry.sub, email: EMAIL, email_verified: true, name: NAME, nonce: entry.nonce, iat: now, exp: now + 3600 })
    return Response.json({ access_token: 'not-used', id_token: `${b64({ alg: 'RS256' })}.${b64(payload)}.not-checked` })
  }) as typeof globalThis.fetch
  return {
    fetch: tokenEndpoint,
    calls,
    approve(authorize: URL, sub: string) {
      const code = `code-${Math.random().toString(36).slice(2)}`
      codes.set(code, { nonce: authorize.searchParams.get('nonce')!, challenge: authorize.searchParams.get('code_challenge')!, sub, redirectUri: authorize.searchParams.get('redirect_uri')! })
      return code
    },
    set claims(f: (c: Record<string, unknown>) => Record<string, unknown>) {
      claims = f
    },
  }
}

function host(over: Partial<Config> = {}, google = fakeGoogle()) {
  const dataDir = mkdtempSync(join(tmpdir(), 'locus-auth-'))
  dirs.push(dataDir)
  const config: Config = {
    domain: 'localhost',
    dataDir,
    studioDir: '/nonexistent',
    hosted: true,
    maxAccounts: 50,
    maxBundleBytes: 10 * 1_048_576,
    powBits: 8,
    donateUrl: '',
    abuseContact: '',
    trustProxy: false,
    google: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
    sessionSecret: SECRET,
    mapsPerAccount: 3,
    googleEndpoints: { authorize: 'https://google.test/authorize', token: 'https://google.test/token' },
    googleFetch: google.fetch,
    ...over,
  }
  return { h: createHandler(config), google, dataDir, config }
}

type H = ReturnType<typeof createHandler>

const cookiePair = (setCookie: string) => setCookie.split(';')[0]
const sessionFrom = (r: Response) => r.headers.getSetCookie().find((c) => c.startsWith('locus_session=') && !c.startsWith('locus_session=;'))

/** The whole round trip: start, Google says yes, come back. */
async function signIn(t: ReturnType<typeof host>, { sub = 'google-sub-1', next = '/', base = ROOT, headers = {} as Record<string, string>, ip = '1.2.3.4' } = {}) {
  const start = await t.h(new Request(`${base}/api/auth/google/start?next=${encodeURIComponent(next)}`, { headers }), ip)
  assert.equal(start.status, 302)
  const authorize = new URL(start.headers.get('location')!)
  const stateCookie = start.headers.getSetCookie()[0]
  const code = t.google.approve(authorize, sub)
  const back = await t.h(new Request(`${base}/api/auth/google/callback?code=${code}&state=${authorize.searchParams.get('state')}`, { headers: { ...headers, Cookie: cookiePair(stateCookie) } }), ip)
  const session = sessionFrom(back)
  return { start, authorize, stateCookie, back, session, cookie: session ? cookiePair(session) : '' }
}

function vaultFor(name: string): Vault {
  return {
    format: 1,
    id: `v-${name}`,
    company: { name: 'Acme', about: 'Makes things.' },
    gates: [{ id: 'brand', name: 'Brand' }],
    pieces: [{ id: 'voice', title: 'Voice', summary: 'Plain and warm.', body: '', kind: 'rule', gate: 'brand', updatedAt: 1 }],
    links: [],
    costs: [],
    passwords: [{ id: 'a', name: 'Agent', key: generatePassword(), gates: ['brand'], remote: true, createdAt: 1 }],
    findings: [],
    site: { name, ownerKey: generateOwnerKey(), origin: '' },
    currency: 'USD',
    createdAt: 1,
    updatedAt: 1,
  }
}

async function publish(h: H, vault: Vault, { version = 1, cookie = '', headers = {} as Record<string, string> } = {}) {
  return h(
    new Request(`${ROOT}/api/sites/${vault.site!.name}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${await publishToken(vault.site!.ownerKey)}`, ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: JSON.stringify(await sealVault(vault, version)),
    }),
    '5.6.7.8',
  )
}

const me = async (h: H, cookie = '', base = ROOT) => {
  const r = await h(new Request(`${base}/api/me`, { headers: cookie ? { Cookie: cookie } : {} }))
  assert.equal(r.headers.get('cache-control'), 'no-store')
  return r.json()
}

const info = async (h: H) => (await h(new Request(`${ROOT}/api/info`))).json()

const failedWith = (r: Response, why: string) => {
  assert.equal(r.status, 302)
  assert.equal(r.headers.get('location'), `/?signin=failed&why=${why}`)
  assert.equal(sessionFrom(r), undefined, 'no session on a failure')
}

test('signing in: the redirect to Google, the way back, and who it says you are', async () => {
  const t = host()
  const { start, authorize, stateCookie, back, session, cookie } = await signIn(t, { next: '/?from=publish' })

  assert.equal(authorize.origin + authorize.pathname, 'https://google.test/authorize')
  const q = authorize.searchParams
  assert.equal(q.get('client_id'), CLIENT_ID)
  assert.equal(q.get('redirect_uri'), `${ROOT}/api/auth/google/callback`)
  assert.equal(q.get('response_type'), 'code')
  assert.equal(q.get('scope'), 'openid email profile')
  assert.equal(q.get('prompt'), 'select_account')
  assert.equal(q.get('code_challenge_method'), 'S256')
  assert.match(q.get('code_challenge')!, /^[A-Za-z0-9_-]{43}$/)
  assert.ok(q.get('state')!.length >= 32 && q.get('nonce')!.length >= 32 && q.get('state') !== q.get('nonce'))
  assert.equal(start.headers.get('cache-control'), 'no-store')

  // The state cookie: short-lived, scoped to sign-in, and unreadable by the page.
  assert.match(stateCookie, /^locus_auth=[^;]+; Path=\/api\/auth; Max-Age=600; HttpOnly; SameSite=Lax$/)
  assert.ok(!stateCookie.includes('Secure'), 'not Secure over plain http on localhost')

  // The token endpoint got the code, the client secret and the PKCE verifier (the fake checks the verifier against the challenge).
  assert.equal(t.google.calls.length, 1)
  assert.equal(t.google.calls[0].get('redirect_uri'), `${ROOT}/api/auth/google/callback`)

  assert.equal(back.status, 302)
  assert.equal(back.headers.get('location'), '/?from=publish')
  assert.match(session!, /^locus_session=[^;]+; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax$/)
  assert.ok(back.headers.getSetCookie().some((c) => /^locus_auth=; Path=\/api\/auth; Max-Age=0/.test(c)), 'the state cookie is cleared')

  assert.deepEqual(await me(t.h, cookie), { signedIn: true, name: NAME, email: EMAIL, maps: [] })
  assert.deepEqual(await me(t.h), { signedIn: false })
})

test('cookies are Secure over HTTPS, and the redirect URI says https', async () => {
  const t = host({ trustProxy: true, domain: 'locus.test' })
  const headers = { 'X-Forwarded-Proto': 'https', Host: 'locus.test' }
  const { authorize, stateCookie, session, cookie } = await signIn(t, { base: 'http://locus.test', headers })
  assert.equal(authorize.searchParams.get('redirect_uri'), 'https://locus.test/api/auth/google/callback')
  assert.ok(stateCookie.endsWith('; Secure'))
  assert.ok(session!.endsWith('; HttpOnly; SameSite=Lax; Secure'))
  assert.equal((await me(t.h, cookie, 'http://locus.test')).signedIn, true)
})

test('a wrong state, a missing cookie or a cancel at Google signs nobody in', async () => {
  const t = host()
  const start = await t.h(new Request(`${ROOT}/api/auth/google/start`))
  const authorize = new URL(start.headers.get('location')!)
  const stateCookie = cookiePair(start.headers.getSetCookie()[0])

  const wrong = await t.h(new Request(`${ROOT}/api/auth/google/callback?code=${t.google.approve(authorize, 's')}&state=not-the-state`, { headers: { Cookie: stateCookie } }))
  failedWith(wrong, 'state')

  const noCookie = await t.h(new Request(`${ROOT}/api/auth/google/callback?code=${t.google.approve(authorize, 's')}&state=${authorize.searchParams.get('state')}`))
  failedWith(noCookie, 'expired')

  // A state cookie someone edited is no state cookie.
  const [body, sig] = stateCookie.slice('locus_auth='.length).split('.')
  const edited = JSON.parse(Buffer.from(body, 'base64url').toString())
  edited.next = '//evil.test'
  const forged = await t.h(new Request(`${ROOT}/api/auth/google/callback?code=${t.google.approve(authorize, 's')}&state=${authorize.searchParams.get('state')}`, { headers: { Cookie: `locus_auth=${b64(edited)}.${sig}` } }))
  failedWith(forged, 'expired')

  const denied = await t.h(new Request(`${ROOT}/api/auth/google/callback?error=access_denied&state=${authorize.searchParams.get('state')}`, { headers: { Cookie: stateCookie } }))
  failedWith(denied, 'denied')
  assert.equal(t.google.calls.length, 0, 'Google was never asked for a token')
})

test('an id_token is checked: audience, issuer, expiry, nonce and a verified email', async () => {
  const cases: [string, (c: Record<string, unknown>) => Record<string, unknown>, string][] = [
    ['wrong aud', (c) => ({ ...c, aud: 'someone-else.apps.googleusercontent.com' }), 'token'],
    ['aud list without this client as azp', (c) => ({ ...c, aud: [CLIENT_ID, 'other'], azp: 'other' }), 'token'],
    ['wrong iss', (c) => ({ ...c, iss: 'https://accounts.evil.test' }), 'token'],
    ['expired', (c) => ({ ...c, exp: Math.floor(Date.now() / 1000) - 10 }), 'token'],
    ['nonce mismatch', (c) => ({ ...c, nonce: 'a-different-nonce' }), 'token'],
    ['no sub', (c) => ({ ...c, sub: '' }), 'token'],
    ['unverified email', (c) => ({ ...c, email_verified: false }), 'unverified'],
  ]
  for (const [label, claims, why] of cases) {
    const t = host()
    t.google.claims = claims
    const { back } = await signIn(t)
    assert.equal(back.headers.get('location'), `/?signin=failed&why=${why}`, label)
    assert.equal(sessionFrom(back), undefined, label)
  }
  // Google's issuer comes with or without the scheme.
  const t = host()
  t.google.claims = (c) => ({ ...c, iss: 'accounts.google.com' })
  assert.ok((await signIn(t)).session)

  // A token endpoint that refuses is a failure too, and the code isn't in the URL.
  const refused = host()
  const start = await refused.h(new Request(`${ROOT}/api/auth/google/start`))
  const authorize = new URL(start.headers.get('location')!)
  const r = await refused.h(new Request(`${ROOT}/api/auth/google/callback?code=never-issued&state=${authorize.searchParams.get('state')}`, { headers: { Cookie: cookiePair(start.headers.getSetCookie()[0]) } }))
  failedWith(r, 'google')
})

test('after signing in, it only ever goes back to a path on this host', async () => {
  for (const evil of ['//evil.test', '/\\evil.test', 'https://evil.test', 'evil.test', '/\t/evil.test', '/%0a/evil', ' /x', 'javascript:alert(1)', '/api/auth/signout']) {
    const t = host()
    const { back } = await signIn(t, { next: evil })
    const location = back.headers.get('location')
    // `/%0a/evil` is a fine path: escaped, it stays one.
    assert.ok(location === '/' || location === '/%0a/evil', `${JSON.stringify(evil)} went to ${location}`)
  }
  assert.equal(safeNext('/s/acme/?x=1#top'), '/s/acme/?x=1#top')
  assert.equal(safeNext(null), '/')
  assert.equal(safeNext('/' + 'a'.repeat(2000)), '/')
})

test('a session cookie that was changed, or has run out, is nobody', async () => {
  const t = host()
  const { cookie } = await signIn(t)
  const value = cookie.slice('locus_session='.length)
  const [body, sig] = value.split('.')
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString())

  const someoneElse = { ...payload, uid: 'f'.repeat(32) }
  assert.deepEqual(await me(t.h, `locus_session=${b64(someoneElse)}.${sig}`), { signedIn: false })
  assert.deepEqual(await me(t.h, `locus_session=${body}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`), { signedIn: false })
  assert.deepEqual(await me(t.h, `locus_session=${body}`), { signedIn: false })
  assert.deepEqual(await me(t.h, 'locus_session=garbage.garbage'), { signedIn: false })

  // Signed properly, but past its date.
  const sign = (p: unknown) => {
    const b = b64(p)
    return `locus_session=${b}.${createHmac('sha256', SECRET).update(`session.${b}`).digest('base64url')}`
  }
  assert.equal((await me(t.h, sign(payload))).signedIn, true, 'the test signs the way the host does')
  assert.deepEqual(await me(t.h, sign({ ...payload, exp: Date.now() - 1000 })), { signedIn: false })
  assert.deepEqual(await me(t.h, sign({ ...payload, v: 2 })), { signedIn: false })

  // Another host's secret makes another host's cookies.
  const other = host({ sessionSecret: 'another-session-secret-that-is-long-enough' })
  assert.deepEqual(await me(other.h, cookie), { signedIn: false })
})

test('hosted with Google: a new address needs a session, skips the proof of work, and records only a keyed owner', async () => {
  const t = host({ powBits: 20 })
  const i = await info(t.h)
  assert.equal(i.google, true)
  assert.equal(i.signinToClaim, true)
  assert.equal(i.mapsPerAccount, 3)
  assert.equal(i.powBits, 0, 'the Studio is told not to work for it')

  const anon = await publish(t.h, vaultFor('acme'))
  assert.equal(anon.status, 401)
  assert.equal((await anon.json()).code, 'signin')

  const { cookie } = await signIn(t)
  const v = vaultFor('acme')
  // No proof of work sent, and 20 bits would take a while: it isn't asked for.
  assert.equal((await publish(t.h, v, { cookie })).status, 201)

  const meta = new FileStore(t.dataDir).meta('acme')!
  assert.match(meta.owner!, /^[0-9a-f]{32}$/)
  assert.deepEqual((await me(t.h, cookie)).maps, ['acme'])

  // Nothing on disk says who that is.
  const files: string[] = []
  const walk = (d: string) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))))
  walk(t.dataDir)
  const disk = files.map((f) => readFileSync(f, 'latin1')).join('\n')
  for (const word of [EMAIL, NAME, 'example.com', 'google-sub-1']) assert.ok(!disk.includes(word), `${word} is on disk`)
  assert.ok(disk.includes(meta.owner!))

  // A signed-in claim from another site's page isn't one.
  const crossSite = await publish(t.h, vaultFor('acme-two'), { cookie, headers: { Origin: 'https://evil.test' } })
  assert.equal(crossSite.status, 401)
  assert.equal((await publish(t.h, vaultFor('acme-two'), { cookie, headers: { Origin: ROOT } })).status, 201)
})

test('updating a name needs only its recovery key, signed in or not, as anyone', async () => {
  const t = host()
  const { cookie } = await signIn(t, { sub: 'owner' })
  const other = (await signIn(t, { sub: 'someone-else' })).cookie
  const v = vaultFor('acme')
  assert.equal((await publish(t.h, v, { cookie })).status, 201)
  const owner = new FileStore(t.dataDir).meta('acme')!.owner
  assert.equal((await publish(t.h, v, { version: 2 })).status, 200, 'no session, as from the CLI or another device')
  assert.equal((await publish(t.h, v, { version: 3, cookie: other })).status, 200, "another account's session changes nothing")
  assert.equal(new FileStore(t.dataDir).meta('acme')!.owner, owner)
  assert.deepEqual((await me(t.h, cookie)).maps, ['acme'], 'the owner stays the owner')
  assert.deepEqual((await me(t.h, other)).maps, [])
  // And a session never stands in for the key.
  const stranger = vaultFor('acme')
  assert.equal((await publish(t.h, stranger, { version: 4, cookie })).status, 403)
})

test('each account has a cap, and /api/me lists only its own names', async () => {
  const t = host({ mapsPerAccount: 2 })
  const a = (await signIn(t, { sub: 'a' })).cookie
  const b = (await signIn(t, { sub: 'b' })).cookie
  const one = vaultFor('one')
  assert.equal((await publish(t.h, one, { cookie: a })).status, 201)
  assert.equal((await publish(t.h, vaultFor('two'), { cookie: a })).status, 201)
  const full = await publish(t.h, vaultFor('three'), { cookie: a })
  assert.equal(full.status, 403)
  const said = await full.json()
  assert.equal(said.code, 'account-full')
  assert.equal(said.max, 2)
  assert.equal((await publish(t.h, vaultFor('three'), { cookie: b })).status, 201, 'another account has its own')

  assert.deepEqual((await me(t.h, a)).maps, ['one', 'two'])
  assert.deepEqual((await me(t.h, b)).maps, ['three'])

  // Taking one off the host frees its place on the account.
  const del = await t.h(new Request(`${ROOT}/api/sites/one`, { method: 'DELETE', headers: { Authorization: `Bearer ${await publishToken(one.site!.ownerKey)}` } }))
  assert.equal(del.status, 200)
  assert.equal((await publish(t.h, vaultFor('four'), { cookie: a })).status, 201)
  assert.deepEqual((await me(t.h, a)).maps, ['four', 'two'])
})

test('signing in and /api/me belong to the host, never to an address on it', async () => {
  const t = host()
  const { cookie } = await signIn(t)
  assert.equal((await publish(t.h, vaultFor('acme'), { cookie })).status, 201)
  for (const url of [
    'http://acme.localhost:4747/api/auth/google/start',
    'http://acme.localhost:4747/api/auth/google/callback?code=x&state=y',
    'http://acme.localhost:4747/api/me',
    `${ROOT}/s/acme/api/auth/google/start`,
    `${ROOT}/s/acme/api/me`,
    'http://somewhere-else.test/api/auth/google/start',
  ]) {
    const r = await t.h(new Request(url, { headers: { Cookie: cookie } }))
    assert.equal(r.status, 404, url)
    assert.deepEqual(r.headers.getSetCookie(), [], url)
  }
  const signout = await t.h(new Request('http://acme.localhost:4747/api/auth/signout', { method: 'POST', headers: { 'X-Locus': '1', Cookie: cookie } }))
  assert.equal(signout.status, 404)
  // The address itself still works as ever.
  assert.equal((await t.h(new Request('http://acme.localhost:4747/bundle.json'))).status, 200)
})

test('signing out takes a header a form cannot send, from this host only', async () => {
  const t = host()
  const { cookie } = await signIn(t)
  const out = (headers: Record<string, string>) => t.h(new Request(`${ROOT}/api/auth/signout`, { method: 'POST', headers: { Cookie: cookie, ...headers } }))
  assert.equal((await out({})).status, 403)
  assert.equal((await out({ 'X-Locus': '1', Origin: 'https://evil.test' })).status, 403)
  assert.equal((await out({ 'X-Locus': '1', Origin: 'null' })).status, 403)
  assert.equal((await t.h(new Request(`${ROOT}/api/auth/signout`, { headers: { Cookie: cookie, 'X-Locus': '1' } }))).status, 404, 'not a GET')
  const r = await out({ 'X-Locus': '1', Origin: ROOT })
  assert.equal(r.status, 200)
  assert.deepEqual(r.headers.getSetCookie(), ['locus_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'])
})

test('sign-in is limited per address', async () => {
  const t = host()
  const start = (ip: string) => t.h(new Request(`${ROOT}/api/auth/google/start`), ip)
  for (let i = 0; i < 20; i++) assert.equal((await start('9.9.9.9')).status, 302)
  failedWith(await start('9.9.9.9'), 'busy')
  assert.ok((await start('8.8.8.8')).headers.get('location')!.startsWith('https://google.test/'), 'other addresses are unaffected')
})

test('the session secret is made once, kept private, and survives a restart', async () => {
  const t = host({ sessionSecret: undefined })
  const file = join(t.dataDir, 'session-secret')
  assert.ok(existsSync(file))
  assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.match(readFileSync(file, 'utf8').trim(), /^[0-9a-f]{64}$/)

  const { cookie } = await signIn(t)
  assert.equal((await publish(t.h, vaultFor('acme'), { cookie })).status, 201)

  // The same folder after a restart: same secret, so the same person still owns the same names.
  const again = createHandler({ ...t.config, sessionSecret: undefined })
  assert.deepEqual((await me(again, cookie)).maps, ['acme'])
})

test('through the real network adapter, both cookies on the way back arrive', async () => {
  const t = host()
  const server = await listen(t.h, 0, 10 * 1_048_576, 0)
  const base = `http://localhost:${(server.address() as { port: number }).port}`
  try {
    const start = await fetch(`${base}/api/auth/google/start?next=/x`, { redirect: 'manual' })
    const authorize = new URL(start.headers.get('location')!)
    const back = await fetch(`${base}/api/auth/google/callback?code=${t.google.approve(authorize, 'net')}&state=${authorize.searchParams.get('state')}`, {
      redirect: 'manual',
      headers: { Cookie: cookiePair(start.headers.getSetCookie()[0]) },
    })
    assert.equal(back.status, 302)
    assert.equal(back.headers.get('location'), '/x')
    const cookies = back.headers.getSetCookie()
    assert.equal(cookies.length, 2)
    assert.ok(cookies.some((c) => c.startsWith('locus_auth=;')) && cookies.some((c) => /^locus_session=[^;]+/.test(c)))
  } finally {
    server.close()
  }
})

test('with Google off, nothing changes', async () => {
  const t = host({ google: undefined, sessionSecret: undefined, googleFetch: undefined, googleEndpoints: undefined, powBits: 8 })
  const i = await info(t.h)
  assert.equal(i.google, false)
  assert.equal(i.signinToClaim, false)
  assert.equal(i.mapsPerAccount, null)
  assert.equal(i.powBits, 8)
  assert.equal((await t.h(new Request(`${ROOT}/api/auth/google/start`))).status, 404)
  assert.equal((await t.h(new Request(`${ROOT}/api/auth/google/callback?code=x&state=y`))).status, 404)
  assert.deepEqual(await me(t.h), { signedIn: false })
  assert.ok(!existsSync(join(t.dataDir, 'session-secret')), 'no secret is made')

  // The proof of work still stands, and a claim records no owner.
  const v = vaultFor('work')
  assert.equal((await publish(t.h, v)).status, 400)
  let nonce = 0
  while (!(await sha256Hex(`locus claim work ${nonce}`)).startsWith('00')) nonce++
  assert.equal((await publish(t.h, v, { headers: { 'x-locus-pow': String(nonce) } })).status, 201)
  assert.equal(new FileStore(t.dataDir).meta('work')!.owner, undefined)
})

test('self-hosted with Google: anyone can still claim, and a signed-in claim is listed', async () => {
  const t = host({ hosted: false })
  const i = await info(t.h)
  assert.equal(i.google, true)
  assert.equal(i.signinToClaim, false)
  assert.equal((await publish(t.h, vaultFor('anon'))).status, 201)
  const { cookie } = await signIn(t)
  assert.equal((await publish(t.h, vaultFor('mine'), { cookie })).status, 201)
  assert.deepEqual((await me(t.h, cookie)).maps, ['mine'])
  assert.equal(new FileStore(t.dataDir).meta('anon')!.owner, undefined)
})
