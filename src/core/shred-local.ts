// The no-AI shredder. Runs entirely on this machine, so nothing leaves it.
// Rougher than Claude: it splits on headings, guesses from keywords and links by
// shared terms. Good enough to see your own company on the map for free.

import { CATALOG_AS_OF, findInCatalog, servicesMentionedIn, type CatalogEntry } from './catalog.ts'
import { tokenize } from './search.ts'
import type { Cost, Gate, Link, Piece, PieceKind } from './types.ts'

export interface SourceFile {
  name: string
  text: string
}

export interface ShredResult {
  gates: Gate[]
  pieces: Piece[]
  links: Link[]
  costs: Cost[]
}

/** The gates every new map starts with. Shredding fills them; you can rename any but Money. */
export const DEFAULT_GATES: Gate[] = [
  { id: 'brand', name: 'Brand' },
  { id: 'product', name: 'Product' },
  { id: 'engineering', name: 'Engineering' },
  { id: 'legal', name: 'Legal' },
  { id: 'people', name: 'People' },
  { id: 'money', name: 'Money', builtin: 'money' },
]

const GATE_WORDS: Record<string, string[]> = {
  brand: ['brand', 'voice', 'tone', 'logo', 'colour', 'color', 'typography', 'tagline', 'wordmark', 'palette', 'font', 'style guide'],
  product: ['product', 'feature', 'roadmap', 'onboarding', 'customer', 'persona', 'user story', 'release', 'pricing page', 'positioning'],
  engineering: ['api', 'deploy', 'database', 'stack', 'repo', 'infrastructure', 'server', 'migration', 'endpoint', 'schema', 'runbook', 'ci', 'code'],
  legal: ['agreement', 'liability', 'terms', 'privacy', 'gdpr', 'dpa', 'clause', 'shall', 'hereby', 'indemn', 'warranty', 'licence', 'license', 'contract', 'trademark'],
  people: ['hire', 'hiring', 'salary', 'contractor', 'employee', 'handbook', 'equity', 'holiday', 'team', 'payroll', 'benefit'],
  money: ['invoice', 'budget', 'revenue', 'burn', 'runway', 'payment', 'receipt', 'expense', 'cash', 'tax', 'vat'],
}

const CATEGORY_GATE: Record<string, string> = {
  design: 'brand',
  code: 'engineering',
  hosting: 'engineering',
  data: 'engineering',
  payments: 'money',
  email: 'product',
  analytics: 'product',
  support: 'product',
  sales: 'product',
  workspace: 'people',
  ai: 'engineering',
  people: 'people',
  finance: 'money',
  legal: 'legal',
  security: 'engineering',
  scheduling: 'product',
}

function guessGate(fileName: string, text: string): string {
  const hay = `${fileName} ${fileName} ${fileName} ${text}`.toLowerCase()
  let best = 'product'
  let bestScore = 0
  for (const [gate, words] of Object.entries(GATE_WORDS)) {
    let score = 0
    for (const w of words) score += hay.split(w).length - 1
    if (score > bestScore) {
      best = gate
      bestScore = score
    }
  }
  return best
}

function guessKind(fileName: string, title: string, text: string): PieceKind {
  const t = text.toLowerCase()
  if (/\.(json|tokens)$/i.test(fileName) || (t.match(/#[0-9a-f]{6}\b/g) ?? []).length >= 3) return 'token'
  if (/\b(shall|hereby|indemnif|liabilit|governing law)\b/.test(t)) return 'clause'
  if (/^(we |never |always |do not |don't |must )/i.test(title) || /\b(must|never|always|do not|don't)\b/.test(t.slice(0, 200))) return 'rule'
  if (/\b(we decided|we chose|decision:|decided to)\b/.test(t)) return 'decision'
  if (/\b(endpoint|acceptance|requirement|user story|spec)\b/.test(t)) return 'spec'
  return 'fact'
}

function firstSentence(text: string): string {
  const flat = text.replace(/[#*_`>|-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const m = flat.match(/^.{20,180}?[.!?](\s|$)/)
  return (m ? m[0] : flat.slice(0, 140)).trim()
}

interface Section {
  title: string
  text: string
}

/** Splits on Markdown headings, then on shouted or numbered lines, then on paragraphs. */
function split(name: string, text: string): Section[] {
  const base = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
  const lines = text.split(/\r?\n/)
  const isHeading = (l: string) =>
    /^#{1,4}\s+\S/.test(l) ||
    /^\d{1,2}(\.\d{1,2})*\.?\s+[A-Z][^.]{2,70}$/.test(l) ||
    (l.length > 3 && l.length < 70 && l === l.toUpperCase() && /[A-Z]{3}/.test(l))

  const out: Section[] = []
  let current: Section | null = null
  for (const line of lines) {
    if (isHeading(line.trim())) {
      if (current?.text.trim()) out.push(current)
      current = { title: line.trim().replace(/^#+\s*/, ''), text: '' }
    } else {
      if (!current) current = { title: base, text: '' }
      current.text += line + '\n'
    }
  }
  if (current?.text.trim()) out.push(current)

  // Long stretches with no headings become paragraph-sized pieces.
  const sized: Section[] = []
  for (const s of out) {
    if (s.text.length < 1800) {
      sized.push(s)
      continue
    }
    let buf = ''
    let n = 1
    for (const para of s.text.split(/\n\s*\n/)) {
      if (buf.length + para.length > 1400 && buf) {
        sized.push({ title: `${s.title}, part ${n++}`, text: buf })
        buf = ''
      }
      buf += para + '\n\n'
    }
    if (buf.trim()) sized.push({ title: n > 1 ? `${s.title}, part ${n}` : s.title, text: buf })
  }
  return sized.slice(0, 60)
}

function serviceSummary(e: CatalogEntry): string {
  const what: Record<string, string> = {
    design: 'Design tool',
    code: 'Code and project tool',
    hosting: 'Hosting',
    data: 'Data',
    payments: 'Payments',
    email: 'Email and messaging',
    analytics: 'Analytics',
    support: 'Customer support',
    sales: 'Sales and CRM',
    workspace: 'Team workspace',
    ai: 'AI',
    people: 'People and payroll',
    finance: 'Finance',
    legal: 'Legal',
    security: 'Security',
    scheduling: 'Scheduling',
  }
  return `${what[e.category] ?? 'Service'} the company uses.`
}

export function costFromCatalog(e: CatalogEntry, piece: string, label = e.name): Cost {
  return {
    piece,
    label,
    amount: e.amount,
    currency: 'USD',
    unit: e.unit,
    period: 'month',
    source: 'list',
    plan: e.plan,
    asOf: CATALOG_AS_OF,
    ...(e.amount !== null ? { listAmount: e.amount } : {}),
  }
}

/** Pulls a total from an invoice's text, if there's an obvious one. */
function invoiceTotal(text: string): number | null {
  const m = text.match(/\b(?:amount due|total due|grand total|total)\b[^\d$€£]{0,20}[$€£]?\s?([\d,]+(?:\.\d{2})?)/i)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function shredLocally(files: SourceFile[], makeId: () => string): ShredResult {
  const pieces: Piece[] = []
  const links: Link[] = []
  const costs: Cost[] = []
  const services = new Map<string, Piece>()
  const now = Date.now()

  for (const file of files) {
    const fileGate = guessGate(file.name, file.text)
    const isInvoice = /invoice|receipt/i.test(file.name) || /^\s*(tax )?invoice\b/im.test(file.text.slice(0, 400))

    for (const section of split(file.name, file.text)) {
      const body = section.text.trim()
      const kind = guessKind(file.name, section.title, body)
      const gate = isInvoice ? 'money' : guessGate(section.title, body.slice(0, 1600)) || fileGate
      pieces.push({
        id: makeId(),
        title: section.title.slice(0, 90),
        summary: firstSentence(body) || section.title,
        body,
        kind,
        gate,
        source: { file: file.name },
        // Local guesses are never trusted as instructions.
        ...(kind === 'rule' ? { always: 'proposed' as const } : {}),
        updatedAt: now,
      })
    }

    for (const entry of servicesMentionedIn(file.text)) {
      if (!services.has(entry.name)) {
        const piece: Piece = {
          id: makeId(),
          title: entry.name,
          summary: serviceSummary(entry),
          body: '',
          kind: 'service',
          gate: CATEGORY_GATE[entry.category] ?? 'product',
          source: { file: file.name },
          url: entry.pricingUrl ? new URL(entry.pricingUrl).origin : undefined,
          ...(entry.mcpUrl ? { mcp: { url: entry.mcpUrl, approved: true } } : {}),
          updatedAt: now,
        }
        services.set(entry.name, piece)
        pieces.push(piece)
        costs.push(costFromCatalog(entry, piece.id))
      }
    }

    if (isInvoice) {
      const total = invoiceTotal(file.text)
      const vendor = servicesMentionedIn(file.text)[0]
      if (total !== null && vendor) {
        const piece = services.get(vendor.name)!
        const cost = costs.find((c) => c.piece === piece.id)!
        cost.amount = total
        cost.source = 'invoice'
        cost.unit = 'flat'
        cost.asOf = new Date(now).toISOString().slice(0, 10)
      }
    }
  }

  // Link pieces that mention a service to it.
  const named = [...services.entries()]
  for (const p of pieces) {
    if (p.kind === 'service') continue
    for (const [name, svc] of named) {
      if (findInCatalog(name) && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(p.body)) {
        links.push({ from: p.id, to: svc.id, kind: 'uses' })
      }
    }
  }

  // Link pieces by rare terms they share.
  const docs = pieces.filter((p) => p.kind !== 'service').map((p) => ({ p, terms: new Set(tokenize(`${p.title} ${p.body}`)) }))
  const df = new Map<string, number>()
  for (const d of docs) for (const t of d.terms) df.set(t, (df.get(t) ?? 0) + 1)
  const rare = (t: string) => {
    const n = df.get(t) ?? 0
    return n >= 2 && n <= Math.max(3, docs.length * 0.08)
  }
  for (const a of docs) {
    const scored: { id: string; score: number }[] = []
    for (const b of docs) {
      if (a.p.id >= b.p.id) continue
      let score = 0
      for (const t of a.terms) if (b.terms.has(t) && rare(t)) score += 1 / (df.get(t) ?? 1)
      if (score > 0.6) scored.push({ id: b.p.id, score })
    }
    for (const s of scored.sort((x, y) => y.score - x.score).slice(0, 2)) {
      links.push({ from: a.p.id, to: s.id, kind: 'related' })
    }
  }

  return { gates: DEFAULT_GATES, pieces, links, costs }
}
