// Places pieces on the map. Deterministic, so the same company always gets the
// same geography, and positions are saved, because spatial memory is the point.

import { contourDensity } from 'd3-contour'
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import type { Gate, Link, Piece, PieceKind } from '../../core/types.ts'

interface Sim {
  id: string
  gate: string
  kind: PieceKind
  x: number
  y: number
  fx?: number
  fy?: number
}

function seeded(seed = 7) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const gateRadius = (n: number) => 70 + 42 * Math.sqrt(Math.max(n, 1))

/**
 * Where each kind tends to sit inside its area, as a direction from the middle.
 * Like things gather, so an area reads as neighbourhoods rather than a scatter:
 * tools along the top, rules on the left, paperwork and what's known on the right.
 */
const NEIGHBOURHOOD: Record<PieceKind, [number, number]> = {
  service: [0, -1],
  rule: [-0.8, 0.4],
  decision: [0.05, 1],
  token: [-0.05, 0.45],
  fact: [0.35, 0.7],
  spec: [0.6, 0.4],
  person: [0.55, 0.95],
  doc: [0.85, -0.05],
  contract: [0.85, 0.3],
  clause: [0.8, 0.75],
}

/** Items spread this much further sideways than up and down, because labels run sideways. */
const STRETCH = 1.36
const STRETCH_TALL = 1.1

/**
 * Areas in rows, in the order they're listed, each with room for what it holds.
 * The screen's shape picks the rows: a landscape map fits a laptop, a tall one fits a phone.
 * Each is nudged a little off the line, so it reads as islands and not as a table.
 */
function placeGates(gates: Gate[], pieces: Piece[], wide: boolean): Map<string, { x: number; y: number }> {
  const counts = new Map(gates.map((g) => [g.id, pieces.filter((p) => p.gate === g.id).length]))
  // An area with nothing in it has no land, so it takes no room from those that do.
  const ordered = [...gates.filter((g) => counts.get(g.id)), ...gates.filter((g) => !counts.get(g.id))]
  const landed = ordered.filter((g) => counts.get(g.id)).length || ordered.length
  const perRow = Math.max(1, wide ? Math.round(Math.sqrt(landed * 1.6)) : Math.round(Math.sqrt(landed / 2)))
  const across = wide ? STRETCH : STRETCH_TALL
  const radius = (g: Gate) => gateRadius(counts.get(g.id) ?? 0)
  // Land comes out a little narrower than its cell, because the coast hugs what's inside.
  const cellWidth = (g: Gate) => radius(g) * 2 * across * 0.92
  const GAP = 44
  // Room for an area's name and the line under it.
  const NAME = 124

  const out = new Map<string, { x: number; y: number }>()
  let y = 0
  for (let i = 0, row = 0; i < ordered.length; i += perRow, row++) {
    const cells = ordered.slice(i, i + perRow)
    const width = cells.reduce((sum, g) => sum + cellWidth(g), 0) + GAP * (cells.length - 1)
    const height = Math.max(...cells.map(radius)) * 2
    let x = -width / 2 + (row % 2 ? 26 : -26)
    cells.forEach((g, col) => {
      const w = cellWidth(g)
      out.set(g.id, { x: x + w / 2, y: y + height / 2 + (col % 2 ? 18 : -18) })
      x += w + GAP
    })
    y += height + NAME
  }
  for (const c of out.values()) c.y -= (y - NAME) / 2
  return out
}

/**
 * Gives every unplaced piece a position, leaving placed ones alone unless asked.
 * Mutates nothing: returns the positions that changed.
 */
export function layoutPieces(gates: Gate[], pieces: Piece[], links: Link[], opts: { reflow?: boolean; wide?: boolean } = {}): Map<string, { x: number; y: number }> {
  const unplaced = pieces.filter((p) => p.x === undefined || p.y === undefined)
  if (!unplaced.length && !opts.reflow) return new Map()

  const centres = placeGates(gates, pieces, opts.wide ?? true)
  const random = seeded(3)

  // Keep territories that already exist where the user knows them.
  const existing = new Map<string, { x: number; y: number; n: number }>()
  if (!opts.reflow) {
    for (const p of pieces) {
      if (p.x === undefined || p.y === undefined) continue
      const e = existing.get(p.gate) ?? { x: 0, y: 0, n: 0 }
      e.x += p.x
      e.y += p.y
      e.n++
      existing.set(p.gate, e)
    }
  }
  // A new area on a map that already has land goes beside it, not on top of it.
  let eastOfLand = -Infinity
  for (const p of pieces) if (p.x !== undefined && !opts.reflow) eastOfLand = Math.max(eastOfLand, p.x)
  const newcomers = new Map<string, { x: number; y: number }>()
  const centreOf = (gate: string) => {
    const e = existing.get(gate)
    if (e) return { x: e.x / e.n, y: e.y / e.n }
    if (existing.size) {
      let c = newcomers.get(gate)
      if (!c) {
        c = { x: eastOfLand + 340 + newcomers.size * 420, y: 0 }
        newcomers.set(gate, c)
      }
      return c
    }
    return centres.get(gate) ?? { x: 0, y: 0 }
  }

  const nodes: Sim[] = pieces.map((p) => {
    const c = centreOf(p.gate)
    const placed = p.x !== undefined && p.y !== undefined && !opts.reflow
    if (placed) return { id: p.id, gate: p.gate, kind: p.kind, x: p.x!, y: p.y!, fx: p.x, fy: p.y }
    return { id: p.id, gate: p.gate, kind: p.kind, x: c.x + (random() - 0.5) * 80, y: c.y + (random() - 0.5) * 80 }
  })

  const ids = new Set(nodes.map((n) => n.id))
  const gateOf = new Map(nodes.map((n) => [n.id, n.gate]))
  const linkData = links.filter((l) => ids.has(l.from) && ids.has(l.to)).map((l) => ({ source: l.from, target: l.to }))

  const inGate = new Map<string, number>()
  for (const p of pieces) inGate.set(p.gate, (inGate.get(p.gate) ?? 0) + 1)
  // How far a neighbourhood sits from the area's middle grows with how much the area holds.
  const home = (d: Sim, axis: 0 | 1) => {
    const c = centreOf(d.gate)
    const reach = 20 + 19 * Math.sqrt(inGate.get(d.gate) ?? 1)
    return (axis === 0 ? c.x : c.y) + NEIGHBOURHOOD[d.kind][axis] * reach
  }

  const sim = forceSimulation<Sim>(nodes)
    .randomSource(seeded(5))
    .force(
      'link',
      forceLink<Sim, { source: string; target: string }>(linkData)
        .id((d) => d.id)
        .distance((l) => (gateOf.get((l.source as unknown as Sim).id) === gateOf.get((l.target as unknown as Sim).id) ? 66 : 170))
        .strength((l) => (gateOf.get((l.source as unknown as Sim).id) === gateOf.get((l.target as unknown as Sim).id) ? 0.05 : 0.006)),
    )
    .force('charge', forceManyBody<Sim>().strength(-110).distanceMax(220))
    // Logos have short names and can sit close. Rules have long ones, so they keep their distance.
    .force('collide', forceCollide<Sim>((d) => (d.kind === 'service' ? 37 : d.kind === 'rule' ? 44 : 35)).strength(1).iterations(3))
    .force('x', forceX<Sim>((d) => home(d, 0)).strength(0.2))
    .force('y', forceY<Sim>((d) => home(d, 1)).strength(0.24))
    .stop()

  const ticks = unplaced.length === pieces.length || opts.reflow ? 420 : 160
  for (let i = 0; i < ticks; i++) sim.tick()

  const out = new Map<string, { x: number; y: number }>()
  const across = opts.wide === false ? STRETCH_TALL : STRETCH
  for (const n of nodes) {
    if (n.fx !== undefined) continue
    const c = centreOf(n.gate).x
    out.set(n.id, { x: Math.round((c + (n.x - c) * across) * 10) / 10, y: Math.round(n.y * 10) / 10 })
  }
  return out
}

export interface Territory {
  gate: string
  /** Contours from outermost to innermost. */
  rings: Path2D[]
  outer: Path2D
  cx: number
  cy: number
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** Chaikin corner cutting, so contours read as drawn curves rather than grid steps. */
function smooth(ring: number[][]): number[][] {
  const out: number[][] = []
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[i + 1]
    out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75])
  }
  if (out.length) out.push(out[0])
  return out
}

function ringsToPath(coords: number[][][][], ox: number, oy: number): Path2D {
  const path = new Path2D()
  for (const polygon of coords) {
    for (const ring of polygon) {
      const r = smooth(ring)
      r.forEach(([x, y], i) => (i ? path.lineTo(x + ox, y + oy) : path.moveTo(x + ox, y + oy)))
      path.closePath()
    }
  }
  return path
}

/**
 * Topographic contours. The outer line is the gate's coast: a broad, calm shape
 * around everything in it. Inside, a few quiet lines keep it reading as a chart.
 * They're texture and carry no meaning, so they must not single anything out.
 */
export function buildTerritories(gates: Gate[], points: { gate: string; x: number; y: number; weight?: number }[]): Territory[] {
  const out: Territory[] = []
  for (const gate of gates) {
    const own = points.filter((p) => p.gate === gate.id)
    if (!own.length) continue
    const xs = own.map((p) => p.x)
    const ys = own.map((p) => p.y)
    const pad = 170
    const minX = Math.min(...xs) - pad
    const minY = Math.min(...ys) - pad
    const w = Math.max(...xs) - Math.min(...xs) + pad * 2
    const h = Math.max(...ys) - Math.min(...ys) + pad * 2

    const coast = contourDensity<{ x: number; y: number }>()
      .x((p) => p.x - minX)
      .y((p) => p.y - minY)
      .size([w, h])
      .cellSize(4)
      .bandwidth(own.length < 4 ? 44 : 38)
      .thresholds(12)(own)
      .filter((c) => c.coordinates.length)
    if (!coast.length) continue

    const terrain = contourDensity<{ x: number; y: number; weight?: number }>()
      .x((p) => p.x - minX)
      .y((p) => p.y - minY)
      .size([w, h])
      .cellSize(4)
      // Broad enough that contours follow the land's shape. Any tighter and they ring single items, which looks like it means something.
      .bandwidth(own.length < 4 ? 44 : 50)
      .thresholds(7)(own)
      .filter((c) => c.coordinates.length)

    const outer = ringsToPath(coast[0].coordinates as number[][][][], minX, minY)
    const inner = terrain.slice(1, 7).map((c) => ringsToPath(c.coordinates as number[][][][], minX, minY))

    const flat = (coast[0].coordinates as number[][][][]).flat(2)
    const px = flat.map((c) => c[0] + minX)
    const py = flat.map((c) => c[1] + minY)
    out.push({
      gate: gate.id,
      rings: [outer, ...inner],
      outer,
      cx: xs.reduce((a, b) => a + b, 0) / xs.length,
      cy: ys.reduce((a, b) => a + b, 0) / ys.length,
      minX: Math.min(...px),
      maxX: Math.max(...px),
      minY: Math.min(...py),
      maxY: Math.max(...py),
    })
  }
  return out
}

/** Quiet terrain for the empty map. */
export function buildEmptyTerrain(width: number, height: number): Path2D[] {
  const random = seeded(23)
  const pts: { x: number; y: number }[] = []
  for (let c = 0; c < 11; c++) {
    let cx = random() * width
    const cy = random() * height
    // Keep the terrain out from behind the words in the middle.
    if (Math.abs(cx - width / 2) < width * 0.3 && Math.abs(cy - height / 2) < height * 0.28) cx = cx < width / 2 ? width * 0.1 : width * 0.9
    const spread = 60 + random() * 150
    for (let i = 0; i < 26; i++) {
      pts.push({ x: cx + (random() - 0.5) * spread * 2, y: cy + (random() - 0.5) * spread * 2 })
    }
  }
  const contours = contourDensity<{ x: number; y: number }>()
    .x((p) => p.x)
    .y((p) => p.y)
    .size([width, height])
    .cellSize(6)
    .bandwidth(46)
    .thresholds(9)(pts)
    .filter((c) => c.coordinates.length)
  return contours.map((c) => ringsToPath(c.coordinates as number[][][][], 0, 0))
}
