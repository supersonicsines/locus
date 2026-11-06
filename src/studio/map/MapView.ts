// The map. One canvas, drawn on demand, with no framework in the way.
//
// Everything sits in world coordinates. The camera maps them to the screen.
// Hairlines stay a constant screen size, as on a printed chart. Type does too through the usual zooms, then grows a little as you
// come close, up to sizes that read comfortably, while the land keeps growing, so each step closer gives every item more room to say
// more. Like a real map it changes in kind, not only in size, across a wide range: far out it's an island with the company's name;
// then each county's name; then each kind of thing gathered into a line; then every item with its name; then each item's line; then,
// close, what's in it, until it's whole.
//
// The camera follows the person exactly, as in Miro and Figma: two fingers on a trackpad move the map, a pinch zooms as the
// fingers move, a mouse wheel's notches zoom and glide, a drag carries on when thrown, and zoom always moves in proportion (in its
// logarithm). Where names go depends only on the map and the zoom, so panning never moves a name off its land or changes it.

import { figure, monthly, soundingRadius, summarize, townRadius, trustOf, type MoneyPeriod, type MoneySummary } from '../../core/money.ts'
import type { Cost, Gate, Link, Piece, PieceKind } from '../../core/types.ts'
import { buildLand, DESIGN_K, DISTRICTS, HEADINGS_FROM, landBetween, mainGroup, wrapTitle, type DistrictDef, type Land, type Territory } from './layout.ts'
import type { NeedLevel } from '../../core/status.ts'
import { drawAvatar, drawNeedDot, drawPin, drawPinHead, drawSymbol, makeWaxSeal } from './symbols.ts'
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
  /** Vermilion for small words, a step darker so they hold 4.5:1 on a sealed area's pink. */
  vermilionInk: string
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
  /** Whether that copy is behind what's on this map. */
  behind: boolean
  /** Pieces with something to check on their price. */
  priceChecks: Set<string>
  /** Gates no password opens, marked with a small seal even with no lens on. */
  sealedToAll: Set<string>
  /** The name of everyone who can read each gate. */
  readers: Map<string, string[]>
  /** The colour of each reader with no logo of their own. */
  readerColours: Map<string, string>
  readOnly: boolean
  /** The company's name, which is what the map says when it's zoomed out to a speck. */
  company?: string
}

export type DollarStyle = 'soundings' | 'towns'

export interface MapCallbacks {
  select(id: string | null): void
  gateClick(id: string): void
  /** A click on an area's land or name with no reader picked, or null for the open sea. */
  areaClick(id: string | null): void
  /** Pointing at an item, or at nothing, in page coordinates. */
  itemHover?(id: string | null, x: number, y: number): void
  gateHover(id: string | null): void
  pieceMoved(id: string, x: number, y: number, gate: string | null): void
  cameraChanged(k: number, fitK: number): void
  /** Close in, the area under the middle of the screen while its own name is out of sight, or null. */
  whereChanged?(name: string | null): void
  /** What floats over the map right now, so names don't go under it. */
  covers(): { left: number; top: number; right: number; bottom: number }[]
  /** Everything floating over the map, panels and the top line as well as what `covers` lists. */
  overlays(): { left: number; top: number; right: number; bottom: number }[]
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
  /** Where it was on screen's terms when the map last rearranged, in world coordinates. NaN for something new. */
  fromX: number
  fromY: number
}

/** The land as it was, kept while it fades out under what replaced it. */
interface Rearranging {
  start: number
  land: Land | null
  territories: Territory[]
  camFrom: { x: number; y: number; k: number }
  names: Map<string, { x: number; y: number }>
}

/** How long a rearranged map takes to get where it's going. Long enough to follow one thing across it, and short enough not to wait for. */
const REARRANGE_MS = 560
/** How long something new keeps the wash that says it just arrived. */
const FRESH_HOLD_MS = 2600
const FRESH_FADE_MS = 700

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
  /** Zoomed out, where a row of logos that can't hold them all says how many more there are, in world coordinates. */
  more?: { x: number; y: number; n: number }
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
  /** Closer still, the lines after it: the rest of its summary, then what's in it. */
  more?: string[]
}

const EASE = (t: number) => 1 - Math.pow(1 - t, 3)
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Low enough that a big map on a phone still fits under the top bar.
const FIT_MIN_K = 0.12
/**
 * How far the map zooms, out and in. Out until the company is an island in the sea with its name beside it; in until an
 * item's words are the size of a page's. Like a chart, it changes what it shows at each scale, not only its size (see far() and the sizes below).
 */
const MIN_K = 0.004
const MAX_K = 8
/** How far out past the whole map you can go: a tenth of its size, an island you can still read the shape of, with its name under it. */
const OUT_PAST_FIT = 10
/**
 * Zooming is felt in proportion: twice as close takes the same turn of the wheel whatever the scale. A pinch's stream of small
 * deltas is followed exactly, so the map moves with the fingers. A mouse wheel moves in notches, and those glide, briefly, so it doesn't jump.
 */
const WHEEL_ZOOM = 0.0032
const PINCH_ZOOM = 0.0105
const NOTCH_MS = 95
/** How long the wheel has to be still before the next wheel event starts a new gesture. */
const WHEEL_GESTURE_GAP = 160

/**
 * Whether a wheel event is two fingers on a trackpad or a mouse wheel's notch. Browsers don't say, so this reads the signs:
 * lines or pages mean a mouse; sideways movement means fingers; and Chrome and Safari keep an older figure that's exactly
 * three times the delta for a trackpad, and something else for a wheel. Without that figure, a big whole step is a notch.
 */
function wheelKind(e: WheelEvent): 'pan' | 'notch' {
  if (e.deltaMode !== 0) return 'notch'
  if (e.deltaX !== 0) return 'pan'
  const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY
  if (typeof legacy === 'number' && legacy !== 0) return legacy === -3 * e.deltaY ? 'pan' : 'notch'
  return Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40 ? 'notch' : 'pan'
}

/** A drag let go while moving carries on and slows, as anything thrown does, over about this long. */
const GLIDE_MS = 320
/** While the camera moves, names are placed again this often, so they come and go with the zoom rather than all at once when it stops. */
const ZOOM_STEP = 0.11

/** A reader's mark under an area's name, in screen pixels. */
const FACE = 20
const FACE_STEP = 24
const FACE_GAP = 6

/** How far above a kind's first row its name stands, in world units, so it moves with the land. */
const HEADING_ABOVE = 15 / DESIGN_K
/** Room for the little picture at the start of a kind's line, zoomed out. */
const LINE_ICON = 18

/** The head of a pin, in screen pixels. The loudest thing on the map must also be the biggest. */
/** The least a map is shrunk to make room for a panel. Below it names outgrow their land: clean at 0.23, colliding at 0.19. */
const PANEL_FLOOR = 0.22

/** Where the side panel starts, from the right edge: --side-w and --gutter in styles.css, and room for a name to stand clear of it. */
const PANEL_CLEAR = 436

const pinRadius = (level: NeedLevel, k: number) => (level === 'now' ? clamp(11.5 * Math.sqrt(k), 9.5, 13) : clamp(8 * Math.sqrt(k), 7, 9.5))
const PIN_REACH = 2.35

const hexToRgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]

/**
 * Closer than the usual reading zoom, words and marks grow, in proportion to the square root of the zoom, to a little over twice
 * their size: a chart's type stays a chart's type, but a map you've come right up to shouldn't be a field of specks. 1 up to SUMMARY_K.
 */
const closeUp = (k: number) => Math.max(1, Math.sqrt(k / 0.85))
/**
 * Type and marks stop growing at sizes that read comfortably (NAME_MAX, SUB_MAX and the tile caps), while the land keeps growing
 * with the zoom. So each step closer gives an item more room, and it says more of itself, until it's whole: zooming in shows more,
 * never the same cut sentence bigger.
 */
const NAME_MAX = 22
const SUB_MAX = 18
/** Past 4×, when every item near you is whole, the last stretch magnifies everything together, up to twice its size at the closest. */
const magnify = (k: number) => clamp(k / 4, 1, 2)

/** A service's tile on the map, in screen pixels. It grows slowly with zoom, and stops at sizes a logo can still be read at, until you come close. */
const tileSize = (k: number) => Math.round(clamp(25 * Math.sqrt(k), 15, 30) * clamp(Math.sqrt(k / 1.44), 1, 56 / 30) * magnify(k))

/** Any other item's picture, in screen pixels. */
const iconSize = (k: number) => Math.round(clamp(19.5 * Math.sqrt(k), 14, 20) * clamp(Math.sqrt(k / 1.05), 1, 2) * magnify(k))
const LABEL_LEADING = 15
/** What the face draws itself, at 0.6 em a character: Latin, its punctuation, and the euro. */
const MONO_SAFE = /^[\u0020-\u017f\u2010-\u2027\u20ac]*$/
/** An area's name is the top layer of the map, so it's the heaviest word on it. A mono already gives every letter a full cell, so it takes only a breath of tracking. */
const AREA_NAME_WEIGHT = 500
const AREA_NAME_TRACK = 0.035

/** Names step down a size just before the map gathers them up, which gives a laptop's whole-map view room for every one. */
const nameSize = (k: number) => (k < DESIGN_K * 0.92 ? 11 : Math.round(Math.min(NAME_MAX, 12 * closeUp(k)) * magnify(k) * 4) / 4)
const leadingAt = (k: number) => (nameSize(k) < 11.5 ? 13 : Math.round((LABEL_LEADING * nameSize(k)) / 12))
/** An item's one line under its name, and the words of what's in it once the map is close enough to read them. */
const subSize = (k: number) => Math.round(Math.min(SUB_MAX, 10.5 * closeUp(k)) * magnify(k) * 4) / 4
/** From here an item's summary is said whole, over as many lines as it takes. */
const READ_LINES_K = 1.6
/** From here an item shows what's in it, under its name, as much as there's room for before the next one. */
const READ_K = 2.6

/** Words wrapped at `per` characters, which in this face is a width. A word longer than a line is cut. */
function wrapWords(text: string, per: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = word.length > per ? `${word.slice(0, per - 1)}…` : word
    if (!line) line = w
    else if (line.length + 1 + w.length <= per) line += ` ${w}`
    else {
      out.push(line)
      line = w
    }
  }
  if (line) out.push(line)
  return out
}

/** An item's body as plain paragraphs: the markdown's marks taken out, since the map prints words, not formatting. */
function plainParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '• ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_`>]+/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 40)
}

/**
 * What the map shows at each zoom. Like a real map, it changes in kind and not only in size.
 * - Close, from SUMMARY_K: every item, its name and its one line, because a row has room for two lines from there.
 * - The usual, from DETAIL_K: every item and its name.
 * - Further out: there's no room for names, and pictures without names say nothing, so each kind of thing in an area
 *   gathers into one line with a count. Logos stay, because a logo says something on its own. Anything wearing a pin stays with its name.
 */
const DETAIL_K = DESIGN_K * 0.8
/**
 * The survey: the first map a page shows is inked in from its middle out. The land spreads first, then each county's name rises into place
 * behind the wave, then what's on the land. Once per page load, never under reduced motion, and the map can be used throughout.
 */
const SURVEY_MS = 1500
const SURVEY_LAND = { at: 40, for: 820 }
/** Words and marks are timed off the ink's front: each comes up this long after the front has passed it, so nothing waits on bare land and nothing comes before its ground. */
const SURVEY_NAMES = { after: 60, for: 420 }
const SURVEY_ITEMS = { after: 140 }
/** The seals are pressed last, once the land and its names are down: sealing is what this map is for, so it's the closing beat. */
const SURVEY_SEALS = { at: 760, for: 240 }
/** Before there's a map, the graticule draws itself out from the middle. */
const EMPTY_MS = 1300
const BEHIND_SEA = 0.45
const SUMMARY_K = 0.7

export class MapView {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private cb: MapCallbacks
  // Canvas fonts can't use var(), so this reads the --sans token and the sans is only named in styles.css.
  private sans = getComputedStyle(document.documentElement).getPropertyValue('--sans').trim() || 'monospace'
  private w = 0
  private h = 0
  private dpr = 1

  private data: MapData = { gates: [], pieces: [], links: [], costs: null, currency: 'USD', flagged: new Map(), exposed: new Map(), pricesReadable: new Set(), live: false, behind: false, priceChecks: new Set(), sealedToAll: new Set(), readers: new Map(), readerColours: new Map(), readOnly: false }
  private nodes: Node[] = []
  private byId = new Map<string, Node>()
  private territories: Territory[] = []
  private districts: District[] = []
  private land: Land | null = null
  /** How far each area's block moves into the middle of its land when zoomed out, in world units. */
  private overviewShift = new Map<string, { x: number; y: number }>()
  /** Zoomed out, the kinds an area had no room for, in screen units from the map's origin. */
  private unsaid = new Map<string, { x: number; y: number; text: string; parts?: { icon: PieceKind; text: string }[] }>()
  private shownNames = new Map<string, string>()
  private familyLevels = new Map<string, number>()
  /** 1 when every item stands on its own, 0 when they've gathered into lines. */
  private lodT = 1
  private overview = false
  private overviewAt = -1
  private hoverDistrict: District | null = null
  private summary: MoneySummary | null = null

  private cam = { x: 0, y: 0, k: 1 }
  private camTarget: { x: number; y: number; k: number } | null = null
  private fitK = 1
  private overlayK = 1
  private hasFitted = false
  private rightInset = 32
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
  private slidDown = 0
  private dropGate: string | null = null
  /** Where the map was before a search moved it, so closing the item puts it back. */
  private returnTo: { x: number; y: number; k: number } | null = null
  private bottomInset = 0
  private leftInset = 0
  private rearranging: Rearranging | null = null
  private rearrangeT = 1
  private landLayer: HTMLCanvasElement | null = null
  /** What just arrived, and when. It keeps a wash for a moment, so you can tell what changed. */
  private fresh = new Map<string, number>()
  /** How strongly each pointed-at thing is showing, 0 to 1. */
  private washes = new Map<string, number>()
  private hotAreas = new Map<string, number>()
  private pressed: string | null = null

  /** How sealed each gate is, 0 to 1, animating towards its target. */
  private seal = new Map<string, number>()
  private sealTarget = new Set<string>()
  private sealLanded = new Map<string, number>()
  private lensActive = false
  /** Closed on this password but still readable until the next publish. */
  private pendingSeal = new Set<string>()

  private dollarOn = false
  private dollarT = 0
  /** On a phone there's no room to spread discs or rings without them landing on each other, so prices are each area's subtotal and the map stays as it is. A tap on a logo gives its price. */
  private subtotalsOn = false
  private subtotalsT = 0
  private dollarStyle: DollarStyle = 'soundings'
  private period: MoneyPeriod = 'month'
  private townsReady = false

  private labels: PlacedLabel[] = []
  private labelCache = new Map<string, { lines: string[]; cut: boolean }>()
  private subCache = new Map<string, string>()
  private readCache = new Map<string, string[]>()
  private figures = new Map<string, PlacedLabel>()
  private labelTimer = 0
  private gateAlpha = 1

  private raf = 0
  private lastFrame = 0
  private reducedMotion = false
  private touched = false
  private survey: { start: number; cx: number; cy: number; reach: number; feather: number } | null = null
  private surveyed = false
  private emptySince = 0
  private frameNow = 0
  private appeared = false

  private pointers = new Map<number, { x: number; y: number }>()
  private drag: { kind: 'pan' | 'piece' | 'pinch'; id?: string; sx: number; sy: number; moved: boolean; lastX: number; lastY: number; dist?: number; k?: number; ox?: number; oy?: number } | null = null
  private spaceDown = false
  /** A zoom gliding to k with the world point (wx, wy) held under the screen point (sx, sy) the whole way: a wheel's notch, a button, a key, a double click. */
  private zoomGoal: { k: number; sx: number; sy: number; wx: number; wy: number; ms: number } | null = null
  /** A pan let go while moving, in screen pixels a millisecond. */
  private glide: { vx: number; vy: number } | null = null
  /** How fast a drag is moving, smoothed over its last few events, for the glide when it's let go. */
  private dragVel = { vx: 0, vy: 0, at: 0 }
  /** Where the canvas is on the page. It fills the window, so it's read on resize rather than on every event, which would force a layout each time. */
  private origin = { left: 0, top: 0 }
  /** The camera as last told to the page, so it's told once a frame at most. */
  private reported = ''
  private placedAt = 0
  private placedK = 0
  private camMoving = false
  /** The wheel gesture in progress: two fingers moving the map, or a mouse wheel's notches zooming it. */
  private wheelGesture: { kind: 'pan' | 'notch'; at: number } | null = null
  /** How far out the map is past where its land can hold what's on it: 0 close enough for everything, 1 an island too small for its items. */
  private far = 0
  /** The same for the areas' names, which hold on a little longer. At 1 the company's name stands in for them. */
  private farAreas = 0
  /** Which far form the map is in: 0 its usual forms, 1 the counties' names alone, 2 the island. */
  private farLevel = 0

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
    // A tap's click comes after its pointerup, by when a panel may have opened under the finger, and the click would press whatever's there. The map has already answered the tap.
    canvas.addEventListener('touchend', (e) => e.preventDefault(), { passive: false })
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    // A pinch anywhere over the map's page zooms the map, as on any board, never the page: over a card or the top line too.
    document.addEventListener('wheel', this.onPageWheel, { passive: false, capture: true })
    // Safari doesn't send a pinch as ctrl+wheel. It sends gestures of its own.
    document.addEventListener('gesturestart', this.onGesture as EventListener, { passive: false })
    document.addEventListener('gesturechange', this.onGesture as EventListener, { passive: false })
    document.addEventListener('gestureend', this.onGesture as EventListener, { passive: false })
    canvas.addEventListener('dblclick', this.onDouble)
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKey)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    document.removeEventListener('wheel', this.onPageWheel, { capture: true })
    document.removeEventListener('gesturestart', this.onGesture as EventListener)
    document.removeEventListener('gesturechange', this.onGesture as EventListener)
    document.removeEventListener('gestureend', this.onGesture as EventListener)
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
    const r = this.canvas.getBoundingClientRect()
    this.origin = { left: r.left, top: r.top }
    this.hatch = null
    this.sealedHatch = null
    this.exposedHatch = null
    if (changedSize) {
      if (this.nodes.length) {
        const { k } = this.computeFit()
        // Discs are pushed apart at the scale the map fits at, so a new size of window lays them out again.
        if (Math.abs(k - this.fitK) > 0.005) this.townsReady = false
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

  /** Whether the map is somewhere other than where it would fit itself. */
  /** Whether the person has moved the map themselves, so "Whole map" has somewhere to bring them back from. Opening an item moves it too, and that isn't them. */
  get moved(): boolean {
    return this.touched
  }

  /** Room taken by something coming up from the bottom of a phone. */
  /** Room taken by the card when it's open over a narrow window's map. The map refits beside it unless you've moved it yourself. */
  setLeftInset(px: number) {
    if (this.leftInset === px) return
    this.leftInset = px
    if (!this.userMoved && this.nodes.length) this.fit(true)
  }

  setBottomInset(px: number) {
    if (this.bottomInset === px) return
    this.bottomInset = px
    if (!this.userMoved && this.nodes.length) this.fit(true)
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
    if (!this.appeared || !prev.size) this.liveT = this.liveLevel(data)
    this.data = data
    const degree = new Map<string, number>()
    for (const l of data.links) {
      degree.set(l.from, (degree.get(l.from) ?? 0) + 1)
      degree.set(l.to, (degree.get(l.to) ?? 0) + 1)
    }
    const costOf = new Map((data.costs ?? []).map((c) => [c.piece, c]))
    this.summary = data.costs ? summarize(data.costs, data.gates, data.pieces, data.currency) : null

    let positionsChanged = prev.size !== data.pieces.length
    let movedCount = 0
    const otherMap = prev.size > 0 && data.pieces.length > 0 && !data.pieces.some((p) => prev.has(p.id))
    const wasMoving = !!this.rearranging
    // Where each thing is right now, wherever it's in the middle of going, because this may interrupt a move.
    const seenAt = new Map<string, [number, number]>()
    this.nodes = data.pieces.map((p) => {
      const old = prev.get(p.id)
      if (old) seenAt.set(p.id, this.displayPos(old))
      const x = p.x ?? old?.tx ?? 0
      const y = p.y ?? old?.ty ?? 0
      if (!old || old.tx !== x || old.ty !== y || old.piece.gate !== p.gate) positionsChanged = true
      if (old && (old.tx !== x || old.ty !== y)) movedCount++
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
        fromX: old?.fromX ?? NaN,
        fromY: old?.fromY ?? NaN,
      }
    })
    // Another map isn't a move, so it's a cut. Anything else that moves more than one thing moves together, on one clock, so the eye can follow it.
    const rearranged = !otherMap && movedCount > 1
    const redrawn = otherMap || (movedCount > 1 && movedCount >= prev.size * 0.3)
    const oldLand = { land: this.land, territories: this.territories }
    const oldNames = new Map(this.territories.map((t) => [t.gate, this.nameInWorld(t)]))
    if (redrawn || rearranged) {
      for (const n of this.nodes) {
        n.x = n.tx
        n.y = n.ty
        n.ovx = n.tx
        n.ovy = n.ty
        const seen = rearranged ? seenAt.get(n.piece.id) : undefined
        n.fromX = seen ? seen[0] : NaN
        n.fromY = seen ? seen[1] : NaN
      }
    }
    // What's new comes last, once what was there has made room, and keeps a wash for a moment. The first thing on an empty map needs no pointing out.
    if (prev.size > 0 && !otherMap && this.appeared) {
      const now = performance.now()
      for (const n of this.nodes) {
        if (!prev.has(n.piece.id)) {
          this.fresh.set(n.piece.id, now)
          if (rearranged) n.appear = -0.9
        }
      }
    }
    for (const id of this.fresh.keys()) if (!this.nodes.some((n) => n.piece.id === id)) this.fresh.delete(id)
    const ordered = this.nodes.filter((n) => n.cost).sort((a, b) => (b.month ?? -1) - (a.month ?? -1))
    ordered.forEach((n, i) => (n.rank = i))
    this.byId = new Map(this.nodes.map((n) => [n.piece.id, n]))

    if (positionsChanged || !this.territories.length) {
      this.land = buildLand(data.gates, this.nodes.map((n) => ({ piece: n.piece, gate: n.piece.gate, x: n.tx, y: n.ty })))
      this.territories = this.land.territories
      this.townsReady = false
    }
    if (rearranged && !this.reducedMotion && this.w) {
      // Interrupted, what's on the screen is mostly the land it was heading for, so that's what fades out.
      this.rearranging = {
        start: performance.now(),
        ...oldLand,
        camFrom: { ...this.cam },
        names: oldNames,
      }
      this.rearrangeT = 0
    } else if (!rearranged) {
      if (wasMoving && otherMap) this.rearranging = null
    }
    this.buildDistricts()
    if (this.nodes.length) {
      const { k } = this.computeFit()
      this.fitK = k
      if (!this.hasFitted) {
        this.fit(false)
        this.hasFitted = true
      } else if (redrawn || (prev.size !== data.pieces.length && !this.userMoved)) {
        // Something arrived or went, so the land changed shape. The map stays whole unless you've moved it yourself. Drawn again, where you'd moved to doesn't mean anything any more.
        this.fit(!otherMap)
      }
      this.appeared = true
    } else {
      this.hasFitted = false
    }
    // Where it's heading, or a refit under way leaves the readout on the old number until something next moves it.
    this.cb.cameraChanged(this.camTarget?.k ?? this.cam.k, this.fitK)
    this.scheduleLabels(0)
    this.invalidate()
  }

  setSelected(id: string | null) {
    if (this.selected === id) return
    this.selected = id
    // Zoomed out this far an item has no name, so what you've just opened or made would be a ring on someone else's row. It comes close enough to have one, and goes back on closing.
    if (id && (this.camTarget?.k ?? this.cam.k) < DETAIL_K) this.focusPiece(id)
    else if (id) this.keepSubjectClear()
    else if (!this.activeArea) {
      this.slideBack()
      // A search took you there. Closing what it found brings you back, unless you've since moved the map yourself.
      if (this.returnTo) {
        const back = this.returnTo
        this.returnTo = null
        this.userMoved = false
        if (this.reducedMotion) this.cam = back
        else this.camTarget = back
        this.cb.cameraChanged(back.k, this.fitK)
      }
    }
    this.scheduleLabels(0)
    this.invalidate()
  }

  /** The right-hand edge on screen of what the panel on the right is about, wherever the camera is heading, because searching for something moves it there first. */
  private subjectRight(): number | null {
    const c = this.camTarget ?? this.cam
    const n = this.selected ? this.byId.get(this.selected) : null
    if (n) {
      // The open item's whole county clears the panel, not just the item, or its neighbours lose their names against the panel's edge.
      const own = n.tx * c.k + c.x + tileSize(c.k) / 2 + 8 + this.labelFor(n.piece.title, `${nameSize(c.k)}px ${this.sans}`).width + 16
      const t = this.territories.find((x) => x.gate === n.piece.gate)
      // Only where the county can clear the panel at all. Close in, a county is wider than the window, and sliding it clear would take the item you opened off the screen.
      const fits = !!t && (t.holds.maxX - t.holds.minX) * c.k < this.w - PANEL_CLEAR - this.safeLeft() - 24
      return fits ? Math.max(own, t!.holds.maxX * c.k + c.x + 24) : own
    }
    const t = this.territories.find((x) => x.gate === this.activeArea)
    return t ? t.holds.maxX * c.k + c.x : null
  }

  /** The right-hand edge on screen of what the selected item is linked to, with its name. */
  private linkedRight(): number | null {
    if (!this.selected) return null
    const c = this.camTarget ?? this.cam
    let most: number | null = null
    for (const l of this.data.links) {
      const other = l.from === this.selected ? l.to : l.to === this.selected ? l.from : null
      const m = other ? this.byId.get(other) : null
      if (!m) continue
      // With the line under its name, where it has one, since that's the wider of the two.
      const sub = this.labels.find((l) => l.id === m.piece.id)?.sub
      const words = Math.max(this.labelFor(m.piece.title, `${nameSize(c.k)}px ${this.sans}`).width, sub ? this.textW(sub, `${subSize(c.k)}px ${this.sans}`) : 0)
      const r = m.tx * c.k + c.x + tileSize(c.k) / 2 + 8 + words + 16
      most = most === null ? r : Math.max(most, r)
    }
    return most
  }

  /** How much further left the map can go, once moved by `shift`, before what's on some county reaches the card. */
  private roomLeft(c: { k: number; x: number; y: number }, shift: number, dy = 0): number {
    const cards = this.cb.covers()
    const room = Math.min(...this.territories.map((o) => {
      const top = o.holds.minY * c.k + c.y + dy
      const bottom = o.holds.maxY * c.k + c.y + dy
      const edge = Math.max(16, ...cards.filter((r) => top < r.bottom && bottom > r.top).map((r) => r.right + 12))
      return o.holds.minX * c.k + c.x - shift - edge
    }))
    return Math.max(0, room)
  }

  /** The panel mustn't cover the very thing it's about, so the map slides over, only as far as that takes, and back after. */
  private keepSubjectClear() {
    if (this.w <= 720) {
      // A phone's panel comes up from the bottom, so the map goes up to keep what it's about in sight, under the bar.
      const c = this.camTarget ?? this.cam
      const n = this.selected ? this.byId.get(this.selected) : null
      const t = this.territories.find((x) => x.gate === this.activeArea)
      const y = n ? n.ty * c.k + c.y : t ? t.nameY * c.k + c.y : null
      if (y === null) return
      const under = Math.max(0, y - this.h * 0.3)
      if (!under) return
      this.slidDown += under
      const target = { ...c, y: c.y - under }
      if (this.reducedMotion) this.cam = target
      else this.camTarget = target
      this.scheduleLabels(300)
      return
    }
    const right = this.subjectRight()
    if (right === null) return
    const base = this.camTarget ?? this.cam
    const need = right - (this.w - PANEL_CLEAR)
    // What it's linked to as well, so the panel's "Linked to" doesn't point at half a word. Only as far as the land on the left has room for.
    const linked = this.linkedRight()
    const want = linked === null ? need : Math.max(need, linked - (this.w - PANEL_CLEAR))
    let over = want > need ? Math.max(need, Math.min(want, Math.max(need, 0) + this.roomLeft(base, Math.max(need, 0)))) : need
    // Never so far that what you opened leaves the screen: its mark stays clear of the card on the left.
    const n = this.selected ? this.byId.get(this.selected) : null
    if (n) over = Math.min(over, Math.max(0, n.tx * base.k + base.x - tileSize(base.k) / 2 - this.safeLeft()))
    if (over <= 0) return
    this.slidOver += over
    const target = { ...base, x: base.x - over }
    if (this.reducedMotion) this.cam = target
    else this.camTarget = target
    this.scheduleLabels(300)
  }

  /** The left edge of the room the map has: the card's right edge and a gutter, or the window's edge. */
  private safeLeft(): number {
    return Math.max(16, ...this.cb.covers().map((r) => r.right + 16))
  }

  private slideBack() {
    if (!this.slidOver && !this.slidDown) return
    const base = this.camTarget ?? this.cam
    const target = { ...base, x: base.x + this.slidOver, y: base.y + this.slidDown }
    this.slidOver = 0
    this.slidDown = 0
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
    // Beside its panel the map is fitted to what the panel leaves, and framed on the open area if it can't all be shown.
    if (id && this.rightInset > 32 && this.w > 720 && !this.userMoved) this.fit(true)
    else if (id) this.keepSubjectClear()
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
    const subtotals = on && !!this.data.costs && this.w <= 720
    this.dollarOn = on && !!this.data.costs && !subtotals
    if (subtotals !== this.subtotalsOn) {
      this.subtotalsOn = subtotals
      // The card with the total comes up from the bottom, so the map makes room, unless you've moved it yourself.
      if (!this.userMoved && this.nodes.length) this.fit(true)
    }
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

  /** The world point at the middle of the screen for a camera. */
  private centreOf(c: { k: number; x: number; y: number }) {
    return { x: (this.w / 2 - c.x) / c.k, y: (this.h / 2 - c.y) / c.k }
  }

  /** The camera with this world point at the middle of the screen, at this zoom. */
  private camAt(x: number, y: number, k: number) {
    return { k, x: this.w / 2 - x * k, y: this.h / 2 - y * k }
  }

  /** The land's extent in world units. */
  private landBox() {
    if (!this.territories.length) return null
    return {
      minX: Math.min(...this.territories.map((t) => t.minX)),
      maxX: Math.max(...this.territories.map((t) => t.maxX)),
      minY: Math.min(...this.territories.map((t) => t.minY)),
      maxY: Math.max(...this.territories.map((t) => t.maxY)),
    }
  }

  /**
   * Far out, the company's name, as a country's name stands on a map of the world: across the island if it fits there, under it if not.
   * On the screen, centred at x, its baseline at y.
   */
  private companyLabel(): { text: string; x: number; y: number; w: number; size: number; onLand: boolean } | null {
    const b = this.landBox()
    const text = (this.data.company ?? '').trim()
    if (!b || !text) return null
    const size = 15
    const w = this.textW(text, `500 ${size}px ${this.sans}`) + [...text].length * size * 0.04
    const [ax, ay] = this.toScreen(b.minX, b.minY)
    const [bx, by] = this.toScreen(b.maxX, b.maxY)
    // Always under the island, so it never covers a dot that says something needs you, and never hops as the island shrinks.
    return { text, x: (ax + bx) / 2, y: by + 24, w, size, onLand: false }
  }

  /**
   * Close in, a county's name is a long way off, at its top left, and you can be deep in its land with nothing saying whose it is.
   * Then the zoom pill says it, as a design tool keeps a frame's name in view: the county under the middle of the screen, judged
   * against its borders as they're drawn, and only while its own name is off the screen or wholly under something floating.
   */
  private whereNow(): string | null {
    if (this.far > 0 || this.cam.k < DETAIL_K || !this.territories.length) return null
    const [wx, wy] = this.toWorld(this.w / 2, this.h / 2)
    const probe = (this.probe ??= document.createElement('canvas').getContext('2d')!)
    const t = this.territories.find((o) => probe.isPointInPath(o.outer, wx, wy) && probe.isPointInPath(this.land!.coast, wx, wy))
    const name = t ? this.data.gates.find((g) => g.id === t.gate)?.name ?? '' : ''
    if (!t || !name) return null
    const overlays = this.cb.overlays()
    const [nx, ny] = this.gateLabelPos(t)
    const own = { left: nx, right: nx + this.nameWidth(this.shownName(t)), top: ny - this.gateLabelSize(), bottom: ny + 4 }
    const off = own.right < 0 || own.left > this.w || own.bottom < 0 || own.top > this.h
    const covered = overlays.some((o) => own.left >= o.left && own.right <= o.right && own.top >= o.top && own.bottom <= o.bottom)
    return off || covered ? name : null
  }
  private probe: CanvasRenderingContext2D | null = null
  private countySpots = new Map<string, { x: number; y: number; size: number } | null>()
  private whereSaid: string | null = null

  /** Whether a zoom is as far out or as close in as the map goes, for the pill's buttons. */
  zoomEdge(k: number): 'floor' | 'cap' | null {
    if (k <= this.clampZoom(0) * 1.001) return 'floor'
    if (k >= MAX_K * 0.999) return 'cap'
    return null
  }

  /**
   * The middle far form: each county's name alone, small, in the middle of what's on it. A name wider than its county is left out
   * rather than squeezed or faded, and none of the lines under a name come with it.
   */
  private drawCountyNames() {
    const shown = EASE(this.far) * (1 - EASE(this.farAreas))
    if (shown <= 0.01) return
    const ctx = this.ctx
    const p = this.palette!
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 4
    const dots = this.nodes.filter((n) => this.pinOf(n) && n.alpha >= 0.01).map((n) => {
      const [x, y] = this.toScreen(n.tx, n.ty - this.sealLift(n))
      return { x, y }
    })
    for (const t of this.territories) {
      const name = this.data.gates.find((g) => g.id === t.gate)?.name ?? ''
      if (!name) continue
      const box = t.holds.maxX > t.holds.minX ? t.holds : t
      const [cx, cy] = this.toScreen((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2)
      const [bx0, by0] = this.toScreen(t.minX, t.minY)
      const [bx1, by1] = this.toScreen(t.maxX, t.maxY)
      const mine = (sx: number, sy: number) => {
        const [ax, ay] = this.toWorld(sx, sy)
        return t.onLand(ax, ay)
      }
      // On its own land at both ends and the middle, a little above and below its middle too, and clear of every dot. Searched from the
      // middle of what's on the county outwards, in 4 px steps; at 13 px, then at 11; and left out only if neither fits anywhere.
      const key = `${t.gate}|${this.cam.k.toFixed(5)}|${Math.round(this.cam.x)}|${Math.round(this.cam.y)}|${dots.length}|${name}`
      let found = this.countySpots.get(key)
      if (found === undefined) {
        found = null
        for (const size of [13, 11]) {
          const w = this.textW(name, `${AREA_NAME_WEIGHT} ${size}px ${this.sans}`)
          const clear = (x: number, y: number) =>
            [-5, 0, 5].every((dy) => mine(x - w / 2 - 2, y + dy) && mine(x, y + dy) && mine(x + w / 2 + 2, y + dy)) &&
            dots.every((d) => d.x < x - w / 2 - 7 || d.x > x + w / 2 + 7 || Math.abs(d.y - y) > 12)
          const spots: [number, number][] = []
          for (let y = by0 + 8; y <= by1 - 8; y += 4) for (let x = bx0 + w / 2; x <= bx1 - w / 2; x += 4) spots.push([x, y])
          spots.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy))
          const at = spots.find(([x, y]) => clear(x, y))
          if (at) {
            found = { x: at[0], y: at[1], size }
            break
          }
        }
        // Asked for every frame, so kept until the camera or what's on the county changes.
        if (this.countySpots.size > 200) this.countySpots.clear()
        this.countySpots.set(key, found)
      }
      if (!found) continue
      const sealed = (this.seal.get(t.gate) ?? 0) > 0.5 && !this.pendingSeal.has(t.gate)
      ctx.font = `${AREA_NAME_WEIGHT} ${found.size}px ${this.sans}`
      ctx.globalAlpha = shown
      ctx.strokeStyle = sealed ? p.sealedLand : this.groundOf(t.gate)
      ctx.strokeText(name, found.x, found.y)
      ctx.fillStyle = sealed ? p.vermilionInk : p.ink
      ctx.fillText(name, found.x, found.y)
    }
    ctx.restore()
  }

  private drawCompanyName() {
    const shown = EASE(this.farAreas)
    if (shown <= 0.01) return
    const label = this.companyLabel()
    if (!label) return
    const ctx = this.ctx
    const p = this.palette!
    const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
    ctx.save()
    ctx.globalAlpha = shown
    ctx.font = `500 ${label.size}px ${this.sans}`
    if ('letterSpacing' in c) c.letterSpacing = `${(label.size * 0.04).toFixed(2)}px`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 5
    ctx.strokeStyle = this.sea
    ctx.strokeText(label.text, label.x, label.y)
    ctx.fillStyle = p.ink
    ctx.fillText(label.text, label.x, label.y)
    if ('letterSpacing' in c) c.letterSpacing = '0px'
    ctx.restore()
  }

  /** How big the land is on the screen, by its longer side, a tall map counted a little wider since names run across. */
  private landSpan(): number {
    const b = this.landBox()
    if (!b) return Infinity
    return Math.max(b.maxX - b.minX, (b.maxY - b.minY) * 1.4) * this.cam.k
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
        const r = (towns ? townRadius(inMain ? n.month : null) * this.discScale() : inMain ? soundingRadius(n.month ?? 0, this.summary?.biggest ?? 0) : 6) / this.fitK
        const x = n.townX
        const y = n.townY
        xs.push(x - r, x + r)
        ys.push(y - r, y + r)
      }
    }
    let minX = Math.min(...xs)
    let maxX = Math.max(...xs)
    let minY = Math.min(...ys)
    let maxY = Math.max(...ys)
    // Leave room for the panels that float over the map.
    const narrow = this.w <= 720
    // Up to here the card folds away to its heading, so the map has the width.
    // The card's width and the gutters each side of it, as --left-w and --gutter say, and a little air.
    // With a reader's or an area's panel open, the map fits in what the panel leaves. Sliding it over at the same scale cut the land off at the window's edge while sea lay empty below it.
    // The card folds to its heading while a panel is open, so the left is free below it.
    const squeezed = !narrow && this.rightInset > 32
    const left = this.leftInset || (squeezed ? 40 : this.w <= 980 ? 24 : 340)
    const right = narrow ? 20 : squeezed ? this.rightInset + 24 : 36
    // Squeezed, it's the coast that has to clear the window's edge and the panel, not only what's on the land, because the coast runs on past it.
    if (squeezed && this.territories.length) {
      minX = Math.min(minX, ...this.territories.map((t) => t.minX))
      maxX = Math.max(maxX, ...this.territories.map((t) => t.maxX))
      minY = Math.min(minY, ...this.territories.map((t) => t.minY))
      maxY = Math.max(maxY, ...this.territories.map((t) => t.maxY))
    }
    // Below the top controls. Below 1240 the line at top centre drops under them, so there's more to clear.
    // Picked on a phone, a reader's sheet holds what the bar would say, so the map has that room too.
    const top = narrow ? (this.bottomInset ? 88 : 152) : this.w <= 980 ? 142 : this.w <= 1240 ? 134 : 68
    // Only the zoom sits at the foot, in its corner, so the map can come down almost to the edge.
    const bottom = this.bottomInset || (narrow ? (this.subtotalsOn ? 164 : 80) : 16)
    // A small map sits at a size where its words and its land still go together, and doesn't balloon to fill the screen.
    const kFor = (fromX: number, toX: number, fromY: number, toY: number) => clamp(Math.min((this.w - left - right) / (toX - fromX || 1), (this.h - top - bottom) / (toY - fromY || 1)), FIT_MIN_K, 0.9)
    let k = kFor(minX, maxX, minY, maxY)
    // A hair under the zoom where names show, the whole map would open as counts on blank land. Better its outer coasts run under the chrome and every name shows.
    const snapped = !narrow && !squeezed && !this.leftInset && k < DETAIL_K + 0.01 && k >= DETAIL_K * 0.9
    // Land running off the sheet suits a big map and looks like a mistake on a small one. If a little less zoom shows all of it, it gets that, but never at the cost of the names.
    if (this.territories.length && !narrow) {
      const reach = 18 / k
      const landLeft = Math.min(minX, ...this.territories.map((t) => t.minX - reach * 0.4))
      const landRight = Math.max(maxX, ...this.territories.map((t) => t.maxX + reach))
      const landTop = Math.min(minY, ...this.territories.map((t) => t.minY - reach))
      const landBottom = Math.max(maxY, ...this.territories.map((t) => t.maxY + reach))
      const enough = Math.max(k * 0.85, Math.min(k, DETAIL_K + 0.01))
      // Clear of the card as well, where that leaves room. A coast cut by a card looks like an accident. Where it doesn't, the land runs under it.
      const all = kFor(landLeft, landRight, landTop, landBottom)
      const whole = kFor(minX, landRight, landTop, landBottom)
      if (this.w > 980 && all >= enough) {
        k = all
        minX = landLeft
        maxX = landRight
        minY = landTop
        maxY = landBottom
      } else if (whole >= enough) {
        k = whole
        maxX = landRight
        minY = landTop
        maxY = landBottom
      }
    }
    // Squeezed beside a panel, a map can't shrink so far that its names outgrow their land and print over each other. Below this it keeps its size,
    // and frames what the panel is about: the area that's open, or the areas the reader being looked through can read. The rest may run under the panel, as a map runs off its sheet.
    if ((squeezed || this.leftInset > 0) && k < PANEL_FLOOR && this.territories.length) {
      k = PANEL_FLOOR
      const about = this.activeArea
        ? this.territories.filter((t) => t.gate === this.activeArea)
        : this.lensActive
          ? this.territories.filter((t) => !this.sealTarget.has(t.gate) || this.pendingSeal.has(t.gate))
          : []
      const frame = about.length ? about : this.territories
      const pad = 24 / k
      minX = Math.min(...frame.map((t) => t.holds.minX)) - pad
      maxX = Math.max(...frame.map((t) => t.holds.maxX)) + pad
      minY = Math.min(...frame.map((t) => t.holds.minY)) - pad
      maxY = Math.max(...frame.map((t) => t.holds.maxY)) + pad
    }
    if (snapped && k < DETAIL_K + 0.01) k = DETAIL_K + 0.01
    const x = left + (this.w - left - right - (maxX - minX) * k) / 2 - minX * k
    const y = top + (this.h - top - bottom - (maxY - minY) * k) / 2 - minY * k
    // A reader's panel takes a third of the width, and squeezing the map into what's left costs its names. So the map keeps its scale, the card folds away, and the map slides over into the room that gives. Only as far as it takes for what's on the land to clear the panel, and it's the land's empty west that goes off the sheet if anything has to.
    if (!narrow && !squeezed && this.rightInset > 32 && this.territories.length) {
      const held = Math.min(...this.territories.map((t) => t.holds.minX)) * k + x
      const reach = Math.max(...this.territories.map((t) => t.holds.maxX)) * k + x
      const over = reach + 16 - (this.w - this.rightInset)
      return { k, x: x - clamp(over, 0, Math.max(0, held - 16)), y }
    }
    return { k, x, y }
  }

  fit(animated = true) {
    this.userMoved = false
    this.touched = false
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
    this.slidDown = 0
    this.returnTo = null
    this.keepSubjectClear()
    this.cb.cameraChanged(f.k, this.fitK)
    this.scheduleLabels(animated ? 300 : 0)
    this.invalidate()
  }

  /** Zooms about the middle of what's showing, gliding: the buttons and the keys. */
  zoomBy(factor: number) {
    this.handOver()
    this.zoomAt(this.w / 2, this.h / 2, factor, 220)
  }

  /** The person has taken the camera: whatever it was doing on its own stops where it is. */
  private handOver() {
    if (this.camTarget && !this.rearranging) this.camTarget = null
    this.glide = null
    this.userMoved = true
    this.touched = true
    this.slidOver = 0
    this.slidDown = 0
    this.returnTo = null
  }

  /**
   * Zooms by `factor` about a point on the screen, which stays under the pointer the whole way. With `ms`, it glides there, and a
   * zoom asked for while one is gliding adds to where that one is going; without, it's there now. Zoom is in proportion, so it glides in its logarithm.
   */
  private zoomAt(sx: number, sy: number, factor: number, ms: number) {
    const from = this.zoomGoal?.k ?? this.cam.k
    const k = this.clampZoom(from * factor)
    const [wx, wy] = this.toWorld(sx, sy)
    if (ms <= 0 || this.reducedMotion) {
      // A stream of small deltas arriving while a notch still glides finishes the notch, then follows the fingers.
      this.zoomGoal = null
      this.cam = this.bounded({ k, x: sx - wx * k, y: sy - wy * k })
    } else {
      this.zoomGoal = { k, sx, sy, wx, wy, ms: Math.min(ms, this.zoomGoal?.ms ?? ms) }
    }
    this.cameraMoved()
  }

  /**
   * The camera, kept so some of the land is always on the screen. A map pushed off the edge, or zoomed out from a corner, can't be lost:
   * at least this much of what's on it stays in view, whatever the zoom.
   */
  private bounded(c: { k: number; x: number; y: number }) {
    const b = this.landBox()
    if (!b) return c
    const { minX, maxX, minY, maxY } = b
    const keepX = Math.min(120, this.w * 0.2, ((maxX - minX) * c.k) / 2)
    const keepY = Math.min(120, this.h * 0.2, ((maxY - minY) * c.k) / 2)
    const x = clamp(c.x, keepX - maxX * c.k, this.w - keepX - minX * c.k)
    const y = clamp(c.y, keepY - maxY * c.k, this.h - keepY - minY * c.k)
    return x === c.x && y === c.y ? c : { k: c.k, x, y }
  }

  /** The camera has moved: the page hears about it once a frame, and names are placed again as it goes. */
  private cameraMoved() {
    this.camMoving = true
    this.invalidate()
  }

  focusPiece(id: string, zoom = true) {
    const n = this.byId.get(id)
    if (!n) return
    if (!this.userMoved && !this.returnTo) this.returnTo = { ...(this.camTarget ?? this.cam) }
    this.userMoved = true
    this.slidOver = 0
    this.slidDown = 0
    const c = this.camTarget ?? this.cam
    // Opening something is a small act, so the map keeps its scale. It only comes closer where the item wouldn't otherwise stand with its name.
    const k = zoom && c.k < DETAIL_K ? DETAIL_K * 1.15 : c.k
    const target = this.w <= 720 ? { k, x: this.w / 2 - n.tx * k, y: this.h * 0.27 - n.ty * k } : this.framed(n, { k, x: n.tx * c.k + c.x - n.tx * k, y: n.ty * c.k + c.y - n.ty * k })
    if (this.reducedMotion) this.cam = target
    else this.camTarget = target
    this.cb.cameraChanged(k, this.fitK)
    this.scheduleLabels(300)
    this.invalidate()
  }

  /** This camera, moved only as far as it takes for the item, its name and any pin on it to stand clear of the panel, the card and the top of the page. Nothing moves if it's clear already. */
  private framed(n: Node, c: { k: number; x: number; y: number }) {
    const half = tileSize(c.k) / 2
    const level = this.data.flagged.get(n.piece.id)
    const pinned = !!level && level !== 'look'
    const name = this.labelFor(n.piece.title, `${nameSize(c.k)}px ${this.sans}`)
    const sx = n.tx * c.k + c.x
    const sy = n.ty * c.k + c.y
    const left = sx - half - (pinned ? 26 : 0) - 8
    const right = sx + half + 8 + name.width + 16
    const top = sy - half - (pinned ? 30 : 0) - 8
    const bottom = sy + half + 8 + (name.lines.length - 1) * leadingAt(c.k)
    const safeTop = this.w <= 980 ? 142 : this.w <= 1240 ? 134 : 84
    const safeBottom = this.h - 64
    const dy = top < safeTop ? safeTop - top : bottom > safeBottom ? safeBottom - bottom : 0
    const safeRight = this.w - PANEL_CLEAR
    const safeLeft = Math.max(16, ...this.cb.covers().filter((r) => top + dy < r.bottom + 12 && bottom + dy > r.top - 12).map((r) => r.right + 12))
    let dx = right > safeRight ? safeRight - right : left < safeLeft ? safeLeft - left : 0
    // A long name in a narrow window gives way before the item's mark does.
    if (left + dx < safeLeft) dx = safeLeft - left
    // An item means more among its neighbours, so where it's going to move anyway, and the whole county fits, the county comes clear too.
    const t = this.territories.find((o) => o.gate === n.piece.gate)
    // Only as far as the other counties have room for, though: clearing this one isn't worth putting another's name and marks under the card.
    if (t && dx < 0) {
      const over = t.holds.maxX * c.k + c.x + dx + 12 - safeRight
      const wide = (t.holds.maxX - t.holds.minX) * c.k + 12 < safeRight - 300
      if (over > 0 && wide) dx -= Math.min(over, this.roomLeft(c, -dx, dy))
    }
    return { k: c.k, x: c.x + dx, y: c.y + dy }
  }

  private clampZoom(k: number) {
    // Far past the whole map, where the company is a speck with its name beside it. What's on the land gives way as it goes (see far()), so nothing lands on anything.
    // Never so far that the island is a speck: at least 120 px on its shorter side, which on a phone comes before a tenth of the whole map does.
    const b = this.landBox()
    const side = b ? Math.min(b.maxX - b.minX, b.maxY - b.minY) : 0
    const floor = Math.max(MIN_K, Math.min(this.fitK, this.overlayK) / OUT_PAST_FIT, side > 0 ? 120 / side : 0)
    return clamp(k, floor, MAX_K)
  }

  // Input

  private localPoint(e: PointerEvent | WheelEvent | MouseEvent): [number, number] {
    return [e.clientX - this.origin.left, e.clientY - this.origin.top]
  }

  /** How far this item has gone to where it stands zoomed out. Prices put every service back on its own spot. */
  private gathered(n: Node): number {
    if (!n.inOverview || this.lodT >= 1) return 0
    return (1 - EASE(this.lodT)) * (1 - EASE(this.dollarT))
  }

  /** Under the lens a sealed area's "Tools" heading isn't drawn, so the tools it still shows move up into its place, or the area has a hole under its line. */
  private sealLift(n: Node): number {
    return this.throughSeal(n) ? (20 / DESIGN_K) * this.sealOf(n.piece.gate) : 0
  }

  private displayPos(n: Node): [number, number] {
    const g = this.gathered(n)
    let x = g > 0 ? lerp(n.x, n.ovx, g) : n.x
    let y = (g > 0 ? lerp(n.y, n.ovy, g) : n.y) - this.sealLift(n)
    const t = EASE(this.dollarT)
    if (t > 0 && n.cost) {
      x = lerp(x, n.townX, t)
      y = lerp(y, n.townY, t)
    }
    return this.travelled(n, x, y)
  }

  /** On the way from where it was, if the map is rearranging. */
  private travelled(n: Node, x: number, y: number): [number, number] {
    if (!this.rearranging || Number.isNaN(n.fromX)) return [x, y]
    const e = EASE(this.rearrangeT)
    return [lerp(n.fromX, x, e), lerp(n.fromY, y, e)]
  }

  /** Where an area's name hangs from, in world coordinates. */
  private nameInWorld(t: Territory): { x: number; y: number } {
    const [x, y] = this.gateLabelPos(t)
    return { x: (x - this.cam.x) / this.cam.k, y: (y - this.cam.y) / this.cam.k }
  }

  /** Where a name hangs from: where the item will settle, not where it is on the way there. */
  private labelAnchor(n: Node): [number, number] {
    const g = this.gathered(n)
    const x = g > 0 ? lerp(n.tx, n.ovx, g) : n.tx
    const y = (g > 0 ? lerp(n.ty, n.ovy, g) : n.ty) - this.sealLift(n)
    return this.travelled(n, x, y)
  }

  /** What the pointer is on: an item's mark first, then its words. */
  private hitNode(sx: number, sy: number): Node | null {
    return this.hitMark(sx, sy) ?? this.hitName(sx, sy)
  }

  /** An item's mark, logo tile or pin head: the part that's a handle. Words are something to click, and to drag the map past. */
  private hitMark(sx: number, sy: number): Node | null {
    // Far out, the island is one thing: pressing it brings the whole map back.
    if (this.far >= 0.6) return null
    let best: Node | null = null
    let bestD = Infinity
    const k = this.cam.k
    for (const n of this.nodes) {
      if (this.sealedOff(n)) continue
      if (n.alpha < 0.05) continue
      // What isn't drawn doesn't answer the pointer: not up yet in the intro, or held back with its name beside a panel.
      if (n.appear <= 0) continue
      const [wx, wy] = this.displayPos(n)
      const [x, y] = this.toScreen(wx, wy)
      let r = n.piece.kind === 'service' ? tileSize(k) / 2 + 3 : Math.max(10, iconSize(k) / 2 + 2)
      if (this.dollarOn && n.cost && this.dollarStyle === 'towns') r = this.townScreenRadius(n)
      if (this.dollarOn && n.cost && this.dollarStyle === 'soundings') r = Math.max(r, Math.min(this.soundingScreenRadius(n), 24))
      let d = Math.hypot(sx - x, sy - y)
      // A pin is the most obvious thing on the map to click, so its head answers as well.
      const pin = this.pinOf(n)
      if (pin && !this.overview) {
        const b = this.badge(n, x, y, pin)
        const head = Math.hypot(sx - b.x, sy - b.y)
        if (head < b.r + 2) {
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

  /** A name reads as the thing itself, so it answers as the thing does. Without this, clicking the word Stripe opened the area it stands in. */
  private hitName(sx: number, sy: number): Node | null {
    for (const l of this.labels) {
      if (l.alpha < 0.5 || l.align !== 'left') continue
      const n = this.byId.get(l.id)
      if (!n || n.alpha < 0.05 || this.sealedOff(n) || n.appear <= 0) continue
      const [wx, wy] = this.labelAnchor(n)
      const [x, y] = this.toScreen(wx, wy)
      const b = this.labelBox(l, n, x, y)
      if (sx >= b.left - 4 && sx <= b.right + 4 && sy >= b.top && sy <= b.bottom) return n
    }
    return null
  }

  /**
   * The box a placed name covers on the screen, with its line and whatever it says under that, for a mark at (x, y). The same box
   * answers the pointer and takes the wash, so what you can read is what you can click. As wide as the lines it was set in, so a
   * name that broke onto two lines doesn't claim its neighbour's click.
   */
  private labelBox(l: PlacedLabel, n: Node, x: number, y: number) {
    const k = this.cam.k
    const font = `${nameSize(k)}px ${this.sans}`
    const subFont = `${subSize(k)}px ${this.sans}`
    const lines = l.lines ?? [n.piece.title]
    const said = l.sub ? [l.sub, ...(l.more ?? [])] : []
    const wide = Math.max(...lines.map((line) => this.textW(line, font)), ...said.map((line) => this.textW(line, subFont)), 0)
    const left = l.align === 'left' ? x + l.x : l.align === 'right' ? x + l.x - wide : x + l.x - wide / 2
    const top = y + l.y - 11
    const bottom = y + l.y + (lines.length - 1) * leadingAt(k) + (said.length ? leadingAt(k) + (said.length - 1) * Math.round(subSize(k) * 1.5) : 0) + 4
    return { left, top, right: left + wide, bottom }
  }

  /** Which pin an item wears, if any. A quiet need is only a dot. */
  private pinOf(n: Node): NeedLevel | null {
    if (this.dollarOn) return null
    const level = this.data.flagged.get(n.piece.id)
    // Seen through a reader's eyes, what needs the owner is the owner's homework. A proposed rule keeps its question, because it changes how the reader gets it: as reference.
    if (this.lensActive) return level === 'decide' && n.piece.kind === 'rule' ? level : null
    return level === 'now' || level === 'decide' ? level : null
  }

  /** How far above an item's centre its pin's tip stands. */
  /**
   * Where a pin's badge sits and how big it is. On a logo, at its top-left corner; on any other mark, in the mark's place, as the mark.
   * A badge never leaves its item's box, so it can't land on a heading or the next column's names and be read as theirs.
   */
  private badge(n: Node, x: number, y: number, level: NeedLevel): { x: number; y: number; r: number } {
    const k = this.cam.k
    if (n.piece.kind === 'service') {
      const size = tileSize(k)
      // Inset into the plate's top-left quarter, so it never leaves the item's box or rises into a heading's line.
      const r = level === 'now' ? 6.5 : 5.5
      return { x: x - size / 2 + r - 1, y: y - size / 2 + r - 1, r }
    }
    const size = iconSize(k)
    return { x, y, r: level === 'now' ? size * 0.6 : size * 0.54 }
  }

  private pinLift(n: Node, k: number): number {
    return (n.piece.kind === 'service' ? tileSize(k) : iconSize(k)) / 2 - 1
  }

  /** What an item stands on, which is what its halo has to match. */
  /**
   * Under a reader's lens, a sealed area that still gives that reader its tools' names and prices shows those tools, and nothing else.
   * Its line says "Tool names and prices only", and the map may never understate what a reader gets.
   */
  private throughSeal(n: Node): boolean {
    return this.lensActive && n.piece.kind === 'service' && this.data.pricesReadable.has(n.piece.gate)
  }

  /** Whether the seal hides this item from the reader being looked through. Closed here but still readable out there, it doesn't: the map never says a reader reads less than they do. */
  private sealedOff(n: Node): boolean {
    return this.sealTarget.has(n.piece.gate) && !this.pendingSeal.has(n.piece.gate) && !this.throughSeal(n)
  }

  /** How sealed an area looks to the reader being looked through, 0 to 1. One still readable out there doesn't hide what's on it. */
  private sealOf(gate: string): number {
    return this.pendingSeal.has(gate) ? 0 : this.seal.get(gate) ?? 0
  }

  private groundOf(gate: string): string {
    const p = this.palette!
    if (this.lensActive) return this.sealTarget.has(gate) && !this.pendingSeal.has(gate) ? p.sealedLand : p.land
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
    // Taking hold of the map stops it where it is, gliding or flying.
    if (!this.rearranging) this.camTarget = null
    this.zoomGoal = null
    this.glide = null
    this.dragVel = { vx: 0, vy: 0, at: e.timeStamp }

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      this.drag = { kind: 'pinch', sx: x, sy: y, moved: true, lastX: (a.x + b.x) / 2, lastY: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y), k: this.cam.k }
      return
    }

    const middle = e.button === 1
    const mark = !this.spaceDown && !middle ? this.hitMark(x, y) : null
    const hit = mark ?? (!this.spaceDown && !middle ? this.hitName(x, y) : null)
    // Zoomed out, things stand in a line and not where they live, so there's nowhere meaningful to drag them from.
    // On a touch screen a finger on the map is moving the map. Arranging things is for a pointer: a phone has no room to do it and every chance of doing it by accident.
    this.pressed = hit?.piece.id ?? null
    if (this.pressed) this.invalidate()
    // Only a mark is a handle. Close in, words cover most of the land, and a drag that starts on them is someone moving the map.
    if (mark && !this.data.readOnly && !this.overview && e.pointerType !== 'touch') {
      this.cb.itemHover?.(null, 0, 0)
      // It stays where you took hold of it, or it jumps to the pointer on the first move. By its name, that's a long way.
      const [gx, gy] = this.toWorld(x, y)
      this.drag = { kind: 'piece', id: mark.piece.id, sx: x, sy: y, moved: false, lastX: x, lastY: y, ox: gx - mark.tx, oy: gy - mark.ty }
    } else if (hit) {
      this.drag = { kind: 'pan', id: hit.piece.id, sx: x, sy: y, moved: false, lastX: x, lastY: y }
    } else {
      this.drag = { kind: 'pan', sx: x, sy: y, moved: false, lastX: x, lastY: y }
    }
  }

  private onMove = (e: PointerEvent) => {
    const [x, y] = this.localPoint(e)
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x, y })

    if (this.drag?.kind === 'pinch' && this.pointers.size >= 2) {
      this.touched = true
      const [a, b] = [...this.pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const k = this.clampZoom((this.drag.k ?? 1) * (dist / (this.drag.dist || 1)))
      const [wx, wy] = this.toWorld(this.drag.lastX, this.drag.lastY)
      this.cam = this.bounded({ k, x: cx - wx * k, y: cy - wy * k })
      this.userMoved = true
      this.drag.lastX = cx
      this.drag.lastY = cy
      this.cameraMoved()
      this.scheduleLabels(160)
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
        this.cb.itemHover?.(id, x, y)
        this.scheduleLabels(0)
        this.invalidate()
      }
      // Land stays warm under anything standing on it, or it would flicker as a pointer crosses a county's items.
      const gate = overLabel ?? hit?.piece.gate ?? line?.gate ?? null
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
    if (!this.drag.moved && Math.hypot(x - this.drag.sx, y - this.drag.sy) > 3) {
      this.drag.moved = true
      this.pressed = null
      // A click isn't a grab. Only once it's really moving does the hand close.
      this.canvas.style.cursor = 'grabbing'
    }
    if (!this.drag.moved) return

    if (this.drag.kind === 'pan') {
      this.cam = this.bounded({ k: this.cam.k, x: this.cam.x + dx, y: this.cam.y + dy })
      this.userMoved = true
      this.touched = true
      this.slidOver = 0
      this.slidDown = 0
      this.returnTo = null
      // How fast it's going, mostly from the last few events, so a throw is the speed of its end and not its average.
      const gap = Math.max(1, e.timeStamp - this.dragVel.at)
      const blend = Math.min(1, gap / 40)
      this.dragVel = { vx: lerp(this.dragVel.vx, dx / gap, blend), vy: lerp(this.dragVel.vy, dy / gap, blend), at: e.timeStamp }
      this.cameraMoved()
    } else if (this.drag.kind === 'piece' && this.drag.id) {
      const n = this.byId.get(this.drag.id)!
      const [wx, wy] = this.toWorld(x, y)
      n.x = n.tx = n.townX = wx - (this.drag.ox ?? 0)
      n.y = n.ty = n.townY = wy - (this.drag.oy ?? 0)
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
    this.pressed = null
    this.invalidate()
    if (!d) return
    if (d.moved) this.canvas.style.cursor = 'default'

    if (!d.moved) {
      // Far out, the company is an island with its name. Pressing it, or its name, comes back to the whole map.
      if (this.far >= 0.6) {
        const b = this.landBox()
        const name = this.companyLabel()
        if (b) {
          const [ax, ay] = this.toScreen(b.minX, b.minY)
          const [bx, by] = this.toScreen(b.maxX, b.maxY)
          const onIsland = x > ax - 24 && x < bx + 24 && y > ay - 24 && y < by + 24
          const onName = !!name && x > name.x - name.w / 2 - 8 && x < name.x + name.w / 2 + 8 && y > name.y - 20 && y < name.y + 8
          if (onIsland || onName) {
            this.fit(true)
            return
          }
        }
      }
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
      // Let go while moving, it carries on and slows. Let go after stopping, it stays.
      const v = this.dragVel
      const fresh = e.timeStamp - v.at < 50
      const speed = Math.hypot(v.vx, v.vy)
      if (fresh && speed > 0.25 && !this.reducedMotion && !this.pointers.size) {
        const top = Math.min(speed, 4.5) / speed
        this.glide = { vx: v.vx * top, vy: v.vy * top }
      }
      this.cameraMoved()
    }
  }

  private onLeave = () => {
    this.cb.itemHover?.(null, 0, 0)
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
    this.handOver()
    this.zoomAt(x, y, e.shiftKey ? 1 / 2 : 2, 240)
  }

  /**
   * As in Miro and Figma: two fingers on a trackpad move the map, a pinch zooms, and a mouse wheel zooms about the pointer. With
   * ⌘ or ctrl held, scrolling zooms whatever sent it. Which kind a gesture is gets decided on its first event and held until the
   * wheel has been still for a moment, so a swipe that wanders doesn't flip between moving and zooming.
   */
  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    this.handOver()
    const [x, y] = this.localPoint(e)
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.h : 1
    const dx = e.deltaX * unit
    const dy = e.deltaY * unit
    if (e.ctrlKey || e.metaKey) {
      // Safari sends its own gestures for a pinch; a wheel event alongside one would zoom twice.
      if (this.pinching) return
      // A pinch on a trackpad arrives as ctrl+wheel in small, fractional steps, and follows the fingers exactly. ⌘ or ctrl with a
      // mouse wheel arrives in whole notches, and those glide like any other notch.
      const notch = e.deltaMode !== 0 || (Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40)
      if (notch) this.zoomAt(x, y, Math.exp(-clamp(dy, -240, 240) * WHEEL_ZOOM), NOTCH_MS)
      else this.zoomAt(x, y, Math.exp(-clamp(dy, -60, 60) * PINCH_ZOOM), 0)
      this.scheduleLabels(140)
      return
    }
    const g = this.wheelGesture
    if (!g || e.timeStamp - g.at > WHEEL_GESTURE_GAP) this.wheelGesture = { kind: wheelKind(e), at: e.timeStamp }
    else {
      g.at = e.timeStamp
      // Sideways movement is something only fingers do, so a gesture that shows any is a trackpad's, whatever its first event looked like.
      if (dx && g.kind === 'notch' && e.deltaMode === 0) g.kind = 'pan'
    }
    if (e.shiftKey || this.wheelGesture!.kind === 'pan') {
      this.zoomGoal = null
      const sx = e.shiftKey && !dx ? dy : dx
      this.cam = this.bounded({ k: this.cam.k, x: this.cam.x - sx, y: this.cam.y - (e.shiftKey ? 0 : dy) })
      this.cameraMoved()
      return
    }
    // A mouse wheel's notch zooms about the point under the pointer, and glides.
    this.zoomAt(x, y, Math.exp(-clamp(dy, -240, 240) * WHEEL_ZOOM), NOTCH_MS)
    this.scheduleLabels(140)
  }

  /** Whether the map is what this page is showing, so a pinch belongs to it. */
  private showing(): boolean {
    return this.canvas.isConnected && this.w > 0 && this.nodes.length > 0 && !document.querySelector('.scrim')
  }

  /** A pinch, or ⌘ or ctrl and a wheel, that starts over something floating on the map zooms the map. */
  private onPageWheel = (e: WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.target === this.canvas || !this.showing() || this.pinching) return
    e.preventDefault()
    this.onWheel(e)
  }

  /** Safari's pinch: a scale that grows from 1 while the fingers move, about the point between them. */
  private pinching = false
  private gestureScale = 1
  private onGesture = (e: Event & { scale?: number; clientX?: number; clientY?: number }) => {
    if (!this.showing()) return
    e.preventDefault()
    // On a touch screen the fingers' own pointers already pinch the map; the gesture is only stopped from zooming the page.
    if (this.pointers.size >= 2 || this.drag?.kind === 'pinch') return
    if (e.type === 'gesturestart') {
      this.pinching = true
      this.gestureScale = 1
      this.handOver()
      return
    }
    if (e.type === 'gestureend') {
      this.pinching = false
      this.scheduleLabels(140)
      return
    }
    const scale = e.scale ?? 1
    if (scale > 0 && this.gestureScale > 0) {
      const x = (e.clientX ?? this.w / 2) - this.origin.left
      const y = (e.clientY ?? this.h / 2) - this.origin.top
      this.zoomAt(x, y, scale / this.gestureScale, 0)
    }
    this.gestureScale = scale
  }

  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (t && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName)) return
    if (t?.isContentEditable || t?.closest?.('[role="menu"], [role="dialog"], [role="listbox"]')) return
    // The arrows move the map, as on any map, a step at a time, gliding. With shift, a bigger step.
    const arrow = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key]
    if (arrow && e.type === 'keydown' && !e.metaKey && !e.ctrlKey && !e.altKey && this.nodes.length && !e.defaultPrevented) {
      e.preventDefault()
      this.handOver()
      const step = (e.shiftKey ? 0.45 : 0.15) * Math.min(this.w, this.h)
      const base = this.camTarget ?? this.cam
      const to = this.bounded({ k: base.k, x: base.x + arrow[0] * step, y: base.y + arrow[1] * step })
      if (this.reducedMotion) this.cam = to
      else this.camTarget = to
      this.cameraMoved()
      return
    }
    if (e.code !== 'Space') return
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
    // After a pause, the first frame is a frame's worth, not the whole pause, so nothing jumps.
    const dt = Math.min(34, now - (this.lastFrame || now - 16))
    this.lastFrame = now
    const moving = this.step(dt, now)
    if (this.camMoving) {
      this.camMoving = false
      // What was under the pointer before the map moved isn't under it now. A hover left over from before a zoom would pull an item
      // out of its line and print it over the next view, so pointing waits until the pointer moves again.
      if (this.hovered && !this.drag) {
        this.hovered = null
        this.cb.itemHover?.(null, 0, 0)
        this.scheduleLabels(140)
      }
      // Names come and go with the zoom while it moves, rather than all at once when it stops. Placing them is cheap; it's only text widths.
      if (Math.abs(Math.log(this.cam.k / (this.placedK || this.cam.k))) > ZOOM_STEP && now - this.placedAt > 40) this.placeLabels()
      // The page hears where the camera is going, once a frame: the zoom's figure and whether the map has been moved.
      const k = this.camTarget?.k ?? this.zoomGoal?.k ?? this.cam.k
      const said = `${k.toFixed(4)}|${this.fitK.toFixed(4)}|${this.touched}`
      if (said !== this.reported) {
        this.reported = said
        this.cb.cameraChanged(k, this.fitK)
      }
      const where = this.whereNow()
      if (where !== this.whereSaid) {
        this.whereSaid = where
        this.cb.whereChanged?.(where)
      }
    }
    // Back where the whole map fits, by any route, it's the whole map again: "Whole map" has nowhere to bring you back from.
    if (!moving && this.touched && !this.drag && !this.zoomGoal && !this.glide && !this.camTarget && this.nodes.length) {
      const f = this.computeFit(this.dollarOn)
      if (Math.abs(Math.log(this.cam.k / f.k)) < 0.01 && Math.abs(this.cam.x - f.x) < 4 && Math.abs(this.cam.y - f.y) < 4) {
        this.touched = false
        this.userMoved = false
        this.cb.cameraChanged(this.cam.k, this.fitK)
      }
    }
    this.draw(now)
    if (moving) this.invalidate()
  }

  /** Advances all animation. Returns true if anything is still moving. */
  private step(dt: number, now: number): boolean {
    let moving = false
    const follow = (rate: number) => 1 - Math.exp(-dt * rate)

    if (!this.nodes.length && !this.reducedMotion) {
      if (!this.emptySince) this.emptySince = now
      if (now - this.emptySince < EMPTY_MS) moving = true
    }
    if (!this.surveyed && this.nodes.length && this.territories.length && this.w) this.startSurvey(now)
    if (this.survey) {
      if (now - this.survey.start > SURVEY_MS) {
        this.survey = null
        this.landLayer = null
      } else moving = true
    }

    // Everything that's rearranging goes on one clock: marks, names, land and the camera.
    if (this.rearranging) {
      this.rearrangeT = clamp((now - this.rearranging.start) / REARRANGE_MS, 0, 1)
      const e = EASE(this.rearrangeT)
      if (this.camTarget) {
        const from = this.centreOf(this.rearranging.camFrom)
        const to = this.centreOf(this.camTarget)
        const k = Math.exp(lerp(Math.log(this.rearranging.camFrom.k), Math.log(this.camTarget.k), e))
        this.cam = this.camAt(lerp(from.x, to.x, e), lerp(from.y, to.y, e), k)
        this.camMoving = true
        if (this.rearrangeT >= 1) {
          this.cam = { ...this.camTarget }
          this.camTarget = null
        }
      }
      if (this.rearrangeT >= 1) {
        this.rearranging = null
        this.landLayer = null
        for (const n of this.nodes) {
          n.fromX = NaN
          n.fromY = NaN
        }
        this.scheduleLabels(0)
      }
      moving = true
    }

    if (this.fresh.size) {
      for (const [id, at] of this.fresh) if (now - at > FRESH_HOLD_MS + FRESH_FADE_MS) this.fresh.delete(id)
      moving = true
    }

    // What the pointer is on answers in a moment, and lets go in a moment.
    const pointing = this.hovered ?? this.pressed
    if (pointing && !this.washes.has(pointing)) this.washes.set(pointing, 0)
    for (const [id, a] of this.washes) {
      const target = id === pointing && !this.drag?.moved ? 1 : 0
      const next = this.reducedMotion ? target : target > a ? Math.min(1, a + dt / 90) : Math.max(0, a - dt / 140)
      if (next !== a) moving = true
      if (next <= 0 && !target) this.washes.delete(id)
      else this.washes.set(id, next)
    }
    for (const t of this.territories) {
      const a = this.hotAreas.get(t.gate) ?? 0
      const target = this.hoverGate === t.gate || this.dropGate === t.gate ? 1 : 0
      if (a === target) continue
      const next = this.reducedMotion ? target : target > a ? Math.min(1, a + dt / 110) : Math.max(0, a - dt / 170)
      this.hotAreas.set(t.gate, next)
      moving = true
    }

    if (this.zoomGoal && this.camTarget) this.zoomGoal = null
    if (this.zoomGoal) {
      const z = this.zoomGoal
      // In proportion: the same share of the way each frame, in the logarithm of the zoom, with the same point held under the pointer.
      const near = Math.abs(Math.log(this.cam.k / z.k)) < 0.0015
      const k = near ? z.k : Math.exp(lerp(Math.log(this.cam.k), Math.log(z.k), 1 - Math.exp(-dt / (z.ms / 3))))
      this.cam = this.bounded({ k, x: z.sx - z.wx * k, y: z.sy - z.wy * k })
      this.camMoving = true
      if (near) {
        this.zoomGoal = null
        this.scheduleLabels(0)
      } else moving = true
    }

    if (this.glide) {
      const g = this.glide
      const before = this.cam
      this.cam = this.bounded({ k: before.k, x: before.x + g.vx * dt, y: before.y + g.vy * dt })
      const decay = Math.exp(-dt / GLIDE_MS)
      // Up against the edge of where the map may go, it stops there rather than pressing on.
      g.vx = this.cam.x === before.x + g.vx * dt ? g.vx * decay : 0
      g.vy = this.cam.y === before.y + g.vy * dt ? g.vy * decay : 0
      this.camMoving = true
      if (Math.hypot(g.vx, g.vy) < 0.012) this.glide = null
      else moving = true
    }

    if (this.camTarget && !this.rearranging) {
      // A flight: the middle of the view travels and the zoom changes in proportion, so a long way in or out doesn't swoop.
      const f = follow(0.012)
      const t = this.camTarget
      const lk = lerp(Math.log(this.cam.k), Math.log(t.k), f)
      const k = Math.exp(lk)
      const from = this.centreOf(this.cam)
      const to = this.centreOf(t)
      this.cam = this.camAt(lerp(from.x, to.x, f), lerp(from.y, to.y, f), k)
      this.camMoving = true
      if (Math.abs(Math.log(this.cam.k / t.k)) < 0.0015 && Math.abs(this.cam.x - t.x) < 0.3 && Math.abs(this.cam.y - t.y) < 0.3) {
        this.cam = { ...t }
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

    const liveTarget = this.liveLevel(this.data)
    if (this.liveT !== liveTarget) {
      const s = dt / 900
      this.liveT = this.reducedMotion ? liveTarget : liveTarget > this.liveT ? Math.min(liveTarget, this.liveT + s) : Math.max(liveTarget, this.liveT - s)
      moving = true
    }

    const subTarget = this.subtotalsOn ? 1 : 0
    if (this.subtotalsT !== subTarget) {
      const s = dt / 220
      this.subtotalsT = this.reducedMotion ? subTarget : subTarget > this.subtotalsT ? Math.min(1, this.subtotalsT + s) : Math.max(0, this.subtotalsT - s)
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

    // Zoomed far out, the land is too small for what's on it, so the map takes one of three forms: what's on the land gathered into
    // lines; each county's name alone; the island with the company's name. Each is chosen with a little give either way, and changes
    // on a clock, so a map left at any zoom is wholly one form and never half way between two.
    const span = this.landSpan()
    if (this.farLevel === 0 && span < 500) this.farLevel = 1
    else if (this.farLevel >= 1 && span > 530) this.farLevel = 0
    if (this.farLevel === 1 && span < 240) this.farLevel = 2
    else if (this.farLevel === 2 && span > 260) this.farLevel = 1
    const toward = (v: number, target: number) => (this.reducedMotion ? target : target > v ? Math.min(target, v + dt / 180) : Math.max(target, v - dt / 180))
    const far = toward(this.far, this.farLevel >= 1 ? 1 : 0)
    const farAreas = toward(this.farAreas, this.farLevel >= 2 ? 1 : 0)
    if (far !== this.far || farAreas !== this.farAreas) moving = true
    this.far = far
    this.farAreas = farAreas

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

  /** Only what you've opened quiets the rest of the map. Pointing at something in passing leaves it alone. */
  private activeNeighbours(): Set<string> | null {
    const focus = this.selected
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
    // Gathering up, they're gone in the first half, before the lines they gather into come up, so the two are never on one spot.
    if (this.lodT < 1 && !(n.inOverview || neighbours?.has(n.piece.id) || n.piece.id === this.hovered || this.highlight?.has(n.piece.id) || (this.dollarOn && n.cost))) a *= clamp(this.lodT * 2 - 1, 0, 1)
    // Prices are about what has a price. A faded mark under a disc only looks like dirt.
    // What needs you stays, as its pin: amber means urgent at every zoom and in every view.
    if (this.dollarOn && !n.cost && !this.pinOf(n)) a = 0
    // Far out, only what needs you stays, as a dot, so an island still says whether anything on it is asking.
    if (!this.pinOf(n)) a *= 1 - this.far
    // A tool the reader still gets the name and price of stays, a step back, so it reads as all they get from here.
    a *= this.throughSeal(n) ? 1 - 0.28 * this.sealOf(n.piece.gate) : 1 - this.sealOf(n.piece.gate)
    if (this.highlight) a *= this.highlight.has(n.piece.id) ? 1 : 0.14
    else if (neighbours && !this.dollarOn) a *= neighbours.has(n.piece.id) ? 1 : 0.34
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
        const disc = world(towns ? townRadius(inMain ? n.month : null) * this.discScale() : Math.max(16, Math.min(soundingRadius(inMain ? (n.month ?? 0) : 0, this.summary?.biggest ?? 0), 62)))
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
      // Pushed straight at each other by a shore behind each, two discs can stay wedged one above the other. The smaller slides sideways until they're clear, if there's land for it there.
      if (towns) {
        const gap = world(4)
        const under = world(19)
        const fits = (it: (typeof items)[number], x: number, y: number) => {
          for (let a = 0; a < 12; a++) if (!t.onLand(x + Math.cos((a / 6) * Math.PI) * it.disc, y + Math.sin((a / 6) * Math.PI) * it.disc)) return false
          if (!t.onLand(x - it.nameHalf, y + it.disc + under) || !t.onLand(x + it.nameHalf, y + it.disc + under)) return false
          return items.every((o) => o === it || Math.hypot(o.x - x, o.y - y) >= o.disc + it.disc + gap - 0.01)
        }
        for (const big of [...items].sort((a, b) => b.disc - a.disc)) {
          for (const small of items) {
            if (small === big || small.disc > big.disc || Math.hypot(small.x - big.x, small.y - big.y) >= big.disc + small.disc) continue
            const need = big.disc + small.disc + gap
            search: for (const rise of [0, world(8), world(16), world(24)]) {
              const y = small.y - rise
              if (Math.abs(y - big.y) >= need) continue
              const across = Math.sqrt(need * need - (y - big.y) ** 2)
              for (const x of [big.x + across, big.x - across].sort((a, b) => Math.abs(a - small.x) - Math.abs(b - small.x))) {
                if (fits(small, x, y)) {
                  small.x = x
                  small.y = y
                  break search
                }
              }
            }
          }
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
    if (!inMain) return 6 * this.priceGrowth()
    return soundingRadius(n.month ?? 0, biggest) * this.priceGrowth()
  }

  private townScreenRadius(n: Node): number {
    const inMain = n.cost?.currency === this.data.currency
    return townRadius(inMain ? n.month : null) * this.discScale() * this.priceGrowth()
  }

  /**
   * How big discs are drawn against their classes. A small window fits the map smaller, so the same discs fill more of each county,
   * until they can't be pushed apart on their own land. There they're drawn smaller, all by the same share, so their sizes still compare.
   */
  /**
   * How much bigger prices print than when the map is whole: with the zoom, so a disc stays the town it stands on, but only to a
   * point. Close in, a disc the size of the window says nothing a smaller one doesn't, and covers what you came close to read.
   */
  private priceGrowth(): number {
    return Math.min(this.cam.k / this.fitK, 2.5)
  }

  private discScale(): number {
    return clamp(this.fitK / 0.4, 0.6, 1)
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

  /** Wrapping text is the slow part of placing labels, and a title rarely changes. Its width is a count, at whatever size it's set (see textW). */
  private labelFor(title: string, font: string) {
    let wrapped = this.labelCache.get(title)
    if (!wrapped) {
      wrapped = wrapTitle(title)
      if (this.labelCache.size > 4000) this.labelCache.clear()
      this.labelCache.set(title, wrapped)
    }
    return {
      lines: wrapped.lines,
      cut: wrapped.cut,
      width: Math.max(...wrapped.lines.map((line) => this.textW(line, font))),
      wholeWidth: this.textW(title, font),
    }
  }

  private measure(text: string, font: string): number {
    this.ctx.font = font
    return this.ctx.measureText(text).width
  }

  /**
   * A width without asking the canvas. The face gives every character 0.6 of its size, so a width is a count, and the map can place
   * its names at any size, every frame, for nothing. Anything outside the scripts the face draws comes from another face, so that's measured.
   */
  private textW(text: string, font: string): number {
    if (!MONO_SAFE.test(text)) return this.measure(text, font)
    const px = Number(font.match(/([\d.]+)px/)?.[1] ?? 12)
    let n = 0
    for (const _ of text) n++
    return n * 0.6 * px
  }

  private placeLabels() {
    if (!this.w) return
    this.placedAt = performance.now()
    this.placedK = this.cam.k
    const rects: { x: number; y: number; w: number; h: number; heading?: boolean }[] = []
    // Where a name goes depends on the map and the zoom, never on where the screen's edges or the panels are: pan, and every name
    // moves with its land and stays as it was. One that runs off the screen runs off, and one under a panel is under it, as on any canvas.
    const free = (r: { x: number; y: number; w: number; h: number }) => !rects.some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y)
    const onScreen = free

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
    const settled = (n: Node): [number, number] => this.toScreen(overview && n.inOverview ? n.ovx : n.tx, (overview && n.inOverview ? n.ovy : n.ty) - this.sealLift(n))

    // Symbols are obstacles too: a label must never sit on top of another piece.
    const tile = tileSize(k)
    const icon = iconSize(k)
    const marks: { id: string; x: number; y: number; w: number; h: number }[] = []
    for (const n of this.nodes) {
      if (this.sealedOff(n) || !stands(n)) continue
      const [x, y] = settled(n)
      const half = (n.piece.kind === 'service' ? tile : icon) / 2 + 1
      const box = { x: x - half, y: y - half, w: half * 2, h: half * 2 }
      rects.push(box)
      marks.push({ id: n.piece.id, ...box })
    }
    // Each kind's name, or its line when zoomed out, holds its place on the land.
    const headingRects: { x: number; y: number; w: number; h: number; heading: boolean }[] = []
    for (const d of this.districts) {
      if ((this.sealTarget.has(d.gate) && !this.pendingSeal.has(d.gate)) || (!overview && !d.named) || (overview && d.hidden)) continue
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
    const SUB_FONT = `${subSize(k)}px ${this.sans}`
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
    const subLeading = Math.round(subSize(k) * 1.5)
    // How far words starting here can run before they meet something already placed in the band from top to bottom.
    const bandRoom = (from: number, top: number, bottom: number) => {
      let limit = Infinity
      for (const r of rects) if (r.y < bottom && r.y + r.h > top && r.x + r.w > from + 4) limit = Math.min(limit, r.x > from - 4 ? r.x - 18 : from)
      return limit - from
    }
    // How far an item's words can run down before they meet the next thing below them, or the shore.
    const roomDown = (id: string, gate: string, from: number, to: number, top: number) => {
      let limit = top + 60 * subLeading
      for (const m of marks) if (m.id !== id && m.x < to && m.x + m.w > from - 24 && m.y > top - 4) limit = Math.min(limit, m.y - 10)
      for (const r of headingRects) if (r.x < to && r.x + r.w > from && r.y > top - 4) limit = Math.min(limit, r.y - 8)
      for (let at = top + 20; at < limit; at += 20) {
        if (!onLand(gate, from + 2, from + 2, at)) {
          limit = at - 20
          break
        }
      }
      return limit - top
    }
    // How far an item's one line can run before it meets the next item along, or the shore.
    const roomFrom = (id: string, gate: string, from: number, y: number) => {
      let limit = Infinity
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
      if (this.sealedOff(n)) continue
      const [x, y] = settled(n)
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
        // Close in, there's room to say what it is as well as what it's called. Waiting to be sorted they stand too close for it, and the words only run into the next item.
        if (near && align === 'left' && !overview && n.piece.summary && n.piece.gate !== 'arrivals') {
          const raised = cy - 6.5
          const nameTop = raised - 10
          // As far as it can run: to the next mark or the shore on its row, to whatever's already placed beside it, and no further than a comfortable line.
          // On a phone, never wider than the screen: it depends on the window, not where the camera is, so a pan still moves nothing.
          const room = Math.min(roomFrom(n.piece.id, n.piece.gate, cx, y), 64 * 0.6 * subSize(k), this.w - 48, bandRoom(cx, nameTop, nameTop + 14 + extra + leading))
          if (room >= 72) {
            // Closer still, it says all of what it is, and then what's in it: as much as fits before the next thing down, so a map you've come right up to reads like the page it came from.
            if (k >= READ_LINES_K) {
              const top = raised + extra + leading - 10
              const down = roomDown(n.piece.id, n.piece.gate, cx, cx + room, top)
              const wide = Math.min(room, bandRoom(cx, nameTop, top + down))
              const fit = Math.floor((down - 4) / subLeading)
              const reading = wide >= 72 && fit >= 2 ? this.readingLines(n.piece, SUB_FONT, wide, k >= READ_K) : []
              if (reading.length > 1) {
                const shown = this.cutLines(reading, fit)
                const across = Math.max(...shown.map((line) => this.textW(line, SUB_FONT)))
                const box = { x: rect.x, y: nameTop, w: Math.max(rect.w, across + 4), h: 14 + extra + leading + (shown.length - 1) * subLeading }
                if (free(box)) {
                  rects.push(box)
                  next.set(n.piece.id, { id: n.piece.id, x: cx - x, y: raised - y, align, name: true, lines, sub: shown[0], more: shown.slice(1) })
                  return
                }
              }
            }
            const sub = this.fitLine(n.piece.summary, SUB_FONT, room)
            if (sub) {
              const box = { x: rect.x, y: nameTop, w: Math.max(rect.w, this.textW(sub, SUB_FONT) + 4), h: 14 + extra + leading }
              if (free(box)) {
                rects.push(box)
                next.set(n.piece.id, { id: n.piece.id, x: cx - x, y: raised - y, align, name: true, lines, sub })
                return
              }
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
      // A mark with no name beside it looks broken, so before a one-line name gives up it tries two lines, to the right of its mark, where its column reads.
      if (!placed && lines.length === 1 && !whole && n.piece.title.includes(' ')) {
        const words = n.piece.title.split(' ')
        let at = 1
        for (let i = 1; i < words.length; i++) if (Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length) < Math.abs(words.slice(0, at).join(' ').length - words.slice(at).join(' ').length)) at = i
        const two = [words.slice(0, at).join(' '), words.slice(at).join(' ')]
        const w2 = Math.max(...two.map((l) => this.textW(l, FONT))) * (pin ? 1.04 : 1)
        const cx = x + off
        const cy = y + 4 - leading / 2
        const rect = { x: cx - 2, y: cy - 10, w: w2 + 4, h: 14 + leading }
        if (free(rect)) {
          rects.push(rect)
          next.set(n.piece.id, { id: n.piece.id, x: cx - x, y: cy - y, align: 'left', name: true, lines: two })
          continue
        }
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
        keep.push({ ...l, sub: undefined, more: undefined, lines: undefined, ...n, target: 1 })
        next.delete(l.id)
      } else {
        l.target = 0
        if (l.alpha > 0) keep.push(l)
      }
    }
    for (const n of next.values()) keep.push({ ...n, alpha: this.appeared ? 0 : 1, target: 1 })
    this.labels = keep
  }

  /**
   * What an item says when the map is close: its summary, wrapped, and with `body`, what's in it, as plain lines. A blank line between
   * paragraphs. Cached by the piece's words and the width, because the map asks for it every time it places names.
   */
  private readingLines(piece: Piece, font: string, width: number, body: boolean): string[] {
    const per = Math.max(12, Math.floor(width / (0.6 * Number(font.match(/([\d.]+)px/)?.[1] ?? 12))))
    const key = `${piece.id}|${piece.updatedAt}|${per}|${body}`
    const got = this.readCache.get(key)
    if (got) return got
    if (this.readCache.size > 600) this.readCache.clear()
    const out = wrapWords(piece.summary, per)
    if (body) {
      for (const para of plainParagraphs(piece.body)) {
        // The summary is often the body's first sentence. Saying it twice wastes the room.
        if (out.length && para.startsWith(piece.summary.replace(/[.…]+$/, ''))) continue
        out.push('', ...wrapWords(para, per))
      }
    }
    this.readCache.set(key, out)
    return out
  }

  /** At most `n` lines, ending on words, with an ellipsis where it stops short. A paragraph's gap is never the last line. */
  private cutLines(lines: string[], n: number): string[] {
    if (lines.length <= n) return lines
    const kept = lines.slice(0, n)
    while (kept.length > 1 && !kept[kept.length - 1]) kept.pop()
    kept[kept.length - 1] = `${kept[kept.length - 1].replace(/[\s,;:.…]+$/, '')}…`
    return kept
  }

  /** A line of text cut to fit, at a word if it can be. Cached by how much room there was, near enough. */
  private fitLine(text: string, font: string, room: number): string {
    const bucket = Math.floor(room / 8) * 8
    const key = `${bucket}|${font}|${text}`
    const got = this.subCache.get(key)
    if (got !== undefined) return got
    if (this.subCache.size > 2000) this.subCache.clear()
    let out = text
    if (this.textW(text, font) > bucket) {
      let lo = 0
      let hi = text.length
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        if (this.textW(`${text.slice(0, mid).trimEnd()}…`, font) <= bucket) lo = mid
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
          const dx = Math.max(o.x - hx, 0, hx - (o.x + o.w))
          const dy = Math.max(o.y - hy, 0, hy - (o.y + o.h))
          // And a kind's name gets a little air: a head touching its first letter reads as one blob.
          if (Math.hypot(dx, dy) < r + (o.heading ? 6 : 0)) {
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
  /**
   * How far a kind's name stands above its first row, on the screen. It moves with the land, but only up to a little over its own
   * size: close in, where type stops growing, a heading in world units would float off its column.
   */
  private headingRise(above: number, k: number): number {
    return Math.min(above * k, above * DESIGN_K * (NAME_MAX / 12) * 1.3 * magnify(k))
  }

  private districtPos(d: District, detail: number): [number, number] {
    const k = this.cam.k
    const [hx, top] = this.toScreen(d.minX, d.minY)
    const hy = top - this.headingRise(d.above, k)
    const x = hx - tileSize(k) / 2
    if (detail >= 1) return [x, hy]
    const [lx, ly] = this.toScreen(d.lx, d.ly)
    return [lerp(lx, x, detail), lerp(ly, hy, detail)]
  }

  private districtWidth(d: District): number {
    return this.measure(d.def.name, this.districtFont())
  }

  private districtFont(): string {
    // The same size as the names under it: a heading differs by weight and ink, so a county doesn't read as a stack of subheads.
    return `500 ${nameSize(this.cam.k)}px ${this.sans}`
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
    // A pinned thing takes one row here, like anything else. Two lines of name take a little more.
    const pinRow = (n: Node) => Math.max(pitch, this.labelFor(n.piece.title, nameFont).lines.length * leadingAt(k) + 4)
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
            // Where they can't all stand, the last place says how many more, so a tool never just isn't there.
            const room = across * maxRows
            const shown = logos.length > room ? logos.slice(0, room - 1) : logos
            const extra = logos.length - shown.length
            const rows = Math.ceil((shown.length + (extra ? 1 : 0)) / across)
            // The last pinned name hangs below its mark's middle, so it needs a little more.
            const h = header + rows * pitch + pinned.reduce((sum, n) => sum + pinRow(n), 0)
            return { d, x: left, y: 0, lineW, pinned, bare, header, across, shown, extra, rows, w: Math.max(lineW, Math.min(across, shown.length + (extra ? 1 : 0)) * pitch, pinnedW), h }
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
      // What there's no room for still gets its name, so a kind doesn't just vanish. Zoom in or open the area, and it's there.
      const unsaid = here.filter((d) => d.hidden)
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
      for (const d of here) d.more = undefined
      for (const { d, x, y, lineW, h, shown, extra, across, rows, pinned, header } of boxes) {
        d.lx = x / k
        d.ly = y / k
        d.lw = lineW
        d.lh = h
        if (extra) d.more = { x: (x + tile / 2 + (shown.length % across) * pitch) / k, y: (y - 12 + header + 1 + tile / 2 + Math.floor(shown.length / across) * pitch) / k, n: extra }
        shown.forEach((n, i) => {
          n.inOverview = true
          n.ovx = (x + tile / 2 + (i % across) * pitch) / k
          n.ovy = (y - 12 + header + 1 + tile / 2 + Math.floor(i / across) * pitch) / k
        })
        let below = 0
        pinned.forEach((n) => {
          n.inOverview = true
          n.ovx = (x + tile / 2) / k
          const row = pinRow(n)
          n.ovy = (y - 12 + header + rows * pitch + below + row / 2) / k
          below += row
        })
      }
      if (unsaid.length) {
        // Said the way every other kind on the land is said, a name and how many, only without a row of its own.
        const parts = unsaid.map((d) => ({ icon: d.def.icon, text: `${d.def.name} ${d.members.length}` }))
        const said = parts.map((part) => part.text).join('  ')
        // Every kind is counted, and the rest is said one way everywhere: the kinds with their numbers, or how many more items.
        // Never a list of kinds with no numbers, and never a bare "4 more", which beside "Rules 4" reads as four more rules.
        const more = unsaid.reduce((sum, d) => sum + d.members.length, 0)
        const shortest = more === 1 ? '+1 item' : `+${more} items`
        const lowest = boxes.reduce((most, b) => (b.y + b.h > most.y + most.h ? b : most), boxes[0])
        // A line takes only its own width on its own row, and what hangs under it takes the rows below.
        const taken = boxes.flatMap((b) => [
          ...(b.header ? [{ x: b.x, y: b.y - 12, w: b.lineW, h: b.header - 2 }] : []),
          ...(b.h > b.header ? [{ x: b.x, y: b.y - 12 + b.header, w: b.w, h: b.h - b.header }] : []),
        ])
        const free = ({ x, y }: { x: number; y: number }, text: string) => {
          const wide = text === said ? this.partsWidth(parts) : this.measure(text, this.districtFont())
          return (
            [0, 0.5, 1].every((f) => t.onLand((x + (wide + 8) * f) / k, (y + 7) / k)) &&
            !taken.some((r) => x < r.x + r.w + 8 && x + wide > r.x && y + 3 > r.y && y - 9 < r.y + r.h)
          )
        }
        // Under everything if that's land. If not, beside a line, the lowest that has room, so it can't land on a name.
        const lines = boxes.filter((b) => !b.bare).reverse()
        const spots = [{ x: left + dx, y: (lowest ? lowest.y - 12 + lowest.h : start + dy) + 13 }, ...lines.map((b) => ({ x: b.x + b.lineW + 12, y: b.y }))]
        // The names if they fit, and how many if only that does, so a kind is never gone with no word.
        const whole = spots.find((s) => free(s, said))
        const tight = whole ? null : spots.find((s) => free(s, shortest))
        if (whole) this.unsaid.set(gate, { ...whole, text: said, parts })
        else if (tight) this.unsaid.set(gate, { ...tight, text: shortest })
        // Nowhere it's clear of everything: still said, at the foot of the block, because a kind gone with no word understates the map.
        else this.unsaid.set(gate, { ...spots[0], text: shortest })
      } else this.unsaid.delete(gate)
    }
  }

  /** How wide a run of kinds is, each with its icon, as the zoomed-out lines draw them. */
  private partsWidth(parts: { icon: PieceKind; text: string }[]): number {
    const font = this.districtFont()
    return parts.reduce((sum, part, i) => sum + (i ? 14 : 0) + LINE_ICON + this.measure(part.text, font), 0)
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
    // And every disc is one for every other disc's words: a name on a neighbour's rim reads as the neighbour's.
    const discs = towns
      ? services.map((n) => {
          const [x, y] = this.toScreen(n.townX, n.townY)
          return { id: n.piece.id, x, y, r: this.townScreenRadius(n) + 4 }
        })
      : []
    const offDiscs = (id: string, rect: { x: number; y: number; w: number; h: number }) =>
      discs.every((d) => {
        if (d.id === id) return true
        const nx = clamp(d.x, rect.x, rect.x + rect.w)
        const ny = clamp(d.y, rect.y, rect.y + rect.h)
        return Math.hypot(nx - d.x, ny - d.y) >= d.r
      })
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
      const text = this.priceText(n.cost!)
      // A thing to check carries a small mark after the figure, which needs room too.
      const w = this.measure(text, font) + (this.data.priceChecks.has(n.piece.id) ? 12 : 0)
      let placed: [number, number, CanvasTextAlign, boolean] | null = null

      if (towns) {
        const fits = w + 8 < r * 2
        const left = x - w / 2
        if (fits) {
          placed = [x, y + 4, 'center', false]
        } else {
          // Under its own disc, or over it where under would sit on a neighbour.
          const under = { x: left - 2, y: y + r + 2, w: w + 4, h: 15 }
          placed = offDiscs(n.piece.id, under) ? [x, y + r + 13, 'center', false] : [x, y - r - 6, 'center', false]
        }
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
        const above = f.y < -r ? f.y - 15 : -r - 8
        candidates = [
          [x, y + below, 'center'],
          [x, y + above, 'center'],
        ]
      } else {
        candidates = [
          [fx, fy + 13, f.align],
          [fx, fy - 15, f.align],
        ]
      }
      for (const [cx, cy, align] of candidates) {
        const left = align === 'left' ? cx : align === 'right' ? cx - w : cx - w / 2
        const rect = { x: left - 1, y: cy - 9, w: w + 2, h: 12 }
        // A name keeps a character's width from its neighbours, so two names never run together as one.
        const roomy = { x: rect.x - 6, y: rect.y, w: rect.w + 12, h: rect.h }
        if (free(roomy) && offDiscs(n.piece.id, rect)) {
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
    return `${size}px ${this.sans}`
  }

  /** Where an area's name starts, closer in: on its own land, flush with what's under it. */
  private gateLabelBase(t: Territory): [number, number] {
    const k = this.cam.k
    const [x, y] = this.toScreen(t.nameX, t.nameY)
    const first = this.districts.filter((d) => d.gate === t.gate && d.named).sort((a, b) => a.minY - b.minY)[0]
    // Over the first kind's name and the line that says who can read it.
    const above = (first ? this.headingRise(first.above, k) + 28 : 26) + 18
    return [x - tileSize(k) / 2, y - above]
  }

  /** Where it is now. Zoomed out, it moves with the block it heads, into the middle of its land. */
  private gateLabelPos(t: Territory): [number, number] {
    let [x, y] = this.gateLabelBase(t)
    const shift = this.overviewShift.get(t.gate)
    if (shift) {
      const gathered = (1 - EASE(this.lodT)) * (1 - EASE(this.dollarT))
      x += shift.x * this.cam.k * gathered
      y += shift.y * this.cam.k * gathered
    }
    // A name that's been here before travels with the rest. One that hasn't comes in at the end.
    const was = this.rearranging?.names.get(t.gate)
    if (was) {
      const e = EASE(this.rearrangeT)
      const fromX = was.x * this.cam.k + this.cam.x
      const fromY = was.y * this.cam.k + this.cam.y
      return [lerp(fromX, x, e), lerp(fromY, y, e)]
    }
    return [x, y]
  }

  private gateLabelSize() {
    // A phone's counties are narrow, so a name may set a little smaller there before it has to be cut.
    // Out past the whole map the names come down a little with the land, before they give way to the company's.
    const out = clamp(Math.sqrt(this.cam.k / (this.fitK * 0.9)), 0.78, 1)
    return clamp(18.5 + 8 * (this.cam.k - 0.4), this.w <= 720 ? 15.5 : 17, 28) * out
  }

  private nameWidth(name: string): number {
    const size = this.gateLabelSize()
    const font = `${AREA_NAME_WEIGHT} ${size}px ${this.sans}`
    // Tracking goes after every character, the last one too, as the canvas sets it.
    if (MONO_SAFE.test(name)) return this.textW(name, font) + [...name].length * Number((size * AREA_NAME_TRACK).toFixed(1))
    this.ctx.font = font
    const c = this.ctx as CanvasRenderingContext2D & { letterSpacing?: string }
    if ('letterSpacing' in c) c.letterSpacing = `${(size * AREA_NAME_TRACK).toFixed(1)}px`
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
    while (at + STEP < x + 1600) {
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
    while (at + STEP < x + 1600) {
      const [wx, wTop] = this.toWorld(at + STEP, top)
      const [, wBottom] = this.toWorld(at + STEP, bottom)
      if (others.some((o) => o.onLand(wx, wTop) || o.onLand(wx, wBottom))) break
      at += STEP
    }
    return at - x - 6
  }

  /** An area's name, as far as the next area. Its panel always has the whole of it. Once a frame per area, because every label asks. */
  private shownName(t: Territory): string {
    const had = this.shownNames.get(t.gate)
    if (had !== undefined) return had
    const name = this.data.gates.find((g) => g.id === t.gate)?.name ?? ''
    const [x, y] = this.gateLabelPos(t)
    // The small seal or pin gives way to the name, not the other way round: where there's no room beside it, it goes to the end of the line below.
    const room = this.neighbourRoom(t, x, y - 15, y + 3)
    let shown = name
    // "L…" says nothing. A short name stays whole and runs a little long, and a long one keeps enough to recognise.
    // And a name that only just reaches a border stays whole: "Engineeri…" says less than a name touching a dashed line.
    // A phone's land is coarse, and its counties narrow, so a name there may run further toward the border before it's cut.
    if (name.length > 8 && this.nameWidth(name) > room + (this.w <= 720 ? 36 : 14)) {
      let lo = 6
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

  /** What the line under an area's name can say, longest first, and which family of lines it belongs to. Neighbours in one family use the same words for the same fact. */
  private lineFor(gate: string): { family: string; tries: string[]; sealed: boolean; faces: string[]; exposed: boolean } {
    const none = { family: '', sealed: false, faces: [] as string[], exposed: false }
    if (this.data.readOnly) return { ...none, tries: [''] }
    if (this.lensActive) {
      if (!this.sealTarget.has(gate)) return { ...none, tries: ['Can read'] }
      // Still readable out there, so it isn't sealed yet, and vermilion would say it was.
      if (this.pendingSeal.has(gate)) return { ...none, tries: ['Can read until you update'], exposed: true }
      if (!this.data.pricesReadable.has(gate)) return { ...none, tries: ["Can't read"], sealed: true }
      // Money shows each service's name, plan and price, so "prices" alone would understate it. The area's panel spells it out.
      return { ...none, family: 'lens-prices', tries: ["Can't read, except tool names and prices", 'Tool names and prices only', 'Tools and prices only'], sealed: true }
    }
    // Everyone's mark stays beside the warning. The words are about one fact, and the map may never understate who can read.
    const exposed = this.data.exposed.get(gate)
    // Where there's no room for the whole sentence it gets shorter: the marks still say who, and the line at top centre says it in full.
    if (exposed) return { ...none, family: 'exposed', tries: [exposed, 'Still readable until you update', 'Still readable'], exposed: true, faces: this.data.readers.get(gate) ?? [] }
    if (this.data.sealedToAll.has(gate)) {
      // Money lists every service's name and price, so an area of services is only closed apart from those.
      if (!this.data.pricesReadable.has(gate)) return { ...none, family: 'closed', tries: ['No one can read this', 'No readers'], sealed: true }
      // The same words live or not, and at every zoom: whether it's live is the top right's to say.
      return { ...none, family: 'prices', tries: ['Tool names and prices only', 'Tools and prices only'], sealed: true }
    }
    const names = this.data.readers.get(gate) ?? []
    if (!names.length) return { ...none, tries: [''] }
    // Who the area is for, live or not: the sea and the top right say whether it's live, and one word for one fact keeps neighbours in step.
    const lead = 'For'
    // One form for one fact across the whole map. A bare name under a county's name reads as a label for the county, so it's never that: where the line has no room the mark says who, alone.
    // One reader: "For X", or the name alone beside the face where that's all there's room for, never the face alone if a name fits.
    if (names.length === 1) return { ...none, family: 'readers-one', faces: names, tries: [`${lead} ${names[0]}`, names[0]] }
    const shown = names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]} and ${names.length - 1} others`
    // Names when there's room, a count when there isn't. The faces already show who the others are, so there's no "and 1 other" between the two.
    // The count stands alone: "for" or "read by" 2 readers only says readers twice.
    const count = `${names.length} readers`
    return { ...none, family: 'readers', faces: names, tries: [`${lead} ${shown}`, count] }
  }

  /** How short this family's lines have to get for all of them to fit. Once a frame, because every label asks. */
  private familyLevel(family: string): number {
    const had = this.familyLevels.get(family)
    if (had !== undefined) return had
    const font = `12px ${this.sans}`
    let level = 0
    for (const t of this.territories) {
      const line = this.lineFor(t.gate)
      if (line.family !== family || line.tries.length < 2) continue
      const [x, y] = this.gateLabelPos(t)
      const room = this.landRoom(t, x, y + 6, y + 23) - this.facesWidth(line.faces.length)
      const fits = line.tries.findIndex((text) => this.measure(text, font) <= room)
      level = Math.max(level, fits < 0 ? line.tries.length - 1 : fits)
    }
    this.familyLevels.set(family, level)
    return level
  }

  private subtotalText(amount: number, whole: boolean): string {
    const value = this.period === 'year' ? amount * 12 : amount
    const money = value.toLocaleString('en-US', { maximumFractionDigits: 0 })
    const sym = this.data.currency === 'USD' ? '$' : `${this.data.currency} `
    return whole ? `${sym}${money} a ${this.period}` : `${sym}${money}`
  }

  /** What a disc says. No known price says nothing: its dashed rim says there's no price, and a lone dash read as an underscore. */
  private priceText(cost: Cost): string {
    return cost.amount === null ? '' : figure(cost, this.period)
  }

  /** Whether every area's subtotal has room to say "a month" without crossing its coast. All of them do or none does, and the card says per what. */
  private subtotalsFit(): boolean {
    const had = this.familyLevels.get('subtotals')
    if (had !== undefined) return had === 0
    const fits = this.territories.every((t) => {
      const share = this.summary?.byGate.find((b) => b.gate === t.gate)
      if (!share) return true
      const [x, y] = this.gateLabelPos(t)
      return this.measure(this.subtotalText(share.amount, true), `12px ${this.sans}`) <= this.landRoom(t, x, y + 6, y + 22)
    })
    this.familyLevels.set('subtotals', fits ? 0 : 1)
    return fits
  }

  /** The line under an area's name: who can read it, as marks you can see and words you can read. */
  private areaNote(gate: string): { text: string; sealed: boolean; faces: string[]; exposed: boolean } {
    const { family, tries, sealed, faces, exposed } = this.lineFor(gate)
    const out = { sealed, faces, exposed }
    const text = tries[family ? Math.min(this.familyLevel(family), tries.length - 1) : 0]
    const t = this.territories.find((o) => o.gate === gate)
    if (!t || !text) return { ...out, text }
    const [x, y] = this.gateLabelPos(t)
    const font = `12px ${this.sans}`
    const room = this.landRoom(t, x, y + 6, y + 23) - this.facesWidth(faces.length)
    // The land's grid is coarse this far out, so a phone's line gets some margin before it reaches a coast.
    if (this.measure(text, font) <= room - (this.w <= 720 ? 12 : 0)) return { ...out, text }
    // Past a border or a coast it reads as the next county's, so where there are marks they say who, alone.
    // A warning to more than one keeps its words, short as they get, as it did before.
    if (faces.length === 1 || (faces.length > 1 && !exposed)) return { ...out, text: '' }
    // A sealed line is never cut, and never runs into the next county: half a warning reads as a broken one, and one over a neighbour reads as theirs.
    // Where even its shortest form has no room, it isn't said. The hatch, the vermilion name and the seal still say sealed.
    if (sealed) return { ...out, text: '' }
    // With no marks, cut to nothing it would say nothing. Better it runs long.
    return { ...out, text: this.fitLine(text, font, this.neighbourRoom(t, x, y + 6, y + 23) - this.facesWidth(faces.length)) || text }
  }

  private facesWidth(count: number): number {
    return count ? FACE + (count - 1) * FACE_STEP + FACE_GAP : 0
  }

  private noteWidth(note: { text: string; faces: string[] }): number {
    return this.facesWidth(note.faces.length) + (note.text ? this.measure(note.text, `12px ${this.sans}`) : 0)
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

  /** Sets the survey going: where the middle is, how far the land reaches from it, and when each item comes up. */
  private startSurvey(now: number) {
    this.surveyed = true
    if (this.reducedMotion) return
    const minX = Math.min(...this.territories.map((t) => t.minX))
    const maxX = Math.max(...this.territories.map((t) => t.maxX))
    const minY = Math.min(...this.territories.map((t) => t.minY))
    const maxY = Math.max(...this.territories.map((t) => t.maxY))
    // From where the things in the open areas are, on average, so the first marks are the map's own. A sealed county comes in with the wave like any other, and its seal is pressed last.
    // From the name of the open county with the most on it, so the first words up are an open county's and the wave reads outward from a place.
    const counts = new Map<string, number>()
    for (const n of this.nodes) if (!this.data.sealedToAll.has(n.piece.gate)) counts.set(n.piece.gate, (counts.get(n.piece.gate) ?? 0) + 1)
    const busiest = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
    const home = this.territories.find((t) => t.gate === busiest) ?? this.territories[0]
    const cx = home.nameX
    const cy = home.nameY
    const reach = Math.max(Math.hypot(minX - cx, minY - cy), Math.hypot(maxX - cx, minY - cy), Math.hypot(minX - cx, maxY - cy), Math.hypot(maxX - cx, maxY - cy)) || 1
    const k = this.cam.k
    // A front you can see move, not a fog: about 50 px of soft edge on screen, less on a phone.
    const feather = Math.min(reach * 0.1, 56 / k, (0.06 * Math.min(this.w, this.h)) / k)
    this.survey = { start: now, cx, cy, reach, feather }
    // The first map opens in the form its zoom calls for, so the detailed form never shows through on the way to the zoomed-out one.
    if (this.cam.k < DETAIL_K) {
      this.lodT = 0
      this.layoutOverview()
    }
    for (const n of this.nodes) {
      n.alpha = Math.min(n.alpha, this.nodeAlpha(n, null))
      // Appearing runs from 0 to 1 in 280 ms, so starting below 0 is a wait.
      n.appear = -(this.frontAt(Math.hypot(n.tx - cx, n.ty - cy)) + SURVEY_ITEMS.after) / 280
    }
  }

  /** When the ink's front reaches this far from where it started, in world units, in ms from the start. The inverse of the land's spread in drawLandSurveyed. */
  private frontAt(distance: number): number {
    const s = this.survey!
    const share = clamp(distance / (s.reach * 1.08 + s.feather), 0, 1)
    return SURVEY_LAND.at + SURVEY_LAND.for * (1 - Math.pow(1 - share, 1 / 2.4))
  }

  /** How far something at this point on screen has come up, 0 to 1: it starts this long after the ink's front passed it. 1 when there's no survey. */
  private surveyAt(sx: number, sy: number, after: number, length: number): number {
    const s = this.survey
    if (!s) return 1
    const [wx, wy] = this.toWorld(sx, sy)
    const at = this.frontAt(Math.hypot(wx - s.cx, wy - s.cy)) + after
    return EASE(clamp((this.frameNow - s.start - at) / length, 0, 1))
  }

  /** How far the seals have been pressed in the survey, 0 to 1. 1 when there's no survey. */
  private sealPressed(): number {
    const s = this.survey
    if (!s) return 1
    return clamp((this.frameNow - s.start - SURVEY_SEALS.at) / SURVEY_SEALS.for, 0, 1)
  }

  /** A seal's size as it's pressed: down from a little above, a touch past its size, and back. */
  private pressScale(): number {
    const t = this.sealPressed()
    if (t >= 1) return 1
    if (t < 0.62) {
      const a = t / 0.62
      return lerp(1.4, 0.97, a * a)
    }
    return lerp(0.97, 1, (t - 0.62) / 0.38)
  }

  /** The land, inked in from the middle: drawn whole on its own sheet, then cut by a soft-edged circle that grows until it holds everything. */
  private drawLandSurveyed(k: number) {
    const s = this.survey!
    const spread = clamp((this.frameNow - s.start - SURVEY_LAND.at) / SURVEY_LAND.for, 0, 1)
    if (spread >= 1) {
      this.drawLand(k)
      return
    }
    if (spread <= 0) return
    const main = this.ctx
    if (!this.landLayer) this.landLayer = document.createElement('canvas')
    const layer = this.landLayer
    if (layer.width !== this.canvas.width || layer.height !== this.canvas.height) {
      layer.width = this.canvas.width
      layer.height = this.canvas.height
    }
    const sheet = layer.getContext('2d')!
    sheet.setTransform(1, 0, 0, 1, 0, 0)
    sheet.globalCompositeOperation = 'source-over'
    sheet.clearRect(0, 0, layer.width, layer.height)
    sheet.setTransform(this.dpr * k, 0, 0, this.dpr * k, this.dpr * this.cam.x, this.dpr * this.cam.y)
    this.ctx = sheet
    this.drawTerritories(k)
    this.ctx = main
    // Ink spreads fast and then slows as it soaks in, and its edge is soft.
    const e = 1 - Math.pow(1 - spread, 2.4)
    const feather = s.feather
    const r = e * (s.reach * 1.08 + feather)
    const [cx, cy] = this.toScreen(s.cx, s.cy)
    sheet.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    sheet.globalCompositeOperation = 'destination-in'
    const g = sheet.createRadialGradient(cx, cy, Math.max(0, (r - feather) * k), cx, cy, Math.max(1, r * k))
    g.addColorStop(0, 'rgba(0,0,0,1)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    sheet.fillStyle = g
    sheet.fillRect(0, 0, this.w, this.h)
    sheet.globalCompositeOperation = 'source-over'
    main.save()
    main.setTransform(1, 0, 0, 1, 0, 0)
    main.drawImage(layer, 0, 0)
    main.restore()
  }

  private draw(now: number) {
    this.frameNow = now
    const ctx = this.ctx
    const p = this.palette
    if (!p || !this.w) return
    this.ensurePatterns()
    this.shownNames.clear()
    this.familyLevels.clear()

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
    if (this.survey) this.drawLandSurveyed(k)
    else this.drawLand(k)
    if (!this.rearranging) this.drawLinks(k)
    if (this.dollarT > 0 && this.dollarStyle === 'soundings') this.drawSoundings(k)
    ctx.restore()

    // Words and marks stay out of the narrow margins round the floating cards, so no scraps of letters show in a gutter or between
    // two chips. The land, its borders and the sea run on under the cards as before.
    ctx.save()
    this.clipChrome()
    this.drawNodes(now)
    if (this.dollarT > 0 && this.dollarStyle === 'towns') this.drawTowns(now)
    this.drawLabels()
    this.drawDistricts()
    if (this.dollarT > 0) this.drawFigures()
    this.drawGateLabels(now)
    this.drawCountyNames()
    this.drawCompanyName()
    this.drawPins()
    ctx.restore()
  }

  /**
   * Clips out what floats over the map, with a margin: each card grown by 10 px, any edge within 40 px of the window's taken to the
   * window, and cards side by side with less than 40 px between them joined, so the top line is one band. What's left is where words
   * and marks are drawn.
   */
  private clipChrome() {
    const near = 40
    const rects = this.cb.overlays().map((o) => ({ l: o.left - 10, t: o.top - 10, r: o.right + 10, b: o.bottom + 10 }))
    for (const r of rects) {
      if (r.l < near) r.l = -1
      if (r.t < near) r.t = -1
      if (this.w - r.r < near) r.r = this.w + 1
      if (this.h - r.b < near) r.b = this.h + 1
    }
    for (let joined = true; joined; ) {
      joined = false
      for (let i = 0; i < rects.length && !joined; i++) {
        for (let j = i + 1; j < rects.length && !joined; j++) {
          const a = rects[i]
          const b = rects[j]
          const sameBand = a.t < b.b && b.t < a.b
          const gap = Math.max(a.l, b.l) - Math.min(a.r, b.r)
          if (sameBand && gap < near) {
            rects[i] = { l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) }
            rects.splice(j, 1)
            joined = true
          }
        }
      }
    }
    const ctx = this.ctx
    for (const r of rects) {
      ctx.beginPath()
      ctx.rect(-2, -2, this.w + 4, this.h + 4)
      ctx.rect(r.l, r.t, r.r - r.l, r.b - r.t)
      ctx.clip('evenodd')
    }
  }

  private drawLand(k: number) {
    const old = this.rearranging
    if (!old) {
      this.drawTerritories(k)
      return
    }
    // Each is drawn whole on its own sheet, so its fills and lines fade as one thing.
    const main = this.ctx
    const e = EASE(this.rearrangeT)
    if (!this.landLayer) this.landLayer = document.createElement('canvas')
    const layer = this.landLayer
    if (layer.width !== this.canvas.width || layer.height !== this.canvas.height) {
      layer.width = this.canvas.width
      layer.height = this.canvas.height
    }
    const paint = (alpha: number, land: Land | null, territories: Territory[]) => {
      if (alpha <= 0.004 || !land) return
      const sheet = layer.getContext('2d')!
      sheet.setTransform(1, 0, 0, 1, 0, 0)
      sheet.clearRect(0, 0, layer.width, layer.height)
      sheet.setTransform(this.dpr * k, 0, 0, this.dpr * k, this.dpr * this.cam.x, this.dpr * this.cam.y)
      const keep = { land: this.land, territories: this.territories }
      this.ctx = sheet
      this.land = land
      this.territories = territories
      this.drawTerritories(k)
      this.ctx = main
      this.land = keep.land
      this.territories = keep.territories
      main.save()
      main.setTransform(1, 0, 0, 1, 0, 0)
      main.globalAlpha = alpha
      main.drawImage(layer, 0, 0)
      main.restore()
    }
    // New over old, and quickly: the new land is whole within a few frames, and the old goes straight after. Any slower and the land reads pale where only part of a sheet is showing, with two coasts for a moment.
    paint(clamp((0.62 - e) * 2.7, 0, 1), old.land, old.territories)
    paint(clamp(e * 4, 0, 1), this.land, this.territories)
  }

  /** How blue the sea is. All of it when readers have all of it. While they're behind it stays part way, and the tide comes in on Update. */
  private liveLevel(d: MapData): number {
    return d.live ? (d.behind ? BEHIND_SEA : 1) : 0
  }

  private seaColour(): string {
    const p = this.palette!
    if (this.liveT <= 0) return p.paper
    if (this.liveT >= 1) return p.liveSea
    const a = hexToRgb(p.paper)
    const b = hexToRgb(p.liveSea)
    const t = this.liveT
    return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`
  }

  /**
   * Before there's a map: the sea and its graticule, and nothing on it yet. Land cut off by the window's corners read as torn paper, so there's none.
   * The lines fade out where the words stand, so every word has the one ground. A phone gets the sea alone.
   */
  private drawEmpty() {
    const ctx = this.ctx
    const p = this.palette!
    const step = 240
    // A phone has room for one cell across, and its lines would only run through the name in the corner.
    if (this.w < 640) return
    ctx.lineWidth = 1
    ctx.strokeStyle = `rgba(${p.inkRGB},${p.dark ? 0.06 : 0.05})`
    const xs: number[] = []
    const ys: number[] = []
    for (let sx = ((this.w / 2 - step / 2) % step + step) % step; sx < this.w; sx += step) xs.push(Math.round(sx) + 0.5)
    for (let sy = ((this.h / 2 - step / 2) % step + step) % step; sy < this.h; sy += step) ys.push(Math.round(sy) + 0.5)
    this.ruleLines(xs, ys, this.reducedMotion || !this.emptySince ? 1 : (this.frameNow - this.emptySince) / (EMPTY_MS * 0.8))
    const rx = Math.max(this.w * 0.62, 260)
    const ry = this.h * 0.55
    ctx.save()
    ctx.translate(this.w / 2, this.h / 2)
    ctx.scale(rx / ry, 1)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry)
    g.addColorStop(0, this.sea)
    g.addColorStop(0.55, this.sea)
    g.addColorStop(1, this.sea.startsWith('#') ? `${this.sea}00` : this.sea.replace('rgb(', 'rgba(').replace(')', ',0)'))
    ctx.fillStyle = g
    ctx.fillRect(-ry * 2, -ry * 2, ry * 4, ry * 4)
    ctx.restore()
  }

  /**
   * Rules the graticule's lines, each one drawn out from the middle of the screen, the nearest first. At 1 they're whole.
   * xs and ys are where the vertical and horizontal lines fall.
   */
  private ruleLines(xs: number[], ys: number[], drawn: number) {
    const ctx = this.ctx
    const cx = this.w / 2
    const cy = this.h / 2
    ctx.beginPath()
    for (const sx of xs) {
      const t = drawn >= 1 ? 1 : EASE(clamp((drawn - (Math.abs(sx - cx) / this.w) * 0.5) / 0.5, 0, 1))
      if (t <= 0) continue
      const half = t * (this.h / 2 + 2)
      ctx.moveTo(sx, cy - half)
      ctx.lineTo(sx, cy + half)
    }
    for (const sy of ys) {
      const t = drawn >= 1 ? 1 : EASE(clamp((drawn - (Math.abs(sy - cy) / this.h) * 0.5) / 0.5, 0, 1))
      if (t <= 0) continue
      const half = t * (this.w / 2 + 2)
      ctx.moveTo(cx - half, sy)
      ctx.lineTo(cx + half, sy)
    }
    ctx.stroke()
  }

  /**
   * A surveyor's grid at every scale. Its lines are 240 world units apart, halved or doubled as often as it takes: the finest that
   * are still at least 40 px apart fade in between the ones twice as far apart, so zooming in divides the grid and zooming out gathers it, and it never snaps.
   */
  private drawGraticule() {
    const ctx = this.ctx
    const p = this.palette!
    const { k, x, y } = this.cam
    const level = Math.ceil(Math.log2(40 / (240 * k)))
    const fine = 240 * 2 ** level * k
    const coarse = fine * 2
    const lines = (step: number, skipEvery: number) => {
      const xs: number[] = []
      const ys: number[] = []
      const x0 = Math.floor(-x / step)
      const y0 = Math.floor(-y / step)
      for (let i = x0; i * step + x < this.w; i++) if (!skipEvery || i % skipEvery) xs.push(Math.round(i * step + x) + 0.5)
      for (let i = y0; i * step + y < this.h; i++) if (!skipEvery || i % skipEvery) ys.push(Math.round(i * step + y) + 0.5)
      return { xs, ys }
    }
    ctx.lineWidth = 1
    const drawn = this.survey ? (this.frameNow - this.survey.start) / 700 : 1
    const between = 0.035 * clamp((fine - 40) / 40, 0, 1)
    if (between > 0.002) {
      ctx.strokeStyle = `rgba(${p.inkRGB},${between.toFixed(4)})`
      const { xs, ys } = lines(fine, 2)
      this.ruleLines(xs, ys, drawn)
    }
    ctx.strokeStyle = `rgba(${p.inkRGB},0.035)`
    const { xs, ys } = lines(coarse, 0)
    this.ruleLines(xs, ys, drawn)
  }

  /** The border of an area, inside the coast. Where it meets the sea, its fill is its edge. */
  private strokeBorder(t: Territory) {
    const ctx = this.ctx
    ctx.save()
    ctx.clip(t.coast)
    ctx.stroke(t.outer)
    ctx.restore()
  }

  /** An area's whole edge: the border inside the coast, and the coast inside the area. Only for what has to be picked out from everything else. */
  private strokeArea(t: Territory) {
    const ctx = this.ctx
    this.strokeBorder(t)
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
    // The country first, so no sea shows through where two areas meet.
    ctx.fillStyle = p.land
    ctx.fill(this.land.coast)
    ctx.save()
    ctx.clip(this.land.coast)
    for (const t of this.territories) {
      const s = this.seal.get(t.gate) ?? 0
      const ground = this.groundOf(t.gate)
      if (ground !== p.land) {
        // In the intro a county sealed to everyone is plain land while the wave passes, and turns sealed as its seal is pressed: sealing is the closing beat, not the opening one.
        // In a reader's view the sealed ground fades in with the hatching below, as one thing, rather than snapping on first.
        ctx.globalAlpha = this.lensActive ? (this.pendingSeal.has(t.gate) ? 1 : 0) : this.data.sealedToAll.has(t.gate) ? this.sealPressed() : 1
        ctx.fillStyle = ground
        ctx.fill(t.outer)
        ctx.globalAlpha = 1
      }
      if (s > 0) {
        // Solid underneath at every stage, or the sea would show through the hatching and turn vermilion to mauve on a live map.
        ctx.globalAlpha = s
        ctx.fillStyle = this.pendingSeal.has(t.gate) ? p.exposedLand : p.sealedLand
        ctx.fill(t.outer)
        ctx.globalAlpha = 1
        // Closed here and still readable out there isn't sealed, so it can't wear the colour that says it is, or a seal's hatching.
        // It shows what the reader can still read, on amber ground with an amber edge, and its line says until when.
        const notYet = this.pendingSeal.has(t.gate)
        if (notYet) continue
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

    // The land is its fill against the sea, and nothing is drawn round it. An inked line makes every bend in a coast a thing to look at. Borders are dashed and quiet, and they're the only lines on the land.
    ctx.save()
    ctx.clip(this.land.coast)
    ctx.setLineDash([3.5 / k, 3 / k])
    ctx.lineWidth = 0.75 / k
    ctx.strokeStyle = `rgba(${p.inkRGB},${p.dark ? 0.42 : 0.36})`
    ctx.stroke(this.land.borders)
    ctx.restore()

    // What's coloured wears its colour on its whole edge.
    for (const t of this.territories) {
      const s = this.seal.get(t.gate) ?? 0
      const closedToAll = !this.lensActive && this.data.sealedToAll.has(t.gate)
      const exposed = !this.lensActive && this.data.exposed.has(t.gate)
      if (exposed) {
        // The amber ground and the "!" carry the state, so the edge is only a little heavier than a sealed one.
        ctx.strokeStyle = p.alert
        ctx.lineWidth = 1.25 / k
        this.strokeArea(t)
      } else if (closedToAll && s < 0.5) {
        ctx.strokeStyle = `rgba(${p.vermilionRGB},${0.62 * this.sealPressed()})`
        ctx.lineWidth = line
        this.strokeBorder(t)
      }
      if (s > 0) {
        const notYet = this.pendingSeal.has(t.gate)
        ctx.strokeStyle = notYet ? p.alert : `rgba(${p.vermilionRGB},${0.45 * s})`
        ctx.lineWidth = (notYet ? 1.25 : 1) / k
        if (notYet) this.strokeArea(t)
        else this.strokeBorder(t)
      }
    }
    for (const t of this.territories) {
      // Pointing at land warms it a little, so you can tell it's a thing you can click, without a line chasing the pointer across the country.
      const hot = this.hotAreas.get(t.gate) ?? 0
      const dropping = this.dropGate === t.gate
      const active = this.activeArea === t.gate
      if (hot > 0.004 && !active) {
        ctx.save()
        ctx.clip(this.land.coast)
        ctx.fillStyle = `rgba(${p.inkRGB},${(dropping ? 0.05 : 0.014) * hot})`
        ctx.fill(t.outer)
        ctx.restore()
        ctx.strokeStyle = `rgba(${p.inkRGB},${(dropping ? 0.62 : 0.3) * hot})`
        ctx.lineWidth = 1 / k
        this.strokeArea(t)
      }
      if (active) {
        ctx.strokeStyle = `rgba(${p.inkRGB},0.6)`
        ctx.lineWidth = 1.1 / k
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
    // A few things picked out together, such as two that contradict each other, show what joins them. A whole area picked out is a place, not a question about its routes.
    if (!focus && this.highlight && this.highlight.size > 4) return
    // On a phone, a line to something off the screen or under the header leads nowhere you can see. The sheet lists what it's linked to.
    const covers = this.w > 720 ? [] : this.cb.covers()
    const shown = (n: Node) => {
      if (this.w > 720) return true
      const [x, y] = this.toScreen(...this.displayPos(n))
      return x > 0 && x < this.w && y > 0 && y < this.h && !covers.some((c) => x > c.left && x < c.right && y > c.top && y < c.bottom)
    }
    for (const l of this.data.links) {
      if (focus && !this.highlight && l.from !== focus && l.to !== focus) continue
      if (this.highlight && !(this.highlight.has(l.from) && this.highlight.has(l.to))) continue
      const a = this.byId.get(l.from)
      const b = this.byId.get(l.to)
      if (!a || !b) continue
      // Within one county a line runs down its own columns of names. The ring and the panel's "Linked to" already pair them, so only lines between counties are drawn.
      if (a.piece.gate === b.piece.gate) continue
      if (!shown(a) || !shown(b)) continue
      const sealedA = this.seal.get(a.piece.gate) ?? 0
      const sealedB = this.seal.get(b.piece.gate) ?? 0
      const fade = (1 - sealedA) * (1 - sealedB)
      if (fade < 0.01) continue
      const isFocus = focus && (l.from === focus || l.to === focus)
      // Pointing at something draws its links lightly, because the map isn't quieted for it and they cross words at full strength.
      const alpha = focus && focus !== this.selected ? 0.34 * fade * (this.washes.get(focus) ?? 1) : 0.62 * fade
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
      // A line leaving along its own row starts after the words on that row, so it doesn't strike them through.
      const leave = (n: Node, tx: number, ty: number): [number, number] => {
        const [x, y] = this.displayPos(n)
        if (tx <= x || Math.abs(ty - y) > (tx - x) * 0.8) return stop(n, tx, ty)
        const label = this.labels.find((l) => l.id === n.piece.id)
        if (!label || label.align !== 'left') return stop(n, tx, ty)
        const name = this.labelFor(n.piece.title, `${nameSize(k)}px ${this.sans}`).width
        const words = Math.max(name, label.sub ? this.textW(label.sub, `${subSize(k)}px ${this.sans}`) : 0)
        const after = x + (label.x + words + 6) / k
        return after < tx ? [after, y] : stop(n, tx, ty)
      }
      const [sx, sy] = leave(a, cx, cy)
      const [ex, ey] = leave(b, cx, cy)
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
    const inkRGB = hexToRgb(p.ink)
    const landRGB = hexToRgb(p.land)
    const quiet = `rgb(${inkRGB.map((v, i) => Math.round(lerp(landRGB[i], v, p.dark ? 0.62 : 0.56))).join(',')})`
    this.drawWashes(now, tile, icon)
    // What needs you now wears an amber badge, and the top line says it in amber. A glow as well was the one blur on a line drawing.
    for (const n of this.nodes) {
      if (n.alpha < 0.01) continue
      if (towns > 0.5 && n.cost) continue
      const [wx, wy] = this.displayPos(n)
      const [x, y] = this.toScreen(wx, wy)
      if (x < -30 || y < -30 || x > this.w + 30 || y > this.h + 30) continue
      // Far out, what needs you is a dot alone (see drawPins), so its mark goes as the dot comes.
      // Gathering up, an item that won't stand alone is gone in the first half, at draw time, so its mark never shows under the line it joins.
      const leaving = this.lodT < 1 && !n.inOverview && n.piece.id !== this.selected && !this.highlight?.has(n.piece.id) && !(this.dollarOn && n.cost) ? clamp(this.lodT * 2 - 1, 0, 1) : 1
      const keep = (this.far > 0 && this.pinOf(n) ? clamp(1 - this.far / 0.3, 0, 1) : 1) * leaving
      if (keep <= 0.01) continue
      const appear = EASE(clamp(n.appear, 0, 1)) * keep
      const scale = 0.72 + Math.min(1, appear / keep) * 0.28
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

      // Zoomed out, a pin stands in for the picture, so a row stays a row. See drawPins. Far out, it's a dot alone.
      if (this.overview && this.pinOf(n)) continue
      const size = icon * scale
      // While lines show, land behind each picture, so one doesn't run through it. A glowing item keeps its glow.
      if ((this.hovered ?? this.selected ?? this.highlight) && this.pinOf(n) !== 'now') {
        ctx.fillStyle = this.groundOf(n.piece.gate)
        ctx.beginPath()
        ctx.arc(x, y, size * 0.66, 0, Math.PI * 2)
        ctx.fill()
      }
      // What isn't a tool steps back, so the logos and whatever needs you are what the eye lands on. Opaque, because a translucent line goes darker where it crosses itself.
      const loud = !!this.pinOf(n) || n.piece.id === this.selected || n.piece.id === this.hovered || !!this.highlight?.has(n.piece.id)
      ctx.fillStyle = loud ? p.ink : quiet
      ctx.strokeStyle = loud ? p.ink : quiet
      drawSymbol(ctx, n.piece.kind, x, y, size)
      ctx.strokeStyle = p.ink

      if (n.piece.id === this.selected) {
        ctx.lineWidth = 1.25
        ctx.beginPath()
        ctx.arc(x, y, size * 0.82, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
  }

  /** The answer to a pointer, and the mark of what just arrived: a wash behind the thing and its name, the same as a row in any list here. */
  private drawWashes(now: number, tile: number, icon: number) {
    if (!this.washes.size && !this.fresh.size) return
    const ctx = this.ctx
    const p = this.palette!
    const labels = new Map(this.labels.map((l) => [l.id, l]))
    const paint = (n: Node, alpha: number) => {
      if (alpha <= 0.002) return
      const [wx, wy] = this.displayPos(n)
      const [x, y] = this.toScreen(wx, wy)
      const half = (n.piece.kind === 'service' ? tile : icon) / 2
      const l = labels.get(n.piece.id)
      let right = x + half
      let top = y - half
      let bottom = y + half
      if (l && l.align === 'left' && !this.dollarOn) {
        // What's under the name is part of what arrived, or the wash stops halfway through a sentence.
        const b = this.labelBox(l, n, x, y)
        right = Math.max(right, b.right)
        top = Math.min(top, b.top + 1)
        bottom = Math.max(bottom, b.bottom - 1)
      }
      ctx.fillStyle = `rgba(${p.inkRGB},${alpha})`
      ctx.beginPath()
      ctx.roundRect(x - half - 4, top - 3, right - x + half + 9, bottom - top + 6, 5)
      ctx.fill()
    }
    // When most of the map is new, the wash wouldn't point at anything.
    const worthSaying = this.fresh.size <= this.nodes.length * 0.6
    for (const [id, at] of worthSaying ? this.fresh : []) {
      const n = this.byId.get(id)
      if (!n || n.alpha < 0.05) continue
      const age = now - at
      paint(n, 0.07 * clamp(n.appear, 0, 1) * (age < FRESH_HOLD_MS ? 1 : clamp(1 - (age - FRESH_HOLD_MS) / FRESH_FADE_MS, 0, 1)))
    }
    for (const [id, a] of this.washes) {
      const n = this.byId.get(id)
      if (n && n.alpha >= 0.05) paint(n, (id === this.pressed ? 0.11 : 0.06) * a)
    }
  }

  /** Over everything, so nothing can hide what's asking for you. The worst go on last. */
  private drawPins() {
    const ctx = this.ctx
    const p = this.palette!
    const k = this.cam.k
    // A pin arrives with what it's stuck in, and not before.
    const pinned = this.nodes.filter((n) => this.pinOf(n) && n.alpha >= 0.01 && n.appear > 0)
    pinned.sort((a, b) => (this.pinOf(a) === 'now' ? 1 : 0) - (this.pinOf(b) === 'now' ? 1 : 0))
    for (const n of pinned) {
      const level = this.pinOf(n)!
      const [wx, wy] = this.displayPos(n)
      const [x, y] = this.toScreen(wx, wy)
      ctx.globalAlpha = n.alpha * clamp(n.appear, 0, 1)
      const edge = this.groundOf(n.piece.gate)
      // Far out a badge would be bigger than the county it's in, so it's a dot: amber for what needs you now, ink for a question.
      if (this.far > 0.3) {
        // Where the item lives, not where its row gathers when zoomed out: at this size a row is a smudge, and the dot should be on its county.
        const [dx, dy] = this.toScreen(n.tx, n.ty - this.sealLift(n))
        const r = level === 'now' ? 3.2 : 2.4
        ctx.globalAlpha *= clamp((this.far - 0.3) * 4, 0, 1)
        ctx.beginPath()
        ctx.arc(dx, dy, r + 1.2, 0, Math.PI * 2)
        ctx.fillStyle = edge
        ctx.fill()
        ctx.beginPath()
        ctx.arc(dx, dy, r, 0, Math.PI * 2)
        ctx.fillStyle = level === 'now' ? p.alert : p.ink
        ctx.fill()
        continue
      }
      if (this.far > 0) ctx.globalAlpha *= clamp(1 - this.far / 0.3, 0, 1)
      // A pin is a badge on what needs you, as it is in the list of what needs you: on a logo's corner, or in place of any other mark.
      const b = this.badge(n, x, y, level)
      drawPinHead(ctx, b.x, b.y, b.r, level === 'now' ? p.alert : p.ink, level === 'now' ? p.onAlert : p.land, edge, level === 'now' ? '!' : '?', this.sans)
    }
    ctx.globalAlpha = 1
  }

  /** Rings and wash, in world space, so ink accumulates where money concentrates. */
  private drawSoundings(k: number) {
    const ctx = this.ctx
    const p = this.palette!
    // In world units, so they sit on the land, but no bigger on the screen than PRICE_GROWTH times their size when the map is whole.
    const ratio = this.priceGrowth() / k
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
    const scale = this.priceGrowth() * this.discScale()
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
      // One rim for a known price and an estimate alike: the ≈ says which, and a second ring said it again with nothing on screen to explain it.
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
    this.ctx.strokeStyle = ground
    this.strokeHalo(text, x, y, halo)
    this.ctx.fillText(text, x, y)
  }

  /**
   * A halo the colour of the land, kept to the land. With no line round the coast, a halo that runs out over the sea paints a bump on the shore, so where a word reaches the sea the sea shows through.
   * Most words stand well inland and are drawn as they are. Only the few near a shore pay for the clip.
   */
  private strokeHalo(text: string, x: number, y: number, width: number) {
    const ctx = this.ctx
    ctx.lineJoin = 'round'
    ctx.lineWidth = width
    const land = this.land
    if (!land || this.inland(text, x, y, width)) {
      ctx.strokeText(text, x, y)
      return
    }
    const m = ctx.getTransform()
    const { k, x: cx, y: cy } = this.cam
    ctx.save()
    ctx.setTransform(m.a * k, 0, 0, m.d * k, m.e + m.a * cx, m.f + m.d * cy)
    ctx.clip(land.coast)
    ctx.setTransform(m)
    ctx.strokeText(text, x, y)
    ctx.restore()
  }

  /** Whether a word and its halo stand wholly on land, tried along its box's edges. */
  private inland(text: string, x: number, y: number, pad: number): boolean {
    const t = this.ctx.measureText(text)
    const left = x - t.actualBoundingBoxLeft - pad
    const right = x + t.actualBoundingBoxRight + pad
    const top = y - t.actualBoundingBoxAscent - pad
    const bottom = y + t.actualBoundingBoxDescent + pad
    const on = (sx: number, sy: number) => {
      const [wx, wy] = this.toWorld(sx, sy)
      return this.territories.some((g) => g.onLand(wx, wy))
    }
    const steps = Math.max(2, Math.ceil((right - left) / 10))
    for (let i = 0; i <= steps; i++) {
      const sx = left + ((right - left) * i) / steps
      if (!on(sx, top) || !on(sx, bottom)) return false
    }
    return on(left, (top + bottom) / 2) && on(right, (top + bottom) / 2)
  }

  private drawLabels() {
    const ctx = this.ctx
    const p = this.palette!
    const focus = this.hovered ?? this.selected
    // Nothing runs behind a name until lines appear or prices spread out. Then each name keeps its ground, so no line strikes it through.
    const grounded = !!focus || !!this.highlight || this.dollarOn
    ctx.textBaseline = 'alphabetic'
    const names = this.labels
    const subFont = `${subSize(this.cam.k)}px ${this.sans}`
    const subLeading = Math.round(subSize(this.cam.k) * 1.5)
    // An item's words run under a card or a panel as anything on a canvas does: the card is opaque and hides them, and the item stays.
    // Holding back a name that touched a card blanked whole columns, the one you'd just opened among them.
    for (const l of names) {
      const n = this.byId.get(l.id)
      if (!n) continue
      // Gathering up, names go first and the marks travel after, so words don't land on each other on the way.
      const leaving = this.lodT < 1 && !n.inOverview && n.piece.id !== this.hovered ? clamp(this.lodT * 2 - 1, 0, 1) : 1
      // Travelling, marks can pass over each other and that's fine. Words on words aren't, so names step back until things have landed.
      const r = this.rearrangeT
      const travelling = this.rearranging ? (r < 0.6 ? lerp(1, 0.22, Math.min(r / 0.14, 1)) : lerp(0.22, 1, (r - 0.6) / 0.4)) : 1
      const shown = leaving * clamp(n.appear, 0, 1) * travelling * (1 - this.far)
      const a = l.alpha * Math.max(n.alpha, this.dollarOn && n.cost ? 1 : 0) * shown
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
          ctx.globalAlpha = l.alpha * fade * shown
          ctx.strokeStyle = ground
          this.strokeHalo(line, x + l.x, ly, 3)
        }
        ctx.globalAlpha = a * fade
        // Tools and whatever needs you carry the map. Everything else is a step back, still well above what a small word needs.
        const loud = l.id === focus || n.piece.kind === 'service' || !!this.pinOf(n) || !!this.highlight?.has(n.piece.id)
        ctx.fillStyle = loud ? p.ink : `rgba(${p.inkRGB},${p.dark ? 0.76 : 0.7})`
        ctx.fillText(line, x + l.x, ly)
      })
      // Worth a look: a dot at the end of the name, so it can only be about this item. Beside the mark, it read as the end of the name before it.
      // Zoomed out a logo has no name, and that dot moves to the line that says Tools.
      if (this.data.flagged.get(n.piece.id) === 'look' && !this.dollarOn && !this.overview && !this.lensActive && l.align === 'left') {
        const last = lines[lines.length - 1]
        ctx.globalAlpha = a
        drawNeedDot(ctx, x + l.x + ctx.measureText(last).width + 7, y + l.y + (lines.length - 1) * leading - 3.5, 2.6, p.ink, ground)
      }
      if (l.sub) {
        const sy = y + l.y + lines.length * leading
        ctx.font = subFont
        const said = [l.sub, ...(l.more ?? [])]
        // The summary in the one step-back ink, and what's in the item a step further, so the eye knows where one ends.
        const bodyFrom = l.more ? said.indexOf('') : -1
        said.forEach((line, i) => {
          if (!line) return
          const ly = sy + i * subLeading
          if (ly < -20 || ly > this.h + 20) return
          if (grounded) {
            ctx.globalAlpha = l.alpha * fade
            ctx.strokeStyle = ground
            this.strokeHalo(line, x + l.x, ly, 3)
          }
          ctx.globalAlpha = a * fade
          ctx.fillStyle = `rgba(${p.inkRGB},${bodyFrom >= 0 && i > bodyFrom ? (p.dark ? 0.62 : 0.56) : 0.6})`
          ctx.fillText(line, x + l.x, ly)
        })
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
    // What only the gathered form says (icons, counts, the logos in a line) comes up in the second half, once the items it stands for have gone.
    const linesUp = clamp((0.5 - this.lodT) * 2, 0, 1)
    const focused = !!this.selected
    // They're printed where things will be, so they wait for things to get there.
    const landing = this.rearranging ? clamp((this.rearrangeT - 0.72) / 0.28, 0, 1) : 1
    const dim = (this.highlight ? 0.14 : focused ? 0.34 : 1) * landing * (1 - this.far)
    if (dim <= 0.01) return
    const font = this.districtFont()
    const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
    const lined = !!this.selected || !!this.hovered || !!this.highlight
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    // As with a county's name and an item's: half a heading by the card's edge reads as "ools", so it waits until it's clear.
    const overlays = this.cb.overlays()
    for (const d of this.districts) {
      const seen = (d.named ? 1 - gathered * (d.hidden ? 1 : 0) : d.hidden ? 0 : linesUp) * money * (1 - this.sealOf(d.gate)) * dim
      if (seen < 0.01) continue
      const [x, y] = this.districtPos(d, 1 - gathered)
      // A heading comes up with its first row, which stands a line below it, so no heading stands over nothing.
      const surveyed = this.surveyAt(x, y + 18, SURVEY_ITEMS.after, 280)
      if (surveyed <= 0) continue
      const shown = seen * surveyed
      ctx.font = font
      const across = (d.def.id === 'tools' ? 0 : LINE_ICON * gathered) + ctx.measureText(`${d.def.name} ${d.members.length}`).width + 6
      if (overlays.some((o) => x < o.right && x + across > o.left && y - 12 < o.bottom && y + 3 > o.top && !(x >= o.left && x + across <= o.right && y - 12 >= o.top && y + 3 <= o.bottom))) continue
      const hot = this.hoverDistrict === d
      const icon = d.def.id === 'tools' ? 0 : LINE_ICON * gathered
      ctx.font = font
      const nudge = this.overview ? { dx: 0, warm: false } : this.clearOfPins(d, x, y, ctx.measureText(d.def.name).width)
      if (icon > 0.5) {
        ctx.globalAlpha = shown * linesUp
        ctx.strokeStyle = p.ink
        ctx.fillStyle = p.ink
        drawSymbol(ctx, d.def.icon, x + 6.5, y - 4, 13)
      }
      ctx.font = font
      // A step under the rows, and still 4.5:1 at the least on every ground, because these are what make a county scannable.
      ctx.fillStyle = `rgba(${p.inkRGB},${nudge.warm ? 0.72 : lerp(0.62, hot ? 1 : 0.74, gathered)})`
      ctx.globalAlpha = shown
      if ('letterSpacing' in c) c.letterSpacing = '0.4px'
      // When lines are showing, a heading keeps its ground as names do, so a line passes under it and never strikes it through.
      if (lined) this.haloText(d.def.name, x + icon + nudge.dx, y, 3, this.groundOf(d.gate))
      else ctx.fillText(d.def.name, x + icon + nudge.dx, y)
      const width = ctx.measureText(d.def.name).width
      if ('letterSpacing' in c) c.letterSpacing = '0px'
      if (gathered > 0.01) {
        ctx.globalAlpha = shown * linesUp
        ctx.fillStyle = `rgba(${p.inkRGB},${hot ? 0.8 : 0.62})`
        const count = String(d.members.length)
        ctx.fillText(count, x + icon + width + 5, y)
        if (d.look && !this.lensActive) drawNeedDot(ctx, x + icon + width + 5 + ctx.measureText(count).width + 7, y - 4, 3.2, p.ink, this.groundOf(d.gate))
      }
    }
    if (gathered > 0.5 && this.overview) {
      ctx.font = this.districtFont()
      ctx.fillStyle = `rgba(${p.inkRGB},0.62)`
      for (const [gate, u] of this.unsaid) {
        const a = money * landing * linesUp * (1 - this.sealOf(gate))
        if (a < 0.01) continue
        ctx.globalAlpha = a
        if (!u.parts) {
          ctx.fillText(u.text, u.x + this.cam.x, u.y + this.cam.y)
          continue
        }
        // Each kind with its own icon, as every other kind's line has.
        let at = u.x + this.cam.x
        for (const part of u.parts) {
          ctx.strokeStyle = p.ink
          ctx.fillStyle = p.ink
          drawSymbol(ctx, part.icon, at + 6.5, u.y + this.cam.y - 4, 13)
          ctx.fillStyle = `rgba(${p.inkRGB},0.62)`
          ctx.fillText(part.text, at + LINE_ICON, u.y + this.cam.y)
          at += LINE_ICON + this.measure(part.text, ctx.font) + 14
        }
      }
      // A row of logos with no room for them all ends with how many more.
      for (const d of this.districts) {
        if (!d.more || d.hidden) continue
        // Tools a reader still gets through a seal are counted as they're shown, a step back and lifted with them.
        const through = this.lensActive && d.def.id === 'tools' && this.data.pricesReadable.has(d.gate)
        const a = money * landing * linesUp * (through ? 1 - 0.28 * this.sealOf(d.gate) : 1 - this.sealOf(d.gate))
        if (a < 0.01) continue
        const [mx, my] = this.toScreen(d.more.x, d.more.y - (through ? (20 / DESIGN_K) * this.sealOf(d.gate) : 0))
        ctx.globalAlpha = a
        ctx.textAlign = 'center'
        ctx.fillText(`+${d.more.n}`, mx, my + 4)
        ctx.textAlign = 'left'
      }
    }
    ctx.globalAlpha = 1
  }

  /**
   * A pin's head can land on a kind's name when a laptop leaves it nowhere else to go. A word cut by a pin is worse than a word out of line, so only then does the word step aside.
   * Standing in the glow, it also needs more ink to be read.
   */
  private clearOfPins(d: District, x: number, y: number, width: number): { dx: number; warm: boolean } {
    let dx = 0
    let warm = false
    const k = this.cam.k
    for (const n of d.members) {
      const level = this.pinOf(n)
      if (!level) continue
      const [wx, wy] = this.displayPos(n)
      const [sx, sy] = this.toScreen(wx, wy)
      const { x: hx, y: hy, r } = this.badge(n, sx, sy, level)
      if (level === 'now') warm = true
      if (hx + r + 3 > x && hx - r < x + width && hy + r > y - 11 && hy - r < y + 3) dx = Math.max(dx, hx + r + 3 - x)
    }
    return { dx, warm }
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
      const text = this.priceText(n.cost)
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
      // The ≈ already says it's an estimate. Grey as well only made the figures this view is for the hardest to read.
      ctx.fillStyle = p.ink
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
    const throughGates = new Set(this.lensActive ? this.nodes.filter((m) => this.throughSeal(m)).map((m) => m.piece.gate) : [])
    const size = this.gateLabelSize()
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
    // Half a name under a panel or the top line, "neering", reads as broken. It's better not there, and it's back as soon as the map slides home.
    const overlays = this.cb.overlays()
    const cutBy = (rx: number, ry: number, rw: number, rh: number) => overlays.some((o) => rx < o.right && rx + rw > o.left && ry < o.bottom && ry + rh > o.top)

    for (const t of this.territories) {
      const gate = this.data.gates.find((g) => g.id === t.gate)
      if (!gate) continue
      const [x, settled] = this.gateLabelPos(t)
      const surveyed = this.surveyAt(x, settled, SURVEY_NAMES.after, SURVEY_NAMES.for)
      if (surveyed <= 0) continue
      const y = settled + (1 - surveyed) * 10
      // Only for a name that's partly showing. One wholly under a panel is drawn and nobody sees it, and either way there's nothing to cut.
      if (cutBy(x, y - size, this.nameWidth(this.shownName(t)), size + 4)) continue
      const s = this.seal.get(t.gate) ?? 0
      const ground = s > 0.5 ? (this.pendingSeal.has(t.gate) ? p.exposedLand : p.sealedLand) : this.groundOf(t.gate)
      const shown = this.shownName(t)

      const arriving = (this.rearranging && !this.rearranging.names.has(t.gate) ? clamp((this.rearrangeT - 0.5) / 0.5, 0, 1) : 1) * surveyed * (1 - EASE(this.far))
      if (arriving <= 0.01) continue
      ctx.globalAlpha = arriving
      ctx.font = `${AREA_NAME_WEIGHT} ${size}px ${this.sans}`
      if ('letterSpacing' in c) c.letterSpacing = `${(size * AREA_NAME_TRACK).toFixed(1)}px`
      // Closed here but still readable out there isn't sealed yet, so its name stays ink.
      ctx.fillStyle = s > 0.5 && !this.pendingSeal.has(t.gate) ? p.vermilion : p.ink
      this.haloText(shown, x, y, 5, ground)
      if ('letterSpacing' in c) c.letterSpacing = '0px'
      const nameW = this.nameWidth(shown)

      // Under the name: who can read it. Prices take this line while they're showing.
      const note = this.areaNote(t.gate)
      const priced = Math.max(this.dollarT, this.subtotalsT)
      if ((note.text || note.faces.length) && priced < 0.99 && !cutBy(x, y + 6, this.noteWidth(note), 17)) {
        // A sealed line comes with its seal, so the first vermilion words on the screen are the last thing the intro says.
        const fade = (1 - EASE(priced)) * (note.sealed && !this.lensActive ? Math.min(1, this.sealPressed() * 3) : 1)
        const faces = this.facesWidth(note.faces.length)
        if (faces) this.drawFaces(note.faces, x, y + 13.5, fade * arriving * (this.data.live ? 1 : p.dark ? 0.88 : 0.82), now)
        ctx.globalAlpha = fade * arriving
        ctx.textAlign = 'left'
        ctx.font = `${note.exposed ? '500 ' : ''}12px ${this.sans}`
        ctx.fillStyle = note.sealed ? p.vermilionInk : note.exposed ? p.ink : `rgba(${p.inkRGB},0.68)`
        this.haloText(note.text, x + faces, y + 17.5, 4, ground)
        ctx.globalAlpha = 1
      }

      // Beside the name, so it never sits on the words. On the land too, because a seal out at sea says nothing about what's sealed.
      const sealHere = this.data.sealedToAll.has(t.gate) && !this.lensActive && !this.data.exposed.has(t.gate)
      const pinHere = note.exposed && priced < 0.5
      if (sealHere || pinHere) {
        const r = pinRadius('now', this.cam.k)
        const wants = sealHere ? 26 : r * 2 + 2
        const besideName = this.landRoom(t, x, y - 15, y + 3) >= nameW + 8 + wants
        const lineEnd = x + this.noteWidth(note) + 6
        const onLine = !besideName && priced < 0.5 && this.landRoom(t, x, y + 6, y + 23) >= this.noteWidth(note) + 6 + (sealHere ? 20 : 15)
        const after = x + nameW + 8
        // A gate no password opens carries a small seal, even with no lens on. Where it fits nowhere, the word in vermilion under the name still says so.
        const pressed = this.sealPressed()
        if (sealHere && pressed > 0) {
          ctx.globalAlpha = Math.min(1, pressed * 4)
          const grow = this.pressScale()
          if (besideName) ctx.drawImage(this.waxSeal(26), after + 13 - 13 * grow, y - 6 - 13 * grow, 26 * grow, 26 * grow)
          else if (onLine) ctx.drawImage(this.waxSeal(20), lineEnd + 10 - 10 * grow, y + 13 - 10 * grow, 20 * grow, 20 * grow)
          ctx.globalAlpha = 1
        }
        // A closed area someone can still read wears the same pin as anything else that needs you now.
        if (pinHere) {
          if (besideName) drawPinHead(ctx, after + 9, y - 7, 9, p.alert, p.onAlert, ground, '!', this.sans)
          // Only its head on this line, or the rest of it stands up through the name above.
          else if (onLine) drawPinHead(ctx, lineEnd + 8, y + 13.5, 7, p.alert, p.onAlert, ground, '!', this.sans)
        }
      }

      // Subtotal under the name while prices are showing.
      const share = this.summary?.byGate.find((b) => b.gate === t.gate)
      if (priced > 0.01 && share) {
        ctx.globalAlpha = EASE(priced)
        ctx.font = `12px ${this.sans}`
        ctx.fillStyle = `rgba(${p.inkRGB},0.72)`
        this.haloText(this.subtotalText(share.amount, this.subtotalsFit()), x, y + 16, 4, ground)
        ctx.globalAlpha = 1
      } else if (priced > 0.01) {
        // An area with no prices says so, in the top line's own words, so it doesn't read as free or as a glitch.
        ctx.globalAlpha = EASE(priced)
        ctx.font = `12px ${this.sans}`
        ctx.fillStyle = `rgba(${p.inkRGB},0.5)`
        this.haloText('No prices yet', x, y + 16, 4, ground)
        ctx.globalAlpha = 1
      }

      // The wax mark lands on a closed gate.
      if (s > 0.01 && !this.pendingSeal.has(t.gate) && this.sealPressed() > 0) {
        const landed = this.sealLanded.get(t.gate)
        const age = landed ? (now - landed) / 340 : 1
        const land = this.reducedMotion ? 1 : EASE(clamp(age, 0, 1))
        // Beside the name, where the owner's view puts a seal too, so it's the same mark in the same place in both. Where the name leaves no room, at the end of the line under it.
        // Only where neither is on the land, in the middle, and below whatever tools the reader still sees there. It keeps to the map's scale, so a small map isn't buried under its seals.
        const small = clamp(34 * Math.sqrt(this.cam.k / DESIGN_K), 22, 34)
        // Wholly on its own land, with room round it, so a seal can never sit on a border or read as a neighbour's.
        const ownLand = (sx: number, sy: number, half: number) => {
          const reach = half + 4
          return [[-reach, 0], [reach, 0], [0, -reach], [0, reach]].every(([dx, dy]) => {
            const [wx, wy] = this.toWorld(sx + dx, sy + dy)
            return t.onLand(wx, wy) && this.gateAt(wx, wy) === t.gate
          })
        }
        const shows = throughGates.has(t.gate)
        const cx = shows ? (t.minX + t.maxX) / 2 : (t.holds.minX + t.holds.maxX) / 2
        const cy = shows ? t.holds.maxY + (t.maxY - t.holds.maxY) * 0.4 : (t.holds.minY + t.holds.maxY) / 2
        const [mx, middle] = this.toScreen(cx, cy)
        const [, nameAt] = this.gateLabelPos(t)
        const spots: [number, number, number][] = []
        // Beside the name, smaller before it gives up. Then after the line under it, or, where there's no line, below the name's start.
        for (const size of [small, 20, 16]) spots.push([x + nameW + 10 + size / 2, y - 7, size])
        spots.push(note.text ? [x + this.noteWidth(note) + 10 + small / 2, y + 12, small] : [x + small / 2, y + 10 + small / 2, small])
        const big = clamp(44 * Math.sqrt(this.cam.k / DESIGN_K), 26, 44)
        spots.push([mx, Math.max(middle, nameAt + 24 + 22), big])
        // Nowhere wholly its own: no seal. The vermilion name and the hatching already say sealed.
        const spot = spots.find(([sx, sy, size]) => ownLand(sx, sy, size / 2))
        if (!spot) continue
        const [sx, sy, waxSize] = spot
        const scale = lerp(1.55, 1, land) * this.pressScale()
        const wax = this.waxSeal(waxSize)
        const draw = waxSize * scale
        ctx.globalAlpha = Math.min(1, s * 2) * (landed ? land : s) * Math.min(1, this.sealPressed() * 4)
        ctx.drawImage(wax, sx - draw / 2, sy - draw / 2, draw, draw)
        ctx.globalAlpha = 1
      }
    }
  }
}
