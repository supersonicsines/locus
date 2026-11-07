// The design tokens, read from the app's own stylesheets: they are defined there, once, and the pack mirrors them.
// src/studio/styles.css holds the Studio's (ink, paper, the meanings, the face, radii, shadows, easing); the map's
// colours are in src/studio/site/site.css. Layout sizes that belong to one screen (the card widths, the top line's
// height, the site's gutters) are left out: they are the app's, not the brand's.

/** The declarations of the first top-level block whose selector is exactly `selector`, with the comment before each. */
function block(css, selector) {
  const at = css.indexOf(`\n${selector} {`)
  if (at < 0) throw new Error(`No ${selector} block`)
  const open = css.indexOf('{', at)
  const close = css.indexOf('\n}', open)
  const body = css.slice(open + 1, close)
  const out = []
  let note = ''
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const c = line.match(/^\/\*\s*(.*?)\s*\*\/$/)
    if (c) {
      note = c[1]
      continue
    }
    const d = line.match(/^--([a-z0-9-]+):\s*(.+);$/)
    if (d) {
      out.push({ name: d[1], value: d[2], note })
      note = ''
    }
  }
  return out
}

const LAYOUT = new Set(['gutter', 'bar', 'fold-h', 'left-w', 'side-w', 'wrap', 'side'])

/** What each colour means, for the people and agents who use the pack. Every one the app defines is here. */
export const MEANING = {
  ink: 'Text, lines and the mark. Everything is ink or a share of it.',
  'ink-rgb': 'Ink as r, g, b, for shares of it.',
  'on-ink': 'Text on an ink fill.',
  paper: 'The Studio’s ground: the sea round the map.',
  raised: 'Paper that floats over the map: cards, sheets, menus. The mark’s tile is this paper.',
  field: 'A field or a key on a raised sheet.',
  soft: 'Secondary text.',
  faint: 'Tertiary text: meta, numbers beside labels.',
  focus: 'The focus ring.',
  hair: 'Hairlines: borders, rules, dividers.',
  'hair-strong': 'A hairline that is on: hover, pressed, chosen.',
  wash: 'A hover’s tint.',
  'wash-strong': 'A press’s tint, inline code.',
  scrim: 'Behind a sheet.',
  vermilion: 'Sealed, and nothing else: a sealed area, its wax seal.',
  alert: 'Amber: urgent, it needs you now, and nothing else.',
  'on-alert': 'Text on amber.',
  live: 'Blue: live, and nothing else. The live dot, and the sea when a copy is live.',
  page: 'The website’s page.',
  sea: 'The map’s sea.',
  land: 'The map’s land.',
  'sealed-land': 'Land in a sealed area.',
  'live-sea': 'The sea while a copy is live: the one moment blue floods the map.',
  'vermilion-ink': 'Vermilion as text: a sealed area’s words.',
  'vermilion-rgb': 'Vermilion as r, g, b.',
  'wax-shadow': 'The shadow under a wax seal.',
  grid: 'The faint grid on a map plate.',
  dash: 'County borders: dashed hairlines between areas.',
  term: 'A terminal’s ground: commands to copy.',
  'term-edge': 'A terminal’s edge, on dark pages.',
  'term-ink': 'Text in a terminal.',
  'term-soft': 'A terminal’s prompt.',
  reader: 'A reader’s colour on the website’s graphics.',
  sans: 'The one face, Spline Sans Mono, named once.',
  'ease-out': 'Things arriving: presses, cards, the mark’s fade.',
  'ease-drawer': 'Sheets and drawers sliding in.',
  'panel-radius': 'Cards and sheets.',
  'control-radius': 'Buttons, fields, segmented controls.',
  shadow: 'A card over the map.',
  'shadow-high': 'A sheet or menu over everything.',
}

const typeOf = (name, value) =>
  /^#|^rgba?\(|^transparent$/.test(value) ? 'color' : name === 'sans' ? 'fontFamily' : value.startsWith('cubic-bezier') ? 'cubicBezier' : /px$/.test(value) ? 'dimension' : /^\d+, \d+, \d+$/.test(value) ? 'rgb' : name.startsWith('shadow') ? 'shadow' : 'other'

/** Every brand token, light and dark, from the two stylesheets' sources. */
export function readTokens(stylesCss, siteCss) {
  const light = [...block(stylesCss, ':root'), ...block(siteCss, ':root.site-page')].filter((t) => !LAYOUT.has(t.name))
  const dark = new Map([...block(stylesCss, ":root[data-theme='dark']"), ...block(siteCss, ":root.site-page[data-theme='dark']")].map((t) => [t.name, t.value]))
  return light.map((t) => ({ ...t, dark: dark.get(t.name) ?? t.value, type: typeOf(t.name, t.value), meaning: MEANING[t.name] ?? '' }))
}

/** tokens.css: custom properties, light on :root, dark under data-theme="dark" and the system's dark setting. */
export function tokensCss(tokens) {
  const decl = (k) => tokens.map((t) => `  --${t.name}: ${t[k]};`).join('\n')
  const dark = tokens.filter((t) => t.dark !== t.value).map((t) => `  --${t.name}: ${t.dark};`).join('\n')
  return `/* Locus design tokens. Written by brand/source/build.mjs from src/studio/styles.css and src/studio/site/site.css,
   where they are defined; don't edit this copy. Light on :root; dark under [data-theme='dark'], and under the system's
   dark setting unless a page chooses light. Vermilion means sealed, amber urgent, blue live, and nothing else. */

:root {
${decl('value')}
}

:root[data-theme='dark'] {
${dark}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${dark.replace(/^/gm, '  ')}
  }
}
`
}

/** tokens.json: the Design Tokens Community Group's format, with the dark value and the meaning on each token. */
export function tokensJson(tokens) {
  const groups = { color: {}, font: {}, radius: {}, shadow: {}, easing: {} }
  for (const t of tokens) {
    const g = t.type === 'color' || t.type === 'rgb' ? 'color' : t.type === 'fontFamily' ? 'font' : t.type === 'dimension' ? 'radius' : t.type === 'shadow' ? 'shadow' : t.type === 'cubicBezier' ? 'easing' : 'color'
    const value = t.type === 'cubicBezier' ? t.value.match(/[-\d.]+/g).map(Number) : t.type === 'fontFamily' ? t.value.split(',').map((f) => f.trim().replace(/^'|'$/g, '')) : t.value
    const dark = t.type === 'cubicBezier' ? t.dark.match(/[-\d.]+/g).map(Number) : t.type === 'fontFamily' ? value : t.dark
    groups[g][t.name] = {
      $value: value,
      ...(t.type === 'color' || t.type === 'fontFamily' || t.type === 'cubicBezier' || t.type === 'dimension' ? { $type: t.type } : {}),
      $description: t.meaning,
      $extensions: { 'locus.dark': dark, 'locus.css': `var(--${t.name})` },
    }
  }
  return JSON.stringify({ $description: 'Locus design tokens, light values with the dark ones beside them. Written by brand/source/build.mjs from the app’s stylesheets; don’t edit.', ...groups }, null, 2) + '\n'
}
