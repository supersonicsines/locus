// What needs you, how loudly, and what stops needing you once you've dealt with it.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSample } from '../src/core/sample.ts'
import { levelOf, needs, pending, priceNotes, snapshot, sortNeeds, whatChanged } from '../src/core/status.ts'
import { llmsTxt, viewFor } from '../src/core/agent.ts'
import type { Vault } from '../src/core/types.ts'
import { asReaderSees, contentOf, putPieceBack, rejectKeepsItem, rejectProposal, undoRejectProposal } from '../src/studio/ui/data.ts'

const live = (v: Vault): Vault => ({ ...v, site: { name: 'meridian', ownerKey: 'lco_x', origin: 'http://localhost' }, published: snapshot(v, 1) })

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

test('what has not gone live is said by name, so you can tell whether it is worth updating', () => {
  const v = live(createSample())
  assert.deepEqual(whatChanged(v), [])
  const [first, second] = v.pieces
  const edited: Vault = {
    ...v,
    pieces: [{ ...first, summary: 'Changed.' }, ...v.pieces.slice(2)],
    passwords: [{ ...v.passwords[0], gates: [] }, ...v.passwords.slice(1)],
  }
  const said = whatChanged(edited)
  assert.ok(said.includes(`Edited ${first.title}`))
  assert.ok(said.includes('Deleted 1 item'))
  assert.ok(said.includes(`What ${v.passwords[0].name} can read`))
  assert.ok(!said.some((c) => c.includes(second.title)))
  // A new password for a reader leaves the old one out there until the update, and it says so.
  const replaced: Vault = { ...v, passwords: [{ ...v.passwords[0], id: 'fresh', key: 'lcr_fresh' }, ...v.passwords.slice(1)] }
  assert.ok(pending(replaced).exposures.some((e) => e.message === `${v.passwords[0].name} still works until you update.`))
})

// What Reject does, and what the words say it does. Until now a rejected rule stayed on the map, and reached every reader who could open its area.

const proposed = (v: Vault) => v.pieces.find((p) => p.always === 'proposed')!
const reader = (v: Vault, gate: string) => ({ id: 'r', name: 'Tool', key: 'lcr_x', gates: [gate], remote: true, createdAt: 1 }) as Vault['passwords'][number]

test('what a proposal says matches what readers get: reference until approved, in the area it sits in', () => {
  const v = createSample()
  const rule = proposed(v)
  const said = needs(v).find((n) => n.pieces[0] === rule.id && n.kind === 'proposal')!
  const area = v.gates.find((g) => g.id === rule.gate)!.name
  assert.ok(said.message.includes(`AI tools that can read ${area}`), 'it names who')
  assert.ok(said.message.includes("aren't told to follow it"))
  assert.ok(!/stays out|every AI tool/.test(said.message))
  const holding = llmsTxt(viewFor(v, reader(v, rule.gate)), { kind: 'mcp' })
  assert.ok(holding.includes(rule.title), 'a reader of that area does read it')
  assert.ok(!holding.slice(holding.indexOf('## Always follow'), holding.indexOf('## The map')).includes(rule.title), 'and is not told to follow it')
  const other = v.gates.find((g) => g.id !== rule.gate)!
  assert.ok(!llmsTxt(viewFor(v, reader(v, other.id)), { kind: 'mcp' }).includes(rule.title), 'a reader without that area does not')
})

test('Reject takes a rule off the map, so a reader stops getting it, and the next update is what stops them', () => {
  const v = live(createSample())
  const rule = proposed(v)
  assert.ok(llmsTxt(viewFor(v, reader(v, rule.gate)), { kind: 'mcp' }).includes(rule.title))
  const after = rejectProposal(v, rule.id)
  assert.ok(!after.pieces.some((p) => p.id === rule.id))
  assert.ok(!llmsTxt(viewFor(after, reader(after, rule.gate)), { kind: 'mcp' }).includes(rule.title), 'gone from what a reader gets')
  assert.ok(!needs(after).some((n) => n.kind === 'proposal' && n.pieces.includes(rule.id)), 'and nothing asks about it')
  assert.ok(pending(after).exposures.some((e) => /deleted item/.test(e.message) && /until you update/.test(e.message)), 'a live copy still has it until the update, and the page says so')
})

test('Undo puts a rejected rule back as it was, with its links, and it can ask again', () => {
  const v = createSample()
  const rule = proposed(v)
  const linked: Vault = { ...v, links: [...v.links, { from: rule.id, to: v.pieces.find((p) => p.id !== rule.id)!.id, kind: 'related' }] }
  const after = rejectProposal(linked, rule.id)
  assert.ok(!after.links.some((l) => l.from === rule.id))
  const back = undoRejectProposal(after, linked, rule.id)
  assert.deepEqual(back.pieces.map((p) => p.id), linked.pieces.map((p) => p.id))
  assert.deepEqual(back.links, linked.links)
  assert.deepEqual(back.settled ?? [], linked.settled ?? [])
  assert.equal(back.pieces.find((p) => p.id === rule.id)?.always, 'proposed')
})

test('Undo keeps what was done since', () => {
  const v = createSample()
  const rule = proposed(v)
  const other = v.pieces.find((p) => p.id !== rule.id)!
  const after = rejectProposal(v, rule.id)
  const edited: Vault = { ...after, pieces: after.pieces.map((p) => (p.id === other.id ? { ...p, title: 'Edited since' } : p)) }
  const back = undoRejectProposal(edited, v, rule.id)
  assert.equal(back.pieces.find((p) => p.id === other.id)?.title, 'Edited since')
  assert.ok(back.pieces.some((p) => p.id === rule.id))
})

test('rejecting a server takes it off the map, unless the company pays for it: then only the address goes', () => {
  const base = createSample()
  const service = base.pieces.find((p) => p.kind === 'service')!
  const withServer: Vault = { ...base, pieces: base.pieces.map((p) => (p.id === service.id ? { ...p, mcp: { url: 'https://evil.example/mcp', approved: false } } : p)) }

  const priced: Vault = { ...withServer, costs: [...withServer.costs.filter((c) => c.piece !== service.id), { piece: service.id, label: service.title, amount: 20, currency: 'USD', unit: 'flat', period: 'month', source: 'invoice' }] }
  assert.ok(rejectKeepsItem(priced, priced.pieces.find((p) => p.id === service.id)!))
  const kept = rejectProposal(priced, service.id)
  assert.equal(kept.pieces.find((p) => p.id === service.id)?.mcp, undefined, 'the address is gone')
  assert.ok(kept.costs.some((c) => c.piece === service.id), 'the bill is not')
  assert.equal(undoRejectProposal(kept, priced, service.id).pieces.find((p) => p.id === service.id)?.mcp?.url, 'https://evil.example/mcp')

  const unpriced: Vault = { ...withServer, costs: withServer.costs.filter((c) => c.piece !== service.id) }
  assert.ok(!rejectProposal(unpriced, service.id).pieces.some((p) => p.id === service.id))
})

test('a reader\'s page files a rule nobody approved with the facts, and keeps an approved one under Rules', () => {
  const v = createSample()
  const rule = proposed(v)
  const approved = v.pieces.find((p) => p.always === 'approved')!
  const view = viewFor(v, reader(v, rule.gate))
  const unmarked = view.pieces.find((p) => p.id === rule.id)!
  assert.equal(unmarked.always, undefined, 'a reader gets no flag on it')
  assert.equal(asReaderSees(unmarked).kind, 'fact')
  assert.equal(asReaderSees(approved).kind, 'rule')
  const shown = contentOf({ vault: null, view })!
  assert.equal(shown.pieces.find((p) => p.id === rule.id)?.kind, 'fact')
  assert.equal(shown.pieces.find((p) => p.id === rule.id)?.title, rule.title, 'the words are still there')
})

test('deleting an item and undoing it brings back its links and its need', () => {
  const v = createSample()
  const need = v.findings[0]
  const id = need.pieces[0]
  const without = { ...v, pieces: v.pieces.filter((p) => p.id !== id), links: v.links.filter((l) => l.from !== id && l.to !== id), costs: v.costs.filter((c) => c.piece !== id), findings: v.findings.map((f) => ({ ...f, pieces: f.pieces.filter((x) => x !== id) })) }
  const back = putPieceBack(without, v, id)
  assert.ok(back.pieces.some((p) => p.id === id))
  assert.ok(back.findings.find((f) => f.id === need.id)!.pieces.includes(id))
})
