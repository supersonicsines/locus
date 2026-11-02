// The map's legend: each kind of piece is one small ink symbol.

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

/** Draws a symbol centred on (x, y). The caller sets colours; r is the outer size. */
export function drawSymbol(ctx: CanvasRenderingContext2D, kind: PieceKind, x: number, y: number, r: number) {
  ctx.beginPath()
  switch (kind) {
    case 'rule': // filled diamond
      ctx.moveTo(x, y - r * 1.25)
      ctx.lineTo(x + r * 1.25, y)
      ctx.lineTo(x, y + r * 1.25)
      ctx.lineTo(x - r * 1.25, y)
      ctx.closePath()
      ctx.fill()
      break
    case 'fact': // small filled dot
      ctx.arc(x, y, r * 0.72, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'decision': // filled triangle
      ctx.moveTo(x, y - r * 1.2)
      ctx.lineTo(x + r * 1.1, y + r * 0.85)
      ctx.lineTo(x - r * 1.1, y + r * 0.85)
      ctx.closePath()
      ctx.fill()
      break
    case 'clause': // hollow square
      ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7)
      ctx.stroke()
      break
    case 'spec': // hollow dot
      ctx.arc(x, y, r * 0.9, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'token': // half-filled dot
      ctx.arc(x, y, r * 0.95, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x, y, r * 0.95, -Math.PI / 2, Math.PI / 2)
      ctx.closePath()
      ctx.fill()
      break
    case 'service': // a town on an old chart: ring with a dot
      ctx.arc(x, y, r * 1.3, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x, y, r * 0.48, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'contract': // filled square
      ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8)
      ctx.fill()
      break
    case 'person': // hollow triangle
      ctx.moveTo(x, y - r * 1.15)
      ctx.lineTo(x + r, y + r * 0.8)
      ctx.lineTo(x - r, y + r * 0.8)
      ctx.closePath()
      ctx.stroke()
      break
    case 'doc': // short rule
      ctx.rect(x - r * 1.1, y - r * 0.32, r * 2.2, r * 0.64)
      ctx.fill()
      break
  }
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
