// A single view of what's on the map, whether you're the owner or a reader.

import type { Company, Cost, Gate, Link, Piece } from '../../core/types.ts'
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
