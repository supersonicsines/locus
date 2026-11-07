// Writes src/studio/site/mark-paths.ts from the mark's own export, workbench/logo/col/tiers.json, so the
// site draws exactly what the workbench drew. Run it by hand after the mark changes:
//   node scripts/mark-paths.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('../workbench/logo/col/tiers.json', import.meta.url))
const out = fileURLToPath(new URL('../src/studio/site/mark-paths.ts', import.meta.url))
const { tiers } = JSON.parse(readFileSync(src, 'utf8'))

const tile = tiers[0].elements.find((e) => e.role === 'tile').d
const drawings = tiers.map((t, i) => {
  const els = t.elements
  const of = (role) => els.filter((e) => e.role === role)
  const point = of('point')[0]
  return {
    name: t.name,
    // Device px from which this drawing is used. The smallest is used below its own range too.
    from: i === 0 ? 0 : t.devicePx[0],
    land: of('land')[0]?.d,
    cut: of('cut')[0]?.d,
    lines: of('line').map((e) => e.d),
    point: point && { cx: point.cx, cy: point.cy, ...(typeof point.r === 'number' ? { r: point.r } : {}), ink: point.colour === 'ink' },
  }
})
for (const d of drawings) for (const k of Object.keys(d)) if (d[k] === undefined || (Array.isArray(d[k]) && !d[k].length)) delete d[k]

const body = `// The mark's geometry, written by scripts/mark-paths.mjs from workbench/logo/col/tiers.json. Don't edit by hand:
// change the mark in workbench/logo/col.js, export it, and run the script again. Units are the 100-unit box.

export type Drawing = {
  name: string
  from: number
  land?: string
  cut?: string
  lines?: string[]
  point?: { cx: number; cy: number; r?: number; ink: boolean }
}

export const TILE = ${JSON.stringify(tile)}

export const DRAWINGS: Drawing[] = ${JSON.stringify(drawings, null, 2)}
`
writeFileSync(out, body)
console.log(`wrote ${out.split('/src/')[1] ? 'src/' + out.split('/src/')[1] : out}: ${drawings.map((d) => `${d.name} from ${d.from}`).join(', ')}`)
