// What needs you, how loudly, and what stops needing you once you've dealt with it.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSample } from '../src/core/sample.ts'
import { levelOf, needs, pending, priceNotes, snapshot, sortNeeds } from '../src/core/status.ts'
import type { Vault } from '../src/core/types.ts'

const live = (v: Vault): Vault => ({ ...v, site: { name: 'meridian', ownerKey: 'vdo_x', origin: 'http://localhost' }, published: snapshot(v, 1) })

test('price notes are not needs, and the sample keeps them with the prices', () => {
  const v = createSample()
  assert.ok(!needs(v).some((n) => (n.kind as string) === 'price'))
  const notes = priceNotes(v.costs)
  assert.ok(notes.length > 0)
  assert.ok(notes.some((n) => n.id === 'unpriced'))
})

test('the worst thing comes first and is the only thing at the loudest level', () => {
  const list = sortNeeds(needs(createSample()))
  assert.equal(list[0].kind, 'secret')
  assert.equal(levelOf(list[0].kind), 'now')
  assert.deepEqual(list.filter((n) => levelOf(n.kind) === 'now').map((n) => n.kind), ['secret'])
  assert.deepEqual([...new Set(list.map((n) => levelOf(n.kind)))], ['now', 'decide', 'look'])
})

test('saying you changed a secret settles that secret and not the next one', () => {
  const v = createSample()
  const secret = needs(v).find((n) => n.kind === 'secret')!
  const settled: Vault = { ...v, settled: [secret.id] }
  assert.ok(!needs(settled).some((n) => n.kind === 'secret'))
  const piece = secret.pieces[0]
  const another: Vault = { ...settled, pieces: settled.pieces.map((p) => (p.id === piece ? { ...p, body: `${p.body} [secret removed: another key]` } : p)) }
  assert.ok(needs(another).some((n) => n.kind === 'secret'), 'a new secret asks again')
})

test('settling a date lasts only as long as that date', () => {
  const v = createSample()
  const due = needs(v).find((n) => n.kind === 'due')!
  const settled: Vault = { ...v, settled: [due.id] }
  assert.ok(!needs(settled).some((n) => n.id === due.id))
  const piece = due.pieces[0]
  const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
  const moved: Vault = { ...settled, pieces: settled.pieces.map((p) => (p.id === piece ? { ...p, date: { on: soon, means: 'ends' } } : p)) }
  assert.ok(needs(moved).some((n) => n.kind === 'due' && n.pieces[0] === piece), 'a new date asks again')
})

test('settling something is not a change to publish', () => {
  const v = live(createSample())
  assert.equal(pending({ ...v, settled: ['anything'] }).changes, 0)
})

test('an exposure says which areas it is about, so the map can show them', () => {
  const v = live(createSample())
  const accountant = v.passwords.find((p) => p.name === 'Accountant')!
  const closed: Vault = { ...v, passwords: v.passwords.map((p) => (p.id === accountant.id ? { ...p, gates: ['money'] } : p)) }
  const e = pending(closed).exposures[0]
  assert.deepEqual(e.gates, ['legal'])
  assert.equal(e.who, 'Accountant')
  assert.deepEqual(needs(closed)[0].gates, ['legal'])

  const removed: Vault = { ...v, passwords: v.passwords.filter((p) => p.id !== accountant.id) }
  const gone = pending(removed).exposures.find((x) => x.message.startsWith('Accountant'))!
  assert.deepEqual([...gone.gates].sort(), ['legal', 'money'])

  const deleted: Vault = { ...v, pieces: v.pieces.filter((p) => p.id !== 'stack') }
  const item = pending(deleted).exposures.find((x) => x.message.includes('deleted'))!
  assert.deepEqual(item.gates, ['engineering'])
})

test('a deleted item in an area nobody could read is not called readable there', () => {
  const v = live(createSample())
  const inPeople = v.pieces.find((p) => p.gate === 'people')!
  const item = pending({ ...v, pieces: v.pieces.filter((p) => p.id !== inPeople.id) }).exposures.find((x) => x.message.includes('deleted'))!
  assert.deepEqual(item.gates, [], 'no live password opens People')
})
