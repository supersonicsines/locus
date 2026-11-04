// The no-AI sorter. What it can't fit, it says, because silently losing most of a file is the worst thing a map could do.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MOST_FROM_ONE_FILE, shredLocally } from '../src/core/shred-local.ts'

let id = 0
const makeId = () => `id${++id}`

test('a file too long to sort says so, and keeps saying so on the map', () => {
  const text = Array.from({ length: MOST_FROM_ONE_FILE + 40 }, (_, i) => `# Section ${i + 1}\n\nThe harbour office keeps a record of it.`).join('\n\n')
  const result = shredLocally([{ name: 'archive.md', text }, { name: 'short.md', text: '# One\n\nAll of this fits.' }], makeId)
  assert.deepEqual(result.cut, ['archive.md'])
  assert.equal(result.pieces.filter((p) => p.source?.file === 'archive.md').length, MOST_FROM_ONE_FILE)
  assert.equal(result.pieces.filter((p) => p.source?.file === 'short.md').length, 1)
  assert.equal(result.findings.length, 1)
  assert.equal(result.findings[0].kind, 'gap')
  assert.match(result.findings[0].message, /archive\.md/)
  assert.match(result.findings[0].message, /240/)
})

test('a file that fits says nothing', () => {
  const result = shredLocally([{ name: 'short.md', text: '# One\n\nAll of this fits.' }], makeId)
  assert.deepEqual(result.cut, [])
  assert.deepEqual(result.findings, [])
})

test('a shouted heading calms down, and keeps the capitals that mean something', () => {
  const { pieces } = shredLocally([{ name: 'plan.txt', text: 'HIRING PLAN\n\nTwo engineers this year.\n\nAI AND API POLICY\n\nNo customer data in prompts.' }], makeId)
  assert.deepEqual(pieces.map((p) => p.title), ['Hiring plan', 'AI and API policy'])
})

test('a mixed-case heading stays as it was written', () => {
  const { pieces } = shredLocally([{ name: 'plan.md', text: '# Stripe and the EU\n\nAll of this fits.' }], makeId)
  assert.equal(pieces[0].title, 'Stripe and the EU')
})

test('data says what it is, instead of printing its first characters as a summary', () => {
  const { pieces } = shredLocally([{ name: 'tokens.json', text: '{"color":{"primary":{"value":"#113355"}}}' }], makeId)
  assert.equal(pieces[0].summary, 'Data from tokens.json.')
})

test('prose that opens with a bracket is still prose', () => {
  const { pieces } = shredLocally([{ name: 'notes.md', text: '[Read the guide](https://example.com) before you start the work.' }], makeId)
  assert.notEqual(pieces[0].summary, 'Data from notes.md.')
})
