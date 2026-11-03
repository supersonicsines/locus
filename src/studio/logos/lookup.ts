// From a service's name to its logo. Names can come from documents, so they're untrusted.
//
// A wrong logo is worse than none, so this is deliberately dull: a Map, so `__proto__` and `constructor`
// find nothing, and exact matches on a name or an alias, after evening out only case and spacing. Never a
// substring, a prefix or a distance. "Stack" doesn't find Stack Overflow, and "Notion" doesn't find Motion.
//
// Nothing outside src/studio may use this. Logos never reach agent text, /llms.txt, MCP output or bundles.

import type { ServiceCategory } from './services.ts'

/** One row of the bundle: id, name, category, domain, aliases, svg, tile colour, whether it fills its tile. */
export type BundleRow = [string, string, ServiceCategory, string, string[], string | null, string | null, 0 | 1]

export interface KnownService {
  id: string
  name: string
  category: ServiceCategory
  domain: string
  aliases: string[]
  rank: number
  /** A sanitised SVG, or null if this service gets a monogram. */
  svg: string | null
  /** The tile behind the mark, when white won't do. */
  tile: string | null
  /** The mark is already a full square, so it fills the tile with no padding. */
  full: boolean
}

export function fromRows(rows: BundleRow[]): KnownService[] {
  return rows.map(([id, name, category, domain, aliases, svg, tile, full], i) => ({ id, name, category, domain, aliases, rank: i + 1, svg, tile, full: full === 1 }))
}

const MAX_NAME = 80

/** Case and spacing only. Punctuation stays, so "Cal.com" and "Cal com" are different names. */
export function normaliseName(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > MAX_NAME * 2) return ''
  const name = raw
    .normalize('NFKC')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return name.length > MAX_NAME ? '' : name
}

export function buildIndex(services: KnownService[]): Map<string, KnownService> {
  const index = new Map<string, KnownService>()
  // Names first, so an alias can never take a real name from the service that owns it.
  for (const s of services) index.set(normaliseName(s.name), s)
  for (const s of services) {
    for (const alias of s.aliases) {
      const k = normaliseName(alias)
      if (k && !index.has(k)) index.set(k, s)
    }
  }
  index.delete('')
  return index
}

export function resolveService(index: Map<string, KnownService>, name: unknown): KnownService | undefined {
  return index.get(normaliseName(name))
}

/** The letter on a monogram tile. It's the first letter or digit of the name, whatever the name is. */
export function monogramOf(name: unknown): string {
  if (typeof name !== 'string') return '·'
  const m = name.match(/[\p{L}\p{N}]/u)
  return m ? m[0].toLocaleUpperCase() : '·'
}
