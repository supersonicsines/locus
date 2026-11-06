// What every motion graphic is drawn from, in the map's own vocabulary: the paper sea and its graticule, pale land with dashed county
// borders, ink item symbols, tool tiles with monograms, the vermilion wax seal, and a pointer. Plus the one hook that plays them.
//
// Each graphic is an SVG whose resting look is its end state, so with reduced motion it's a still of how the story ends. When it moves,
// every part runs one Web Animation over the same cycle, starting when the graphic scrolls into view and pausing when it leaves.
// Only transform and opacity move. No script or style element is written into the page, so the strict CSP holds.

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'
export const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)'
export const GLIDE = 'cubic-bezier(0.45, 0, 0.2, 1)'

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

type Frame = { [prop: string]: string | number | undefined }
export type Key = Frame & { at: number; ease?: string }

/** A key's CSS properties, without its time and easing, and without anything left unset. */
const strip = ({ at: _at, ease: _ease, ...rest }: Key) => Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Record<string, string | number>

/** One part's whole cycle, as keyframes at times in milliseconds. It repeats forever, and the last key should look like the first. */
export function track(el: Element | null | undefined, keys: Key[], cycle: number): Animation | null {
  if (!el || !keys.length) return null
  const frames: Keyframe[] = keys.map((k) => ({ ...strip(k), offset: Math.min(1, Math.max(0, k.at / cycle)), easing: k.ease ?? EASE }))
  if ((frames[0].offset as number) > 0) frames.unshift({ ...strip(keys[0]), offset: 0, easing: 'linear' })
  if ((frames[frames.length - 1].offset as number) < 1) frames.push({ ...strip(keys[keys.length - 1]), offset: 1 })
  return el.animate(frames, { duration: cycle, iterations: Infinity, fill: 'both' })
}

const SHOWN: Frame = { opacity: 1, transform: 'translate(0px, 0px) scale(1)' }

/** Comes in from `from` at `at`, stays, and fades away at `out`. For a part that isn't there when the cycle starts. */
export function enter(el: Element | null | undefined, cycle: number, at: number, dur: number, from: Frame, out: number, opts: { to?: Frame; fade?: number; ease?: string } = {}) {
  const to = opts.to ?? SHOWN
  const fade = opts.fade ?? 500
  return track(
    el,
    [
      { at: 0, ...from },
      { at, ...from, ease: opts.ease },
      { at: at + dur, ...to },
      { at: out, ...to, ease: EASE_IN_OUT },
      { at: out + fade, ...to, opacity: 0, ease: 'linear' },
      { at: cycle, ...from },
    ],
    cycle,
  )
}

/** Changes from one look to another at `at`, and back at `back`. For a part that's there from the start. */
export function swap(el: Element | null | undefined, cycle: number, at: number, dur: number, from: Frame, to: Frame, back: number, opts: { backDur?: number; ease?: string } = {}) {
  return track(
    el,
    [
      { at: 0, ...from },
      { at, ...from, ease: opts.ease },
      { at: at + dur, ...to },
      { at: back, ...to, ease: EASE_IN_OUT },
      { at: back + (opts.backDur ?? 500), ...from },
    ],
    cycle,
  )
}

/** A line typed out: what covers it steps aside one character at a time, and so does the cursor. */
export function typing(cover: Element | null, cursor: Element | null, cycle: number, at: number, dur: number, chars: number, cw: number, out: number, opts: { blinkUntil?: number; keepCursor?: boolean } = {}) {
  const dist = `translateX(${(chars * cw).toFixed(2)}px)`
  const anims = [
    track(
      cover,
      [
        { at: 0, transform: 'translateX(0px)' },
        { at, transform: 'translateX(0px)', ease: `steps(${chars}, end)` },
        { at: at + dur, transform: dist },
        { at: cycle - 1, transform: dist, ease: 'step-end' },
        { at: cycle, transform: 'translateX(0px)' },
      ],
      cycle,
    ),
  ]
  if (cursor) {
    const keys: Key[] = [
      { at: 0, opacity: 0, transform: 'translateX(0px)' },
      { at: at - 1, opacity: 0, transform: 'translateX(0px)', ease: 'step-end' },
      { at, opacity: 1, transform: 'translateX(0px)', ease: `steps(${chars}, end)` },
      { at: at + dur, opacity: 1, transform: dist, ease: 'step-end' },
    ]
    // A cursor that waits blinks, as every terminal's does.
    let t = at + dur
    const until = opts.blinkUntil ?? at + dur
    while (t + 530 < until) {
      keys.push({ at: t + 530, opacity: 0, transform: dist, ease: 'step-end' }, { at: t + 1060, opacity: 1, transform: dist, ease: 'step-end' })
      t += 1060
    }
    if (!opts.keepCursor) keys.push({ at: until + 1, opacity: 0, transform: dist, ease: 'step-end' })
    keys.push({ at: out, opacity: opts.keepCursor ? 1 : 0, transform: dist, ease: 'step-end' }, { at: out + 1, opacity: 0, transform: dist }, { at: cycle, opacity: 0, transform: 'translateX(0px)' })
    anims.push(track(cursor, keys, cycle))
  }
  return anims
}

/** Plays a graphic's parts while it's on screen. Under reduced motion it builds nothing, and the still end state shows. */
export function useMotion<T extends Element>(build: (root: T) => (Animation | null)[]) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || reducedMotion() || typeof root.animate !== 'function') return
    const parts = build(root).filter((a): a is Animation => !!a)
    if (!parts.length) return
    // Built paused at the start, so nothing runs until it's seen, and what's seen first is the beginning.
    parts.forEach((a) => a.pause())
    // It starts once most of it is in view, so its opening beats aren't spent at the bottom edge of the window, and pauses once it's gone.
    let playing = false
    const watch = new IntersectionObserver(
      ([seen]) => {
        if (seen.intersectionRatio >= 0.65 && !playing) {
          playing = true
          const t = parts[0].currentTime ?? 0
          parts.forEach((a) => {
            a.currentTime = t
            a.play()
          })
        } else if (!seen.isIntersecting && playing) {
          playing = false
          parts.forEach((a) => a.pause())
        }
      },
      { threshold: [0, 0.65] },
    )
    watch.observe(root)
    return () => {
      watch.disconnect()
      parts.forEach((a) => a.cancel())
    }
    // Built once: each graphic draws the same thing every time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ref
}

/** An id that's safe inside url(#…), unique per graphic, for patterns and clips. */
export function useSvgId(name: string): string {
  return `${name}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
}

export const $ = <E extends Element = SVGElement>(root: Element, sel: string) => root.querySelector<E>(sel)
export const $$ = <E extends Element = SVGElement>(root: Element, sel: string) => [...root.querySelectorAll<E>(sel)]

// The graphic's frame. Every graphic is 480 by 300 units, and scales to its column.

export const W = 480
export const H = 300

export function Plate({ name, label, children, className = '', reff, viewBox = `0 0 ${W} ${H}` }: { name: string; label: string; children: ReactNode; className?: string; reff: React.RefObject<SVGSVGElement | null>; viewBox?: string }) {
  return (
    <svg ref={reff} className={`mg ${className}`} data-mg={name} viewBox={viewBox} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {children}
    </svg>
  )
}

/** The paper sea and its surveyor's grid, as the map draws them. */
export function Sea({ live = false }: { live?: boolean }) {
  const lines: ReactNode[] = []
  for (let x = 40; x < W; x += 40) lines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={H} />)
  for (let y = 20; y < H; y += 40) lines.push(<line key={`y${y}`} x1={0} y1={y} x2={W} y2={y} />)
  return (
    <>
      <rect className="mg-sea" width={W} height={H} />
      {live && <rect className="mg-live-sea" data-live-sea="" width={W} height={H} />}
      <g className="mg-grid">{lines}</g>
    </>
  )
}

// Item symbols, the same drawings the map uses (src/studio/map/symbols.ts), on a 16-unit square.

const PAGE = 'M9.5 1.8H4.6a1.1 1.1 0 0 0-1.1 1.1v10.2a1.1 1.1 0 0 0 1.1 1.1h6.8a1.1 1.1 0 0 0 1.1-1.1V4.8zM9.5 1.8v3h3'
const ICONS = {
  rule: 'M8 1.7l5 1.9v4.1c0 3.2-2.1 5.3-5 6.6-2.9-1.3-5-3.4-5-6.6V3.6zM5.6 7.9l1.8 1.8 3-3.4',
  fact: 'M8 14.2a6.2 6.2 0 1 0 0-12.4 6.2 6.2 0 0 0 0 12.4zM8 7.4V11M8 4.9v.02',
  decision: 'M8 14.2V9.4M8 9.4 3.6 5M8 9.4l4.4-4.4M12.4 8.4V5H9',
  spec: 'M5.6 3H4.2a1.1 1.1 0 0 0-1.1 1.1v9a1.1 1.1 0 0 0 1.1 1.1h7.6a1.1 1.1 0 0 0 1.1-1.1v-9A1.1 1.1 0 0 0 11.8 3h-1.4M6 1.8h4v2.4H6zM5.6 7.6h4.8M5.6 10.6h4.8',
  token: 'M8 1.9s-4.7 4.9-4.7 8.1a4.7 4.7 0 0 0 9.4 0C12.7 6.8 8 1.9 8 1.9z',
  doc: `${PAGE}M5.6 8.2h4.8M5.6 10.8h4.8`,
  contract: `${PAGE}M5.6 6.8h2.2M8 12.6a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8z`,
} as const
export type Kind = keyof typeof ICONS | 'clause'

/** A kind's picture, centred on (0, 0). */
export function Glyph({ kind, size = 9 }: { kind: Kind; size?: number }) {
  if (kind === 'clause') {
    return (
      <text className="mg-glyph-text" x={0} y={size * 0.36} fontSize={size * 1.05} textAnchor="middle">
        §
      </text>
    )
  }
  return <path className="mg-glyph" d={ICONS[kind]} transform={`translate(${-size / 2} ${-size / 2}) scale(${size / 16})`} strokeWidth={1.3} />
}

/** A tool with no logo: its monogram on a tile, the same as on the map. Never a real logo. */
export function Tile({ letter, size = 11 }: { letter: string; size?: number }) {
  return (
    <g className="mg-tile">
      <rect x={-size / 2} y={-size / 2} width={size} height={size} rx={size * 0.22} />
      <text x={0} y={size * 0.19} fontSize={size * 0.52} textAnchor="middle">
        {letter}
      </text>
    </g>
  )
}

/** The wax seal: poured wax, a pressed ring, and an L for Locus. Drawn as the map draws it, centred on (0, 0). */
const WAX_OFFSETS = [0.96, 1.03, 0.98, 1.05, 0.95, 1.02, 0.99, 1.04, 0.97, 1.03, 0.98]
function waxPath(size: number): string {
  const R = size * 0.42
  const n = WAX_OFFSETS.length
  const p = (i: number): [number, number] => {
    const a = (i / n) * Math.PI * 2
    return [Math.cos(a) * R * WAX_OFFSETS[i % n], Math.sin(a) * R * WAX_OFFSETS[i % n]]
  }
  const mid = (a: [number, number], b: [number, number]) => `${((a[0] + b[0]) / 2).toFixed(2)} ${((a[1] + b[1]) / 2).toFixed(2)}`
  let d = `M${mid(p(n - 1), p(0))}`
  for (let i = 0; i < n; i++) d += `Q${p(i)[0].toFixed(2)} ${p(i)[1].toFixed(2)} ${mid(p(i), p(i + 1))}`
  return `${d}Z`
}

export function Wax({ size = 16 }: { size?: number }) {
  const R = size * 0.42
  return (
    <g className="mg-wax">
      <path className="mg-wax-shadow" d={waxPath(size)} transform={`translate(0 ${size * 0.05})`} />
      <path className="mg-wax-body" d={waxPath(size)} />
      <circle className="mg-wax-ring" r={R * 0.68} strokeWidth={Math.max(0.6, size * 0.03)} />
      <text className="mg-wax-l" x={0} y={size * 0.15} fontSize={size * 0.42} textAnchor="middle">
        L
      </text>
    </g>
  )
}

/** The pointer, with its tip at (0, 0). The inner group is what presses. */
export function Pointer({ k = 1 }: { k?: number }) {
  return (
    <g className="mg-pointer" transform={k === 1 ? undefined : `scale(${k})`}>
      <path d="M0 0V13.2L3.4 10.1 5.8 15.4 8.1 14.4 5.8 9.2H10.3Z" />
    </g>
  )
}

/** The diagonal hatch of a sealed area, in vermilion, and the finer ink hatch the price discs wear. */
export function Hatches({ sealed, ink }: { sealed?: string; ink?: string }) {
  return (
    <defs>
      {sealed && (
        <pattern id={sealed} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line className="mg-hatch-sealed" x1="0" y1="0" x2="0" y2="5" />
        </pattern>
      )}
      {ink && (
        <pattern id={ink} width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line className="mg-hatch-ink" x1="0" y1="0" x2="0" y2="3.2" />
        </pattern>
      )}
    </defs>
  )
}

// The land: Meridian, the sample company, as one country of six counties. Its coast and borders are generated once, from fixed
// seeds, so every graphic shows the same island.

type Pt = readonly [number, number]
const TAU = Math.PI * 2

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** A wandering line from a to b, pinned at both ends, so a corner three counties share stays where it is. */
function wander(a: Pt, b: Pt, amp: number, seed: number): Pt[] {
  const r = seeded(seed)
  const waves = [
    [1.2, 1],
    [2.6, 0.5],
    [5.3, 0.22],
    [9.7, 0.1],
  ].map(([f, w]) => ({ f: f * (0.8 + r() * 0.4), w, p: r() * TAU }))
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const n = Math.max(2, Math.ceil(len / 2.5))
  const nx = -(b[1] - a[1]) / len
  const ny = (b[0] - a[0]) / len
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const off = (waves.reduce((s, w) => s + w.w * Math.sin(TAU * w.f * ((t * len) / 100) + w.p), 0) / 1.82) * amp * Math.sin(Math.PI * t) ** 0.6
    out.push([a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + ny * off])
  }
  return out
}

const d = (pts: Pt[], close: boolean) => `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}${close ? 'Z' : ''}`

function buildLand(vertices: Record<string, Pt>, counties: Record<string, string[]>, coast: number, border: number) {
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const uses = new Map<string, number>()
  for (const ring of Object.values(counties)) ring.forEach((v, i) => uses.set(key(v, ring[(i + 1) % ring.length]), (uses.get(key(v, ring[(i + 1) % ring.length])) ?? 0) + 1))
  const lines = new Map<string, Pt[]>()
  const line = (a: string, b: string) => {
    const k = key(a, b)
    let pts = lines.get(k)
    if (!pts) {
      const [p, q] = a < b ? [a, b] : [b, a]
      pts = wander(vertices[p], vertices[q], uses.get(k) === 1 ? coast : border, hash(k))
      lines.set(k, pts)
    }
    return a < b ? pts : [...pts].reverse()
  }
  const shapes: Record<string, string> = {}
  for (const [id, ring] of Object.entries(counties)) {
    const pts: Pt[] = []
    ring.forEach((v, i) => pts.push(...line(v, ring[(i + 1) % ring.length]).slice(0, -1)))
    shapes[id] = d(pts, true)
  }
  const borders = [...uses].filter(([, n]) => n > 1).map(([k]) => d(lines.get(k)!, false)).join('')
  return { shapes, land: Object.values(shapes).join(''), borders }
}

const V: Record<string, Pt> = {
  c0: [36, 80],
  c1: [96, 58],
  t1: [162, 62],
  c2: [236, 52],
  t2: [316, 60],
  c3: [392, 56],
  c4: [450, 92],
  r1: [458, 168],
  c6: [444, 258],
  c7: [384, 290],
  b2: [320, 282],
  c8: [252, 290],
  b1: [186, 284],
  c9: [92, 288],
  c10: [28, 258],
  l1: [22, 166],
  m1: [160, 168],
  m1b: [182, 172],
  m2: [306, 170],
  m2b: [326, 166],
}

export const LAND = buildLand(
  V,
  {
    brand: ['c0', 'c1', 't1', 'm1', 'l1'],
    product: ['t1', 'c2', 't2', 'm2', 'm1b', 'm1'],
    engineering: ['t2', 'c3', 'c4', 'r1', 'm2b', 'm2'],
    legal: ['l1', 'm1', 'm1b', 'b1', 'c9', 'c10'],
    people: ['m1b', 'm2', 'm2b', 'b2', 'c8', 'b1'],
    money: ['m2b', 'r1', 'c6', 'c7', 'b2'],
  },
  7,
  3.2,
)

export interface Item {
  kind: Kind
  label: string
  x: number
  y: number
}

export interface Tool {
  id: string
  /** Its monogram. Never a logo. */
  letter: string
  /** Meridian's own tools, as the sample company has them. */
  name: string
  x: number
  y: number
  /** A month, in dollars. */
  price: number
  /** Where its disc stands when prices are spread over the map. */
  disc: [number, number]
}

export interface County {
  id: keyof typeof LAND.shapes & string
  name: string
  x: number
  /** The name's baseline. */
  y: number
  items: Item[]
  tools: Tool[]
}

export const CW = 0.6

/** Meridian as a laptop shows it: three items to an area, small type, tiles beside them. */
const COUNTIES_WIDE: County[] = [
  {
    id: 'brand',
    name: 'Brand',
    x: 50,
    y: 92,
    items: [
      { kind: 'rule', label: 'Voice', x: 52, y: 122 },
      { kind: 'rule', label: 'No jargon', x: 52, y: 138 },
      { kind: 'fact', label: 'Tagline', x: 52, y: 154 },
    ],
    tools: [{ id: 'figma', letter: 'F', name: 'Figma', x: 140, y: 126, price: 64, disc: [124, 134] }],
  },
  {
    id: 'product',
    name: 'Product',
    x: 180,
    y: 90,
    items: [
      { kind: 'spec', label: 'Roadmap', x: 182, y: 120 },
      { kind: 'spec', label: 'Onboarding', x: 182, y: 136 },
      { kind: 'decision', label: 'No native app', x: 182, y: 152 },
    ],
    tools: [
      { id: 'notion', letter: 'N', name: 'Notion', x: 286, y: 118, price: 132, disc: [236, 128] },
      { id: 'linear', letter: 'L', name: 'Linear', x: 286, y: 140, price: 80, disc: [278, 146] },
    ],
  },
  {
    id: 'engineering',
    name: 'Engineering',
    x: 330,
    y: 90,
    items: [
      { kind: 'spec', label: 'API rules', x: 332, y: 120 },
      { kind: 'fact', label: 'Deploy', x: 332, y: 136 },
      { kind: 'rule', label: 'Tests first', x: 332, y: 152 },
    ],
    tools: [
      { id: 'anthropic', letter: 'A', name: 'Anthropic', x: 432, y: 114, price: 1180, disc: [392, 138] },
      { id: 'vercel', letter: 'V', name: 'Vercel', x: 432, y: 134, price: 148, disc: [438, 121] },
      { id: 'sentry', letter: 'S', name: 'Sentry', x: 432, y: 154, price: 58, disc: [434, 148] },
    ],
  },
  {
    id: 'legal',
    name: 'Legal',
    x: 42,
    y: 200,
    items: [
      { kind: 'contract', label: 'Customer terms', x: 52, y: 230 },
      { kind: 'clause', label: 'Liability cap', x: 52, y: 246 },
      { kind: 'doc', label: 'Privacy policy', x: 52, y: 262 },
    ],
    tools: [],
  },
  {
    id: 'people',
    name: 'People',
    x: 200,
    y: 202,
    items: [
      { kind: 'doc', label: 'Team handbook', x: 202, y: 232 },
      { kind: 'spec', label: 'Hiring plan', x: 202, y: 248 },
    ],
    tools: [
      { id: 'google', letter: 'G', name: 'Google Workspace', x: 300, y: 230, price: 154, disc: [230, 250] },
      { id: 'deel', letter: 'D', name: 'Deel', x: 300, y: 252, price: 98, disc: [279, 256] },
    ],
  },
  {
    id: 'money',
    name: 'Money',
    x: 340,
    y: 200,
    items: [
      { kind: 'decision', label: 'Pricing', x: 342, y: 230 },
      { kind: 'fact', label: 'Revenue', x: 342, y: 246 },
      { kind: 'fact', label: 'Runway', x: 342, y: 262 },
    ],
    tools: [
      { id: 'stripe', letter: 'S', name: 'Stripe', x: 432, y: 228, price: 1240, disc: [388, 250] },
      { id: 'xero', letter: 'X', name: 'Xero', x: 432, y: 252, price: 59, disc: [434, 226] },
    ],
  },
]

/** Meridian on a phone: the same land, two items to an area in words large enough to read, and the tiles that fit. */
const NARROW_PLACES: Record<string, { y: number; items: Item[]; tools: Record<string, [number, number]> }> = {
  brand: { y: 90, items: [{ kind: 'rule', label: 'Voice', x: 50, y: 128 }, { kind: 'rule', label: 'No jargon', x: 50, y: 149 }], tools: { figma: [146, 112] } },
  product: { y: 88, items: [{ kind: 'spec', label: 'Roadmap', x: 182, y: 126 }, { kind: 'spec', label: 'Onboarding', x: 182, y: 147 }], tools: { notion: [292, 110], linear: [292, 130] } },
  engineering: { y: 88, items: [{ kind: 'spec', label: 'API rules', x: 332, y: 126 }, { kind: 'fact', label: 'Deploy', x: 332, y: 147 }], tools: { anthropic: [438, 124], vercel: [438, 146] } },
  legal: { y: 198, items: [{ kind: 'contract', label: 'Terms', x: 60, y: 236 }, { kind: 'clause', label: 'Liability', x: 60, y: 257 }], tools: {} },
  people: { y: 200, items: [{ kind: 'doc', label: 'Handbook', x: 202, y: 238 }, { kind: 'spec', label: 'Hiring plan', x: 202, y: 259 }], tools: { google: [306, 214], deel: [306, 236] } },
  money: { y: 198, items: [{ kind: 'decision', label: 'Pricing', x: 342, y: 236 }, { kind: 'fact', label: 'Revenue', x: 342, y: 257 }], tools: { stripe: [436, 226], xero: [430, 254] } },
}

const COUNTIES_NARROW: County[] = COUNTIES_WIDE.map((c) => {
  const n = NARROW_PLACES[c.id]
  return {
    ...c,
    y: n.y,
    items: n.items,
    tools: c.tools.flatMap((t) => (n.tools[t.id] ? [{ ...t, x: n.tools[t.id][0], y: n.tools[t.id][1] }] : [])),
  }
})

/** How the map's words and marks are sized, for the width the graphic is shown at. */
export interface Look {
  narrow: boolean
  name: number
  sub: number
  /** How far under a county's name its second line sits. */
  subDy: number
  item: number
  glyph: number
  tile: number
  pointer: number
  wax: number
  counties: County[]
  /** The island's own crop, without the empty sea round it on a phone. */
  viewBox: string
}

export const WIDE: Look = { narrow: false, name: 14.5, sub: 9, subDy: 13, item: 9.2, glyph: 9, tile: 11, pointer: 1, wax: 15, counties: COUNTIES_WIDE, viewBox: `0 0 ${W} ${H}` }
export const NARROW: Look = { narrow: true, name: 17, sub: 13.5, subDy: 16, item: 13.5, glyph: 12, tile: 16, pointer: 1.3, wax: 19, counties: COUNTIES_NARROW, viewBox: '14 4 452 292' }

/** Phones get the narrow look: nothing written on a graphic is under 11 CSS pixels there. Read once, as the graphic is first drawn. */
export function useNarrow(): boolean {
  const [narrow] = useState(() => typeof matchMedia === 'function' && matchMedia('(max-width: 720px)').matches)
  return narrow
}

export function useLook(): Look {
  return useNarrow() ? NARROW : WIDE
}

/** All of Meridian's tools, wherever they stand. */
export const TOOLS = COUNTIES_WIDE.flatMap((c) => c.tools.map((t) => ({ ...t, county: c.id })))

export const discRadius = (price: number) => 6 + 1.9 * Math.sqrt(price / 10)
export const money = (n: number) => `$${n.toLocaleString('en-US')}`

/** One county's land, for laying a sealed look over. */
export const shapeOf = (id: string) => LAND.shapes[id]

/** Where an item's label ends, for what stands after it. */
export const itemEnd = (look: Look, it: Item) => it.x + look.glyph + 4.5 + it.label.length * look.item * CW

/** The island: land, dashed borders, and optionally the names, items and tiles of each county, each tagged so a graphic can move it. */
export function Island({ look, names = true, items = true, tools = true, extra, off, nameSize, itemsOff = false }: { look: Look; names?: boolean; items?: boolean; tools?: boolean; extra?: (c: County) => ReactNode; off?: Set<string>; nameSize?: number; itemsOff?: boolean }) {
  const g = look.glyph
  return (
    <g className="mg-island">
      <path className="mg-land" data-land="" d={LAND.land} />
      <path className="mg-border" data-borders="" d={LAND.borders} />
      {look.counties.map((c) => (
        <g key={c.id} data-county={c.id}>
          {names && (
            <text className="mg-name" data-name={c.id} x={c.x} y={c.y} fontSize={nameSize ?? look.name} data-off={off?.has(c.id) ? '' : undefined}>
              {c.name}
            </text>
          )}
          {extra?.(c)}
          {items &&
            c.items.map((it, i) => (
              <g key={i} transform={`translate(${it.x} ${it.y})`}>
                <g className="mg-item" data-item={`${c.id}-${i}`} data-county-of={c.id} data-off={itemsOff || off?.has(c.id) ? '' : undefined}>
                  <g transform={`translate(${g / 2} ${-g / 3})`}>
                    <Glyph kind={it.kind} size={g} />
                  </g>
                  <text x={g + 4.5} y={0} fontSize={look.item}>
                    {it.label}
                  </text>
                </g>
              </g>
            ))}
          {tools &&
            c.tools.map((t) => (
              <g key={t.id} transform={`translate(${t.x} ${t.y})`}>
                <g className="mg-tool" data-tool={t.id} data-county-of={c.id} data-off={off?.has(c.id) ? '' : undefined}>
                  <Tile letter={t.letter} size={look.tile} />
                </g>
              </g>
            ))}
        </g>
      ))}
    </g>
  )
}

/** Where a county's name ends, so a seal can be pressed beside it. */
export const nameEnd = (look: Look, c: County) => c.x + c.name.length * look.name * CW
