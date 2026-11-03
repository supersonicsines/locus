import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Password, PublishedState, Vault } from '../src/core/types.ts'
import { exposedAreas, pricesReadableIn, readersByArea } from '../src/studio/ui/data.ts'

const pw = (id: string, name: string, gates: string[]): Password => ({ id, name, key: `vdr_${id}`, gates, remote: false, createdAt: 1 })

function vault(passwords: Password[], published?: Partial<PublishedState>): Vault {
  return {
    passwords,
    pieces: [],
    gates: [],
    links: [],
    costs: [],
    ...(published ? { published: { version: 1, at: 1, pieces: {}, pieceGates: {}, passwords: {}, rest: '', ...published }, site: { name: 'co', ownerKey: 'vdo_x', origin: 'https://co', ownerKeySaved: true } } : {}),
  } as unknown as Vault
}

test('the map names everyone a password opens an area for', () => {
  const out = readersByArea(vault([pw('a', 'Claude Code', ['brand', 'legal']), pw('b', 'Accountant', ['legal'])]))
  assert.deepEqual(out.get('brand'), ['Claude Code'])
  assert.deepEqual(out.get('legal'), ['Claude Code', 'Accountant'])
  assert.equal(out.has('people'), false)
})

test('nobody can read anything on an empty or missing map', () => {
  assert.equal(readersByArea(null).size, 0)
  assert.equal(readersByArea(vault([])).size, 0)
})

test('an area closed here still counts its reader until the update goes through', () => {
  const v = vault([pw('a', 'Accountant', ['money'])], { passwords: { a: ['money', 'legal'] } })
  assert.deepEqual(readersByArea(v).get('legal'), ['Accountant'], 'the live copy still opens it, so the map may not call it sealed')
  assert.deepEqual(readersByArea(v).get('money'), ['Accountant'], 'and nobody is listed twice')
})

test('a removed reader still counts while its password works out there', () => {
  const v = vault([], { passwords: { gone: ['legal'] }, passwordInfo: { gone: { name: 'Old contractor', remote: false } } })
  assert.deepEqual(readersByArea(v).get('legal'), ['Old contractor'])
})

test('an item moved into a closed area counts whoever can still read it where it was', () => {
  const v = { ...vault([pw('a', 'Accountant', ['legal'])], { passwords: { a: ['legal'] }, pieceGates: { p1: 'legal', p2: 'people' } }), pieces: [{ id: 'p1', gate: 'people' }, { id: 'p2', gate: 'people' }] } as unknown as Vault
  assert.deepEqual(readersByArea(v).get('people'), ['Accountant'])
})

test('an item that has not moved adds no reader', () => {
  const v = { ...vault([pw('a', 'Accountant', ['legal'])], { passwords: { a: ['legal'] }, pieceGates: { p2: 'people' } }), pieces: [{ id: 'p2', gate: 'people' }] } as unknown as Vault
  assert.equal(readersByArea(v).has('people'), false)
})

test('what was published without a site is not treated as live', () => {
  const v = { ...vault([], { passwords: { gone: ['legal'] } }), site: undefined } as Vault
  assert.equal(readersByArea(v).has('legal'), false)
})

test('an area names everyone who can still read it, not just the first', () => {
  const closed = (...names: string[]) => vault(names.map((n) => pw(n, n, [])), { passwords: Object.fromEntries(names.map((n) => [n, ['legal']])) })
  assert.equal(exposedAreas(closed('A')).get('legal'), 'A can still read this until you update')
  assert.equal(exposedAreas(closed('A', 'B', 'C')).get('legal'), '3 readers can still read this until you update')
})

test('an area someone can still read says so until the update, and only on a live map', () => {
  const closed = vault([pw('a', 'Accountant', ['money'])], { passwords: { a: ['legal', 'money'] } })
  assert.deepEqual([...exposedAreas(closed)], [['legal', 'Accountant can still read this until you update']])
  assert.deepEqual([...exposedAreas(vault([pw('a', 'Accountant', ['money'])]))], [], 'nothing is live, so nothing can be read')
  assert.deepEqual([...exposedAreas(vault([pw('a', 'Accountant', ['money'])], { passwords: { a: ['money'] } }))], [], 'closed on both sides')
})

test('a closed area of services only counts as closed apart from what Money shows', () => {
  const base = (passwords: Password[]) =>
    ({
      ...vault(passwords),
      gates: [{ id: 'people', name: 'People' }, { id: 'legal', name: 'Legal' }, { id: 'money', name: 'Money', builtin: 'money' }],
      pieces: [{ id: 'slack', gate: 'people' }, { id: 'memo', gate: 'legal' }, { id: 'stripe', gate: 'money' }],
      costs: [{ piece: 'slack' }, { piece: 'stripe' }],
    }) as unknown as Vault
  const payroll = pw('a', 'Accountant', ['money'])
  const coder = pw('b', 'Claude Code', ['legal'])
  assert.deepEqual([...pricesReadableIn(base([payroll, coder]))], ['people'], 'not Legal, which holds no service, and not Money itself')
  assert.deepEqual([...pricesReadableIn(base([coder]))], [], 'nobody holds Money, so nothing shows')
  assert.deepEqual([...pricesReadableIn(base([payroll, coder]), 'b')], [], 'this reader has no Money')
  assert.deepEqual([...pricesReadableIn(base([payroll, coder]), 'a')], ['people'], 'this reader has')

  // Money closed on a reader here still shows until the update goes through, so it still counts.
  const closed = { ...base([pw('a', 'Accountant', [])]), ...vault([], { passwords: { a: ['money'] } }), passwords: [pw('a', 'Accountant', [])], gates: base([]).gates, pieces: base([]).pieces, costs: base([]).costs } as unknown as Vault
  assert.deepEqual([...pricesReadableIn(closed)], ['people'])
  assert.deepEqual([...pricesReadableIn(closed, 'a')], ['people'])
})
