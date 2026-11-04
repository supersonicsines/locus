// A map that has never gone live gets redrawn once when it opens. It may be an arrangement someone made by hand, so that has to say so and be reversible.

import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

// The store's own storage falls back to nothing when there's no browser, which is what these need: every map counts as not yet stamped.
Object.assign(globalThis, { window: { innerWidth: 1440, innerHeight: 900, setTimeout: () => 0 }, location: { search: '', hostname: 'localhost' }, localStorage: { getItem: () => null, setItem: () => undefined }, matchMedia: () => ({ matches: false }) })
mock.timers.enable({ apis: ['setTimeout'] })

const { openVault } = await import('../src/studio/actions.ts')
const { getState } = await import('../src/studio/store.ts')
const { createSample } = await import('../src/core/sample.ts')
type Vault = ReturnType<typeof createSample>

const handMade = (patch: Partial<Vault> = {}): Vault => {
  const v = createSample()
  // A scatter nobody would get from the layout.
  return { ...v, sample: false, id: `map-${Math.random()}`, published: undefined, ...patch, pieces: v.pieces.map((p, i) => ({ ...p, x: i * 37 - 900, y: (i * 53) % 700 })) } as Vault
}
const spots = (v: Vault) => v.pieces.map((p) => [p.id, p.x, p.y])

test('opening a never-live map redraws it once, says so, and Undo restores every position', async () => {
  const v = handMade()
  await openVault(v)
  const opened = getState().vault!
  assert.notDeepEqual(spots(opened), spots(v), 'nothing was redrawn, so this tests nothing')
  const toast = getState().toasts.at(-1)!
  assert.equal(toast.action?.label, 'Undo')
  toast.action!.run()
  assert.deepEqual(spots(getState().vault!), spots(v))
})

test('Undo does nothing to a different map opened since', async () => {
  const v = handMade()
  await openVault(v)
  const undo = getState().toasts.at(-1)!.action!.run
  const other = handMade()
  await openVault(other)
  const shown = spots(getState().vault!)
  undo()
  assert.deepEqual(spots(getState().vault!), shown)
})

test('opening another map takes the last one\'s Undo off the screen', async () => {
  await openVault(handMade())
  assert.ok(getState().toasts.some((t) => t.action), 'nothing to take away, so this tests nothing')
  const live = handMade({ published: { at: 1, sha: 'x' } as unknown as Vault['published'] })
  await openVault(live)
  assert.ok(!getState().toasts.some((t) => t.action?.label === 'Undo'))
})

test('a live map in disarray is not redrawn, and only offered a tidy', async () => {
  const v = handMade({ published: { at: 1, sha: 'x' } as unknown as Vault['published'] })
  await openVault(v)
  assert.deepEqual(spots(getState().vault!), spots(v))
  assert.equal(getState().toasts.at(-1)?.action?.label, 'Tidy up')
  getState().toasts.at(-1)!.action!.run()
  assert.notDeepEqual(spots(getState().vault!), spots(v), 'and pressing it tidies')
})

test('a live map in good order is not touched, and nothing is said', async () => {
  // Drawn by the layout itself, so nothing is astray.
  await openVault(handMade())
  const tidy = { ...getState().vault!, id: `map-${Math.random()}`, published: { at: 1, sha: 'x' } as unknown as Vault['published'] }
  await openVault(tidy)
  assert.deepEqual(spots(getState().vault!), spots(tidy))
  assert.equal(getState().toasts.length, 0)
})
