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
  service: 'Tool',
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
  // A fork in the road, and the way we went.
  decision: 'M8 14.2V9.4M8 9.4 3.6 5M8 9.4l4.4-4.4M12.4 8.4V5H9',
  // A clipboard of requirements.
  spec: 'M5.6 3H4.2a1.1 1.1 0 0 0-1.1 1.1v9a1.1 1.1 0 0 0 1.1 1.1h7.6a1.1 1.1 0 0 0 1.1-1.1v-9A1.1 1.1 0 0 0 11.8 3h-1.4M6 1.8h4v2.4H6zM5.6 7.6h4.8M5.6 10.6h4.8',
  // A drop of colour.
  token: 'M8 1.9s-4.7 4.9-4.7 8.1a4.7 4.7 0 0 0 9.4 0C12.7 6.8 8 1.9 8 1.9z',
  // A box, for a service with no tile.
  service: 'M3 3h10v10H3z',
  // A page with a stamp on it, which is what makes it binding.
  contract: `${PAGE}M5.6 6.8h2.2M8 12.6a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8z`,
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

/**
 * Each reader's colour, so the map can show who reads what before anyone reads a word, as Figma does with cursors.
 * Never a warm colour: red is sealed and amber is what needs you.
 */
const READER_COLOURS = ['#2f6db5', '#0f8a7e', '#6b57c2', '#3a8a3f', '#a24a93', '#4d6475']

export const readerColour = (index: number) => READER_COLOURS[index % READER_COLOURS.length]

/** A reader with no logo: a round mark, the shape people expect a person or a team to be. */
export function drawAvatar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, letter: string, colour: string, font: string) {
  ctx.save()
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.arc(x, y, size / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `500 ${size * 0.54}px ${font}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(letter, x, y + size * 0.04)
  ctx.restore()
}

/**
 * A map pin, the one thing everyone knows means "here". The tip stands on the spot.
 * r is the head's radius. Returns nothing, and leaves the context as it found it.
 */
export function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, glyph: string, edge: string, mark: '!' | '?', font: string, lean = 0) {
  const reach = r * 2.35
  // Where the sides leave the head, tangent to the circle, so the shape has no corner.
  const a = Math.asin(r / reach)
  const start = Math.PI / 2 + a
  const end = Math.PI / 2 - a
  ctx.save()
  // A pin can lean, as one does pushed into a real map. What's on its head stays upright, or a `!` stops reading as one.
  ctx.translate(x, y)
  ctx.rotate(lean)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.arc(0, -reach, r, start, end)
  ctx.closePath()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = edge
  ctx.stroke()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.rotate(-lean)
  const hx = Math.sin(lean) * reach
  const hy = -Math.cos(lean) * reach
  ctx.fillStyle = glyph
  if (mark === '!') {
    const w = r * 0.3
    ctx.strokeStyle = glyph
    ctx.lineWidth = w
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(hx, hy - r * 0.6 + w / 2)
    ctx.lineTo(hx, hy + r * 0.14 - w / 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(hx, hy + r * 0.5, w * 0.62, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.font = `500 ${r * 1.34}px ${font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('?', hx, hy + r * 0.07)
  }
  ctx.restore()
}

/** The unread dot from every inbox: there's something here, when you have a minute. */
/** A pin's head with no pin: the same mark as in the list of what needs you, for where there's no room for the rest. */
export function drawPinHead(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, glyph: string, edge: string, mark: '!' | '?', font: string) {
  ctx.save()
  ctx.lineWidth = 3
  ctx.strokeStyle = edge
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fill()
  ctx.fillStyle = glyph
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${(r * 1.5).toFixed(1)}px ${font}`
  ctx.fillText(mark, x, y + r * 0.06)
  ctx.restore()
}

export function drawNeedDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ink: string, ground: string) {
  ctx.save()
  ctx.fillStyle = ground
  ctx.beginPath()
  ctx.arc(x, y, r + 1.25, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = ink
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
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
