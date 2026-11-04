// A single view of what's on the map, whether you're the owner or a reader.

import { pending, rejectedId } from '../../core/status.ts'
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

/**
 * A rule reaches a reader with its `always` only if the owner approved it, so one without it is reference text, and a reader mustn't see it filed under Rules with a rule's shield.
 * The document's words are still there. This is what they're called. The agent text makes the same split.
 */
export function asReaderSees(p: Piece): Piece {
  return p.kind === 'rule' && p.always !== 'approved' ? { ...p, kind: 'fact' } : p
}

function build(s: Pick<State, 'vault' | 'view'>): MapContent | null {
  if (s.view) {
    return {
      company: s.view.company,
      gates: s.view.gates,
      pieces: s.view.pieces.map(asReaderSees),
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

/**
 * The areas you can actually see. A new map starts with six, and one with nothing on it has no land, so it isn't counted or offered anywhere.
 * Money stays while there are prices, because it's the only way to give someone the bill, whichever area its services sit in.
 */
export function areasOnMap(vault: Pick<Vault, 'gates' | 'pieces' | 'costs'>): Gate[] {
  const used = new Set(vault.pieces.map((p) => p.gate))
  return vault.gates.filter((g) => used.has(g.id) || (g.builtin === 'money' && vault.costs.length > 0))
}

/** An area and everything on it, off the map. */
export function withoutArea(v: Vault, gate: string): Vault {
  const gone = new Set(v.pieces.filter((p) => p.gate === gate).map((p) => p.id))
  return {
    ...v,
    gates: v.gates.filter((g) => g.id !== gate),
    pieces: v.pieces.filter((p) => !gone.has(p.id)),
    links: v.links.filter((l) => !gone.has(l.from) && !gone.has(l.to)),
    costs: v.costs.filter((c) => !gone.has(c.piece)),
    passwords: v.passwords.map((p) => ({ ...p, gates: p.gates.filter((g) => g !== gate) })),
  }
}

/** Old order first, so putting everything back counts as no change at all. Anything since keeps its latest form. */
function inOldOrder<T>(now: T[], was: T[], key: (t: T) => string, comesBack: (t: T) => boolean): T[] {
  const current = new Map(now.map((t) => [key(t), t]))
  const out = was.filter((t) => comesBack(t) || current.has(key(t))).map((t) => current.get(key(t)) ?? t)
  const seen = new Set(out.map(key))
  return [...out, ...now.filter((t) => !seen.has(key(t)))]
}

/**
 * Undo for that. Only what the delete took comes back, and anything done since stays done.
 * Above all a reader removed since stays removed: restoring the old list would bring their password back, and the next update would make it work again.
 */
export function putAreaBack(v: Vault, before: Vault, gate: string): Vault {
  if (v.gates.some((g) => g.id === gate)) return v
  const ids = new Set(before.pieces.filter((p) => p.gate === gate).map((p) => p.id))
  const here = new Set([...v.pieces.map((p) => p.id), ...ids])
  return {
    ...v,
    gates: inOldOrder(v.gates, before.gates, (g) => g.id, (g) => g.id === gate),
    pieces: inOldOrder(v.pieces, before.pieces, (p) => p.id, (p) => ids.has(p.id)),
    links: inOldOrder(v.links, before.links, (l) => `${l.from}|${l.to}|${l.kind}`, (l) => (ids.has(l.from) || ids.has(l.to)) && here.has(l.from) && here.has(l.to)),
    costs: inOldOrder(v.costs, before.costs, (c) => c.piece, (c) => ids.has(c.piece)),
    passwords: v.passwords.map((p) => (before.passwords.find((b) => b.id === p.id)?.gates.includes(gate) ? { ...p, gates: [...p.gates, gate] } : p)),
  }
}

/** One item and everything hanging off it, off the map. */
export function withoutPiece(v: Vault, id: string): Vault {
  return {
    ...v,
    pieces: v.pieces.filter((p) => p.id !== id),
    links: v.links.filter((l) => l.from !== id && l.to !== id),
    costs: v.costs.filter((c) => c.piece !== id),
    findings: v.findings.map((f) => (f.pieces.includes(id) ? { ...f, pieces: f.pieces.filter((x) => x !== id) } : f)),
  }
}

/** Undo for that. Only what the delete took comes back, and anything done since stays done. */
export function putPieceBack(v: Vault, before: Vault, id: string): Vault {
  const here = new Set([...v.pieces.map((p) => p.id), id])
  return {
    ...v,
    pieces: inOldOrder(v.pieces, before.pieces, (p) => p.id, (p) => p.id === id),
    links: inOldOrder(v.links, before.links, (l) => `${l.from}|${l.to}|${l.kind}`, (l) => (l.from === id || l.to === id) && here.has(l.from) && here.has(l.to)),
    costs: inOldOrder(v.costs, before.costs, (c) => c.piece, (c) => c.piece === id),
    findings: v.findings.map((f) => (before.findings.find((b) => b.id === f.id)?.pieces.includes(id) && !f.pieces.includes(id) ? { ...f, pieces: [...f.pieces, id] } : f)),
  }
}

/**
 * A service with a real price is one the company pays for, whatever a document says about connecting to it, so rejecting the address doesn't take its bill off the map.
 * Everything else a document proposed exists on the map because the document said so.
 */
export function rejectKeepsItem(v: Pick<Vault, 'costs'>, p: Piece): boolean {
  return p.kind === 'service' && !p.always && v.costs.some((c) => c.piece === p.id && c.amount !== null)
}

/** What Reject does: off the map, so it stops reaching readers at the next update, and remembered, so reading the same document again doesn't bring it back. */
export function rejectProposal(v: Vault, id: string): Vault {
  const p = v.pieces.find((x) => x.id === id)
  if (!p) return v
  const settled = [...(v.settled ?? []), rejectedId(p)]
  if (rejectKeepsItem(v, p)) {
    const { mcp: _address, ...rest } = p
    return { ...v, settled, pieces: v.pieces.map((x) => (x.id === id ? rest : x)) }
  }
  return { ...withoutPiece(v, id), settled }
}

/** Undo for that. It isn't a rejection any more, so the same words can ask again. */
export function undoRejectProposal(v: Vault, before: Vault, id: string): Vault {
  const was = before.pieces.find((x) => x.id === id)
  if (!was) return v
  const settled = (v.settled ?? []).filter((s) => s !== rejectedId(was))
  if (v.pieces.some((x) => x.id === id)) return { ...v, settled, pieces: v.pieces.map((x) => (x.id === id && was.mcp ? { ...x, mcp: was.mcp } : x)) }
  return { ...putPieceBack(v, before, id), settled }
}

/** Where a need is, in the words the map uses. */
export function placeOf(vault: Vault, pieces: string[], gates: string[] = []): string | null {
  const gate = gates[0] ?? vault.pieces.find((p) => p.id === pieces[0])?.gate
  return vault.gates.find((g) => g.id === gate)?.name ?? null
}
