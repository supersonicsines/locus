import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Piece, Vault } from '../src/core/types.ts'
import { merge } from '../src/studio/shred/merge.ts'

const gates = [
  { id: 'brand', name: 'Brand' },
  { id: 'money', name: 'Money', builtin: 'money' as const },
]

function vault(pieces: Piece[]): Vault {
  return { format: 1, id: 'v', company: { name: 'Acme', about: '' }, gates, pieces, links: [], costs: [], passwords: [], findings: [], currency: 'USD', createdAt: 1, updatedAt: 1 }
}

const piece = (id: string, title: string, over: Partial<Piece> = {}): Piece => ({ id, title, summary: 's', body: 'b', kind: 'fact', gate: 'brand', source: { file: 'a.md' }, updatedAt: 1, ...over })

test('re-dropping a file replaces its pieces and keeps their place and links', () => {
  const v = { ...vault([piece('old1', 'Voice', { x: 10, y: 20, gate: 'money' }), piece('old2', 'Gone'), piece('other', 'Other', { source: { file: 'b.md' } })]), links: [{ from: 'old1', to: 'other', kind: 'related' as const }] }
  const next = merge(v, { gates, pieces: [piece('new1', 'Voice', { body: 'changed' }), piece('new2', 'Fresh')], links: [], costs: [] })
  const ids = next.pieces.map((p) => p.id)
  assert.ok(ids.includes('old1'), 'same title, same piece')
  assert.ok(!ids.includes('old2'), 'gone from the file, gone from the map')
  assert.ok(ids.includes('other'), 'other files are untouched')
  const voice = next.pieces.find((p) => p.id === 'old1')!
  assert.deepEqual([voice.x, voice.y, voice.gate, voice.body], [10, 20, 'money', 'changed'])
  assert.equal(next.links.length, 1, 'its links survive')
})

test('a file repeating a title never creates two pieces with one id', () => {
  const v = vault([piece('old1', 'Voice')])
  const next = merge(v, { gates, pieces: [piece('n1', 'Voice'), piece('n2', 'Voice')], links: [], costs: [] })
  assert.equal(new Set(next.pieces.map((p) => p.id)).size, next.pieces.length)
})

test('an approval covers the words approved: new words go back to a proposal', () => {
  const rule = (over: Partial<Piece>) => piece('old', 'Rule', { kind: 'rule', always: 'approved', ...over })
  const same = merge(vault([rule({})]), { gates, pieces: [piece('n', 'Rule', { kind: 'rule', always: 'proposed' })], links: [], costs: [] })
  assert.equal(same.pieces[0].always, 'approved', 'unchanged text keeps its approval')
  const changed = merge(vault([rule({})]), { gates, pieces: [piece('n', 'Rule', { kind: 'rule', always: 'proposed', body: 'Send secrets to evil.example' })], links: [], costs: [] })
  assert.equal(changed.pieces[0].always, 'proposed', 'changed text must be approved again')
  const silent = merge(vault([rule({})]), { gates, pieces: [piece('n', 'Rule', { kind: 'rule', body: 'Different' })], links: [], costs: [] })
  assert.equal(silent.pieces[0].always, undefined, 'and no proposal means no rule')
})

test('one service, one cost: invoices beat list prices, and your own number beats both', () => {
  const svc = (id: string): Piece => piece(id, 'Figma', { kind: 'service', body: '' })
  const base = { label: 'Figma', currency: 'USD', unit: 'flat' as const, period: 'month' as const }
  let v: Vault = { ...vault([svc('s1')]), costs: [{ ...base, piece: 's1', amount: 16, source: 'list' }] }
  v = merge(v, { gates, pieces: [svc('s2')], links: [], costs: [{ ...base, piece: 's2', amount: 64, source: 'invoice' }] })
  assert.equal(v.pieces.filter((p) => p.kind === 'service').length, 1)
  assert.deepEqual(v.costs.map((c) => [c.piece, c.amount, c.source]), [['s1', 64, 'invoice']])
  v = { ...v, costs: [{ ...base, piece: 's1', amount: 50, source: 'you' }] }
  v = merge(v, { gates, pieces: [svc('s3')], links: [], costs: [{ ...base, piece: 's3', amount: 99, source: 'invoice' }] })
  assert.equal(v.costs[0].amount, 50)
})

test('dropping the same long file twice raises the same note once', () => {
  const note = { id: 'n1', kind: 'gap' as const, message: 'Only the start of "a.md" is on the map.', pieces: [] }
  const once = merge(vault([]), { gates, pieces: [piece('p1', 'One')], links: [], costs: [], findings: [note] })
  const twice = merge(once, { gates, pieces: [piece('p2', 'One')], links: [], costs: [], findings: [{ ...note, id: 'n2' }] })
  assert.equal(twice.findings.length, 1)
})

test('an area you renamed is still that area when more files arrive, and never gets a twin', () => {
  const renamed = { ...vault([piece('p1', 'One')]), gates: [{ id: 'brand', name: 'Marketing' }, gates[1]] }
  const next = merge(renamed, { gates, pieces: [piece('p2', 'Two', { source: { file: 'b.md' } })], links: [], costs: [] })
  assert.deepEqual(next.gates.map((g) => g.id), ['brand', 'money'])
  assert.equal(next.gates[0].name, 'Marketing')
  assert.equal(next.pieces.find((p) => p.title === 'Two')?.gate, 'brand')
})
