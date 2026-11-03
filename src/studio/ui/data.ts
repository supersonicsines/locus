// A single view of what's on the map, whether you're the owner or a reader.

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
