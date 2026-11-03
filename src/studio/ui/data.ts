// A single view of what's on the map, whether you're the owner or a reader.

import { pending } from '../../core/status.ts'
import type { Company, Cost, Gate, Link, Piece, Vault } from '../../core/types.ts'
import type { State } from '../store.ts'

export interface MapContent {
  company: Company
  gates: Gate[]
  pieces: Piece[]
  links: Link[]
  costs: Cost[] | null
  currency: string
  readOnly: boolean
}

let lastVault: State['vault'] = null
let lastView: State['view'] = null
let lastContent: MapContent | null = null

/** Memoised, because store selectors must return a stable value. */
export function contentOf(s: Pick<State, 'vault' | 'view'>): MapContent | null {
  if (s.vault === lastVault && s.view === lastView) return lastContent
  lastVault = s.vault
  lastView = s.view
  lastContent = build(s)
  return lastContent
}

export const NO_GATES: Gate[] = []
export const NO_PIECES: Piece[] = []

function build(s: Pick<State, 'vault' | 'view'>): MapContent | null {
  if (s.view) {
    return {
      company: s.view.company,
      gates: s.view.gates,
      pieces: s.view.pieces,
      links: s.view.links,
      costs: s.view.costs,
      currency: s.view.currency,
      readOnly: true,
    }
  }
  if (s.vault) {
    return {
      company: s.vault.company,
      gates: s.vault.gates,
      pieces: s.vault.pieces,
      links: s.vault.links,
      costs: s.vault.costs,
      currency: s.vault.currency,
      readOnly: false,
    }
  }
  return null
}

/**
 * Who can read each area right now, by name. Someone you've closed an area on can still read
 * what's live until the next update, so the map must count them: it may never understate this.
 */
export function readersByArea(vault: Vault | null): Map<string, string[]> {
  const out = new Map<string, string[]>()
  if (!vault) return out
  const add = (gate: string, name: string) => {
    const names = out.get(gate) ?? []
    if (!names.includes(name)) out.set(gate, [...names, name])
  }
  const live = vault.published && vault.site ? vault.published : null
  for (const pw of vault.passwords) for (const g of pw.gates) add(g, pw.name)
  if (!live) return out
  // A reader removed here still works out there until the update goes through.
  const nameOf = (id: string) => vault.passwords.find((p) => p.id === id)?.name ?? live.passwordInfo?.[id]?.name ?? 'A removed reader'
  for (const [id, gates] of Object.entries(live.passwords)) for (const g of gates) add(g, nameOf(id))
  // An item moved here stays readable from the area it left, so whoever reads that area counts here too.
  for (const p of vault.pieces) {
    const was = live.pieceGates[p.id]
    if (!was || was === p.gate) continue
    for (const [id, gates] of Object.entries(live.passwords)) if (gates.includes(was)) add(p.gate, nameOf(id))
  }
  return out
}

/**
 * Areas someone can still read though you closed them, each with that fact in its own words.
 * Everyone who can is named or counted, and the marks beside the line say who, so a count keeps the line short enough to fit.
 */
export function exposedAreas(vault: Vault | null): Map<string, string> {
  const out = new Map<string, string>()
  if (!vault?.published || !vault.site) return out
  const who = new Map<string, string[]>()
  for (const e of pending(vault).exposures) {
    for (const g of e.gates) {
      if (e.who) who.set(g, [...(who.get(g) ?? []), e.who])
      else if (e.onArea && !out.has(g)) out.set(g, e.onArea)
    }
  }
  // Someone reading it outranks anything else that could be said about the area.
  for (const [g, names] of who) {
    out.set(g, `${names.length === 1 ? names[0] : `${names.length} readers`} can still read this until you update`)
  }
  return out
}

/**
 * Areas holding a service whose name, plan and price someone can read through Money, whether or not they can open the area.
 * That's how the bill stays readable (see docs/SECURITY.md), so a closed area can't claim nobody can read anything in it.
 * Pass a reader to ask about them alone, or nothing to ask about everyone.
 */
export function pricesReadableIn(vault: Vault | null, readerId: string | null = null): Set<string> {
  const money = vault?.gates.find((g) => g.builtin === 'money')
  if (!vault || !money) return new Set()
  const live = vault.published && vault.site ? vault.published : null
  const opens = readerId
    ? !!vault.passwords.find((p) => p.id === readerId)?.gates.includes(money.id) || !!live?.passwords[readerId]?.includes(money.id)
    : readersByArea(vault).has(money.id)
  if (!opens) return new Set()
  const gateOf = new Map(vault.pieces.map((p) => [p.id, p.gate]))
  const out = new Set<string>()
  for (const c of vault.costs) {
    const gate = gateOf.get(c.piece)
    if (gate && gate !== money.id) out.add(gate)
  }
  return out
}

/** Where a need is, in the words the map uses. */
export function placeOf(vault: Vault, pieces: string[], gates: string[] = []): string | null {
  const gate = gates[0] ?? vault.pieces.find((p) => p.id === pieces[0])?.gate
  return vault.gates.find((g) => g.id === gate)?.name ?? null
}
