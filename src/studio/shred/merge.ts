// Merging a shredded result into the map.
//
// Dropping a file with the same name replaces what came from it. Pieces with the
// same title keep their position, so the map stays recognisable.

import { newId } from '../../core/seal.ts'
import { rejectedId } from '../../core/status.ts'
import type { Cost, Finding, Gate, Link, Piece, Vault } from '../../core/types.ts'

export interface Incoming {
  gates: Gate[]
  pieces: Piece[]
  links: Link[]
  costs: Cost[]
  findings?: Finding[]
  company?: { name: string; about: string }
}

/** One service, one cost record: you, then invoice, then list. The latest invoice wins. */
function mergeCost(a: Cost | undefined, b: Cost): Cost {
  if (!a) return b
  const rank = { you: 3, invoice: 2, list: 1 }
  if (rank[b.source] > rank[a.source]) return { ...b, listAmount: b.listAmount ?? a.listAmount, previous: a.source === 'invoice' ? (a.amount ?? undefined) : b.previous }
  if (rank[b.source] === rank[a.source] && b.source === 'invoice') return { ...b, listAmount: b.listAmount ?? a.listAmount, previous: a.amount ?? undefined }
  return a
}

const turnedDownIn = (v: Vault) => new Set((v.settled ?? []).filter((s) => s.startsWith('rejected-')))

/** How many of these the owner has already rejected, in these words, so they won't land. A service that's still on the map isn't one: it stays what it is. */
export function alreadyRejected(v: Vault, pieces: Piece[]): number {
  const no = turnedDownIn(v)
  const here = new Set(v.pieces.filter((p) => p.kind === 'service').map((p) => p.title.toLowerCase()))
  return pieces.filter((p) => no.has(rejectedId(p)) && !(p.kind === 'service' && here.has(p.title.toLowerCase()))).length
}

/**
 * Pass idMap to learn which existing piece each incoming one became, so a later
 * step (the Cartographer's map) can refer to it.
 */
export function merge(v: Vault, incoming: Incoming, idMap = new Map<string, string>()): Vault {
  const files = new Set(incoming.pieces.map((p) => p.source?.file).filter(Boolean))

  // Match new gates to existing ones by name.
  const gateMap = new Map<string, string>()
  const gates = [...v.gates]
  for (const g of incoming.gates) {
    const same = gates.find((x) => x.id === g.id) ?? gates.find((x) => x.name.toLowerCase() === g.name.toLowerCase())
    if (same) gateMap.set(g.id, same.id)
    else {
      gates.push(g)
      gateMap.set(g.id, g.id)
    }
  }

  const replaced = v.pieces.filter((p) => p.source?.file && files.has(p.source.file) && p.kind !== 'service')
  const replacedIds = new Set(replaced.map((p) => p.id))
  const byTitle = new Map(replaced.map((p) => [p.title.toLowerCase(), p]))
  const services = new Map(v.pieces.filter((p) => p.kind === 'service').map((p) => [p.title.toLowerCase(), p]))

  const no = turnedDownIn(v)
  const added: Piece[] = []
  for (const p of incoming.pieces) {
    const gate = gateMap.get(p.gate) ?? p.gate
    // A service seen again is the same service, wherever it was mentioned.
    const known = p.kind === 'service' ? services.get(p.title.toLowerCase()) : undefined
    if (known) {
      idMap.set(p.id, known.id)
      continue
    }
    // Rejected, in these words. It stays off the map however many times the document is read. New words ask again.
    if (no.has(rejectedId(p))) continue
    const old = byTitle.get(p.title.toLowerCase())
    if (old) {
      // Each old piece is matched once, even if a file repeats a title.
      byTitle.delete(p.title.toLowerCase())
      idMap.set(p.id, old.id)
      // An approval covers the words that were approved. New words go back to being a proposal.
      const sameWords = old.body === p.body && old.summary === p.summary
      const always = old.always === 'approved' && sameWords ? 'approved' : p.always
      const { always: _dropped, ...rest } = p
      added.push({ ...rest, ...(always ? { always } : {}), id: old.id, gate: old.gate, x: old.x, y: old.y })
    } else {
      idMap.set(p.id, p.id)
      added.push({ ...p, gate })
    }
    if (p.kind === 'service') services.set(p.title.toLowerCase(), p)
  }

  const kept = v.pieces.filter((p) => !replacedIds.has(p.id))
  const pieces = [...kept, ...added]
  const ids = new Set(pieces.map((p) => p.id))

  const seen = new Set<string>()
  const links: Link[] = []
  for (const l of [...v.links, ...incoming.links]) {
    const from = idMap.get(l.from) ?? l.from
    const to = idMap.get(l.to) ?? l.to
    if (!ids.has(from) || !ids.has(to) || from === to) continue
    const key = `${from}|${to}|${l.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    links.push({ ...l, from, to })
  }

  const costMap = new Map(v.costs.map((c) => [c.piece, c]))
  for (const c of incoming.costs) {
    const piece = idMap.get(c.piece) ?? c.piece
    costMap.set(piece, mergeCost(costMap.get(piece), { ...c, piece }))
  }

  // Dropping the same file twice raises the same note once.
  const said = new Set(v.findings.map((f) => f.message))
  const findings = [...v.findings, ...(incoming.findings ?? []).filter((f) => !said.has(f.message))].map((f) => ({
    ...f,
    id: f.id || newId(),
    pieces: f.pieces.map((id) => idMap.get(id) ?? id).filter((id) => ids.has(id)),
  }))

  const named = v.company.name && v.company.name !== 'Untitled company'
  const company = named ? v.company : (incoming.company ?? v.company)
  const about = v.company.about || incoming.company?.about || ''

  return {
    ...v,
    sample: false,
    company: { ...company, about: company.about || about },
    gates,
    pieces,
    links,
    costs: [...costMap.values()].filter((c) => ids.has(c.piece)),
    findings,
  }
}
