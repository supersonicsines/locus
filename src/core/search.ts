// Search over pieces: BM25 plus one hop along links.
//
// No embeddings on purpose. Agents reformulate queries well, embeddings would
// need another model, and vectors leak meaning.

import type { Link, Piece } from './types.ts'

const STOP = new Set(
  'a an and are as at be but by for from has have i if in into is it its of on or our that the their them they this to was we were what when which who will with you your'.split(
    ' ',
  ),
)

function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [])
    .map((w) => w.replace(/'s$/, ''))
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem)
}

export interface Hit {
  piece: Piece
  score: number
  /** Pieces one link away, which often hold the actual answer. */
  neighbours: Piece[]
}

const K1 = 1.4
const B = 0.75

export function search(pieces: Piece[], links: Link[], query: string, limit = 8): Hit[] {
  const terms = [...new Set(tokenize(query.slice(0, 500)))].slice(0, 32)
  if (!terms.length) return []

  // Title counts three times, summary twice.
  const docs = pieces.map((p) => {
    const tokens = [
      ...tokenize(p.title), ...tokenize(p.title), ...tokenize(p.title),
      ...tokenize(p.summary), ...tokenize(p.summary),
      ...tokenize(p.body),
    ]
    const tf = new Map<string, number>()
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
    return { piece: p, tf, length: tokens.length }
  })
  const avg = docs.reduce((n, d) => n + d.length, 0) / Math.max(docs.length, 1)

  const df = new Map<string, number>()
  for (const t of terms) df.set(t, docs.filter((d) => d.tf.has(t)).length)

  const byId = new Map(pieces.map((p) => [p.id, p]))
  const neighbours = new Map<string, Piece[]>()
  for (const l of links) {
    const a = byId.get(l.from)
    const b = byId.get(l.to)
    if (!a || !b) continue
    // Only the first few are ever shown, and a map can link one item to thousands.
    for (const [from, to] of [[a, b], [b, a]]) {
      const list = neighbours.get(from.id)
      if (!list) neighbours.set(from.id, [to])
      else if (list.length < 4) list.push(to)
    }
  }

  return docs
    .map((d) => {
      let score = 0
      for (const t of terms) {
        const f = d.tf.get(t)
        if (!f) continue
        const idf = Math.log(1 + (docs.length - df.get(t)! + 0.5) / (df.get(t)! + 0.5))
        score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.length) / Math.max(avg, 1))))
      }
      return { piece: d.piece, score }
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((h) => ({ ...h, neighbours: neighbours.get(h.piece.id) ?? [] }))
}
