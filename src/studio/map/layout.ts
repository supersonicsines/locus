// Places items on the map. Deterministic, so the same company always gets the same geography,
// and positions are saved, because spatial memory is the point.
//
// Inside an area, like things sit together under a name, in the same places in every area:
// tools along the top, rules on the left, and paperwork, plans and facts beside them.
// Every name reads to the right of its mark, so a map can be read along and you can learn its shape.

import { contourDensity, contours } from 'd3-contour'
import type { Gate, Piece, PieceKind } from '../../core/types.ts'

function seeded(seed = 7) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

const hashOf = (text: string) => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** The zoom a map is drawn for. Here and a little below, every name has room. Sizes below are the pixels they come to at this zoom. */
export const DESIGN_K = 0.5
const world = (px: number) => px / DESIGN_K

const MARK = world(18)
const TO_NAME = world(5)
const GUTTER = world(16)
const ROW = world(22)
const ROW_TALL = world(32)
const HEADING = world(18)
const BLOCK_GAP = world(11)
const COLUMN_GAP = world(22)
/** The right-hand column starts a little lower than the left, so an area reads as neighbourhoods and not as cells in a table. */
const COLUMN_STEP = world(9)
/** How far the coast stands off what's on the land. */
const SHORE = world(16)

/** An area this small doesn't need its things named by kind: there's nothing to find. */
export const HEADINGS_FROM = 5

export interface DistrictDef {
  id: string
  name: string
  kinds: PieceKind[]
  /** The picture that stands for all of them, when they've gathered into one line. */
  icon: PieceKind
}

/** The neighbourhoods of an area. The order is the order they're laid out and read in. */
export const DISTRICTS: DistrictDef[] = [
  { id: 'tools', name: 'Tools', kinds: ['service'], icon: 'service' },
  { id: 'rules', name: 'Rules', kinds: ['rule'], icon: 'rule' },
  { id: 'documents', name: 'Documents', kinds: ['contract', 'doc', 'clause'], icon: 'doc' },
  { id: 'plans', name: 'Plans', kinds: ['spec', 'decision'], icon: 'spec' },
  { id: 'facts', name: 'Facts', kinds: ['fact', 'person', 'token'], icon: 'fact' },
]

const districtOfKind = new Map<PieceKind, DistrictDef>(DISTRICTS.flatMap((d) => d.kinds.map((k) => [k, d] as const)))
export const districtOf = (kind: PieceKind): DistrictDef => districtOfKind.get(kind) ?? DISTRICTS[DISTRICTS.length - 1]

/**
 * A long name breaks onto two lines, as on a printed map, at whichever word balances them best.
 * Past two lines it stops at a word. Hover or click for the whole of it.
 */
const LINE_CHARS = 21
export function wrapTitle(title: string): { lines: string[]; cut: boolean } {
  if (title.length <= LINE_CHARS) return { lines: [title], cut: false }
  const words = title.split(' ')
  let best = -1
  let bestLength = Infinity
  for (let i = 1; i < words.length; i++) {
    const longest = Math.max(words.slice(0, i).join(' ').length, words.slice(i).join(' ').length)
    if (longest < bestLength) {
      bestLength = longest
      best = i
    }
  }
  if (best < 0) return { lines: [`${title.slice(0, LINE_CHARS - 1)}…`], cut: true }
  const first = words.slice(0, best).join(' ')
  const second = words.slice(best).join(' ')
  const limit = LINE_CHARS + 3
  if (first.length <= limit && second.length <= limit) return { lines: [first, second], cut: false }
  // Too long for two lines: fill the first, then stop the second at a word.
  const top: string[] = []
  const rest = [...words]
  while (rest.length && [...top, rest[0]].join(' ').length <= LINE_CHARS) top.push(rest.shift()!)
  if (!top.length) top.push(rest.shift()!.slice(0, LINE_CHARS))
  const bottom: string[] = []
  while (rest.length && [...bottom, rest[0]].join(' ').length <= LINE_CHARS - 1) bottom.push(rest.shift()!)
  return { lines: [top.join(' '), `${bottom.join(' ')}…`], cut: true }
}

/**
 * About how wide a line of an item's name is, in pixels at the size it's printed.
 * Estimated from letter shapes and not measured, so geography doesn't depend on whether a font has loaded.
 */
function textWidth(text: string): number {
  let em = 0
  for (const c of text) {
    if (c === ' ') em += 0.26
    else if (c > '\u2e7f') em += 1
    else if ('ijl.,\'!:;|'.includes(c)) em += 0.26
    else if ('ftr()[]I-"'.includes(c)) em += 0.36
    else if ('mw'.includes(c)) em += 0.82
    else if ('MW'.includes(c)) em += 0.92
    else if (c >= 'A' && c <= 'Z') em += 0.66
    else if (c >= '0' && c <= '9') em += 0.58
    else em += 0.55
  }
  return em * 11.5
}

interface Box {
  piece: Pick<Piece, 'id' | 'title' | 'kind'>
  w: number
  h: number
}

const boxOf = (piece: Box['piece']): Box => {
  const { lines } = wrapTitle(piece.title)
  return { piece, w: MARK + TO_NAME + world(Math.max(...lines.map(textWidth))), h: lines.length > 1 ? ROW_TALL : ROW }
}

interface Placed {
  id: string
  x: number
  y: number
}

interface Block {
  w: number
  h: number
  items: Placed[]
}

/**
 * Sets boxes in as many columns as fit, each as wide as its widest name, so the eye finds straight edges.
 * It won't use a column that doesn't save a row, or a last row would be left nearly empty for nothing.
 */
function flow(boxes: Box[], width: number, heading: boolean): Block {
  const columnWidths = (cols: number) => {
    const widths: number[] = new Array(cols).fill(0)
    boxes.forEach((b, i) => (widths[i % cols] = Math.max(widths[i % cols], b.w)))
    return widths
  }
  const total = (widths: number[]) => widths.reduce((sum, w) => sum + w, 0) + GUTTER * (widths.length - 1)
  let cols = Math.max(1, Math.min(boxes.length, 5))
  while (cols > 1 && total(columnWidths(cols)) > width) cols--
  while (cols > 1 && Math.ceil(boxes.length / (cols - 1)) === Math.ceil(boxes.length / cols)) cols--
  const widths = columnWidths(cols)
  const items: Placed[] = []
  let y = heading ? HEADING : 0
  for (let start = 0; start < boxes.length; start += cols) {
    const row = boxes.slice(start, start + cols)
    const height = Math.max(...row.map((b) => b.h))
    let x = 0
    row.forEach((b, i) => {
      items.push({ id: b.piece.id, x: x + MARK / 2, y: y + height / 2 })
      x += widths[i] + GUTTER
    })
    y += height
  }
  return { w: total(widths), h: y, items }
}

const widest = (boxes: Box[]) => Math.max(0, ...boxes.map((b) => b.w))

const offset = (block: Block, dx: number, dy: number): Placed[] => block.items.map((i) => ({ ...i, x: i.x + dx, y: i.y + dy }))

/** Stacks these blocks in a column this wide. Returns what it placed and how tall it came to. */
function column(groups: Box[][], width: number, heading: boolean, dx: number, dy: number): { items: Placed[]; w: number; h: number } {
  const items: Placed[] = []
  let y = 0
  let w = 0
  groups.forEach((boxes, i) => {
    const block = flow(boxes, width, heading)
    items.push(...offset(block, dx, dy + y))
    y += block.h + (i < groups.length - 1 ? BLOCK_GAP : 0)
    w = Math.max(w, block.w)
  })
  return { items, w, h: y }
}

/** One way of arranging an area at this width: tools across the top, everything else in one or two columns under them, rules on the left. */
function arrange(tools: Box[], rest: Box[][], width: number, heading: boolean): { items: Placed[]; w: number; h: number } {
  const top = tools.length ? flow(tools, width, heading) : null
  const topHeight = top ? top.h + (rest.length ? BLOCK_GAP : 0) : 0
  const items: Placed[] = top ? [...top.items] : []
  if (!rest.length) return { items, w: top?.w ?? 0, h: topHeight }

  let best = column(rest, width, heading, 0, topHeight)
  let bestScore = best.h
  for (let mask = 1; mask < 1 << rest.length; mask += 2) {
    if (mask === (1 << rest.length) - 1) continue
    const left = rest.filter((_, i) => mask & (1 << i))
    const right = rest.filter((_, i) => !(mask & (1 << i)))
    for (const share of [0.38, 0.45, 0.5, 0.55, 0.62]) {
      const lw = (width - COLUMN_GAP) * share
      const rw = width - COLUMN_GAP - lw
      if (lw < Math.max(...left.map(widest)) || rw < Math.max(...right.map(widest))) continue
      const a = column(left, lw, heading, 0, topHeight)
      const b = column(right, rw, heading, a.w + COLUMN_GAP, topHeight + COLUMN_STEP)
      const score = Math.max(a.h, b.h + COLUMN_STEP) + Math.abs(a.h - b.h) * 0.15
      if (score < bestScore) {
        bestScore = score
        best = { items: [...a.items, ...b.items], w: a.w + COLUMN_GAP + b.w, h: Math.max(a.h, b.h + COLUMN_STEP) }
      }
    }
  }
  return { items: [...items, ...best.items], w: Math.max(top?.w ?? 0, best.w), h: topHeight + best.h }
}

interface Island {
  items: Placed[]
  w: number
  h: number
  /** How far its coast reaches from its middle, each way. */
  bounds: { left: number; right: number; top: number; bottom: number }
}

const byReading = (a: Box['piece'], b: Box['piece']) => {
  const def = districtOf(a.kind)
  return def.kinds.indexOf(a.kind) - def.kinds.indexOf(b.kind) || a.title.localeCompare(b.title, 'en', { sensitivity: 'base' })
}

/** An area's own arrangement, centred on (0, 0), at whichever width comes closest to the shape the screen wants. */
function drawIsland(pieces: Box['piece'][], aspect: number, seed: string): Island {
  const heading = pieces.length >= HEADINGS_FROM
  const groups = DISTRICTS.map((d) => pieces.filter((p) => d.kinds.includes(p.kind)).sort(byReading).map(boxOf))
  const tools = groups[0]
  const rest = groups.slice(1).filter((g) => g.length)
  const boxes = groups.flat()
  const area = boxes.reduce((sum, b) => sum + (b.w + GUTTER) * b.h, 0)
  const least = widest(boxes)
  const ideal = Math.sqrt(area * aspect)
  let best: { items: Placed[]; w: number; h: number } | null = null
  let bestScore = Infinity
  for (let f = 0.6; f <= 1.9; f += 0.08) {
    const width = Math.max(least, ideal * f)
    const a = arrange(tools, rest, width, heading)
    const shape = Math.abs(Math.log((a.w + SHORE * 2) / (a.h + SHORE * 2)) - Math.log(aspect))
    const score = shape + 0.5 * ((a.w * a.h) / Math.max(area, 1) - 1)
    if (score < bestScore) {
      bestScore = score
      best = a
    }
  }
  const { items, w, h } = best!
  const byId = new Map(pieces.map((p) => [p.id, p]))
  const centred = items.map((i) => ({ ...i, x: i.x - w / 2, y: i.y - h / 2 }))
  const shore = shoresOf(groundOf(centred.map((i) => ({ piece: byId.get(i.id)!, x: i.x, y: i.y }))), seed).flat()
  return {
    items: centred,
    w,
    h,
    bounds: {
      left: Math.min(...shore.map((c) => c[0])),
      right: Math.max(...shore.map((c) => c[0])),
      top: Math.min(...shore.map((c) => c[1])),
      bottom: Math.max(...shore.map((c) => c[1])),
    },
  }
}

/** How much room an area's name and the line under it need at least, and the least an area takes across, so that line has room too. */
const NAME_ROOM = world(56)
const LEAST_ACROSS = world(190)
const AREA_GAP = world(14)

/**
 * Areas in rows, in the order they're listed, each with room for what it holds.
 * The screen's shape picks the rows: a landscape map fits a laptop, a tall one fits a phone.
 * Each is nudged a little off the line, so it reads as islands and not as a table.
 * Type doesn't shrink with the map, so the bigger the map, the more ground its names need between the rows.
 */
const perRowOf = (areas: number, wide: boolean) => Math.max(1, wide ? Math.round(Math.sqrt(areas * 1.6)) : Math.round(Math.sqrt(areas / 2)))

function placeAreas(ordered: { id: string; island: Island }[], wide: boolean): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  if (!ordered.length) return out
  const perRow = perRowOf(ordered.length, wide)
  const across = (i: Island) => Math.max(i.bounds.right - i.bounds.left, LEAST_ACROSS)
  const down = (i: Island) => i.bounds.bottom - i.bounds.top
  const rows: { id: string; island: Island }[][] = []
  for (let i = 0; i < ordered.length; i += perRow) rows.push(ordered.slice(i, i + perRow))
  const widthOf = (row: { island: Island }[], gap: number) => row.reduce((sum, c) => sum + across(c.island), 0) + gap * (row.length - 1)
  const heightOf = (row: { island: Island }[]) => Math.max(...row.map((c) => down(c.island)))
  // About the zoom this map will open at, on about this shape of screen.
  const [screenW, screenH] = wide ? [1000, 620] : [360, 620]
  const fit = Math.min(screenW / Math.max(...rows.map((r) => widthOf(r, AREA_GAP))), (screenH - rows.length * 48) / rows.reduce((sum, r) => sum + heightOf(r), 0), 1)
  const nameRoom = Math.max(NAME_ROOM, 50 / Math.max(fit, 0.05))
  const gap = Math.max(AREA_GAP, 14 / Math.max(fit, 0.05))
  let y = 0
  rows.forEach((cells, row) => {
    const width = widthOf(cells, gap)
    const height = heightOf(cells)
    let x = -width / 2 + (row % 2 ? world(10) : world(-10))
    cells.forEach((c, col) => {
      const w = across(c.island)
      const b = c.island.bounds
      // Its coast, not its contents, is what's centred in the cell.
      out.set(c.id, { x: x + w / 2 - (b.left + b.right) / 2, y: y + height / 2 - (b.top + b.bottom) / 2 + (col % 2 ? world(6) : world(-6)) })
      x += w + gap
    })
    y += height + nameRoom
  })
  for (const c of out.values()) c.y -= (y - nameRoom) / 2
  return out
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** What an item takes up on the land: its mark and its name. */
export function footprint(p: Box['piece'], x: number, y: number): Rect {
  const box = boxOf(p)
  return { x: x - MARK / 2, y: y - box.h / 2, w: box.w, h: box.h }
}

/** The same, with a margin to the right, because the land shrinks as you zoom out and the words don't. */
function ground(p: Box['piece'], x: number, y: number): Rect {
  const r = footprint(p, x, y)
  return { ...r, w: r.w + world(10) }
}

const touches = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/**
 * Puts a new item into an area someone has arranged by hand, without moving anything: at the end of its own kind's last row
 * if there's room, or else in the nearest free spot beside its own kind. A kind that isn't there yet starts under everything else.
 */
function placeInto(piece: Piece, inArea: { piece: Box['piece']; x: number; y: number }[]): { x: number; y: number } {
  const def = districtOf(piece.kind)
  const own = inArea.filter((o) => districtOf(o.piece.kind) === def)
  const taken = inArea.map((o) => footprint(o.piece, o.x, o.y))
  // Other kinds keep their ground, gaps included, or this one would end up scattered among them.
  for (const d of DISTRICTS) {
    if (d === def) continue
    const members = inArea.filter((o) => d.kinds.includes(o.piece.kind))
    if (!members.length) continue
    const boxes = members.map((o) => footprint(o.piece, o.x, o.y))
    const left = Math.min(...boxes.map((r) => r.x))
    const top = Math.min(...boxes.map((r) => r.y))
    taken.push({ x: left, y: top - HEADING, w: Math.max(...boxes.map((r) => r.x + r.w)) - left, h: Math.max(...boxes.map((r) => r.y + r.h)) - top + HEADING })
  }
  const clear = (x: number, y: number) => {
    const r = footprint(piece, x, y)
    return !taken.some((t) => touches(t, { x: r.x - GUTTER / 2, y: r.y, w: r.w + GUTTER, h: r.h }))
  }
  const boxes = own.map((o) => footprint(o.piece, o.x, o.y))
  let startX: number
  let startY: number
  if (own.length) {
    const last = Math.max(...own.map((o) => o.y))
    const lastRow = own.filter((o) => Math.abs(o.y - last) < ROW / 2)
    const end = Math.max(...lastRow.map((o) => footprint(o.piece, o.x, o.y)).map((r) => r.x + r.w))
    const x = end + GUTTER + MARK / 2
    if (x - MARK / 2 + boxOf(piece).w <= Math.max(...boxes.map((r) => r.x + r.w)) && clear(x, last)) return { x, y: last }
    startX = Math.min(...own.map((o) => o.x))
    startY = last + ROW
  } else {
    startX = Math.min(...inArea.map((o) => o.x))
    startY = Math.max(...inArea.map((o) => o.y)) + HEADING + BLOCK_GAP + ROW
  }
  // The nearest free spot on a lattice of rows and columns, down and to the right before up and to the left.
  const spots: { x: number; y: number; cost: number }[] = []
  for (let j = -14; j <= 40; j++) {
    for (let i = -8; i <= 8; i++) spots.push({ x: startX + i * world(70), y: startY + j * ROW, cost: Math.abs(i) * 2.4 + (j < 0 ? -j * 1.6 : j) })
  }
  spots.sort((a, b) => a.cost - b.cost)
  return spots.find((s) => clear(s.x, s.y)) ?? { x: startX, y: startY + 41 * ROW }
}

/**
 * Gives every unplaced item a position. Mutates nothing: returns the positions that changed.
 * A map still as it was drawn is drawn again with the newcomers in it, so it stays in order.
 * Once someone has moved something by hand it's theirs: what's placed stays put unless they ask.
 */
export function layoutPieces(gates: Gate[], pieces: Piece[], opts: { reflow?: boolean; wide?: boolean; room?: number } = {}): Map<string, { x: number; y: number }> {
  const isPlaced = (p: Piece) => !opts.reflow && p.x !== undefined && p.y !== undefined
  if (pieces.every(isPlaced)) return new Map()
  const wide = opts.wide ?? true
  if (pieces.some(isPlaced)) {
    const here = pieces.filter(isPlaced)
    const asDrawn = layoutPieces(gates, here, { reflow: true, wide, room: opts.room })
    if (here.every((p) => Math.abs(asDrawn.get(p.id)!.x - p.x!) < 0.5 && Math.abs(asDrawn.get(p.id)!.y - p.y!) < 0.5)) return layoutPieces(gates, pieces, { reflow: true, wide, room: opts.room })
  }
  // Each island takes the shape that lets the whole map fill the screen it's drawn on, so its names keep their room.
  const landed = gates.filter((g) => pieces.some((p) => p.gate === g.id)).length || 1
  const perRow = perRowOf(landed, wide)
  const rows = Math.ceil(landed / perRow)
  const aspect = clamp(((opts.room ?? (wide ? 1.45 : 0.6)) * rows * 1.12) / perRow, 0.85, 1.7)

  const out = new Map<string, { x: number; y: number }>()
  const round = (n: number) => Math.round(n * 10) / 10
  const inGate = (id: string) => pieces.filter((p) => p.gate === id)
  const anyPlaced = pieces.some(isPlaced)

  // An area with nothing placed yet gets drawn whole. An area with nothing in it has no land, so it takes no room.
  const fresh = gates
    .filter((g) => inGate(g.id).length && !inGate(g.id).some(isPlaced))
    .map((g) => ({ id: g.id, island: drawIsland(inGate(g.id), aspect, seedOf(g)) }))

  const write = (island: Island, at: { x: number; y: number }) => {
    for (const i of island.items) out.set(i.id, { x: round(at.x + i.x), y: round(at.y + i.y) })
  }

  if (!anyPlaced) {
    const centres = placeAreas(fresh, wide)
    for (const f of fresh) write(f.island, centres.get(f.id)!)
    return out
  }

  // A new area on a map that already has land goes beside it, not on top of it.
  let east = -Infinity
  for (const p of pieces) if (isPlaced(p)) east = Math.max(east, footprint(p, p.x!, p.y!).x + footprint(p, p.x!, p.y!).w)
  for (const f of fresh) {
    const b = f.island.bounds
    const across = Math.max(b.right - b.left, LEAST_ACROSS)
    write(f.island, { x: east + world(40) + AREA_GAP + across / 2 - (b.left + b.right) / 2, y: 0 })
    east += world(40) + AREA_GAP + across
  }

  // New items in areas that are already drawn keep what's there where you know it.
  for (const g of gates) {
    const here = inGate(g.id)
    if (!here.some(isPlaced)) continue
    const known = here.filter(isPlaced).map((p) => ({ piece: p, x: p.x!, y: p.y! }))
    for (const p of [...here.filter((q) => !isPlaced(q))].sort(byReading)) {
      const at = placeInto(p, known)
      known.push({ piece: p, ...at })
      out.set(p.id, { x: round(at.x), y: round(at.y) })
    }
  }
  return out
}

export interface Territory {
  gate: string
  outer: Path2D
  cx: number
  cy: number
  minX: number
  maxX: number
  minY: number
  maxY: number
  /** The land's left and right at each height. */
  spans: Float32Array
}

/** Chaikin corner cutting, so lines read as drawn curves rather than grid steps. */
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

/** Passes of a box blur, which is close enough to a Gaussian after three. */
function blur(field: Float32Array, n: number, m: number, radius: number) {
  const scratch = new Float32Array(field.length)
  const pass = (from: Float32Array, to: Float32Array, step: number, lines: number, length: number, across: number) => {
    const span = radius * 2 + 1
    for (let l = 0; l < lines; l++) {
      const base = l * across
      let sum = 0
      for (let i = -radius; i <= radius; i++) sum += from[base + Math.min(length - 1, Math.max(0, i)) * step]
      for (let i = 0; i < length; i++) {
        to[base + i * step] = sum / span
        sum += from[base + Math.min(length - 1, i + radius + 1) * step] - from[base + Math.max(0, i - radius) * step]
      }
    }
  }
  for (let t = 0; t < 3; t++) {
    pass(field, scratch, 1, m, n, n)
    pass(scratch, field, n, n, m, 1)
  }
}

// Its id and not its name, or renaming an area would redraw its coast.
const seedOf = (gate: Gate) => gate.id

/** What sits on an area's land: every item's mark and name, and each kind's name over its first row. */
function groundOf(own: { piece: Box['piece']; x: number; y: number }[]): Rect[] {
  const rects = own.map((o) => ground(o.piece, o.x, o.y))
  if (own.length >= HEADINGS_FROM) {
    for (const d of DISTRICTS) {
      const members = own.filter((o) => d.kinds.includes(o.piece.kind))
      if (!members.length) continue
      const top = Math.min(...members.map((m) => m.y))
      const left = Math.min(...members.map((m) => m.x)) - MARK / 2
      rects.push({ x: left, y: top - ROW / 2 - HEADING, w: world(70), h: HEADING })
    }
  }
  return rects
}

/** Whatever sits together shares a shore. Something dragged well away from the rest gets a little land of its own, as an island off the coast. */
function clusters(rects: Rect[]): Rect[][] {
  const reach = world(90)
  const parent = rects.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]
      const b = rects[j]
      if (a.x - reach < b.x + b.w && a.x + a.w + reach > b.x && a.y - reach < b.y + b.h && a.y + a.h + reach > b.y) parent[find(i)] = find(j)
    }
  }
  const groups = new Map<number, Rect[]>()
  rects.forEach((r, i) => {
    const key = find(i)
    const list = groups.get(key)
    if (list) list.push(r)
    else groups.set(key, [r])
  })
  return [...groups.values()]
}

function resample(ring: number[][], step: number): number[][] {
  const lengths = [0]
  for (let i = 1; i < ring.length; i++) lengths.push(lengths[i - 1] + Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]))
  const total = lengths[lengths.length - 1]
  const count = Math.max(8, Math.round(total / step))
  const out: number[][] = []
  let j = 0
  for (let i = 0; i < count; i++) {
    const s = (i / count) * total
    while (j < lengths.length - 2 && lengths[j + 1] < s) j++
    const t = (s - lengths[j]) / (lengths[j + 1] - lengths[j] || 1)
    out.push([ring[j][0] + (ring[j + 1][0] - ring[j][0]) * t, ring[j][1] + (ring[j + 1][1] - ring[j][1]) * t])
  }
  return out
}

/**
 * Smooth noise laid over the ground itself, not along the line. So moving one item changes the coast near it and nowhere else.
 * Noise that ran along the line would re-roll the whole island whenever its length changed, and spatial memory is the point.
 */
function groundNoise(seed: number, wavelength: number) {
  const corner = (i: number, j: number) => {
    let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 1442695041)
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1
  }
  return (x: number, y: number) => {
    const u = x / wavelength
    const v = y / wavelength
    const i = Math.floor(u)
    const j = Math.floor(v)
    const a = u - i
    const b = v - j
    const sx = a * a * (3 - 2 * a)
    const sy = b * b * (3 - 2 * b)
    const top = corner(i, j) * (1 - sx) + corner(i + 1, j) * sx
    const bottom = corner(i, j + 1) * (1 - sx) + corner(i + 1, j + 1) * sx
    return top * (1 - sy) + bottom * sy
  }
}

/** Distance from the nearest filled cell, in cells. Two sweeps of a chamfer, which is close enough for a line this smooth. */
function chamfer(dist: Float32Array, n: number, m: number) {
  const E = Math.SQRT2
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      if (i > 0) dist[k] = Math.min(dist[k], dist[k - 1] + 1)
      if (j > 0) {
        dist[k] = Math.min(dist[k], dist[k - n] + 1)
        if (i > 0) dist[k] = Math.min(dist[k], dist[k - n - 1] + E)
        if (i < n - 1) dist[k] = Math.min(dist[k], dist[k - n + 1] + E)
      }
    }
  }
  for (let j = m - 1; j >= 0; j--) {
    for (let i = n - 1; i >= 0; i--) {
      const k = j * n + i
      if (i < n - 1) dist[k] = Math.min(dist[k], dist[k + 1] + 1)
      if (j < m - 1) {
        dist[k] = Math.min(dist[k], dist[k + n] + 1)
        if (i < n - 1) dist[k] = Math.min(dist[k], dist[k + n + 1] + E)
        if (i > 0) dist[k] = Math.min(dist[k], dist[k + n - 1] + E)
      }
    }
  }
}

/** Gaussian smoothing along the length of a closed line: how a cartographer's line is generalised. Bays and headlands stay, lumps go. */
function generalise(ring: number[][], sigma: number): number[][] {
  const n = ring.length
  const reach = Math.ceil(sigma * 2.5)
  const weights: number[] = []
  for (let k = -reach; k <= reach; k++) weights.push(Math.exp(-(k * k) / (2 * sigma * sigma)))
  const total = weights.reduce((a, b) => a + b, 0)
  return ring.map((_, i) => {
    let x = 0
    let y = 0
    for (let k = -reach; k <= reach; k++) {
      const p = ring[((i + k) % n + n) % n]
      x += p[0] * weights[k + reach]
      y += p[1] * weights[k + reach]
    }
    return [x / total, y / total]
  })
}

/**
 * Grid contours as drawn lines, smoothed along their length, as the coast is. A line taken straight off a grid shows its corners up close,
 * and comes to a flat end in a narrow bay. Anything shorter than `shortest` is dropped, because a tiny ring draws the eye and says nothing.
 */
function drawnLines(coords: number[][][][], cell: number, ox: number, oy: number, sigma: number, shortest = 0): Path2D {
  const path = new Path2D()
  for (const polygon of coords) {
    for (const ring of polygon) {
      const placed = ring.map(([x, y]) => [x * cell + ox, y * cell + oy])
      if (shortest && placed.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - placed[i][0], p[1] - placed[i][1]), 0) < shortest) continue
      generalise(resample(placed, 4), sigma).forEach(([x, y], i) => {
        if (i) path.lineTo(x, y)
        else path.moveTo(x, y)
      })
      path.closePath()
    }
  }
  return path
}

function pointInRing(ring: number[][], x: number, y: number): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[j]
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) hit = !hit
  }
  return hit
}

/** Moves any point of the line that has come too close to what's on the land back out to a clear distance. */
function keepClear(ring: number[][], rects: Rect[], margin: number): number[][] {
  return ring.map(([x, y]) => {
    let nearest = Infinity
    let dx = 0
    let dy = 0
    for (const r of rects) {
      const ax = Math.max(r.x - x, 0, x - (r.x + r.w))
      const ay = Math.max(r.y - y, 0, y - (r.y + r.h))
      const d = Math.hypot(ax, ay)
      if (d === 0) {
        // Actually inside it, which is where a fold in the line comes from. Out by the shortest way.
        const left = x - r.x
        const right = r.x + r.w - x
        const up = y - r.y
        const down = r.y + r.h - y
        const least = Math.min(left, right, up, down)
        if (least === left) return [r.x - margin, y]
        if (least === right) return [r.x + r.w + margin, y]
        if (least === up) return [x, r.y - margin]
        return [x, r.y + r.h + margin]
      }
      if (d < nearest) {
        nearest = d
        dx = x < r.x ? -ax : ax
        dy = y < r.y ? -ay : ay
      }
    }
    if (nearest >= margin) return [x, y]
    return [x + (dx / nearest) * (margin - nearest), y + (dy / nearest) * (margin - nearest)]
  })
}

const normalAt = (ring: number[][], i: number, span: number) => {
  const n = ring.length
  const a = ring[(i + n - span) % n]
  const b = ring[(i + span) % n]
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l = Math.hypot(dx, dy) || 1
  return [dy / l, -dx / l]
}

/**
 * The shore a printed map would give it. Drawn at one distance from what's on the land, so it comes in where there's nothing to hold
 * and goes out around what's there, then generalised into a few long, sure curves. A slow wander stops it reading as an offset,
 * and at the very end comes the small unevenness of a line drawn by hand: quiet stretches and busier ones.
 * Everything on the land stays inside it with room to spare, whatever the curves do.
 */
function shoreOf(rects: Rect[], seed: number): number[][] {
  const left = Math.min(...rects.map((r) => r.x))
  const right = Math.max(...rects.map((r) => r.x + r.w))
  const top = Math.min(...rects.map((r) => r.y))
  const bottom = Math.max(...rects.map((r) => r.y + r.h))
  const cell = Math.max(10, Math.max(right - left, bottom - top) / 90)
  // A bigger island stands further off its contents, or its curves have no room and it comes out as a torn rectangle.
  const scale = clamp((right - left + (bottom - top)) / 1100, 1, 3.2)
  const margin = SHORE * scale
  const offset = margin * 1.7
  // Closed before it's offset: anything narrower than twice this is filled in, because a coast with fingers of sea reaching between its contents reads as a mistake.
  const closing = offset + world(46) * scale
  const pad = closing + cell * 4
  const minX = left - pad
  const minY = top - pad
  const n = Math.ceil((right - left + pad * 2) / cell)
  const m = Math.ceil((bottom - top + pad * 2) / cell)
  const dist = new Float32Array(n * m).fill(1e6)
  for (const r of rects) {
    const ax = Math.max(0, Math.floor((r.x - minX) / cell))
    const bx = Math.min(n, Math.ceil((r.x + r.w - minX) / cell))
    const ay = Math.max(0, Math.floor((r.y - minY) / cell))
    const by = Math.min(m, Math.ceil((r.y + r.h - minY) / cell))
    for (let j = ay; j < by; j++) dist.fill(0, j * n + ax, j * n + bx)
  }
  chamfer(dist, n, m)
  // A morphological closing, in two distance fields: out by the closing distance, then back in, stopping short of the contents by the offset.
  const fromSea = new Float32Array(n * m)
  for (let i = 0; i < n * m; i++) fromSea[i] = dist[i] * cell > closing ? 0 : 1e6
  chamfer(fromSea, n, m)
  const level = contours().size([n, m]).smooth(true).thresholds([(closing - offset) / cell])(Array.from(fromSea))[0]
  let outline: number[][] = []
  for (const polygon of level.coordinates as number[][][][]) if (polygon[0].length > outline.length) outline = polygon[0]
  outline = outline.map(([x, y]) => [x * cell + minX, y * cell + minY])

  const STEP = 12
  const perimeter = outline.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - outline[i][0], p[1] - outline[i][1]), 0)
  const eased = generalise(resample(outline, STEP), (Math.max(52, perimeter * 0.03) * Math.sqrt(scale)) / STEP)
  // Measured from what's on the land, so the same noise lands in the same place wherever the island is put.
  const ox = rects.reduce((sum, r) => sum + r.x + r.w / 2, 0) / rects.length
  const oy = rects.reduce((sum, r) => sum + r.y + r.h / 2, 0) / rects.length
  const long = groundNoise(seed + 1, 560)
  const longer = groundNoise(seed + 2, 1000)
  // The bigger the island, the smaller it's drawn, so fine detail stays fine on screen instead of turning into a nervous edge.
  const fine = ([[120, 3.2], [58, 2], [26, 1.1], [13, 0.5]] as const).map(([length, a], i) => ({ n: groundNoise(seed + 3 + i, length), a: a / scale }))
  const stretch = groundNoise(seed + 9, 500)

  const draw = (gesture: number): number[][] => {
    // Its own character: a shoulder here, a long shallow bight there.
    let line = eased.map((p, i) => {
      const [nx, ny] = normalAt(eased, i, 3)
      const d = (world(17) * long(p[0] - ox, p[1] - oy) + world(27) * longer(p[0] - ox, p[1] - oy)) * gesture
      return [p[0] + nx * d, p[1] + ny * d]
    })
    // Anything that's come too close goes back out, and the line is eased again, so a correction never shows as a corner.
    for (let t = 0; t < 4; t++) line = generalise(keepClear(line, rects, margin), 3 * scale)
    line = generalise(keepClear(line, rects, margin * 0.7), 1.5)

    // The hand. Fine detail only in stretches, as on a real coast, and small enough to stay off the words.
    const dense = resample([...line, line[0]], 6)
    const drawn = dense.map((p, i) => {
      const [nx, ny] = normalAt(dense, i, 3)
      const x = p[0] - ox
      const y = p[1] - oy
      const busy = 0.15 + 0.85 * Math.pow(0.5 + 0.5 * stretch(x, y), 1.6)
      let d = 0
      for (const o of fine) d += o.n(x, y) * o.a * busy
      return [p[0] + nx * d, p[1] + ny * d]
    })
    drawn.push(drawn[0])
    return smooth(drawn)
  }

  // The promise is that everything stands on its land. keepClear can't tell which side of the line is the sea, so a wander that carries the line
  // past a corner goes unnoticed there. This checks the finished coast, and if it doesn't hold what's on it, draws a quieter one.
  const corners = rects.flatMap((r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]])
  const holds = (ring: number[][]) => corners.every(([x, y]) => pointInRing(ring, x, y))
  // A small island gets a small gesture. The same wander on one with two things on it would fold the line across them.
  const gesture = scale * clamp(perimeter / 2200, 0.2, 1)
  let ring: number[][] = []
  for (const share of [1, 0.6, 0.3, 0]) {
    ring = draw(gesture * share)
    if (holds(ring)) break
  }
  return ring
}

/**
 * An island packed square with things has nowhere for its coast to go, so it comes out as a box. Real land runs on past what's built on it.
 * So each sizeable island gets one cape of empty ground, off its bottom or its right, near a corner, always the same one for the same area.
 * The area's name stands on the top edge and the kinds' names line up on the left, so those stay as they are.
 */
function capeOf(rects: Rect[], n: number): Rect | null {
  const left = Math.min(...rects.map((r) => r.x))
  const right = Math.max(...rects.map((r) => r.x + r.w))
  const top = Math.min(...rects.map((r) => r.y))
  const bottom = Math.max(...rects.map((r) => r.y + r.h))
  const w = right - left
  const h = bottom - top
  if (w < world(150) || h < world(110)) return null
  const reach = world(40) * clamp((w + h) / 1500, 1, 2.2)
  const low = (n >> 3) % 2 === 0
  const late = (n >> 7) % 2 === 0
  if (low) {
    const across = w * 0.34
    return { x: late ? right - across : left, y: bottom, w: across, h: reach }
  }
  const down = h * 0.36
  return { x: right, y: late ? bottom - down : top + h * 0.12, w: reach, h: down }
}

function shoresOf(rects: Rect[], seed: string): number[][][] {
  const n = hashOf(seed)
  return clusters(rects).map((group) => {
    const cape = capeOf(group, n)
    return shoreOf(cape ? [...group, cape] : group, n)
  })
}

/** An area's coast as lines, with no drawing involved. */
export const shoreRings = (gate: Gate, own: { piece: Box['piece']; x: number; y: number }[]): number[][][] => shoresOf(groundOf(own), seedOf(gate))

/** A kind's line has to know how much land there is at the height it stands at. Each band of height holds the land's left and right. */
const SPAN_STEP = 8

function spansOf(rings: number[][][], minY: number, maxY: number): Float32Array {
  const bands = Math.ceil((maxY - minY) / SPAN_STEP) + 1
  const spans = new Float32Array(bands * 2)
  for (let i = 0; i < bands; i++) {
    spans[i * 2] = Infinity
    spans[i * 2 + 1] = -Infinity
  }
  for (const ring of rings) {
    for (const [x, y] of ring) {
      const b = Math.floor((y - minY) / SPAN_STEP)
      spans[b * 2] = Math.min(spans[b * 2], x)
      spans[b * 2 + 1] = Math.max(spans[b * 2 + 1], x)
    }
  }
  return spans
}

/** How far the land reaches, left and right, all the way between these two heights. */
export function landBetween(t: Territory, top: number, bottom: number): [number, number] {
  const bands = t.spans.length / 2
  // Heights past the land's ends count as its ends, or a line hanging from the very top would find no land at all.
  const a = clamp(Math.floor((top - t.minY) / SPAN_STEP), 0, bands - 1)
  const b = clamp(Math.floor((bottom - t.minY) / SPAN_STEP), 0, bands - 1)
  let lo = -Infinity
  let hi = Infinity
  for (let i = a; i <= b; i++) {
    lo = Math.max(lo, t.spans[i * 2])
    hi = Math.min(hi, t.spans[i * 2 + 1])
  }
  return [lo, hi]
}

/** The coast of each area, drawn around what's on the land, words included, so a name never has to hang over the sea. */
export function buildTerritories(gates: Gate[], items: { piece: Box['piece']; gate: string; x: number; y: number }[]): Territory[] {
  const out: Territory[] = []
  for (const gate of gates) {
    const own = items.filter((p) => p.gate === gate.id)
    if (!own.length) continue
    const rings = shoresOf(groundOf(own), seedOf(gate))
    const outer = new Path2D()
    for (const ring of rings) {
      ring.forEach(([x, y], i) => {
        if (i) outer.lineTo(x, y)
        else outer.moveTo(x, y)
      })
      outer.closePath()
    }
    const flat = rings.flat()
    const px = flat.map((c) => c[0])
    const py = flat.map((c) => c[1])
    out.push({
      gate: gate.id,
      outer,
      cx: own.reduce((a, b) => a + b.x, 0) / own.length,
      cy: own.reduce((a, b) => a + b.y, 0) / own.length,
      minX: Math.min(...px),
      maxX: Math.max(...px),
      minY: Math.min(...py),
      maxY: Math.max(...py),
      spans: spansOf(rings, Math.min(...py), Math.max(...py)),
    })
  }
  return out
}

/**
 * Water lines: the fine lines an engraver ran around a coast, in the sea. They follow the shore closely and relax as they go out,
 * and where two islands are close their lines meet between them, so they can never cross.
 */
export function buildWaterlines(territories: Territory[], spacing: number[]): Path2D[] {
  if (!territories.length) return []
  const margin = spacing[spacing.length - 1] + 40
  const minX = Math.min(...territories.map((t) => t.minX)) - margin
  const minY = Math.min(...territories.map((t) => t.minY)) - margin
  const maxX = Math.max(...territories.map((t) => t.maxX)) + margin
  const maxY = Math.max(...territories.map((t) => t.maxY)) + margin
  const cell = Math.max(7, Math.max(maxX - minX, maxY - minY) / 420)
  const n = Math.ceil((maxX - minX) / cell)
  const m = Math.ceil((maxY - minY) / cell)
  const canvas = document.createElement('canvas')
  canvas.width = n
  canvas.height = m
  const c = canvas.getContext('2d', { willReadFrequently: true })!
  c.setTransform(1 / cell, 0, 0, 1 / cell, -minX / cell, -minY / cell)
  c.fillStyle = '#000'
  for (const t of territories) c.fill(t.outer)
  const pixels = c.getImageData(0, 0, n, m).data
  const dist = new Float32Array(n * m)
  for (let i = 0; i < n * m; i++) dist[i] = pixels[i * 4 + 3] > 127 ? 0 : 1e6
  chamfer(dist, n, m)
  blur(dist, n, m, 1)
  // Invert so contours() sees the shore as high ground.
  const inverted = Array.from(dist, (d) => -d * cell)
  const lines = contours().size([n, m]).smooth(true).thresholds(spacing.map((d) => -d))(inverted)
  return lines.filter((l) => l.coordinates.length).map((l) => drawnLines(l.coordinates as number[][][][], cell, minX, minY, 8))
}

/**
 * Quiet terrain for the empty map, in the same hand as the coasts: long, easy lines and no little rings.
 * It's worked out past the edge of the screen, so no line has to turn along the edge.
 */
export function buildEmptyTerrain(width: number, height: number): Path2D[] {
  const random = seeded(23)
  const over = 140
  const pts: { x: number; y: number }[] = []
  for (let c = 0; c < 11; c++) {
    let cx = random() * width
    const cy = random() * height
    // Keep the terrain out from behind the words in the middle.
    if (Math.abs(cx - width / 2) < width * 0.3 && Math.abs(cy - height / 2) < height * 0.28) cx = cx < width / 2 ? width * 0.1 : width * 0.9
    const spread = 60 + random() * 150
    for (let i = 0; i < 26; i++) {
      pts.push({ x: over + cx + (random() - 0.5) * spread * 2, y: over + cy + (random() - 0.5) * spread * 2 })
    }
  }
  const terrain = contourDensity<{ x: number; y: number }>()
    .x((p) => p.x)
    .y((p) => p.y)
    .size([width + over * 2, height + over * 2])
    .cellSize(6)
    .bandwidth(58)
    .thresholds(7)(pts)
    .filter((c) => c.coordinates.length)
  return terrain.map((c) => drawnLines(c.coordinates as number[][][][], 1, -over, -over, 16, 420))
}
