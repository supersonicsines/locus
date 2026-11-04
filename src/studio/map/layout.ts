// Places items on the map. Deterministic, so the same company always gets the same geography,
// and positions are saved, because spatial memory is the point.
//
// Inside an area, like things sit together under a name, in the same places in every area:
// tools along the top, rules on the left, and paperwork, plans and facts beside them.
// Every name reads to the right of its mark, so a map can be read along and you can learn its shape.

import { contours } from 'd3-contour'
import type { Gate, Piece, PieceKind } from '../../core/types.ts'

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** The zoom a map is drawn for. Here and a little below, every name has room. Sizes below are the pixels they come to at this zoom. */
export const DESIGN_K = 0.5
const world = (px: number) => px / DESIGN_K

const MARK = world(18)
const TO_NAME = world(5)
const GUTTER = world(17)
const ROW = world(22)
// Two lines of a name take 13 px more than one, so a tall row is 12 px taller and the gap under it is the same.
const ROW_TALL = world(34)
const HEADING = world(18)
const BLOCK_GAP = world(11)
const COLUMN_GAP = world(22)
/** How far the coast stands off what's on the land, at the least. */
const SHORE = world(19)

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
  // More of a kind than a person would count gets more columns, or a long list becomes a very tall thin country.
  let cols = Math.max(1, Math.min(boxes.length, Math.max(5, Math.ceil(Math.sqrt(boxes.length)) + 2)))
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
      const b = column(right, rw, heading, a.w + COLUMN_GAP, topHeight)
      const score = Math.max(a.h, b.h) + Math.abs(a.h - b.h) * 0.15
      if (score < bestScore) {
        bestScore = score
        best = { items: [...a.items, ...b.items], w: a.w + COLUMN_GAP + b.w, h: Math.max(a.h, b.h) }
      }
    }
  }
  return { items: [...items, ...best.items], w: Math.max(top?.w ?? 0, best.w), h: topHeight + best.h }
}

interface Island {
  items: Placed[]
  w: number
  h: number
}

const byReading = (a: Box['piece'], b: Box['piece']) => {
  const def = districtOf(a.kind)
  return def.kinds.indexOf(a.kind) - def.kinds.indexOf(b.kind) || a.title.localeCompare(b.title, 'en', { sensitivity: 'base', numeric: true })
}

/** An area's own arrangement, centred on (0, 0), at whichever width comes closest to the shape the screen wants. */
function drawIsland(pieces: Box['piece'][], aspect: number): Island {
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
    const shape = Math.abs(Math.log((a.w + SHORE * 2) / (a.h + NAME_ROOM + SHORE * 2)) - Math.log(aspect))
    const score = shape + 0.5 * ((a.w * a.h) / Math.max(area, 1) - 1)
    if (score < bestScore) {
      bestScore = score
      best = a
    }
  }
  const { items, w, h } = best!
  return { items: items.map((i) => ({ ...i, x: i.x - w / 2, y: i.y - h / 2 })), w, h }
}

/** How much room an area's name and the line under it take on the land, at the least, and the least an area takes across, so that line has room too. */
const NAME_ROOM = world(58)
const LEAST_ACROSS = world(210)
/** What the name itself takes on the land. Less than an area takes across, so a small area doesn't get a big empty country. */
const NAME_ACROSS = world(130)
/** Between what's on one area and what's on the next: room for two margins and a border. */
const AREA_GAP = world(42)
const ROW_GAP = world(30)

/** About the zoom this much map opens at. */
const openingZoom = (across: number, down: number) => Math.max(Math.min(1000 / Math.max(across, 1), 620 / Math.max(down, 1), 1), 0.05)

/**
 * How much ground a name and the line under it need at that zoom. Type doesn't shrink with the map, so the bigger the map, the more they take.
 * In steps, so a small change to the map doesn't move every border.
 */
const nameRoomFor = (across: number, down: number) => Math.ceil(Math.max(NAME_ROOM, 58 / openingZoom(across, down)) / 40) * 40
const nameAcrossFor = (across: number, down: number) => Math.ceil(Math.max(NAME_ACROSS, 200 / openingZoom(across, down)) / 40) * 40

/**
 * Areas in rows, in the order they're listed, each with room for what it holds.
 * The screen's shape picks the rows: a landscape map fits a laptop, a tall one fits a phone.
 * Each is nudged a little off the line, so it reads as a country and not as a table.
 */
const perRowOf = (areas: number, wide: boolean) => Math.max(1, wide ? Math.round(Math.sqrt(areas * 1.6)) : Math.round(Math.sqrt(areas / 2)))

function placeAreas(ordered: { id: string; island: Island }[], wide: boolean): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  if (!ordered.length) return out
  const perRow = perRowOf(ordered.length, wide)
  const across = (i: Island) => Math.max(i.w, LEAST_ACROSS)
  const rows: { id: string; island: Island }[][] = []
  for (let i = 0; i < ordered.length; i += perRow) rows.push(ordered.slice(i, i + perRow))
  const widthOf = (row: { island: Island }[], gap: number) => row.reduce((sum, c) => sum + across(c.island), 0) + gap * (row.length - 1)
  const heightOf = (row: { island: Island }[]) => Math.max(...row.map((c) => c.island.h))
  const contentAcross = Math.max(...rows.map((r) => widthOf(r, AREA_GAP)))
  const contentDown = rows.reduce((sum, r) => sum + heightOf(r), 0)
  // About the zoom this map will open at, on about this shape of screen. Type doesn't shrink, so a big map needs wider gaps too.
  const [screenW, screenH] = wide ? [1000, 620] : [360, 620]
  const fit = Math.min(screenW / contentAcross, (screenH - rows.length * 74) / contentDown, 1)
  const nameRoom = nameRoomFor(contentAcross, contentDown + rows.length * NAME_ROOM) + world(20)
  const gap = Math.max(AREA_GAP, 30 / Math.max(fit, 0.05))
  let y = 0
  rows.forEach((cells, row) => {
    const width = widthOf(cells, gap)
    const height = heightOf(cells)
    let x = -width / 2 + (row % 2 ? world(10) : world(-10))
    // The top of what's on the land lines up along a row, give or take a nudge, so names can be read across it.
    y += row ? nameRoom : 0
    cells.forEach((c, col) => {
      const w = across(c.island)
      out.set(c.id, { x: x + c.island.w / 2, y: y + c.island.h / 2 + (col % 2 ? world(5) : world(-5)) })
      x += w + gap
    })
    y += height + ROW_GAP
  })
  for (const c of out.values()) c.y -= (y - ROW_GAP) / 2
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

/** The ground an area needs: what's on it, room for its name above, and room across for that name and the line under it. */
function claimOf(boxes: Rect[]): Rect {
  const x = Math.min(...boxes.map((r) => r.x))
  const y = Math.min(...boxes.map((r) => r.y))
  const w = Math.max(LEAST_ACROSS, Math.max(...boxes.map((r) => r.x + r.w)) - x)
  const bottom = Math.max(...boxes.map((r) => r.y + r.h))
  return { x, y: y - NAME_ROOM - world(20), w, h: bottom - y + NAME_ROOM + world(20) }
}

/**
 * Where a new area goes, among those already there: beside or under one of them, wherever nothing's in the way and the whole map comes closest to the shape of the room.
 * Always beside the end of a row would give a long thin sausage, with no room for any name.
 */
function beside(claimed: Rect[], island: Island, room: number): { centre: { x: number; y: number }; claim: Rect } {
  const w = Math.max(island.w, LEAST_ACROSS)
  const h = island.h + NAME_ROOM + world(20)
  const clear = (x: number, y: number) =>
    !claimed.some((c) => x < c.x + c.w + AREA_GAP && x + w + AREA_GAP > c.x && y < c.y + c.h + ROW_GAP && y + h + ROW_GAP > c.y)
  const left = Math.min(...claimed.map((c) => c.x))
  const right = Math.max(...claimed.map((c) => c.x + c.w))
  const top = Math.min(...claimed.map((c) => c.y))
  const bottom = Math.max(...claimed.map((c) => c.y + c.h))
  const spots: [number, number][] = [[right + AREA_GAP, top], [left, bottom + ROW_GAP]]
  for (const c of claimed) spots.push([c.x + c.w + AREA_GAP, c.y], [c.x, c.y + c.h + ROW_GAP])
  let best: [number, number] = spots[0]
  let bestScore = Infinity
  for (const [x, y] of spots) {
    if (!clear(x, y)) continue
    const across = Math.max(right, x + w) - Math.min(left, x)
    const down = Math.max(bottom, y + h) - Math.min(top, y)
    // The room's shape first, and between two as good, the one that leaves the least empty corner.
    const score = Math.abs(Math.log(across / down) - Math.log(room)) + 0.15 * ((across * down) / ((right - left) * (bottom - top) + w * h) - 1)
    if (score < bestScore) {
      bestScore = score
      best = [x, y]
    }
  }
  const [x, y] = best
  return { centre: { x: x + island.w / 2, y: y + NAME_ROOM + world(20) + island.h / 2 }, claim: { x, y, w, h } }
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
  // Each area's contents take the shape that lets the whole map fill the screen it's drawn on, so its names keep their room.
  const landed = gates.filter((g) => pieces.some((p) => p.gate === g.id)).length || 1
  const perRow = perRowOf(landed, wide)
  const rows = Math.ceil(landed / perRow)
  const aspect = clamp(((opts.room ?? (wide ? 1.45 : 0.6)) * rows * 1.12) / perRow, 0.85, 1.9)

  const out = new Map<string, { x: number; y: number }>()
  const round = (n: number) => Math.round(n * 10) / 10
  const inGate = (id: string) => pieces.filter((p) => p.gate === id)
  const anyPlaced = pieces.some(isPlaced)

  // An area with nothing placed yet gets drawn whole. An area with nothing in it has no land, so it takes no room.
  const fresh = gates
    .filter((g) => inGate(g.id).length && !inGate(g.id).some(isPlaced))
    .map((g) => ({ id: g.id, island: drawIsland(inGate(g.id), aspect) }))

  const write = (island: Island, at: { x: number; y: number }) => {
    for (const i of island.items) out.set(i.id, { x: round(at.x + i.x), y: round(at.y + i.y) })
  }

  if (!anyPlaced) {
    const centres = placeAreas(fresh, wide)
    for (const f of fresh) write(f.island, centres.get(f.id)!)
    return out
  }

  // A new area on a map that already has land goes where the map stays the shape of the screen, not on top of anything.
  const claimed = gates.flatMap((g) => {
    const here = inGate(g.id).filter(isPlaced)
    return here.length ? [claimOf(here.map((p) => footprint(p, p.x!, p.y!)))] : []
  })
  for (const f of fresh) {
    const at = beside(claimed, f.island, opts.room ?? (wide ? 1.45 : 0.6))
    write(f.island, at.centre)
    claimed.push(at.claim)
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

/** Puts things back where they were, for an Undo. Anything added since stays where it is, and an item that's gone stays gone. */
export function restorePositions(pieces: Piece[], before: Piece[]): Piece[] {
  const old = new Map(before.map((p) => [p.id, p]))
  return pieces.map((p) => {
    const was = old.get(p.id)
    return was ? { ...p, x: was.x, y: was.y } : p
  })
}

export interface Territory {
  gate: string
  /** The land nearest what's on this area. It runs on past the coast, so anything drawn with it is clipped to `coast`. */
  outer: Path2D
  /** The whole country's coast, shared by every area. */
  coast: Path2D
  cx: number
  cy: number
  /** How far this area's land reaches, each way. */
  minX: number
  maxX: number
  minY: number
  maxY: number
  /** Where what's on it starts: the left of its first mark's middle, and the middle of its first row. */
  nameX: number
  nameY: number
  /** What's on it, name included. The fit goes by this and not by the land, which may run on under the panels, as a map runs off its sheet. */
  holds: { minX: number; maxX: number; minY: number; maxY: number }
  /** The land's left and right at each height. */
  spans: Float32Array
  /** Whether this point is this area's land, from the grid the land was drawn from, so it's cheap enough to ask inside a frame. */
  onLand(x: number, y: number): boolean
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

/** The largest lot of things that sit together. Something dragged well away gets its own little land, and the area's name stays with the rest. */
export function mainGroup<T extends { piece: Box['piece']; x: number; y: number }>(own: T[]): T[] {
  const reach = world(120)
  const boxes = own.map((o) => footprint(o.piece, o.x, o.y))
  const parent = own.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < own.length; i++) {
    for (let j = i + 1; j < own.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.x - reach < b.x + b.w && a.x + a.w + reach > b.x && a.y - reach < b.y + b.h && a.y + a.h + reach > b.y) parent[find(i)] = find(j)
    }
  }
  const sizes = new Map<number, T[]>()
  own.forEach((o, i) => {
    const list = sizes.get(find(i))
    if (list) list.push(o)
    else sizes.set(find(i), [o])
  })
  return [...sizes.values()].reduce((a, b) => (b.length > a.length ? b : a))
}

/** What sits on an area's land: every item's mark and name, each kind's name over its first row, and the area's own name over them all. */
function groundOf(own: { piece: Box['piece']; x: number; y: number }[], nameRoom: number, nameAcross: number): Rect[] {
  // Room on the left as well, because a pin's head and a dot stand beside a mark there.
  const rects = own.map((o) => {
    const r = ground(o.piece, o.x, o.y)
    return { ...r, x: r.x - world(14), w: r.w + world(14) }
  })
  const main = mainGroup(own)
  if (own.length >= HEADINGS_FROM) {
    for (const d of DISTRICTS) {
      // Over those at home. Measured over one dragged away as well, a kind's name would get land of its own, out at sea with nothing on it.
      const home = main.filter((o) => d.kinds.includes(o.piece.kind))
      const members = home.length ? home : own.filter((o) => d.kinds.includes(o.piece.kind))
      if (!members.length) continue
      const top = Math.min(...members.map((m) => m.y))
      const left = Math.min(...members.map((m) => m.x)) - MARK / 2
      rects.push({ x: left, y: top - ROW / 2 - HEADING, w: world(70), h: HEADING })
    }
  }
  // Over the main group, not over everything, or one item dragged away would take the area's name with it.
  const left = Math.min(...main.map((o) => o.x)) - MARK / 2
  const top = Math.min(...main.map((o) => o.y)) - ROW / 2 - (own.length >= HEADINGS_FROM ? HEADING : 0)
  // A fixed width and not the name's own, or renaming an area would move its border. No wider than what's under it, or it would take a neighbour's land.
  const under = Math.max(...main.map((o) => footprint(o.piece, o.x, o.y).x + footprint(o.piece, o.x, o.y).w)) - left
  const across = Math.min(nameAcross, Math.max(under, NAME_ACROSS))
  // A few short names don't fill that width. Half the spare goes on the left, so they stand in the middle of their land and not against one side of it.
  const from = left - (across - Math.min(across, under)) / 2
  // The line under the name takes the width. The air above the name doesn't need it, and a square top makes a county bulge up between its neighbours.
  rects.push({ x: from, y: top - nameRoom * 0.6, w: across, h: nameRoom * 0.6 })
  rects.push({ x: from, y: top - nameRoom, w: across * 0.55, h: nameRoom * 0.4 })
  return rects
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

/** Smooth noise laid over the ground itself, so the same place always gets the same coast. */
function groundNoise(seed: number, wavelength: number) {
  const corner = (i: number, j: number) => {
    let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 1442695041)
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1
  }
  // Each layer turned its own way, so no layer's grid lines up with the screen or with another layer's.
  const angle = (((Math.imul(seed + 1, 2654435761) >>> 0) / 4294967296) * Math.PI * 2)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return (x: number, y: number) => {
    const u = (x * cos - y * sin) / wavelength
    const v = (x * sin + y * cos) / wavelength
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

/**
 * Noise whose zero crossings don't come at even intervals. One layer's crossings are nearly evenly spaced, and a crease along them turns a shore into the edge of a stamp.
 * A second layer at a length that doesn't divide into the first breaks that up, and a slow third stretches and squeezes both.
 */
function uneven(seed: number, wavelength: number) {
  const a = groundNoise(seed, wavelength)
  const b = groundNoise(seed + 101, wavelength * 0.618)
  const warpX = groundNoise(seed + 102, wavelength * 2.3)
  const warpY = groundNoise(seed + 103, wavelength * 2.3)
  return (x: number, y: number) => {
    const u = x + warpX(x, y) * wavelength * 0.8
    const v = y + warpY(x, y) * wavelength * 0.8
    return a(u, v) * 0.72 + b(u, v) * 0.42
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

/** Gaussian smoothing along the length of a closed line. */
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

/** Grid contours as drawn lines, smoothed along their length. A line taken straight off a grid shows its corners up close. */
function drawnLines(coords: number[][][][], cell: number, ox: number, oy: number, sigma: number): Path2D {
  const path = new Path2D()
  for (const polygon of coords) {
    for (const ring of polygon) {
      const placed = ring.map(([x, y]) => [x * cell + ox, y * cell + oy])
      generalise(resample(placed, 4), sigma).forEach(([x, y], i) => {
        if (i) path.lineTo(x, y)
        else path.moveTo(x, y)
      })
      path.closePath()
    }
  }
  return path
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

/** A smooth maximum, so where one shape takes over from another there's no corner. */
const smax = (a: number, b: number, s: number) => {
  const h = clamp(0.5 + (0.5 * (a - b)) / s, 0, 1)
  return b + (a - b) * h + s * h * (1 - h)
}

/** The drawing of the land, in world units. The seed picks one country among many: this one was chosen by eye on the sample, and every map shares it. */
const LAND = {
  seed: 23,
  /** How far land runs on past what's on it, before anything else. */
  base: 34,
  wander: [[620, 46], [260, 24]],
  /** Headlands: wavelength, how far out, how narrow. */
  heads: [[360, 48, 5], [170, 28, 5]],
  /** Inlets: wavelength, how far in, how narrow. */
  lochs: [[340, 170, 7], [160, 110, 6.5], [74, 46, 4.5], [34, 14, 3]],
  /** The hand: wavelength and size. */
  fine: [[9, 1.5], [18, 2.8], [42, 5]],
  /** Water narrower than twice this between things on the land is filled in, until an inlet says otherwise. */
  closing: world(90),
  /** Water narrower than twice this is land: a firth ends in a head, not a hairline. */
  narrowest: 13,
  /** The shortest coast worth drawing. Anything less is a speck that reads as a stray mark, and nothing on the land is ever this small. */
  shortest: 340,
  /** The least margin around what's on the land, whatever else happens. */
  hard: 20,
  /** The margin it usually gets, and how much that wanders, slowly and quickly. */
  clear: 50,
  slow: 36,
  quick: 16,
  /** How softly the margin gives way to the coast. */
  soft: 22,
  /** How far a block of names is rounded off, in cells, so it doesn't show through as a box. */
  round: 5,
} as const

/**
 * How far land reaches beyond what's on it, at any point on the ground. This is what makes it a coast and not an outline: an inlet is a crease in this field,
 * so it runs inland along a line, narrowing to a point, and it stops by itself at what's on the land, because what's on the land always has its own margin.
 * Long quiet shores come from the slow layers, and fine crinkle only appears on the stretches that are busy, as on any real coast.
 */
function reachOf(size = 1) {
  const t = LAND
  const wander = t.wander.map(([length, a], i) => ({ n: groundNoise(t.seed + 1 + i, length), a }))
  const heads = t.heads.map(([length, depth, sharp], i) => ({ n: groundNoise(t.seed + 11 + i, length), depth, sharp }))
  // The long firths keep their own layer, because that's what gives the country its shape. It's the short creases that come out even.
  const lochs = t.lochs.map(([length, depth, sharp], i) => ({ n: i < 2 ? groundNoise(t.seed + 21 + i, length) : uneven(t.seed + 21 + i, length), depth, sharp, i }))
  const busy = groundNoise(t.seed + 31, 520)
  return (x: number, y: number) => {
    let r = 0
    for (const { n, a } of wander) r += n(x, y) * a
    for (const { n, depth, sharp } of heads) {
      const c = Math.max(0, 1 - Math.abs(n(x, y)) * sharp)
      r += depth * c * c
    }
    const b = clamp(0.5 + busy(x, y) * 1.2, 0, 1)
    for (const { n, depth, sharp, i } of lochs) {
      const c = Math.max(0, 1 - Math.abs(n(x, y)) * sharp)
      r -= depth * c * c * (i < 2 ? 1 : b)
    }
    return t.base + r * size
  }
}

export interface LandShape {
  /** The coast, as closed lines. */
  coast: number[][][]
  provinces: { gate: string; rings: number[][][]; minX: number; maxX: number; minY: number; maxY: number; spans: Float32Array; nameX: number; nameY: number; cx: number; cy: number; holds: { minX: number; maxX: number; minY: number; maxY: number }; onLand(x: number, y: number): boolean }[]
  /** The borders between areas, each once, as open lines. */
  borders: number[][][]
}

/** A kind's line has to know how much land there is at the height it stands at. Each band of height holds the land's left and right. */
const SPAN_STEP = 8

function stamp(d: Float32Array, rects: Rect[], minX: number, minY: number, size: number, w: number, h: number) {
  for (const r of rects) {
    const ax = clamp(Math.floor((r.x - minX) / size), 0, w)
    const bx = clamp(Math.ceil((r.x + r.w - minX) / size), 0, w)
    const ay = clamp(Math.floor((r.y - minY) / size), 0, h)
    const by = clamp(Math.ceil((r.y + r.h - minY) / size), 0, h)
    for (let j = ay; j < by; j++) d.fill(0, j * w + ax, j * w + bx)
  }
  chamfer(d, w, h)
}

/**
 * Where the land is: above zero is land. A coast is one contour of this one field, so whatever is on the land is on the land by construction,
 * because at what's on it the hard margin alone keeps the field above zero, whatever the noise does. Nothing has to be checked afterwards.
 */
function coastField(rects: Rect[], minX: number, minY: number, n: number, m: number, cell: number, size = 1): Float32Array {
  const t = LAND
  const near = new Float32Array(n * m).fill(1e6)
  stamp(near, rects, minX, minY, cell, n, m)
  // Closed first, so narrow water between neighbours is land until an inlet says otherwise.
  const fromSea = new Float32Array(n * m)
  for (let i = 0; i < n * m; i++) fromSea[i] = near[i] * cell > t.closing ? 0 : 1e6
  chamfer(fromSea, n, m)
  const reach = reachOf(size)
  const slow = groundNoise(t.seed + 61, 250)
  const quick = groundNoise(t.seed + 62, 96)
  // The margin is measured from a softened distance, so a block of names doesn't show through as a box.
  const rounded = Float32Array.from(near)
  blur(rounded, n, m, t.round)
  const field = new Float32Array(n * m)
  for (let j = 0; j < m; j++) {
    const y = j * cell + minY
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      const x = i * cell + minX
      // Past the closing distance it's just how far off the land you are, so land can't turn up far out to sea.
      const closed = near[k] * cell > t.closing ? near[k] * cell : Math.max(0, t.closing - fromSea[k] * cell)
      const kept = smax(t.hard - near[k] * cell, t.clear + slow(x, y) * t.slow + quick(x, y) * t.quick - rounded[k] * cell, 10)
      field[k] = smax(kept, reach(x, y) - closed, t.soft)
    }
  }
  // In this order, because closing a narrow mouth can leave what's behind it as a lake.
  closeNarrows(field, n, m, Math.max(1, Math.round(t.narrowest / cell)), cell)
  fillLakes(field, n, m)
  return field
}

/**
 * Water too narrow to read as water becomes land, so a firth ends in a rounded head and not a long sliver.
 * It's a morphological opening of the sea: shrink it, grow it back, and whatever didn't come back was narrower than that.
 */
function closeNarrows(field: Float32Array, n: number, m: number, radius: number, cell: number) {
  const fromLand = new Float32Array(n * m)
  for (let k = 0; k < n * m; k++) fromLand[k] = field[k] > 0 ? 0 : 1e6
  chamfer(fromLand, n, m)
  const fromCore = new Float32Array(n * m)
  for (let k = 0; k < n * m; k++) fromCore[k] = fromLand[k] > radius ? 0 : 1e6
  chamfer(fromCore, n, m)
  for (let k = 0; k < n * m; k++) {
    if (field[k] <= 0 && fromCore[k] > radius) field[k] = cell * 0.5
  }
}

/**
 * An inlet's noise can also dip below zero far inland, where it isn't an inlet at all. That's a lake, and these maps have none: the coast only draws the outside of the land,
 * so what's inside it has to count as land too, or a click there would find no area and a border would stop for no reason.
 */
function fillLakes(field: Float32Array, n: number, m: number) {
  const sea = new Uint8Array(n * m)
  const stack: number[] = []
  const visit = (k: number) => {
    if (!sea[k] && field[k] <= 0) {
      sea[k] = 1
      stack.push(k)
    }
  }
  for (let i = 0; i < n; i++) {
    visit(i)
    visit((m - 1) * n + i)
  }
  for (let j = 0; j < m; j++) {
    visit(j * n)
    visit(j * n + n - 1)
  }
  while (stack.length) {
    const k = stack.pop()!
    const i = k % n
    if (i > 0) visit(k - 1)
    if (i < n - 1) visit(k + 1)
    if (k >= n) visit(k - n)
    if (k < n * (m - 1)) visit(k + n)
  }
  for (let k = 0; k < n * m; k++) if (field[k] <= 0 && !sea[k]) field[k] = 1
}

/** Takes out any little loop where a line has crossed itself, which the hand's unevenness can do in the narrowest inlets. It reads as a slip of the pen. */
function untangle(ring: number[][], reach: number): number[][] {
  const side = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const crosses = (p: number[], q: number[], r: number[], t: number[]) => side(p, q, r) * side(p, q, t) < 0 && side(r, t, p) * side(r, t, q) < 0
  const n = ring.length
  const out: number[][] = []
  for (let i = 0; i < n; i++) {
    out.push(ring[i])
    // The furthest crossing first, so a loop with a loop in it goes in one.
    for (let j = Math.min(n - 2, i + reach); j >= i + 2; j--) {
      if (crosses(ring[i], ring[(i + 1) % n], ring[j], ring[j + 1])) {
        i = j
        break
      }
    }
  }
  return out
}

/** The field's zero contour as a drawn coast, with the small unevenness of a hand on the stretches that are busy. */
function traceCoast(field: Float32Array, minX: number, minY: number, n: number, m: number, cell: number, shortest: number): number[][][] {
  const t = LAND
  const fine = t.fine.map(([length, a], i) => ({ n: groundNoise(t.seed + 41 + i, length), a }))
  const busy = groundNoise(t.seed + 31, 520)
  const out: number[][][] = []
  for (const polygon of contours().size([n, m]).smooth(true).thresholds([0])(field as unknown as number[])[0].coordinates as number[][][][]) {
    const ring = polygon[0].map(([x, y]) => [x * cell + minX, y * cell + minY])
    let length = 0
    for (let i = 1; i < ring.length; i++) length += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1])
    // A speck draws the eye and says nothing.
    if (length < shortest) continue
    const line = generalise(resample(ring, 3.5), 1.3)
    const drawn = line.map((p, i) => {
      const [nx, ny] = normalAt(line, i, 3)
      const b = clamp(0.5 + busy(p[0], p[1]) * 1.2, 0.15, 1)
      let d = 0
      for (const f of fine) d += f.n(p[0], p[1]) * f.a * b
      return [p[0] + nx * d, p[1] + ny * d]
    })
    const clean = untangle(drawn, 60)
    clean.push(clean[0])
    out.push(clean)
  }
  return out
}

/**
 * One country, divided into areas. Every area's land is the ground nearest what's on it, so a border always falls midway between neighbours, and moving something moves
 * only the borders and coast near it. The coast is one contour of one field, so everything on the land is on the land by construction: nothing has to be checked afterwards.
 */
export function landShape(gates: Gate[], items: { piece: Box['piece']; gate: string; x: number; y: number }[]): LandShape {
  const groups = gates.map((g) => ({ gate: g.id, own: items.filter((p) => p.gate === g.id).map((o) => ({ piece: o.piece, x: o.x, y: o.y })) })).filter((g) => g.own.length)
  if (!groups.length) return { coast: [], provinces: [], borders: [] }
  const t = LAND
  const spread = groups.flatMap((g) => g.own)
  const spanX = Math.max(...spread.map((o) => o.x)) - Math.min(...spread.map((o) => o.x))
  const spanY = Math.max(...spread.map((o) => o.y)) - Math.min(...spread.map((o) => o.y))
  const nameRoom = nameRoomFor(spanX, spanY)
  const nameAcross = nameAcrossFor(spanX, spanY)
  const ground = groups.map((g) => groundOf(g.own, nameRoom, nameAcross))
  const all = ground.flat()
  const left = Math.min(...all.map((r) => r.x))
  const right = Math.max(...all.map((r) => r.x + r.w))
  const top = Math.min(...all.map((r) => r.y))
  const bottom = Math.max(...all.map((r) => r.y + r.h))
  // In whole steps, and laid on the ground and not on the map, so a cell stays where it is when the map grows.
  const longest = Math.max(right - left, bottom - top)
  const cell = longest <= 2800 ? 7 : longest <= 5600 ? 14 : longest <= 11200 ? 28 : 56
  const pad = t.closing + 320
  const minX = Math.floor((left - pad) / cell) * cell
  const minY = Math.floor((top - pad) / cell) * cell
  const n = Math.ceil((right + pad - minX) / cell)
  const m = Math.ceil((bottom + pad - minY) / cell)
  // A few things don't need a country: the land's features are drawn smaller, so it stays about what's on it.
  const landField = coastField(all, minX, minY, n, m, cell, clamp(longest / 1400, 0.45, 1))
  const coast = traceCoast(landField, minX, minY, n, m, cell, t.shortest)

  // The areas, on a coarser grid, because a border has no fine detail. Their fields are read through a slow warp, so a border wanders as one does, and the warp dies away near what's on the land.
  const size = cell * 2
  const cn = Math.ceil(n / 2) + 1
  const cm = Math.ceil(m / 2) + 1
  const fields = ground.map((rects) => {
    const d = new Float32Array(cn * cm).fill(1e6)
    stamp(d, rects, minX, minY, size, cn, cm)
    return d
  })
  const warpX = groundNoise(t.seed + 51, 300)
  const warpY = groundNoise(t.seed + 52, 300)
  const warpX2 = groundNoise(t.seed + 53, 120)
  const warpY2 = groundNoise(t.seed + 54, 120)
  const first = new Int16Array(cn * cm)
  const firstD = new Float32Array(cn * cm)
  const secondD = new Float32Array(cn * cm)
  const reads = new Float32Array(groups.length * cn * cm)
  for (let j = 0; j < cm; j++) {
    const y = j * size + minY
    for (let i = 0; i < cn; i++) {
      const x = i * size + minX
      const k = j * cn + i
      let clearance = 1e6
      for (const f of fields) clearance = Math.min(clearance, f[k])
      const amount = clamp((clearance * size) / 70, 0, 1)
      const u = clamp(i + ((warpX(x, y) * 34 + warpX2(x, y) * 11) * amount) / size, 0, cn - 1.001)
      const v = clamp(j + ((warpY(x, y) * 34 + warpY2(x, y) * 11) * amount) / size, 0, cm - 1.001)
      const iu = Math.floor(u)
      const iv = Math.floor(v)
      const fu = u - iu
      const fv = v - iv
      let d1 = Infinity
      let d2 = Infinity
      let g1 = -1
      for (let g = 0; g < fields.length; g++) {
        const f = fields[g]
        const a = iv * cn + iu
        const d = (f[a] * (1 - fu) + f[a + 1] * fu) * (1 - fv) + (f[a + cn] * (1 - fu) + f[a + cn + 1] * fu) * fv
        reads[g * cn * cm + k] = d
        if (d < d1) {
          d2 = d1
          d1 = d
          g1 = g
        } else if (d < d2) {
          d2 = d
        }
      }
      first[k] = g1
      firstD[k] = d1
      secondD[k] = d2
    }
  }
  const landAt = (x: number, y: number) => landField[clamp(Math.round((y - minY) / cell), 0, m - 1) * n + clamp(Math.round((x - minX) / cell), 0, n - 1)]
  const coarseAt = (x: number, y: number) => clamp(Math.round((y - minY) / size), 0, cm - 1) * cn + clamp(Math.round((x - minX) / size), 0, cn - 1)
  const borders: number[][][] = []
  const drawnCells = new Set<number>()
  const HASH = 6
  const hashKey = (i: number, j: number) => i * 131071 + j
  const alreadyDrawn = (x: number, y: number) => {
    const i = Math.round(x / HASH)
    const j = Math.round(y / HASH)
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (drawnCells.has(hashKey(i + a, j + b))) return true
    return false
  }
  let pending: number[][][] = []
  const rings = groups.map((_, g) => {
    if (groups.length === 1) return [[[minX, minY], [minX + n * cell, minY], [minX + n * cell, minY + m * cell], [minX, minY + m * cell], [minX, minY]]]
    const f = new Float32Array(cn * cm)
    for (let k = 0; k < cn * cm; k++) f[k] = first[k] === g ? secondD[k] - firstD[k] : firstD[k] - reads[g * cn * cm + k]
    const out: number[][][] = []
    for (const polygon of contours().size([cn, cm]).smooth(true).thresholds([0])(f as unknown as number[])[0].coordinates as number[][][][]) {
      for (const raw of polygon) {
        // Smoothed enough that where three areas meet there's no spike. More than this rounds each corner away from the others, and leaves a white chip in the middle of a junction.
        const line = generalise(resample(raw.map(([x, y]) => [x * size + minX, y * size + minY]), 5), 2.5)
        line.push(line[0])
        out.push(line)
        // Each stretch of border is shared by two areas. Whichever comes first draws it, so a dashed line doesn't lay itself over itself.
        let run: number[][] = []
        for (const p of line) {
          if (!alreadyDrawn(p[0], p[1]) && landAt(p[0], p[1]) > -cell * 3) run.push(p)
          else {
            if (run.length > 2) borders.push(run)
            run = []
          }
        }
        if (run.length > 2) borders.push(run)
        pending.push(line)
      }
    }
    // Only once the whole area is done, or a ring would count as already drawn by itself.
    for (const line of pending) for (const [x, y] of line) drawnCells.add(hashKey(Math.round(x / HASH), Math.round(y / HASH)))
    pending = []
    return out
  })

  // What each area's land comes to, read off the grid.
  const extent = groups.map(() => ({ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }))
  for (let j = 0; j < m; j++) {
    const y = j * cell + minY
    for (let i = 0; i < n; i++) {
      if (landField[j * n + i] <= 0) continue
      const x = i * cell + minX
      const e = extent[first[coarseAt(x, y)]]
      if (!e) continue
      if (x < e.minX) e.minX = x
      if (x > e.maxX) e.maxX = x
      if (y < e.minY) e.minY = y
      if (y > e.maxY) e.maxY = y
    }
  }
  const spans = extent.map((e) => {
    const bands = Math.max(1, Math.ceil((e.maxY - e.minY) / SPAN_STEP) + 1)
    const span = new Float32Array(bands * 2)
    for (let i = 0; i < bands; i++) {
      span[i * 2] = Infinity
      span[i * 2 + 1] = -Infinity
    }
    return span
  })
  for (let j = 0; j < m; j++) {
    const y = j * cell + minY
    for (let i = 0; i < n; i++) {
      if (landField[j * n + i] <= 0) continue
      const x = i * cell + minX
      const g = first[coarseAt(x, y)]
      const e = extent[g]
      if (!e) continue
      const b = Math.floor((y - e.minY) / SPAN_STEP) * 2
      if (x < spans[g][b]) spans[g][b] = x
      if (x > spans[g][b + 1]) spans[g][b + 1] = x
    }
  }
  return {
    coast,
    borders,
    provinces: groups.map((g, i) => ({
      gate: g.gate,
      rings: rings[i],
      onLand: (x: number, y: number) => landAt(x, y) > 0 && first[coarseAt(x, y)] === i,
      ...extent[i],
      spans: spans[i],
      nameX: Math.min(...mainGroup(g.own).map((o) => o.x)),
      nameY: Math.min(...mainGroup(g.own).map((o) => o.y)),
      holds: {
        minX: Math.min(...ground[i].map((r) => r.x)),
        maxX: Math.max(...ground[i].map((r) => r.x + r.w)),
        minY: Math.min(...ground[i].map((r) => r.y)),
        maxY: Math.max(...ground[i].map((r) => r.y + r.h)),
      },
      cx: g.own.reduce((a, b) => a + b.x, 0) / g.own.length,
      cy: g.own.reduce((a, b) => a + b.y, 0) / g.own.length,
    })),
  }
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

const pathOf = (rings: number[][][], closed: boolean) => {
  const path = new Path2D()
  for (const ring of rings) {
    ring.forEach(([x, y], i) => {
      if (i) path.lineTo(x, y)
      else path.moveTo(x, y)
    })
    if (closed) path.closePath()
  }
  return path
}

export interface Land {
  territories: Territory[]
  coast: Path2D
  borders: Path2D
  /** Where the land is, for the water lines. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}

/** The country as paths to draw. */
export function buildLand(gates: Gate[], items: { piece: Box['piece']; gate: string; x: number; y: number }[]): Land {
  const shape = landShape(gates, items)
  const coast = pathOf(shape.coast, true)
  const flat = shape.coast.flat()
  return {
    coast,
    borders: pathOf(shape.borders, false),
    bounds: {
      minX: Math.min(...flat.map((c) => c[0])),
      maxX: Math.max(...flat.map((c) => c[0])),
      minY: Math.min(...flat.map((c) => c[1])),
      maxY: Math.max(...flat.map((c) => c[1])),
    },
    territories: shape.provinces.map((p) => ({ ...p, outer: pathOf(p.rings, true), coast })),
  }
}

/**
 * Water lines: the fine lines an engraver ran around a coast, in the sea. They follow the shore closely and relax as they go out.
 * There's only one country, so there's nothing for them to neck against, and in an inlet they simply close up.
 */
export function buildWaterlines(land: Pick<Land, 'coast' | 'bounds'>, spacing: number[]): Path2D[] {
  const margin = spacing[spacing.length - 1] + 40
  const minX = land.bounds.minX - margin
  const minY = land.bounds.minY - margin
  const maxX = land.bounds.maxX + margin
  const maxY = land.bounds.maxY + margin
  const cell = Math.max(5, Math.max(maxX - minX, maxY - minY) / 520)
  const n = Math.ceil((maxX - minX) / cell)
  const m = Math.ceil((maxY - minY) / cell)
  const canvas = document.createElement('canvas')
  canvas.width = n
  canvas.height = m
  const c = canvas.getContext('2d', { willReadFrequently: true })!
  c.setTransform(1 / cell, 0, 0, 1 / cell, -minX / cell, -minY / cell)
  c.fillStyle = '#000'
  c.fill(land.coast)
  const pixels = c.getImageData(0, 0, n, m).data
  const dist = new Float32Array(n * m)
  for (let i = 0; i < n * m; i++) dist[i] = pixels[i * 4 + 3] > 127 ? 0 : 1e6
  chamfer(dist, n, m)
  blur(dist, n, m, 1)
  // Invert so contours() sees the shore as high ground.
  const inverted = Array.from(dist, (d) => -d * cell)
  const lines = contours().size([n, m]).smooth(true).thresholds(spacing.map((d) => -d))(inverted)
  return lines.filter((l) => l.coordinates.length).map((l) => drawnLines(l.coordinates as number[][][][], cell, minX, minY, 3))
}

/**
 * The empty map: the same coast, coming in at the corners of the sheet, with open sea in the middle where the words are.
 * Drawn at the scale the map usually opens at, so it's the same hand, and worked out past the edge of the screen, so no line has to turn along the edge.
 */
export function buildEmptyTerrain(width: number, height: number): { land: Path2D; water: Path2D[] } {
  const SCALE = 2
  const W = width * SCALE
  const H = height * SCALE
  const over = 400
  const cell = 12
  const n = Math.ceil((W + over * 2) / cell)
  const m = Math.ceil((H + over * 2) / cell)
  // What the land is there to hold, off in the corners of the sheet. In steps and not one block, or it would come out with a square corner.
  const off = over * 2
  const lumps: [number, number, number, number][] = [
    [-1, 0.7, 0.06, 2], [-1, 0.78, 0.14, 2], [-1, 0.88, 0.2, 2], [-1, 0.95, 0.27, 2],
    [0.97, -1, 2, 0.42], [0.93, -1, 2, 0.34], [0.86, -1, 2, 0.22], [0.8, -1, 2, 0.1],
    [0.95, 0.88, 2, 2], [0.86, 0.95, 2, 2],
  ]
  const across = (f: number) => (f < 0 ? -off : f > 1 ? W + off : f * W)
  const down = (f: number) => (f < 0 ? -off : f > 1 ? H + off : f * H)
  const rects: Rect[] = lumps.map(([a, b, c, d]) => ({ x: across(a), y: down(b), w: across(c) - across(a), h: down(d) - down(b) }))
  const rings = traceCoast(coastField(rects, -over, -over, n, m, cell), -over, -over, n, m, cell, 120).map((ring) => ring.map(([x, y]) => [x / SCALE, y / SCALE]))
  const land = pathOf(rings, true)
  return { land, water: buildWaterlines({ coast: land, bounds: { minX: -over / SCALE, maxX: width + over / SCALE, minY: -over / SCALE, maxY: height + over / SCALE } }, [5, 12, 22]) }
}
