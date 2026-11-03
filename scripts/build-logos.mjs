// Builds the logo bundle: src/studio/logos/logos.bundle.json, and the record of where each logo came from.
//
// The bundle is vendored, so nobody needs this script to build or run Vadere. It's here to show how the
// file was made and to remake it. Nothing it needs is a dependency of this repo:
//
//   mkdir sources tools
//   # Each pack goes in sources/<pack>, as listed in PACKS below. Downloads are untrusted data: this script
//   # only reads them as text, and they're never installed, imported or run.
//   (cd tools && npm init -y && npm install --ignore-scripts svgo@4 playwright)
//   node --experimental-strip-types scripts/build-logos.mjs --sources sources --tools tools [--report some/folder]
//
// What it does, for each service in src/studio/logos/services.ts:
//   1. Finds candidates by exact name, alias or slug in each pack. Fuzzy matching is never used, because a
//      wrong logo is worse than none. Where a pack gives the brand's URL, that has to agree with the
//      service's domain.
//   2. Refuses any file whose own licence doesn't allow shipping it in an open-source project.
//   3. Sanitises against an allowlist (see `sanitise`), then optimises with SVGO.
//   4. Renders each one in Chrome with the network off, to find its real ink box, its colours and whether
//      it's already a full square, and re-frames it so the mark sits centred with no padding.
//   5. Takes the best candidate: a full-colour square mark first, a one-colour mark in its brand colour
//      next, and never a wordmark. scripts/logo-picks.json holds what a person decided after looking at
//      every logo on a contact sheet: a better file, a crop to a lockup's symbol, a tile colour, or "no logo".
//
// Packs as downloaded for the bundle in this repo (npm tarball or GitHub tarball of this commit):
//   gilbarbara/logos 22f03ffc4a65, simple-icons 16.36.0, @lobehub/icons-static-svg 1.102.0, pheralb/svgl c0ec7ab12135,
//   glincker/thesvg 32a228fad39a, homarr-labs/dashboard-icons 83f32e08257b, selfhst/icons 8ea63b2cc92d, devicons/devicon 32fe1d3b3f36.
// sources/official/ holds files saved by hand from companies' own sites, with a manifest.json of where each came from.
// --no-official builds without them, and --strip-official removes them from the bundle without any downloads.
//
// Brand marks are trademarks of their owners whatever a pack's licence says. See NOTICE.md.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SERVICES } from '../src/studio/logos/services.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map(process.argv.slice(2).flatMap((a, i, all) => (a.startsWith('--') ? [[a.slice(2), all[i + 1]]] : [])))

// Takes the logos that came from companies' own sites out of the vendored bundle, leaving those services as monograms.
// It needs no downloads and no tools, so that decision can be made at any time: node --experimental-strip-types scripts/build-logos.mjs --strip-official
if (process.argv.includes('--strip-official')) {
  const bundlePath = join(ROOT, 'src/studio/logos/logos.bundle.json')
  const csvPath = join(ROOT, 'licenses/logo-sources.csv')
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'))
  const lines = readFileSync(csvPath, 'utf8').trim().split('\n')
  const official = new Set(lines.filter((l) => l.includes("None. The owner's own file")).map((l) => l.split(',')[1]))
  for (const row of bundle.services) {
    if (official.has(row[0])) {
      row[5] = null
      row[6] = null
      row[7] = 0
    }
  }
  writeFileSync(bundlePath, JSON.stringify(bundle))
  writeFileSync(csvPath, lines.map((l) => (l.includes("None. The owner's own file") ? `${l.split(',').slice(0, 4).join(',')},,,,,monogram: removed with --strip-official` : l)).join('\n') + '\n')
  console.log(`Removed ${official.size} logos that came from companies' own sites.`)
  process.exit(0)
}

const SOURCES = args.get('sources')
const TOOLS = args.get('tools')
if (!SOURCES || !TOOLS) throw new Error('Usage: node scripts/build-logos.mjs --sources <dir> --tools <dir> [--report <dir>]')
const REPORT = args.get('report')
const NO_OFFICIAL = process.argv.includes('--no-official')

const OUT_BUNDLE = join(ROOT, 'src/studio/logos/logos.bundle.json')
const OUT_CSV = join(ROOT, 'licenses/logo-sources.csv')

/** Past this a logo is too heavy for what it does. */
export const MAX_LOGO_BYTES = 9_000
/** Wider than this is a wordmark squashed into a square, and it can't be read at 20px. */
const MAX_ASPECT = 2.2

const PACKS = {
  gilbarbara: { dir: 'gilbarbara_logos', url: 'https://github.com/gilbarbara/logos', licence: 'CC0-1.0' },
  simpleicons: { dir: 'simple-icons', url: 'https://github.com/simple-icons/simple-icons', licence: 'CC0-1.0' },
  lobe: { dir: 'lobe', url: 'https://github.com/lobehub/lobe-icons', licence: 'MIT' },
  svgl: { dir: 'pheralb_svgl', url: 'https://github.com/pheralb/svgl', licence: 'MIT' },
  thesvg: { dir: 'glincker_thesvg', url: 'https://github.com/glincker/thesvg', licence: 'per icon' },
  dashboard: { dir: 'homarr-labs_dashboard-icons', url: 'https://github.com/homarr-labs/dashboard-icons', licence: 'Apache-2.0' },
  selfhst: { dir: 'selfhst_icons', url: 'https://github.com/selfhst/icons', licence: 'CC-BY-4.0' },
  devicon: { dir: 'devicons_devicon', url: 'https://github.com/devicons/devicon', licence: 'MIT' },
  // The last resort: the company's own file, from its own site, for services no open pack has. No licence comes with
  // these. They're here for the same reason a directory shows a logo, and --no-official builds without them.
  official: { dir: 'official', url: '', licence: 'owner' },
}

// A file's own licence has to let us ship a changed copy in an MIT project. No-derivatives, share-alike,
// non-commercial, copyleft and "trademark, used under fair use" entries all fall out here.
const ALLOWED_LICENCES = new Set(['CC0-1.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC-BY-4.0', 'CC-BY-3.0'])

const req = createRequire(join(resolve(TOOLS), 'package.json'))
const { optimize } = req('svgo')
const { chromium } = await import(pathToFileURL(req.resolve('playwright')).href).then((m) => m.default ?? m)

const picks = JSON.parse(readFileSync(join(ROOT, 'scripts/logo-picks.json'), 'utf8'))
const dir = (pack) => join(SOURCES, PACKS[pack].dir)
const read = (path) => readFileSync(path, 'utf8')
const key = (s) => s.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '')

function hostOf(url) {
  try {
    return new URL(url.includes('//') ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** The domain a company really owns: foo.co.uk, or bar.com out of a.b.bar.com. */
function registrable(host) {
  const parts = host.split('.')
  if (parts.length <= 2) return host
  const two = parts.slice(-2).join('.')
  return /^(co|com|org|net|ac)\.[a-z]{2}$/.test(two) ? parts.slice(-3).join('.') : two
}

/** True if a pack's URL for a brand is plainly the same company as the service's domain. */
function sameCompany(serviceDomain, url) {
  const a = registrable(hostOf(serviceDomain))
  const b = registrable(hostOf(url))
  if (!b) return false
  if (a === b) return true
  // notion.so and notion.com, zoom.us and zoom.com.
  return a.split('.')[0] === b.split('.')[0]
}

// Reading each pack's index. All of this is parsing text. Nothing from a pack is ever evaluated.

const theSvgLicences = new Map()

function indexPacks() {
  const entries = []
  const add = (pack, names, file, extra = {}) => entries.push({ pack, keys: new Set(names.filter(Boolean).map(key)), file, ...extra })

  for (const b of JSON.parse(read(join(dir('gilbarbara'), 'logos.json')))) {
    const icon = b.files.find((f) => f.endsWith('-icon.svg'))
    const plain = b.files.find((f) => f === `${b.shortname}.svg`) ?? b.files[0]
    if (icon) add('gilbarbara', [b.name, b.shortname], `logos/${icon}`, { url: b.url, tier: 10 })
    if (plain && plain !== icon) add('gilbarbara', [b.name, b.shortname], `logos/${plain}`, { url: b.url, tier: 18 })
  }

  for (const i of JSON.parse(read(join(dir('simpleicons'), 'data/simple-icons.json')))) {
    const slug = i.slug ?? siSlug(i.title)
    const licence = typeof i.license === 'object' && i.license ? i.license.type : 'CC0-1.0'
    add('simpleicons', [i.title, slug, ...(i.aliases?.aka ?? [])], `icons/${slug}.svg`, { url: i.source, hex: `#${i.hex}`, tier: 30, licence, weakUrl: true })
  }

  for (const f of readdirSync(join(dir('lobe'), 'icons'))) {
    if (!f.endsWith('.svg')) continue
    const m = f.match(/^(.+?)(-color|-text|-brand|-text-cn|-brand-color)?\.svg$/)
    if (!m || (m[2] && m[2] !== '-color')) continue
    add('lobe', [m[1]], `icons/${f}`, { tier: m[2] ? 14 : 32 })
  }

  // svgl's list is a TypeScript file. It gets split on its fields, and it's never run.
  const svgl = read(join(dir('svgl'), 'src/data/svgs.ts'))
  for (const chunk of svgl.split(/\n\s*\{\s*\n?\s*title:/).slice(1)) {
    const str = (re) => chunk.match(re)?.[1]
    const title = str(/^\s*["'`]([^"'`]+)["'`]/)
    const sub = str(/subTitle:\s*["'`]([^"'`]+)/)
    const url = str(/\burl:\s*["'`]([^"'`]+)/)
    const route = str(/route:\s*["'`]([^"'`]+)/) ?? str(/route:\s*\{[^}]*?light:\s*["'`]([^"'`]+)/)
    if (!title || !route || /mono/i.test(sub ?? '')) continue
    add('svgl', [title], `static${route}`, { url, tier: 13 })
  }

  for (const i of JSON.parse(read(join(dir('thesvg'), 'src/data/icons.json')))) {
    // Other collections are product icons. They're only for hand picks, but their licences still have to be on record.
    for (const f of Object.values(i.variants ?? {})) theSvgLicences.set(`public${f}`, i.license)
    if (i.collection && i.collection !== 'brands') continue
    const names = [i.title, i.slug, ...(i.aliases ?? [])]
    const extra = { url: i.url, hex: i.hex ? `#${i.hex}` : undefined, licence: i.license }
    if (i.variants?.color) add('thesvg', names, `public${i.variants.color}`, { ...extra, tier: 12 })
    if (i.variants?.default && i.variants.default !== i.variants.color) add('thesvg', names, `public${i.variants.default}`, { ...extra, tier: 16 })
  }

  const dash = JSON.parse(read(join(dir('dashboard'), 'metadata.json')))
  for (const [k, m] of Object.entries(dash)) {
    if (m.base === 'svg' || existsSync(join(dir('dashboard'), 'svg', `${k}.svg`))) add('dashboard', [k, ...(m.aliases ?? [])], `svg/${k}.svg`, { tier: 20 })
  }

  for (const i of JSON.parse(read(join(dir('selfhst'), 'index.json')))) {
    if (i.SVG === 'Yes') add('selfhst', [i.Name, i.Reference], `svg/${i.Reference}.svg`, { tier: 22 })
  }

  for (const i of JSON.parse(read(join(dir('devicon'), 'devicon.json')))) {
    const v = i.versions?.svg ?? []
    const best = v.includes('original') ? 'original' : v.includes('plain') ? 'plain' : null
    if (best) add('devicon', [i.name, ...(i.altnames ?? [])], `icons/${i.name}/${i.name}-${best}.svg`, { tier: 24, hex: i.color })
  }

  if (!NO_OFFICIAL) {
    const manifest = JSON.parse(read(join(dir('official'), 'manifest.json')))
    for (const [id, o] of Object.entries(manifest)) {
      if (o.skip) continue
      entries.push({ pack: 'official', keys: new Set([key(id)]), file: `${id}.svg`, url: o.url, tier: 15, ownSite: true })
    }
  }

  const byKey = new Map()
  for (const e of entries) {
    for (const k of e.keys) {
      if (!byKey.has(k)) byKey.set(k, [])
      byKey.get(k).push(e)
    }
  }
  return byKey
}

function siSlug(title) {
  return title
    .replace(/\+/g, 'plus')
    .replace(/\./g, 'dot')
    .replace(/&/g, 'and')
    .replace(/đ/g, 'd')
    .replace(/ħ/g, 'h')
    .replace(/ı/g, 'i')
    .replace(/ĸ/g, 'k')
    .replace(/ŀ/g, 'l')
    .replace(/ł/g, 'l')
    .replace(/ß/g, 'ss')
    .replace(/ŧ/g, 't')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Sanitising. An allowlist, so anything new or strange falls out rather than through.

export const ALLOWED_ELEMENTS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'use'])
export const ALLOWED_ATTRS = new Set([
  'xmlns', 'viewBox', 'width', 'height', 'id', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr', 'points', 'transform',
  'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset',
  'opacity', 'clip-path', 'clip-rule', 'mask', 'mask-type', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'offset', 'stop-color', 'stop-opacity', 'maskUnits', 'maskContentUnits', 'clipPathUnits', 'href',
])
// Elements that draw nothing on their own, or nothing we need, and go quietly.
const DROP_QUIETLY = new Set(['title', 'desc', 'metadata', 'filter', 'style', 'script', 'foreignObject', 'a', 'switch', 'animate', 'animateTransform', 'set', 'pattern', 'symbol', 'marker', 'cursor', 'view', 'font', 'font-face', 'audio', 'video', 'iframe', 'canvas', 'handler', 'listener'])
// A logo that depends on these can't be trusted to draw the same without them.
const REFUSE = new Set(['image', 'text', 'tspan', 'textPath'])

function allowlist(state) {
  return {
    name: 'vadereAllowlist',
    fn: () => ({
      element: {
        enter(node, parent) {
          const remove = () => (parent.children = parent.children.filter((c) => c !== node))
          if (REFUSE.has(node.name)) {
            state.refused = `uses <${node.name}>`
            return remove()
          }
          if (!ALLOWED_ELEMENTS.has(node.name)) {
            if (!DROP_QUIETLY.has(node.name) && !node.name.includes(':')) state.dropped.add(node.name)
            return remove()
          }
          for (const name of Object.keys(node.attributes)) {
            const value = String(node.attributes[name])
            if (name === 'xlink:href') {
              node.attributes.href = value
              delete node.attributes[name]
              continue
            }
            const ok = ALLOWED_ATTRS.has(name) && !/^on/i.test(name)
            const external = /(javascript:|data:|https?:|\/\/|expression\(|@import)/i.test(value) && name !== 'xmlns'
            const foreignUrl = /url\(/i.test(value) && !/^\s*url\(\s*["']?#[^)"']+["']?\s*\)\s*$/.test(value)
            if (!ok || external || foreignUrl) delete node.attributes[name]
            if (name === 'href' && !value.startsWith('#')) delete node.attributes[name]
          }
          if (node.name === 'use' && !node.attributes.href) remove()
        },
      },
    }),
  }
}

/** The same checks the test makes of the shipped bundle, so a bad logo fails here first. */
function looksClean(svg) {
  if (/<!|<\?|&(?!amp;|lt;|gt;|quot;|apos;)/.test(svg)) return false
  for (const [, name] of svg.matchAll(/<([a-zA-Z][^\s/>]*)/g)) if (!ALLOWED_ELEMENTS.has(name)) return false
  for (const [, name] of svg.matchAll(/\s([a-zA-Z_:][^\s=]*)=/g)) if (!ALLOWED_ATTRS.has(name)) return false
  return !/javascript:|data:|https?:(?!\/\/www\.w3\.org\/2000\/svg)/i.test(svg)
}

function sanitise(raw, hex, { keepPathsApart = false } = {}) {
  const state = { refused: null, dropped: new Set() }
  let text = raw.replace(/^﻿/, '')
  if (text.length > 400_000) return { refused: 'too large to bother with' }
  const box = text.match(/<svg[^>]*\sviewBox=["']([^"']+)["']/i)?.[1]
  const nums = box?.trim().split(/[\s,]+/).map(Number)
  let size = nums?.length === 4 ? Math.max(nums[2], nums[3]) : 0
  if (!size) {
    const w = parseFloat(text.match(/<svg[^>]*\swidth=["']([\d.]+)/i)?.[1] ?? '')
    const h = parseFloat(text.match(/<svg[^>]*\sheight=["']([\d.]+)/i)?.[1] ?? '')
    if (!w || !h) return { refused: 'no size' }
    size = Math.max(w, h)
    text = text.replace(/<svg/i, `<svg viewBox="0 0 ${w} ${h}"`)
  }
  const floatPrecision = size <= 30 ? 2 : size <= 300 ? 1 : 0
  text = text.replace(/style="mask-type:\s*(alpha|luminance)"/g, 'mask-type="$1"')
  let out
  try {
    out = optimize(text, {
      multipass: true,
      floatPrecision,
      plugins: [
        // onlyMatchedOnce off, or a class used twice keeps its style sheet, the sheet gets dropped, and the mark turns black.
        { name: 'preset-default', params: { overrides: { inlineStyles: { onlyMatchedOnce: false }, cleanupIds: { minify: true }, ...(keepPathsApart ? { mergePaths: false, collapseGroups: false } : {}) } } },
        'convertStyleToAttrs',
        'removeDimensions',
        'removeXlink',
        'sortAttrs',
        allowlist(state),
        'removeUselessDefs',
        'removeEmptyContainers',
      ],
    }).data
  } catch {
    return { refused: 'would not parse' }
  }
  if (state.refused) return { refused: state.refused }
  if (hex) out = recolourMonoDefault(out, hex)
  // A root of fill="none" over paths with no fill of their own draws nothing unless a page's CSS colours it.
  if (!/<(?!svg)[^>]*\b(fill|stroke)="/.test(out)) out = out.replace(/(<svg[^>]*?)\sfill="none"/, `$1 fill="${hex ?? '#000'}"`)
  // currentColor means nothing here, because a logo is drawn as an image.
  out = out.replace(/currentColor/gi, hex ?? '#000')
  if (!/<(path|circle|ellipse|rect|line|polyline|polygon|use)\b/.test(out)) return { refused: 'draws nothing' }
  if (!looksClean(out)) return { refused: 'failed the clean check' }
  return { svg: out, dropped: [...state.dropped] }
}

/** A mark with no colours of its own is black by default. Give it its brand colour. */
function recolourMonoDefault(svg, hex) {
  if (/\b(fill|stroke)="(?!none)/.test(svg)) return svg
  return svg.replace(/<svg\b[^>]*>/, (root) => root.replace(/\sfill="none"/, '').replace('<svg', `<svg fill="${hex}"`))
}

/** Forces a one-colour mark to one colour, for when its own is unreadable on a white tile. */
function recolourMono(svg, colour) {
  let out = svg
    .replace(/\bfill="(?!none|url)[^"]*"/g, `fill="${colour}"`)
    .replace(/\bstroke="(?!none|url)[^"]*"/g, `stroke="${colour}"`)
  if (!/\bfill="/.test(out.slice(0, out.indexOf('>')))) out = out.replace(/<svg/, `<svg fill="${colour}"`)
  return out
}

/** Sets the root's frame. The size attributes are there because Firefox won't draw an SVG on a canvas without them. */
function frame(svg, viewBox, px = 64) {
  return svg.replace(/<svg\b[^>]*>/, (root) => {
    const kept = root
      .replace(/\s(viewBox|width|height)="[^"]*"/g, '')
      .replace(/^<svg/, `<svg width="${px}" height="${px}" viewBox="${viewBox}"`)
    return kept
  })
}

const round = (n) => +n.toFixed(2)
const luminance = ([r, g, b]) => {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

// Rendering, in real Chrome with the network off.

async function measureAll(items) {
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await (await browser.newContext()).newPage()
  await page.route('**/*', (r) => r.abort())
  const out = []
  for (let i = 0; i < items.length; i += 150) {
    const batch = items.slice(i, i + 150)
    out.push(
      ...(await page.evaluate(async (svgs) => {
        const S = 256
        const canvas = document.createElement('canvas')
        canvas.width = S
        canvas.height = S
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        const results = []
        for (const svg of svgs) {
          const m = svg.match(/viewBox="([^"]+)"/)
          const vb = m ? m[1].trim().split(/[\s,]+/).map(Number) : null
          if (!vb || vb.length !== 4 || !(vb[2] > 0) || !(vb[3] > 0)) {
            results.push({ error: 'bad viewBox' })
            continue
          }
          const scale = S / Math.max(vb[2], vb[3])
          const sized = svg.replace(/<svg\b[^>]*>/, (root) => root.replace(/\s(width|height)="[^"]*"/g, '').replace('<svg', `<svg width="${vb[2] * scale}" height="${vb[3] * scale}"`))
          const img = new Image()
          try {
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized)
            await img.decode()
          } catch {
            results.push({ error: 'would not render' })
            continue
          }
          ctx.clearRect(0, 0, S, S)
          const dw = vb[2] * scale
          const dh = vb[3] * scale
          const ox = (S - dw) / 2
          const oy = (S - dh) / 2
          ctx.drawImage(img, ox, oy, dw, dh)
          const { data } = ctx.getImageData(0, 0, S, S)
          let minX = S, minY = S, maxX = -1, maxY = -1, ink = 0, light = 0, dark = 0, sumLum = 0, sumX = 0, sumY = 0
          const colours = new Map()
          for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
              const k = (y * S + x) * 4
              const a = data[k + 3]
              if (a < 24) continue
              if (x < minX) minX = x
              if (x > maxX) maxX = x
              if (y < minY) minY = y
              if (y > maxY) maxY = y
              ink++
              sumX += x
              sumY += y
              const r = data[k], g = data[k + 1], b = data[k + 2]
              const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
              sumLum += lum
              if (lum > 0.9) light++
              if (lum < 0.12) dark++
              if (a > 220) {
                const q = `${r & 0xf8},${g & 0xf8},${b & 0xf8}`
                colours.set(q, (colours.get(q) ?? 0) + 1)
              }
            }
          }
          if (!ink) {
            results.push({ error: 'renders empty' })
            continue
          }
          const w = maxX - minX + 1
          const h = maxY - minY + 1
          const solid = [...colours.values()].reduce((p, c) => p + c, 0) || 1
          const top = [...colours.entries()].sort((p, q) => q[1] - p[1]).slice(0, 6).map(([c, n]) => [c.split(',').map(Number), +(n / solid).toFixed(3)])
          // The first run of columns with ink, for a lockup whose symbol stands apart from its wordmark.
          const hasInk = (x) => { for (let y = minY; y <= maxY; y++) if (data[(y * S + x) * 4 + 3] >= 24) return true; return false }
          let firstEnd = minX
          while (firstEnd < maxX && (hasInk(firstEnd + 1) || hasInk(firstEnd + 2))) firstEnd++
          let fTop = S, fBottom = 0
          for (let y = minY; y <= maxY; y++) for (let x = minX; x <= firstEnd; x++) if (data[(y * S + x) * 4 + 3] >= 24) { if (y < fTop) fTop = y; if (y > fBottom) fBottom = y }
          // Is the mark a solid square that fills its own box? Then it brings its own tile.
          let corners = 0
          const hit = (x, y) => data[(y * S + x) * 4 + 3] > 200
          const inset = Math.ceil(Math.min(w, h) * 0.09)
          if (hit(minX + inset, minY + inset)) corners++
          if (hit(maxX - inset, minY + inset)) corners++
          if (hit(minX + inset, maxY - inset)) corners++
          if (hit(maxX - inset, maxY - inset)) corners++
          results.push({
            box: [(minX - ox) / scale + vb[0], (minY - oy) / scale + vb[1], w / scale, h / scale],
            firstBlock: [(minX - ox) / scale + vb[0], (fTop - oy) / scale + vb[1], (firstEnd - minX + 1) / scale, (fBottom - fTop + 1) / scale],
            aspect: +(Math.max(w, h) / Math.min(w, h)).toFixed(2),
            coverage: +(ink / (w * h)).toFixed(3),
            corners,
            lightShare: +(light / ink).toFixed(3),
            darkShare: +(dark / ink).toFixed(3),
            meanLum: +(sumLum / ink).toFixed(3),
            centroid: [+((sumX / ink - minX) / w).toFixed(3), +((sumY / ink - minY) / h).toFixed(3)],
            top,
          })
        }
        return results
      }, batch)),
    )
  }
  await browser.close()
  return out
}

/** Sets each SVG's frame to a box, and removes whatever draws wholly outside it. */
async function pruneToBlocks(items) {
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await (await browser.newContext()).newPage()
  await page.route('**/*', (r) => r.abort())
  const out = await page.evaluate((list) => {
    const NS = 'http://www.w3.org/2000/svg'
    return list.map(({ svg, box }) => {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
      const root = document.importNode(doc.documentElement, true)
      root.setAttribute('viewBox', box.join(' '))
      root.setAttribute('width', '256')
      root.setAttribute('height', '256')
      document.body.append(root)
      const margin = Math.max(box[2], box[3]) * 0.02
      for (const el of [...root.querySelectorAll('path,circle,ellipse,rect,line,polyline,polygon,use')]) {
        if (el.closest('defs,clipPath,mask')) continue
        const b = el.getBBox()
        const m = root.getScreenCTM().inverse().multiply(el.getScreenCTM())
        const corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f])
        const minX = Math.min(...corners.map((c) => c[0])), maxX = Math.max(...corners.map((c) => c[0]))
        const minY = Math.min(...corners.map((c) => c[1])), maxY = Math.max(...corners.map((c) => c[1]))
        const overlaps = maxX >= box[0] - margin && minX <= box[0] + box[2] + margin && maxY >= box[1] - margin && minY <= box[1] + box[3] + margin
        if (!overlaps) el.remove()
      }
      for (const g of [...root.querySelectorAll('g')].reverse()) if (!g.children.length) g.remove()
      // The final frame is square, so a narrow crop would show its neighbour unless it's clipped here.
      const clip = document.createElementNS(NS, 'clipPath')
      clip.setAttribute('id', 'vcrop')
      const rect = document.createElementNS(NS, 'rect')
      rect.setAttribute('x', box[0])
      rect.setAttribute('y', box[1])
      rect.setAttribute('width', box[2])
      rect.setAttribute('height', box[3])
      clip.append(rect)
      const g = document.createElementNS(NS, 'g')
      g.setAttribute('clip-path', 'url(#vcrop)')
      const defs = [...root.children].filter((c) => c.tagName === 'defs')
      for (const c of [...root.childNodes]) if (!defs.includes(c)) g.append(c)
      root.append(clip, g)
      const text = new XMLSerializer().serializeToString(root)
      root.remove()
      return text
    })
  }, items)
  await browser.close()
  return out.map((svg) => optimize(svg, { multipass: true, floatPrecision: 2, plugins: [{ name: 'preset-default', params: { overrides: { removeUselessStrokeAndFill: false } } }, 'removeDimensions', 'sortAttrs'] }).data)
}

// Choosing.

function candidatesFor(service, byKey) {
  // An alias can be another product's real name (Cloudflare Workers has its own logo), so aliases only count
  // where the service's own name finds nothing.
  const find = (names) => {
    const seen = new Set()
    const out = []
    for (const name of names) {
      for (const e of byKey.get(key(name)) ?? []) {
        if (seen.has(e.pack + e.file)) continue
        seen.add(e.pack + e.file)
        const verified = e.ownSite ? true : e.url ? sameCompany(service.domain, e.url) : false
        // Where a pack names the brand's own site and it's somewhere else, it's a different company.
        if (e.url && !verified && !e.weakUrl) continue
        out.push({ ...e, verified, via: name })
      }
    }
    return out
  }
  const own = find([service.name, service.id])
  return own.length ? own : find(service.aliases)
}

function licenceOf(c) {
  if (c.pack === 'thesvg' || c.pack === 'simpleicons') return c.licence
  return PACKS[c.pack].licence
}

async function main() {
  const byKey = indexPacks()
  const refused = []
  const work = []

  for (const s of SERVICES) {
    const pick = picks[s.id]
    if (pick?.none) continue
    let list
    if (pick?.use) {
      const [pack, ...rest] = pick.use.split(':')
      if (pack === 'official' && NO_OFFICIAL) continue
      const officialUrl = pack === 'official' ? JSON.parse(read(join(dir('official'), 'manifest.json')))[rest.join(':').replace(/\.svg$/, '')]?.url : undefined
      // A hand pick answers to the same licence rule. Only what the pack's index says about the file counts.
      const indexed = [...byKey.values()].flat().find((e) => e.pack === pack && e.file === rest.join(':'))
      list = [{ pack, file: rest.join(':'), verified: true, tier: 0, hand: true, hex: pick.hex ?? indexed?.hex, licence: indexed?.licence ?? (pack === 'thesvg' ? theSvgLicences.get(rest.join(':')) : undefined), url: pick.source ?? officialUrl }]
    } else {
      list = candidatesFor(s, byKey)
    }
    for (const c of list) {
      const licence = licenceOf(c)
      if (c.pack !== 'official' && !ALLOWED_LICENCES.has(licence)) {
        refused.push({ id: s.id, pack: c.pack, file: c.file, why: `licence: ${licence}` })
        continue
      }
      const path = join(dir(c.pack), c.file)
      if (!existsSync(path)) {
        refused.push({ id: s.id, pack: c.pack, file: c.file, why: 'file missing' })
        continue
      }
      const clean = sanitise(read(path), c.hex && c.tier >= 24 ? c.hex : pick?.hex, { keepPathsApart: !!pick?.crop })
      if (clean.refused) {
        refused.push({ id: s.id, pack: c.pack, file: c.file, why: clean.refused })
        continue
      }
      work.push({ s, c, licence, svg: clean.svg, dropped: clean.dropped })
    }
  }

  console.log(`${work.length} candidates to render`)
  const measured = await measureAll(work.map((w) => w.svg))
  work.forEach((w, i) => (w.m = measured[i]))

  const chosen = new Map()
  const score = (w) => {
    const { c, m } = w
    const bytes = w.svg.length
    let s = c.tier
    if (!c.verified) s += 9
    if (m.aspect > 1.5) s += (m.aspect - 1.5) * 12
    const colourful = m.top.length > 1 && (m.top[0]?.[1] ?? 1) < 0.97
    if (!colourful && c.tier < 30) s += 4
    if (bytes > 4000) s += 2
    return s
  }
  for (const w of work) {
    if (w.m.error) {
      refused.push({ id: w.s.id, pack: w.c.pack, file: w.c.file, why: w.m.error })
      continue
    }
    if (w.svg.length > MAX_LOGO_BYTES && !picks[w.s.id]?.crop) {
      refused.push({ id: w.s.id, pack: w.c.pack, file: w.c.file, why: `too heavy: ${w.svg.length}` })
      continue
    }
    if (w.m.aspect > MAX_ASPECT && !w.c.hand && !picks[w.s.id]?.crop) {
      refused.push({ id: w.s.id, pack: w.c.pack, file: w.c.file, why: `wordmark, aspect ${w.m.aspect}` })
      continue
    }
    const best = chosen.get(w.s.id)
    if (!best || score(w) < score(best)) chosen.set(w.s.id, w)
  }

  // A lockup keeps its symbol and loses its wordmark: frame the first block, drop what falls outside, measure again.
  const cropping = [...chosen.values()].filter((w) => picks[w.s.id]?.crop)
  if (cropping.length) {
    const boxFor = (w) => {
      const crop = picks[w.s.id].crop
      return crop === 'first' ? w.m.firstBlock : [w.m.box[0], w.m.box[1], w.m.box[2] * crop, w.m.box[3]]
    }
    const pruned = await pruneToBlocks(cropping.map((w) => ({ svg: w.svg, box: boxFor(w) })))
    const again = await measureAll(pruned)
    cropping.forEach((w, i) => {
      w.svg = pruned[i]
      w.m = again[i]
      if (again[i].error || w.svg.length > MAX_LOGO_BYTES) {
        refused.push({ id: w.s.id, pack: w.c.pack, file: w.c.file, why: `crop failed: ${again[i].error ?? w.svg.length}` })
        chosen.delete(w.s.id)
      }
    })
  }

  // Re-frame the winners, decide their tiles, then render once more to be sure.
  const finals = []
  for (const s of SERVICES) {
    const w = chosen.get(s.id)
    if (!w) continue
    const pick = picks[s.id] ?? {}
    const m = w.m
    const [bx, by, bw, bh] = pick.box ?? m.box
    const side = Math.max(bw, bh)
    // Slightly towards the centre of mass, which is where the eye puts a mark's middle.
    const nudgeX = pick.nudge?.[0] ?? 0
    const nudgeY = pick.nudge?.[1] ?? 0
    const cx = bx + bw / 2 + nudgeX * side
    const cy = by + bh / 2 + nudgeY * side
    const prec = side > 100 ? 1 : 3
    const vb = [cx - side / 2, cy - side / 2, side, side].map((v) => +v.toFixed(prec)).join(' ')
    let svg = frame(w.svg, vb)
    let tile = pick.tile ?? null

    const full = pick.full ?? (m.corners === 4 && m.coverage > 0.86 && m.aspect < 1.06)
    const mono = m.top.length === 1 || (m.top[0]?.[1] ?? 0) >= 0.97
    const markRGB = m.top[0]?.[0]
    if (!tile && !full && markRGB && !pick.markColour) {
      const onWhite = contrast(luminance(markRGB), 1)
      if (m.lightShare > 0.97) {
        // A white mark meant for dark backgrounds.
        tile = w.c.hex && contrast(luminance(rgb(w.c.hex)), 1) > 2 ? w.c.hex : '#15191e'
      } else if (mono && onWhite < 1.7) {
        // Yellow on white can't be read, so the brand colour becomes the tile.
        const hex = w.c.hex ?? `#${markRGB.map((v) => v.toString(16).padStart(2, '0')).join('')}`
        tile = hex
        const lum = luminance(rgb(hex))
        svg = recolourMono(svg, contrast(lum, 1) > contrast(lum, 0.008) ? '#ffffff' : '#15191e')
      }
    }
    if (pick.markColour) svg = recolourMono(svg, pick.markColour)
    finals.push({ s, w, svg, tile, full: full ? 1 : 0, mono })
  }

  const verify = await measureAll(finals.map((f) => f.svg))
  const dead = []
  finals.forEach((f, i) => {
    f.final = verify[i]
    if (verify[i].error) dead.push(f.s.id)
  })
  if (dead.length) console.log('These stopped rendering after framing:', dead.join(', '))

  const logoOf = new Map(finals.filter((f) => !f.final.error).map((f) => [f.s.id, f]))
  const services = SERVICES.map((s) => {
    const f = logoOf.get(s.id)
    return [s.id, s.name, s.category, s.domain, s.aliases, f ? f.svg : null, f?.tile ?? null, f?.full ?? 0]
  })
  const bundle = JSON.stringify({ v: 1, services })
  writeFileSync(OUT_BUNDLE, bundle)

  mkdirSync(dirname(OUT_CSV), { recursive: true })
  const q = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''))
  const rows = [['rank', 'id', 'name', 'domain', 'source', 'file', 'licence', 'matched_by', 'note'].join(',')]
  for (const s of SERVICES) {
    const f = logoOf.get(s.id)
    const pick = picks[s.id] ?? {}
    if (!f) {
      rows.push([s.rank, s.id, s.name, s.domain, '', '', '', '', pick.none ? `monogram: ${pick.none}` : 'monogram: no usable logo found'].map(q).join(','))
      continue
    }
    const c = f.w.c
    const source = c.pack === 'official' ? c.url : PACKS[c.pack].url
    const licence = c.pack === 'official' ? "None. The owner's own file, shown to identify it" : f.w.licence
    const matched = c.hand ? 'looked at by hand' : c.verified ? "name, and the pack's URL matches the domain" : 'name, then looked at by hand'
    rows.push([s.rank, s.id, s.name, s.domain, source, basename(c.file), licence, matched, pick.note ?? ''].map(q).join(','))
  }
  writeFileSync(OUT_CSV, rows.join('\n') + '\n')

  const report = {
    total: SERVICES.length,
    logos: logoOf.size,
    top100: SERVICES.slice(0, 100).filter((s) => logoOf.has(s.id)).length,
    top300: SERVICES.slice(0, 300).filter((s) => logoOf.has(s.id)).length,
    bundleBytes: Buffer.byteLength(bundle),
    biggest: [...logoOf.values()].sort((a, b) => b.svg.length - a.svg.length).slice(0, 15).map((f) => [f.s.id, f.svg.length]),
    packs: Object.fromEntries(Object.keys(PACKS).map((p) => [p, [...logoOf.values()].filter((f) => f.w.c.pack === p).length])),
    missing: SERVICES.filter((s) => !logoOf.has(s.id)).map((s) => `${s.rank} ${s.id}${picks[s.id]?.none ? ' (decided)' : ''}`),
  }
  console.log(JSON.stringify({ ...report, missing: undefined, missingCount: report.missing.length }, null, 1))

  if (REPORT) {
    mkdirSync(REPORT, { recursive: true })
    writeFileSync(join(REPORT, 'report.json'), JSON.stringify(report, null, 1))
    writeFileSync(join(REPORT, 'refused.json'), JSON.stringify(refused, null, 1))
    writeFileSync(
      join(REPORT, 'chosen.json'),
      JSON.stringify(
        [...logoOf.values()].map((f) => ({
          rank: f.s.rank,
          id: f.s.id,
          name: f.s.name,
          domain: f.s.domain,
          pack: f.w.c.pack,
          file: f.w.c.file,
          verified: f.w.c.verified,
          hand: !!f.w.c.hand,
          bytes: f.svg.length,
          tile: f.tile,
          full: f.full,
          mono: f.mono,
          aspect: f.final.aspect,
          svg: f.svg,
          alternatives: work.filter((a) => a.s.id === f.s.id && a !== f.w && !a.m.error).map((a) => `${a.c.pack}:${a.c.file}`),
        })),
        null,
        1,
      ),
    )
  }
}

await main()
