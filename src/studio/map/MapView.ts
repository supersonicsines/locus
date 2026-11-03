// The map. One canvas, drawn on demand, with no framework in the way.
//
// Everything sits in world coordinates. The camera maps them to the screen.
// Hairlines and type stay a constant screen size, as on a printed chart.

import { figure, monthly, soundingRadius, summarize, townRadius, trustOf, type MoneyPeriod, type MoneySummary } from '../../core/money.ts'
import type { Cost, Gate, Link, Piece } from '../../core/types.ts'
import { buildEmptyTerrain, buildLand, buildWaterlines, DESIGN_K, DISTRICTS, HEADINGS_FROM, landBetween, mainGroup, wrapTitle, type DistrictDef, type Land, type Territory } from './layout.ts'
import type { NeedLevel } from '../../core/status.ts'
import { drawAvatar, drawNeedDot, drawPin, drawSymbol, makeWaxSeal } from './symbols.ts'
import { TileCache } from './tiles.ts'
import { monogramOf } from '../logos/lookup.ts'
import { onLogosLoaded, serviceFor, TILE_RADIUS } from '../logos/store.ts'

export interface Palette {
  /** The sea, while nothing is live: unprinted paper. */
  paper: string
  /** The sea once the map is live. The one change you can see across the room. */
  liveSea: string
  /** The land an area stands on. */
  land: string
  /** Land no one can read. */
  sealedLand: string
  /** Land someone can still read though you closed it. */
  exposedLand: string
  /** What needs you now. Never vermilion, because vermilion means sealed. */
  alert: string
  alertRGB: string
  onAlert: string
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
  /** Pieces in "things that need you", and how loudly. */
  flagged: Map<string, NeedLevel>
  /** Areas someone can still read though you closed them, in the area's own words. */
  exposed: Map<string, string>
  /** Closed areas whose services' names and prices can still be read through Money. */
  pricesReadable: Set<string>
  /** Whether there's a copy online at all. Until there is, nobody can read anything. */
  live: boolean
  /** Pieces with something to check on their price. */
  priceChecks: Set<string>
  /** Gates no password opens, marked with a small seal even with no lens on. */
  sealedToAll: Set<string>
  /** The name of everyone who can read each gate. */
  readers: Map<string, string[]>
  /** The colour of each reader with no logo of their own. */
  readerColours: Map<string, string>
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
  /** What floats over the map right now, so names don't go under it. */
  covers(): { left: number; top: number; right: number; bottom: number }[]
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
  /** Where it stands when the map is zoomed out, in world coordinates, if it stands anywhere. */
  ovx: number
  ovy: number
  inOverview: boolean
  /** How far its pin leans, in radians, to keep clear of its neighbours. */
  lean: number
  /** How far left of the mark's middle the pin's tip stands, in pixels. */
  tipX: number
}

/** The things of one kind in one area, which sit together under a name. */
interface District {
  gate: string
  def: DistrictDef
  members: Node[]
  minX: number
  maxX: number
  minY: number
  maxY: number
  /** Whether they do sit together, so a name on the land means something. A map laid out long ago won't have them together. */
  named: boolean
  /** Where its line stands when the map is zoomed out, in world coordinates. */
  lx: number
  ly: number
  /** How much room that line and whatever hangs under it take, in pixels. */
  lw: number
  lh: number
  /** Whether anything inside, out of sight at this zoom, is worth a look. */
  look: boolean
  /** How far its name stands above its first row's middle, in world units. A row of two-line names is taller. */
  above: number
  /** Zoomed out on land too small to hold it, its line stays out of sight. Anything of its that's asking for you still shows. */
  hidden: boolean
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
  /** The item's one line, once the map is close enough to have room for it. */
  sub?: string
}

const EASE = (t: number) => 1 - Math.pow(1 - t, 3)
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Low enough that a big map on a phone still fits under the top bar.
const MIN_K = 0.12
const MAX_K = 3.5

const SERIF = 'Lustria, Georgia, "Times New Roman", serif'

/** A reader's mark under an area's name, in screen pixels. */
const FACE = 20
const FACE_STEP = 24
const FACE_GAP = 6

/** How far out each water line stands from the shore, in world units. */
const WATER_LINES = [10, 24, 44]

/** How far above a kind's first row its name stands, in world units, so it moves with the land. */
const HEADING_ABOVE = 15 / DESIGN_K
/** Room for the little picture at the start of a kind's line, zoomed out. */
const LINE_ICON = 18

/** The head of a pin, in screen pixels. The loudest thing on the map must also be the biggest. */
const pinRadius = (level: NeedLevel, k: number) => (level === 'now' ? clamp(11.5 * Math.sqrt(k), 9.5, 13) : clamp(8 * Math.sqrt(k), 7, 9.5))
const PIN_REACH = 2.35

const hexToRgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]

/** A service's tile on the map, in screen pixels. It grows slowly with zoom, and stops at sizes a logo can still be read at. */
const tileSize = (k: number) => Math.round(clamp(25 * Math.sqrt(k), 15, 30))

/** Any other item's picture, in screen pixels. */
const iconSize = (k: number) => Math.round(clamp(19.5 * Math.sqrt(k), 14, 20))
const LABEL_LEADING = 13

/** Names step down a size just before the map gathers them up, which gives a laptop's whole-map view room for every one. */
const nameSize = (k: number) => (k < DESIGN_K * 0.92 ? 10.5 : 11.5)
const leadingAt = (k: number) => (nameSize(k) < 11 ? 12 : LABEL_LEADING)

/**
 * What the map shows at each zoom. Like a real map, it changes in kind and not only in size.
 * - Close, from SUMMARY_K: every item, its name and its one line, because a row has room for two lines from there.
 * - The usual, from DETAIL_K: every item and its name.
 * - Further out: there's no room for names, and pictures without names say nothing, so each kind of thing in an area
 *   gathers into one line with a count. Logos stay, because a logo says something on its own. Anything wearing a pin stays with its name.
 */
const DETAIL_K = DESIGN_K * 0.8
const SUMMARY_K = 0.85

export class MapView {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private cb: MapCallbacks
  // Canvas fonts can't use var(), so this reads the --sans token and the sans is only named in styles.css.
  private sans = getComputedStyle(document.documentElement).getPropertyValue('--sans').trim() || 'sans-serif'
  private w = 0
  private h = 0
  private dpr = 1

  private data: MapData = { gates: [], pieces: [], links: [], costs: null, currency: 'USD', flagged: new Map(), exposed: new Map(), pricesReadable: new Set(), live: false, priceChecks: new Set(), sealedToAll: new Set(), readers: new Map(), readerColours: new Map(), readOnly: false }
  private nodes: Node[] = []
  private byId = new Map<string, Node>()
  private territories: Territory[] = []
  private districts: District[] = []
  private land: Land | null = null
  /** How far each area's block moves into the middle of its land when zoomed out, in world units. */
  private overviewShift = new Map<string, { x: number; y: number }>()
  private shownNames = new Map<string, string>()
  private waterlines: Path2D[] = []
  /** 1 when every item stands on its own, 0 when they've gathered into lines. */
  private lodT = 1
  private overview = false
  private overviewAt = -1
  private hoverDistrict: District | null = null
  private terrain: ReturnType<typeof buildEmptyTerrain> | null = null
  private summary: MoneySummary | null = null

  private cam = { x: 0, y: 0, k: 1 }
  private camTarget: { x: number; y: number; k: number } | null = null
  private fitK = 1
  private overlayK = 1
  private hasFitted = false
  private rightInset = 28
  private userMoved = false

  private palette: Palette | null = null
  /** 0 for unprinted paper, 1 for a live map's sea. It takes a moment, because going live is a moment. */
  private liveT = 0
  private sea = '#000000'
  private wax = new Map<number, HTMLCanvasElement>()
  private tiles: TileCache
  private stopLogos: () => void
  private hatch: CanvasPattern | null = null
  private sealedHatch: CanvasPattern | null = null
  private exposedHatch: CanvasPattern | null = null

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
  private subCache = new Map<string, string>()
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
    this.exposedHatch = null
    if (changedSize) {
      this.terrain = null
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
    this.exposedHatch = null
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
    // Opening a map isn't a moment. Going live is.
    if (!this.appeared || !prev.size) this.liveT = data.live ? 1 : 0
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
        // Prices keep their spread while the map underneath is saved. A moved item gets a new one.
        townX: old && old.tx === x && old.ty === y ? old.townX : x,
        townY: old && old.tx === x && old.ty === y ? old.townY : y,
        cost,
        month: cost ? monthly(cost) : null,
        rank: 0,
        ovx: old?.ovx ?? x,
        ovy: old?.ovy ?? y,
        inOverview: old?.inOverview ?? false,
        lean: old?.lean ?? 0,
        tipX: old?.tipX ?? 0,
      }
    })
    const ordered = this.nodes.filter((n) => n.cost).sort((a, b) => (b.month ?? -1) - (a.month ?? -1))
    ordered.forEach((n, i) => (n.rank = i))
    this.byId = new Map(this.nodes.map((n) => [n.piece.id, n]))

    if (positionsChanged || !this.territories.length) {
      this.land = buildLand(data.gates, this.nodes.map((n) => ({ piece: n.piece, gate: n.piece.gate, x: n.tx, y: n.ty })))
      this.territories = this.land.territories
      this.waterlines = this.territories.length ? buildWaterlines(this.land, WATER_LINES) : []
      this.townsReady = false
    }
    this.buildDistricts()
    if (this.nodes.length) {
      const { k } = this.computeFit()
      this.fitK = k
      if (!this.hasFitted) {
        this.fit(false)
        this.hasFitted = true
      } else if (prev.size !== data.pieces.length && !this.userMoved) {
        // Something arrived or went, so the land changed shape. The map stays whole unless you've moved it yourself.
        this.fit(true)
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
    if (id) this.keepSubjectClear()
    else if (!this.activeArea) this.slideBack()
    this.scheduleLabels(0)
    this.invalidate()
  }

  /** The right-hand edge on screen of what the panel on the right is about, wherever the camera is heading, because searching for something moves it there first. */
  private subjectRight(): number | null {
    const c = this.camTarget ?? this.cam
    const n = this.selected ? this.byId.get(this.selected) : null
    if (n) return n.tx * c.k + c.x + tileSize(c.k) / 2 + 8 + this.labelFor(n.piece.title, `${nameSize(c.k)}px ${this.sans}`).width + 16
    const t = this.territories.find((x) => x.gate === this.activeArea)
    return t ? t.holds.maxX * c.k + c.x : null
  }

  /** The panel mustn't cover the very thing it's about, so the map slides over, only as far as that takes, and back after. */
  private keepSubjectClear() {
    if (this.w <= 720) return
    const right = this.subjectRight()
    if (right === null) return
    const over = right - (this.w - 396)
    if (over <= 0) return
    const base = this.camTarget ?? this.cam
    this.slidOver += over
    const target = { ...base, x: base.x - over }
    if (this.reducedMotion) this.cam = target
    else this.camTarget = target
    this.scheduleLabels(300)
  }

  private slideBack() {
    if (!this.slidOver) return
    const base = this.camTarget ?? this.cam
    const target = { ...base, x: base.x + this.slidOver }
    this.slidOver = 0
    if (this.reducedMotion) this.cam = target
    else this.camTarget = target
    this.scheduleLabels(300)
  }

  setHighlight(ids: Set<string> | null) {
    this.highlight = ids
    // Zoomed out, what you're pointing at in the list comes out of its line, so it needs its name.
    if (this.overview) this.scheduleLabels(0)
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
    if (id) this.keepSubjectClear()
    else if (!this.selected) this.slideBack()
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
    if (this.dollarOn && !this.townsReady) this.solveTowns()

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
    // What's on the land, with a margin. The land itself may run on under the panels, as a map runs off its sheet.
    for (const t of this.territories) xs.push(t.holds.minX - 44, t.holds.maxX + 44), ys.push(t.holds.minY - 36, t.holds.maxY + 36)
    for (const n of this.nodes) xs.push(n.tx), ys.push(n.ty)
    // Prices can stand taller than the land, so they get counted too.
    if (withOverlay) {
      const towns = this.dollarStyle === 'towns'
      for (const n of this.nodes) {
        if (!n.cost) continue
        const inMain = n.cost.currency === this.data.currency
        const r = (towns ? townRadius(inMain ? n.month : null) : inMain ? soundingRadius(n.month ?? 0, this.summary?.biggest ?? 0) : 6) / this.fitK
        const x = n.townX
        const y = n.townY
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
    // Below the top controls. Below 1100 the line at top centre drops under them, so there's more to clear.
    const top = narrow ? 130 : this.w <= 1100 ? 116 : 70
    const bottom = narrow ? (this.dollarOn && withOverlay ? 150 : 40) : 24
    // A small map sits at a size where its words and its land still go together, and doesn't balloon to fill the screen.
    const k = clamp(Math.min((this.w - left - right) / (maxX - minX || 1), (this.h - top - bottom) / (maxY - minY || 1)), MIN_K, 0.9)
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
    // There's nothing left to slide back from. Without this, sliding back after a refit throws the map sideways.
    this.slidOver = 0
    this.keepSubjectClear()
    this.cb.cameraChanged(f.k, this.fitK)
    this.scheduleLabels(animated ? 300 : 0)
    this.invalidate()
  }

  zoomBy(factor: number) {
    this.userMoved = true
    this.slidOver = 0
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
    this.slidOver = 0
    // Close enough that it stands among its neighbours with its name.
    const k = zoom ? Math.max(this.cam.k, DETAIL_K * 1.15, Math.min(1.1, this.fitK * 1.8)) : this.cam.k
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
    // A little past the whole map and no further. Names don't shrink, so beyond this they'd only land on each other, and there's nothing out there to see.
    const floor = this.dollarOn && this.dollarStyle === 'towns' ? Math.min(this.fitK, this.overlayK) : Math.max(MIN_K, this.fitK * 0.6)
    return clamp(k, floor, MAX_K)
  }

  // Input

  private localPoint(e: PointerEvent | WheelEvent | MouseEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  /** How far this item has gone to where it stands zoomed out. Prices put every service back on its own spot. */
  private gathered(n: Node): number {
    if (!n.inOverview || this.lodT >= 1) return 0
    return (1 - EASE(this.lodT)) * (1 - EASE(this.dollarT))
  }

  private displayPos(n: Node): [number, number] {
    const g = this.gathered(n)
    const x = g > 0 ? lerp(n.x, n.ovx, g) : n.x
    const y = g > 0 ? lerp(n.y, n.ovy, g) : n.y
    const t = EASE(this.dollarT)
    if (t > 0 && n.cost) return [lerp(x, n.townX, t), lerp(y, n.townY, t)]
    return [x, y]
  }

  /** Where a name hangs from: where the item will settle, not where it is on the way there. */
  private labelAnchor(n: Node): [number, number] {
    const g = this.gathered(n)
    return g > 0 ? [lerp(n.tx, n.ovx, g), lerp(n.ty, n.ovy, g)] : [n.tx, n.ty]
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
      let d = Math.hypot(sx - x, sy - y)
      // A pin is the most obvious thing on the map to click, so its head answers as well.
      const pin = this.pinOf(n)
      if (pin) {
        const pr = pinRadius(pin, k)
        const head = Math.hypot(sx - (x - n.tipX + Math.sin(n.lean) * pr * PIN_REACH), sy - (y - this.pinLift(n, k) - Math.cos(n.lean) * pr * PIN_REACH))
        if (head < pr + 2) {
          d = head / 2
          r = d + 1
        }
      }
      if (d < r && d < bestD) {
        best = n
        bestD = d
      }
    }
    return best
  }

  /** Which pin an item wears, if any. A quiet need is only a dot. */
  private pinOf(n: Node): NeedLevel | null {
    if (this.dollarOn) return null
    const level = this.data.flagged.get(n.piece.id)
    return level === 'now' || level === 'decide' ? level : null
  }

  /** How far above an item's centre its pin's tip stands. */
  private pinLift(n: Node, k: number): number {
    return (n.piece.kind === 'service' ? tileSize(k) : iconSize(k)) / 2 - 1
  }

  /** What an item stands on, which is what its halo has to match. */
  private groundOf(gate: string): string {
    const p = this.palette!
    if (this.lensActive) return p.land
    if (this.data.exposed.has(gate)) return p.exposedLand
    return this.data.sealedToAll.has(gate) ? p.sealedLand : p.land
  }

  private gateAt(wx: number, wy: number): string | null {
    return this.territories.find((t) => t.onLand(wx, wy))?.gate ?? null
  }

  /** While a password is selected, a territory or its name is a switch. */
  private gateLabelAt(sx: number, sy: number): string | null {
    for (const t of this.territories) {
      const [x, y] = this.gateLabelPos(t)
      const width = Math.max(this.gateLabelWidth(t) + 40, this.noteWidth(this.areaNote(t.gate)))
      if (sx > x - 8 && sx < x + width + 8 && sy > y - 22 && sy < y + 26) return t.gate
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
    // Zoomed out, things stand in a line and not where they live, so there's nowhere meaningful to drag them from.
    if (hit && !this.data.readOnly && !this.overview) {
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
      // Zoomed out, a kind's line is a way in, like a cluster on any map.
      const line = !hit ? this.districtLineAt(x, y) : null
      if (line !== this.hoverDistrict) {
        this.hoverDistrict = line
        this.invalidate()
      }
      // An area is a thing you can click: its land and its name both answer.
      const overLabel = !hit && !line ? this.gateLabelAt(x, y) : null
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
      this.canvas.style.cursor = this.spaceDown ? 'grab' : hit || line || overLabel ? 'pointer' : 'default'
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
      this.slidOver = 0
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
      const line = !hit ? this.districtLineAt(x, y) : null
      if (line) {
        this.goToDistrict(line)
        return
      }
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
    this.hoverDistrict = null
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
    this.slidOver = 0
    this.camTarget = { k, x: x - wx * k, y: y - wy * k }
    this.scheduleLabels(280)
    this.cb.cameraChanged(k, this.fitK)
    this.invalidate()
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    this.camTarget = null
    this.userMoved = true
    this.slidOver = 0
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

    // Zooming past the point where names fit.
    const overview = this.cam.k < DETAIL_K
    if (overview !== this.overview) {
      this.overview = overview
      this.overviewAt = -1
      this.hoverDistrict = null
      this.scheduleLabels(0)
    }
    const lodTarget = overview ? 0 : 1
    if (this.lodT !== lodTarget) {
      const s = dt / 240
      this.lodT = this.reducedMotion ? lodTarget : lodTarget > this.lodT ? Math.min(1, this.lodT + s) : Math.max(0, this.lodT - s)
      moving = true
    }
    if (overview) this.layoutOverview()

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

    const liveTarget = this.data.live ? 1 : 0
    if (this.liveT !== liveTarget) {
      const s = dt / 900
      this.liveT = this.reducedMotion ? liveTarget : liveTarget > this.liveT ? Math.min(1, this.liveT + s) : Math.max(0, this.liveT - s)
      moving = true
    }

    // The $ transition.
    const dTarget = this.dollarOn ? 1 : 0
    if (this.dollarT !== dTarget) {
      const span = this.dollarStyle === 'towns' ? 700 : 500
      const s = dt / span
      this.dollarT = this.reducedMotion ? dTarget : dTarget > this.dollarT ? Math.min(1, this.dollarT + s) : Math.max(0, this.dollarT - s * 1.3)
      moving = true
    }
    if (this.dollarOn && !this.townsReady) this.solveTowns()

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
    // Zoomed out, an item stands alone only if it's a logo, wears a pin, or you're pointing at it.
    if (this.lodT < 1 && !(n.inOverview || neighbours?.has(n.piece.id) || this.highlight?.has(n.piece.id) || (this.dollarOn && n.cost))) a *= this.lodT
    // Prices are about what has a price. A faded mark under a disc only looks like dirt.
    if (this.dollarOn && !n.cost) a = 0
    a *= 1 - (this.seal.get(n.piece.gate) ?? 0)
    if (this.highlight) a *= this.highlight.has(n.piece.id) ? 1 : 0.14
    else if (neighbours && !this.dollarOn) a *= neighbours.has(n.piece.id) ? 1 : 0.28
    return a
  }

  // While prices show, everything else steps back, so services spread out over their land to make room for what they cost.
  // Each is pulled to a spot on the way to the middle of its land, and they push apart from there.

  private solveTowns() {
    this.townsReady = true
    const towns = this.dollarStyle === 'towns'
    const world = (r: number) => r / this.fitK
    for (const t of this.territories) {
      const services = this.nodes.filter((n) => n.cost && n.piece.gate === t.gate)
      const cx = (t.holds.minX + t.holds.maxX) / 2
      const cy = (t.nameY + t.holds.maxY) / 2
      const items = services.map((n) => {
        const inMain = n.cost!.currency === this.data.currency
        // A disc stays on its land whole, and so does a ring, as far as a big one can.
        const disc = world(towns ? townRadius(inMain ? n.month : null) : Math.max(16, Math.min(soundingRadius(inMain ? (n.month ?? 0) : 0, this.summary?.biggest ?? 0), 62)))
        // Room for the disc and the name under it, or for a mark and the figure and name beside it.
        const reach = towns ? disc + world(19) : world(40)
        const hx = lerp(n.tx, cx, 0.62)
        const hy = lerp(n.ty, cy, 0.62)
        return { n, disc, reach, hx, hy, x: hx, y: hy, nameHalf: world(this.measure(n.piece.title, `10.5px ${this.sans}`) / 2 + 3) }
      })
      const awayFromWater = (x: number, y: number, r: number, nameHalf: number, under: number): [number, number] => {
        let ox = 0
        let oy = 0
        for (let a = 0; a < 12; a++) {
          const c = Math.cos((a / 12) * Math.PI * 2)
          const d = Math.sin((a / 12) * Math.PI * 2)
          if (!t.onLand(x + c * r, y + d * r)) {
            ox -= c
            oy -= d
          }
        }
        if (under) {
          const ny = y + r + under
          if (!t.onLand(x - nameHalf, ny)) {
            ox += 1
            oy -= 1
          }
          if (!t.onLand(x + nameHalf, ny)) {
            ox -= 1
            oy -= 1
          }
        }
        const l = Math.hypot(ox, oy)
        return l ? [ox / l, oy / l] : [0, 0]
      }
      for (let iter = 0; iter < 120; iter++) {
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const p = items[i]
            const q = items[j]
            const dx = q.x - p.x
            const dy = q.y - p.y
            const d = Math.hypot(dx, dy) || 0.01
            const min = p.reach + q.reach
            if (d < min) {
              const push = ((min - d) / d) * 0.5
              p.x -= dx * push
              p.y -= dy * push
              q.x += dx * push
              q.y += dy * push
            }
          }
        }
        for (const it of items) {
          it.x += (it.hx - it.x) * 0.02
          it.y += (it.hy - it.y) * 0.02
          // A disc stays on its land whole, with room for the name under it. The land's own width at that height says where that is.
          const under = towns ? world(19) : 0
          const margin = world(5)
          // A disc also stays off the area's name.
          const top = t.nameY - HEADING_ABOVE + it.disc + margin
          const bottom = t.holds.maxY + world(14) - it.disc - under - margin
          it.y = bottom > top ? clamp(it.y, top, bottom) : cy
          const [lo, hi] = landBetween(t, it.y - it.disc, it.y + it.disc + under)
          const left = lo + it.disc + margin
          const right = hi - it.disc - margin
          if (right > left) it.x = clamp(it.x, left, right)
          // A firth can leave no room at this height. Then it goes by what's on the land, which is always its own.
          else it.x = clamp(it.x, Math.min(cx, t.holds.minX + it.disc), Math.max(cx, t.holds.maxX - it.disc))
          // The land's furthest reach can be across a bay, and a border wanders. Whatever's still over the water or a neighbour moves straight away from it, so it slides along the shore.
          // Not towards the area's middle, because that's where the biggest disc stands.
          const [ox, oy] = awayFromWater(it.x, it.y, it.disc + margin, towns ? it.nameHalf : 0, under)
          it.x += ox * world(4)
          it.y += oy * world(4)
        }
      }
      for (const it of items) {
        it.n.townX = it.x
        it.n.townY = it.y
      }
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
    const key = `${font}|${title}`
    let label = this.labelCache.get(key)
    if (!label) {
      const { lines, cut } = wrapTitle(title)
      this.ctx.font = font
      label = {
        lines,
        cut,
        width: Math.max(...lines.map((line) => this.ctx.measureText(line).width)),
        wholeWidth: this.ctx.measureText(title).width,
      }
      this.labelCache.set(key, label)
    }
    return label
  }

  private measure(text: string, font: string): number {
    this.ctx.font = font
    return this.ctx.measureText(text).width
  }

  private placeLabels() {
    if (!this.w) return
    const rects: { x: number; y: number; w: number; h: number; heading?: boolean }[] = []
    const narrow = this.w <= 720
    const minX = narrow ? 4 : 292
    const maxX = narrow || this.rightInset <= 28 ? this.w - 4 : this.w - this.rightInset
    const onScreen = (r: { x: number; y: number; w: number; h: number }) => {
      if (r.x < minX || r.y < 4 || r.x + r.w > maxX || r.y + r.h > this.h - 4) return false
      return !rects.some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y)
    }
    // A name goes off the edge of the screen with the land under it, as on any map, and keeps its side.
    // It only gives way to what's there: the card floating over the map, and its neighbours.
    const covers = this.cb.covers()
    const free = (r: { x: number; y: number; w: number; h: number }) => {
      if (covers.some((c) => r.x < c.right && r.x + r.w > c.left && r.y < c.bottom && r.y + r.h > c.top)) return false
      return !rects.some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y)
    }

    // Territory names claim their space first.
    for (const t of this.territories) {
      const [x, y] = this.gateLabelPos(t)
      rects.push({ x: x - 6, y: y - 18, w: Math.max(this.gateLabelWidth(t) + 40, this.noteWidth(this.areaNote(t.gate))) + 12, h: 42 })
    }

    if (this.dollarOn) {
      this.placeFigures(rects, onScreen)
      return
    }
    for (const f of this.figures.values()) f.target = 0

    const k = this.cam.k
    const focus = this.hovered ?? this.selected
    const neighbours = this.activeNeighbours()

    const overview = k < DETAIL_K
    if (overview) this.layoutOverview()
    const near = k >= SUMMARY_K

    // Zoomed out, what stands alone is what stands. Everything else has gathered into a line.
    const stands = (n: Node) => !overview || n.inOverview || n.piece.id === focus || !!neighbours?.has(n.piece.id) || !!this.highlight?.has(n.piece.id)
    const settled = (n: Node): [number, number] => this.toScreen(overview && n.inOverview ? n.ovx : n.tx, overview && n.inOverview ? n.ovy : n.ty)

    // Symbols are obstacles too: a label must never sit on top of another piece.
    const tile = tileSize(k)
    const icon = iconSize(k)
    const marks: { id: string; x: number; y: number; w: number; h: number }[] = []
    for (const n of this.nodes) {
      if (this.sealTarget.has(n.piece.gate) || !stands(n)) continue
      const [x, y] = settled(n)
      const half = (n.piece.kind === 'service' ? tile : icon) / 2 + 1
      const box = { x: x - half, y: y - half, w: half * 2, h: half * 2 }
      rects.push(box)
      marks.push({ id: n.piece.id, ...box })
    }
    // Each kind's name, or its line when zoomed out, holds its place on the land.
    const headingRects: { x: number; y: number; w: number; h: number; heading: boolean }[] = []
    for (const d of this.districts) {
      if (this.sealTarget.has(d.gate) || (!overview && !d.named) || (overview && d.hidden)) continue
      const [x, y] = this.districtPos(d, overview ? 0 : 1)
      headingRects.push({ x: x - 2, y: y - 11, w: overview ? d.lw + 4 : this.districtWidth(d) + 4, h: 13, heading: true })
    }
    rects.push(...headingRects)
    // A name must read as belonging to its own mark. If another mark sits just beyond it, on the far side, it could be taken for that one's.
    // Names read to the right of their mark everywhere, so that's the one side that can't be misread.
    const clearBeyond = (id: string, r: { x: number; y: number; w: number; h: number }, side: CanvasTextAlign | 'above' | 'below', reach: number) => {
      if (side === 'left') return true
      const far =
        side === 'right' ? { x: r.x - reach, y: r.y, w: reach, h: r.h }
        : side === 'above' ? { x: r.x, y: r.y - reach, w: r.w, h: reach }
        : { x: r.x, y: r.y + r.h, w: r.w, h: reach }
      return !marks.some((m) => m.id !== id && far.x < m.x + m.w && far.x + far.w > m.x && far.y < m.y + m.h && far.y + far.h > m.y)
    }

    // Where there's a tussle, what you're pointing at comes first, then what's wearing a pin, then what needs you.
    const score = (n: Node) => {
      let s = 0
      if (n.piece.id === focus) s += 1000
      else if (neighbours?.has(n.piece.id)) s += 300
      const pin = this.pinOf(n)
      if (pin) s += pin === 'now' ? 200 : 100
      if (this.data.flagged.has(n.piece.id)) s += 5
      return s
    }

    const order = [...this.nodes].sort((a, b) => score(b) - score(a))
    const next = new Map<string, Omit<PlacedLabel, 'alpha' | 'target'>>()
    const FONT = `${nameSize(k)}px ${this.sans}`
    const SUB_FONT = `10.5px ${this.sans}`
    const leading = leadingAt(k)
    const landOf = new Map(this.territories.map((t) => [t.gate, t]))
    // A label stays on its own land. Only the thing you're pointing at may run over the coast.
    const onLand = (gate: string, ax: number, bx: number, cy: number) => {
      const t = landOf.get(gate)
      if (!t) return true
      const [wax, wy] = this.toWorld(ax, cy)
      const [wbx] = this.toWorld(bx, cy)
      return t.onLand(wax, wy) && t.onLand(wbx, wy)
    }
    // How far an item's one line can run before it meets the next item along, or the shore.
    const roomFrom = (id: string, gate: string, from: number, y: number) => {
      let limit = maxX
      for (const m of marks) if (m.id !== id && m.x > from && Math.abs(m.y + m.h / 2 - y) < 18) limit = Math.min(limit, m.x - 10)
      const t = landOf.get(gate)
      if (t) {
        const [, hi] = landBetween(t, (y - 8 - this.cam.y) / k, (y + 16 - this.cam.y) / k)
        limit = Math.min(limit, hi * k + this.cam.x - 10)
        // The land's furthest reach at this height can be a cape on the far side of a bay, so walk along the line and stop at the first water.
        for (let at = from + 24; at < limit; at += 24) {
          if (!onLand(gate, at, at, y + 10)) {
            limit = at - 24
            break
          }
        }
      }
      return limit - from
    }

    for (const n of order) {
      const isFocus = n.piece.id === focus || neighbours?.has(n.piece.id) || (overview && this.highlight?.has(n.piece.id))
      const pin = this.pinOf(n)
      // Zoomed out, a logo goes by its picture until you point at it.
      if (overview && !isFocus && !pin) continue
      if (this.sealTarget.has(n.piece.gate)) continue
      const [x, y] = settled(n)
      if (x < -80 || y < -40 || x > this.w + 80 || y > this.h + 40) continue
      const name = this.labelFor(n.piece.title, FONT)
      // The thing you're pointing at always says all of itself.
      const whole = isFocus && name.cut
      const lines = whole ? [n.piece.title] : name.lines
      const extra = (lines.length - 1) * leading
      // A pinned name is set a weight heavier, and is measured in the lighter one, so it allows for that.
      const w = (whole ? name.wholeWidth : name.width) * (pin ? 1.04 : 1)
      // Every name starts the same distance from its mark's middle, so names in a column line up whatever the mark.
      const off = tile / 2 + (n.piece.id === this.selected ? 9 : 5)
      const candidates: [number, number, CanvasTextAlign, CanvasTextAlign | 'above' | 'below'][] = [
        [x + off, y + 4 - extra / 2, 'left', 'left'],
        [x - off, y + 4 - extra / 2, 'right', 'right'],
        [x, y - off - 2 - extra, 'center', 'above'],
        [x, y + off + 10, 'center', 'below'],
      ]
      const fits = (rect: { x: number; y: number; w: number; h: number }, left: number, cy: number, side: CanvasTextAlign | 'above' | 'below', pass: 'strict' | 'land' | 'tight') => {
        // Cheapest test first: this runs for every item whenever what you're pointing at changes.
        if (n.piece.id === focus) return true
        if (!free(rect)) return false
        if (isFocus) return true
        // The coast is drawn around every name set to the right of its mark, so that side needs no asking. Flipping it would only break the column it's in.
        if (side === 'left') return true
        const margin = pass === 'tight' ? 0 : 6
        if (!onLand(n.piece.gate, left - margin, left + w + margin, cy - 3) || !onLand(n.piece.gate, left - margin, left + w + margin, cy - 3 + extra)) return false
        return pass !== 'strict' || clearBeyond(n.piece.id, rect, side, n.piece.kind === 'service' ? 2 : 9)
      }
      const place = (cx: number, cy: number, align: CanvasTextAlign, rect: { x: number; y: number; w: number; h: number }) => {
        // Close in, there's room to say what it is as well as what it's called.
        if (near && align === 'left' && !overview && n.piece.summary) {
          const room = roomFrom(n.piece.id, n.piece.gate, cx, y)
          const sub = room >= 72 ? this.fitLine(n.piece.summary, SUB_FONT, room) : ''
          if (sub) {
            const subW = this.measure(sub, SUB_FONT)
            const raised = cy - 6.5
            const box = { x: rect.x, y: raised - 10, w: Math.max(rect.w, subW + 4), h: 14 + extra + leading }
            if (free(box)) {
              rects.push(box)
              next.set(n.piece.id, { id: n.piece.id, x: cx - x, y: raised - y, align, name: true, lines, sub })
              return
            }
          }
        }
        rects.push(rect)
        next.set(n.piece.id, { id: n.piece.id, x: cx - x, y: cy - y, align, name: true, lines })
      }
      // Anything wearing a pin gets a name: as neatly as any label if it can, then closer to its neighbours, then right up to the coast.
      const passes = pin ? (['strict', 'land', 'tight'] as const) : (['strict'] as const)
      let placed = false
      for (const pass of passes) {
        for (const [cx, cy, align, side] of candidates) {
          const left = align === 'left' ? cx : align === 'right' ? cx - w : cx - w / 2
          const rect = { x: left - 2, y: cy - 10, w: w + 4, h: 14 + extra }
          if (fits(rect, left, cy, side, pass)) {
            place(cx, cy, align, rect)
            placed = true
            break
          }
        }
        if (placed) break
      }
      if (placed || !pin) continue
      const boxes = candidates.map(([cx, cy, align]) => {
        const left = align === 'left' ? cx : align === 'right' ? cx - w : cx - w / 2
        return { cx, cy, align, left, rect: { x: left - 2, y: cy - 10, w: w + 4, h: 14 + extra } }
      })
      // Failing all that, wherever the least of it hangs over the coast. There are only ever a few pins, so this can afford to look.
      let best: (typeof boxes)[number] | null = null
      let least = Infinity
      for (const box of boxes) {
        if (!free(box.rect)) continue
        let out = 0
        for (let i = 0; i <= 8; i++) {
          const at = box.left + (w * i) / 8
          if (!onLand(n.piece.gate, at, at, box.cy - 3)) out++
          if (extra && !onLand(n.piece.gate, at, at, box.cy - 3 + extra)) out++
        }
        if (out < least) {
          least = out
          best = box
        }
      }
      // Failing that too, over the fewest neighbours. What needs you now can't go unnamed. A question can, if it would bury more than one of them.
      if (!best) {
        least = Infinity
        for (const box of boxes) {
          const r = box.rect
          if (r.x < minX || r.y < 4 || r.x + r.w > maxX || r.y + r.h > this.h - 4) continue
          const over = rects.filter((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y).length
          if (over < least) {
            least = over
            best = box
          }
        }
        if (pin !== 'now' && least > 1) best = null
      }
      if (best) place(best.cx, best.cy, best.align, best.rect)
    }

    this.leanPins(marks, rects, order, settled, overview)

    // Keep existing labels so unchanged ones don't flicker; only changes crossfade.
    const keep: PlacedLabel[] = []
    for (const l of this.labels) {
      const n = next.get(l.id)
      if (n) {
        // Say only what it says now. A summary left over from a closer zoom would land on the next row.
        keep.push({ ...l, sub: undefined, lines: undefined, ...n, target: 1 })
        next.delete(l.id)
      } else {
        l.target = 0
        if (l.alpha > 0) keep.push(l)
      }
    }
    for (const n of next.values()) keep.push({ ...n, alpha: this.appeared ? 0 : 1, target: 1 })
    this.labels = keep
  }

  /** A line of text cut to fit, at a word if it can be. Cached by how much room there was, near enough. */
  private fitLine(text: string, font: string, room: number): string {
    const bucket = Math.floor(room / 8) * 8
    const key = `${bucket}|${font}|${text}`
    const got = this.subCache.get(key)
    if (got !== undefined) return got
    if (this.subCache.size > 2000) this.subCache.clear()
    let out = text
    if (this.measure(text, font) > bucket) {
      let lo = 0
      let hi = text.length
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        if (this.measure(`${text.slice(0, mid).trimEnd()}…`, font) <= bucket) lo = mid
        else hi = mid - 1
      }
      const cut = text.slice(0, lo)
      const word = cut.lastIndexOf(' ')
      out = lo < 12 ? '' : `${(word > lo - 12 && word > 8 ? cut.slice(0, word) : cut).trimEnd().replace(/[,;:.]$/, '')}…`
    }
    this.subCache.set(key, out)
    return out
  }

  /**
   * A pin stands above its item, so it could stand on whatever is above that. It tries standing straight,
   * then leans whichever way is clear, like a pin pushed into a real map, so it doesn't cover a neighbour.
   */
  private leanPins(marks: { id: string; x: number; y: number; w: number; h: number }[], rects: { x: number; y: number; w: number; h: number; heading?: boolean }[], order: Node[], settled: (n: Node) => [number, number], overview: boolean) {
    const k = this.cam.k
    const heads: { x: number; y: number; r: number }[] = []
    const markIds = new Map(marks.map((m) => [`${m.x},${m.y}`, m.id]))
    for (const n of order) {
      const pin = this.pinOf(n)
      if (!pin) continue
      if (overview && !n.inOverview) continue
      const [x, y] = settled(n)
      const r = pinRadius(pin, k)
      const tip = y - this.pinLift(n, k)
      const reach = r * PIN_REACH
      const half = this.pinLift(n, k)
      // First from the upper left, tip on the mark's corner: that puts its head in the margin, clear of the kind's name and the item's own.
      // Nearly flat comes last, for a tight fit: at a laptop's zoom a column's end can leave no room any higher than the mark itself.
      const corner = [-0.9, -0.8, -0.7, -0.6, -1.1, -1.3, -1.5].map((lean) => ({ lean, tipX: half - 1 }))
      const tries = [...(overview ? [] : corner), ...[0, -0.26, 0.26, -0.5, 0.5, -0.72, 0.72].map((lean) => ({ lean, tipX: 0 }))]
      let best = tries[0]
      let least = Infinity
      for (const t of tries) {
        const hx = x - t.tipX + Math.sin(t.lean) * reach
        const hy = tip - Math.cos(t.lean) * reach
        // A straight pin only if the margin's taken.
        let cover = t.tipX ? 0 : 0.6 + Math.abs(t.lean) * 0.5
        for (const o of rects) {
          // A kind's name is held with a little padding. What matters here is where its first letter starts, because at a laptop's zoom there's only just room.
          const dx = Math.max(o.x + (o.heading ? 2 : 0) - hx, 0, hx - (o.x + o.w))
          const dy = Math.max(o.y - hy, 0, hy - (o.y + o.h))
          if (Math.hypot(dx, dy) < r) {
            const own = markIds.get(`${o.x},${o.y}`) === n.piece.id
            // A name or a mark it stood on couldn't be read. A kind's name can better spare it.
            if (!own) cover += o.heading ? 2 : 3
          }
        }
        for (const h of heads) if (Math.hypot(h.x - hx, h.y - hy) < r + h.r + 2) cover += 4
        if (cover < least) {
          least = cover
          best = t
        }
      }
      n.lean = best.lean
      n.tipX = best.tipX
      heads.push({ x: x - best.tipX + Math.sin(best.lean) * reach, y: tip - Math.cos(best.lean) * reach, r })
    }
  }

  // The things of one kind in an area

  private buildDistricts() {
    const out: District[] = []
    for (const gate of this.data.gates) {
      const own = this.nodes.filter((n) => n.piece.gate === gate.id)
      if (!own.length) continue
      const home = new Set(mainGroup(own.map((n) => ({ piece: n.piece, x: n.tx, y: n.ty }))).map((o) => o.piece.id))
      const list: District[] = []
      for (const def of DISTRICTS) {
        // In reading order, so what's first on the land is first when they gather zoomed out.
        const members = own.filter((n) => def.kinds.includes(n.piece.kind)).sort((a, b) => a.ty - b.ty || a.tx - b.tx)
        if (!members.length) continue
        // A kind's name stands over those at home, not somewhere between them and one dragged away.
        const atHome = members.filter((n) => home.has(n.piece.id))
        const xs = (atHome.length ? atHome : members).map((n) => n.tx)
        const ys = (atHome.length ? atHome : members).map((n) => n.ty)
        list.push({
          gate: gate.id,
          def,
          members,
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minY: Math.min(...ys),
          maxY: Math.max(...ys),
          named: false,
          lx: Math.min(...xs),
          ly: Math.min(...ys),
          lw: 0,
          lh: 0,
          look: members.some((n) => this.data.flagged.get(n.piece.id) === 'look'),
          above: members.some((n) => n.ty - Math.min(...ys) < 8 && wrapTitle(n.piece.title).lines.length > 1) ? HEADING_ABOVE + 6 / DESIGN_K : HEADING_ABOVE,
          hidden: false,
        })
      }
      // A kind's name on the land only means something if that kind does sit together.
      const crossed = (a: District, b: District) => {
        const ax = (a.maxX - a.minX) * 0.1
        const ay = (a.maxY - a.minY) * 0.1
        return a.minX + ax < b.maxX && a.maxX - ax > b.minX && a.minY + ay < b.maxY && a.maxY - ay > b.minY
      }
      const apart = list.every((a, i) => list.every((b, j) => j <= i || !crossed(a, b)))
      for (const d of list) d.named = apart && own.length >= HEADINGS_FROM
      out.push(...list)
    }
    this.districts = out
    this.overviewAt = -1
  }

  /** Where a kind's name stands: over its first row, flush with the left of its marks. `detail` is 1 for there, 0 for its place zoomed out. */
  private districtPos(d: District, detail: number): [number, number] {
    const k = this.cam.k
    const [hx, hy] = this.toScreen(d.minX, d.minY - d.above)
    const x = hx - tileSize(k) / 2
    if (detail >= 1) return [x, hy]
    const [lx, ly] = this.toScreen(d.lx, d.ly)
    return [lerp(lx, x, detail), lerp(ly, hy, detail)]
  }

  private districtWidth(d: District): number {
    return this.measure(d.def.name, this.districtFont())
  }

  private districtFont(): string {
    return `12px ${SERIF}`
  }

  /**
   * Zoomed out: each kind of thing in an area becomes one line, with its logos or its pinned items under it.
   * Lines stay where the kind lives. They move only to keep off each other and on their own land.
   */
  private layoutOverview() {
    const k = this.cam.k
    // Often enough to look continuous while zooming, and no oftener, because this runs inside the frame.
    if (this.overviewAt > 0 && Math.abs(this.overviewAt - k) < k * 0.012) return
    this.overviewAt = k
    const tile = tileSize(k)
    const pitch = tile + 4
    const font = this.districtFont()
    const nameFont = `${nameSize(k)}px ${this.sans}`
    const pinRow = (n: Node) => pinRadius(this.pinOf(n) ?? 'decide', k) * (PIN_REACH + 1) + tile / 2 + 2
    for (const n of this.nodes) n.inOverview = false
    const land = new Map(this.territories.map((t) => [t.gate, t]))
    const gatesSeen = new Set(this.districts.map((d) => d.gate))
    for (const gate of gatesSeen) {
      const t = land.get(gate)
      if (!t) continue
      const here = this.districts.filter((d) => d.gate === gate)
      const lineWidth = new Map(here.map((d) => [d, (d.def.id === 'tools' ? 0 : LINE_ICON) + this.measure(`${d.def.name}  ${d.members.length}`, font) + (d.look ? 12 : 0)]))
      // In the same place as the kinds' names closer in: flush with the area's name, under the line that says who can read it.
      const left = t.nameX * k - tile / 2
      const [, labelY] = this.gateLabelBase(t)
      const start = labelY - this.cam.y + 46
      // As far down as there's land under the start of the lines, because land often runs on past what's on it.
      let floor = t.holds.maxY * k - 4
      for (let y = floor + 6; y < t.maxY * k; y += 6) {
        if (!t.onLand(left / k, (y + 8) / k) || !t.onLand((left + 70) / k, (y + 8) / k)) break
        floor = y
      }
      const ceiling = t.holds.maxX * k
      // Everything in one column. If it won't all fit, the kinds other than tools run on into a second, level with the first.
      const arrange = (maxRows: number, dropped: Set<District>) => {
        const boxes = here
          .filter((d) => !dropped.has(d) || d.members.some((n) => this.pinOf(n)))
          .map((d) => {
            const pinned = d.members.filter((n) => this.pinOf(n))
            const bare = dropped.has(d)
            const logos = d.def.id === 'tools' && !bare ? d.members.filter((n) => !this.pinOf(n)) : []
            const header = bare ? 0 : 18
            const lineW = lineWidth.get(d)!
            const pinnedW = Math.max(0, ...pinned.map((n) => tile + 8 + this.labelFor(n.piece.title, nameFont).width))
            const across = clamp(Math.floor((ceiling - left) / pitch), 3, 8)
            const shown = logos.slice(0, across * maxRows)
            const rows = Math.ceil(shown.length / across)
            // The last pinned name hangs below its mark's middle, so it needs a little more.
            const h = header + rows * pitch + pinned.reduce((sum, n) => sum + pinRow(n), 0) + (pinned.length ? 6 : 0)
            return { d, x: left, y: 0, lineW, pinned, bare, header, across, shown, rows, w: Math.max(lineW, Math.min(across, shown.length) * pitch, pinnedW), h }
          })
        const GAP = 4
        let y = start
        let x = left
        let widest = 0
        let second = -1
        let column = 0
        for (const box of boxes) {
          // The top of the second column lines up with the first line after the tools.
          if (box.d.def.id !== 'tools' && second < 0) second = y
          if (column === 0 && y - 12 + box.h > floor && box.d.def.id !== 'tools' && y > second) {
            column = 1
            x = left + widest + 22
            y = second
          }
          box.x = x
          box.y = y
          y += box.h + GAP
          if (box.d.def.id !== 'tools') widest = Math.max(widest, box.w)
        }
        const failing = boxes.filter((box) => box.y - 12 + box.h > floor + 1 || box.x + box.w > Math.max(ceiling, left + box.w) + 1)
        return { boxes, failing }
      }
      let plan = arrange(3, new Set())
      if (plan.failing.length) plan = arrange(1, new Set())
      // What still has no room gives way, least important kind first, so one line that doesn't fit can't take the others with it. Logos go last, because they say the most.
      const dropped = new Set<District>()
      const rank = (b: { d: District }) => DISTRICTS.indexOf(b.d.def)
      // Dropping a line only counts if it helped. A pin that won't fit anywhere can't be dropped, and mustn't take everything else on the land down with it.
      let best = plan
      for (let i = 0; i < DISTRICTS.length && best.failing.length; i++) {
        // What's stuck goes first. If that's the logos, or a pin with no line left to lose, the least important line still showing goes instead, so a pin can't end up standing on a logo.
        const victim = plan.failing.filter((b) => !b.bare && b.d.def.id !== 'tools').sort((a, b) => rank(b) - rank(a))[0] ?? plan.boxes.filter((b) => !b.bare).sort((a, b) => rank(b) - rank(a))[0]
        if (!victim) break
        dropped.add(victim.d)
        plan = arrange(1, dropped)
        if (plan.failing.length < best.failing.length) best = plan
      }
      plan = best
      // Land with nothing on it says this area is empty, which it isn't. Better a tight fit than that.
      if (!plan.boxes.length && here.length) plan = arrange(1, new Set(here.slice(1)))
      const boxes = plan.boxes
      for (const d of here) d.hidden = !boxes.some((box) => box.d === d && !box.bare)
      // The block stands in the middle of its land, a little high, as a county's name does on a map, so the empty ground isn't all on one side.
      // Only as far as it stays on land, because the middle may be a bay. Where it started is always land, so that's the last resort.
      this.overviewShift.delete(gate)
      const nameWidth = Math.max(this.gateLabelWidth(t), this.noteWidth(this.areaNote(gate)))
      const blockTop = labelY - this.cam.y - 18
      const blockBottom = Math.max(blockTop + 40, ...boxes.map((b) => b.y - 12 + b.h))
      const blockRight = Math.max(left + nameWidth, ...boxes.map((b) => b.x + b.w))
      const wholeX = Math.max(0, ((t.holds.minX + t.holds.maxX) / 2) * k - (left + blockRight) / 2)
      const wholeY = Math.max(0, ((t.holds.minY + t.holds.maxY) / 2) * k - (blockTop + blockBottom) / 2 - 6)
      const clear = (ax: number, bx: number, y: number) => {
        const m = 8
        for (let at = ax - m; at < bx + m; at += 14) if (!t.onLand(at / k, y / k)) return false
        return t.onLand((bx + m) / k, y / k)
      }
      const stays = (dx: number, dy: number) => {
        const name = labelY - this.cam.y + dy
        if (!clear(left + dx, left + dx + nameWidth, name - 16) || !clear(left + dx, left + dx + nameWidth, name) || !clear(left + dx, left + dx + nameWidth, name + 22)) return false
        return boxes.every((box) => clear(box.x + dx, box.x + dx + box.w, box.y + dy - 12) && clear(box.x + dx, box.x + dx + box.w, box.y + dy - 12 + box.h))
      }
      let dx = 0
      let dy = 0
      for (const f of [1, 0.8, 0.6, 0.4, 0.2]) {
        if (stays(wholeX * f, wholeY * f)) {
          dx = wholeX * f
          dy = wholeY * f
          break
        }
      }
      this.overviewShift.set(gate, { x: dx / k, y: dy / k })
      for (const box of boxes) {
        box.x += dx
        box.y += dy
      }
      for (const { d, x, y, lineW, h, shown, across, rows, pinned, header } of boxes) {
        d.lx = x / k
        d.ly = y / k
        d.lw = lineW
        d.lh = h
        shown.forEach((n, i) => {
          n.inOverview = true
          n.ovx = (x + tile / 2 + (i % across) * pitch) / k
          n.ovy = (y - 12 + header + 1 + tile / 2 + Math.floor(i / across) * pitch) / k
        })
        let below = 0
        pinned.forEach((n) => {
          n.inOverview = true
          n.ovx = (x + tile / 2) / k
          // Low enough that its pin stands clear of what's above it.
          below += pinRow(n)
          n.ovy = (y - 12 + header - 1 + rows * pitch + below) / k
        })
      }
    }
  }

  private districtLineAt(sx: number, sy: number): District | null {
    if (!this.overview || this.lensActive || this.dollarOn) return null
    for (const d of this.districts) {
      if (d.hidden) continue
      const [x, y] = this.toScreen(d.lx, d.ly)
      if (sx >= x - 4 && sx <= x + d.lw + 4 && sy >= y - 13 && sy <= y + 6) return d
    }
    return null
  }

  /** Clicking a kind's line goes there, as clicking a cluster does on any map. */
  private goToDistrict(d: District) {
    this.userMoved = true
    this.slidOver = 0
    const k = Math.max(DETAIL_K * 1.2, Math.min(0.72, this.cam.k * 1.6))
    const wx = (d.minX + d.maxX) / 2
    const wy = (d.minY + d.maxY) / 2
    const target = { k, x: this.w / 2 + 120 - wx * k, y: this.h / 2 - wy * k }
    if (this.reducedMotion) this.cam = target
    else this.camTarget = target
    this.cb.cameraChanged(k, this.fitK)
    this.scheduleLabels(300)
    this.invalidate()
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
        const [x, y] = this.toScreen(n.townX, n.townY)
        rects.push({ x: x - tile / 2, y: y - tile / 2, w: tile, h: tile })
      }
    }

    // First pass: every figure.
    for (const n of services) {
      const [wx, wy] = [n.townX, n.townY]
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
        // On its own land if it can be. Over the coast only if that's the one place left.
        const land = this.territories.find((t) => t.gate === n.piece.gate)
        const staysOn = (rect: { x: number; y: number; w: number; h: number }) => {
          if (!land) return true
          const [lo, hi] = landBetween(land, (rect.y - this.cam.y) / this.cam.k, (rect.y + rect.h - this.cam.y) / this.cam.k)
          return (rect.x - this.cam.x) / this.cam.k >= lo && (rect.x + rect.w - this.cam.x) / this.cam.k <= hi
        }
        for (const onLand of [true, false]) {
          for (const [cx, cy, align] of candidates) {
            const left = align === 'left' ? cx : align === 'right' ? cx - w : cx - w / 2
            const rect = { x: left - 2, y: cy - 11, w: w + 4, h: 15 }
            if (free(rect) && (!onLand || staysOn(rect))) {
              rects.push(rect)
              placed = [cx, cy, align, false]
              break
            }
          }
          if (placed) break
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
      const [wx, wy] = [n.townX, n.townY]
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
        keep.push({ ...l, sub: undefined, lines: undefined, ...n, target: 1 })
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

  /** Where an area's name starts, closer in: on its own land, flush with what's under it. */
  private gateLabelBase(t: Territory): [number, number] {
    const k = this.cam.k
    const [x, y] = this.toScreen(t.nameX, t.nameY)
    const first = this.districts.filter((d) => d.gate === t.gate && d.named).sort((a, b) => a.minY - b.minY)[0]
    // Over the first kind's name and the line that says who can read it.
    const above = (first ? first.above * k + 28 : 26) + 18
    return [x - tileSize(k) / 2, y - above]
  }

  /** Where it is now. Zoomed out, it moves with the block it heads, into the middle of its land. */
  private gateLabelPos(t: Territory): [number, number] {
    const [x, y] = this.gateLabelBase(t)
    const shift = this.overviewShift.get(t.gate)
    if (!shift) return [x, y]
    const gathered = (1 - EASE(this.lodT)) * (1 - EASE(this.dollarT))
    return [x + shift.x * this.cam.k * gathered, y + shift.y * this.cam.k * gathered]
  }

  private gateLabelSize() {
    return clamp(18.5 + 8 * (this.cam.k - 0.4), 17, 28)
  }

  private nameWidth(name: string): number {
    const size = this.gateLabelSize()
    this.ctx.font = `${size}px ${SERIF}`
    const c = this.ctx as CanvasRenderingContext2D & { letterSpacing?: string }
    if ('letterSpacing' in c) c.letterSpacing = `${(size * 0.1).toFixed(1)}px`
    const w = this.ctx.measureText(name).width
    if ('letterSpacing' in c) c.letterSpacing = '0px'
    return w
  }

  private gateLabelWidth(t: Territory): number {
    return this.nameWidth(this.shownName(t))
  }

  /** How far along from a name's start the land runs, between these two heights on screen. It walks, because the land's furthest reach can be a cape across a bay. */
  private landRoom(t: Territory, x: number, top: number, bottom: number): number {
    const STEP = 10
    let at = x
    while (at + STEP < this.w - 8) {
      const [wx, wTop] = this.toWorld(at + STEP, top)
      const [, wBottom] = this.toWorld(at + STEP, bottom)
      if (!t.onLand(wx, wTop) || !t.onLand(wx, wBottom)) break
      at += STEP
    }
    return at - x - 6
  }

  /** How far it can run before it reaches another area or the edge of the screen. Over water is all right, as a name crosses a firth on any map. Into a neighbour isn't, because then whose name is it? */
  private neighbourRoom(t: Territory, x: number, top: number, bottom: number): number {
    const STEP = 10
    const others = this.territories.filter((o) => o !== t)
    let at = x
    while (at + STEP < this.w - 8) {
      const [wx, wTop] = this.toWorld(at + STEP, top)
      const [, wBottom] = this.toWorld(at + STEP, bottom)
      if (others.some((o) => o.onLand(wx, wTop) || o.onLand(wx, wBottom))) break
      at += STEP
    }
    return at - x - 6
  }

  /** The longest way of saying this that fits on its own land. Failing that the shortest, as far as the next area, because these lines say who can read. */
  private fitted(gate: string, faces: string[], ...tries: string[]): string {
    const t = this.territories.find((o) => o.gate === gate)
    if (!t) return tries[0]
    const [x, y] = this.gateLabelPos(t)
    const font = `11.5px ${this.sans}`
    const onLand = this.landRoom(t, x, y + 6, y + 23) - this.facesWidth(faces.length)
    const found = tries.find((text) => this.measure(text, font) <= onLand)
    if (found) return found
    const last = tries[tries.length - 1]
    // Cut to nothing it would say nothing. Better it runs long.
    return this.fitLine(last, font, this.neighbourRoom(t, x, y + 6, y + 23) - this.facesWidth(faces.length)) || last
  }

  /** An area's name, as far as the next area. Its panel always has the whole of it. Once a frame per area, because every label asks. */
  private shownName(t: Territory): string {
    const had = this.shownNames.get(t.gate)
    if (had !== undefined) return had
    const name = this.data.gates.find((g) => g.id === t.gate)?.name ?? ''
    const [x, y] = this.gateLabelPos(t)
    const room = this.neighbourRoom(t, x, y - 15, y + 3) - (this.data.sealedToAll.has(t.gate) || this.data.exposed.has(t.gate) ? 38 : 0)
    let shown = name
    if (this.nameWidth(name) > room) {
      let lo = 1
      let hi = name.length - 1
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        if (this.nameWidth(`${name.slice(0, mid).trimEnd()}…`) <= room) lo = mid
        else hi = mid - 1
      }
      shown = `${name.slice(0, lo).trimEnd()}…`
    }
    this.shownNames.set(t.gate, shown)
    return shown
  }

  /** The line under an area's name: who can read it, as marks you can see and words you can read. */
  private areaNote(gate: string): { text: string; sealed: boolean; faces: string[]; exposed: boolean } {
    const none = { sealed: false, faces: [] as string[], exposed: false }
    if (this.data.readOnly) return { ...none, text: '' }
    if (this.lensActive) {
      if (!this.sealTarget.has(gate)) return { ...none, text: 'Can read' }
      // Still readable out there, so it isn't sealed yet, and vermilion would say it was.
      if (this.pendingSeal.has(gate)) return { ...none, text: 'Can read until you update', exposed: true }
      if (!this.data.pricesReadable.has(gate)) return { ...none, text: "Can't read", sealed: true }
      // Money shows each service's name, plan and price, so "prices" alone would understate it. The area's panel spells it out.
      return { ...none, text: this.fitted(gate, [], "Can't read, except service names and prices", "Can't read, except names and prices", 'Names and prices only'), sealed: true }
    }
    // Everyone's mark stays beside the warning. The words are about one fact, and the map may never understate who can read.
    const exposed = this.data.exposed.get(gate)
    // Where there's no room for the whole sentence it gets shorter: the marks still say who, and the line at top centre says it in full.
    if (exposed) {
      const faces = this.data.readers.get(gate) ?? []
      return { ...none, text: this.fitted(gate, faces, exposed, 'Still readable until you update'), exposed: true, faces }
    }
    if (this.data.sealedToAll.has(gate)) {
      // Money lists every service's name and price, so an area of services is only closed apart from those.
      if (!this.data.pricesReadable.has(gate)) return { ...none, text: 'No one can read this', sealed: true }
      const end = this.data.live ? ' can be read' : ', once live'
      return { ...none, text: this.fitted(gate, [], `Only service names and prices${end}`, `Only names and prices${end}`, 'Names and prices only'), sealed: true }
    }
    const names = this.data.readers.get(gate) ?? []
    if (!names.length) return { ...none, text: '' }
    // Until there's a copy online, nobody reads anything, so "Read by" would be wrong. It's who the area is for.
    const live = this.data.live
    const shown = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]} and ${names.length - 1} others`
    // Names when there's room, a count when there isn't.
    const count = live ? `${names.length} can read this` : `For ${names.length} readers`
    const first = `${names[0]} and ${names.length - 1} ${names.length === 2 ? 'other' : 'others'}`
    const lead = live ? 'Read by' : 'For'
    return { ...none, faces: names, text: names.length > 1 ? this.fitted(gate, names, `${lead} ${shown}`, `${lead} ${first}`, count) : this.fitted(gate, names, `${lead} ${shown}`) }
  }

  private facesWidth(count: number): number {
    return count ? FACE + (count - 1) * FACE_STEP + FACE_GAP : 0
  }

  private noteWidth(note: { text: string; faces: string[] }): number {
    return this.facesWidth(note.faces.length) + (note.text ? this.measure(note.text, `11.5px ${this.sans}`) : 0)
  }

  /** Readers' marks in a row, side by side, so each can be read. */
  private drawFaces(names: string[], x: number, y: number, alpha: number, now: number) {
    const ctx = this.ctx
    for (let i = names.length - 1; i >= 0; i--) {
      const name = names[i]
      const cx = x + FACE / 2 + i * FACE_STEP
      if (serviceFor(name)?.svg) {
        this.drawTile(name, cx, y, FACE, alpha, now)
      } else {
        ctx.globalAlpha = alpha
        drawAvatar(ctx, cx, y, FACE, monogramOf(name), this.data.readerColours.get(name) ?? '#4d6475', this.sans)
      }
    }
    ctx.globalAlpha = 1
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
    if (!this.exposedHatch) this.exposedHatch = make(7, `rgba(${p.alertRGB},0.62)`, 1)
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
    this.shownNames.clear()

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.sea = this.seaColour()
    ctx.fillStyle = this.sea
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
    this.drawWaterlines(k)
    this.drawTerritories(k)
    this.drawLinks(k)
    if (this.dollarT > 0 && this.dollarStyle === 'soundings') this.drawSoundings(k)
    ctx.restore()

    this.drawNodes(now)
    if (this.dollarT > 0 && this.dollarStyle === 'towns') this.drawTowns(now)
    this.drawLabels()
    this.drawDistricts()
    if (this.dollarT > 0) this.drawFigures()
    this.drawGateLabels(now)
    this.drawPins()
  }

  private seaColour(): string {
    const p = this.palette!
    if (this.liveT <= 0) return p.paper
    if (this.liveT >= 1) return p.liveSea
    const a = hexToRgb(p.paper)
    const b = hexToRgb(p.liveSea)
    const t = EASE(this.liveT)
    return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`
  }

  private drawEmpty() {
    const ctx = this.ctx
    const p = this.palette!
    if (!this.terrain) this.terrain = buildEmptyTerrain(this.w, this.h)
    ctx.lineWidth = 0.75
    this.terrain.water.forEach((path, i) => {
      ctx.strokeStyle = `rgba(${p.inkRGB},${[0.09, 0.06, 0.04][i]})`
      ctx.stroke(path)
    })
    ctx.globalAlpha = 0.6
    ctx.fillStyle = p.land
    ctx.fill(this.terrain.land)
    ctx.globalAlpha = 1
    ctx.strokeStyle = `rgba(${p.inkRGB},0.2)`
    ctx.stroke(this.terrain.land)
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

  /** Fine lines in the sea, close to the shore, fading as they go out, as an engraver ran them around a coast. Once they'd run together they stop. */
  private drawWaterlines(k: number) {
    const ctx = this.ctx
    const p = this.palette!
    // A little tone at the shore, as an old sheet has, under the land. It costs one stroke and it can't pinch, because strokes only add up.
    if (this.land) {
      ctx.save()
      ctx.lineJoin = 'round'
      for (const [width, alpha] of [[26, 0.012], [10, 0.016]] as const) {
        ctx.strokeStyle = `rgba(${p.inkRGB},${alpha})`
        ctx.lineWidth = width / k
        ctx.stroke(this.land.coast)
      }
      ctx.restore()
    }
    // They close up as the map shrinks, so they fade before they can turn into a double outline.
    const fade = clamp((k - 0.17) / 0.26, 0, 1)
    if (fade <= 0) return
    ctx.lineWidth = 0.75 / k
    this.waterlines.forEach((line, i) => {
      ctx.strokeStyle = `rgba(${p.inkRGB},${(p.dark ? [0.18, 0.12, 0.07] : [0.13, 0.085, 0.05])[i] * fade})`
      ctx.stroke(line)
    })
  }

  /** An area's whole edge: the border inside the coast, and the coast inside the area. */
  private strokeArea(t: Territory) {
    const ctx = this.ctx
    ctx.save()
    ctx.clip(t.coast)
    ctx.stroke(t.outer)
    ctx.restore()
    ctx.save()
    ctx.clip(t.outer)
    ctx.stroke(t.coast)
    ctx.restore()
  }

  private drawTerritories(k: number) {
    const ctx = this.ctx
    const p = this.palette!
    if (!this.land) return
    const line = 0.75 / k
    // An engraver's shaded coast: the same line again, a little down and to the right, under the land, so it only shows on the side away from the light.
    ctx.save()
    ctx.translate(0.9 / k, 1.1 / k)
    ctx.strokeStyle = `rgba(${p.inkRGB},${p.dark ? 0.5 : 0.55})`
    ctx.lineWidth = 1.1 / k
    ctx.stroke(this.land.coast)
    ctx.restore()
    // The country first, so no sea shows through where two areas meet.
    ctx.fillStyle = p.land
    ctx.fill(this.land.coast)
    ctx.save()
    ctx.clip(this.land.coast)
    for (const t of this.territories) {
      const s = this.seal.get(t.gate) ?? 0
      const ground = this.groundOf(t.gate)
      if (ground !== p.land) {
        ctx.fillStyle = ground
        ctx.fill(t.outer)
      }
      if (s > 0) {
        // Solid underneath at every stage, or the sea would show through the hatching and turn vermilion to mauve on a live map.
        ctx.globalAlpha = s
        ctx.fillStyle = this.pendingSeal.has(t.gate) ? p.exposedLand : p.sealedLand
        ctx.fill(t.outer)
        ctx.globalAlpha = 1
        // Closed here and still readable out there isn't sealed, so it can't wear the colour that says it is.
        const notYet = this.pendingSeal.has(t.gate)
        ctx.save()
        ctx.globalAlpha = s
        // The pattern stays a constant screen size, so hatching doesn't grow with zoom.
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
        const screen = new Path2D()
        screen.addPath(t.outer, new DOMMatrix([k, 0, 0, k, this.cam.x, this.cam.y]))
        ctx.fillStyle = notYet ? this.exposedHatch! : this.sealedHatch!
        ctx.scale(1 / this.dpr, 1 / this.dpr)
        const big = new Path2D()
        big.addPath(screen, new DOMMatrix([this.dpr, 0, 0, this.dpr, 0, 0]))
        ctx.fill(big)
        ctx.restore()
      }
    }
    ctx.restore()

    // Borders are dashed and quiet, and the coast is the one firm line, as on any atlas sheet.
    ctx.save()
    ctx.clip(this.land.coast)
    ctx.setLineDash([3.5 / k, 3 / k])
    ctx.lineWidth = 0.75 / k
    ctx.strokeStyle = `rgba(${p.inkRGB},${p.dark ? 0.42 : 0.36})`
    ctx.stroke(this.land.borders)
    ctx.restore()
    ctx.strokeStyle = `rgba(${p.inkRGB},${p.dark ? 0.5 : 0.56})`
    ctx.lineWidth = 0.75 / k
    ctx.stroke(this.land.coast)

    // What's coloured wears its colour on its whole edge.
    for (const t of this.territories) {
      const s = this.seal.get(t.gate) ?? 0
      const closedToAll = !this.lensActive && this.data.sealedToAll.has(t.gate)
      const exposed = !this.lensActive && this.data.exposed.has(t.gate)
      if (exposed) {
        ctx.strokeStyle = p.alert
        ctx.lineWidth = 2 / k
        this.strokeArea(t)
      } else if (closedToAll && s < 0.5) {
        ctx.strokeStyle = `rgba(${p.vermilionRGB},0.62)`
        ctx.lineWidth = line
        this.strokeArea(t)
      }
      if (s > 0) {
        const notYet = this.pendingSeal.has(t.gate)
        ctx.strokeStyle = notYet ? p.alert : `rgba(${p.vermilionRGB},${0.6 * s})`
        ctx.lineWidth = (notYet ? 2 : 1) / k
        this.strokeArea(t)
      }
    }
    for (const t of this.territories) {
      const hot = this.hoverGate === t.gate || this.dropGate === t.gate
      const active = this.activeArea === t.gate
      if (hot || active) {
        ctx.strokeStyle = `rgba(${p.inkRGB},${active ? 0.9 : 0.6})`
        ctx.lineWidth = (active ? 1.5 : 1) / k
        this.strokeArea(t)
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
      const isFocus = focus && (l.from === focus || l.to === focus)
      const alpha = 0.62 * fade
      const [ax, ay] = this.displayPos(a)
      const [bx, by] = this.displayPos(b)
      // A slight arc, always the same way round, so a line reads as a route and doesn't run along a row. It stops short of both marks.
      const dx = bx - ax
      const dy = by - ay
      const length = Math.hypot(dx, dy) || 1
      const bend = Math.min(0.12, 40 / length)
      const cx = (ax + bx) / 2 - dy * bend
      const cy = (ay + by) / 2 + dx * bend
      const stop = (n: Node, tx: number, ty: number): [number, number] => {
        const [x, y] = this.displayPos(n)
        const r = ((n.piece.kind === 'service' ? tileSize(k) : iconSize(k)) / 2 + 4) / k
        const d = Math.hypot(tx - x, ty - y) || 1
        return [x + ((tx - x) / d) * r, y + ((ty - y) / d) * r]
      }
      const [sx, sy] = stop(a, cx, cy)
      const [ex, ey] = stop(b, cx, cy)
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.quadraticCurveTo(cx, cy, ex, ey)
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
    // What needs you now glows through its land, so it survives shrinking the page.
    for (const n of this.nodes) {
      if (this.pinOf(n) !== 'now' || n.alpha < 0.01) continue
      const [wx, wy] = this.displayPos(n)
      const [x, y] = this.toScreen(wx, wy)
      const r = clamp(46 * Math.sqrt(this.cam.k), 30, 60)
      const land = this.territories.find((t) => t.gate === n.piece.gate)
      ctx.save()
      // It stays on its own land, because it's about this area and not the sea.
      if (land) {
        ctx.translate(this.cam.x, this.cam.y)
        ctx.scale(this.cam.k, this.cam.k)
        ctx.clip(land.coast)
        ctx.clip(land.outer)
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      }
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r)
      glow.addColorStop(0, `rgba(${p.alertRGB},${0.5 * n.alpha})`)
      glow.addColorStop(1, `rgba(${p.alertRGB},0)`)
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
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
        continue
      }

      const size = icon * scale
      // While lines show, land behind each picture, so one doesn't run through it. A glowing item keeps its glow.
      if ((this.hovered ?? this.selected ?? this.highlight) && this.pinOf(n) !== 'now') {
        ctx.fillStyle = this.groundOf(n.piece.gate)
        ctx.beginPath()
        ctx.arc(x, y, size * 0.66, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = p.ink
      drawSymbol(ctx, n.piece.kind, x, y, size)

      if (n.piece.id === this.selected) {
        ctx.lineWidth = 1.25
        ctx.beginPath()
        ctx.arc(x, y, size * 0.82, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
  }

  /** Over everything, so nothing can hide what's asking for you. The worst go on last. */
  private drawPins() {
    const ctx = this.ctx
    const p = this.palette!
    const k = this.cam.k
    const pinned = this.nodes.filter((n) => this.pinOf(n) && n.alpha >= 0.01)
    pinned.sort((a, b) => (this.pinOf(a) === 'now' ? 1 : 0) - (this.pinOf(b) === 'now' ? 1 : 0))
    for (const n of pinned) {
      const level = this.pinOf(n)!
      const [wx, wy] = this.displayPos(n)
      const [x, y] = this.toScreen(wx, wy)
      ctx.globalAlpha = n.alpha
      const r = pinRadius(level, k)
      const tip = y - this.pinLift(n, k)
      const edge = this.groundOf(n.piece.gate)
      if (level === 'now') drawPin(ctx, x - n.tipX, tip, r, p.alert, p.onAlert, edge, '!', this.sans, n.lean)
      else drawPin(ctx, x - n.tipX, tip, r, p.ink, p.land, edge, '?', this.sans, n.lean)
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
      const [sx, sy] = this.displayPos(n)
      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
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
    // Nothing runs behind a name until lines appear or prices spread out. Then each name keeps its ground, so no line strikes it through.
    const grounded = !!focus || !!this.highlight || this.dollarOn
    ctx.textBaseline = 'alphabetic'
    const names = this.labels
    const subFont = `10.5px ${this.sans}`
    for (const l of names) {
      const n = this.byId.get(l.id)
      if (!n) continue
      const a = l.alpha * Math.max(n.alpha, this.dollarOn && n.cost ? 1 : 0)
      if (a < 0.02) continue
      const [wx, wy] = this.dollarOn && n.cost ? [lerp(n.tx, n.townX, EASE(this.dollarT)), lerp(n.ty, n.townY, EASE(this.dollarT))] : this.labelAnchor(n)
      const [x, y] = this.toScreen(wx, wy)
      const fade = this.dollarOn ? EASE(this.dollarT) * 0.8 : 1
      ctx.textAlign = l.align
      ctx.font = this.dollarOn && n.cost ? `10.5px ${this.sans}` : `${this.pinOf(n) ? '500 ' : ''}${nameSize(this.cam.k)}px ${this.sans}`
      const ground = this.groundOf(n.piece.gate)
      const leading = leadingAt(this.cam.k)
      const lines = l.lines ?? [n.piece.title]
      lines.forEach((line, i) => {
        const ly = y + l.y + i * leading
        // A pinned name is the one kind allowed up against the coast, so it always keeps its ground and the coast can't strike it through.
        if (grounded || this.pinOf(n)) {
          ctx.globalAlpha = l.alpha * fade
          ctx.lineJoin = 'round'
          ctx.lineWidth = 3
          ctx.strokeStyle = ground
          ctx.strokeText(line, x + l.x, ly)
        }
        ctx.globalAlpha = a * fade
        ctx.fillStyle = l.id === focus ? p.ink : `rgba(${p.inkRGB},0.86)`
        ctx.fillText(line, x + l.x, ly)
      })
      // Worth a look: a dot at the end of the name, so it can only be about this item. Beside the mark, it read as the end of the name before it.
      // Zoomed out a logo has no name, and that dot moves to the line that says Tools.
      if (this.data.flagged.get(n.piece.id) === 'look' && !this.dollarOn && !this.overview && l.align === 'left') {
        const last = lines[lines.length - 1]
        ctx.globalAlpha = a
        drawNeedDot(ctx, x + l.x + ctx.measureText(last).width + 6, y + l.y + (lines.length - 1) * leading - 3.5, 2.25, p.ink, ground)
      }
      if (l.sub) {
        const sy = y + l.y + lines.length * leading
        ctx.font = subFont
        if (grounded) {
          ctx.globalAlpha = l.alpha * fade
          ctx.lineJoin = 'round'
          ctx.lineWidth = 3
          ctx.strokeStyle = ground
          ctx.strokeText(l.sub, x + l.x, sy)
        }
        ctx.globalAlpha = a * fade
        ctx.fillStyle = `rgba(${p.inkRGB},0.6)`
        ctx.fillText(l.sub, x + l.x, sy)
      }
    }
    ctx.globalAlpha = 1
  }

  /** The name of each kind of thing on the land. Zoomed out, it says how many, and it's a way in. */
  private drawDistricts() {
    const ctx = this.ctx
    const p = this.palette!
    const money = 1 - EASE(this.dollarT)
    if (money <= 0.01 || !this.districts.length) return
    const gathered = 1 - EASE(this.lodT)
    const focused = !!(this.hovered ?? this.selected)
    const dim = this.highlight ? 0.14 : focused ? 0.28 : 1
    const font = this.districtFont()
    const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    for (const d of this.districts) {
      const shown = (d.named ? 1 - gathered * (d.hidden ? 1 : 0) : d.hidden ? 0 : gathered) * money * (1 - (this.seal.get(d.gate) ?? 0)) * dim
      if (shown < 0.01) continue
      const [x, y] = this.districtPos(d, 1 - gathered)
      const hot = this.hoverDistrict === d
      const icon = d.def.id === 'tools' ? 0 : LINE_ICON * gathered
      if (icon > 0.5) {
        ctx.globalAlpha = shown * gathered
        ctx.strokeStyle = p.ink
        ctx.fillStyle = p.ink
        drawSymbol(ctx, d.def.icon, x + 6.5, y - 4, 13)
      }
      ctx.font = font
      ctx.fillStyle = `rgba(${p.inkRGB},${lerp(0.5, hot ? 1 : 0.74, gathered)})`
      ctx.globalAlpha = shown
      if ('letterSpacing' in c) c.letterSpacing = '0.4px'
      ctx.fillText(d.def.name, x + icon, y)
      const width = ctx.measureText(d.def.name).width
      if ('letterSpacing' in c) c.letterSpacing = '0px'
      if (gathered > 0.01) {
        ctx.globalAlpha = shown * gathered
        ctx.fillStyle = `rgba(${p.inkRGB},${hot ? 0.8 : 0.5})`
        const count = String(d.members.length)
        ctx.fillText(count, x + icon + width + 5, y)
        if (d.look) drawNeedDot(ctx, x + icon + width + 5 + ctx.measureText(count).width + 7, y - 4, 3.2, p.ink, this.groundOf(d.gate))
      }
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
      const [wx, wy] = [lerp(n.tx, n.townX, t), lerp(n.ty, n.townY, t)]
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
      // A town's figure stands on its disc. A sounding's stands on the land.
      this.haloText(text, fx, fy, 3, towns ? p.land : this.groundOf(n.piece.gate))

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
    ctx.textAlign = 'left'
    const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string }

    for (const t of this.territories) {
      const gate = this.data.gates.find((g) => g.id === t.gate)
      if (!gate) continue
      const [x, y] = this.gateLabelPos(t)
      const s = this.seal.get(t.gate) ?? 0
      const ground = s > 0.5 ? (this.pendingSeal.has(t.gate) ? p.exposedLand : p.sealedLand) : this.groundOf(t.gate)
      const shown = this.shownName(t)

      ctx.font = `${size}px ${SERIF}`
      if ('letterSpacing' in c) c.letterSpacing = `${(size * 0.1).toFixed(1)}px`
      // Closed here but still readable out there isn't sealed yet, so its name stays ink.
      ctx.fillStyle = s > 0.5 && !this.pendingSeal.has(t.gate) ? p.vermilion : p.ink
      this.haloText(shown, x, y, 5, ground)
      if ('letterSpacing' in c) c.letterSpacing = '0px'
      const nameW = this.nameWidth(shown)

      // Under the name: who can read it. Prices take this line while they're showing.
      const note = this.areaNote(t.gate)
      if (note.text && this.dollarT < 0.99) {
        const fade = 1 - EASE(this.dollarT)
        const faces = this.facesWidth(note.faces.length)
        if (faces) this.drawFaces(note.faces, x, y + 13.5, fade * (this.data.live ? 1 : p.dark ? 0.75 : 0.6), now)
        ctx.globalAlpha = fade
        ctx.textAlign = 'left'
        ctx.font = `${note.exposed ? '500 ' : ''}11.5px ${this.sans}`
        ctx.fillStyle = note.sealed ? p.vermilion : note.exposed ? p.ink : `rgba(${p.inkRGB},0.68)`
        this.haloText(note.text, x + faces, y + 17.5, 4, ground)
        ctx.globalAlpha = 1
      }

      // Beside the name, so it never sits on the words.
      const after = x + nameW + 8
      // A gate no password opens carries a small seal, even with no lens on.
      if (this.data.sealedToAll.has(t.gate) && !this.lensActive && !this.data.exposed.has(t.gate)) {
        ctx.drawImage(this.waxSeal(26), after, y - 19, 26, 26)
      }

      // A closed area someone can still read wears the same pin as anything else that needs you now.
      if (note.exposed && this.dollarT < 0.5) {
        const r = pinRadius('now', this.cam.k)
        drawPin(ctx, after + r, y + 2, r, p.alert, p.onAlert, ground, '!', this.sans)
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
        this.haloText(`${sym}${money} a ${this.period}`, x, y + 16, 4, ground)
        ctx.globalAlpha = 1
      }

      // The wax mark lands on a closed gate.
      if (s > 0.01 && !this.pendingSeal.has(t.gate)) {
        const landed = this.sealLanded.get(t.gate)
        const age = landed ? (now - landed) / 340 : 1
        const land = this.reducedMotion ? 1 : EASE(clamp(age, 0, 1))
        const waxSize = 44
        const scale = lerp(1.55, 1, land)
        const wax = this.waxSeal(waxSize)
        const cx = (t.holds.minX + t.holds.maxX) / 2
        const cy = (t.holds.minY + t.holds.maxY) / 2
        const [sx, sy] = this.toScreen(cx, cy)
        const draw = waxSize * scale
        ctx.globalAlpha = Math.min(1, s * 2) * (landed ? land : s)
        ctx.drawImage(wax, sx - draw / 2, sy - draw / 2, draw, draw)
        ctx.globalAlpha = 1
      }
    }
  }
}
