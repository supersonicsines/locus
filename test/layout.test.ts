// The map's order: the same company gets the same geography, like things sit together, and nothing lands on anything else.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSample } from '../src/core/sample.ts'
import type { Gate, Piece, PieceKind } from '../src/core/types.ts'
import { DISTRICTS, footprint, layoutPieces, shoreRings, wrapTitle } from '../src/studio/map/layout.ts'

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

const shapes: [string, () => { gates: Gate[]; pieces: Piece[] }][] = [
  ['the sample', sample],
  ['3 items', () => bigMap(1, 3, 1)],
  ['40 in one area', () => bigMap(1, 40, 10)],
  ['300 in six', () => bigMap(6, 300, 60)],
  ['300 in twelve', () => bigMap(12, 300, 60)],
]

test('every mark and name stands on its own land, and no two coasts touch', () => {
  for (const [name, make] of shapes) {
    const { gates, pieces } = make()
    const placed = withPositions(pieces, layoutPieces(gates, pieces))
    const boxes: { gate: string; minX: number; maxX: number; minY: number; maxY: number }[] = []
    for (const g of gates) {
      const own = placed.filter((p) => p.gate === g.id).map((p) => ({ piece: p, x: p.x!, y: p.y! }))
      if (!own.length) continue
      const rings = shoreRings(g, own)
      assert.equal(rings.length, 1, `${name}: ${g.name} came apart`)
      for (const o of own) {
        const r = footprint(o.piece, o.x, o.y)
        for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) assert.ok(inside(rings[0], x, y), `${name}: ${o.piece.title} is over the coast`)
      }
      const xs = rings[0].map((p) => p[0])
      const ys = rings[0].map((p) => p[1])
      boxes.push({ gate: g.id, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) })
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        assert.ok(a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY, `${name}: ${a.gate} and ${b.gate} touch`)
      }
    }
  }
})

test('moving one item changes the coast near it and leaves the rest alone', () => {
  const { gates, pieces } = sample()
  const placed = withPositions(pieces, layoutPieces(gates, pieces))
  const g = gates.find((x) => x.id === 'engineering')!
  const own = placed.filter((p) => p.gate === g.id).map((p) => ({ piece: p, x: p.x!, y: p.y! }))
  const before = shoreRings(g, own)[0]
  // The last thing in the area, moved a little further on, as you might by hand.
  const moved = own.reduce((a, b) => (b.y > a.y ? b : a))
  const after = shoreRings(g, own.map((o) => (o === moved ? { ...o, y: o.y + 60 } : o)))[0]
  const far = after.filter(([x, y]) => Math.hypot(x - moved.x, y - moved.y) > 420)
  assert.ok(far.length > 40)
  let worst = 0
  for (const [x, y] of far) worst = Math.max(worst, Math.min(...before.map((p) => Math.hypot(p[0] - x, p[1] - y))))
  assert.ok(worst < 24, `the far side of the coast moved ${worst.toFixed(1)}`)
})

test('renaming an area leaves its coast where it was', () => {
  const { gates, pieces } = sample()
  const placed = withPositions(pieces, layoutPieces(gates, pieces))
  const g = gates[0]
  const own = placed.filter((p) => p.gate === g.id).map((p) => ({ piece: p, x: p.x!, y: p.y! }))
  assert.deepEqual(shoreRings({ ...g, name: 'Something else' }, own), shoreRings(g, own))
})

test('a small island keeps everything on it, whatever its shore does', () => {
  // The coast has its own character per area, so this tries many areas at each small size. A fold in the line shows up as something over the coast.
  for (let items = 1; items <= 9; items++) {
    for (let seed = 0; seed < 24; seed++) {
      const gate: Gate = { id: `area-${seed}`, name: 'Money' }
      const kinds: PieceKind[] = ['service', 'fact', 'rule', 'doc', 'spec']
      const pieces: Piece[] = Array.from({ length: items }, (_, i) => ({ id: `p${i}`, kind: kinds[(i + seed) % kinds.length], title: i % 3 === 2 ? 'A longer name that has to wrap onto two lines' : `Item ${i}`, summary: '', body: '', gate: gate.id, updatedAt: 1 }))
      const placed = withPositions(pieces, layoutPieces([gate], pieces))
      const own = placed.map((p) => ({ piece: p, x: p.x!, y: p.y! }))
      const rings = shoreRings(gate, own)
      assert.equal(rings.length, 1)
      for (const o of own) {
        const r = footprint(o.piece, o.x, o.y)
        for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) assert.ok(inside(rings[0], x, y), `${items} items, seed ${seed}: ${o.piece.title} is over the coast`)
      }
    }
  }
})
