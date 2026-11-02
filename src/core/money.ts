// Prices: normalising, totalling and spotting what's worth checking.

import type { Cost, Gate, Piece } from './types.ts'

export type Trust = 'known' | 'estimate' | 'unknown'

export function trustOf(cost: Cost): Trust {
  if (cost.amount === null) return 'unknown'
  if (cost.source === 'list' || cost.unit === 'usage') return 'estimate'
  return 'known'
}

/** What this service costs per month, seats included. Null if unknown. */
export function monthly(cost: Cost): number | null {
  if (cost.amount === null) return null
  const seats = cost.unit === 'seat' ? (cost.seats ?? 1) : 1
  const perPeriod = cost.amount * seats
  return cost.period === 'year' ? perPeriod / 12 : perPeriod
}

export type MoneyPeriod = 'month' | 'year'

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'A$' }

export function formatMoney(n: number, currency = 'USD'): string {
  const sym = SYMBOLS[currency] ?? `${currency} `
  const whole = Math.abs(n) >= 10 || Number.isInteger(n)
  const text = (whole ? Math.round(n) : n).toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
  return sym + text
}

/** The figure printed on the map. Free is a value, not a state. */
export function figure(cost: Cost, period: MoneyPeriod = 'month'): string {
  const m = monthly(cost)
  if (m === null) return '?'
  if (m === 0) return 'free'
  const value = period === 'year' ? m * 12 : m
  const text = formatMoney(value, cost.currency)
  return trustOf(cost) === 'estimate' ? `≈${text}` : text
}

export interface ToCheck {
  kind: 'above-list' | 'renewal' | 'usage-jump'
  piece: string
  label: string
  message: string
}

const DAY = 86_400_000

export function daysUntil(iso: string, now = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - now) / DAY)
}

/** Only things you can act on. Stale list prices aren't here, because that's what the ≈ already says. */
export function toCheck(costs: Cost[], now = Date.now()): ToCheck[] {
  const out: ToCheck[] = []
  for (const c of costs) {
    if (c.amount === null) continue
    // Comparing per-seat invoices to a list price needs a seat count, or every one of them fires.
    const comparable = c.unit === 'flat' || (c.unit === 'seat' && c.seats !== undefined)
    if (c.source === 'invoice' && c.listAmount && comparable && c.amount > c.listAmount * 1.2) {
      const over = Math.round((c.amount / c.listAmount - 1) * 100)
      out.push({
        kind: 'above-list',
        piece: c.piece,
        label: c.label,
        message: `${c.label} is billing ${over}% above list price.`,
      })
    }
    if (c.renews) {
      const d = daysUntil(c.renews, now)
      if (d >= 0 && d <= 30) {
        out.push({
          kind: 'renewal',
          piece: c.piece,
          label: c.label,
          message: d === 0 ? `${c.label} renews today.` : `${c.label} renews in ${d} day${d === 1 ? '' : 's'}.`,
        })
      }
    }
    if (c.previous && c.amount > c.previous * 1.25) {
      const up = Math.round((c.amount / c.previous - 1) * 100)
      out.push({
        kind: 'usage-jump',
        piece: c.piece,
        label: c.label,
        message: `${c.label} is up ${up}% on the previous invoice.`,
      })
    }
  }
  return out
}

export interface GateShare {
  gate: string
  name: string
  amount: number
  share: number
}

export interface MoneySummary {
  currency: string
  /** Monthly total in the main currency. */
  total: number
  /** Monthly totals in any other currency. Never converted. */
  others: { currency: string; amount: number }[]
  /** True if the total includes list prices or usage. */
  approximate: boolean
  unpriced: number
  fromInvoices: number
  byGate: GateShare[]
  checks: ToCheck[]
  biggest: number
}

export function summarize(costs: Cost[], gates: Gate[], pieces: Piece[], currency: string, now = Date.now()): MoneySummary {
  const pieceGate = new Map(pieces.map((p) => [p.id, p.gate]))
  const main = costs.filter((c) => c.currency === currency)
  let total = 0
  let invoiced = 0
  let approximate = false
  let biggest = 0
  const perGate = new Map<string, number>()
  const others = new Map<string, number>()

  for (const c of costs) {
    const m = monthly(c)
    if (m === null) continue
    if (c.currency !== currency) {
      others.set(c.currency, (others.get(c.currency) ?? 0) + m)
    }
  }
  for (const c of main) {
    const m = monthly(c)
    if (m === null) continue
    total += m
    biggest = Math.max(biggest, m)
    if (c.source === 'invoice') invoiced += m
    if (trustOf(c) === 'estimate') approximate = true
    const g = pieceGate.get(c.piece)
    if (g) perGate.set(g, (perGate.get(g) ?? 0) + m)
  }

  const byGate = [...perGate.entries()]
    .map(([gate, amount]) => ({
      gate,
      name: gates.find((g) => g.id === gate)?.name ?? '',
      amount,
      share: total ? amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount)

  return {
    currency,
    total,
    others: [...others.entries()].map(([c, amount]) => ({ currency: c, amount })),
    approximate,
    unpriced: costs.filter((c) => c.amount === null).length,
    fromInvoices: total ? Math.round((invoiced / total) * 100) : 0,
    byGate,
    checks: toCheck(costs, now),
    biggest,
  }
}

/** Soundings: true-area rings, so ink mass is proportional to cost. */
export function soundingRadius(monthlyCost: number, biggest: number): number {
  if (monthlyCost <= 0) return 0
  return 72 * Math.sqrt(monthlyCost / Math.max(biggest, 500))
}

/** Towns: five fixed classes, like settlement symbols on an old chart. */
export function townRadius(monthlyCost: number | null): number {
  if (monthlyCost === null || monthlyCost < 50) return 20
  if (monthlyCost < 250) return 28
  if (monthlyCost < 1000) return 40
  if (monthlyCost < 5000) return 56
  return 72
}

export const TOWN_CLASSES = [
  { label: 'Under $50', r: 20 },
  { label: '$50 to $249', r: 28 },
  { label: '$250 to $999', r: 40 },
  { label: '$1,000 to $4,999', r: 56 },
  { label: '$5,000 and up', r: 72 },
]
