/*
  Locus marks: one engine, five variants, one squircle.

  Cycle 2. Every mark is authored as curves: rings, offsets and coasts built from a few nodes each
  and joined with centripetal Catmull-Rom into cubic Béziers, or from lines and arcs. The geometry is
  a function of time, so the same drawing gives the still file (small and editable), the loop and
  the intro. The traced engine of cycle 1 (marching squares over a height field) is kept at the
  bottom of this file for sketching; no mark uses it now.

  A frame is a plain tree of SVG descriptors: { el, ...attributes, kids }. Colours are '@keys' into
  the variant's palette, and ids are local, prefixed per instance. The page patches live SVGs from
  the tree and the download serialises the same tree, so the still and the moving mark are one
  drawing.

  Time. A variant loops over `period` seconds and draws a frame from t in [0, 1).
  - A variant with `flow` (seconds per contour interval) moves by flowing: its time only runs while
    motion is on, and when motion goes off it finishes the interval and settles on the still.
  - Any other variant blends: `amp` (0..1) scales how far it strays from the still.
  - `live` (0..1) follows the motion switch too, eased; Tide's sea turns blue with it.
  - `p` is the one-shot intro's progress, and 1 means the intro is over.

  Size. A mark draws itself per tier (L for the large mark, then M 96, S 48, XS 32, XXS 16), so a
  small one can drop contours and thicken its lines. PX is pixels per unit at each tier's size.
*/

const TAU = Math.PI * 2

/* ---------- small maths ---------- */

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, k) => a + (b - a) * k
/** Smoothstep from a to b. a may be larger than b, for a step down. */
export const smooth = (a, b, v) => {
  const k = clamp((v - a) / (b - a))
  return k * k * (3 - 2 * k)
}
/** A sine that is periodic in t over [0, 1), so every loop closes on itself. */
const wave = (t, f = 1, ph = 0) => Math.sin(TAU * f * t + ph)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

/** CSS's cubic-bezier(), as a function of progress. */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const X = (t) => ((ax * t + bx) * t + cx) * t
  const Y = (t) => ((ay * t + by) * t + cy) * t
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let lo = 0
    let hi = 1
    let t = x
    for (let i = 0; i < 40; i++) {
      if (X(t) < x) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return Y(t)
  }
}
/** The product's ease-out, and an in-out for a stroke being written. */
export const OUT = cubicBezier(0.23, 1, 0.32, 1)
export const INOUT = cubicBezier(0.65, 0, 0.35, 1)
/** Eased progress of a step that runs from a to b seconds. */
const step = (s, a, b, ease = OUT) => ease(clamp((s - a) / (b - a)))
/** The time at which an eased 0..1 run over `dur` seconds reaches v. */
function reach(ease, v, dur) {
  if (v <= 0) return 0
  if (v >= 1) return Infinity
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2
    if (ease(m) < v) lo = m
    else hi = m
  }
  return hi * dur
}

/* ---------- curves ---------- */

const R = (v) => Math.round(v * 100) / 100
const pt = (p) => `${R(p[0])} ${R(p[1])}`

/** Centripetal Catmull-Rom through the points, written as cubic Béziers. */
export function curve(pts, closed = true, move = true) {
  const n = pts.length
  if (n < 2) return ''
  let s = move ? `M${pt(pts[0])}` : ''
  const at = closed ? (i) => pts[(i + n) % n] : (i) => pts[Math.max(0, Math.min(n - 1, i))]
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const a1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    const a2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    const a3 = Math.hypot(p3[0] - p2[0], p3[1] - p2[1])
    const d1 = Math.sqrt(a1)
    const d2 = Math.sqrt(a2)
    const d3 = Math.sqrt(a3)
    let b1, b2
    if (a1 < 1e-6) b1 = [p1[0] + (p2[0] - p1[0]) / 3, p1[1] + (p2[1] - p1[1]) / 3]
    else {
      const k = 3 * d1 * (d1 + d2)
      const m = 2 * a1 + 3 * d1 * d2 + a2
      b1 = [(a1 * p2[0] - a2 * p0[0] + m * p1[0]) / k, (a1 * p2[1] - a2 * p0[1] + m * p1[1]) / k]
    }
    if (a3 < 1e-6) b2 = [p2[0] + (p1[0] - p2[0]) / 3, p2[1] + (p1[1] - p2[1]) / 3]
    else {
      const k = 3 * d3 * (d3 + d2)
      const m = 2 * a3 + 3 * d3 * d2 + a2
      b2 = [(a3 * p1[0] - a2 * p3[0] + m * p2[0]) / k, (a3 * p1[1] - a2 * p3[1] + m * p2[1]) / k]
    }
    s += `C${pt(b1)} ${pt(b2)} ${pt(p2)}`
  }
  return closed ? s + 'Z' : s
}

/** n points round (cx, cy), from angle a0, clockwise on screen. r(a) is the radius at angle a. */
function around(cx, cy, n, a0, r) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU
    const rr = r(a)
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)])
  }
  return pts
}

const R4 = (v) => Math.round(v * 1e4) / 1e4
/**
 * Stroke attributes that write a path on from `start` (a fraction of its length); k runs 0..1.
 * Nothing extra once written. pathLength on a <use> is ignored, harmlessly; the referenced path carries
 * its own while drawing.
 */
function drawOn(k, start = 0) {
  if (k >= 1) return {}
  if (k <= 0.001) return { pathLength: 1, 'stroke-dasharray': '0 1', 'stroke-opacity': 0 }
  if (!start) return { pathLength: 1, 'stroke-dasharray': `${R4(k)} 1` }
  return { pathLength: 1, 'stroke-dasharray': `${R4(k)} ${R4(1 - k)}`, 'stroke-dashoffset': R4(-start) }
}
/** The same, written both ways at once from the start of a closed path. */
function drawBoth(k) {
  if (k >= 1) return {}
  if (k <= 0.001) return { pathLength: 1, 'stroke-dasharray': '0 1', 'stroke-opacity': 0 }
  const h = R(k * 5e3) / 1e4
  return { pathLength: 1, 'stroke-dasharray': `${h} ${R((1 - 2 * h) * 1e4) / 1e4} ${h} 0` }
}
/** The same, written both ways from the middle of an open path. */
function drawMiddle(k) {
  if (k >= 1) return {}
  if (k <= 0.001) return { pathLength: 1, 'stroke-dasharray': '0 1', 'stroke-opacity': 0 }
  const g = R(((1 - k) / 2) * 1e4) / 1e4
  return { pathLength: 1, 'stroke-dasharray': `0 ${g} ${R(k * 1e4) / 1e4} 1` }
}

/** A mark pressed into place over 0.28 s: it lands a little large and settles. s is seconds since it began. */
function press(s, from = 1.18) {
  if (s <= 0) return { s: from, o: 0 }
  return { s: lerp(from, 1, step(s, 0, 0.28)), o: clamp(s / 0.1) }
}

/* ---------- the squircle ---------- */

/** A superellipse |x|^n + |y|^n = 1. At n = 5 it has the continuous corners of an app icon. */
export const SQUIRCLE_N = 5

/**
 * The squircle as `count` cubic segments: nodes evenly spaced along the edge, each control point on the
 * edge's own tangent a third of the way to the next node (a Hermite fit), so 24 segments hold it to
 * well under a hundredth of a unit.
 */
function squircleD(n = SQUIRCLE_N, count = 24) {
  const M = 4096
  const dense = []
  for (let k = 0; k < M; k++) {
    const a = (k / M) * TAU
    const c = Math.cos(a)
    const s = Math.sin(a)
    dense.push([50 + 50 * Math.sign(c) * Math.abs(c) ** (2 / n), 50 + 50 * Math.sign(s) * Math.abs(s) ** (2 / n)])
  }
  // Even steps along the edge, so the spline is as calm on the flats as in the corners.
  const len = [0]
  for (let k = 1; k <= M; k++) {
    const p = dense[k % M]
    const q = dense[k - 1]
    len.push(len[k - 1] + Math.hypot(p[0] - q[0], p[1] - q[1]))
  }
  const total = len[M]
  const nodes = []
  let j = 0
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total
    while (len[j + 1] < target) j++
    const f = (target - len[j]) / (len[j + 1] - len[j])
    const p = dense[j]
    const q = dense[(j + 1) % M]
    const a = dense[(j - 2 + M) % M]
    const b = dense[(j + 3) % M]
    const tl = Math.hypot(b[0] - a[0], b[1] - a[1])
    nodes.push({ p: [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f], t: [(b[0] - a[0]) / tl, (b[1] - a[1]) / tl] })
  }
  const h = total / count / 3
  let d = `M${pt(nodes[0].p)}`
  for (let k = 0; k < count; k++) {
    const A = nodes[k]
    const B = nodes[(k + 1) % count]
    d += `C${pt([A.p[0] + A.t[0] * h, A.p[1] + A.t[1] * h])} ${pt([B.p[0] - B.t[0] * h, B.p[1] - B.t[1] * h])} ${pt(B.p)}`
  }
  return d + 'Z'
}

export const SQUIRCLE = squircleD()

export const PX = { L: 2.8, M: 0.96, S: 0.48, XS: 0.32, XXS: 0.16 }
export const TIERS = ['L', 'M', 'S', 'XS', 'XXS']
const SMALL = new Set(['S', 'XS', 'XXS'])
export const tierFor = (size) => (size >= 160 ? 'L' : size >= 72 ? 'M' : size >= 40 ? 'S' : size >= 24 ? 'XS' : 'XXS')

/* ---------- islands ---------- */

/**
 * An island: a tilted ellipse with gentle lobes, as a radius at each angle round its centre. Lobes are
 * [amplitude, count, phase]; dents are [depth in units, angle, width in radians], each a bay. `soft`
 * scales both, so contours nearer the summit can be rounder.
 */
function island({ a, b, tilt, lobes, dents = [] }) {
  return (th, soft = 1) => {
    const u = th - tilt
    const e = (a * b) / Math.hypot(b * Math.cos(u), a * Math.sin(u))
    let w = 0
    for (const [amp, k, ph] of lobes) w += amp * Math.cos(k * th + ph)
    let r = e * (1 + soft * w)
    for (const [depth, at, width] of dents) r -= soft * depth * Math.exp(-((wrap(th - at) / width) ** 2))
    return r
  }
}

/* ======================================================================
   The five variants
   ====================================================================== */

/* 1. Summit: one hill whose contours run forever into a single still point. */
const SW = (3 * Math.PI) / 4 // south-west, on screen
const summit = {
  id: 'summit',
  name: 'Summit',
  idea: 'One hill whose contours run forever into a single still point.',
  period: 14,
  flow: 3.5,
  introDur: 1.3,
  palettes: {
    light: { ground: '#fcfdfd', edge: 'rgba(21,25,30,0.12)', line: '#15191e', dot: '#15191e' },
    dark: { ground: '#1a212a', edge: 'rgba(232,230,223,0.14)', edgeS: 'rgba(232,230,223,0.18)', line: '#e8e6df', dot: '#e8e6df' },
  },
  // n rings in the still; dot radius; r0 where a ring ends at the dot (1.5 × the dot); grow: how far a
  // ring at λ = 1 reaches on the steep north-east face (the south-west face reaches about twice as far);
  // tri: how three-cornered the rings are.
  spec: {
    L: { n: 4, dot: 3.6, sw: 0.72, r0: 5.4, grow: 22.5, dent: 0.11, tri: 0.07 },
    M: { n: 3, dot: 5, sw: 1.3, r0: 7.5, grow: 25, dent: 0.1, tri: 0.07 },
    S: { n: 2, dot: 7, sw: 2.4, r0: 10.5, grow: 28, dent: 0.08, tri: 0.07 },
    XS: { n: 2, dot: 7.5, sw: 4.6, r0: 9, grow: 30, dent: 0, tri: 0, lean: 1.5 },
    XXS: { n: 1, dot: 12, sw: 8.6, r0: 13, grow: 33, dent: 0, tri: 0.26, lean: 1.6 },
  },
  /**
   * The ring shape: about 1 on the steep north-east face and 2 on the gentle south-west, a soft
   * rounded triangle (corners south-west, north and east), and one shallow dent to the west. `lean`
   * makes the gentle side longer still, for the 16 px ring.
   */
  q(a, sp) {
    const f = a - SW
    const lean = sp.lean || 1
    return 1.4167 + 0.5 * lean * Math.cos(f) + 0.0833 * Math.cos(2 * f) + sp.tri * Math.cos(3 * f) - sp.dent * Math.exp(-((wrap(a - Math.PI) / 0.55) ** 2))
  },
  ring(P, sp, lam) {
    // Twelve nodes, on the triangle's corners and between them, starting on the north-east face.
    return around(P[0], P[1], 12, -Math.PI / 4, (a) => sp.r0 + lam * sp.grow * this.q(a, sp))
  },
  /** Where the point sits, per tier: so the outermost ring of the still is centred in the tile. */
  origin(tier) {
    const cache = (this._origin ||= {})
    if (cache[tier]) return cache[tier]
    const sp = this.spec[tier]
    const lam = sp.n / (sp.n + 1)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * TAU
      const r = sp.r0 + lam * sp.grow * this.q(a, sp) + sp.sw / 2
      x0 = Math.min(x0, r * Math.cos(a))
      x1 = Math.max(x1, r * Math.cos(a))
      y0 = Math.min(y0, r * Math.sin(a))
      y1 = Math.max(y1, r * Math.sin(a))
    }
    return (cache[tier] = [50 - (x0 + x1) / 2, 50 - (y0 + y1) / 2])
  },
  frame({ t, p, tier }) {
    const sp = this.spec[tier]
    const N = sp.n
    const P = this.origin(tier)
    const s = p * this.introDur
    // One contour interval per `flow` seconds: every ring moves one place in towards the point.
    const phi = p < 1 ? 0 : ((t * this.period) / this.flow) % 1
    const kids = []
    for (let j = 0; j <= N; j++) {
      const lam = 1 - (j + phi) / (N + 1)
      // Born at the rim over the first 15% of its travel, gone over the last 15%, as it reaches 1.5 × the dot.
      let op = smooth(1, 0.85, lam) * smooth(0, 0.15, lam)
      let draw = {}
      if (p < 1) {
        if (j === 0) op = 0
        else {
          const k = N - j // innermost first, each starting 25° further round, so the starts don't line up
          draw = drawOn(step(s, 0.25 + 0.12 * k, 0.75 + 0.12 * k), (k * 25) / 360)
        }
      }
      kids.push({ el: 'path', d: curve(this.ring(P, sp, lam)), fill: 'none', stroke: '@line', 'stroke-width': sp.sw, 'stroke-linecap': 'round', opacity: R(op * 1000) / 1000, ...draw })
    }
    // The point is pressed first: 0.6 → 1.08 → 1 over 0.28 s.
    let sc = 1
    let o = 1
    if (p < 1) {
      const k = s / 0.28
      sc = k < 0.6 ? lerp(0.6, 1.08, OUT(k / 0.6)) : lerp(1.08, 1, INOUT((k - 0.6) / 0.4))
      o = clamp(s / 0.1)
    }
    kids.push({ el: 'circle', cx: R(P[0]), cy: R(P[1]), r: R(sp.dot * sc * 100) / 100, fill: '@dot', opacity: o })
    return { kids }
  },
}

/* 2. Tide: an island in a still grey sea. Going live is a moment: the sea floods blue out from the coast. */
const tide = {
  id: 'tide',
  name: 'Tide',
  idea: 'An island in a still grey sea. Going live is a moment: the sea floods blue out from the coast.',
  period: 12,
  introDur: 1.2,
  live: true,
  liveDur: 1.1,
  palettes: {
    light: { ground: '#e2e6ea', groundS: '#d5dce2', edge: 'rgba(21,25,30,0.14)', live: '#c4daee', land: '#fcfdfd', line: '#15191e', coast: 'rgba(21,25,30,0.45)', under: 'rgba(21,25,30,0.2)', water: '#3b78b8' },
    dark: { ground: '#161c24', groundS: '#202833', edge: 'rgba(232,230,223,0.12)', edgeS: 'rgba(232,230,223,0.18)', live: '#143049', land: '#e8e6df', line: '#15191e', coast: 'rgba(21,25,30,0.45)', under: 'rgba(232,230,223,0.2)', water: '#7fb0e0' },
  },
  // Contours as λ: 0 at the summit, 1 the still coast, above 1 under the sea. scale grows the island at small sizes.
  spec: {
    L: { lines: [0.25, 0.5, 0.75, 1.13], sw: 0.5, coast: 0.55, wl: 0.6, islet: true, scale: 1 },
    M: { lines: [0.33, 0.67, 1.13], sw: 1.1, coast: 1.1, wl: 1.1, islet: true, scale: 1 },
    S: { lines: [0.6], sw: 2.1, coast: 2.1, wl: 2.1, islet: false, scale: 1.08 },
    XS: { lines: [0.6], sw: 3.1, coast: 3.1, wl: 3.1, islet: false, scale: 1.14, ground: '@groundS' },
    XXS: { lines: [], sw: 0, coast: 6.2, wl: 6.2, islet: false, scale: 1.22, ground: '@groundS' },
  },
  C: [50, 52],
  S: [46, 49],
  coast: island({ a: 30, b: 23, tilt: -0.26, lobes: [[0.05, 2, 0.6], [0.045, 3, 2.2], [0.035, 5, 0.9], [0.018, 7, 2.8]] }),
  I: [80.5, 22.5],
  // The islet is a lower hill: it floods at half the island's height.
  isletR: (th) => 5.2 * (1 + 0.1 * Math.cos(2 * th + 1) + 0.05 * Math.cos(3 * th + 2)),
  /** The island's contour at λ, as sixteen nodes. */
  contour(lam, k) {
    const [cx, cy] = this.C
    const [sx, sy] = this.S
    const soft = Math.min(1, lam) ** 1.3
    return around(cx, cy, 16, 0.2, (th) => this.coast(th, soft) * k).map(([x, y]) => [sx + lam * (x - sx), sy + lam * (y - sy)])
  },
  islet(mu) {
    return around(this.I[0], this.I[1], 8, 0, (th) => mu * this.isletR(th))
  },
  frame({ t, amp, p, tier, live }) {
    const sp = this.spec[tier]
    const s = p * this.introDur
    // The coast, as λ: the still coast is 1. On the intro the sea drains from the summit down.
    const ls = p < 1 ? OUT(p) : 1 - 0.15 * amp * wave(t)
    const mu = 1 - (1 - ls) / 0.5 // the islet's coast on the same sea
    // The flood: going live, blue runs out from the coast to the edge of the tile.
    const k = INOUT(live)
    // How far each contour has surfaced: crossed over 0.25 s on the intro, or over a small band of tide.
    // Any contour the coast is crossing melts into it, so the two never print side by side.
    const up = (c) => (p < 1 ? clamp((s - reach(OUT, c, this.introDur)) / 0.25) : smooth(-0.02, 0.02, ls - c))
    const melt = (c) => (p < 1 ? 1 : smooth(0, 0.05, Math.abs(ls - c)))
    const lines = sp.lines.map((c) => ({ d: curve(this.contour(c, sp.scale)), k: up(c), m: melt(c) }))
    if (sp.islet) lines.push({ d: curve(this.islet(1.25)), k: up(1.125), m: melt(1.125) })
    const sw = sp.sw
    const o = (v) => R(v * 1000) / 1000
    const under = []
    const over = []
    for (const { d, k: kc, m } of lines) {
      under.push({ el: 'path', d, stroke: '@under', 'stroke-width': sw, opacity: o((1 - kc) * m * (1 - k)) })
      under.push({ el: 'path', d, stroke: '@water', 'stroke-width': sw, opacity: o(0.5 * (1 - kc) * m * k) })
      over.push({ el: 'path', d, stroke: '@line', 'stroke-width': sw, opacity: o(0.45 * kc * m) })
    }
    const coast = ls > 0.01 ? curve(this.contour(ls, sp.scale)) : 'M0 0'
    const isle = sp.islet && mu > 0.02 ? curve(this.islet(mu)) : 'M0 0'
    const flood = k > 0.001 ? curve(this.contour(lerp(Math.max(ls, 0.01), 3.4, k), sp.scale)) : 'M0 0'
    return {
      ground: sp.ground,
      kids: [
        { el: 'path', d: flood, fill: '@live', opacity: k > 0.001 ? 1 : 0 },
        { el: 'g', fill: 'none', kids: under },
        { el: 'path', d: coast, fill: '@land' },
        sp.islet ? { el: 'path', d: isle, fill: '@land' } : { el: 'g' },
        { el: 'path', d: coast + (sp.islet ? isle : ''), fill: 'none', stroke: '@coast', 'stroke-width': sp.coast, 'stroke-linejoin': 'round', opacity: o(1 - k) },
        { el: 'path', d: coast + (sp.islet ? isle : ''), fill: 'none', stroke: '@water', 'stroke-width': sp.wl, 'stroke-linejoin': 'round', opacity: o(0.85 * k) },
        { el: 'g', fill: 'none', kids: over },
      ],
    }
  },
}

/* 3. Counties: three counties of one island, one of them sealed. Only the open land moves. */
const counties = {
  id: 'counties',
  name: 'Counties',
  idea: 'Three counties of one island, one sealed. The open land’s contours run inland and stop at the seal.',
  period: 12,
  flow: 6,
  introDur: 1.6,
  palettes: {
    light: { ground: '#d5dce2', edge: 'none', land: '#fcfdfd', line: '#15191e', seal: '#d63c27', tint: '#fbe9e4', solid: '#f0b2a5' },
    dark: { ground: '#232c37', edge: 'rgba(232,230,223,0.14)', edgeS: 'rgba(232,230,223,0.18)', land: '#e8e6df', line: '#15191e', seal: '#ea5a44', tint: '#f3d6cf', solid: '#e9a093' },
  },
  // n open contours in the still. The seal's edge is the coast's weight: tint and hatch say "sealed".
  spec: {
    L: { n: 2, csw: 0.55, coast: 0.55, hatch: 2.3, hsw: 0.42, hop: 0.55, dash: '2.6 1.6', bsw: 0.65, esw: 0.55 },
    M: { n: 1, csw: 1.15, coast: 1.1, hatch: 3.4, hsw: 0.95, hop: 0.55, dash: '4.4 2.8', bsw: 1.2, esw: 1.1 },
    S: { n: 0, csw: 0, coast: 0, hatch: 5.5, hsw: 1.6, hop: 0.7, dash: '6 4.5', bsw: 2.1, esw: 2.1, fill: '@solid' },
    XS: { n: 0, csw: 0, coast: 0, hatch: 9.5, hsw: 3.1, hop: 0.85, dash: '', bsw: 0, esw: 3.1, fill: '@solid' },
    XXS: { n: 0, csw: 0, coast: 0, hatch: 0, dash: '', bsw: 0, esw: 0, fill: '@seal' },
  },
  C: [50, 51],
  S: [41, 45],
  J: [51, 50],
  coast: island({ a: 39, b: 33, tilt: -0.15, lobes: [[0.04, 3, 1.2], [0.028, 2, 2.4]], dents: [[5, 3.95, 0.32]] }),
  // The legs of the Y, as angles from the junction: uneven sectors (sealed 130°, then 93° and 137°),
  // so the island never reads as a pie or a box, and no two legs line up into one straight cut.
  // Sealed land lies clockwise from leg 0 to leg 1.
  legs: [-0.75, 1.52, 3.15],
  /** A leg's angle at distance r from the junction: it wanders sideways by up to 2 units, gently. */
  legAngle(i, r) {
    const ph = [0.4, 2.1, 4.0][i]
    const m = 2 * Math.sin((TAU * r) / 18 + ph) * smooth(0, 8, r)
    return this.legs[i] + m / Math.max(r, 10)
  },
  inLand(x, y) {
    const [cx, cy] = this.C
    return Math.hypot(x - cx, y - cy) < this.coast(Math.atan2(y - cy, x - cx))
  },
  inSealed(x, y) {
    const [jx, jy] = this.J
    const r = Math.hypot(x - jx, y - jy)
    const a = Math.atan2(y - jy, x - jx)
    return a > this.legAngle(0, r) && a < this.legAngle(1, r)
  },
  /** Leg i's points, from the junction to exactly where it meets the coast. */
  leg(i) {
    const [jx, jy] = this.J
    const at = (r) => [jx + r * Math.cos(this.legAngle(i, r)), jy + r * Math.sin(this.legAngle(i, r))]
    let lo = 0
    let hi = 80
    for (let k = 0; k < 40; k++) {
      const m = (lo + hi) / 2
      if (this.inLand(...at(m))) lo = m
      else hi = m
    }
    const pts = []
    const n = Math.max(4, Math.round(lo / 3.5))
    for (let k = 0; k <= n; k++) pts.push(at((k / n) * lo))
    return pts
  },
  /** The coast as 28 nodes from one point on it to another, clockwise round the island's centre. */
  arc(from, to) {
    const [cx, cy] = this.C
    const a = Math.atan2(from[1] - cy, from[0] - cx)
    let b = Math.atan2(to[1] - cy, to[0] - cx)
    while (b <= a) b += TAU
    const pts = [from]
    const stepA = TAU / 28
    for (let th = Math.ceil(a / stepA + 0.2) * stepA; th < b - 0.2 * stepA; th += stepA) {
      const r = this.coast(th)
      pts.push([cx + r * Math.cos(th), cy + r * Math.sin(th)])
    }
    pts.push(to)
    return pts
  },
  coastPts(lam = 1) {
    const [cx, cy] = this.C
    const [sx, sy] = this.S
    return around(cx, cy, 28, 0, (th) => this.coast(th, Math.min(1, lam) ** 1.3)).map(([x, y]) => [sx + lam * (x - sx), sy + lam * (y - sy)])
  },
  /** Diagonal hatch inside the sealed county, as segments. */
  hatch(gap) {
    const u = [Math.SQRT1_2, -Math.SQRT1_2]
    const nrm = [Math.SQRT1_2, Math.SQRT1_2]
    const inside = (x, y) => this.inLand(x, y) && this.inSealed(x, y)
    const segs = []
    for (let c = -76; c <= 76; c += gap) {
      const ox = 50 + c * nrm[0]
      const oy = 50 + c * nrm[1]
      const at = (s) => [ox + s * u[0], oy + s * u[1]]
      let start = null
      for (let s = -80; s <= 80; s += 0.4) {
        const inn = inside(...at(s))
        if (inn && start === null) start = s
        if ((!inn || s >= 79.8) && start !== null) {
          segs.push([at(start - 0.6), at(s + 0.2)])
          start = null
        }
      }
    }
    return segs
  },
  /** The parts that never move, built once. */
  fixed(tier) {
    const cache = (this._fixed ||= {})
    if (cache[tier]) return cache[tier]
    const sp = this.spec[tier]
    const legs = [0, 1, 2].map((i) => this.leg(i))
    const endA = legs[0][legs[0].length - 1]
    const endB = legs[1][legs[1].length - 1]
    const county = curve(legs[0], false) + curve(this.arc(endA, endB), false, false) + curve(legs[1].slice().reverse(), false, false) + 'Z'
    return (cache[tier] = { legs, county, coast: curve(this.coastPts()), hatch: sp.hatch ? this.hatch(sp.hatch) : [] })
  },
  /** A leg written out from the junction to fraction k of its length. */
  partial(pts, k) {
    if (k >= 1) return pts
    const len = [0]
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    const want = k * len[len.length - 1]
    const out = [pts[0]]
    for (let i = 1; i < pts.length; i++) {
      if (len[i] <= want) out.push(pts[i])
      else {
        const f = (want - len[i - 1]) / (len[i] - len[i - 1])
        out.push([lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)])
        break
      }
    }
    return out.length > 1 ? out : [pts[0], pts[0]]
  },
  frame({ t, p, tier }) {
    const sp = this.spec[tier]
    const fx = this.fixed(tier)
    const s = p * this.introDur
    const intro = p < 1
    const o = (v) => R(v * 1000) / 1000
    // The open land's contours run inland from the coast, one interval every 6 s, and die out at λ 0.2.
    // They pass under the sealed county, so they visibly run into the seal and stop.
    const phi = intro ? 0 : ((t * this.period) / this.flow) % 1
    const gap = 0.8 / (sp.n + 1)
    const contours = []
    for (let j = 0; j <= sp.n && sp.n; j++) {
      const lam = 1 - gap * (j + 1 + phi) + gap
      let op = smooth(1, 0.88, lam) * smooth(0.2, 0.32, lam)
      let draw = {}
      if (intro) {
        if (j === 0) op = 0
        else draw = drawOn(step(s, 0.55, 0.95))
      }
      contours.push({ el: 'path', d: curve(this.coastPts(lam)), opacity: o(op), ...draw })
    }
    // While the intro writes the coast and the seal's edge, their own pathLength is 1 so a dash can measure them.
    const len1 = intro ? { pathLength: 1 } : {}
    // The seal arrives as one hard wipe from the junction, across the county to the far coast.
    const wipe = intro ? lerp(-4, 60, step(s, 0.95, 1.3, INOUT)) : null
    const sealKids = [{ el: 'use', href: '#county', fill: sp.fill || '@tint' }]
    if (fx.hatch.length) sealKids.push({ el: 'path', d: fx.hatch.map(([a, b]) => `M${pt(a)}L${pt(b)}`).join(''), fill: 'none', stroke: '@seal', 'stroke-width': sp.hsw, opacity: sp.hop, 'clip-path': 'url(#sealed)' })
    const kids = [
      { el: 'use', href: '#coast', fill: '@land', opacity: intro ? o(step(s, 0.3, 0.6, INOUT)) : 1 },
    ]
    if (contours.length) kids.push({ el: 'g', fill: 'none', stroke: '@line', 'stroke-width': sp.csw, 'stroke-opacity': 0.45, 'clip-path': 'url(#land)', kids: contours })
    kids.push(intro ? { el: 'g', 'clip-path': 'url(#wipe)', kids: sealKids } : { el: 'g', kids: sealKids })
    if (sp.coast) kids.push({ el: 'use', href: '#coast', fill: 'none', stroke: '@line', 'stroke-width': sp.coast, 'stroke-linejoin': 'round', opacity: 0.45, ...(intro ? drawOn(step(s, 0, 0.45)) : {}) })
    // The Y: all three legs are written dashed on the intro; afterwards the sealed county's two are its edge.
    if (sp.bsw) {
      const k = intro ? step(s, 0.45, 0.85) : 1
      const legs = intro ? [0, 1, 2] : [2]
      kids.push({
        el: 'g', fill: 'none', stroke: '@line', 'stroke-width': sp.bsw, 'stroke-linecap': 'round', opacity: 0.9,
        ...(sp.dash ? { 'stroke-dasharray': sp.dash } : {}),
        kids: legs.map((i) => ({ el: 'path', d: curve(this.partial(fx.legs[i], k), false) })),
      })
    }
    if (sp.esw) kids.push({ el: 'use', href: '#county', fill: 'none', stroke: '@seal', 'stroke-width': sp.esw, 'stroke-linejoin': 'round', ...(intro ? drawOn(step(s, 1.3, 1.55)) : {}) })
    const [jx, jy] = this.J
    const deg = R((((this.legs[0] + this.legs[1]) / 2) * 180) / Math.PI)
    return {
      defs: [
        { el: 'path', id: 'coast', d: fx.coast, ...len1 },
        { el: 'path', id: 'county', d: fx.county, ...len1 },
        { el: 'clipPath', id: 'land', kids: [{ el: 'use', href: '#coast' }] },
        { el: 'clipPath', id: 'sealed', kids: [{ el: 'use', href: '#county' }] },
        ...(intro ? [{ el: 'clipPath', id: 'wipe', kids: [{ el: 'rect', x: -200, y: -200, width: R(200 + wipe), height: 400, transform: `translate(${jx} ${jy}) rotate(${deg})` }] }] : []),
      ],
      kids,
    }
  },
}

/* 4. Spur: the seal's L as a ridge, steep at its summit and opening as it falls, its contours flowing outward. */
const spur = {
  id: 'spur',
  name: 'Spur',
  idea: 'The seal’s L as a spur: steep at the top, opening as it falls, its contours flowing outward.',
  period: 9,
  flow: 3,
  introDur: 1.3,
  palettes: {
    light: { ground: '#15191e', edge: 'none', line: '#eef1f3' },
    dark: { ground: '#1a212a', edge: 'rgba(232,230,223,0.14)', edgeS: 'rgba(232,230,223,0.18)', line: '#e8e6df' },
  },
  // The crest is an L 44 tall with a 30 foot (Spline Sans Mono's proportions). Offsets keep `step`
  // along the stem and open to `taper` × that at the foot's tip. `index` is the offset drawn at twice
  // the weight, every third contour.
  spec: {
    L: { A: [37, 24], C: [37, 68], B: [67, 68], step: 5, n: 3, taper: 1.5, sw: 0.72, index: 2 },
    M: { A: [37.5, 25], C: [37.5, 67], B: [66.5, 67], step: 6.5, n: 2, taper: 1.5, sw: 1.3, index: 2 },
    S: { A: [38, 26], C: [38, 66], B: [66, 66], step: 8, n: 2, taper: 1.45, sw: 2.4, index: 0 },
    XS: { A: [39, 25], C: [39, 67], B: [66, 67], step: 11, n: 1, taper: 1.4, sw: 3.9, index: 0 },
    XXS: { A: [39.5, 26], C: [39.5, 66], B: [64.5, 66], step: 13, n: 1, taper: 1.35, sw: 7.2, index: 0 },
  },
  /**
   * The contour d out from the crest. The stem keeps d; the foot is the band tangent to a circle of
   * radius d round the elbow and one of taper × d round the tip, so the land opens as it falls. Round
   * caps, a round outer elbow, and a fillet of d in the inner corner where it fits. Lines and arcs.
   */
  outline({ A, C, B, taper }, d) {
    d = Math.max(0.02, d)
    const [ax, ay] = A
    const [cx, cy] = C
    const [bx, by] = B
    const r2 = taper * d
    const L = bx - cx
    const sn = (r2 - d) / L
    const cs = Math.sqrt(1 - sn * sn)
    const top = [-sn, -cs] // the upper tangent's outward normal
    const bot = [-sn, cs]
    // Where the stem's inner side meets the upper tangent, and the largest fillet that fits there.
    const tau = (d * (1 + sn)) / cs
    const X = [ax + d, cy - d * cs - tau * sn]
    const TB = [bx + r2 * top[0], by + r2 * top[1]]
    const room = Math.min(Math.hypot(TB[0] - X[0], TB[1] - X[1]), X[1] - ay)
    const beta = Math.PI / 2 - Math.asin(sn)
    const ri = Math.max(0.01, Math.min(d, 0.9 * room * Math.tan(beta / 2)))
    const O = [ax + d + ri, cy - d * cs - (ri + sn * (d + ri + d * sn)) / cs]
    const F2 = [O[0] + ri * sn, O[1] + ri * cs]
    const UB = [bx + r2 * bot[0], by + r2 * bot[1]]
    const UC = [cx + d * bot[0], cy + d * bot[1]]
    const r = R(d)
    return (
      `M${R(ax - d)} ${R(ay)}A${r} ${r} 0 0 1 ${R(ax + d)} ${R(ay)}` +
      `L${R(ax + d)} ${R(O[1])}A${R(ri)} ${R(ri)} 0 0 0 ${pt(F2)}` +
      `L${pt(TB)}A${R(r2)} ${R(r2)} 0 1 1 ${pt(UB)}` +
      `L${pt(UC)}A${r} ${r} 0 0 1 ${R(cx - d)} ${R(cy)}Z`
    )
  },
  frame({ t, p, tier }) {
    const sp = this.spec[tier]
    const s = p * this.introDur
    const turns = p < 1 ? 0 : (t * this.period) / this.flow
    const phi = turns % 1
    const done = Math.floor(turns + 1e-9) // whole intervals so far, so the index travels with its contour
    const { A, C, B } = sp
    const crest = `M${pt(A)}L${pt(C)}L${pt(B)}`
    const kids = [{ el: 'path', d: crest, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...(p < 1 ? drawOn(step(s, 0, 0.5, INOUT)) : {}) }]
    const far = sp.n * sp.step
    for (let j = 0; j <= sp.n + 1; j++) {
      let d = sp.step * (j + phi)
      // Hidden while it would double the crest, faded in from 1.5 to 3 units out, and gone over the
      // half step past the last still contour.
      let op = smooth(1.5, 3, d) * smooth(far + 0.5 * sp.step, far, d)
      if (p < 1) {
        // The intro: each still contour blooms out of the crest, 0.5 s each, 0.15 s apart.
        if (j === 0 || j > sp.n) op = 0
        else {
          const k = step(s, 0.5 + 0.15 * (j - 1), 1.0 + 0.15 * (j - 1))
          d = j * sp.step * k
          op = k > 0 ? 1 : 0
        }
      }
      const id = j - done
      const heavy = sp.index && ((id - sp.index) % 3 + 3) % 3 === 0
      kids.push({ el: 'path', d: this.outline(sp, d), 'stroke-width': heavy ? 2 * sp.sw : sp.sw, opacity: R(op * 1000) / 1000 })
    }
    return { kids: [{ el: 'g', fill: 'none', stroke: '@line', 'stroke-width': sp.sw, kids }] }
  },
}

/* 5. Col: a summit, a lower knoll and the pass between them, marked with the pass sign. */
const col = {
  id: 'col',
  name: 'Col',
  idea: 'A summit, a lower knoll and the pass between them, marked as hiking maps mark a col: )(.',
  period: 14,
  introDur: 1.4,
  palettes: {
    light: { ground: '#fcfdfd', edge: 'rgba(21,25,30,0.14)', line: '#15191e', mark: '#15191e' },
    dark: { ground: '#1a212a', edge: 'rgba(232,230,223,0.14)', edgeS: 'rgba(232,230,223,0.18)', line: '#e8e6df', mark: '#e8e6df' },
  },
  // One height field and one contour interval: `ks` are steps of `h` above (+) or below (−) the col's
  // height. Above it a contour rings one summit; below it, it rings both. `index` is drawn at `iw`.
  // The pass sign )( — arc radius, distance from the col to each arc's crown, half its sweep — is
  // drawn at the index's weight, and only from 72 px up. Below that the mark is the index and the point.
  spec: {
    L: { ks: [2.5, 1.5, 0.5, -0.5, -1.5, -2.5], index: -1.5, sw: 0.6, iw: 1.2, arc: 9, gap: 3.5, sweep: 0.6, dot: 1.6 },
    M: { ks: [1.5, 0.5, -0.5, -1.5], index: -1.5, sw: 1.15, iw: 2.3, arc: 9, gap: 3.6, sweep: 0.6, dot: 2.2 },
    // Below 72 px the drawing is larger (zoom) so its lines fill the tile. At 48 px the summit keeps a
    // ring. At 32 and 16 px one line is left, and it is the contour one step lower, with the knoll a
    // little broader: a single lumpy outline round its point. (A big lobe and a small one read as a
    // magnifying glass; two equal, pinched lobes as a chain link. See c3/extra/sketch-col.png.)
    S: { ks: [1.5, -1.5], index: -1.5, sw: 3.6, iw: 5.2, arc: 0, dot: 4.4, sb: 16, hb: 0.78, zoom: 1.2 },
    XS: { ks: [-2.5], index: -2.5, sw: 5.6, iw: 5.6, arc: 0, dot: 6, sb: 17, hb: 0.8, zoom: 1.22 },
    XXS: { ks: [-2.5], index: -2.5, sw: 8.6, iw: 8.6, arc: 0, dot: 10, sb: 17, hb: 0.8, zoom: 1.22 },
  },
  // The summit is broad and high; the knoll narrower and lower, so the index reads as a summit and its
  // shoulder rather than twin lobes.
  A: [38, 40],
  B: [68, 64],
  sa: 22,
  sb: 15,
  hb: 0.75,
  h: 0.13,
  field(ha, hb, [ax, ay], [bx, by], sa, sb) {
    const a2 = sa * sa
    const b2 = sb * sb
    return (x, y) => ha * Math.exp(-((x - ax) ** 2 + (y - ay) ** 2) / a2) + hb * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / b2)
  },
  /** A contour as n nodes round a centre: along each ray, the first place the field falls below the level. */
  ring(F, c, level, n, a0) {
    return around(c[0], c[1], n, a0, (a) => {
      const ux = Math.cos(a)
      const uy = Math.sin(a)
      let r = 0
      while (r < 90 && F(c[0] + r * ux, c[1] + r * uy) >= level) r += 0.5
      let lo = Math.max(0, r - 0.5)
      let hi = r
      for (let i = 0; i < 24; i++) {
        const m = (lo + hi) / 2
        if (F(c[0] + m * ux, c[1] + m * uy) >= level) lo = m
        else hi = m
      }
      return lo
    })
  },
  frame({ t, amp, p, tier }) {
    const sp = this.spec[tier]
    const s = p * this.introDur
    const intro = p < 1
    const z = sp.zoom || 1
    const Z = (q) => [50 + z * (q[0] - 50), 50 + z * (q[1] - 50)]
    const HA = Z(this.A)
    const HB = Z(this.B)
    const [ax, ay] = HA
    const [bx, by] = HB
    const u = [bx - ax, by - ay]
    const ua = Math.atan2(u[1], u[0])
    // The summit and the knoll rise and fall in turn, by 2.5%, and the col follows.
    const ha = 1 + 0.025 * amp * wave(t)
    const hb = (sp.hb || this.hb) - 0.025 * amp * wave(t)
    const F = this.field(ha, hb, HA, HB, z * this.sa, z * (sp.sb || this.sb))
    // The col: the lowest point of the ridge between them.
    let lo = 0.15
    let hi = 0.9
    const along = (k) => F(ax + k * u[0], ay + k * u[1])
    for (let i = 0; i < 40; i++) {
      const m1 = lo + (hi - lo) / 3
      const m2 = hi - (hi - lo) / 3
      if (along(m1) < along(m2)) hi = m2
      else lo = m1
    }
    const kc = (lo + hi) / 2
    const c = [ax + kc * u[0], ay + kc * u[1]]
    const fc = along(kc)
    const lines = []
    const n = sp.ks.length
    sp.ks.forEach((k, i) => {
      const level = fc + this.h * k
      const w = k === sp.index ? sp.iw : sp.sw
      // Written from the col side, the outermost first, 0.4 s each, 0.06 s apart: 0.45–1.09 s in all.
      const draw = intro ? drawBoth(step(s, 0.45 + 0.06 * (n - 1 - i), 0.85 + 0.06 * (n - 1 - i))) : {}
      if (k > 0) {
        for (const [H, toward] of [[HA, ua], [HB, ua + Math.PI]]) {
          if (F(...H) < level + 0.02) continue
          const pts = this.ring(F, H, level, 10, toward)
          // A ring too small to read is left out, rather than shown as a speck.
          const mean = pts.reduce((a, q) => a + Math.hypot(q[0] - H[0], q[1] - H[1]), 0) / pts.length
          if (mean < 3) continue
          lines.push({ el: 'path', d: curve(pts), 'stroke-width': w, ...draw })
        }
      } else lines.push({ el: 'path', d: curve(this.ring(F, c, level, 24, ua + Math.PI / 2)), 'stroke-width': w, ...draw })
    })
    const kids = []
    kids.push({ el: 'g', fill: 'none', stroke: '@line', 'stroke-linecap': 'round', kids: lines })
    // The point. On the intro it is the sight: a ring that closes on the col from outside the tile and
    // fills to become the point.
    if (intro) {
      // It starts just inside the tile's corners, so it is on screen from the first frame.
      const k = step(s, 0, 0.5, INOUT)
      const fillK = smooth(0.42, 0.5, s)
      kids.push({ el: 'circle', cx: R(c[0]), cy: R(c[1]), r: R(lerp(60, sp.dot, k)), fill: '@mark', 'fill-opacity': R(fillK * 1000) / 1000, stroke: '@mark', 'stroke-width': R(Math.max(sp.sw, 0.9) * (1 - fillK) * 1000) / 1000 })
    } else kids.push({ el: 'circle', cx: R(c[0]), cy: R(c[1]), r: sp.dot, fill: '@mark' })
    // The pass sign )(: two arcs with their backs to each other across the col, pressed last.
    if (sp.arc) {
      const arcAt = (side) => {
        const o = side * (sp.gap + sp.arc)
        const a0 = (side > 0 ? Math.PI : 0) - sp.sweep
        const a1 = (side > 0 ? Math.PI : 0) + sp.sweep
        return `M${pt([o + sp.arc * Math.cos(a0), sp.arc * Math.sin(a0)])}A${R(sp.arc)} ${R(sp.arc)} 0 0 1 ${pt([o + sp.arc * Math.cos(a1), sp.arc * Math.sin(a1)])}`
      }
      const m = intro ? press(s - 1.1) : { s: 1, o: 1 }
      kids.push({
        el: 'path', d: arcAt(-1) + arcAt(1), fill: 'none', stroke: '@mark', 'stroke-width': sp.iw, 'stroke-linecap': 'round', opacity: m.o,
        transform: `translate(${R(c[0])} ${R(c[1])}) rotate(${R((ua * 1800) / Math.PI) / 10}) scale(${R(m.s * 1000) / 1000})`,
      })
    }
    return { kids }
  },
}

export const VARIANTS = [summit, tide, counties, spur, col]

/* ======================================================================
   Drawing: one tree, patched into live SVGs or written out as a file
   ====================================================================== */

const NS = 'http://www.w3.org/2000/svg'
const SKIP = new Set(['el', 'kids'])
let seq = 0

function value(key, v, pal, uid) {
  if (key === 'id') return `${uid}-${v}`
  if (typeof v === 'number') return String(Math.round(v * 1000) / 1000)
  if (typeof v !== 'string') return String(v)
  if (v[0] === '@') return pal[v.slice(1)] ?? v
  if (key === 'href' && v[0] === '#') return `#${uid}-${v.slice(1)}`
  if (v.includes('url(#')) return v.replace(/url\(#/g, `url(#${uid}-`)
  return v
}

function signature(kids) {
  let s = ''
  for (const k of kids) s += k.el + (k.kids ? `(${signature(k.kids)})` : '') + ','
  return s
}

/** The whole drawing for one frame: the squircle, the variant inside it, and the squircle's edge. */
export function compose(v, { t = 0, amp = 0, p = 1, live = 0, tier = 'L', fade = 0 } = {}) {
  let out = v.frame({ t, amp, p, live, tier, px: PX[tier] })
  // A flowing mark switched off far from its still stops, then cross-fades to the still.
  if (fade > 0) {
    const still = v.frame({ t: 0, amp: 0, p, live, tier, px: PX[tier] })
    out = { ...out, kids: [{ el: 'g', opacity: R4(1 - fade), kids: out.kids }, { el: 'g', opacity: R4(fade), kids: still.kids }] }
  }
  const edge = SMALL.has(tier) ? '@edgeS' : '@edge'
  // The squircle is written once and used three times: as the clip, the ground and the edge.
  return [
    { el: 'defs', kids: [{ el: 'path', id: 'tile', d: SQUIRCLE }, { el: 'clipPath', id: 'sq', kids: [{ el: 'use', href: '#tile' }] }, ...(out.defs || [])] },
    { el: 'use', href: '#tile', fill: out.ground || '@ground' },
    { el: 'g', 'clip-path': 'url(#sq)', kids: [...out.kids, { el: 'use', href: '#tile', fill: 'none', stroke: edge, 'stroke-width': R(2 / PX[tier]) }] },
  ]
}

/** A live SVG on the page. Drawing again only touches the attributes that changed. */
export class Mount {
  constructor(svg, palette, label) {
    this.svg = svg
    this.pal = { edgeS: palette.edge, groundS: palette.ground, ...palette }
    this.uid = `m${++seq}`
    this.sig = ''
    svg.setAttribute('viewBox', '0 0 100 100')
    svg.setAttribute('role', 'img')
    if (label) svg.setAttribute('aria-label', label)
  }
  draw(kids) {
    const sig = signature(kids)
    if (sig !== this.sig) {
      this.sig = sig
      this.svg.replaceChildren(...kids.map((k) => this.make(k)))
      return
    }
    this.patch(this.svg, kids)
  }
  make(n) {
    const el = document.createElementNS(NS, n.el)
    el.__a = {}
    for (const key in n) {
      if (SKIP.has(key) || n[key] === undefined) continue
      const v = value(key, n[key], this.pal, this.uid)
      el.setAttribute(key, v)
      el.__a[key] = v
    }
    if (n.kids) for (const k of n.kids) el.append(this.make(k))
    return el
  }
  patch(parent, kids) {
    const nodes = parent.children
    for (let i = 0; i < kids.length; i++) {
      const n = kids[i]
      const el = nodes[i]
      const was = el.__a
      for (const key in n) {
        if (SKIP.has(key) || n[key] === undefined) continue
        const v = value(key, n[key], this.pal, this.uid)
        if (was[key] !== v) {
          el.setAttribute(key, v)
          was[key] = v
        }
      }
      for (const key in was) {
        if (!(key in n) || n[key] === undefined) {
          el.removeAttribute(key)
          delete was[key]
        }
      }
      if (n.kids) this.patch(el, n.kids)
    }
  }
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** The still form as a standalone file: hidden layers and empty groups left out, one idea per line. */
export function svgFile(v, theme = 'light', size = 1024) {
  const pal = { edgeS: v.palettes[theme].edge, groundS: v.palettes[theme].ground, ...v.palettes[theme] }
  const uid = v.id
  const tier = size >= 160 ? 'L' : tierFor(size)
  const ser = (n, depth) => {
    if (n.opacity === 0 || n.opacity === '0') return ''
    if (n.el === 'g' && !n.kids?.length) return ''
    if (n.stroke && value('stroke', n.stroke, pal, uid) === 'none' && (!n.fill || n.fill === 'none')) return ''
    let a = ''
    for (const key in n) {
      if (SKIP.has(key) || n[key] === undefined || (key === 'opacity' && Number(n[key]) === 1)) continue
      a += ` ${key}="${esc(value(key, n[key], pal, uid))}"`
    }
    const pad = '\n' + '  '.repeat(depth)
    const inner = (n.kids || []).map((k) => ser(k, depth + 1)).join('')
    return inner ? `${pad}<${n.el}${a}>${inner}${pad}</${n.el}>` : `${pad}<${n.el}${a}/>`
  }
  const kids = compose(v, { tier })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${kids.map((k) => ser(k, 1)).join('')}\n</svg>\n`
}

/* ======================================================================
   Motion: one clock, cards that ease in and out of their loops
   ====================================================================== */

const ease3 = (k) => k * k * (3 - 2 * k)

/** One variant on the page: all its live SVGs, its loop time, how much it's moving, and its intro. */
export class Card {
  constructor(v) {
    this.v = v
    this.mounts = []
    this.time = 0
    this.ramp = 0 // blend variants: linear 0..1 towards the motion target; amp is its smoothstep
    this.spd = 0 // flow variants: how fast time runs, 0..1
    this.fade = null // flow variants switched off far from a still: 0..1 into the cross-fade
    this.live = false // live variants: whether the copy is live, a moment of its own, apart from motion
    this.liveRamp = 0
    this.motion = false
    this.introAt = null
    this.p = 1
    this.visible = true
  }
  get amp() {
    return this.v.flow ? 1 : ease3(this.ramp)
  }
  add(svg, size, theme) {
    const m = new Mount(svg, this.v.palettes[theme], `${this.v.name} mark`)
    this.mounts.push({ m, tier: tierFor(size) })
    return m
  }
  playIntro(now = performance.now()) {
    this.introAt = now
    this.ramp = 0
    this.spd = 0
    this.fade = null
    this.time = 0
    this.p = 0
  }
  render() {
    const cache = {}
    const st = { t: (this.time / this.v.period) % 1, amp: this.amp, p: this.p, live: this.liveRamp, fade: this.fade == null ? 0 : ease3(this.fade) }
    for (const { m, tier } of this.mounts) m.draw((cache[tier] ||= compose(this.v, { ...st, tier })))
  }
  /** Advance by dt seconds. Returns whether it still needs frames. */
  step(dt, now) {
    let dirty = false
    const toward = (v, target, rate) => (v < target ? Math.min(target, v + rate) : Math.max(target, v - rate))
    if (this.introAt != null) {
      this.p = clamp((now - this.introAt) / 1000 / this.v.introDur)
      if (this.p >= 1) this.introAt = null
      dirty = true
    }
    const intro = this.introAt != null
    const on = this.motion
    // Going live is its own moment, and waits for the intro: drain, then flood, then breathe.
    const lt = this.live ? 1 : 0
    if (this.v.live && !intro && this.liveRamp !== lt) {
      // Under reduced motion the sea simply changes; otherwise it floods.
      this.liveRamp = this.reduced ? lt : toward(this.liveRamp, lt, dt / this.v.liveDur)
      dirty = true
    }
    let moving
    if (this.v.flow) {
      const f = this.v.flow
      if (this.fade != null) {
        // Stopped between stills: cross-fade to the still over 0.4 s.
        this.fade = Math.min(1, this.fade + dt / 0.4)
        if (this.fade >= 1 || on) {
          this.fade = null
          this.time = 0
          this.spd = 0
        }
        dirty = true
      } else if (intro) this.spd = 0
      else if (on) this.spd = Math.min(1, this.spd + dt / 0.6)
      else if (this.spd > 0) {
        // Off: if the next still is within 1.2 s, finish the interval, braking over its last 0.35 s.
        // Otherwise stop over 0.5 s, then cross-fade to the still.
        const into = this.time % f
        const left = into < 1e-6 ? 0 : f - into
        if (this.braking || left <= 1.2 * this.spd) {
          this.braking = true
          const v = Math.min(this.spd, Math.sqrt(left / 0.35))
          if (left === 0 || v * dt >= left) {
            this.time = (Math.round(this.time / f) * f) % this.v.period
            this.spd = 0
            this.braking = false
            dirty = true
          } else this.spd = Math.max(v, 0.02)
        } else {
          this.spd = Math.max(0, this.spd - dt / 0.5)
          if (this.spd === 0) this.fade = 0
        }
      }
      if (on) this.braking = false
      if (this.spd > 0) {
        this.time = (this.time + this.spd * dt) % this.v.period
        dirty = true
      }
      moving = this.spd > 0 || this.fade != null || (on && !intro)
    } else {
      const target = on && !intro ? 1 : 0
      if (this.ramp !== target) {
        this.ramp = toward(this.ramp, target, dt / 0.9)
        dirty = true
      }
      if (this.ramp > 0) {
        this.time = (this.time + dt) % this.v.period
        dirty = true
      }
      moving = this.ramp > 0 || this.ramp !== target
    }
    if (dirty && this.visible) this.render()
    return intro || moving || (this.v.live && this.liveRamp !== lt)
  }
}

/** The page's one clock. It runs only while something moves, and never while the tab is hidden. */
export function clock(cards) {
  let raf = 0
  let last = 0
  let frozen = false
  const tick = (now) => {
    raf = 0
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
    last = now
    let busy = false
    for (const c of cards) busy = c.step(dt, now) || busy
    if (busy && !frozen && !document.hidden) raf = requestAnimationFrame(tick)
    else last = 0
  }
  const wake = () => {
    if (!raf && !frozen && !document.hidden) {
      last = 0
      raf = requestAnimationFrame(tick)
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf)
      raf = 0
      last = 0
    } else wake()
  })
  return {
    wake,
    freeze(on) {
      frozen = on
      if (on) {
        cancelAnimationFrame(raf)
        raf = 0
        last = 0
      } else wake()
    },
    get frozen() {
      return frozen
    },
  }
}

/* ======================================================================
   Traced fields (cycle 1), kept for sketching new terrain. No mark uses them now.
   Marching squares over a scalar field, with every crossing joined into closed loops.
   ====================================================================== */

/** The closed loops where a field crosses `level`, on an N × N grid from lo, d apart, as point lists. */
export function traceLevel(fn, level, { N = 120, lo = -14, d = 1.08 } = {}) {
  const F = new Float32Array(N * N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) F[j * N + i] = fn(lo + i * d, lo + j * d)
  const adj = new Map()
  const link = (a, b) => {
    adj.set(a, [...(adj.get(a) || []), b])
    adj.set(b, [...(adj.get(b) || []), a])
  }
  const at = (e) => {
    const k = e >> 1
    const i = k % N
    const j = (k - i) / N
    const a = F[k]
    const b = e & 1 ? F[k + N] : F[k + 1]
    const f = (level - a) / (b - a)
    return e & 1 ? [lo + i * d, lo + (j + f) * d] : [lo + (i + f) * d, lo + j * d]
  }
  for (let j = 0; j < N - 1; j++)
    for (let i = 0; i < N - 1; i++) {
      const k = j * N + i
      const v = [F[k], F[k + 1], F[k + N + 1], F[k + N]]
      const c = (v[0] > level) | ((v[1] > level) << 1) | ((v[2] > level) << 2) | ((v[3] > level) << 3)
      const e = [2 * k, 2 * (k + 1) + 1, 2 * (k + N), 2 * k + 1]
      const mid = (v[0] + v[1] + v[2] + v[3]) / 4 > level
      const T = { 1: [[3, 0]], 14: [[3, 0]], 2: [[0, 1]], 13: [[0, 1]], 3: [[3, 1]], 12: [[3, 1]], 4: [[1, 2]], 11: [[1, 2]], 6: [[0, 2]], 9: [[0, 2]], 7: [[3, 2]], 8: [[3, 2]], 5: mid ? [[0, 1], [3, 2]] : [[3, 0], [1, 2]], 10: mid ? [[3, 0], [1, 2]] : [[0, 1], [3, 2]] }
      for (const [a, b] of T[c] || []) link(e[a], e[b])
    }
  const seen = new Set()
  const loops = []
  for (const start of adj.keys()) {
    if (seen.has(start)) continue
    const pts = []
    let prev = -1
    let cur = start
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur)
      pts.push(at(cur))
      const [a, b] = adj.get(cur)
      const next = a !== prev ? a : b
      prev = cur
      cur = next
    }
    loops.push(pts)
  }
  return loops
}
