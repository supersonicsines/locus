// Places pieces on the map. Deterministic, so the same company always gets the
// same geography, and positions are saved, because spatial memory is the point.

import { contourDensity } from 'd3-contour'
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import type { Gate, Link, Piece } from '../../core/types.ts'

interface Sim {
  id: string
  gate: string
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

const gateRadius = (n: number) => 96 + 50 * Math.sqrt(Math.max(n, 1))

/** Territories spaced around each other by how much they hold. */
function placeGates(gates: Gate[], pieces: Piece[], wide: boolean): Map<string, { x: number; y: number }> {
  const counts = new Map(gates.map((g) => [g.id, pieces.filter((p) => p.gate === g.id).length]))
  const nodes = gates.map((g, i) => {
    // Two territories sit side by side on a wide screen, and stacked on a phone.
    const a = (i / Math.max(gates.length, 1)) * Math.PI * 2 + (wide ? Math.PI : -Math.PI / 2)
    const r = gateRadius(counts.get(g.id) ?? 0)
    return { id: g.id, r, x: Math.cos(a) * 420, y: Math.sin(a) * 300 }
  })
  const sim = forceSimulation(nodes)
    .randomSource(seeded(11))
    .force('collide', forceCollide<(typeof nodes)[number]>((d) => d.r + 22).strength(0.9).iterations(4))
    .force('x', forceX(0).strength(0.055))
    // A landscape map fits a laptop better than a round one.
    .force('y', forceY(0).strength(0.085))
    .stop()
  for (let i = 0; i < 260; i++) sim.tick()
  return new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]))
}

/**
 * Gives every unplaced piece a position, leaving placed ones alone unless asked.
 * Mutates nothing: returns the positions that changed.
 */
export function layoutPieces(gates: Gate[], pieces: Piece[], links: Link[], opts: { reflow?: boolean; wide?: boolean } = {}): Map<string, { x: number; y: number }> {
  const unplaced = pieces.filter((p) => p.x === undefined || p.y === undefined)
  if (!unplaced.length && !opts.reflow) return new Map()

  const centres = placeGates(gates, pieces, opts.wide ?? gates.length > 2)
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
  const centreOf = (gate: string) => {
    const e = existing.get(gate)
    if (e) return { x: e.x / e.n, y: e.y / e.n }
    return centres.get(gate) ?? { x: 0, y: 0 }
  }

  const nodes: Sim[] = pieces.map((p) => {
    const c = centreOf(p.gate)
    const placed = p.x !== undefined && p.y !== undefined && !opts.reflow
    if (placed) return { id: p.id, gate: p.gate, x: p.x!, y: p.y!, fx: p.x, fy: p.y }
    return { id: p.id, gate: p.gate, x: c.x + (random() - 0.5) * 80, y: c.y + (random() - 0.5) * 80 }
  })

  const ids = new Set(nodes.map((n) => n.id))
  const gateOf = new Map(nodes.map((n) => [n.id, n.gate]))
  const linkData = links.filter((l) => ids.has(l.from) && ids.has(l.to)).map((l) => ({ source: l.from, target: l.to }))

  const sim = forceSimulation<Sim>(nodes)
    .randomSource(seeded(5))
    .force(
      'link',
      forceLink<Sim, { source: string; target: string }>(linkData)
        .id((d) => d.id)
        .distance((l) => (gateOf.get((l.source as unknown as Sim).id) === gateOf.get((l.target as unknown as Sim).id) ? 66 : 170))
        .strength((l) => (gateOf.get((l.source as unknown as Sim).id) === gateOf.get((l.target as unknown as Sim).id) ? 0.28 : 0.012)),
    )
    .force('charge', forceManyBody<Sim>().strength(-190).distanceMax(300))
    .force('collide', forceCollide<Sim>(30).strength(1).iterations(2))
    .force('x', forceX<Sim>((d) => centreOf(d.gate).x).strength(0.13))
    .force('y', forceY<Sim>((d) => centreOf(d.gate).y).strength(0.17))
    .stop()

  const ticks = unplaced.length === pieces.length || opts.reflow ? 420 : 160
  for (let i = 0; i < ticks; i++) sim.tick()

  const out = new Map<string, { x: number; y: number }>()
  for (const n of nodes) {
    if (n.fx !== undefined) continue
    out.set(n.id, { x: Math.round(n.x * 10) / 10, y: Math.round(n.y * 10) / 10 })
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
 * around everything in it. Inside, the ground rises where pieces are most
 * connected, so the terrain says something rather than just decorating.
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
      .weight((p) => 1 + (p.weight ?? 0) * 1.5)
      .size([w, h])
      .cellSize(4)
      .bandwidth(own.length < 4 ? 34 : 25)
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
