// What each kind of item looks like: a small picture an ordinary person can read without a legend.
// Drawn on a 16-unit square so the same shape serves the map and the panels.

import type { PieceKind } from '../../core/types.ts'

export const KIND_LABELS: Record<PieceKind, string> = {
  rule: 'Rule',
  fact: 'Fact',
  decision: 'Decision',
  clause: 'Clause',
  spec: 'Spec',
  token: 'Design token',
  service: 'Service',
  contract: 'Contract',
  person: 'Person',
  doc: 'Document',
}

const PAGE = 'M9.5 1.8H4.6a1.1 1.1 0 0 0-1.1 1.1v10.2a1.1 1.1 0 0 0 1.1 1.1h6.8a1.1 1.1 0 0 0 1.1-1.1V4.8zM9.5 1.8v3h3'

const ICONS: Record<Exclude<PieceKind, 'clause'>, string> = {
  // A shield with a tick: something enforced.
  rule: 'M8 1.7l5 1.9v4.1c0 3.2-2.1 5.3-5 6.6-2.9-1.3-5-3.4-5-6.6V3.6zM5.6 7.9l1.8 1.8 3-3.4',
  // The information sign.
  fact: 'M8 14.2a6.2 6.2 0 1 0 0-12.4 6.2 6.2 0 0 0 0 12.4zM8 7.4V11M8 4.9v.02',
  // A signpost: which way we went.
  decision: 'M8 1.8v12.4M8 3.2h4.3L14 4.9l-1.7 1.7H8M8 7.8H3.7L2 9.5l1.7 1.7H8',
  // A clipboard of requirements.
  spec: 'M5.6 3H4.2a1.1 1.1 0 0 0-1.1 1.1v9a1.1 1.1 0 0 0 1.1 1.1h7.6a1.1 1.1 0 0 0 1.1-1.1v-9A1.1 1.1 0 0 0 11.8 3h-1.4M6 1.8h4v2.4H6zM5.6 7.6h4.8M5.6 10.6h4.8',
  // A drop of colour.
  token: 'M8 1.9s-4.7 4.9-4.7 8.1a4.7 4.7 0 0 0 9.4 0C12.7 6.8 8 1.9 8 1.9z',
  // A box, for a service with no tile.
  service: 'M3 3h10v10H3z',
  // A page with a signature on it.
  contract: `${PAGE}M5.5 11.2c.8-1.5 1.4-1.5 1.8-.4s.9 1 1.5.2.9-.6 1.7-.1`,
  // A head and shoulders.
  person: 'M8 7.7a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6zM2.7 14.1c.4-3 2.7-4.5 5.3-4.5s4.9 1.5 5.3 4.5',
  // A page with lines on it.
  doc: `${PAGE}M5.6 8.2h4.8M5.6 10.8h4.8`,
}

const paths = new Map<PieceKind, Path2D>()

/** Draws a kind's picture centred on (x, y), size pixels square. The caller sets the colours. */
export function drawSymbol(ctx: CanvasRenderingContext2D, kind: PieceKind, x: number, y: number, size: number) {
  if (kind === 'clause') {
    // The section sign is the one mark in law everyone has seen at the bottom of a contract.
    ctx.save()
    ctx.font = `${size * 1.02}px Lustria, Georgia, serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('§', x, y + size * 0.03)
    ctx.restore()
    return
  }
  let path = paths.get(kind)
  if (!path) {
    path = new Path2D(ICONS[kind])
    paths.set(kind, path)
  }
  ctx.save()
  ctx.translate(x - size / 2, y - size / 2)
  ctx.scale(size / 16, size / 16)
  ctx.lineWidth = 1.25
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(path)
  ctx.restore()
}

/** The badge everyone knows from their phone's home screen: this one wants you. Ink, because vermilion means sealed. */
export function drawNeedsBadge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ink: string, paper: string) {
  ctx.save()
  ctx.fillStyle = paper
  ctx.beginPath()
  ctx.arc(x, y, r + 1.25, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = ink
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = paper
  const w = r * 0.32
  ctx.fillRect(x - w / 2, y - r * 0.58, w, r * 0.72)
  ctx.beginPath()
  ctx.arc(x, y + r * 0.46, w * 0.58, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** A wax seal, drawn once per theme and scale and cached. */
export function makeWaxSeal(size: number, dpr: number, wax: string, shadow: string, highlight: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const px = Math.ceil(size * dpr)
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  const c = size / 2
  const R = size * 0.42

  // An uneven blob, like poured wax.
  const lobes = 11
  const offsets = [0.96, 1.03, 0.98, 1.05, 0.95, 1.02, 0.99, 1.04, 0.97, 1.03, 0.98]
  const point = (i: number) => {
    const a = (i / lobes) * Math.PI * 2
    return [c + Math.cos(a) * R * offsets[i % lobes], c + Math.sin(a) * R * offsets[i % lobes]]
  }
  ctx.beginPath()
  const start = point(0)
  const startMid = point(lobes - 1)
  ctx.moveTo((start[0] + startMid[0]) / 2, (start[1] + startMid[1]) / 2)
  for (let i = 0; i < lobes; i++) {
    const p = point(i)
    const n = point(i + 1)
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + n[0]) / 2, (p[1] + n[1]) / 2)
  }
  ctx.closePath()
  ctx.fillStyle = wax
  ctx.shadowColor = shadow
  ctx.shadowBlur = size * 0.09
  ctx.shadowOffsetY = size * 0.035
  ctx.fill()
  ctx.shadowColor = 'transparent'

  // The pressed ring.
  ctx.beginPath()
  ctx.arc(c, c, R * 0.68, 0, Math.PI * 2)
  ctx.lineWidth = Math.max(0.8, size * 0.022)
  ctx.strokeStyle = shadow
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(c, c + size * 0.012, R * 0.68, Math.PI * 0.15, Math.PI * 0.85)
  ctx.strokeStyle = highlight
  ctx.stroke()

  // The mark: a V, for vadere.
  ctx.font = `${size * 0.36}px Lustria, Georgia, serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = highlight
  ctx.fillText('V', c, c + size * 0.03)
  ctx.fillStyle = shadow
  ctx.fillText('V', c, c + size * 0.012)
  return canvas
}
