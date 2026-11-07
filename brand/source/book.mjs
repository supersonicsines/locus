// The brand book, brand/index.html. It is built from the brand: the website's own stylesheets (copied into brand/ui),
// the face in brand/fonts, and the files in brand/logo, so what it shows is what the pack holds and what the site does.
// It opens from disk. book() returns the page; build.mjs writes it.
import { exportSvg } from './mark.js'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const uri = (svg) => 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/'/g, '%27')
const r2 = (v) => Math.round(v * 100) / 100

/** A mark drawn for its device pixels: the css size at ×1 and ×2, each the drawing those pixels get. */
function mark(MARK, css, kind = 'light', cls = '') {
  const one = (k) => uri(exportSvg(MARK, { size: Math.round(css * k), tier: MARK.tierOf(Math.round(css * k)), kind, id: `m${css}${kind}${k}` }))
  return `<img class="m ${cls}" width="${css}" height="${css}" alt="" src="${one(1)}" srcset="${one(1)} 1x, ${one(2)} 2x">`
}

/** A crop of a screenshot (its own pixel box), shown at the width of its container. */
function crop(src, imgW, imgH, x, y, w, h, alt) {
  return `<div class="crop" style="aspect-ratio:${w} / ${h}"><img src="${src}" alt="${esc(alt)}" style="width:${r2((imgW / w) * 100)}%;left:${r2((-x / w) * 100)}%;top:${r2((-y / h) * 100)}%"></div>`
}

/** An island for the map's specimen: a coastline with a little noise in it, as a smooth closed path. */
function island(cx, cy, rx, ry, seed = 1) {
  const n = 64
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const k = 1 + 0.05 * Math.sin(3 * a + seed) + 0.035 * Math.sin(7 * a + 2 * seed) + 0.02 * Math.sin(13 * a + 3 * seed)
    pts.push([cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)])
  }
  let d = `M${pts[0].map(r2).join(' ')}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${c1.map(r2).join(' ')} ${c2.map(r2).join(' ')} ${p2.map(r2).join(' ')}`
  }
  return d + 'Z'
}
const border = (x, y0, y1, amp, seed) => {
  let d = ''
  for (let i = 0; i <= 24; i++) {
    const y = y0 + ((y1 - y0) * i) / 24
    const xx = x + amp * Math.sin(i / 3 + seed) + (amp / 2) * Math.sin(i / 1.3 + seed * 2)
    d += `${i ? 'L' : 'M'}${r2(xx)} ${r2(y)}`
  }
  return d
}
function mapSpecimen(live, id) {
  const coast = island(300, 170, 230, 118, live ? 2 : 1)
  const b1 = border(220, 30, 320, 7, 1)
  const b2 = border(390, 30, 320, 7, 3)
  const right = `${b2}L640 320L640 30Z`
  let grid = ''
  for (let x = 30; x < 600; x += 30) grid += `M${x} 0V340`
  for (let y = 20; y < 340; y += 30) grid += `M0 ${y}H600`
  return `<svg viewBox="0 0 600 340" class="mapspec" role="img" aria-label="${live ? 'A live map: the sea turns blue' : 'Land on a grey sea, three areas, one sealed'}">
  <defs>
    <clipPath id="${id}-c"><path d="${coast}"/></clipPath>
    <pattern id="${id}-h" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V7" stroke="var(--vermilion)" stroke-opacity="0.32" stroke-width="1.2"/></pattern>
  </defs>
  <rect width="600" height="340" fill="var(--${live ? 'live-sea' : 'sea'})"/>
  <path d="${grid}" stroke="var(--grid)" stroke-width="1"/>
  <path d="${coast}" fill="var(--land)"/>
  <g clip-path="url(#${id}-c)">
    <path d="${right}" fill="var(--sealed-land)"/><path d="${right}" fill="url(#${id}-h)"/>
    <path d="${b2}" fill="none" stroke="var(--vermilion)" stroke-opacity="0.6" stroke-width="1.2"/>
    <path d="${b1}" fill="none" stroke="var(--dash)" stroke-width="1.2" stroke-dasharray="3 4"/>
  </g>
  <g class="maplab"><text x="112" y="120">Brand</text><text x="112" y="140" class="sub">Can read</text>
  <text x="262" y="110">Product</text><text x="262" y="130" class="sub">Can read</text>
  <text x="420" y="118" class="sealed">Money</text><text x="420" y="138" class="sealed sub">Can’t read</text></g>
  <circle cx="490" cy="112" r="11" fill="var(--vermilion)"/><text x="490" y="116.5" class="seal-l">L</text>
  ${live ? `<g transform="translate(424 286)"><rect width="152" height="34" rx="9" fill="var(--raised)" stroke="var(--hair)"/><circle cx="20" cy="17" r="5" fill="var(--live)"/><text x="34" y="21.5" class="pill">Live · 2 readers</text></g>` : `<g transform="translate(424 286)"><rect width="152" height="34" rx="9" fill="var(--raised)" stroke="var(--hair)"/><circle cx="20" cy="17" r="4.5" fill="none" stroke="var(--soft)" stroke-width="1.4"/><text x="34" y="21.5" class="pill">Not live</text></g>`}
</svg>`
}

export function book({ mark: MARK, score, construction: con, lines: LINES, tokens, files, lockups, heroes }) {
  const T = (name) => tokens.find((t) => t.name === name)
  const px = (N) => r2(LINES.w(N))
  const total = Math.ceil(score.total * 100) / 100

  /* The score as a chart, drawn to scale. */
  const names = { col: 'Index contour', 'H:1': 'Below the col, +1d', 'H:2': 'Outline, +2d', 'A:-1': 'Summit, −1d', 'A:-2': 'Summit, −2d', 'A:-3': 'Summit, −3d', 'B:-1': 'Knoll, −1d' }
  const order = ['col', 'H:1', 'H:2', 'A:-1', 'A:-2', 'A:-3', 'B:-1']
  const W = 900
  const X0 = 200
  const TT = 2.4
  const sx = (t) => X0 + ((W - X0 - 12) * t) / TT
  const rowH = 24
  const rows = [...order.map((id) => ({ label: names[id], t0: score.strokes[id].t0, t1: score.strokes[id].t0 + score.strokes[id].dur, index: id === 'col' })), { label: 'The point', t0: score.point[0], t1: score.point[2], point: true }]
  const H = rows.length * rowH + 36
  const chart = `<svg class="score" viewBox="0 0 ${W} ${H}" role="img" aria-label="When each line of the mark is drawn, in seconds">
${[0, 0.5, 1, 1.5, 2].map((t) => `<line x1="${sx(t)}" x2="${sx(t)}" y1="4" y2="${H - 26}" class="g"/><text x="${sx(t)}" y="${H - 8}" class="tick" text-anchor="middle">${t.toFixed(1)} s</text>`).join('')}
${rows.map((r, i) => {
  const y = 8 + i * rowH
  const bar = r.point
    ? `<rect x="${sx(r.t0)}" y="${y + 6}" width="${sx(r.t1) - sx(r.t0)}" height="4" rx="2" class="ink"/><circle cx="${sx(r.t1)}" cy="${y + 8}" r="5.5" class="ink"/>`
    : `<rect x="${sx(r.t0)}" y="${y + (r.index ? 4 : 6)}" width="${sx(r.t1) - sx(r.t0)}" height="${r.index ? 8 : 4}" rx="${r.index ? 4 : 2}" class="ink"/>`
  return `<text x="0" y="${y + 12}" class="lab">${r.label}</text>${bar}`
}).join('\n')}
<line x1="${sx(score.tx)}" x2="${sx(score.tx)}" y1="2" y2="${H - 26}" class="pass"/><text x="${sx(score.tx) + 6}" y="${H - 30}" class="tick">the pen crosses the pass</text>
</svg>`

  /* The construction, on the bare glyph, in a working magenta that is no part of the mark. */
  const G = '#b8338a'
  const guides = `<svg viewBox="0 0 100 100" class="layer" aria-hidden="true"><g fill="none" stroke="${G}" stroke-width="0.16">${con.guide
    .map((g) => (g.el === 'circle' ? `<circle cx="${g.cx}" cy="${g.cy}" r="${g.r}"${g.dash ? ' stroke-dasharray="0.8 0.8"' : ''}/>` : `<path d="${g.d}" stroke-dasharray="1.2 1.2"/>`))
    .join('')}</g>${con.marks
    .map((m) => (m.dot ? `<circle cx="${m.p[0]}" cy="${m.p[1]}" r="0.45" fill="${G}"/>` : `<path d="M${m.p[0] - 1.2} ${m.p[1]}h2.4M${m.p[0]} ${m.p[1] - 1.2}v2.4" stroke="${G}" stroke-width="0.22"/>`) + (m.label ? `<text x="${m.p[0] + 1.4}" y="${m.p[1] - 1.4}" font-size="2.6" fill="${G}">${m.label}</text>` : ''))
    .join('')}</svg>`

  /* The sizes. */
  const LADDER = [256, 180, 128, 96, 64, 48, 32, 24, 16]
  const rung = (kind) => LADDER.map((s) => `<figure>${mark(MARK, s, kind)}<figcaption>${s} <span class="tier" data-css="${s}"></span></figcaption></figure>`).join('')

  /* Clear space: the horizontal lockup inside its ½ M margin. */
  const h = lockups.find((l) => l.name === 'locus-lockup-horizontal-light')
  const clear = `<svg viewBox="-50 -50 ${r2(h.W + 100)} 200" class="clear" role="img" aria-label="The horizontal lockup with half the mark's height clear on every side">
  <rect x="-50" y="-50" width="${r2(h.W + 100)}" height="200" fill="none" stroke="var(--dash)" stroke-dasharray="3 3" stroke-width="0.6"/>
  <rect x="0" y="0" width="${h.W}" height="100" fill="none" stroke="var(--hair-strong)" stroke-width="0.4"/>
  <path d="M0 -50V0M-50 0H0M${h.W} 100V150M${h.W} 100H${r2(h.W + 50)}" stroke="var(--faint)" stroke-width="0.5"/>
  <image href="logo/lockup/locus-lockup-horizontal-light.svg" x="0" y="0" width="${h.W}" height="100"/>
  <text x="-46" y="-38" class="cs">½ M</text><text x="${r2(h.W + 4)}" y="142" class="cs">½ M</text><text x="4" y="-38" class="cs">M = the mark’s height</text>
</svg>`

  /* What not to do: real files, misused. */
  const bad = (img, text) => `<figure class="dont"><div class="dont-plate">${img}</div><figcaption><b>Don’t</b> ${text}</figcaption></figure>`
  const big = 'logo/mark/locus-mark-512-light.svg'
  const red = uri(exportSvg(MARK, { size: 512, tier: 'L', kind: 'light', id: 'red' }).replace(/#15191e/g, '#d63c27'))
  const donts = [
    bad(`<img src="${big}" alt="" width="150" height="96" style="width:150px;height:96px">`, 'stretch or squash it.'),
    bad(`<img src="${big}" alt="" width="112" height="112" style="transform:rotate(-24deg)">`, 'rotate it. The ridge lies at 22.5°, always.'),
    bad(`<img src="${red}" alt="" width="112" height="112">`, 'recolour it. Vermilion means sealed; the mark is ink and paper.'),
    bad(`<img src="${big}" alt="" width="112" height="112" style="filter:drop-shadow(0 10px 14px rgba(21,25,30,.45)) blur(.3px)">`, 'add shadows, glows or gradients.'),
    bad(`<span class="pair-small"><img src="logo/mark/locus-mark-1024-light.svg" alt="" width="28" height="28"><span class="vs">not</span><img src="logo/mark/locus-mark-32-light.svg" srcset="logo/mark/locus-mark-32-light.svg 1x, logo/mark/locus-mark-64-light.svg 2x" alt="" width="28" height="28"></span>`, 'shrink a large drawing. Each size has its own file: use it.'),
    bad(`<img src="logo/mark/locus-mark-1024-bare.svg" alt="" width="40" height="40">`, 'drop the tile under 96 px. Bare and small, it reads as an ∞ in a pebble.'),
  ].join('')

  /* The palette, from the tokens. */
  const sw = (name, note = true) => {
    const t = T(name)
    return `<div class="swatch"><div class="chips"><span style="background:${t.value}"></span><span style="background:${t.dark}"></span></div><div class="sw-text"><b>--${name}</b><code>${esc(t.value)}</code><code class="dk">${esc(t.dark)}</code>${note ? `<span>${esc(t.meaning)}</span>` : ''}</div></div>`
  }
  const greys = ['page', 'paper', 'sea', 'land', 'raised', 'field', 'sealed-land', 'live-sea']
  const inks = ['ink', 'soft', 'faint', 'hair-strong', 'hair', 'wash-strong', 'wash', 'on-ink']

  /* The files, by group: the marks as a matrix of sizes by kinds, the rest as lists. */
  const marks = files.filter((f) => f.group === 'mark')
  const sizes = [...new Set(marks.map((f) => f.size))]
  const kinds = ['light', 'dark', 'reverse', 'oneink', 'bare']
  const matrix = `<div class="tbl"><table class="matrix"><thead><tr><th>drawn for</th>${kinds.map((k) => `<th>${k}</th>`).join('')}</tr></thead><tbody>${sizes
    .map((s) => `<tr><th>${s} px <span class="tier-name">${MARK.tierName[MARK.tierOf(s)]}</span></th>${kinds
      .map((k) => {
        const f = marks.find((x) => x.size === s && x.kind === k)
        return `<td>${f ? `<a href="${f.path}" title="${f.path}">svg</a>` : '<span class="none">·</span>'}</td>`
      })
      .join('')}</tr>`)
    .join('')}</tbody></table></div>`
  const group = (g, title) => {
    const fs = files.filter((f) => f.group === g)
    return `<div class="fgroup"><h3>${title}</h3><ul class="facts flist">${fs.map((f) => `<li><a href="${f.path}"><code>${f.path}</code></a><span>${esc(f.use)}</span></li>`).join('')}</ul></div>`
  }

  const theme = `<button class="site-icon-btn" id="theme" aria-label="Switch between light and dark" title="Light or dark"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor"/></svg></button>`
  const chapters = [['mark', 'Mark'], ['colour', 'Colour'], ['type', 'Type'], ['interface', 'Interface'], ['map', 'Map'], ['words', 'Words'], ['files', 'Files']]

  return `<!doctype html>
<html lang="en" class="site-page">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Locus Brand Book</title>
<meta name="description" content="The Locus brand: the mark, colour, type, interface, the map and words, and every file to use.">
<link rel="icon" href="logo/icon/favicon.ico" sizes="16x16 32x32 48x48">
<script>
  try { const t = localStorage.getItem('locus-brand-theme'); document.documentElement.dataset.theme = t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') } catch { document.documentElement.dataset.theme = 'light' }
</script>
<link rel="stylesheet" href="fonts/fonts.css">
<link rel="stylesheet" href="ui/styles.css">
<link rel="stylesheet" href="ui/site.css">
<style>
/* The book: the website's own page, rules and components, with a chapter's layout on top. Specimen grounds stand for
   a light page and a dark page, so they keep their colours in either theme. */
:root { --spec-light: #f3f5f6; --spec-dark: #11171e; --spec-dark-ink: #c9ced3 }
.book { overflow-x: clip }
.book main { display: block }
.toc { position: sticky; top: 0; z-index: 5; background: color-mix(in srgb, var(--page) 88%, transparent); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-bottom: 1px solid var(--hair) }
.toc-in { max-width: calc(var(--wrap) + var(--side) * 2); margin: 0 auto; padding: 0 var(--side); display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none }
.toc a { flex: none; padding: 12px 10px; color: var(--soft); font-size: 13px; text-decoration: none !important }
.toc a:hover, .toc a.on { color: var(--ink) }
.toc a.on { box-shadow: inset 0 -1px 0 var(--ink) }
.toc .n { color: var(--faint); margin-right: 6px }
.chapter { max-width: calc(var(--wrap) + var(--side) * 2); margin: 0 auto; padding: 88px var(--side) 0; display: grid; gap: 56px; scroll-margin-top: 48px }
.chapter + .chapter { margin-top: 88px; position: relative }
#mark { padding-top: 8px }
.chapter + .chapter::before { content: ''; position: absolute; top: 0; left: var(--side); right: var(--side); height: 1px; background: var(--hair) }
.ch-head { display: grid; gap: 0; max-width: 64ch }
.ch-head h2 { font-size: clamp(28px, 3.2vw, 40px); line-height: 1.12; letter-spacing: -0.03em }
.ch-head p { margin-top: 18px !important; color: var(--soft); font-size: 15px; line-height: 25px }
.part { display: grid; gap: 22px; min-width: 0 }
.part > h3 { font-size: 19px; line-height: 26px; font-weight: 400; letter-spacing: -0.01em }
.part > p { color: var(--soft); max-width: 68ch }
.two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start }
.card { background: var(--raised); border: 1px solid var(--hair); border-radius: 14px; padding: 22px; display: grid; gap: 16px; align-content: start; min-width: 0 }
.card > h3 { font-size: 15px; font-weight: 500; line-height: 22px }
.card > p { color: var(--soft); font-size: 13px; line-height: 20px }
.spec { border-radius: 14px; padding: 28px; min-width: 0; display: grid; place-items: center; border: 1px solid var(--hair) }
.spec.l { background: var(--spec-light); color: #15191e } .spec.d { background: var(--spec-dark); color: var(--spec-dark-ink); border-color: var(--hair) }
.spec.tagged { place-items: stretch; gap: 18px }
.spec .spec-tag { justify-self: start; align-self: start; font-size: 12px; opacity: .62 }
img.m { display: block; max-width: 100% }
code { white-space: normal }

/* The mark's page. */
.book .hero { padding-top: 64px; padding-bottom: 0 }
.book .hero h1 { font-size: clamp(44px, 6vw, 80px) }
.stage-plate { display: grid; place-items: center; padding: clamp(16px, 4vw, 44px); background: var(--sea); aspect-ratio: 1 / 1 }
.stage { width: 100%; max-width: 520px }
.stage svg { width: 100%; height: auto; display: block }
.scrub { display: flex; align-items: center; gap: 10px; flex: 1 1 220px; min-width: 0; color: var(--soft); font-size: 13px; font-variant-numeric: tabular-nums }
.scrub input { flex: 1; min-width: 0; accent-color: var(--ink) }
.score-wrap { overflow-x: auto }
.score { display: block; width: 100%; max-width: 900px; min-width: 560px; height: auto }
.score .g { stroke: var(--hair); stroke-width: 1 } .score .ink { fill: var(--ink) } .score .pass { stroke: var(--ink); stroke-width: 1; stroke-dasharray: 3 3 }
.score text { font: 12px var(--sans); fill: var(--ink) } .score .tick { font-size: 11px; fill: var(--soft) }
.ladder { display: flex; flex-wrap: wrap; gap: 22px 26px; align-items: flex-end; width: 100% }
.ladder figure { margin: 0; display: grid; gap: 8px; justify-items: center }
.ladder figcaption { font-size: 11px; opacity: .66; white-space: nowrap; font-variant-numeric: tabular-nums }
.legend { display: grid; gap: 14px; margin: 0 }
.legend > div { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 14px; align-items: center }
.legend svg { width: 92px; height: 24px; display: block; color: var(--ink) }
.legend dt { font-weight: 500 } .legend dd { margin: 0; color: var(--soft); font-size: 13px; line-height: 20px }
.construct { position: relative; width: 100%; max-width: 460px; aspect-ratio: 1; margin: 0 auto; background: #fcfdfd; border-radius: 12px }
.construct img, .construct .layer { position: absolute; inset: 0; width: 100%; height: 100% }
.construct text { font-family: var(--sans) }
dl.kv { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 18px; margin: 0; font-size: 13px; line-height: 20px }
dl.kv dt { color: var(--faint) } dl.kv dd { margin: 0 }
.clear { width: 100%; max-width: 620px; height: auto; display: block; margin: 0 auto }
.clear .cs { font: 7px var(--sans); fill: var(--faint) }
.locks { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 16px }
.locks .spec { min-height: 230px }
.locks .h img { width: min(330px, 100%); height: auto }
.locks .s img { width: min(112px, 100%); height: auto }
.uses { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px }
.use { display: grid; gap: 10px; align-content: start; min-width: 0 }
.use .spec { height: 168px; padding: 16px }
.use figcaption, .note { font-size: 12px; color: var(--faint) }
.tabs { width: 100%; background: #dde1e5; border-radius: 10px; padding: 8px 8px 0; display: flex; gap: 4px; overflow: hidden }
.tabs.dk { background: #1a1f26 }
.tabs .tab { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 8px 8px 0 0; font-size: 12px; color: #15191e; white-space: nowrap; min-width: 0 }
.tabs .tab.on { background: #fff } .tabs.dk .tab { color: #c9ced3 } .tabs.dk .tab.on { background: #2a3039 }
.tabs .ph { width: 42px; height: 8px; border-radius: 4px; background: #b9c0c7 } .tabs.dk .ph { background: #3b434d }
.tabs img { width: 16px; height: 16px }
.headbar { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 12px }
.headbar img { height: 26px; width: auto; display: block }
.headbar span { opacity: .6 }
.icons { display: flex; gap: 18px; align-items: center; justify-content: center; flex-wrap: wrap }
.avatar { border-radius: 50%; overflow: hidden; display: block; box-shadow: 0 0 0 1px rgba(21,25,30,.12) }
.social { width: 100%; height: auto; border-radius: 12px; border: 1px solid var(--hair); display: block }
.donts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px }
.dont { margin: 0; display: grid; gap: 10px }
.dont-plate { height: 168px; display: grid; place-items: center; background: var(--spec-light); border-radius: 14px; border: 1px solid var(--hair); overflow: hidden }
.dont figcaption { font-size: 13px; line-height: 20px; color: var(--soft) } .dont b { color: var(--ink); font-weight: 500 }
.pair-small { display: flex; align-items: center; gap: 14px } .vs { font-size: 12px; color: #5d656e }

/* Colour. */
.meanings { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px }
.meaning { border: 1px solid var(--hair); border-radius: 14px; overflow: hidden; background: var(--raised); display: grid; min-width: 0 }
.meaning .fill { height: 120px; display: flex; align-items: flex-end; padding: 14px 16px; font-size: 12px; color: #fff }
.meaning .body { padding: 16px; display: grid; gap: 8px }
.meaning h3 { font-size: 15px; font-weight: 500 }
.meaning p { color: var(--soft); font-size: 13px; line-height: 20px }
.meaning .ex { display: flex; align-items: center; gap: 8px; font-size: 13px; padding-top: 4px }
.duo { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px }
.big-sw { border-radius: 14px; min-height: 180px; padding: 20px; display: grid; align-content: end; gap: 2px; font-size: 13px; border: 1px solid var(--hair) }
.big-sw b { font-size: 19px; font-weight: 400 }
.swatches { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 24px }
.swatch { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 14px; align-items: center; padding: 10px 0; border-top: 1px solid var(--hair) }
.chips { display: flex; height: 40px; border-radius: 8px; overflow: hidden; box-shadow: inset 0 0 0 1px var(--hair) }
.chips span { flex: 1 }
.sw-text { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0 12px; font-size: 12px; line-height: 18px; min-width: 0 }
.sw-text b { font-weight: 500; grid-column: 1 / -1 } .sw-text code { background: none; padding: 0; color: var(--soft); white-space: nowrap }
.sw-text .dk { color: var(--faint) } .sw-text span { grid-column: 1 / -1; color: var(--soft) }

/* Type. */
.specimen { display: grid; gap: 18px }
.specimen .aa { font-size: clamp(64px, 10vw, 132px); line-height: 1; letter-spacing: -0.04em }
.specimen .set { font-size: 19px; line-height: 30px; color: var(--soft); word-break: break-all }
.weights { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px }
.weights div { border-top: 1px solid var(--hair); padding-top: 12px; display: grid; gap: 6px }
.weights b { font-size: 28px; line-height: 1.1; letter-spacing: -0.02em }
.weights span { color: var(--faint); font-size: 12px }
.scale { display: grid; gap: 0 }
.scale > div { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 16px; align-items: baseline; padding: 14px 0; border-top: 1px solid var(--hair) }
.scale .k { color: var(--faint); font-size: 12px; line-height: 18px }
.scale .v { min-width: 0; overflow-wrap: anywhere }

/* Interface. */
.row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center }
.ui-plate { background: var(--page); border: 1px solid var(--hair); border-radius: 14px; padding: 28px; display: grid; gap: 22px; min-width: 0 }
.ui-plate.sea { background: var(--sea) }
.crop { position: relative; overflow: hidden; width: 100%; border-radius: 12px; border: 1px solid var(--hair); background: var(--sea) }
.crop img { position: absolute; max-width: none; height: auto }
.shot { width: 100%; height: auto; display: block; border-radius: 12px; border: 1px solid var(--hair) }
.feature-demo h2 { font-size: clamp(24px, 2.5vw, 32px); line-height: 1.2; letter-spacing: -0.02em }
.panel-demo { padding: 18px 20px; display: grid; gap: 6px; max-width: 340px }
.panel-demo b { font-weight: 500 } .panel-demo span { color: var(--soft); font-size: 13px }

/* The map. */
.mapspec { width: 100%; height: auto; display: block; border-radius: 14px; border: 1px solid var(--hair) }
.mapspec text { font-family: var(--sans) }
.maplab text { font-size: 15px; fill: var(--ink) } .maplab .sub { font-size: 11px; fill: var(--soft) }
.maplab .sealed { fill: var(--vermilion-ink) } .maplab .sealed.sub { fill: var(--vermilion-ink); opacity: .85 }
.seal-l { font: 600 12px var(--sans); fill: #fff; text-anchor: middle }
.pill { font: 12px var(--sans); fill: var(--ink) }
.keys { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 24px; margin: 0; padding: 0; list-style: none }
.keys li { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 12px; align-items: center; font-size: 13px; line-height: 20px; color: var(--soft); padding: 10px 0; border-top: 1px solid var(--hair) }
.keys svg { width: 28px; height: 20px; display: block }
.keys b { color: var(--ink); font-weight: 500 }

/* Words. */
.tbl { overflow-x: auto }
table.words, table.matrix { border-collapse: collapse; width: 100%; font-size: 13px; line-height: 20px }
table.words th, table.words td { text-align: left; padding: 11px 16px 11px 0; border-top: 1px solid var(--hair); vertical-align: top }
table.words th { font-weight: 500; color: var(--ink) } table.words td { color: var(--soft) }
table.words thead th { color: var(--faint); font-weight: 400; font-size: 12px }
.say { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px }
.say .card ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; font-size: 13px; line-height: 20px }
.say .yes li::before { content: '✓  '; color: var(--ink) } .say .no li::before { content: '×  '; color: var(--faint) }

/* Files. */
table.matrix th, table.matrix td { padding: 8px 10px; border-top: 1px solid var(--hair); text-align: center }
table.matrix thead th { font-weight: 400; color: var(--faint); font-size: 12px }
table.matrix tbody th { text-align: left; font-weight: 500; white-space: nowrap }
table.matrix .tier-name { color: var(--faint); font-weight: 400; margin-left: 6px }
table.matrix td .none { color: var(--faint) }
.kinds { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px }
.kinds figure { margin: 0; display: grid; gap: 8px } .kinds .spec { padding: 18px } .kinds figcaption { font-size: 12px; line-height: 18px; color: var(--soft) }
.fgroups { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px 40px }
.fgroup h3 { font-size: 14px; font-weight: 500 }
.flist { margin-top: 10px }
.flist li { display: grid; gap: 2px } .flist code { background: none; padding: 0; color: var(--ink); white-space: normal; overflow-wrap: anywhere }
.agents { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px }

@media (max-width: 900px) {
  .two, .locks, .uses, .donts, .meanings, .duo, .swatches, .weights, .keys, .say, .fgroups, .agents { grid-template-columns: minmax(0, 1fr) }
  .kinds { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .weights { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .scale > div { grid-template-columns: minmax(0, 1fr); gap: 4px }
  .chapter { padding-top: 64px; gap: 40px }
}
@media (prefers-reduced-motion: reduce) { .scrub, #replay { display: none } }
</style>
</head>
<body>
<div class="site book">
<header class="site-head">
  <a class="site-brand" href="#mark" aria-label="Locus brand book, the top"><img src="logo/mark/locus-mark-32-light.svg" srcset="logo/mark/locus-mark-32-light.svg 1x, logo/mark/locus-mark-64-light.svg 2x" width="26" height="26" alt=""><span>Locus</span></a>
  <div class="site-head-right"><span class="note">Brand book</span>${theme}</div>
</header>
<nav class="toc" aria-label="Chapters"><div class="toc-in">${chapters.map(([id, t], i) => `<a href="#${id}"><span class="n">${String(i + 1).padStart(2, '0')}</span>${t}</a>`).join('')}</div></nav>
<main>

<section class="chapter" id="mark" aria-labelledby="mark-h">
  <div class="hero">
    <div class="hero-text">
      <p class="eyebrow"><span class="eyebrow-n">01</span>The mark</p>
      <h1 id="mark-h">Col</h1>
      <p class="lede">A summit, a lower knoll and the pass between them, drawn as contours. The pass’s own contour crosses itself, and the point sits on the crossing: Locus is the one place two heights share, where your company and an agent meet.</p>
      <ul class="facts">
        <li>Black lines on a white tile, on every page, the favicon included.</li>
        <li>Fine contours, with the pass’s own contour as the heavier index line, as on a survey sheet.</li>
        <li>Drawn once by a pen, ${score.total.toFixed(1)} s, then still. Six drawings, one for each range of sizes.</li>
      </ul>
      <div class="hero-actions"><button class="btn btn-ink btn-lg" id="replay" type="button">Replay the drawing</button><label class="scrub" for="t"><span>Scrub</span><input id="t" type="range" min="0" max="${total}" step="0.01" value="${total}"><span id="tv">${total.toFixed(2)} s</span></label></div>
    </div>
    <div class="plate stage-plate"><div class="stage" id="stage" aria-label="The Locus mark, being drawn">${heroes.b}</div></div>
  </div>

  <div class="part">
    <h3>How it is drawn</h3>
    <p>As a surveyor inks a sheet. The index contour goes first, in one stroke from the pass round the summit, through the pass and round the knoll. The two contours below the col follow the pen out of the pass. As it crosses the pass the summit’s contours follow, each from its tip, then the knoll’s. The point is set on the crossing last. A line once drawn never moves again, and nothing loops. With reduced motion the mark simply appears.</p>
    <div class="card"><div class="score-wrap">${chart}</div></div>
  </div>

  <div class="part">
    <h3>Every size is its own drawing</h3>
    <p>Shown at true size on this screen. Each size gets the drawing its device pixels can hold: the full sheet from 256, fewer contours down to 48, and below that a solid land with the crossing cut through it, where a fine line would blur. The files in <code>logo/mark</code> are named by the size each is drawn for.</p>
    <div class="two">
      <div class="spec l tagged"><span class="spec-tag">On a light page: the light files</span><div class="ladder">${rung('light')}</div></div>
      <div class="spec d tagged"><span class="spec-tag">On a dark page: the dark files</span><div class="ladder">${rung('dark')}</div></div>
    </div>
  </div>

  <div class="two">
    <div class="card">
      <h3>Line system</h3>
      <p>The convention of a survey sheet: contours are fine, and an index contour is drawn heavier so the eye can count them. Here the index is the pass’s own contour, so the crossing is the heaviest place in the mark.</p>
      <dl class="legend">
        <div><svg viewBox="0 0 92 24"><path d="M2 12C24 2 44 22 66 12S86 8 90 10" fill="none" stroke="currentColor" stroke-width="${px(512) / 2}" stroke-linecap="round"/></svg><span><dt>Contour</dt><dd>max(1, 1.2 (N/256)<sup>0.6</sup>) device px: ${px(180)} at 180, ${px(512)} at 512, ${px(1024)} at 1024. Never under 1 px.</dd></span></div>
        <div><svg viewBox="0 0 92 24"><path d="M2 12C24 2 44 22 66 12S86 8 90 10" fill="none" stroke="currentColor" stroke-width="${px(512)}" stroke-linecap="round"/></svg><span><dt>Index contour</dt><dd>${LINES.index} × a contour: the pass’s own figure-eight.</dd></span></div>
        <div><svg viewBox="0 0 92 24"><path d="M30 2L62 22M30 22L62 2" stroke="currentColor" stroke-width="${px(512)}" fill="none"/><circle cx="46" cy="12" r="${(LINES.dot * px(512)) / 2}" fill="currentColor"/></svg><span><dt>The point</dt><dd>${LINES.dot} × the index across, on the crossing.</dd></span></div>
      </dl>
    </div>
    <div class="card">
      <h3>Construction</h3>
      <div class="construct"><img alt="The mark's drawing alone" src="logo/mark/locus-mark-1024-bare.svg">${guides}</div>
      <dl class="kv">${con.legend.slice(0, 6).map(([k, t]) => `<dt>${esc(k)}</dt><dd>${esc(t)}</dd>`).join('')}</dl>
      <p>Every curve is a circle or an arc that joins one on a tangent. The whole sheet is in <a href="logo/CONSTRUCTION.md"><code>logo/CONSTRUCTION.md</code></a>.</p>
    </div>
  </div>

  <div class="part">
    <h3>Clear space and smallest sizes</h3>
    <p>Keep half the mark’s height clear on every side, of the mark alone and of a lockup. Nothing else, words, edges or other marks, comes inside it. The smallest mark is 16 px, the tab icon. The smallest lockup has a 20 px mark.</p>
    <div class="spec l">${clear}</div>
  </div>

  <div class="part">
    <h3>Lockups</h3>
    <p>The name in Spline Sans Mono at 540, outlined in the files so it never depends on the face being installed. Horizontal: the caps are half the mark’s height, centred on the tile, and the L’s stem stands 0.4 M from it. Stacked: the word at 0.4 M, its caps 0.25 M under the tile. The <code>-small</code> files are drawn for a 26 px mark, as in the site’s header.</p>
    <div class="locks">
      <div class="spec l h"><img src="logo/lockup/locus-lockup-horizontal-light.svg" alt="Locus, horizontal lockup"></div>
      <div class="spec l s"><img src="logo/lockup/locus-lockup-stacked-light.svg" alt="Locus, stacked lockup"></div>
      <div class="spec d h"><img src="logo/lockup/locus-lockup-horizontal-dark.svg" alt="Locus, horizontal lockup on dark"></div>
      <div class="spec d s"><img src="logo/lockup/locus-lockup-stacked-dark.svg" alt="Locus, stacked lockup on dark"></div>
    </div>
  </div>

  <div class="part">
    <h3>In use</h3>
    <div class="uses">
      <figure class="use"><div class="spec l"><div class="tabs"><div class="tab"><span class="ph"></span></div><div class="tab on"><img alt="" src="logo/icon/favicon-16.png" srcset="logo/icon/favicon-16.png 1x, logo/icon/favicon-32.png 2x">Meridian</div></div></div><div class="spec d"><div class="tabs dk"><div class="tab"><span class="ph"></span></div><div class="tab on"><img alt="" src="logo/icon/favicon-16.png" srcset="logo/icon/favicon-16.png 1x, logo/icon/favicon-32.png 2x">Meridian</div></div></div><figcaption>The tab icon: <code>logo/icon/favicon.ico</code></figcaption></figure>
      <figure class="use"><div class="spec l"><div class="headbar"><img src="logo/lockup/locus-lockup-horizontal-light-small.svg" alt=""><span>Example · Your maps</span></div></div><div class="spec d"><div class="headbar"><img src="logo/lockup/locus-lockup-horizontal-dark-small.svg" alt=""><span>Example · Your maps</span></div></div><figcaption>The site’s header, a 26 px mark</figcaption></figure>
      <figure class="use"><div class="spec l"><div class="icons">${mark(MARK, 96, 'light')}${mark(MARK, 60, 'light')}<span class="avatar">${mark(MARK, 44, 'square')}</span></div></div><div class="spec d"><div class="icons">${mark(MARK, 96, 'dark')}${mark(MARK, 60, 'dark')}<span class="avatar">${mark(MARK, 44, 'square')}</span></div></div><figcaption>A dock, a home screen, an avatar</figcaption></figure>
    </div>
    <div class="two">
      <img class="social" src="logo/social/locus-social-light.png" alt="The link card: the mark, the name and what it is" width="1200" height="630">
      <img class="social" src="logo/social/locus-social-dark.png" alt="The link card on dark" width="1200" height="630">
    </div>
    <p class="note">The link card, 1200 × 630, for <code>og:image</code>: <code>logo/social/</code>.</p>
  </div>

  <div class="part">
    <h3>Don’t</h3>
    <div class="donts">${donts}</div>
  </div>
</section>

<section class="chapter" id="colour" aria-labelledby="colour-h">
  <div class="ch-head"><p class="eyebrow"><span class="eyebrow-n">02</span>Colour</p><h2 id="colour-h">Ink on paper, and three colours that each mean one thing.</h2><p>The look is Atlas, a surveyor’s chart: cool white paper, ink-black hairlines, land as a plain pale fill on a grey sea. Colour is kept for meaning, so a reader can trust it at a glance. Every value here is a token in <code>tokens/tokens.css</code>, defined in the app’s own stylesheet.</p></div>
  <div class="duo">
    <div class="big-sw" style="background:#15191e;color:#fcfdfd;border-color:#15191e"><span>The mark’s ink</span><b>Ink #15191E</b><span>--ink in light; on dark the interface’s ink is ${esc(T('ink').dark)}</span></div>
    <div class="big-sw" style="background:#fcfdfd;color:#15191e"><span>The mark’s paper</span><b>Paper #FCFDFD</b><span>--raised and --land in light</span></div>
  </div>
  <div class="meanings">
    <div class="meaning"><div class="fill" style="background:var(--vermilion)">--vermilion ${esc(T('vermilion').value)} · ${esc(T('vermilion').dark)}</div><div class="body"><h3>Vermilion is sealed</h3><p>A sealed area, its wax seal and its words. Nothing else is ever vermilion: not an error, not a delete, not a “don’t”.</p><div class="ex"><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="var(--vermilion)"/><text x="11" y="15" class="seal-l" style="font-size:11px">L</text></svg><span style="color:var(--vermilion-ink)">Money · Can’t read</span></div></div></div>
    <div class="meaning"><div class="fill" style="background:var(--alert);color:#15191e">--alert ${esc(T('alert').value)} · ${esc(T('alert').dark)}</div><div class="body"><h3>Amber is urgent</h3><p>Something needs you now: a secret found in a file, a contradiction, a renewal due. It goes away when the thing is done.</p><div class="ex"><span class="btn" style="height:30px;background:var(--alert);color:var(--on-alert);font-size:12px;padding:0 10px">! Change 1 secret found in a file</span></div></div></div>
    <div class="meaning"><div class="fill" style="background:var(--live)">--live ${esc(T('live').value)} · ${esc(T('live').dark)}</div><div class="body"><h3>Blue is live</h3><p>A copy is live and agents can read it: the live dot, and the sea, which turns blue for that moment. Blue is never a link or a button.</p><div class="ex"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--live)"/></svg><span>Live · 2 readers</span></div></div></div>
  </div>
  <div class="part">
    <h3>Grounds</h3>
    <p>Each swatch shows light, then dark.</p>
    <div class="swatches">${greys.map((n) => sw(n)).join('')}</div>
  </div>
  <div class="part">
    <h3>Ink and its shares</h3>
    <p>Text and lines are ink, or a share of it, so they sit on any ground in either theme.</p>
    <div class="swatches">${inks.map((n) => sw(n)).join('')}</div>
  </div>
</section>

<section class="chapter" id="type" aria-labelledby="type-h">
  <div class="ch-head"><p class="eyebrow"><span class="eyebrow-n">03</span>Type</p><h2 id="type-h">One face, Spline Sans Mono.</h2><p>Everything is set in one variable file that ships with the app, the map’s canvas included. Hierarchy comes from size, weight, case and ink, never a second family. It is monospaced: every character is 0.6 em wide, and the map’s layout counts on that. The files and their licence are in <code>fonts/</code>.</p></div>
  <div class="specimen">
    <div class="aa">Aa Locus</div>
    <div class="set">ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 ≈$6,117 + €38 a month · “Can’t read” → 3 of 6</div>
  </div>
  <div class="weights">
    <div><b style="font-weight:400">Regular</b><span>400 · text and headings</span></div>
    <div><b style="font-weight:500">Medium</b><span>500 · labels, names, a button that matters</span></div>
    <div><b style="font-weight:540">Logotype</b><span>540 · the name in the lockup</span></div>
    <div><b style="font-weight:300">Light</b><span>300 · the axis runs 300–700; keep to the three above</span></div>
  </div>
  <div class="part">
    <h3>The scale</h3>
    <div class="scale">
      <div><span class="k">56 · −0.04 em<br>website headline</span><span class="v" style="font-size:clamp(34px,4vw,56px);line-height:1.06;letter-spacing:-0.04em">A map of your company that any agent can read.</span></div>
      <div><span class="k">32 · −0.02 em<br>a section’s heading</span><span class="v" style="font-size:clamp(24px,2.5vw,32px);line-height:1.2;letter-spacing:-0.02em">Each reader opens only what you choose.</span></div>
      <div><span class="k">24<br>a sheet’s heading</span><span class="v" style="font-size:24px;line-height:30px">Connect an agent</span></div>
      <div><span class="k">19<br>titles</span><span class="v" style="font-size:19px;line-height:26px">Meridian</span></div>
      <div><span class="k">17 · 16<br>a lede</span><span class="v" style="font-size:17px;line-height:28px;color:var(--soft)">Your map is sealed in this browser before it goes live, so the host stores only ciphertext.</span></div>
      <div><span class="k">15 · 14<br>reading</span><span class="v" style="font-size:15px;line-height:24px">Give an agent one address and one password. It gets the rules to follow, where everything lives and which tool to use for what.</span></div>
      <div><span class="k">13<br>controls, body in the Studio</span><span class="v" style="font-size:13px;line-height:19px">Who can read it once live · 3 of 6</span></div>
      <div><span class="k">12 · +0.08 em<br>meta, eyebrows</span><span class="v"><span class="eyebrow" style="margin:0!important"><span class="eyebrow-n">02</span>Readers</span></span></div>
    </div>
  </div>
</section>

<section class="chapter" id="interface" aria-labelledby="ui-h">
  <div class="ch-head"><p class="eyebrow"><span class="eyebrow-n">04</span>Interface</p><h2 id="ui-h">The website’s own components.</h2><p>Everything on this page is drawn by the app’s real stylesheets, copied into <code>ui/</code> by the build: the same classes, the same tokens. To build with them, take the class names below and <code>tokens/tokens.css</code>; the sources are <code>src/studio/styles.css</code> and <code>src/studio/site/site.css</code>. One family of controls: at rest, hover is a wash or a darker edge, a press gives a little, on is an ink edge or an ink fill, focus is one ring.</p></div>
  <div class="two">
    <div class="ui-plate">
      <div class="row"><a class="btn btn-ink btn-lg" href="#interface">Get started</a><a class="btn btn-paper btn-lg" href="#interface">See an example</a></div>
      <div class="row"><button class="btn btn-ink" type="button">Go live</button><button class="btn btn-paper" type="button">+ Add</button><button class="btn btn-quiet" type="button">Cancel</button><button class="btn btn-ink" type="button" disabled>Not yet</button></div>
      <p class="note"><code>.btn</code> with <code>.btn-ink</code> (the one thing to do), <code>.btn-paper</code>, <code>.btn-quiet</code>, <code>.btn-lg</code> on the website. Disabled ink keeps its words readable: not yet is an instruction.</p>
    </div>
    <div class="ui-plate">
      <p>Links are underlined with a hairline: <a href="#interface">Start your own map</a> · <a href="#interface">About Locus</a>.</p>
      <p>Code in running text: <code>npx -y locus-harness serve</code>, <code>locus verify</code>.</p>
      <p class="note">Links and code share the text’s ink. Nothing is blue unless it is live.</p>
    </div>
  </div>
  <div class="two">
    <div class="ui-plate feature-demo">
      <div><p class="eyebrow"><span class="eyebrow-n">02</span>Readers</p><h2>Each reader opens only what you choose.</h2><p class="feature-body">Pick a reader and the map shows what they can see. Press an area to seal it from them.</p></div>
      <ul class="facts" style="margin-top:0"><li>Every password has its own keys, so a sealed area is cryptography, not a setting.</li><li>See the exact text an agent gets with that password.</li></ul>
      <p class="note"><code>.eyebrow</code>, <code>.feature-body</code>, <code>.facts</code>: a section of the website.</p>
    </div>
    <div class="ui-plate">
      <div class="command"><div class="command-head"><h3>On your computer</h3><button class="btn btn-paper command-copy" type="button">Copy</button></div><pre class="command-code"><code><span class="command-prompt" aria-hidden="true">$ </span>npx -y locus-harness serve</code></pre><p class="command-note">Needs Node 22 or later. Then open http://localhost:4747.</p></div>
      <div class="ui-plate sea" style="padding:22px"><div class="panel panel-demo"><b>Meridian</b><span>A card is paper floating over the map: --raised, a hairline, --panel-radius and --shadow.</span></div></div>
      <p class="note"><code>.command</code> for anything to copy; <code>.panel</code> for whatever floats over the map.</p>
    </div>
  </div>
  <div class="part">
    <h3>In the Studio</h3>
    <p>The map is the app: one screen, and everything floats over it. The top line says what needs you, what it costs and whether it’s live; the card says who can read what.</p>
    ${crop('ui/screens/map.png', 2880, 1800, 652, 28, 2200, 86, 'The top line: an urgent item in amber, what needs approval, the cost, Add, and Go live')}
    <img class="shot" src="ui/screens/map.png" alt="The Studio: an example company's map, its areas, and the card over it" width="1440" height="900">
  </div>
</section>

<section class="chapter" id="map" aria-labelledby="map-h">
  <div class="ch-head"><p class="eyebrow"><span class="eyebrow-n">05</span>The map</p><h2 id="map-h">Land, sea and borders.</h2><p>The map is the brand’s one illustration. A company is an island of plain pale land on a grey sea, its areas divided by dashed borders like counties. A sealed area is hatched and stamped with a wax seal. When a copy goes live the sea turns blue. No pictures, gradients or relief: hairlines and flat fills.</p></div>
  <div class="two">${mapSpecimen(false, 'ms1')}${mapSpecimen(true, 'ms2')}</div>
  <ul class="keys">
    <li><svg viewBox="0 0 28 20"><rect width="28" height="20" rx="4" fill="var(--land)" stroke="var(--hair)"/></svg><span><b>Land</b> --land: an area you can read</span></li>
    <li><svg viewBox="0 0 28 20"><rect width="28" height="20" rx="4" fill="var(--sea)"/></svg><span><b>Sea</b> --sea, with a faint --grid</span></li>
    <li><svg viewBox="0 0 28 20"><path d="M2 10H26" stroke="var(--dash)" stroke-width="1.4" stroke-dasharray="3 4"/></svg><span><b>Border</b> --dash, a dashed hairline</span></li>
    <li><svg viewBox="0 0 28 20"><rect width="28" height="20" rx="4" fill="var(--sealed-land)" stroke="var(--vermilion)" stroke-opacity=".6"/><circle cx="14" cy="10" r="6" fill="var(--vermilion)"/></svg><span><b>Sealed</b> --sealed-land, hatched, a wax seal</span></li>
    <li><svg viewBox="0 0 28 20"><rect width="28" height="20" rx="4" fill="var(--live-sea)"/><circle cx="14" cy="10" r="4" fill="var(--live)"/></svg><span><b>Live</b> --live-sea, and the --live dot</span></li>
    <li><svg viewBox="0 0 28 20"><text x="2" y="15" style="font:500 13px var(--sans);fill:var(--ink)">Aa</text></svg><span><b>Names</b> in the one face; where a name goes depends only on the map and the zoom</span></li>
  </ul>
  <div class="two"><figure class="use"><img class="shot" src="ui/screens/seal.png" alt="Sealed areas, as a reader who can't open them sees the map" width="1440" height="900"><figcaption>Sealed areas, as a reader who can’t open them sees the map</figcaption></figure><figure class="use"><img class="shot" src="ui/screens/towns.png" alt="What the company spends, drawn on the map" width="1440" height="900"><figcaption>What it costs, drawn on the map: the biggest bills are the biggest places</figcaption></figure></div>
</section>

<section class="chapter" id="words" aria-labelledby="words-h">
  <div class="ch-head"><p class="eyebrow"><span class="eyebrow-n">06</span>Words</p><h2 id="words-h">Plain words, from the reader’s side of the screen.</h2><p><i>Locus</i> is Latin for “place”: the spot on a map where something is. It’s the one place an agent goes to learn where everything in a company is, and the rules that apply.</p></div>
  <div class="two">
    <div class="card"><h3>The name</h3><dl class="kv"><dt>product</dt><dd><b>Locus</b>, with a capital L, in running text and in the lockup.</dd><dt>line</dt><dd>A map of your company that any agent can read.</dd><dt>longer</dt><dd>A map of your company that any agent can read. Encrypted, gated, open source.</dd><dt>package</dt><dd><code>locus-harness</code> on npm. The command it installs is <code>locus</code>.</dd><dt>never</dt><dd><code>npx locus</code>: that name on npm belongs to someone else, and would run their code with a reader’s password. Write <code>npx -y locus-harness</code>.</dd></dl></div>
    <div class="card"><h3>How it talks</h3><ul class="facts" style="margin:0"><li>Short, direct sentences, in the active voice. Say what happens.</li><li>A button says exactly what it does: Go live, Copy, Seal.</li><li>Name things as people know them, never as the code does.</li><li>Facts, not reassurance: “The host stores only ciphertext.”</li><li>No exclamation marks, no emoji, no “simply”.</li></ul></div>
  </div>
  <div class="part">
    <h3>The screen’s words and the code’s</h3>
    <p>Change what the screen says freely; the code keeps its own names.</p>
    <div class="tbl"><table class="words"><thead><tr><th>On screen</th><th>In the code</th><th>What it is</th></tr></thead><tbody>
      <tr><th>area</th><td>gate</td><td>A part of the map, like a county. A reader can open it or not.</td></tr>
      <tr><th>item</th><td>piece</td><td>One small thing found in a document: a rule, a fact, a plan, a tool.</td></tr>
      <tr><th>reader</th><td>password</td><td>Who reads the map: an agent or a person, with its own password and keys.</td></tr>
      <tr><th>tool</th><td>service</td><td>Something the company runs on, and what it costs.</td></tr>
      <tr><th>recovery key</th><td>owner key</td><td>The one key that opens everything, kept by the owner.</td></tr>
      <tr><th>sealed</th><td>closed gate</td><td>An area a reader can’t open: vermilion, with a wax seal.</td></tr>
      <tr><th>live</th><td>published copy</td><td>A copy agents can read now: blue.</td></tr>
    </tbody></table></div>
  </div>
  <div class="say">
    <div class="card yes"><h3>Say</h3><ul><li>Each reader gets a password that opens only the areas you choose.</li><li>Secrets are removed before anything leaves.</li><li>Change 1 secret found in a file</li></ul></div>
    <div class="card no"><h3>Not</h3><ul><li>Leverage our AI-powered knowledge platform!</li><li>Gate 3 has a piece with an unresolved service ref.</li><li>Oops! Something went wrong.</li></ul></div>
  </div>
</section>

<section class="chapter" id="files" aria-labelledby="files-h">
  <div class="ch-head"><p class="eyebrow"><span class="eyebrow-n">07</span>Files</p><h2 id="files-h">Everything, ready to take.</h2><p>This folder, <code>brand/</code>, is the pack. Take files from it rather than redrawing anything. It is written by one command, <code>npm run brand</code>, from <code>brand/source/</code> and the app’s stylesheets, and a test fails if the pack and the app ever disagree.</p></div>
  <div class="agents">
    <div class="card"><h3>For agents</h3><p><code>brand.json</code> lists every file with its use, every colour with its meaning, the type and the rules. <code>README.md</code> says the same for people. Tokens are in <code>tokens/tokens.json</code> (Design Tokens format) and <code>tokens/tokens.css</code>; the mark’s geometry and its score are in <code>logo/tiers.json</code>.</p></div>
    <div class="card"><h3>Choosing a mark</h3><p>Pick by the device pixels it will be drawn at (CSS px × the screen’s density), then the ground: <code>light</code> on a light page, <code>dark</code> on a dark one. A tab icon is always <code>favicon.ico</code>. A README header is the stacked lockup.</p></div>
  </div>
  <div class="part"><h3>The mark, by size and kind</h3>
    <div class="kinds">${[['light', 'l', 'light: for a light page, with its hairline'], ['dark', 'd', 'dark: for a dark page'], ['reverse', 'l', 'reverse: paper on ink'], ['oneink', 'l', 'oneink: one ink, for print'], ['bare', 'l', 'bare: no tile, 96 px and up']].map(([k, g, t]) => `<figure><div class="spec ${g}"><img src="logo/mark/locus-mark-128-${k}.svg" alt="" width="64" height="64"></div><figcaption>${t}</figcaption></figure>`).join('')}</div>
    ${matrix}</div>
  <div class="fgroups">${group('motion', 'Motion')}${group('lockup', 'Lockups')}${group('icon', 'Icons')}${group('social', 'Link cards')}${group('tokens', 'Tokens')}${group('font', 'Type')}${group('data', 'Data')}${group('ui', 'Interface')}</div>
</section>
</main>
<footer class="site-foot" style="margin-top:88px">
  <span class="site-foot-brand"><img src="logo/mark/locus-mark-32-light.svg" srcset="logo/mark/locus-mark-32-light.svg 1x, logo/mark/locus-mark-64-light.svg 2x" width="20" height="20" alt="">Locus brand book</span>
  <span>Written by <code>brand/source/build.mjs</code>. Don’t edit this page; change its sources and run <code>npm run brand</code>.</span>
</footer>
</div>
<template id="hero-a">${heroes.a}</template>
<template id="hero-b">${heroes.b}</template>
<script>
(() => {
  const root = document.documentElement
  document.getElementById('theme').addEventListener('click', () => {
    const t = root.dataset.theme === 'dark' ? 'light' : 'dark'
    root.dataset.theme = t
    try { localStorage.setItem('locus-brand-theme', t) } catch {}
  })
  // The ladder's labels: which drawing each size gets on this screen.
  const B = ${JSON.stringify(MARK.bounds)}
  const N = ${JSON.stringify(MARK.tierName)}
  const tierOf = (px) => (px >= B.L ? 'L' : px >= B.M ? 'M' : px >= B.S ? 'S' : px >= B.SL ? 'SL' : px >= B.XS ? 'XS' : 'XXS')
  const dpr = window.devicePixelRatio || 1
  document.querySelectorAll('.tier[data-css]').forEach((el) => (el.textContent = '· ' + N[tierOf(Math.round(+el.dataset.css * dpr))]))
  // The drawing: the file for this screen's density, replayed and scrubbed through its own CSS animations.
  const stage = document.getElementById('stage')
  const range = document.getElementById('t')
  const tv = document.getElementById('tv')
  const total = +range.max
  let raf = 0
  const anims = () => (stage.firstElementChild ? stage.firstElementChild.getAnimations({ subtree: true }) : [])
  function play() {
    const id = (stage.clientWidth || 480) * dpr > 700 ? 'hero-b' : 'hero-a'
    stage.replaceChildren(document.getElementById(id).content.cloneNode(true))
    cancelAnimationFrame(raf)
    const a = anims()
    const tick = () => {
      const t = a.length ? Math.min(total, (a[0].currentTime || 0) / 1000) : total
      range.value = String(t)
      tv.textContent = t.toFixed(2) + ' s'
      if (a.some((x) => x.playState === 'running')) raf = requestAnimationFrame(tick)
      else { range.value = String(total); tv.textContent = total.toFixed(2) + ' s' }
    }
    raf = requestAnimationFrame(tick)
  }
  document.getElementById('replay').addEventListener('click', play)
  range.addEventListener('input', () => {
    cancelAnimationFrame(raf)
    const t = +range.value
    for (const a of anims()) { a.pause(); a.currentTime = t * 1000 }
    tv.textContent = t.toFixed(2) + ' s'
  })
  play()
  // The chapter in view, marked in the contents.
  const links = [...document.querySelectorAll('.toc a')]
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) links.forEach((l) => l.classList.toggle('on', l.getAttribute('href') === '#' + e.target.id)) }, { rootMargin: '-40% 0px -55% 0px' })
  document.querySelectorAll('.chapter').forEach((c) => io.observe(c))
})()
</script>
</body>
</html>
`
}
