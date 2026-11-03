// The map. One canvas, drawn on demand, with no framework in the way.
//
// Everything sits in world coordinates. The camera maps them to the screen.
// Hairlines and type stay a constant screen size, as on a printed chart.

import { figure, monthly, soundingRadius, summarize, townRadius, trustOf, type MoneyPeriod, type MoneySummary } from '../../core/money.ts'
import type { Cost, Gate, Link, Piece } from '../../core/types.ts'
import { buildEmptyTerrain, buildTerritories, type Territory } from './layout.ts'
import { drawNeedsBadge, drawSymbol, makeWaxSeal } from './symbols.ts'
import { TileCache } from './tiles.ts'
import { onLogosLoaded, TILE_RADIUS } from '../logos/store.ts'

export interface Palette {
  /** The sea. */
  paper: string
  /** The land an area stands on. */
  land: string
  ink: string
  inkRGB: string
  paperRGB: string
  vermilion: string
  vermilionRGB: string
  waxShadow: string
  waxHighlight: string
  dark: boolean
}

export interface MapData {
  gates: Gate[]
  pieces: Piece[]
  links: Link[]
  costs: Cost[] | null
  currency: string
  /** Pieces flagged in "things that need you". */
  flagged: Set<string>
  /** Pieces with something to check on their price. */
  priceChecks: Set<string>
  /** Gates no password opens, marked with a small seal even with no lens on. */
  sealedToAll: Set<string>
  /** The name of everyone who can read each gate. */
  readers: Map<string, string[]>
  readOnly: boolean
}

export type DollarStyle = 'soundings' | 'towns'

export interface MapCallbacks {
  select(id: string | null): void
  gateClick(id: string): void
  /** A click on an area's land or name with no reader picked, or null for the open sea. */
  areaClick(id: string | null): void
  gateHover(id: string | null): void
  pieceMoved(id: string, x: number, y: number, gate: string | null): void
  cameraChanged(k: number, fitK: number): void
}

interface Node {
  piece: Piece
  x: number
  y: number
  tx: number
  ty: number
  degree: number
  appear: number
  alpha: number
  /** Where this service stands in Towns. */
  townX: number
  townY: number
  cost: Cost | null
  month: number | null
  rank: number
}

interface PlacedLabel {
  id: string
  x: number
  y: number
  align: CanvasTextAlign
  alpha: number
  target: number
  name: boolean
  leader?: boolean
  /** What's printed, line by line, when it isn't the whole title on one line. */
  lines?: string[]
}

const EASE = (t: number) => 1 - Math.pow(1 - t, 3)
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const MIN_K = 0.18
const MAX_K = 3.5

const SERIF = 'Lustria, Georgia, "Times New Roman", serif'

/** A service's tile on the map, in screen pixels. It grows slowly with zoom, and stops at sizes a logo can still be read at. */
const tileSize = (k: number) => Math.round(clamp(25 * Math.sqrt(k), 14, 30))

/** Any other item's picture, in screen pixels. Below READABLE_K a picture can't be read, so it's a dot. */
const iconSize = (k: number) => Math.round(clamp(18.5 * Math.sqrt(k), 12, 20))
const READABLE_K = 0.3
const LABEL_LEADING = 13

/**
 * A long name breaks onto two lines, as on a printed map, at whichever word balances them best.
 * Past two lines it stops at a word. Hover or click for the whole of it.
 */
const LINE_CHARS = 21
function wrapTitle(title: string): { lines: string[]; cut: boolean } {
  if (title.length <= LINE_CHARS) return { lines: [title], cut: false }
  const words = title.split(' ')
  let best = -1
  let bestLength = Infinity
  for (let i = 1; i < words.length; i++) {
    const longest = Math.max(words.slice(0, i).join(' ').length, words.slice(i).join(' ').length)
    if (longest < bestLength) {
      bestLength = longest
      best = i
    }
  }
  if (best < 0) return { lines: [`${title.slice(0, LINE_CHARS - 1)}…`], cut: true }
  const first = words.slice(0, best).join(' ')
  const second = words.slice(best).join(' ')
  const limit = LINE_CHARS + 3
  if (first.length <= limit && second.length <= limit) return { lines: [first, second], cut: false }
  // Too long for two lines: fill the first, then stop the second at a word.
  const top: string[] = []
  const rest = [...words]
  while (rest.length && [...top, rest[0]].join(' ').length <= LINE_CHARS) top.push(rest.shift()!)
  if (!top.length) top.push(rest.shift()!.slice(0, LINE_CHARS))
  const bottom: string[] = []
  while (rest.length && [...bottom, rest[0]].join(' ').length <= LINE_CHARS - 1) bottom.push(rest.shift()!)
  return { lines: [top.join(' '), `${bottom.join(' ')}…`], cut: true }
}

export class MapView {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private cb: MapCallbacks
  // Canvas fonts can't use var(), so this reads the --sans token and the sans is only named in styles.css.
  private sans = getComputedStyle(document.documentElement).getPropertyValue('--sans').trim() || 'sans-serif'
  private w = 0
  private h = 0
  private dpr = 1

  private data: MapData = { gates: [], pieces: [], links: [], costs: null, currency: 'USD', flagged: new Set(), priceChecks: new Set(), sealedToAll: new Set(), readers: new Map(), readOnly: false }
  private nodes: Node[] = []
  private byId = new Map<string, Node>()
  private territories: Territory[] = []
  private terrain: Path2D[] = []
  private summary: MoneySummary | null = null

  private cam = { x: 0, y: 0, k: 1 }
  private camTarget: { x: number; y: number; k: number } | null = null
  private fitK = 1
  private overlayK = 1
  private hasFitted = false
  private rightInset = 28
  private userMoved = false

  private palette: Palette | null = null
  private wax = new Map<number, HTMLCanvasElement>()
  private tiles: TileCache
  private stopLogos: () => void
  private hatch: CanvasPattern | null = null
  private sealedHatch: CanvasPattern | null = null

  private selected: string | null = null
  private hovered: string | null = null
  private highlight: Set<string> | null = null
  private hoverGate: string | null = null
  private activeArea: string | null = null
  private slidOver = 0
  private dropGate: string | null = null

  /** How sealed each gate is, 0 to 1, animating towards its target. */
  private seal = new Map<string, number>()
  private sealTarget = new Set<string>()
  private sealLanded = new Map<string, number>()
  private lensActive = false
  /** Closed on this password but still readable until the next publish. */
  private pendingSeal = new Set<string>()

  private dollarOn = false
  private dollarT = 0
  private dollarStyle: DollarStyle = 'soundings'
  private period: MoneyPeriod = 'month'
  private townsReady = false

  private labels: PlacedLabel[] = []
  private labelCache = new Map<string, { lines: string[]; cut: boolean; width: number; wholeWidth: number }>()
  private figures = new Map<string, PlacedLabel>()
  private labelTimer = 0
  private gateAlpha = 1

  private raf = 0
  private lastFrame = 0
  private reducedMotion = false
  private appeared = false

  private pointers = new Map<number, { x: number; y: number }>()
  private drag: { kind: 'pan' | 'piece' | 'pinch'; id?: string; sx: number; sy: number; moved: boolean; lastX: number; lastY: number; dist?: number; k?: number } | null = null
  private spaceDown = false

  constructor(canvas: HTMLCanvasElement, cb: MapCallbacks) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })!
    this.cb = cb
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    this.tiles = new TileCache(() => this.invalidate())
    // Logos arrive when they arrive. Tiles keep their size, so the swap moves nothing.
    this.stopLogos = onLogosLoaded(() => {
      this.tiles.reset()
      this.invalidate()
    })

    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointermove', this.onMove)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('pointercancel', this.onUp)
    canvas.addEventListener('pointerleave', this.onLeave)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('dblclick', this.onDouble)
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKey)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.stopLogos()
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKey)
  }

  resize(w: number, h: number, dpr: number) {
    const changedSize = this.w !== w || this.h !== h
    this.w = w
    this.h = h
    this.dpr = dpr
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.hatch = null
    this.sealedHatch = null
    if (changedSize) {
      this.terrain = buildEmptyTerrain(w, h)
      if (this.nodes.length) {
        const { k } = this.computeFit()
        this.fitK = k
        if (!this.hasFitted) this.fit(false)
      }
    }
    this.scheduleLabels(0)
    this.invalidate()
  }

  /** Room taken by a panel on the right. The map re-fits unless you've moved it yourself. */
  setRightInset(px: number) {
    if (this.rightInset === px) return
    this.rightInset = px
    if (!this.userMoved && this.nodes.length) this.fit(true)
    else {
      this.scheduleLabels(0)
      this.invalidate()
    }
  }

  setPalette(p: Palette) {
    this.palette = p
    this.wax.clear()
    this.hatch = null
    this.sealedHatch = null
    this.invalidate()
  }

  /** Called when fonts arrive, so canvas text and the wax mark use them. */
  fontsReady() {
    this.labelCache.clear()
    this.wax.clear()
    this.tiles.reset()
    this.scheduleLabels(0)
    this.invalidate()
  }

  setData(data: MapData) {
    const prev = this.byId
    this.data = data
    const degree = new Map<string, number>()
    for (const l of data.links) {
      degree.set(l.from, (degree.get(l.from) ?? 0) + 1)
      degree.set(l.to, (degree.get(l.to) ?? 0) + 1)
    }
    const costOf = new Map((data.costs ?? []).map((c) => [c.piece, c]))
    this.summary = data.costs ? summarize(data.costs, data.gates, data.pieces, data.currency) : null

    let positionsChanged = prev.size !== data.pieces.length
    this.nodes = data.pieces.map((p) => {
      const old = prev.get(p.id)
      const x = p.x ?? old?.tx ?? 0
      const y = p.y ?? old?.ty ?? 0
      if (!old || old.tx !== x || old.ty !== y || old.piece.gate !== p.gate) positionsChanged = true
      const cost = costOf.get(p.id) ?? null
      return {
        piece: p,
        x: old?.x ?? x,
        y: old?.y ?? y,
        tx: x,
        ty: y,
        degree: degree.get(p.id) ?? 0,
        appear: old?.appear ?? (this.appeared ? 0 : 1),
        alpha: old?.alpha ?? 1,
        townX: x,
        townY: y,
        cost,
        month: cost ? monthly(cost) : null,
        rank: 0,
      }
    })
    const ordered = this.nodes.filter((n) => n.cost).sort((a, b) => (b.month ?? -1) - (a.month ?? -1))
    ordered.forEach((n, i) => (n.rank = i))
    this.byId = new Map(this.nodes.map((n) => [n.piece.id, n]))

    if (positionsChanged || !this.territories.length) {
      this.territories = buildTerritories(data.gates, this.nodes.map((n) => ({ gate: n.piece.gate, x: n.tx, y: n.ty, weight: n.degree })))
      this.townsReady = false
    }
    if (this.nodes.length) {
      const { k } = this.computeFit()
      this.fitK = k
      if (!this.hasFitted) {
        this.fit(false)
        this.hasFitted = true
      }
      this.appeared = true
    } else {
      this.hasFitted = false
    }
    this.cb.cameraChanged(this.cam.k, this.fitK)
    this.scheduleLabels(0)
    this.invalidate()
  }

  setSelected(id: string | null) {
    if (this.selected === id) return
    this.selected = id
    this.scheduleLabels(0)
    this.invalidate()
  }

  setHighlight(ids: Set<string> | null) {
    this.highlight = ids
    this.invalidate()
  }

  setGateHover(id: string | null) {
    this.hoverGate = id
    this.invalidate()
  }

  /**
   * The area open in the side panel. Opening a panel isn't a reason to move the map,
   * unless the panel would cover the very thing it's about. Then the map slides over, and back after.
   */
  setActiveArea(id: string | null) {
    if (this.activeArea === id) return
    this.activeArea = id
    const t = this.territories.find((x) => x.gate === id)
    if (t && this.w > 720) {
      const [right] = this.toScreen(t.maxX, t.minY)
      const over = right - (this.w - 396)
      if (over > 0) {
        const base = this.camTarget ?? this.cam
        this.slidOver = (this.slidOver || 0) + over
        const target = { ...base, x: base.x - over }
        if (this.reducedMotion) this.cam = target
        else this.camTarget = target
        this.scheduleLabels(300)
      }
    } else if (!id && this.slidOver) {
      const base = this.camTarget ?? this.cam
      const target = { ...base, x: base.x + this.slidOver }
      this.slidOver = 0
      if (this.reducedMotion) this.cam = target
      else this.camTarget = target
      this.scheduleLabels(300)
    }
    this.invalidate()
  }

  /** Which gates look sealed. A null set means no lens: everything is open. */
  setLens(closed: Set<string> | null, pending: Set<string> = new Set()) {
    this.lensActive = closed !== null
    this.sealTarget = closed ?? new Set()
    // The wax lands when a gate is truly sealed: straight away if nothing was
    // ever published to this password, or on publish if something was.
    for (const id of this.sealTarget) {
      const appearing = !this.sealLanded.has(id) && (this.seal.get(id) ?? 0) < 0.5
      const justPublished = this.pendingSeal.has(id) && !pending.has(id)
      if ((appearing && !pending.has(id)) || justPublished) this.sealLanded.set(id, performance.now())
    }
    this.pendingSeal = pending
    for (const id of this.sealLanded.keys()) if (!this.sealTarget.has(id)) this.sealLanded.delete(id)
    this.scheduleLabels(120)
    this.invalidate()
  }

  setDollars(on: boolean, style: DollarStyle, period: MoneyPeriod) {
    const styleChanged = style !== this.dollarStyle
    const wasOn = this.dollarOn
    this.dollarOn = on && !!this.data.costs
    this.dollarStyle = style
    this.period = period
    if (this.dollarOn && !wasOn) {
      this.townsReady = false
      this.dollarT = this.reducedMotion ? 1 : 0
    }
    if (styleChanged && this.dollarOn) {
      this.townsReady = false
      this.dollarT = this.reducedMotion ? 1 : 0.02
    }
    if (this.dollarOn && style === 'towns' && !this.townsReady) this.solveTowns()

    if (this.dollarOn !== wasOn || styleChanged) {
      // Your place on the map is yours: the camera only moves if you haven't
      // moved it yourself, or if no service would be in view at all.
      if (!this.userMoved) {
        this.frameOverlay()
      } else if (this.dollarOn && !this.anyServiceInView()) {
        this.frameOverlay()
      }
    }
    this.scheduleLabels(this.dollarOn && !wasOn ? 0 : 60)
    this.invalidate()
  }

  /** Eases just enough to keep every price in frame, or back when they're gone. */
  private frameOverlay() {
    const f = this.computeFit(this.dollarOn)
    this.overlayK = f.k
    if (this.reducedMotion) {
      this.cam = { ...f }
      this.camTarget = null
    } else {
      this.camTarget = f
    }
    this.cb.cameraChanged(f.k, this.fitK)
  }

  private anyServiceInView(): boolean {
    return this.nodes.some((n) => {
      if (!n.cost) return false
      const [x, y] = this.toScreen(n.tx, n.ty)
      return x > 0 && x < this.w && y > 0 && y < this.h
    })
  }

  // Camera

  private toScreen(x: number, y: number): [number, number] {
    return [x * this.cam.k + this.cam.x, y * this.cam.k + this.cam.y]
  }

  private toWorld(x: number, y: number): [number, number] {
    return [(x - this.cam.x) / this.cam.k, (y - this.cam.y) / this.cam.k]
  }

  private computeFit(withOverlay = false) {
    if (!this.territories.length && !this.nodes.length) return { k: 1, x: this.w / 2, y: this.h / 2 }
    const xs: number[] = []
    const ys: number[] = []
    for (const t of this.territories) xs.push(t.minX, t.maxX), ys.push(t.minY, t.maxY)
    for (const n of this.nodes) xs.push(n.tx), ys.push(n.ty)
    // Prices can stand taller than the land, so they get counted too.
    if (withOverlay) {
      const towns = this.dollarStyle === 'towns'
      for (const n of this.nodes) {
        if (!n.cost) continue
        const inMain = n.cost.currency === this.data.currency
        const r = (towns ? townRadius(inMain ? n.month : null) : inMain ? soundingRadius(n.month ?? 0, this.summary?.biggest ?? 0) : 6) / this.fitK
        const x = towns ? n.townX : n.tx
        const y = towns ? n.townY : n.ty
        xs.push(x - r, x + r)
        ys.push(y - r, y + r)
      }
    }
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    // Leave room for the panels that float over the map.
    const narrow = this.w < 720
    const left = narrow ? 16 : 300
    const right = narrow ? 16 : this.rightInset + (this.rightInset > 28 ? 16 : 0)
    // Room for a territory's name and the line under it, below the top controls.
    const top = narrow ? 170 : 110
    const bottom = narrow ? (this.dollarOn && withOverlay ? 150 : 40) : 24
    const k = clamp(Math.min((this.w - left - right) / (maxX - minX || 1), (this.h - top - bottom) / (maxY - minY || 1)), MIN_K, 1.25)
    return {
      k,
      x: left + (this.w - left - right - (maxX - minX) * k) / 2 - minX * k,
      y: top + (this.h - top - bottom - (maxY - minY) * k) / 2 - minY * k,
    }
  }

  fit(animated = true) {
    this.userMoved = false
    this.fitK = this.computeFit().k
    const f = this.computeFit(this.dollarOn)
    this.overlayK = f.k
    if (animated && !this.reducedMotion) this.camTarget = f
    else {
      this.cam = { ...f }
      this.camTarget = null
    }
    this.cb.cameraChanged(f.k, this.fitK)
    this.scheduleLabels(animated ? 300 : 0)
    this.invalidate()
  }

  zoomBy(factor: number) {
    this.userMoved = true
    const k = this.clampZoom((this.camTarget?.k ?? this.cam.k) * factor)
    const [wx, wy] = this.toWorld(this.w / 2, this.h / 2)
    this.camTarget = { k, x: this.w / 2 - wx * k, y: this.h / 2 - wy * k }
    if (this.reducedMotion) {
      this.cam = { ...this.camTarget }
      this.camTarget = null
    }
    this.cb.cameraChanged(k, this.fitK)
    this.scheduleLabels(260)
    this.invalidate()
  }

  focusPiece(id: string, zoom = true) {
    const n = this.byId.get(id)
    if (!n) return
    this.userMoved = true
    const k = zoom ? Math.max(this.cam.k, Math.min(1.1, this.fitK * 1.8)) : this.cam.k
    // Keep the piece clear of the peek on the right.
    const cx = (this.w - (this.w > 720 ? 380 : 0)) / 2 + (this.w > 720 ? 120 : 0)
    const target = { k, x: cx - n.tx * k, y: this.h / 2 - n.ty * k }
    if (this.reducedMotion) this.cam = target
    else this.camTarget = target
    this.cb.cameraChanged(k, this.fitK)
    this.scheduleLabels(300)
    this.invalidate()
  }

  private clampZoom(k: number) {
    const floor = this.dollarOn && this.dollarStyle === 'towns' ? Math.min(this.fitK, this.overlayK) : MIN_K
    return clamp(k, floor, MAX_K)
  }

  // Input

  private localPoint(e: PointerEvent | WheelEvent | MouseEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  private displayPos(n: Node): [number, number] {
    const t = this.dollarOn && this.dollarStyle === 'towns' ? EASE(this.dollarT) : 0
    if (t > 0 && n.cost) return [lerp(n.x, n.townX, t), lerp(n.y, n.townY, t)]
    return [n.x, n.y]
  }

  private hitNode(sx: number, sy: number): Node | null {
    let best: Node | null = null
    let bestD = Infinity
    const k = this.cam.k
    for (const n of this.nodes) {
      if (this.sealTarget.has(n.piece.gate)) continue
      if (n.alpha < 0.05) continue
      const [wx, wy] = this.displayPos(n)
      const [x, y] = this.toScreen(wx, wy)
      let r = n.piece.kind === 'service' ? tileSize(k) / 2 + 3 : Math.max(10, iconSize(k) / 2 + 2)
      if (this.dollarOn && n.cost && this.dollarStyle === 'towns') r = this.townScreenRadius(n)
      if (this.dollarOn && n.cost && this.dollarStyle === 'soundings') r = Math.max(r, Math.min(this.soundingScreenRadius(n), 24))
      const d = Math.hypot(sx - x, sy - y)
      if (d < r && d < bestD) {
        best = n
        bestD = d
      }
    }
    return best
  }

  private gateAt(wx: number, wy: number): string | null {
    const probe = this.ctx
    probe.save()
    probe.setTransform(1, 0, 0, 1, 0, 0)
    let found: string | null = null
    for (const t of this.territories) {
      if (probe.isPointInPath(t.outer, wx, wy)) {
        found = t.gate
        break
      }
    }
    probe.restore()
    return found
  }

  /** While a password is selected, a territory or its name is a switch. */
  private gateLabelAt(sx: number, sy: number): string | null {
    for (const t of this.territories) {
      const [x, y] = this.gateLabelPos(t)
      const halfW = Math.max(70, this.gateLabelWidth(t) / 2 + 12)
      if (Math.abs(sx - x) < halfW && sy > y - 22 && sy < y + 34) return t.gate
    }
    const [wx, wy] = this.toWorld(sx, sy)
    return this.gateAt(wx, wy)
  }

  private onDown = (e: PointerEvent) => {
    const [x, y] = this.localPoint(e)
    this.pointers.set(e.pointerId, { x, y })
    this.canvas.setPointerCapture(e.pointerId)
    this.camTarget = null

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      this.drag = { kind: 'pinch', sx: x, sy: y, moved: true, lastX: (a.x + b.x) / 2, lastY: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y), k: this.cam.k }
      return
    }

    const middle = e.button === 1
    const hit = !this.spaceDown && !middle ? this.hitNode(x, y) : null
    if (hit && !this.data.readOnly) {
      this.drag = { kind: 'piece', id: hit.piece.id, sx: x, sy: y, moved: false, lastX: x, lastY: y }
    } else if (hit) {
      this.drag = { kind: 'pan', id: hit.piece.id, sx: x, sy: y, moved: false, lastX: x, lastY: y }
    } else {
      this.drag = { kind: 'pan', sx: x, sy: y, moved: false, lastX: x, lastY: y }
    }
    this.canvas.style.cursor = hit ? 'grabbing' : 'grabbing'
  }

  private onMove = (e: PointerEvent) => {
    const [x, y] = this.localPoint(e)
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x, y })

    if (this.drag?.kind === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const k = this.clampZoom((this.drag.k ?? 1) * (dist / (this.drag.dist || 1)))
      const [wx, wy] = this.toWorld(this.drag.lastX, this.drag.lastY)
      this.cam = { k, x: cx - wx * k, y: cy - wy * k }
      this.drag.lastX = cx
      this.drag.lastY = cy
      this.cb.cameraChanged(k, this.fitK)
      this.scheduleLabels(160)
      this.invalidate()
      return
    }

    if (!this.drag) {
      const hit = this.hitNode(x, y)
      // An area is a thing you can click: its land and its name both answer.
      const overLabel = !hit ? this.gateLabelAt(x, y) : null
      const id = hit?.piece.id ?? null
      if (id !== this.hovered) {
        this.hovered = id
        this.scheduleLabels(0)
        this.invalidate()
      }
      const gate = overLabel
      if (gate !== this.hoverGate) {
        this.hoverGate = gate
        this.cb.gateHover(gate)
        this.invalidate()
      }
      this.canvas.style.cursor = this.spaceDown ? 'grab' : hit || overLabel ? 'pointer' : 'default'
      return
    }

    const dx = x - this.drag.lastX
    const dy = y - this.drag.lastY
    if (!this.drag.moved && Math.hypot(x - this.drag.sx, y - this.drag.sy) > 3) this.drag.moved = true
    if (!this.drag.moved) return

    if (this.drag.kind === 'pan') {
      this.cam.x += dx
      this.cam.y += dy
      this.userMoved = true
      this.scheduleLabels(120)
    } else if (this.drag.kind === 'piece' && this.drag.id) {
      const n = this.byId.get(this.drag.id)!
      const [wx, wy] = this.toWorld(x, y)
      n.x = n.tx = n.townX = wx
      n.y = n.ty = n.townY = wy
      const over = this.gateAt(wx, wy)
      this.dropGate = over && over !== n.piece.gate ? over : null
    }
    this.drag.lastX = x
    this.drag.lastY = y
    this.invalidate()
  }

  private onUp = (e: PointerEvent) => {
    const [x, y] = this.localPoint(e)
    this.pointers.delete(e.pointerId)
    const d = this.drag
    this.drag = null
    this.canvas.style.cursor = 'default'
    if (!d) return

    if (!d.moved) {
      // A click on a territory's name flips that gate, while a password is selected.
      if (this.lensActive) {
        const gate = this.gateLabelAt(x, y)
        const hit = this.hitNode(x, y)
        if (gate && !hit) {
          this.cb.gateClick(gate)
          return
        }
      }
      const hit = d.id ? this.byId.get(d.id) : this.hitNode(x, y)
      this.cb.select(hit ? hit.piece.id : null)
      if (!hit) this.cb.areaClick(this.gateLabelAt(x, y))
      return
    }

    if (d.kind === 'piece' && d.id) {
      const n = this.byId.get(d.id)!
      const gate = this.dropGate
      this.dropGate = null
      this.cb.pieceMoved(d.id, Math.round(n.tx * 10) / 10, Math.round(n.ty * 10) / 10, gate)
      this.scheduleLabels(0)
      this.invalidate()
    }
    if (d.kind === 'pan') {
      this.cb.cameraChanged(this.cam.k, this.fitK)
      this.scheduleLabels(40)
    }
  }

  private onLeave = () => {
    if (this.hoverGate) {
      this.hoverGate = null
      this.cb.gateHover(null)
      this.invalidate()
    }
    if (this.hovered) {
      this.hovered = null
      this.scheduleLabels(0)
      this.invalidate()
    }
  }

  private onDouble = (e: MouseEvent) => {
    const [x, y] = this.localPoint(e)
    if (this.hitNode(x, y)) return
    const k = this.clampZoom(this.cam.k * 1.6)
    const [wx, wy] = this.toWorld(x, y)
    this.camTarget = { k, x: x - wx * k, y: y - wy * k }
    this.scheduleLabels(280)
    this.cb.cameraChanged(k, this.fitK)
    this.invalidate()
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    this.camTarget = null
    this.userMoved = true
    if (e.ctrlKey || e.metaKey) {
      // Pinch on a trackpad arrives as ctrl+wheel.
      const [x, y] = this.localPoint(e)
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.01))
      const k = this.clampZoom(this.cam.k * factor)
      const [wx, wy] = this.toWorld(x, y)
      this.cam = { k, x: x - wx * k, y: y - wy * k }
      this.cb.cameraChanged(k, this.fitK)
    } else {
      const unit = e.deltaMode === 1 ? 16 : 1
      this.cam.x -= e.deltaX * unit
      this.cam.y -= e.deltaY * unit
    }
    this.scheduleLabels(140)
    this.invalidate()
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return
    const t = e.target as HTMLElement | null
    if (t && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName)) return
    if (t?.isContentEditable) return
    this.spaceDown = e.type === 'keydown'
    this.canvas.style.cursor = this.spaceDown ? 'grab' : 'default'
    if (e.type === 'keydown') e.preventDefault()
  }

  // Frame loop

  invalidate() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (now: number) => {
    this.raf = 0
    const dt = Math.min(48, now - (this.lastFrame || now - 16))
    this.lastFrame = now
    const moving = this.step(dt, now)
    this.draw(now)
    if (moving) this.invalidate()
  }

  /** Advances all animation. Returns true if anything is still moving. */
  private step(dt: number, now: number): boolean {
    let moving = false
    const follow = (rate: number) => 1 - Math.exp(-dt * rate)

    if (this.camTarget) {
      const f = follow(0.012)
      this.cam.x = lerp(this.cam.x, this.camTarget.x, f)
      this.cam.y = lerp(this.cam.y, this.camTarget.y, f)
      this.cam.k = lerp(this.cam.k, this.camTarget.k, f)
      if (Math.abs(this.cam.k - this.camTarget.k) < 0.0008 && Math.abs(this.cam.x - this.camTarget.x) < 0.3 && Math.abs(this.cam.y - this.camTarget.y) < 0.3) {
        this.cam = { ...this.camTarget }
        this.camTarget = null
        // Labels placed mid-flight were judged at the wrong zoom, so they're placed again where the camera landed.
        this.scheduleLabels(0)
      } else moving = true
    }

    for (const n of this.nodes) {
      if (this.drag?.id !== n.piece.id && (Math.abs(n.x - n.tx) > 0.05 || Math.abs(n.y - n.ty) > 0.05)) {
        if (this.reducedMotion) {
          n.x = n.tx
          n.y = n.ty
        } else {
          const f = follow(0.008)
          n.x = lerp(n.x, n.tx, f)
          n.y = lerp(n.y, n.ty, f)
          moving = true
        }
      }
      if (n.appear < 1) {
        n.appear = this.reducedMotion ? 1 : Math.min(1, n.appear + dt / 280)
        moving = true
      }
    }

    // Sealing and unsealing. Slower to seal, so the moment can be seen.
    for (const g of this.data.gates) {
      const cur = this.seal.get(g.id) ?? 0
      const target = this.sealTarget.has(g.id) ? 1 : 0
      if (cur !== target) {
        const speed = target ? dt / 300 : dt / 200
        const next = this.reducedMotion ? target : target > cur ? Math.min(1, cur + speed) : Math.max(0, cur - speed)
        this.seal.set(g.id, next)
        moving = true
      }
    }

    // The $ transition.
    const dTarget = this.dollarOn ? 1 : 0
    if (this.dollarT !== dTarget) {
      const span = this.dollarStyle === 'towns' ? 700 : 500
      const s = dt / span
      this.dollarT = this.reducedMotion ? dTarget : dTarget > this.dollarT ? Math.min(1, this.dollarT + s) : Math.max(0, this.dollarT - s * 1.3)
      moving = true
    }
    if (this.dollarOn && this.dollarStyle === 'towns' && !this.townsReady) this.solveTowns()

    // Each piece's visibility, so dimming and restoring are smooth.
    const neighbours = this.activeNeighbours()
    for (const n of this.nodes) {
      const target = this.nodeAlpha(n, neighbours)
      if (Math.abs(n.alpha - target) > 0.004) {
        n.alpha = this.reducedMotion ? target : lerp(n.alpha, target, follow(0.016))
        moving = true
      } else n.alpha = target
    }

    for (const l of this.labels) {
      if (l.alpha !== l.target) {
        l.alpha = l.target > l.alpha ? Math.min(l.target, l.alpha + dt / 140) : Math.max(l.target, l.alpha - dt / 90)
        moving = true
      }
    }
    for (const l of this.figures.values()) {
      if (l.alpha !== l.target) {
        l.alpha = l.target > l.alpha ? Math.min(l.target, l.alpha + dt / 140) : Math.max(l.target, l.alpha - dt / 90)
        moving = true
      }
    }
    this.labels = this.labels.filter((l) => l.alpha > 0 || l.target > 0)

    for (const [, t] of this.sealLanded) if (now - t < 520) moving = true
    return moving
  }

  private activeNeighbours(): Set<string> | null {
    const focus = this.hovered ?? this.selected
    if (!focus) return null
    const set = new Set<string>([focus])
    for (const l of this.data.links) {
      if (l.from === focus) set.add(l.to)
      if (l.to === focus) set.add(l.from)
    }
    return set
  }

  private nodeAlpha(n: Node, neighbours: Set<string> | null): number {
    let a = 1
    if (this.dollarOn && !n.cost) a *= 0.15
    a *= 1 - (this.seal.get(n.piece.gate) ?? 0)
    if (this.highlight) a *= this.highlight.has(n.piece.id) ? 1 : 0.14
    else if (neighbours && !this.dollarOn) a *= neighbours.has(n.piece.id) ? 1 : 0.28
    return a
  }

  // Towns: discs push apart, each pulled to its own saved position, inside its land.

  private solveTowns() {
    this.townsReady = true
    const services = this.nodes.filter((n) => n.cost)
    const world = (r: number) => r / this.fitK
    const items = services.map((n) => ({
      n,
      r: world(townRadius(n.cost!.currency === this.data.currency ? n.month : null)) + world(9),
      x: n.tx,
      y: n.ty,
    }))
    const outer = new Map(this.territories.map((t) => [t.gate, t]))
    const ctx = this.ctx
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    for (let iter = 0; iter < 160; iter++) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i]
          const b = items[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const d = Math.hypot(dx, dy) || 0.01
          const min = a.r + b.r
          if (d < min) {
            const push = ((min - d) / d) * 0.5
            a.x -= dx * push
            a.y -= dy * push
            b.x += dx * push
            b.y += dy * push
          }
        }
      }
      for (const it of items) {
        it.x += (it.n.tx - it.x) * 0.02
        it.y += (it.n.ty - it.y) * 0.02
        const t = outer.get(it.n.piece.gate)
        if (t && !ctx.isPointInPath(t.outer, it.x, it.y)) {
          it.x += (t.cx - it.x) * 0.06
          it.y += (t.cy - it.y) * 0.06
        }
      }
    }
    ctx.restore()
    for (const it of items) {
      it.n.townX = it.x
      it.n.townY = it.y
    }
    this.scheduleLabels(0)
  }

  private soundingScreenRadius(n: Node): number {
    const inMain = n.cost?.currency === this.data.currency
    const biggest = this.summary?.biggest ?? 0
    if (!n.cost) return 0
    if (!inMain) return 6 * (this.cam.k / this.fitK)
    return soundingRadius(n.month ?? 0, biggest) * (this.cam.k / this.fitK)
  }

  private townScreenRadius(n: Node): number {
    const inMain = n.cost?.currency === this.data.currency
    return townRadius(inMain ? n.month : null) * (this.cam.k / this.fitK)
  }

  // Labels

  scheduleLabels(delay: number) {
    clearTimeout(this.labelTimer)
    if (delay <= 0) this.placeLabels()
    else {
      this.labelTimer = window.setTimeout(() => {
        this.placeLabels()
        this.invalidate()
      }, delay)
    }
  }

  /** Wrapping and measuring text are the slow part of placing labels, and a title rarely changes. */
  private labelFor(title: string, font: string) {
    let label = this.labelCache.get(title)
    if (!label) {
      const { lines, cut } = wrapTitle(title)
      this.ctx.font = font
      label = {
        lines,
        cut,
        width: Math.max(...lines.map((line) => this.ctx.measureText(line).width)),
        wholeWidth: this.ctx.measureText(title).width,
      }
      this.labelCache.set(title, label)
    }
    return label
  }

  private measure(text: string, font: string): number {
    this.ctx.font = font
    return this.ctx.measureText(text).width
  }

  private placeLabels() {
    if (!this.w) return
    const rects: { x: number; y: number; w: number; h: number }[] = []
    const narrow = this.w <= 720
    const minX = narrow ? 4 : 292
    const maxX = narrow || this.rightInset <= 28 ? this.w - 4 : this.w - this.rightInset
    const free = (r: { x: number; y: number; w: number; h: number }) => {
      if (r.x < minX || r.y < 4 || r.x + r.w > maxX || r.y + r.h > this.h - 4) return false
      return !rects.some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y)
    }

    // Territory names claim their space first.
    for (const t of this.territories) {
      const [x, y] = this.gateLabelPos(t)
      const w = this.gateLabelWidth(t)
      const under = Math.max(w, this.measure(this.areaNote(t.gate).text, `11.5px ${this.sans}`))
      rects.push({ x: x - under / 2 - 6, y: y - 18, w: under + 12, h: 38 })
    }

    if (this.dollarOn) {
      this.placeFigures(rects, free)
      return
    }
    for (const f of this.figures.values()) f.target = 0

    const k = this.cam.k
    const focus = this.hovered ?? this.selected
    const neighbours = this.activeNeighbours()

    // Symbols are obstacles too: a label must never sit on top of another piece.
    const tile = tileSize(k)
    const icon = iconSize(k)
    const marks: { id: string; x: number; y: number; w: number; h: number }[] = []
    for (const n of this.nodes) {
      if (this.sealTarget.has(n.piece.gate)) continue
      const [x, y] = this.toScreen(n.tx, n.ty)
      const half = (n.piece.kind === 'service' ? tile : icon) / 2 + 1
      const box = { x: x - half, y: y - half, w: half * 2, h: half * 2 }
      rects.push(box)
      marks.push({ id: n.piece.id, ...box })
    }
    // A name must read as belonging to its own mark. If another mark sits just beyond it, on the far side, it could be taken for that one's.
    // A logo with no name says nothing to someone who doesn't know it, so a logo's name gets more leeway than the others.
    const clearBeyond = (id: string, r: { x: number; y: number; w: number; h: number }, side: CanvasTextAlign | 'above' | 'below', reach: number) => {
      const far =
        side === 'left' ? { x: r.x + r.w, y: r.y, w: reach, h: r.h }
        : side === 'right' ? { x: r.x - reach, y: r.y, w: reach, h: r.h }
        : side === 'above' ? { x: r.x, y: r.y - reach, w: r.w, h: reach }
        : { x: r.x, y: r.y + r.h, w: r.w, h: reach }
      return !marks.some((m) => m.id !== id && far.x < m.x + m.w && far.x + far.w > m.x && far.y < m.y + m.h && far.y + far.h > m.y)
    }

    // Names go where they explain the most: a logo first, because a logo you don't know says nothing,
    // then the rules, because they're what a reader most needs to see, then anything that needs you.
    const score = (n: Node) => {
      let s = Math.min(n.degree, 6) * 0.25
      if (n.piece.id === focus) s += 1000
      else if (neighbours?.has(n.piece.id)) s += 300
      if (n.piece.kind === 'service') s += 8
      if (n.piece.kind === 'rule') s += 6.5
      if (this.data.flagged.has(n.piece.id)) s += 5
      return s
    }

    const order = [...this.nodes].sort((a, b) => score(b) - score(a))
    // How many labels this zoom can carry.
    const budget = k < READABLE_K ? 0 : k < 0.42 ? 24 : k < 0.56 ? 60 : 1000
    let used = 0
    const next = new Map<string, Omit<PlacedLabel, 'alpha' | 'target'>>()
    const FONT = `11.5px ${this.sans}`
    const landOf = new Map(this.territories.map((t) => [t.gate, t]))
    // A label stays on its own land. Only the thing you're pointing at may run over the coast.
    const onLand = (gate: string, ax: number, bx: number, cy: number) => {
      const t = landOf.get(gate)
      if (!t) return true
      const [wax, wy] = this.toWorld(ax, cy)
      const [wbx] = this.toWorld(bx, cy)
      const c = this.ctx
      c.save()
      c.setTransform(1, 0, 0, 1, 0, 0)
      const inside = c.isPointInPath(t.outer, wax, wy) && c.isPointInPath(t.outer, wbx, wy)
      c.restore()
      return inside
    }

    for (const n of order) {
      const isFocus = n.piece.id === focus || neighbours?.has(n.piece.id)
      if (!isFocus && used >= budget) continue
      if (this.sealTarget.has(n.piece.gate)) continue
      const [x, y] = this.toScreen(n.tx, n.ty)
      if (x < -80 || y < -40 || x > this.w + 80 || y > this.h + 40) continue
      const name = this.labelFor(n.piece.title, FONT)
      // The thing you're pointing at always says all of itself.
      const whole = isFocus && name.cut
      const lines = whole ? [n.piece.title] : name.lines
      const extra = (lines.length - 1) * LABEL_LEADING
      const w = whole ? name.wholeWidth : name.width
      // Clear of the mark, and of the badge or ring it wears when it needs you or is selected.
      const ringed = n.piece.id === this.selected || this.data.flagged.has(n.piece.id)
      const off = (n.piece.kind === 'service' ? tile : icon) / 2 + (ringed ? 9 : 5)
      const candidates: [number, number, CanvasTextAlign, CanvasTextAlign | 'above' | 'below'][] = [
        [x + off, y + 4 - extra / 2, 'left', 'left'],
        [x - off, y + 4 - extra / 2, 'right', 'right'],
        [x, y - off - 2 - extra, 'center', 'above'],
        [x, y + off + 10, 'center', 'below'],
      ]
      for (const [cx, cy, align, side] of candidates) {
        const left = align === 'left' ? cx : align === 'right' ? cx - w : cx - w / 2
        const rect = { x: left - 2, y: cy - 10, w: w + 4, h: 14 + extra }
        // Cheapest test first: this runs for every item whenever what you're pointing at changes.
        if (n.piece.id === focus || (free(rect) && (isFocus || (clearBeyond(n.piece.id, rect, side, n.piece.kind === 'service' ? 2 : 9) && onLand(n.piece.gate, left - 6, left + w + 6, cy - 3) && onLand(n.piece.gate, left - 6, left + w + 6, cy - 3 + extra))))) {
          rects.push(rect)
          next.set(n.piece.id, { id: n.piece.id, x: cx - x, y: cy - y, align, name: true, lines })
          used++
          break
        }
      }
    }

    // Keep existing labels so unchanged ones don't flicker; only changes crossfade.
    const keep: PlacedLabel[] = []
    for (const l of this.labels) {
      const n = next.get(l.id)
      if (n) {
        keep.push({ ...l, ...n, target: 1 })
        next.delete(l.id)
      } else {
        l.target = 0
        if (l.alpha > 0) keep.push(l)
      }
    }
    for (const n of next.values()) keep.push({ ...n, alpha: this.appeared ? 0 : 1, target: 1 })
    this.labels = keep
  }

  /** Every figure gets a place, biggest money first. Names follow, if they fit. */
  private placeFigures(rects: { x: number; y: number; w: number; h: number }[], free: (r: { x: number; y: number; w: number; h: number }) => boolean) {
    const services = this.nodes.filter((n) => n.cost).sort((a, b) => {
      const ca = this.data.priceChecks.has(a.piece.id) ? 1 : 0
      const cb = this.data.priceChecks.has(b.piece.id) ? 1 : 0
      return cb - ca || (b.month ?? -1) - (a.month ?? -1)
    })
    const towns = this.dollarStyle === 'towns'
    const nextFigures = new Map<string, PlacedLabel>()

    // Every service's mark is an obstacle for every other service's figure.
    const tile = tileSize(this.cam.k)
    if (!towns) {
      for (const n of services) {
        const [x, y] = this.toScreen(n.tx, n.ty)
        rects.push({ x: x - tile / 2, y: y - tile / 2, w: tile, h: tile })
      }
    }

    // First pass: every figure.
    for (const n of services) {
      const [wx, wy] = towns ? [n.townX, n.townY] : [n.tx, n.ty]
      const [x, y] = this.toScreen(wx, wy)
      const r = towns ? this.townScreenRadius(n) : Math.max(this.soundingScreenRadius(n), tile / 2 + 1)
      const font = this.figureFont(n)
      const text = figure(n.cost!, this.period)
      // A thing to check carries a small mark after the figure, which needs room too.
      const w = this.measure(text, font) + (this.data.priceChecks.has(n.piece.id) ? 12 : 0)
      let placed: [number, number, CanvasTextAlign, boolean] | null = null

      if (towns) {
        const fits = w + 8 < r * 2
        if (fits) {
          placed = [x, y + 4, 'center', false]
        } else {
          placed = [x, y + r + 13, 'center', false]
        }
        const left = x - w / 2
        rects.push({ x: left - 2, y: placed[1] - 11, w: w + 4, h: 15 })
      } else {
        const gap = 6
        const near = Math.min(r, 34)
        // A figure to the left carries its check mark between it and the tile, so that needs room as well.
        const leftGap = gap + (this.data.priceChecks.has(n.piece.id) ? 10 : 0)
        const candidates: [number, number, CanvasTextAlign][] = [
          [x + near + gap, y + 4, 'left'],
          [x - near - leftGap, y + 4, 'right'],
          [x, y - near - gap, 'center'],
          [x, y + near + gap + 9, 'center'],
          [x + near * 0.7 + gap, y - near * 0.7 - 2, 'left'],
          [x - near * 0.7 - gap, y - near * 0.7 - 2, 'right'],
          [x + near * 0.7 + gap, y + near * 0.7 + 9, 'left'],
          [x - near * 0.7 - gap, y + near * 0.7 + 9, 'right'],
        ]
        for (const [cx, cy, align] of candidates) {
          const left = align === 'left' ? cx : align === 'right' ? cx - w : cx - w / 2
          const rect = { x: left - 2, y: cy - 11, w: w + 4, h: 15 }
          if (free(rect)) {
            rects.push(rect)
            placed = [cx, cy, align, false]
            break
          }
        }
        if (!placed) {
          // Last resort: a hairline leader out to the nearest clear spot.
          for (let dist = 30; dist < 150 && !placed; dist += 14) {
            for (let a = 0; a < 12 && !placed; a++) {
              const ang = (a / 12) * Math.PI * 2
              const cx = x + Math.cos(ang) * (near + dist)
              const cy = y + Math.sin(ang) * (near + dist)
              const rect = { x: cx - 2, y: cy - 11, w: w + 4, h: 15 }
              if (free(rect)) {
                rects.push(rect)
                placed = [cx, cy, 'left', true]
              }
            }
          }
        }
        if (!placed) placed = [x + near + gap, y + 4, 'left', false]
      }

      const prev = this.figures.get(n.piece.id)
      nextFigures.set(n.piece.id, {
        id: n.piece.id,
        x: placed[0] - x,
        y: placed[1] - y,
        align: placed[2],
        leader: placed[3],
        alpha: prev?.alpha ?? 0,
        target: 1,
        name: false,
      })
    }
    this.figures = nextFigures

    // Second pass: names where they fit, things to check first, then by cost.
    const NAME_FONT = `10.5px ${this.sans}`
    const nextNames = new Map<string, Omit<PlacedLabel, 'alpha' | 'target'>>()
    for (const n of services) {
      const f = nextFigures.get(n.piece.id)!
      const [wx, wy] = towns ? [n.townX, n.townY] : [n.tx, n.ty]
      const [x, y] = this.toScreen(wx, wy)
      const w = this.measure(n.piece.title, NAME_FONT)
      const fx = x + f.x
      const fy = y + f.y
      let candidates: [number, number, CanvasTextAlign][]
      if (towns) {
        const r = this.townScreenRadius(n)
        const below = f.y > r ? f.y + 13 : r + 13
        candidates = [[x, y + below, 'center']]
      } else {
        candidates = [
          [fx, fy + 13, f.align],
          [fx, fy - 15, f.align],
        ]
      }
      for (const [cx, cy, align] of candidates) {
        const left = align === 'left' ? cx : align === 'right' ? cx - w : cx - w / 2
        const rect = { x: left - 1, y: cy - 9, w: w + 2, h: 12 }
        if (free(rect)) {
          rects.push(rect)
          nextNames.set(n.piece.id, { id: n.piece.id, x: cx - x, y: cy - y, align, name: true })
          break
        }
      }
    }
    const keep: PlacedLabel[] = []
    for (const l of this.labels) {
      const n = nextNames.get(l.id)
      if (n) {
        keep.push({ ...l, ...n, target: 1 })
        nextNames.delete(l.id)
      } else {
        l.target = 0
        if (l.alpha > 0) keep.push(l)
      }
    }
    for (const n of nextNames.values()) keep.push({ ...n, alpha: 0, target: 1 })
    this.labels = keep
  }

  private figureFont(n: Node): string {
    const m = n.month ?? 0
    const size = m >= 1000 ? 16 : m >= 150 ? 13.5 : 11.5
    return `${size}px ${SERIF}`
  }

  private gateLabelPos(t: Territory): [number, number] {
    let top = t.minY
    // Prices can stand taller than the land, so the name moves above them.
    if (this.dollarT > 0) {
      const towns = this.dollarStyle === 'towns'
      const eased = EASE(this.dollarT)
      for (const n of this.nodes) {
        if (!n.cost || n.piece.gate !== t.gate) continue
        const inMain = n.cost.currency === this.data.currency
        const r = (towns ? townRadius(inMain ? n.month : null) : inMain ? soundingRadius(n.month ?? 0, this.summary?.biggest ?? 0) : 6) / this.fitK
        const y = (towns ? n.townY : n.ty) - r
        if (y < t.minY) top = Math.min(top, lerp(t.minY, y, eased))
      }
    }
    const [x, y] = this.toScreen((t.minX + t.maxX) / 2, top)
    // Above the coast, with room for the line under the name.
    return [x, y - (this.dollarT > 0.01 ? lerp(23, 27, EASE(this.dollarT)) : 23)]
  }

  private gateLabelSize() {
    return clamp(18.5 + 8 * (this.cam.k - 0.4), 17, 28)
  }

  private gateLabelWidth(t: Territory): number {
    const name = this.data.gates.find((g) => g.id === t.gate)?.name ?? ''
    const size = this.gateLabelSize()
    this.ctx.font = `${size}px ${SERIF}`
    const c = this.ctx as CanvasRenderingContext2D & { letterSpacing?: string }
    if ('letterSpacing' in c) c.letterSpacing = `${(size * 0.1).toFixed(1)}px`
    const w = this.ctx.measureText(name).width
    if ('letterSpacing' in c) c.letterSpacing = '0px'
    return w
  }

  /** The line under an area's name: who can read it, in words. */
  private areaNote(gate: string): { text: string; sealed: boolean } {
    if (this.data.readOnly) return { text: '', sealed: false }
    if (this.lensActive) {
      if (!this.sealTarget.has(gate)) return { text: 'Can read', sealed: false }
      // Still readable out there, so it isn't sealed yet, and vermilion would say it was.
      return this.pendingSeal.has(gate) ? { text: 'Can read until you update', sealed: false } : { text: "Can't read", sealed: true }
    }
    if (this.data.sealedToAll.has(gate)) return { text: 'No one can read this', sealed: true }
    const names = this.data.readers.get(gate) ?? []
    if (!names.length) return { text: '', sealed: false }
    // Names when there's room, a count when there isn't.
    if ((this.w <= 720 || this.cam.k < 0.55) && names.length > 1) return { text: `${names.length} can read this`, sealed: false }
    const shown = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]} and ${names.length - 1} others`
    return { text: `Read by ${shown}`, sealed: false }
  }

  // Drawing

  private ensurePatterns() {
    const p = this.palette!
    const make = (spacing: number, color: string, width: number) => {
      const size = Math.round(spacing * this.dpr)
      const c = document.createElement('canvas')
      c.width = size
      c.height = size
      const x = c.getContext('2d')!
      x.strokeStyle = color
      x.lineWidth = width * this.dpr
      x.beginPath()
      x.moveTo(-size, size * 2)
      x.lineTo(size * 2, -size)
      x.moveTo(-size, size)
      x.lineTo(size, -size)
      x.moveTo(0, size * 2)
      x.lineTo(size * 2, 0)
      x.stroke()
      return this.ctx.createPattern(c, 'repeat')
    }
    if (!this.sealedHatch) this.sealedHatch = make(7, `rgba(${p.vermilionRGB},0.34)`, 0.75)
    if (!this.hatch) this.hatch = make(p.dark ? 5 : 4, `rgba(${p.inkRGB},${p.dark ? 0.42 : 0.5})`, 0.6)
  }

  private waxSeal(size: number): HTMLCanvasElement {
    const key = Math.round(size)
    let c = this.wax.get(key)
    if (!c) {
      const p = this.palette!
      c = makeWaxSeal(key, this.dpr, p.vermilion, p.waxShadow, p.waxHighlight)
      this.wax.set(key, c)
    }
    return c
  }

  private draw(now: number) {
    const ctx = this.ctx
    const p = this.palette
    if (!p || !this.w) return
    this.ensurePatterns()

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = p.paper
    ctx.fillRect(0, 0, this.w, this.h)
    this.tiles.configure(p, this.dpr, this.sans)
    this.tiles.beginFrame()

    if (!this.nodes.length) {
      this.drawEmpty()
      return
    }

    this.drawGraticule()

    const { k, x, y } = this.cam
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(k, k)
    this.drawTerritories(k)
    this.drawLinks(k)
    if (this.dollarT > 0 && this.dollarStyle === 'soundings') this.drawSoundings(k)
    ctx.restore()

    this.drawNodes(now)
    if (this.dollarT > 0 && this.dollarStyle === 'towns') this.drawTowns(now)
    this.drawLabels()
    if (this.dollarT > 0) this.drawFigures()
    this.drawGateLabels(now)
  }

  private drawEmpty() {
    const ctx = this.ctx
    const p = this.palette!
    ctx.lineWidth = 0.75
    this.terrain.forEach((path, i) => {
      ctx.strokeStyle = `rgba(${p.inkRGB},${0.05 + i * 0.012})`
      ctx.stroke(path)
    })
  }

  private drawGraticule() {
    const ctx = this.ctx
    const p = this.palette!
    const { k, x, y } = this.cam
    const step = 240 * k
    if (step < 40) return
    ctx.lineWidth = 1
    ctx.strokeStyle = `rgba(${p.inkRGB},0.035)`
    ctx.beginPath()
    for (let sx = ((x % step) + step) % step; sx < this.w; sx += step) {
      const px = Math.round(sx) + 0.5
      ctx.moveTo(px, 0)
      ctx.lineTo(px, this.h)
    }
    for (let sy = ((y % step) + step) % step; sy < this.h; sy += step) {
      const py = Math.round(sy) + 0.5
      ctx.moveTo(0, py)
      ctx.lineTo(this.w, py)
    }
    ctx.stroke()
  }

  private drawTerritories(k: number) {
    const ctx = this.ctx
    const p = this.palette!
    const line = 0.75 / k
    for (const t of this.territories) {
      const s = this.seal.get(t.gate) ?? 0
      const hot = this.hoverGate === t.gate || this.dropGate === t.gate
      const active = this.activeArea === t.gate
      const closedToAll = !this.lensActive && this.data.sealedToAll.has(t.gate)
      ctx.globalAlpha = 1 - s
      ctx.fillStyle = p.land
      ctx.fill(t.outer)
      ctx.globalAlpha = 1
      ctx.lineWidth = line
      t.rings.forEach((ring, i) => {
        // The coast is the strongest line. Inland, a few quiet contours keep it a chart, and stay out of the way.
        if (i > 0 && i % 2 === 0) return
        const base = i === 0 ? 0.34 : p.dark ? 0.07 : 0.06
        const a = base * (1 - s)
        if (a > 0.005) {
          ctx.strokeStyle = i === 0 && closedToAll ? `rgba(${p.vermilionRGB},0.62)` : `rgba(${p.inkRGB},${a})`
          ctx.stroke(ring)
        }
      })
      if (s > 0) {
        ctx.save()
        ctx.globalAlpha = s
        // The pattern stays a constant screen size, so hatching doesn't grow with zoom.
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
        const screen = new Path2D()
        screen.addPath(t.outer, new DOMMatrix([k, 0, 0, k, this.cam.x, this.cam.y]))
        ctx.fillStyle = this.sealedHatch!
        ctx.scale(1 / this.dpr, 1 / this.dpr)
        const big = new Path2D()
        big.addPath(screen, new DOMMatrix([this.dpr, 0, 0, this.dpr, 0, 0]))
        ctx.fill(big)
        ctx.restore()
        ctx.strokeStyle = `rgba(${p.vermilionRGB},${0.6 * s})`
        ctx.lineWidth = 1 / k
        if (this.pendingSeal.has(t.gate)) ctx.setLineDash([5 / k, 4 / k])
        ctx.stroke(t.outer)
        ctx.setLineDash([])
      }
      if (hot || active) {
        ctx.strokeStyle = `rgba(${p.inkRGB},${active ? 0.9 : 0.6})`
        ctx.lineWidth = (active ? 1.5 : 1) / k
        ctx.stroke(t.outer)
      }
    }
  }

  private drawLinks(k: number) {
    const ctx = this.ctx
    const p = this.palette!
    const focus = this.hovered ?? this.selected
    // A line nobody asked about is noise. Links appear for the thing you're looking at, and only then.
    if (this.dollarOn || (!focus && !this.highlight)) return
    for (const l of this.data.links) {
      if (focus && !this.highlight && l.from !== focus && l.to !== focus) continue
      if (this.highlight && !(this.highlight.has(l.from) && this.highlight.has(l.to))) continue
      const a = this.byId.get(l.from)
      const b = this.byId.get(l.to)
      if (!a || !b) continue
      const sealedA = this.seal.get(a.piece.gate) ?? 0
      const sealedB = this.seal.get(b.piece.gate) ?? 0
      const fade = (1 - sealedA) * (1 - sealedB)
      if (fade < 0.01) continue
      const crossing = a.piece.gate !== b.piece.gate
      const isFocus = focus && (l.from === focus || l.to === focus)
      const alpha = 0.6 * fade
      const [ax, ay] = this.displayPos(a)
      const [bx, by] = this.displayPos(b)
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      if (crossing) {
        // A slight arc, so long links read as routes rather than scratches.
        const mx = (ax + bx) / 2
        const my = (ay + by) / 2
        const dx = bx - ax
        const dy = by - ay
        ctx.quadraticCurveTo(mx - dy * 0.1, my + dx * 0.1, bx, by)
      } else {
        ctx.lineTo(bx, by)
      }
      if (l.kind === 'conflicts') {
        ctx.setLineDash([3 / k, 3 / k])
        ctx.strokeStyle = `rgba(${p.inkRGB},${Math.max(alpha, 0.5 * fade)})`
        ctx.lineWidth = 1 / k
      } else {
        ctx.setLineDash([])
        ctx.strokeStyle = `rgba(${p.inkRGB},${alpha})`
        ctx.lineWidth = (isFocus ? 1 : 0.75) / k
      }
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  /** A service's tile, centred on (x, y), on whole device pixels so it stays sharp. */
  private drawTile(name: string, x: number, y: number, size: number, alpha: number, now: number) {
    const ctx = this.ctx
    const { mono, logo, reveal } = this.tiles.tile(name, size, now)
    const px = Math.round(size * this.dpr) / this.dpr
    const left = Math.round((x - px / 2) * this.dpr) / this.dpr
    const top = Math.round((y - px / 2) * this.dpr) / this.dpr
    if (mono && reveal < 1) {
      ctx.globalAlpha = alpha
      ctx.drawImage(mono, left, top, px, px)
    }
    if (logo) {
      ctx.globalAlpha = alpha * reveal
      ctx.drawImage(logo, left, top, px, px)
    } else if (mono && reveal >= 1) {
      ctx.globalAlpha = alpha
      ctx.drawImage(mono, left, top, px, px)
    }
  }

  /** A ring that follows the tile's corners. */
  private tileRing(x: number, y: number, size: number) {
    const ctx = this.ctx
    const half = size / 2
    const r = size * TILE_RADIUS
    ctx.beginPath()
    ctx.moveTo(x - half + r, y - half)
    ctx.arcTo(x + half, y - half, x + half, y + half, r)
    ctx.arcTo(x + half, y + half, x - half, y + half, r)
    ctx.arcTo(x - half, y + half, x - half, y - half, r)
    ctx.arcTo(x - half, y - half, x + half, y - half, r)
    ctx.closePath()
  }

  private drawNodes(now: number) {
    const ctx = this.ctx
    const p = this.palette!
    const towns = this.dollarStyle === 'towns' ? EASE(this.dollarT) : 0
    const tile = tileSize(this.cam.k)
    const icon = iconSize(this.cam.k)
    const readable = this.cam.k >= READABLE_K
    const badge = clamp(4.6 * Math.sqrt(this.cam.k), 3.8, 5.6)
    for (const n of this.nodes) {
      if (n.alpha < 0.01) continue
      if (towns > 0.5 && n.cost) continue
      const [wx, wy] = this.displayPos(n)
      const [x, y] = this.toScreen(wx, wy)
      if (x < -30 || y < -30 || x > this.w + 30 || y > this.h + 30) continue
      const appear = EASE(n.appear)
      const scale = 0.6 + appear * 0.4
      ctx.globalAlpha = n.alpha * appear
      ctx.fillStyle = p.ink
      ctx.strokeStyle = p.ink
      ctx.lineWidth = 1

      if (n.piece.kind === 'service') {
        const size = tile * scale
        this.drawTile(n.piece.title, x, y, size, n.alpha * appear, now)
        ctx.globalAlpha = n.alpha * appear
        if (n.piece.id === this.selected) {
          ctx.lineWidth = 1.25
          this.tileRing(x, y, size + 7)
          ctx.stroke()
        }
        if (this.data.flagged.has(n.piece.id) && !this.dollarOn && readable) {
          drawNeedsBadge(ctx, x + size / 2 - 1, y - size / 2 + 1, badge, p.ink, p.land)
        }
        continue
      }

      if (!readable) {
        ctx.beginPath()
        ctx.arc(x, y, 1.8, 0, Math.PI * 2)
        ctx.fill()
        continue
      }

      // Land behind each picture, so a contour or a link doesn't run through it.
      const size = icon * scale
      ctx.fillStyle = p.land
      ctx.beginPath()
      ctx.arc(x, y, size * 0.66, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = p.ink
      drawSymbol(ctx, n.piece.kind, x, y, size)

      if (n.piece.id === this.selected) {
        ctx.lineWidth = 1.25
        ctx.beginPath()
        ctx.arc(x, y, size * 0.82, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (this.data.flagged.has(n.piece.id) && !this.dollarOn) {
        drawNeedsBadge(ctx, x + size * 0.46, y - size * 0.46, badge, p.ink, p.land)
      }
    }
    ctx.globalAlpha = 1
  }

  /** Rings and wash, in world space, so ink accumulates where money concentrates. */
  private drawSoundings(k: number) {
    const ctx = this.ctx
    const p = this.palette!
    const ratio = 1 / this.fitK
    for (const n of this.nodes) {
      if (!n.cost || n.month === null) continue
      const stagger = clamp((this.dollarT - n.rank * 0.008) / 0.65, 0, 1)
      if (stagger <= 0) continue
      const inMain = n.cost.currency === this.data.currency
      const base = inMain ? soundingRadius(n.month, this.summary?.biggest ?? 0) : 6
      const r = base * ratio * EASE(stagger)
      if (r <= 0) continue
      const a = n.alpha
      ctx.beginPath()
      ctx.arc(n.tx, n.ty, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${p.inkRGB},${(p.dark ? 0.08 : 0.06) * a})`
      ctx.fill()
      ctx.lineWidth = 0.75 / k
      ctx.strokeStyle = `rgba(${p.inkRGB},${(p.dark ? 0.42 : 0.5) * a})`
      ctx.stroke()
    }
  }

  /** Discs with engraved hatching, the figure knocked out of the middle. */
  private drawTowns(now: number) {
    const ctx = this.ctx
    const p = this.palette!
    const scale = this.cam.k / this.fitK
    const t = EASE(this.dollarT)
    for (const n of this.nodes) {
      if (!n.cost || n.alpha < 0.01) continue
      const [wx, wy] = this.displayPos(n)
      const [x, y] = this.toScreen(wx, wy)
      const inMain = n.cost.currency === this.data.currency
      const R = townRadius(inMain ? n.month : null) * scale * (0.25 + 0.75 * t)
      if (x < -R || y < -R || x > this.w + R || y > this.h + R) continue
      const trust = trustOf(n.cost)
      ctx.globalAlpha = n.alpha * Math.min(1, t * 1.6)

      ctx.beginPath()
      ctx.arc(x, y, R, 0, Math.PI * 2)
      ctx.fillStyle = p.land
      ctx.fill()

      if (trust !== 'unknown') {
        ctx.save()
        ctx.clip()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.fillStyle = this.hatch!
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
        ctx.restore()
        ctx.beginPath()
        ctx.ellipse(x, y, Math.min(R * 0.82, 34 * Math.max(1, scale * 0.8)), Math.min(R * 0.52, 12 * Math.max(1, scale * 0.8)), 0, 0, Math.PI * 2)
        ctx.fillStyle = p.land
        ctx.fill()
      }

      ctx.strokeStyle = p.ink
      ctx.lineWidth = 1
      if (trust === 'unknown') ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.arc(x, y, R, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      if (trust === 'known') {
        ctx.lineWidth = 0.75
        ctx.beginPath()
        ctx.arc(x, y, Math.max(R - 3, 1), 0, Math.PI * 2)
        ctx.stroke()
      }
      if (n.piece.id === this.selected || n.piece.id === this.hovered) {
        ctx.lineWidth = 1.25
        ctx.beginPath()
        ctx.arc(x, y, R + 4, 0, Math.PI * 2)
        ctx.stroke()
      }

      // The service's logo. Where the figure sits inside the disc the logo stands above it. Otherwise it's in the middle.
      const figure = this.figures.get(n.piece.id)
      const inside = !!figure && Math.abs(figure.y) < R
      const size = Math.round(clamp(R * (inside ? 0.62 : 1.05), 14, 30))
      const lift = inside ? R * 0.5 : 0
      this.drawTile(n.piece.title, x, y - lift, size, n.alpha * Math.min(1, t * 1.6), now)
    }
    ctx.globalAlpha = 1
  }

  /** Item names and prices stand on land, so that's their halo. Area names stand on the sea and pass its colour in. */
  private haloText(text: string, x: number, y: number, halo = 3, ground = this.palette!.land) {
    const ctx = this.ctx
    ctx.lineJoin = 'round'
    ctx.lineWidth = halo
    ctx.strokeStyle = ground
    ctx.strokeText(text, x, y)
    ctx.fillText(text, x, y)
  }

  private drawLabels() {
    const ctx = this.ctx
    const p = this.palette!
    const focus = this.hovered ?? this.selected
    ctx.textBaseline = 'alphabetic'
    const names = this.labels
    for (const l of names) {
      const n = this.byId.get(l.id)
      if (!n) continue
      const a = l.alpha * Math.max(n.alpha, this.dollarOn && n.cost ? 1 : 0)
      if (a < 0.02) continue
      const [wx, wy] = this.dollarOn && this.dollarStyle === 'towns' && n.cost ? [lerp(n.tx, n.townX, EASE(this.dollarT)), lerp(n.ty, n.townY, EASE(this.dollarT))] : [n.tx, n.ty]
      const [x, y] = this.toScreen(wx, wy)
      ctx.globalAlpha = a * (this.dollarOn ? EASE(this.dollarT) * 0.8 : 1)
      ctx.textAlign = l.align
      ctx.font = this.dollarOn && n.cost ? `10.5px ${this.sans}` : `11.5px ${this.sans}`
      ctx.fillStyle = l.id === focus ? p.ink : `rgba(${p.inkRGB},0.82)`
      ;(l.lines ?? [n.piece.title]).forEach((line, i) => this.haloText(line, x + l.x, y + l.y + i * LABEL_LEADING))
    }
    ctx.globalAlpha = 1
  }

  private drawFigures() {
    const ctx = this.ctx
    const p = this.palette!
    ctx.textBaseline = 'alphabetic'
    const towns = this.dollarStyle === 'towns'
    const t = EASE(this.dollarT)
    for (const l of this.figures.values()) {
      const n = this.byId.get(l.id)
      if (!n || !n.cost) continue
      // Printed largest first.
      const order = clamp((this.dollarT - 0.2 - n.rank * 0.009) / 0.35, 0, 1)
      const a = l.alpha * order * n.alpha
      if (a < 0.02) continue
      const [wx, wy] = towns ? [lerp(n.tx, n.townX, t), lerp(n.ty, n.townY, t)] : [n.tx, n.ty]
      const [x, y] = this.toScreen(wx, wy)
      const fx = x + l.x
      const fy = y + l.y
      const text = figure(n.cost, this.period)
      const trust = trustOf(n.cost)

      if (l.leader) {
        ctx.globalAlpha = a * 0.5
        ctx.strokeStyle = p.ink
        ctx.lineWidth = 0.5
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(fx - 2, fy - 3)
        ctx.stroke()
      }

      ctx.globalAlpha = a
      ctx.font = this.figureFont(n)
      ctx.textAlign = l.align
      ctx.fillStyle = trust === 'estimate' ? `rgba(${p.inkRGB},0.68)` : p.ink
      this.haloText(text, fx, fy)

      if (this.data.priceChecks.has(l.id)) {
        const w = ctx.measureText(text).width
        const dx = l.align === 'left' ? fx + w + 6 : l.align === 'right' ? fx + 5 : fx + w / 2 + 6
        const dy = fy - 4
        ctx.fillStyle = p.ink
        ctx.beginPath()
        ctx.moveTo(dx, dy - 3.2)
        ctx.lineTo(dx + 3.2, dy)
        ctx.lineTo(dx, dy + 3.2)
        ctx.lineTo(dx - 3.2, dy)
        ctx.closePath()
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
  }

  private drawGateLabels(now: number) {
    const ctx = this.ctx
    const p = this.palette!
    const size = this.gateLabelSize()
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'center'
    const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string }

    for (const t of this.territories) {
      const gate = this.data.gates.find((g) => g.id === t.gate)
      if (!gate) continue
      const [x, y] = this.gateLabelPos(t)
      const s = this.seal.get(t.gate) ?? 0
      const hot = this.hoverGate === t.gate

      ctx.font = `${size}px ${SERIF}`
      if ('letterSpacing' in c) c.letterSpacing = `${(size * 0.1).toFixed(1)}px`
      // Closed here but still readable out there isn't sealed yet, so its name stays ink.
      ctx.fillStyle = s > 0.5 && !this.pendingSeal.has(t.gate) ? p.vermilion : p.ink
      this.haloText(gate.name, x, y, 5, p.paper)
      if ('letterSpacing' in c) c.letterSpacing = '0px'

      // Under the name: who can read it. Prices take this line while they're showing.
      const note = this.areaNote(t.gate)
      if (note.text && this.dollarT < 0.99) {
        ctx.globalAlpha = 1 - EASE(this.dollarT)
        ctx.font = `11.5px ${this.sans}`
        ctx.fillStyle = note.sealed ? p.vermilion : `rgba(${p.inkRGB},0.68)`
        this.haloText(note.text, x, y + 15, 4, p.paper)
        ctx.globalAlpha = 1
      }

      // A gate no password opens carries a small seal, even with no lens on.
      if (this.data.sealedToAll.has(t.gate) && !this.lensActive) {
        // Beside both lines, whichever is wider, and centred on them, so it never sits on the words.
        const wide = Math.max(this.gateLabelWidth(t), note.text ? this.measure(note.text, `11.5px ${this.sans}`) : 0)
        const middle = y + (18 - size * 0.72) / 2
        ctx.drawImage(this.waxSeal(26), x - wide / 2 - 31, middle - 13, 26, 26)
      }

      // Subtotal under the name while prices are showing.
      const share = this.summary?.byGate.find((b) => b.gate === t.gate)
      if (this.dollarT > 0.01 && share) {
        ctx.globalAlpha = EASE(this.dollarT)
        ctx.font = `12px ${this.sans}`
        ctx.fillStyle = `rgba(${p.inkRGB},0.72)`
        const value = this.period === 'year' ? share.amount * 12 : share.amount
        const money = value.toLocaleString('en-US', { maximumFractionDigits: 0 })
        const sym = this.data.currency === 'USD' ? '$' : `${this.data.currency} `
        this.haloText(`${sym}${money} a ${this.period}`, x, y + 16, 4, p.paper)
        ctx.globalAlpha = 1
      }

      // The wax mark lands on a closed gate.
      if (s > 0.01) {
        const pending = this.pendingSeal.has(t.gate)
        const landed = this.sealLanded.get(t.gate)
        const age = landed ? (now - landed) / 340 : 1
        const land = this.reducedMotion ? 1 : EASE(clamp(age, 0, 1))
        const waxSize = 44
        const scale = pending ? 1 : lerp(1.55, 1, land)
        const wax = this.waxSeal(waxSize)
        const cx = (t.minX + t.maxX) / 2
        const cy = (t.minY + t.maxY) / 2
        const [sx, sy] = this.toScreen(cx, cy)
        const draw = waxSize * scale
        // A ghost of the seal: it's closed here, but not yet closed out there.
        ctx.globalAlpha = pending ? 0.26 * s : Math.min(1, s * 2) * (landed ? land : s)
        ctx.drawImage(wax, sx - draw / 2, sy - draw / 2, draw, draw)
        ctx.globalAlpha = 1
      }
    }
  }
}
