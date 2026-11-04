// At a glance: what has changed, who can still read what, and what needs you.

import { daysUntil, toCheck } from './money.ts'
import type { Cost, Piece, PublishedState, Vault } from './types.ts'

export type NeedKind =
  | 'exposure'
  | 'secret'
  | 'proposal'
  | 'conflict'
  | 'gap'
  | 'due'
  | 'stale'

/**
 * How loud a need is allowed to be. The page's whole sense of priority comes from this.
 * now: something is exposed, and waiting makes it worse. decide: nothing is at risk, but only you can answer. look: worth a look when you have a minute.
 */
export type NeedLevel = 'now' | 'decide' | 'look'

const LEVELS: Record<NeedKind, NeedLevel> = {
  exposure: 'now',
  secret: 'now',
  proposal: 'decide',
  conflict: 'look',
  gap: 'look',
  due: 'look',
  stale: 'look',
}

export const levelOf = (kind: NeedKind): NeedLevel => LEVELS[kind]

export interface Need {
  id: string
  kind: NeedKind
  message: string
  pieces: string[]
  /** Areas it's about, when it's about a whole area and not an item on it. */
  gates?: string[]
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

export interface Exposure {
  message: string
  pieces: string[]
  /** The areas it's about, each of which says so on the map. */
  gates: string[]
  /** Who can still read those areas, when it's about a reader, so an area can name everyone at once. */
  who?: string
  /** The same fact, said from the area's own point of view, when it isn't about who. */
  onArea?: string
}

export interface Pending {
  changes: number
  /** Readable by someone right now, though you've since closed it. */
  exposures: Exposure[]
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
        gates: closed,
        who: pw.name,
      })
    }
  }

  // A password removed here still works out there, if revoking couldn't publish.
  for (const id of Object.keys(pub.passwords)) {
    if (v.passwords.some((p) => p.id === id)) continue
    const name = pub.passwordInfo?.[id]?.name ?? 'A removed password'
    exposures.push({ message: `${name} still works until you update.`, pieces: [], gates: pub.passwords[id], who: name })
  }

  // Remote access switched off still lets the host decrypt for this password.
  for (const pw of v.passwords) {
    if (pub.passwordInfo?.[pw.id]?.remote && !pw.remote) {
      exposures.push({
        message: `${pw.name} can still read through the host until you update.`,
        pieces: [],
        gates: pub.passwords[pw.id] ?? [],
        onArea: `${pw.name} can still read through the host until you update`,
      })
    }
  }

  // A deleted piece is still in what's published.
  const deleted = Object.keys(pub.pieces).filter((id) => !v.pieces.some((p) => p.id === id))
  if (deleted.length) {
    exposures.push({
      message: `${deleted.length === 1 ? '1 deleted item is' : `${deleted.length} deleted items are`} still readable until you update.`,
      pieces: [],
      // Only where a live password opens the area. In one nobody could read, a deleted item isn't readable by anyone.
      gates: [...new Set(deleted.map((id) => pub.pieceGates[id]).filter((g) => g && Object.values(pub.passwords).some((open) => open.includes(g))))],
      onArea: `${deleted.length === 1 ? 'A deleted item' : 'Deleted items'} can still be read until you update`,
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
      gates: [pub.pieceGates[moved[0]]],
    })
  }

  return { changes, exposures }
}

/** What isn't live yet, in words, so you can tell whether it's worth updating. */
export function whatChanged(v: Vault): string[] {
  const pub = v.published
  if (!pub) return []
  const out: string[] = []
  for (const p of v.pieces) {
    if (pub.pieces[p.id] === pieceHash(p)) continue
    out.push(pub.pieces[p.id] ? `Edited ${p.title}` : `Added ${p.title}`)
  }
  const deleted = Object.keys(pub.pieces).filter((id) => !v.pieces.some((p) => p.id === id)).length
  if (deleted) out.push(deleted === 1 ? 'Deleted 1 item' : `Deleted ${deleted} items`)
  for (const pw of v.passwords) {
    const before = pub.passwords[pw.id]
    if (!before) out.push(`New password for ${pw.name}`)
    else if ([...before].sort().join() !== [...pw.gates].sort().join()) out.push(`What ${pw.name} can read`)
  }
  for (const id of Object.keys(pub.passwords)) {
    if (!v.passwords.some((p) => p.id === id)) out.push(`Removed ${pub.passwordInfo?.[id]?.name ?? 'a reader'}`)
  }
  if (pub.rest !== restHash(v)) out.push('Other details, such as areas, links, prices or reader settings')
  return out
}

const SECRET_MARK = /\[secret removed: [^\]]+\]/g

/**
 * What a rejection is remembered by: the words turned down, or for a service the address. The same words read again stay off the map, and new words ask again, as they do after an approval.
 */
export function rejectedId(p: Pick<Piece, 'kind' | 'title' | 'summary' | 'body' | 'mcp'>): string {
  const what = p.kind === 'service' ? [p.title.toLowerCase(), p.mcp?.url ?? ''] : [p.title, p.summary, p.body]
  return `rejected-${fnv(JSON.stringify(what))}`
}

export function needs(v: Vault, now = Date.now()): Need[] {
  const out: Need[] = []
  const settled = new Set(v.settled ?? [])

  for (const [i, e] of pending(v).exposures.entries()) {
    out.push({ id: `exposure-${i}`, kind: 'exposure', message: e.message, pieces: e.pieces, gates: e.gates })
  }

  for (const p of v.pieces) {
    const marks = p.body.match(SECRET_MARK)
    if (!marks) continue
    // Which key, in the words the scan used, because the job here is to go and change it.
    const named = [...new Set(marks.map((m) => m.replace(/^\[secret removed: /, '').replace(/\]$/, '')))]
    // Which secrets, in the id: saying you've changed one key says nothing about the next.
    const id = `secret-${p.id}-${fnv(marks.join())}`
    if (settled.has(id)) continue
    out.push({
      id,
      kind: 'secret',
      message: `A real secret (${named.join(', ')}) was in "${p.source?.file ?? p.title}". It was taken out, so it isn't on the map and no reader gets it. Change it anyway: anyone with that file has it.`,
      pieces: [p.id],
    })
  }

  // Until it's approved a proposal is still on the map, so it reaches whoever can read its area, as reference. What approving adds is being told to follow it, or the address.
  const areaOf = (p: Piece) => v.gates.find((g) => g.id === p.gate)?.name ?? 'this area'
  for (const p of v.pieces) {
    if (p.always === 'proposed') {
      out.push({
        id: `rule-${p.id}`,
        kind: 'proposal',
        message: `${p.source?.file ? `"${p.source.file}"` : 'A document'} suggests this as a rule. Until you approve it, AI tools that can read ${areaOf(p)} see it as reference and aren't told to follow it.`,
        pieces: [p.id],
        quote: `${p.title}. ${p.summary}`,
      })
    }
    if (p.mcp && !p.mcp.approved) {
      out.push({
        id: `mcp-${p.id}`,
        kind: 'proposal',
        message: `A document says AI tools should connect to ${p.title} at ${p.mcp.url}. Until you approve it, AI tools that can read ${areaOf(p)} see ${p.title}'s name and summary as reference, but don't get this address.`,
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
      const id = `stale-${p.id}-${p.date.on}`
      if (age > 365 && !settled.has(id)) {
        out.push({
          id,
          kind: 'stale',
          message: `"${p.title}" was last true ${Math.round(age / 30)} months ago.`,
          pieces: [p.id],
        })
      }
    } else if (p.kind !== 'service') {
      const d = daysUntil(p.date.on, now)
      const id = `due-${p.id}-${p.date.on}`
      if (d >= 0 && d <= 30 && !settled.has(id)) {
        out.push({
          id,
          kind: 'due',
          message: `"${p.title}" ${p.date.means === 'ends' ? 'ends' : 'renews'} in ${d} day${d === 1 ? '' : 's'}.`,
          pieces: [p.id],
        })
      }
    }
  }

  return out
}

export interface PriceNote {
  id: string
  message: string
  pieces: string[]
}

/** Worth knowing when you look at what things cost, and not a reason to interrupt anyone, so these aren't needs. */
export function priceNotes(costs: Cost[], now = Date.now()): PriceNote[] {
  const out: PriceNote[] = toCheck(costs, now).map((c) => ({ id: `check-${c.kind}-${c.piece}`, message: c.message, pieces: [c.piece] }))
  const unpriced = costs.filter((c) => c.amount === null)
  if (unpriced.length) {
    const names = unpriced.map((c) => c.label)
    out.push({
      id: 'unpriced',
      message: `${unpriced.length === 1 ? `${names[0]} has` : `${unpriced.length} services have`} no known price${unpriced.length > 1 ? `: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ' and more' : ''}` : ''}.`,
      pieces: unpriced.map((c) => c.piece),
    })
  }
  return out
}

const ORDER: NeedKind[] = ['exposure', 'secret', 'proposal', 'conflict', 'gap', 'due', 'stale']

export function sortNeeds(list: Need[]): Need[] {
  return [...list].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}
