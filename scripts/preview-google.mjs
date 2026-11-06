// A local preview of signing in with Google, against a stand-in Google that exists only in this script.
//
//   npm run preview:google            builds the Studio into a temporary folder, then serves it
//   npm run preview:google -- --studio dist/studio    serves a Studio you've already built
//
// Then open http://localhost:4760. It runs the real host from the source, in hosted mode with Google on,
// so going live asks you to sign in first. "Sign in with Google" goes to a page at /__fake-google/authorize
// with one button, which comes back with a code; the token endpoint answers in this process with a matching
// id_token. Both are wired in through the handler's test-only settings, which the host and the CLI never set.
// Maps go in a temporary folder, deleted when this stops. dist/ is left alone.

import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHandler } from '../src/server/app.ts'
import { listen } from '../src/server/node.ts'

const PORT = 4760
const ORIGIN = `http://localhost:${PORT}`
const CLIENT_ID = 'preview-client.apps.googleusercontent.com'
const CLIENT_SECRET = 'preview-client-secret'
const PERSON = { sub: 'preview-test-person', name: 'Test Person', email: 'test.person@example.com' }

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)

const args = process.argv.slice(2)
const given = args.includes('--studio') ? resolve(args[args.indexOf('--studio') + 1] ?? '') : null
const temp = []
const scratch = (label) => {
  const dir = mkdtempSync(join(tmpdir(), `locus-preview-google-${label}-`))
  temp.push(dir)
  return dir
}
const cleanUp = () => temp.forEach((d) => rmSync(d, { recursive: true, force: true }))

let studioDir = given
if (!studioDir) {
  console.log('Building the Studio into a temporary folder. dist/ is left alone.')
  studioDir = scratch('studio')
  const { build } = await import('vite')
  await build({ configFile: join(root, 'vite.config.ts'), build: { outDir: studioDir, emptyOutDir: true }, logLevel: 'warn' })
}

// The stand-in Google. Codes it has handed out, and what each was handed out for.
const codes = new Map()

function authorizePage(url) {
  const q = url.searchParams
  const redirectUri = q.get('redirect_uri') ?? ''
  const fine =
    q.get('client_id') === CLIENT_ID &&
    redirectUri === `${ORIGIN}/api/auth/google/callback` &&
    q.get('response_type') === 'code' &&
    q.get('code_challenge_method') === 'S256' &&
    q.get('code_challenge') &&
    q.get('state') &&
    q.get('nonce')
  if (!fine) return new Response('The stand-in Google refused that request: it is not what the host should send.\n', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  const code = randomBytes(16).toString('hex')
  codes.set(code, { nonce: q.get('nonce'), challenge: q.get('code_challenge'), redirectUri })
  const back = `${redirectUri}?${new URLSearchParams({ code, state: q.get('state') })}`
  const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stand-in Google</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f3f3f1; color: #1c1c1a; font: 15px/1.5 system-ui, sans-serif; }
  main { width: min(360px, calc(100vw - 32px)); padding: 28px; background: #fff; border: 1px solid #dcdcd8; border-radius: 10px; }
  h1 { margin: 0 0 6px; font-size: 18px; font-weight: 600; }
  p { margin: 0 0 20px; color: #5c5c58; }
  a { display: block; padding: 11px 14px; text-align: center; background: #1c1c1a; color: #fff; border-radius: 7px; text-decoration: none; font-weight: 500; }
</style>
<main>
  <h1>Stand-in Google</h1>
  <p>This page exists only in the preview script. It signs you in to this local host as ${PERSON.name}, ${PERSON.email}.</p>
  <a href="${back.replace(/&/g, '&amp;')}">Continue as ${PERSON.name}</a>
</main>
</html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url')

/** The token endpoint, answered in this process: it checks what Google checks, then says who signed in. */
async function tokenEndpoint(url, init) {
  if (String(url) !== `${ORIGIN}/__fake-google/token`) return new Response('Not the stand-in token endpoint.', { status: 404 })
  const body = new URLSearchParams(String(init?.body ?? ''))
  const entry = codes.get(body.get('code') ?? '')
  codes.delete(body.get('code') ?? '')
  const verifier = body.get('code_verifier') ?? ''
  const ok =
    entry &&
    body.get('grant_type') === 'authorization_code' &&
    body.get('client_id') === CLIENT_ID &&
    body.get('client_secret') === CLIENT_SECRET &&
    body.get('redirect_uri') === entry.redirectUri &&
    createHash('sha256').update(verifier).digest('base64url') === entry.challenge
  if (!ok) return Response.json({ error: 'invalid_grant' }, { status: 400 })
  const now = Math.floor(Date.now() / 1000)
  const claims = { iss: 'https://accounts.google.com', aud: CLIENT_ID, azp: CLIENT_ID, sub: PERSON.sub, email: PERSON.email, email_verified: true, name: PERSON.name, nonce: entry.nonce, iat: now, exp: now + 3600 }
  return Response.json({ access_token: 'stand-in', token_type: 'Bearer', expires_in: 3600, id_token: `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims)}.stand-in` })
}

const CAP = Number(process.env.LOCUS_MAPS_PER_ACCOUNT) || 3
const dataDir = scratch('data')
const handler = createHandler({
  domain: 'localhost',
  dataDir,
  studioDir,
  hosted: true,
  maxAccounts: 50,
  maxBundleBytes: 10 * 1_048_576,
  powBits: 16,
  donateUrl: '',
  abuseContact: '',
  trustProxy: false,
  google: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
  mapsPerAccount: CAP,
  googleEndpoints: { authorize: `${ORIGIN}/__fake-google/authorize`, token: `${ORIGIN}/__fake-google/token` },
  googleFetch: tokenEndpoint,
})

const withFakeGoogle = async (req, ip) => {
  const url = new URL(req.url)
  if (url.pathname === '/__fake-google/authorize' && req.method === 'GET') return authorizePage(url)
  return handler(req, ip)
}

try {
  await listen(withFakeGoogle, PORT, 10 * 1_048_576, 0)
} catch (e) {
  cleanUp()
  console.error(e?.code === 'EADDRINUSE' ? `Port ${PORT} is in use. Stop whatever is on it and try again.` : e)
  process.exit(1)
}

console.log(`Locus, with a stand-in Google, is running at ${ORIGIN}`)
console.log(`Hosted mode, so going live asks you to sign in. Each account can take ${CAP === 1 ? '1 address' : `${CAP} addresses`} (set LOCUS_MAPS_PER_ACCOUNT to change it).`)
console.log('Signing in goes to a page in this script, not to Google, and signs you in as Test Person.')
console.log('Maps are kept in a temporary folder and deleted when this stops. Press Ctrl+C to stop.')

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    cleanUp()
    process.exit(0)
  })
}
