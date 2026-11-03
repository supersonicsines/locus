// The map's order: the same company gets the same geography, like things sit together, and nothing lands on anything else.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSample } from '../src/core/sample.ts'
import type { Gate, Piece, PieceKind } from '../src/core/types.ts'
import { DISTRICTS, footprint, landShape, layoutPieces, restorePositions, wrapTitle } from '../src/studio/map/layout.ts'

const withPositions = (pieces: Piece[], moved: Map<string, { x: number; y: number }>) => pieces.map((p) => ({ ...p, ...moved.get(p.id) }))

const fresh = (pieces: Piece[]) => pieces.map(({ x: _x, y: _y, ...p }) => p as Piece)

const sample = () => {
  const v = createSample()
  return { gates: v.gates, pieces: fresh(v.pieces) }
}

function bigMap(areas: number, items: number, services: number): { gates: Gate[]; pieces: Piece[] } {
  const gates = Array.from({ length: areas }, (_, i) => ({ id: `g${i}`, name: `Area ${i}` }))
  const kinds: PieceKind[] = ['rule', 'fact', 'decision', 'clause', 'spec', 'token', 'contract', 'person', 'doc']
  const pieces = Array.from({ length: items }, (_, i): Piece => ({
    id: `p${i}`,
    kind: i < services ? 'service' : kinds[i % kinds.length],
    title: i % 7 === 0 ? `A much longer name for item number ${i}` : `Item ${i}`,
    summary: '',
    body: '',
    gate: `g${i % areas}`,
    updatedAt: 1,
  }))
  return { gates, pieces }
}

// Positions are saved to a tenth, so rows that touch can look a tenth too close. A real collision is more than that.
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1

function assertNothingLandsOnAnything(pieces: Piece[]) {
  const boxes = pieces.map((p) => ({ title: p.title, box: footprint(p, p.x!, p.y!) }))
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlap(boxes[i].box, boxes[j].box), `${boxes[i].title} lands on ${boxes[j].title}`)
  }
}

test('the same company always gets the same geography', () => {
  const { gates, pieces } = sample()
  const a = layoutPieces(gates, pieces)
  const b = layoutPieces(gates, pieces)
  assert.deepEqual([...a], [...b])
  assert.equal(a.size, pieces.length)
})

test('nothing lands on anything else, at any size', () => {
  const small = sample()
  assertNothingLandsOnAnything(withPositions(small.pieces, layoutPieces(small.gates, small.pieces)))
  for (const [areas, items, services] of [[1, 3, 1], [3, 3, 1], [1, 40, 10], [6, 100, 25], [6, 300, 60], [12, 300, 60]]) {
    const big = bigMap(areas, items, services)
    assertNothingLandsOnAnything(withPositions(big.pieces, layoutPieces(big.gates, big.pieces)))
  }
})

test('things of one kind sit together, and tools stand at the top of every area', () => {
  const { gates, pieces } = sample()
  const placed = withPositions(pieces, layoutPieces(gates, pieces))
  for (const g of gates) {
    const here = placed.filter((p) => p.gate === g.id)
    const boxes = DISTRICTS.map((d) => here.filter((p) => d.kinds.includes(p.kind))).filter((m) => m.length).map((m) => ({
      ids: m.map((p) => p.title),
      minX: Math.min(...m.map((p) => p.x!)),
      maxX: Math.max(...m.map((p) => p.x!)),
      minY: Math.min(...m.map((p) => p.y!)),
      maxY: Math.max(...m.map((p) => p.y!)),
    }))
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        assert.ok(!(a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY), `${a.ids[0]} is mixed in with ${b.ids[0]}`)
      }
    }
    const tools = here.filter((p) => p.kind === 'service')
    const rest = here.filter((p) => p.kind !== 'service')
    if (tools.length && rest.length) assert.ok(Math.max(...tools.map((p) => p.y!)) < Math.min(...rest.map((p) => p.y!)), `${g.name}: a tool is below something else`)
  }
})

test('a map still as it was drawn stays in order when something new arrives', () => {
  const { gates, pieces } = sample()
  const placed = withPositions(pieces, layoutPieces(gates, pieces))
  const added: Piece = { id: 'new-rule', kind: 'rule', title: 'A brand new rule', summary: '', body: '', gate: 'legal', updatedAt: 1 }
  const after = withPositions([...placed, added], layoutPieces(gates, [...placed, added]))
  assertNothingLandsOnAnything(after)
  const rules = after.filter((p) => p.gate === 'legal' && p.kind === 'rule')
  assert.ok(Math.abs(rules[0].x! - rules[1].x!) < 300 && Math.abs(rules[0].y! - rules[1].y!) < 120, 'the new rule is not with the other rule')
  const facts = after.filter((p) => p.gate === 'legal' && p.kind === 'fact')
  const between = facts.some((f) => f.y! > Math.min(...rules.map((r) => r.y!)) && f.y! < Math.max(...rules.map((r) => r.y!)) && f.x! === rules[0].x!)
  assert.ok(!between, 'a fact has ended up among the rules')
})

test('once something is moved by hand, new items move nothing else', () => {
  const { gates, pieces } = sample()
  const placed = withPositions(pieces, layoutPieces(gates, pieces))
  const dragged = placed.map((p, i) => (i === 0 ? { ...p, x: p.x! - 4000, y: p.y! - 4000 } : p))
  const added: Piece[] = [{ id: 'new-rule', kind: 'rule', title: 'A brand new rule', summary: '', body: '', gate: 'legal', updatedAt: 1 }, { id: 'new-spec', kind: 'spec', title: 'A plan nothing here has yet', summary: '', body: '', gate: 'brand', updatedAt: 1 }]
  const moved = layoutPieces(gates, [...dragged, ...added])
  assert.deepEqual([...moved.keys()].sort(), ['new-rule', 'new-spec'])
  assertNothingLandsOnAnything(withPositions([...dragged, ...added], moved))
})

test('an area with no land takes no room, and on a map arranged by hand a new area goes beside what is there', () => {
  const { gates, pieces } = sample()
  const placed = withPositions(pieces, layoutPieces(gates, pieces)).map((p, i) => (i === 0 ? { ...p, x: p.x! - 40 } : p))
  const east = Math.max(...placed.map((p) => p.x!))
  const moved = layoutPieces([...gates, { id: 'new', name: 'New' }], [...placed, { id: 'n1', kind: 'fact', title: 'First thing here', summary: '', body: '', gate: 'new', updatedAt: 1 }])
  assert.equal(moved.size, 1)
  assert.ok(moved.get('n1')!.x > east)
  assert.deepEqual(layoutPieces([{ id: 'empty', name: 'Empty' }], []), new Map())
})

test('long names wrap at a word, and a name with no spaces is cut, not lost', () => {
  assert.deepEqual(wrapTitle('Short'), { lines: ['Short'], cut: false })
  assert.equal(wrapTitle('Migrations are reviewed by a person').lines.length, 2)
  assert.equal(wrapTitle('a'.repeat(60)).cut, true)
})

const inside = (ring: number[][], x: number, y: number) => {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[j]
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) hit = !hit
  }
  return hit
}

const itemsOf = (pieces: Piece[]) => pieces.map((p) => ({ piece: p, gate: p.gate, x: p.x!, y: p.y! }))

const corners = (p: Piece) => {
  const r = footprint(p, p.x!, p.y!)
  return [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]
}

const shapes: [string, () => { gates: Gate[]; pieces: Piece[] }][] = [
  ['the sample', sample],
  ['3 items', () => bigMap(1, 3, 1)],
  ['40 in one area', () => bigMap(1, 40, 10)],
  ['100 in six', () => bigMap(6, 100, 25)],
  ['300 in six', () => bigMap(6, 300, 60)],
  ['300 in twelve', () => bigMap(12, 300, 60)],
]

test('every mark and name stands on land, and on its own area\'s land', () => {
  for (const [name, make] of shapes) {
    const { gates, pieces } = make()
    const placed = withPositions(pieces, layoutPieces(gates, pieces))
    const shape = landShape(gates, itemsOf(placed))
    for (const p of placed) {
      const area = shape.provinces.find((a) => a.gate === p.gate)!
      for (const [x, y] of corners(p)) {
        assert.ok(shape.coast.some((ring) => inside(ring, x, y)), `${name}: ${p.title} is over the coast`)
        assert.ok(area.onLand(x, y), `${name}: ${p.title} is on another area's land`)
      }
    }
  }
})

test('a map arranged on a phone holds everything on its own land too', () => {
  const { gates, pieces } = sample()
  const placed = withPositions(pieces, layoutPieces(gates, pieces, { wide: false, room: 0.55 }))
  const shape = landShape(gates, itemsOf(placed))
  for (const p of placed) {
    const area = shape.provinces.find((a) => a.gate === p.gate)!
    for (const [x, y] of corners(p)) assert.ok(area.onLand(x, y), `${p.title} is off its land`)
  }
})

test('all the land inside the coast belongs to an area, so a click there always finds one', () => {
  for (const [name, make] of shapes) {
    const { gates, pieces } = make()
    const placed = withPositions(pieces, layoutPieces(gates, pieces))
    const shape = landShape(gates, itemsOf(placed))
    const flat = shape.coast.flat()
    const xs = flat.map((c) => c[0])
    const ys = flat.map((c) => c[1])
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const step = Math.max(40, (maxX - minX) / 60)
    let tried = 0
    for (let x = minX; x < maxX; x += step) {
      for (let y = minY; y < maxY; y += step) {
        if (!shape.coast.some((ring) => inside(ring, x, y))) continue
        // The line is drawn by hand over the field, so it can stray a little either side of it right at the shore.
        if (flat.some((c) => Math.abs(c[0] - x) < 14 && Math.abs(c[1] - y) < 14)) continue
        tried++
        const owners = shape.provinces.filter((a) => a.onLand(x, y))
        assert.equal(owners.length, 1, `${name}: land at ${x.toFixed(0)}, ${y.toFixed(0)} has ${owners.length} areas`)
      }
    }
    assert.ok(tried > 50, `${name}: this tested nothing`)
  }
})

test('a coast never crosses itself', () => {
  const crosses = (p: number[], q: number[], r: number[], t: number[]) => {
    const side = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    return side(p, q, r) * side(p, q, t) < 0 && side(r, t, p) * side(r, t, q) < 0
  }
  for (const [name, make] of shapes) {
    const { gates, pieces } = make()
    const placed = withPositions(pieces, layoutPieces(gates, pieces))
    for (const ring of landShape(gates, itemsOf(placed)).coast) {
      for (let i = 0; i < ring.length - 1; i++) {
        for (let j = i + 2; j < Math.min(ring.length - 1, i + 60); j++) {
          assert.ok(!crosses(ring[i], ring[i + 1], ring[j], ring[j + 1]), `${name}: the coast crosses itself near ${ring[i][0].toFixed(0)}, ${ring[i][1].toFixed(0)}`)
        }
      }
    }
  }
})

test('the same places always get the same coast', () => {
  const { gates, pieces } = sample()
  const placed = withPositions(pieces, layoutPieces(gates, pieces))
  assert.deepEqual(landShape(gates, itemsOf(placed)).coast, landShape(gates, itemsOf(placed)).coast)
})

test('moving one item changes the coast near it and leaves the rest alone', () => {
  const { gates, pieces } = sample()
  const placed = withPositions(pieces, layoutPieces(gates, pieces))
  const before = landShape(gates, itemsOf(placed)).coast.flat()
  // The last thing in Engineering, moved a little further on, as you might by hand.
  const moved = placed.filter((p) => p.gate === 'engineering').reduce((a, b) => (b.y! > a.y! ? b : a))
  const after = landShape(gates, itemsOf(placed.map((p) => (p === moved ? { ...p, y: p.y! + 60 } : p)))).coast.flat()
  const far = after.filter(([x, y]) => Math.hypot(x - moved.x!, y - moved.y!) > 420)
  assert.ok(far.length > 40)
  let worst = 0
  for (const [x, y] of far) {
    let nearest = Infinity
    for (const p of before) nearest = Math.min(nearest, (p[0] - x) ** 2 + (p[1] - y) ** 2)
    worst = Math.max(worst, Math.sqrt(nearest))
  }
  assert.ok(worst < 8, `the far side of the coast moved ${worst.toFixed(1)}`)
})

test('renaming an area leaves the land where it was', () => {
  const { gates, pieces } = sample()
  const placed = withPositions(pieces, layoutPieces(gates, pieces))
  const renamed = gates.map((g, i) => (i ? g : { ...g, name: 'Something else' }))
  const a = landShape(gates, itemsOf(placed))
  const b = landShape(renamed, itemsOf(placed))
  assert.deepEqual(a.coast, b.coast)
  assert.deepEqual(a.borders, b.borders)
})

test('a small area keeps everything on it, wherever on the ground it falls', () => {
  // The coast comes from noise on the ground, so the way to try many coasts is to stand the same area in many places.
  for (let items = 1; items <= 9; items++) {
    for (let seed = 0; seed < 24; seed++) {
      const gate: Gate = { id: 'money', name: 'Money' }
      const kinds: PieceKind[] = ['service', 'fact', 'rule', 'doc', 'spec']
      const pieces: Piece[] = Array.from({ length: items }, (_, i) => ({ id: `p${i}`, kind: kinds[(i + seed) % kinds.length], title: i % 3 === 2 ? 'A longer name that has to wrap onto two lines' : `Item ${i}`, summary: '', body: '', gate: gate.id, updatedAt: 1 }))
      const placed = withPositions(pieces, layoutPieces([gate], pieces)).map((p) => ({ ...p, x: p.x! + seed * 613, y: p.y! - seed * 397 }))
      const shape = landShape([gate], itemsOf(placed))
      for (const p of placed) for (const [x, y] of corners(p)) assert.ok(shape.coast.some((ring) => inside(ring, x, y)), `${items} items, seed ${seed}: ${p.title} is over the coast`)
    }
  }
})

test('something dragged far from the rest gets land of its own, and the area keeps its name', () => {
  const { gates, pieces } = sample()
  const placed = withPositions(pieces, layoutPieces(gates, pieces))
  const before = landShape(gates, itemsOf(placed)).provinces.find((a) => a.gate === placed[0].gate)!
  const lost = placed.map((p, i) => (i === 0 ? { ...p, x: p.x! - 3000, y: p.y! - 3000 } : p))
  const shape = landShape(gates, itemsOf(lost))
  const island = shape.coast.filter((ring) => corners(lost[0]).every(([x, y]) => inside(ring, x, y)))
  assert.equal(island.length, 1, `${lost[0].title} is in the sea`)
  for (const p of lost.slice(1)) for (const [x, y] of corners(p)) assert.ok(!inside(island[0], x, y), `${p.title} shares its island`)
  const after = shape.provinces.find((a) => a.gate === placed[0].gate)!
  assert.ok(Math.abs(after.nameX - before.nameX) < 200 && Math.abs(after.nameY - before.nameY) < 200, 'the name went with it')
  // Only one new piece of land. Its kind's name doesn't get an island of its own somewhere between it and home.
  assert.equal(shape.coast.length, landShape(gates, itemsOf(placed)).coast.length + 1)
})

test('columns in one area start level', () => {
  const { gates, pieces } = sample()
  const placed = withPositions(pieces, layoutPieces(gates, pieces))
  let sideBySide = 0
  for (const g of gates) {
    const rest = DISTRICTS.slice(1).map((d) => placed.filter((p) => p.gate === g.id && d.kinds.includes(p.kind))).filter((m) => m.length)
    // The top of a kind's first row. A two-line row's mark stands in its middle, so that comes off.
    const topOf = (m: Piece[]) => Math.min(...m.map((p) => footprint(p, p.x!, p.y!).y))
    const left = (m: Piece[]) => Math.min(...m.map((p) => p.x!))
    const firstInColumn = rest.filter((m) => !rest.some((o) => o !== m && left(o) === left(m) && topOf(o) < topOf(m)))
    if (firstInColumn.length < 2) continue
    sideBySide++
    const tops = firstInColumn.map(topOf)
    assert.ok(Math.max(...tops) - Math.min(...tops) < 1, `${g.name}: its columns start at ${tops.join(' and ')}`)
  }
  assert.ok(sideBySide >= 4, 'the sample has stopped using columns, so this tests nothing')
})

test('undoing a redraw puts things back, and leaves alone what has arrived or gone since', () => {
  const { pieces } = sample()
  const before: Piece[] = pieces.map((p, i) => ({ ...p, x: i * 10, y: i * 20 }))
  const redrawn: Piece[] = before.map((p) => ({ ...p, x: 999, y: 999 }))
  const restored = restorePositions(redrawn, before)
  assert.deepEqual(restored.map((p) => [p.id, p.x, p.y]), before.map((p) => [p.id, p.x, p.y]))
  const newer: Piece = { ...redrawn[0], id: 'arrived-since', x: 5, y: 6 }
  const later = restorePositions([...redrawn.slice(1), newer], before)
  assert.equal(later.length, redrawn.length)
  assert.deepEqual([later[later.length - 1].x, later[later.length - 1].y], [5, 6])
  assert.ok(!later.some((p) => p.id === redrawn[0].id))
})
