// Writes the brand pack, brand/, from its sources: the mark from mark.js, the tokens and the interface from the app's
// own stylesheets, the face from the font the app ships, and the book from book.mjs. It also writes what the site takes
// from the pack (src/studio/site/mark-paths.ts, and the tab and touch icons in src/studio/public), so the two can't drift;
// test/brand.test.ts fails if they have.
//   npm run brand                      the pack
//   npm run brand -- --inline <file>   and the book as one self-contained HTML file, to send or publish
import { mkdir, writeFile, readFile, rm, copyFile, readdir } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { MARK, INK, PAPER, exportSvg, markParts, tiersData, constructionMarkdown, construction, motionAudit, compactPath, LINES, siteMarkPaths } from './mark.js'
import { readTokens, tokensCss, tokensJson } from './tokens.mjs'
import { book } from './book.mjs'

const BRAND = fileURLToPath(new URL('../', import.meta.url))
const REPO = resolve(BRAND, '..')
const at = (...p) => resolve(BRAND, ...p)
const rel = (p) => relative(BRAND, p).split('\\').join('/')
const written = []
async function put(path, body, meta = {}) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body)
  written.push({ path: rel(path), ...meta })
}

/* ---------- the mark ---------- */

// Each size is its own drawing, chosen by device pixels: a file per drawing, named by the size it is drawn for.
const SIZES = [
  [1024, 'L', 'the full sheet, for 256 device px and up'],
  [512, 'L', 'the full sheet, for 256 device px and up'],
  [180, 'M', 'L−, for 160–255 device px: the touch icon, a 96 pt icon at ×2'],
  [128, 'S', 'M, for 96–159 device px: a 64 px icon at ×2, a dock icon'],
  [64, 'SL', 'S, for 48–95 device px: a 32 px icon at ×2'],
  [32, 'XS', 'X, for 26–47 device px: the solid land, its crossing cut through'],
  [16, 'XXS', 'X·, for 16–25 device px: the solid land and the point'],
]
const KINDS = {
  light: 'on a light page: the paper tile with its ink hairline',
  dark: 'on a dark page: the paper tile alone',
  reverse: 'the reverse, paper lines on an ink tile',
  oneink: 'one ink: the tile in ink with the drawing knocked out, for print, stamps and lasers',
  bare: 'the drawing alone, no tile, in ink',
}
await rm(at('logo'), { recursive: true, force: true })
for (const [size, tier, drawing] of SIZES) {
  for (const kind of ['light', 'dark', 'reverse', 'oneink', ...(tier === 'L' || tier === 'S' ? ['bare'] : [])]) {
    const name = `locus-mark-${size}-${kind}`
    await put(at('logo/mark', `${name}.svg`), exportSvg(MARK, { size, tier, kind, id: name }), { group: 'mark', size, kind, use: `${drawing}; ${KINDS[kind]}` })
  }
}
for (const [size, tier] of [[1024, 'L'], [512, 'L'], [180, 'M']]) {
  const name = `locus-mark-${size}-draw`
  await put(at('logo/motion', `${name}.svg`), exportSvg(MARK, { size, tier, kind: 'light', id: name, draw: true }), { group: 'motion', size, use: 'the mark drawn in once by its own CSS, then still; reduced motion shows the still' })
}

/* ---------- type set as outlines: the lockups' word and the social card's lines ---------- */

const outlines = JSON.parse(await readFile(at('source/outlines.json'), 'utf8'))
const EM = outlines.unitsPerEm
/** A glyph's path (font units, y up) placed at origin (ox, baseline oy), scale k, as absolute commands. */
function placeGlyph(d, ox, oy, k) {
  const t = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) || []
  let i = 0
  let cmd = ''
  let x = 0
  let y = 0
  let out = ''
  const X = (v) => ox + v * k
  const Y = (v) => oy - v * k
  const n = (v) => String(Math.round(v * 1000) / 1000)
  while (i < t.length) {
    if (/[A-Za-z]/.test(t[i])) cmd = t[i++]
    if (cmd === 'Z' || cmd === 'z') {
      out += 'Z'
      continue
    }
    const take = (m) => t.slice(i, (i += m)).map(Number)
    if (cmd === 'M' || cmd === 'L') {
      ;[x, y] = take(2)
      out += `${cmd}${n(X(x))} ${n(Y(y))}`
      // A pair that follows a move without a letter of its own is a line, as SVG has it. fontTools writes 'A' as M2 0 473 1454.
      if (cmd === 'M') cmd = 'L'
    } else if (cmd === 'H') {
      ;[x] = take(1)
      out += `L${n(X(x))} ${n(Y(y))}`
    } else if (cmd === 'V') {
      ;[y] = take(1)
      out += `L${n(X(x))} ${n(Y(y))}`
    } else if (cmd === 'Q') {
      const [x1, y1, x2, y2] = take(4)
      out += `Q${n(X(x1))} ${n(Y(y1))} ${n(X(x2))} ${n(Y(y2))}`
      x = x2
      y = y2
    } else if (cmd === 'C') {
      const [x1, y1, x2, y2, x3, y3] = take(6)
      out += `C${n(X(x1))} ${n(Y(y1))} ${n(X(x2))} ${n(Y(y2))} ${n(X(x3))} ${n(Y(y3))}`
      x = x3
      y = y3
    } else throw new Error('path command ' + cmd)
  }
  return out
}
/** A line of text as one path: font size f, tracking in em, kerning as { pair: em }. Returns the path and its ink edges. */
function setText(text, x0, y, f, weight = 400, { track = 0, kern = {} } = {}) {
  const table = outlines.weights[String(weight)]
  const k = f / EM
  let ox = x0
  let d = ''
  let left = null
  let right = x0
  ;[...text].forEach((ch, i) => {
    const g = table[ch]
    if (!g) throw new Error(`No outline for ${JSON.stringify(ch)}`)
    if (i && kern[text[i - 1] + ch]) ox += kern[text[i - 1] + ch] * f
    if (g.d) d += placeGlyph(g.d, ox, y, k)
    if (g.box) {
      left ??= ox + g.box[0] * k
      right = ox + g.box[2] * k
    }
    ox += g.advance * k + track * f
  })
  return { d: compactPath(d), left: left ?? x0, right, end: ox, capTop: y - outlines.capInk * k }
}
// The logotype: Spline Sans Mono 540, tracking −0.01 em, L–o −0.06 em, u–s −0.01 em.
const WORD = { track: -0.01, kern: { Lo: -0.06, us: -0.01 } }
const word = (x0, y, f) => setText('Locus', x0, y, f, 540, WORD)
const r3 = (v) => Math.round(v * 1000) / 1000

/* ---------- the lockups ---------- */

const lockups = []
for (const kind of ['light', 'dark', 'oneink']) {
  for (const [variant, tier, size, cssM] of [['', 'S', 128, 128], ['-small', 'SL', 52, 26]]) {
    const fill = kind === 'dark' ? PAPER : INK
    for (const shape of ['horizontal', 'stacked']) {
      const name = `locus-lockup-${shape}-${kind}${variant}`
      const mark = markParts(MARK, { size, tier, kind, id: name })
      let W, H, markG, geo
      let wordD
      if (shape === 'horizontal') {
        // The word at cap = ½ M, caps centred on the tile (cap top 25, baseline 75), the L's stem 0.4 M from the tile.
        const f = (50 * EM) / outlines.capInk
        const probe = word(0, 0, f)
        const w = word(140 - probe.left, 75, f)
        W = w.right
        H = 100
        markG = mark.body
        wordD = w.d
        geo = { capTop: r3(w.capTop), baseline: 75, stemFromTile: r3(w.left - 100) }
      } else {
        // Stacked: the word at 0.4 M, its caps 0.25 M under the tile, both centred.
        const f = 40
        const probe = word(0, 0, f)
        const iw = probe.right - probe.left
        W = Math.max(100, iw)
        const capH = (outlines.capInk * f) / EM
        const baseline = 125 + capH
        const w = word((W - iw) / 2 - probe.left, baseline, f)
        H = baseline
        const tx = (W - 100) / 2
        markG = tx ? `<g transform="translate(${r3(tx)} 0)">${mark.body}</g>` : mark.body
        wordD = w.d
        geo = { capTop: r3(w.capTop), baseline: r3(baseline) }
      }
      const s = cssM / 100
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r3(W)} ${r3(H)}" width="${r3(W * s)}" height="${r3(H * s)}">${mark.defs ? `<defs>${mark.defs}</defs>` : ''}${markG}<path d="${wordD}" fill="${fill}"/></svg>\n`
      const ground = kind === 'dark' ? 'a dark page' : kind === 'oneink' ? 'print, in one ink' : 'a light page'
      await put(at('logo/lockup', `${name}.svg`), svg, { group: 'lockup', shape, kind, use: `${shape} lockup for ${ground}, ${variant ? 'drawn for a 26 px mark (a site header)' : 'drawn for a mark of 48 css px and up'}` })
      lockups.push({ name, shape, kind, small: !!variant, W: r3(W), H: r3(H), cssM, ...geo })
    }
  }
}

/* ---------- PNGs, the ICO, the social card ---------- */

const png = (svg, width) => Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } }).render().asPng())
const ico = []
const icon = async (name, svg, size, use) => {
  const buf = png(svg, size)
  await put(at('logo/icon', name), buf, { group: 'icon', size, use })
  return buf
}
// The tab icon, frame by frame: X· at 16 (its hole hinted onto whole pixels 9–10 × 8–9), Col-X at 32, S at 48.
ico.push([16, await icon('favicon-16.png', exportSvg(MARK, { size: 16, tier: 'XXS', kind: 'light', pointAt: [10, 9], id: 'f16' }), 16, 'the tab icon at ×1')])
ico.push([32, await icon('favicon-32.png', exportSvg(MARK, { size: 32, tier: 'XS', kind: 'light', id: 'f32' }), 32, 'the tab icon at ×2')])
ico.push([48, await icon('favicon-48.png', exportSvg(MARK, { size: 48, tier: 'SL', kind: 'light', id: 'f48' }), 48, 'the tab icon at ×3, Windows')])
{
  const head = Buffer.alloc(6 + 16 * ico.length)
  head.writeUInt16LE(0, 0)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(ico.length, 4)
  let offset = head.length
  ico.forEach(([size, data], i) => {
    const e = 6 + 16 * i
    head.writeUInt8(size, e)
    head.writeUInt8(size, e + 1)
    head.writeUInt16LE(1, e + 4)
    head.writeUInt16LE(32, e + 6)
    head.writeUInt32LE(data.length, e + 8)
    head.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  await put(at('logo/icon/favicon.ico'), Buffer.concat([head, ...ico.map(([, d]) => d)]), { group: 'icon', use: 'the tab icon: 16, 32 and 48 px frames, so each screen gets its own drawing' })
}
await put(at('logo/icon/favicon.svg'), exportSvg(MARK, { size: 32, tier: 'XS', kind: 'light', id: 'locus-favicon' }), { group: 'icon', use: 'Col-X as SVG, for uses drawn at 26–47 device px; not the tab icon' })
await icon('apple-touch-icon.png', exportSvg(MARK, { size: 180, tier: 'M', kind: 'square', id: 'touch' }), 180, 'the iOS home-screen icon: full bleed and opaque, iOS rounds it')
await icon('icon-192.png', exportSvg(MARK, { size: 192, tier: 'M', kind: 'light', id: 'i192' }), 192, 'a web app manifest icon, purpose any')
await icon('icon-512.png', exportSvg(MARK, { size: 512, tier: 'L', kind: 'light', id: 'i512' }), 512, 'a web app manifest icon, purpose any')
await icon('icon-512-maskable.png', exportSvg(MARK, { size: 512, tier: 'L', kind: 'square', id: 'i512m' }), 512, 'a web app manifest icon, purpose maskable: the form inside the safe zone')

/** The 1200 × 630 card a link unfurls to: the mark, the name, what it is. */
function socialCard(theme) {
  const W = 1200
  const H = 630
  const page = theme === 'dark' ? '#11171e' : '#f3f5f6'
  const ink = theme === 'dark' ? '#e8e6df' : INK
  const soft = theme === 'dark' ? 'rgba(232,230,223,0.62)' : 'rgba(21,25,30,0.62)'
  const grid = theme === 'dark' ? 'rgba(232,230,223,0.045)' : 'rgba(21,25,30,0.055)'
  const M = 300
  const mx = 104
  const my = (H - M) / 2
  const mark = markParts(MARK, { size: M, tier: 'M', kind: theme === 'dark' ? 'dark' : 'light', id: `card-${theme}` })
  const tx = mx + M + 72
  const wf = (64 * EM) / outlines.capInk // the name's caps 64 px tall
  const name = word(tx - word(0, 0, wf).left, 214, wf)
  const l1 = setText('A map of your company', tx, 318, 40, 400, { track: -0.03 })
  const l2 = setText('that any agent can read.', tx, 372, 40, 400, { track: -0.03 })
  const l3 = setText('Encrypted, gated, open source.', tx, 452, 22, 400)
  let lines = ''
  for (let x = 60; x < W; x += 60) lines += `M${x} 0V${H}`
  for (let y = 15; y < H; y += 60) lines += `M0 ${y}H${W}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${mark.defs}</defs><rect width="${W}" height="${H}" fill="${page}"/><path d="${lines}" stroke="${grid}" stroke-width="1"/><g transform="translate(${mx} ${my}) scale(${M / 100})">${mark.body}</g><path d="${name.d}" fill="${ink}"/><path d="${l1.d}${l2.d}" fill="${ink}"/><path d="${l3.d}" fill="${soft}"/></svg>`
}
for (const theme of ['light', 'dark']) {
  const svg = socialCard(theme)
  await put(at('logo/social', `locus-social-${theme}.png`), png(svg, 1200), { group: 'social', use: `the 1200 × 630 link card (og:image), ${theme}` })
}

/* ---------- data and the construction sheet ---------- */

const tiers = tiersData(MARK)
await put(at('logo/tiers.json'), JSON.stringify(tiers, null, 1) + '\n', { group: 'data', use: 'every drawing’s geometry, colours and widths, and the drawing’s score, for code' })
const logoFiles = () => written.filter((f) => f.path.startsWith('logo/')).map((f) => [f.path.replace(/^logo\//, ''), f.use])
await put(at('logo/CONSTRUCTION.md'), constructionMarkdown(MARK, { files: [...logoFiles(), ['CONSTRUCTION.md', 'this sheet']] }), { group: 'data', use: 'the rules the mark is built by' })

/* ---------- the face ---------- */

const FONT = resolve(REPO, 'node_modules/@fontsource-variable/spline-sans-mono')
const faces = [
  ['spline-sans-mono-latin-ext-wght-normal.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'],
  ['spline-sans-mono-latin-wght-normal.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
]
await rm(at('fonts'), { recursive: true, force: true })
for (const [f] of faces) {
  await mkdir(at('fonts'), { recursive: true })
  await copyFile(resolve(FONT, 'files', f), at('fonts', f))
  written.push({ path: `fonts/${f}`, group: 'font', use: 'Spline Sans Mono, variable weight 300–700' })
}
await put(at('fonts/OFL.txt'), await readFile(resolve(FONT, 'LICENSE')), { group: 'font', use: 'the face’s licence, the SIL Open Font License 1.1: it travels with the files' })
await put(
  at('fonts/fonts.css'),
  `/* Spline Sans Mono, variable weight 300–700: the one face, as the app loads it (from @fontsource-variable/spline-sans-mono). */\n` +
    faces.map(([f, range]) => `@font-face {\n  font-family: 'Spline Sans Mono Variable';\n  font-style: normal;\n  font-display: swap;\n  font-weight: 300 700;\n  src: url(./${f}) format('woff2-variations');\n  unicode-range: ${range};\n}\n`).join('\n'),
  { group: 'font', use: 'the @font-face rules; the family is named once, as --sans in tokens.css' },
)

/* ---------- tokens and the interface ---------- */

const STYLES = resolve(REPO, 'src/studio/styles.css')
const SITE = resolve(REPO, 'src/studio/site/site.css')
const stylesCss = await readFile(STYLES, 'utf8')
const siteCss = await readFile(SITE, 'utf8')
const tokens = readTokens(stylesCss, siteCss)
await put(at('tokens/tokens.css'), tokensCss(tokens), { group: 'tokens', use: 'every colour, the face, radii, shadows and easing as CSS custom properties, light and dark' })
await put(at('tokens/tokens.json'), tokensJson(tokens), { group: 'tokens', use: 'the same, as Design Tokens Community Group JSON, with each one’s meaning' })
await rm(at('ui'), { recursive: true, force: true })
await put(at('ui/styles.css'), stylesCss, { group: 'ui', use: 'a copy of src/studio/styles.css, the Studio’s stylesheet: every component’s real rules' })
await put(at('ui/site.css'), siteCss, { group: 'ui', use: 'a copy of src/studio/site/site.css, the website’s stylesheet' })
for (const f of ['map.png', 'seal.png', 'towns.png']) {
  await mkdir(at('ui/screens'), { recursive: true })
  await copyFile(resolve(REPO, 'docs/images', f), at('ui/screens', f))
  written.push({ path: `ui/screens/${f}`, group: 'ui', use: 'the Studio, as the README shows it' })
}

/* ---------- what the site takes from the pack ---------- */

{
  await writeFile(resolve(REPO, 'src/studio/site/mark-paths.ts'), siteMarkPaths(tiers))
  await copyFile(at('logo/icon/favicon.ico'), resolve(REPO, 'src/studio/public/favicon.ico'))
  await copyFile(at('logo/icon/apple-touch-icon.png'), resolve(REPO, 'src/studio/public/apple-touch-icon.png'))
  // The card a link to the site unfurls to. The host makes its address absolute when it serves the page.
  await copyFile(at('logo/social/locus-social-light.png'), resolve(REPO, 'src/studio/public/social.png'))
}

/* ---------- the manifest, and the book ---------- */

const score = MARK.score('L', 1024)
const manifest = {
  $description: 'The Locus brand pack. Written by brand/source/build.mjs; README.md says the same for people. Paths are relative to this file.',
  name: 'Locus',
  meaning: 'Latin for “place”: the spot on a map where something is.',
  tagline: 'A map of your company that any agent can read.',
  description: 'A map of your company that any agent can read. Encrypted, gated, open source.',
  names: {
    product: 'Locus, with a capital L, in running text as in the lockup.',
    package: 'locus-harness on npm; the command it installs is locus.',
    never: 'npx locus: that name on npm belongs to someone else. Write npx -y locus-harness.',
  },
  book: 'index.html',
  rules: [
    'Never redraw, trace, recolour, stretch, rotate or add effects to the mark. Take a file from logo/.',
    'Each size is its own drawing: use the file drawn for the size you need (by device pixels), never a large one scaled down.',
    'Black lines on a white tile, on every page. On a light page use the light files (they carry a 1 device px hairline); on a dark page, the dark ones.',
    'The mark is ink and paper only. Vermilion means sealed, amber urgent and blue live, and none of them ever enters the mark.',
    'Clear space is half the mark’s height on every side. The smallest mark is 16 px; the smallest lockup has a 20 px mark.',
    'One face, Spline Sans Mono. Hierarchy comes from size, weight, case and ink, never a second family.',
    'The mark’s only motion is being drawn once (logo/motion/). Nothing loops, glows or bounces.',
  ],
  colour: Object.fromEntries(tokens.filter((t) => t.type === 'color' || t.type === 'rgb').map((t) => [t.name, { light: t.value, dark: t.dark, means: t.meaning, css: `var(--${t.name})` }])),
  type: {
    face: 'Spline Sans Mono',
    family: "'Spline Sans Mono Variable', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    files: 'fonts/',
    licence: 'fonts/OFL.txt',
    weights: { 400: 'text and headings', 500: 'labels, a name, a button that matters', 540: 'the logotype' },
    scale: { 12: 'meta, eyebrows (upper case, +0.08 em)', 13: 'controls and body in the Studio', 14: 'reading', 15: 'body on the website', 16: 'a lede in the Studio', 17: 'a lede on the website', 19: 'titles', 24: 'a sheet’s heading', '24–32': 'a section’s heading on the website', '34–56': 'the website’s headline (−0.04 em)' },
    advance: 'Monospaced: every character is 0.6 em wide.',
  },
  motion: { mark: { total: Math.round(score.total * 100) / 100, files: 'logo/motion/', score: 'logo/tiers.json → tiers[].draw' }, easing: { out: 'var(--ease-out)', drawer: 'var(--ease-drawer)' } },
  files: written.filter((f) => f.use).map(({ path, group, use, size, kind }) => ({ path, group, use, ...(size ? { size } : {}), ...(kind ? { kind } : {}) })),
}
await put(at('brand.json'), JSON.stringify(manifest, null, 2) + '\n')

const html = book({ mark: MARK, score, construction: construction(MARK), lines: LINES, tokens, files: manifest.files, lockups, heroes: {
  a: exportSvg(MARK, { size: 512, tier: 'L', kind: 'light', id: 'hero-a', draw: true }),
  b: exportSvg(MARK, { size: 1024, tier: 'L', kind: 'light', id: 'hero-b', draw: true }),
} })
await writeFile(at('index.html'), html)

/* ---------- checks, and the book as one file ---------- */

for (const px of [512, 180]) {
  const a = motionAudit(MARK, px)
  const slow = Math.max(...a.rows.map((r) => r.slow))
  console.log(`drawing at ${px} px: ${a.total} s, at most ${a.maxMoving} pens at once, at most ${slow} frames of a pen under 0.5 px`)
}
const count = (await readdir(at('logo'), { recursive: true })).filter((f) => /\.\w+$/.test(f)).length
console.log(`brand/: ${count} logo files, ${tokens.length} tokens, the book (${Math.round(html.length / 1024)} KB)`)

const i = process.argv.indexOf('--inline')
if (i > 0) {
  const out = resolve(process.argv[i + 1])
  const uri = async (p) => {
    const buf = await readFile(at(p))
    return p.endsWith('.svg') ? 'data:image/svg+xml,' + encodeURIComponent(buf.toString('utf8')).replace(/'/g, '%27') : `data:${p.endsWith('.png') ? 'image/png' : p.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream'};base64,${buf.toString('base64')}`
  }
  let one = html
  for (const [, href] of [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)]) {
    let css = await readFile(at(href), 'utf8')
    for (const [m, f] of [...css.matchAll(/url\(\.\/([^)]+)\)/g)]) css = css.replace(m, `url(${await uri(dirname(href) + '/' + f)})`)
    one = one.replace(`<link rel="stylesheet" href="${href}">`, () => `<style>\n${css}\n</style>`)
  }
  for (const src of new Set([...one.matchAll(/(?:src|href)="((?:logo|ui|fonts)\/[^"]+\.(?:svg|png))"/g)].map((m) => m[1]))) {
    const u = await uri(src)
    one = one.split(`"${src}"`).join(`"${u}"`)
  }
  await writeFile(out, one)
  console.log(`one file: ${out} (${Math.round(one.length / 1024)} KB)`)
}
