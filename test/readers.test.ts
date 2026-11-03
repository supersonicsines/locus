import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Password, PublishedState, Vault } from '../src/core/types.ts'
import { readersByArea } from '../src/studio/ui/data.ts'

const pw = (id: string, name: string, gates: string[]): Password => ({ id, name, key: `vdr_${id}`, gates, remote: false, createdAt: 1 })

function vault(passwords: Password[], published?: Partial<PublishedState>): Vault {
  return {
    passwords,
    pieces: [],
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
