// At a glance: what has changed, who can still read what, and what needs you.

import { daysUntil, toCheck } from './money.ts'
import type { Piece, PublishedState, Vault } from './types.ts'

export type NeedKind =
  | 'exposure'
  | 'secret'
  | 'proposal'
  | 'conflict'
  | 'gap'
  | 'due'
  | 'stale'
  | 'price'

export interface Need {
  id: string
  kind: NeedKind
  message: string
  pieces: string[]
  /** The exact words at stake, so an approval is of what agents will actually read. */
  quote?: string
}

/** A small, stable hash. It only detects change; nothing about it is secret. */
function fnv(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

function pieceHash(p: Piece): string {
  // Position isn't content: moving a dot around shouldn't ask you to publish.
  const { x: _x, y: _y, updatedAt: _u, ...rest } = p
  return fnv(JSON.stringify(rest))
}

function restHash(v: Vault): string {
  return fnv(JSON.stringify([v.company, v.gates, v.links, v.costs, v.currency, v.passwords.map((p) => [p.id, p.name, p.remote])]))
}

export function snapshot(v: Vault, version: number): PublishedState {
  return {
    version,
    at: Date.now(),
    pieces: Object.fromEntries(v.pieces.map((p) => [p.id, pieceHash(p)])),
    pieceGates: Object.fromEntries(v.pieces.map((p) => [p.id, p.gate])),
    passwords: Object.fromEntries(v.passwords.map((p) => [p.id, p.gates])),
    passwordInfo: Object.fromEntries(v.passwords.map((p) => [p.id, { name: p.name, remote: p.remote }])),
    rest: restHash(v),
  }
}

export interface Pending {
  changes: number
  /** Readable by someone right now, though you've since closed it. */
  exposures: { message: string; pieces: string[] }[]
}

export function pending(v: Vault): Pending {
  const pub = v.published
  if (!pub) return { changes: v.pieces.length ? 1 : 0, exposures: [] }

  let changes = 0
  for (const p of v.pieces) if (pub.pieces[p.id] !== pieceHash(p)) changes++
  for (const id of Object.keys(pub.pieces)) if (!v.pieces.some((p) => p.id === id)) changes++
  if (pub.rest !== restHash(v)) changes++
  for (const pw of v.passwords) {
    const before = pub.passwords[pw.id]
    if (before && [...before].sort().join() !== [...pw.gates].sort().join()) changes++
    if (!before) changes++
  }

  const exposures: Pending['exposures'] = []
  const gateName = (id: string) => v.gates.find((g) => g.id === id)?.name ?? 'a deleted area'

  // A gate closed on a password stays open until the next publish.
  for (const pw of v.passwords) {
    const before = pub.passwords[pw.id]
    if (!before) continue
    const closed = before.filter((g) => !pw.gates.includes(g))
    if (closed.length) {
      exposures.push({
        message: `${pw.name} can still read ${closed.map(gateName).join(' and ')} until you update.`,
        pieces: [],
      })
    }
  }

  // A password removed here still works out there, if revoking couldn't publish.
  for (const id of Object.keys(pub.passwords)) {
    if (v.passwords.some((p) => p.id === id)) continue
    const name = pub.passwordInfo?.[id]?.name ?? 'A removed password'
    exposures.push({ message: `${name} still works until you update.`, pieces: [] })
  }

  // Remote access switched off still lets the host decrypt for this password.
  for (const pw of v.passwords) {
    if (pub.passwordInfo?.[pw.id]?.remote && !pw.remote) {
      exposures.push({ message: `${pw.name} can still read through the host until you update.`, pieces: [] })
    }
  }

  // A deleted piece is still in what's published.
  const deleted = Object.keys(pub.pieces).filter((id) => !v.pieces.some((p) => p.id === id))
  if (deleted.length) {
    exposures.push({
      message: `${deleted.length === 1 ? '1 deleted item is' : `${deleted.length} deleted items are`} still readable until you update.`,
      pieces: [],
    })
  }

  // A piece moved somewhere more private is still readable from where it was.
  const moved: string[] = []
  for (const p of v.pieces) {
    const was = pub.pieceGates[p.id]
    if (!was || was === p.gate) continue
    const stillOpen = v.passwords.some((pw) => pub.passwords[pw.id]?.includes(was) && !pw.gates.includes(p.gate))
    if (stillOpen) moved.push(p.id)
  }
  if (moved.length) {
    exposures.push({
      message: `${moved.length === 1 ? '1 moved item is' : `${moved.length} moved items are`} still readable from the old area until you update.`,
      pieces: moved,
    })
  }

  return { changes, exposures }
}

const SECRET_MARK = /\[secret removed: [^\]]+\]/

export function needs(v: Vault, now = Date.now()): Need[] {
  const out: Need[] = []

  for (const [i, e] of pending(v).exposures.entries()) {
    out.push({ id: `exposure-${i}`, kind: 'exposure', message: e.message, pieces: e.pieces })
  }

  const secrets = v.pieces.filter((p) => SECRET_MARK.test(p.body))
  for (const p of secrets) {
    out.push({
      id: `secret-${p.id}`,
      kind: 'secret',
      message: `A real secret, like an API key, was in "${p.source?.file ?? p.title}". It's been taken off the map. Change it, because anyone with that file has it.`,
      pieces: [p.id],
    })
  }

  for (const p of v.pieces) {
    if (p.always === 'proposed') {
      out.push({
        id: `rule-${p.id}`,
        kind: 'proposal',
        message: `A document suggests a rule for every AI tool${p.source?.file ? `: ${p.source.file}` : ''}. It stays out until you approve it.`,
        pieces: [p.id],
        quote: `${p.title}. ${p.summary}`,
      })
    }
    if (p.mcp && !p.mcp.approved) {
      out.push({
        id: `mcp-${p.id}`,
        kind: 'proposal',
        message: `A document says AI tools should connect to ${p.title} at ${p.mcp.url}. It stays out until you approve it.`,
        pieces: [p.id],
      })
    }
  }

  for (const f of v.findings) {
    if (f.dismissed) continue
    out.push({ id: f.id, kind: f.kind, message: f.message, pieces: f.pieces })
  }

  for (const p of v.pieces) {
    if (!p.date) continue
    if (p.date.means === 'as-of') {
      const age = -daysUntil(p.date.on, now)
      if (age > 365) {
        out.push({
          id: `stale-${p.id}`,
          kind: 'stale',
          message: `"${p.title}" was last true ${Math.round(age / 30)} months ago.`,
          pieces: [p.id],
        })
      }
    } else if (p.kind !== 'service') {
      const d = daysUntil(p.date.on, now)
      if (d >= 0 && d <= 30) {
        out.push({
          id: `due-${p.id}`,
          kind: 'due',
          message: `"${p.title}" ${p.date.means === 'ends' ? 'ends' : 'renews'} in ${d} day${d === 1 ? '' : 's'}.`,
          pieces: [p.id],
        })
      }
    }
  }

  for (const c of toCheck(v.costs, now)) {
    out.push({ id: `check-${c.kind}-${c.piece}`, kind: 'price', message: c.message, pieces: [c.piece] })
  }

  const unpriced = v.costs.filter((c) => c.amount === null)
  if (unpriced.length) {
    const names = unpriced.map((c) => c.label)
    out.push({
      id: 'unpriced',
      kind: 'price',
      message: `${unpriced.length === 1 ? `${names[0]} has` : `${unpriced.length} services have`} no known price${unpriced.length > 1 ? `: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ' and more' : ''}` : ''}.`,
      pieces: unpriced.map((c) => c.piece),
    })
  }

  return out
}

const ORDER: NeedKind[] = ['exposure', 'secret', 'proposal', 'conflict', 'gap', 'due', 'price', 'stale']

export function sortNeeds(list: Need[]): Need[] {
  return [...list].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}
