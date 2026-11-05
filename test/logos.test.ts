// The logo bundle and the name lookup. What ships must draw and do nothing else, and a name must never
// find the wrong company, because names can come from documents.

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { CATALOG, findInCatalog } from '../src/core/catalog.ts'
import { createSample } from '../src/core/sample.ts'
import { llmsFull, llmsTxt, viewFor } from '../src/core/agent.ts'
import { buildIndex, fromRows, monogramOf, normaliseName, resolveService, type BundleRow } from '../src/studio/logos/lookup.ts'
import { SERVICE_CATEGORIES, SERVICES } from '../src/studio/logos/services.ts'

const raw = readFileSync('src/studio/logos/logos.bundle.json', 'utf8')
const bundle = JSON.parse(raw) as { v: number; services: BundleRow[] }
const services = fromRows(bundle.services)
const index = buildIndex(services)
const find = (name: unknown) => resolveService(index, name)
const idOf = (name: unknown) => find(name)?.id

// The budget. It costs first load and the npm package, so a change here should be on purpose.
const MAX_BUNDLE_BYTES = 1_500_000
const MAX_LOGO_BYTES = 9_000

const ELEMENTS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'use'])
const ATTRIBUTES = new Set([
  'xmlns', 'viewBox', 'width', 'height', 'id', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr', 'points', 'transform',
  'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset',
  'opacity', 'clip-path', 'clip-rule', 'mask', 'mask-type', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'offset', 'stop-color', 'stop-opacity', 'maskUnits', 'maskContentUnits', 'clipPathUnits', 'href',
])

const logos = services.filter((s) => s.svg)

test('the bundle is the list, in order, with nothing else in it', () => {
  assert.equal(bundle.v, 1)
  assert.deepEqual(services.map((s) => s.id), SERVICES.map((s) => s.id))
  assert.deepEqual(services.map((s) => s.name), SERVICES.map((s) => s.name))
  assert.deepEqual(Object.keys(bundle), ['v', 'services'])
})

test('there are about 900 services, each one well-formed and listed once', () => {
  assert.ok(SERVICES.length >= 850 && SERVICES.length <= 950, `${SERVICES.length}`)
  const ids = new Set<string>()
  for (const s of SERVICES) {
    assert.match(s.id, /^[a-z0-9][a-z0-9-]*$/, s.id)
    assert.ok(!ids.has(s.id), `${s.id} is listed twice`)
    ids.add(s.id)
    assert.ok((SERVICE_CATEGORIES as readonly string[]).includes(s.category), `${s.id}: ${s.category}`)
    assert.match(s.domain, /^[a-z0-9.-]+\.[a-z]{2,}$/, s.domain)
  }
})

test('no name or alias means two services', () => {
  const owner = new Map<string, string>()
  for (const s of SERVICES) {
    for (const name of [s.name, ...s.aliases]) {
      const k = normaliseName(name)
      assert.ok(k, `${s.id}: ${name}`)
      const had = owner.get(k)
      assert.ok(!had || had === s.id, `"${name}" means both ${had} and ${s.id}`)
      owner.set(k, s.id)
    }
  }
})

test('the shipped SVGs hold only what draws', () => {
  for (const s of logos) {
    const svg = s.svg!
    assert.match(svg, /^<svg\b[^>]*>[\s\S]*<\/svg>$/, s.id)
    assert.doesNotMatch(svg, /<!|<\?|<!--/, `${s.id}: declaration or comment`)
    for (const [, name] of svg.matchAll(/<\/?([^\s/>]+)/g)) assert.ok(ELEMENTS.has(name), `${s.id}: <${name}>`)
    for (const [, name] of svg.matchAll(/\s([^\s=<>"']+)=/g)) assert.ok(ATTRIBUTES.has(name), `${s.id}: ${name}=`)
    assert.doesNotMatch(svg, /\son[a-z]+\s*=/i, `${s.id}: event handler`)
    assert.doesNotMatch(svg, /<(script|style|foreignObject|image|a|iframe|embed|object|animate|set|text)\b/i, `${s.id}: forbidden element`)
    assert.doesNotMatch(svg, /javascript:|data:|expression\(|@import|xlink/i, `${s.id}: forbidden value`)
    // The only URL allowed anywhere is the SVG namespace, and references stay inside the file.
    assert.deepEqual([...svg.matchAll(/https?:[^"']*/gi)].map((m) => m[0]).filter((u) => u !== 'http://www.w3.org/2000/svg'), [], s.id)
    for (const [, ref] of svg.matchAll(/\shref="([^"]*)"/g)) assert.match(ref, /^#/, `${s.id}: href`)
    for (const [, ref] of svg.matchAll(/url\(([^)]*)\)/g)) assert.match(ref, /^#/, `${s.id}: url()`)
    assert.doesNotMatch(svg, /&(?!amp;|lt;|gt;|quot;|apos;)/, `${s.id}: entity`)
  }
  for (const s of services) {
    if (s.tile !== null) assert.match(s.tile, /^#[0-9a-fA-F]{3,8}$/, `${s.id}: tile`)
  }
})

test('every logo can be drawn on a canvas in any browser', () => {
  for (const s of logos) {
    assert.match(s.svg!, /^<svg\b[^>]*\swidth="64"/, `${s.id}: Firefox needs a width`)
    assert.match(s.svg!, /^<svg\b[^>]*\sheight="64"/, `${s.id}: Firefox needs a height`)
    assert.match(s.svg!, /^<svg\b[^>]*\sviewBox="[-\d.]+ [-\d.]+ [\d.]+ [\d.]+"/, `${s.id}: viewBox`)
    assert.match(s.svg!, /^<svg\b[^>]*\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${s.id}: xmlns`)
  }
})

test('the bundle stays in budget', () => {
  assert.ok(Buffer.byteLength(raw) <= MAX_BUNDLE_BYTES, `${Buffer.byteLength(raw)} bytes`)
  for (const s of logos) assert.ok(s.svg!.length <= MAX_LOGO_BYTES, `${s.id}: ${s.svg!.length} bytes`)
})

test('the likeliest services nearly all have logos', () => {
  const top = (n: number) => services.slice(0, n).filter((s) => s.svg).length
  assert.ok(top(100) >= 98, `top 100: ${top(100)}`)
  assert.ok(top(300) >= 280, `top 300: ${top(300)}`)
})

test('prototype names find nothing', () => {
  for (const name of ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf', '__defineGetter__']) {
    assert.equal(find(name), undefined, name)
    assert.equal(find(name.toUpperCase()), undefined, name)
    assert.equal(find(` ${name} `), undefined, name)
  }
  for (const name of [undefined, null, 0, 42, {}, [], ['Stripe'], { toString: () => 'Stripe' }, true]) assert.equal(find(name), undefined, String(name))
  assert.equal(find(''), undefined)
  assert.equal(find('   '), undefined)
  assert.equal(find('x'.repeat(10_000)), undefined)
})

test('names match exactly, once case and spacing are evened out', () => {
  assert.equal(idOf('Stripe'), 'stripe')
  assert.equal(idOf('  stripe  '), 'stripe')
  assert.equal(idOf('STRIPE'), 'stripe')
  assert.equal(idOf('Google  Cloud'), 'google-cloud')
  assert.equal(idOf('Goo​gle Cloud'), 'google-cloud')
  // A letter from another alphabet is a different name. These use a Cyrillic р and о.
  assert.equal(find('Stripeа'), undefined)
  assert.equal(find('Zооm'), undefined)
  assert.equal(find('Stripe Inc'), undefined)
  assert.equal(find('Stripe.'), undefined)
  assert.equal(find('Strip'), undefined)
  assert.equal(find('Stripes'), undefined)
  assert.equal(find('Stripe Payments Ltd'), undefined)
})

test('aliases find the service they belong to', () => {
  for (const [name, id] of [
    ['GCP', 'google-cloud'],
    ['Google Cloud Platform', 'google-cloud'],
    ['Amazon Web Services', 'aws'],
    ['Office 365', 'microsoft-365'],
    ['K8s', 'kubernetes'],
    ['HelloSign', 'dropbox-sign'],
    ['TransferWise', 'wise'],
    ['Twilio Segment', 'segment'],
    ['Anthropic API', 'anthropic-api'],
    ['Hetzner Storage', 'hetzner'],
    ['ChatGPT Business', 'chatgpt'],
    ['Twitter', 'x-twitter'],
    ['OpenPhone', 'quo'],
  ]) assert.equal(idOf(name), id, name)
})

test('near-collisions land on the right company or on nothing', () => {
  const each: [string, string | undefined][] = [
    ['Notion', 'notion'],
    ['Motion', 'motion'],
    ['Linear', 'linear'],
    ['Linear B', undefined],
    ['Stack', undefined],
    ['Stack Overflow', 'stack-overflow'],
    ['Stack Auth', undefined],
    ['Front', 'front'],
    ['Frontend', undefined],
    ['Frontegg', 'frontegg'],
    ['Box', 'box'],
    ['Boxes', undefined],
    ['Dropbox', 'dropbox'],
    ['Segment', 'segment'],
    ['Segments', undefined],
    ['Square', 'square'],
    ['Squarespace', 'squarespace'],
    ['Ramp', 'ramp'],
    ['Ramp Network', undefined],
    ['Loom', 'loom'],
    ['Looker', 'looker'],
    ['Zoom', 'zoom'],
    ['ZoomInfo', 'zoominfo'],
    ['Mercury', 'mercury'],
    ['Mercurial', undefined],
    ['Brex', 'brex'],
    ['Brevo', 'brevo'],
    ['Plaid', 'plaid'],
    ['Plain', 'plain'],
    ['Groq', 'groq'],
    ['Grok', 'grok'],
    ['Claude', 'claude'],
    ['Clerk', 'clerk'],
    ['Clerky', 'clerky'],
    ['GitHub', 'github'],
    ['GitLab', 'gitlab'],
    ['Gitpod', 'gitpod'],
    ['Slack', 'slack'],
    ['Slite', 'slite'],
    ['Zapier', 'zapier'],
    ['Sage', 'sage'],
    ['Stage', undefined],
    ['Copilot', undefined],
    ['Microsoft Copilot', 'microsoft-copilot'],
    ['GitHub Copilot', 'github-copilot'],
    ['Twilio', 'twilio'],
    ['Twilio SendGrid', 'sendgrid'],
    // One word, two companies, so neither of them gets it.
    ['Runway', undefined],
    ['Lambda', undefined],
    ['Fathom', undefined],
    ['Luma', undefined],
    ['Apollo', undefined],
    ['Cube', undefined],
    ['Vault', undefined],
    ['Atlas', undefined],
    // Not ours to guess.
    ['HelpSync', undefined],
    ['Meridian', undefined],
  ]
  for (const [name, want] of each) assert.equal(idOf(name), want, name)
})

test('a monogram is the first letter or digit of the name', () => {
  assert.equal(monogramOf('HelpSync'), 'H')
  assert.equal(monogramOf('  ?? éclair'), 'É')
  assert.equal(monogramOf('1Password'), '1')
  assert.equal(monogramOf('???'), '·')
  assert.equal(monogramOf(undefined), '·')
})

test('every sample service resolves to its own logo, except the fictional one', () => {
  const vault = createSample(0)
  const titles = vault.pieces.filter((p) => p.kind === 'service').map((p) => p.title)
  assert.ok(titles.includes('HelpSync'))
  for (const title of titles) {
    const hit = find(title)
    if (title === 'HelpSync') assert.equal(hit, undefined)
    else assert.ok(hit?.svg, `${title} should have a logo`)
  }
})

test('every priced service in the catalog has a place in the list, and the list invents no prices', () => {
  for (const entry of CATALOG) assert.ok(find(entry.name), entry.name)
  for (const row of bundle.services) assert.equal(row.length, 8)
  assert.doesNotMatch(readFileSync('src/studio/logos/services.ts', 'utf8').split('const LIST')[1].split('`')[1], /\$|\bamount\b|\bprice\b/i)
  // The list adds names, and the catalog alone decides what's priced.
  for (const s of SERVICES) {
    const entry = [s.name, ...s.aliases].map(findInCatalog).find(Boolean)
    if (entry) assert.ok(CATALOG.includes(entry))
  }
})

test('logos never reach what an agent reads', () => {
  const vault = createSample(0)
  const owner = { id: '', name: 'Owner', key: '', gates: vault.gates.map((g) => g.id), remote: false, createdAt: 0 }
  const view = viewFor(vault, owner)
  for (const text of [llmsTxt(view, { kind: 'http', base: 'https://x.example' }), llmsFull(view)]) {
    assert.doesNotMatch(text, /<svg|data:image|logos\.bundle/)
  }
  const importers = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name)
      if (e.isDirectory()) return importers(path)
      return /\.tsx?$/.test(e.name) && /logos\//.test(readFileSync(path, 'utf8')) ? [path] : []
    })
  assert.deepEqual([...importers('src/core'), ...importers('src/server'), ...importers('src/cli')], [])
})

test('the licences and notices ship with the package', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { files: string[] }
  for (const f of ['dist', 'NOTICE.md', 'licenses', 'LICENSE']) assert.ok(pkg.files.includes(f), f)
  const notice = readFileSync('NOTICE.md', 'utf8')
  assert.match(notice, /trademarks of their owners/)
  assert.match(notice, /No endorsement/)
  assert.match(readFileSync('README.md', 'utf8'), /NOTICE\.md/)
  // The build copies the face's licence out of its package, and it has to be the OFL.
  const build = readFileSync('scripts/build-server.mjs', 'utf8')
  for (const font of ['@fontsource-variable/spline-sans-mono']) {
    assert.match(build, new RegExp(`${font}/LICENSE`))
    assert.match(readFileSync(`node_modules/${font}/LICENSE`, 'utf8'), /SIL OPEN FONT LICENSE/i)
  }
  const csv = readFileSync('licenses/logo-sources.csv', 'utf8').trim().split('\n')
  assert.equal(csv.length, SERVICES.length + 1)
  assert.match(csv[0], /^rank,id,name,domain,source,file,licence/)
  const withSource = csv.slice(1).filter((line) => /https?:/.test(line.split(',').slice(4).join(',')))
  assert.equal(withSource.length, logos.length, 'one source per logo')
  // Every logo says what licence it came under, and only ones that allow shipping it.
  const allowed = /(^|,)("None\. The owner's own file, shown to identify it"|CC0-1\.0|MIT|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|ISC|Unlicense|CC-BY-4\.0|CC-BY-3\.0),/
  for (const line of withSource) assert.match(line, allowed, line.slice(0, 120))
})
