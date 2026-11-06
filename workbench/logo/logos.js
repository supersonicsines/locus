/*
  Locus marks: one engine, five variants, one squircle.

  Every mark is authored as curves: rings, coasts and borders built from a few nodes each and joined
  with centripetal Catmull-Rom into cubic Béziers, or from lines, arcs and ellipses. The geometry is a
  function of time, so the same drawing gives the still file (small and editable), the loop and the
  intro. Marching squares (traceLevelGrid, traceLevel) are kept for sketching new terrain; no mark
  uses them.

  A frame is a plain tree of SVG descriptors: { el, ...attributes, kids }. Colours are '@keys' into
  the variant's palette, and ids are local, prefixed per instance. The page patches live SVGs from
  the tree and the download serialises the same tree, so the still and the moving mark are one
  drawing.

  Time. A variant loops over `period` seconds and draws a frame from t in [0, 1).
  - A variant with `flow` (seconds per contour interval) moves by flowing: its time only runs while
    motion is on, and when motion goes off it stops within about a second and settles on the still.
  - Any other variant blends: `amp` (0..1) scales how far it strays from the still.
  - `live` is the going-live moment, played once (flood, hold, ebb), apart from motion.
  - `p` is the one-shot intro's progress, and 1 means the intro is over.

  Size. A mark draws itself per size band (L from 160 px, M from 72, S from 40, XS from 24, XXS
  below; a variant may move a band's edge with `bounds`), so a small one can drop contours and
  thicken its lines. Below L, strokes and dots hold their pixel weight across a whole band (see REF
  and specAt), so no mark gets lighter or heavier as it crosses into the next band.

  Options. A variant may offer the operator open calls as `options` (Summit's seal); they reach the
  frame as `opts`, and the download carries them.
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
export function around(cx, cy, n, a0, r) {
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

/**
 * Size bands. Each band's drawing is made at its reference size (REF); a variant may move a band's
 * lower edge with `bounds`. Below L, strokes, dots and dashes hold their pixel weight across the whole
 * band: at size s they are drawn REF / s times as thick in units, so nothing gets lighter or heavier
 * as it crosses into the next band.
 */
export const REF = { L: 280, M: 96, S: 48, XS: 32, XXS: 16 }
export const BOUNDS = { L: 160, M: 72, S: 40, XS: 24 }
export function tierOf(v, size) {
  const b = v.bounds ? { ...BOUNDS, ...v.bounds } : BOUNDS
  return size >= b.L ? 'L' : size >= b.M ? 'M' : size >= b.S ? 'S' : size >= b.XS ? 'XS' : 'XXS'
}
/** A tier's spec with its weights scaled by k (a dash pattern scales each of its lengths). */
export function specAt(v, tier, k = 1) {
  const base = v.spec[tier]
  if (Math.abs(k - 1) < 1e-6) return base
  const cache = (v._specAt ||= new Map())
  const key = tier + ':' + R4(k)
  let sp = cache.get(key)
  if (!sp) {
    sp = { ...base }
    for (const w of v.weights || []) {
      const x = sp[w]
      if (typeof x === 'number') sp[w] = x * k
      else if (typeof x === 'string' && x) sp[w] = x.split(/\s+/).map((n) => R(+n * k)).join(' ')
    }
    cache.set(key, sp)
  }
  return sp
}

/* ---------- islands ---------- */

/**
 * An island: a tilted ellipse with gentle lobes, as a radius at each angle round its centre. Lobes are
 * [amplitude, count, phase]; dents are [depth in units, angle, width in radians], each a bay. `soft`
 * scales both, so contours nearer the summit can be rounder.
 */
export function island({ a, b, tilt, lobes, dents = [] }) {
  return (th, soft = 1, dk = 1) => {
    const u = th - tilt
    const e = (a * b) / Math.hypot(b * Math.cos(u), a * Math.sin(u))
    let w = 0
    for (const [amp, k, ph] of lobes) w += amp * Math.cos(k * th + ph)
    let r = e * (1 + soft * w)
    for (const [depth, at, width] of dents) r -= dk * soft * depth * Math.exp(-((wrap(th - at) / width) ** 2))
    return r
  }
}

/* ---------- traced fields, for land whose contours have no single centre ---------- */

/** The closed loops where fn crosses `level`, sampled d apart over a box whose edge is below the level. */
export function traceLevelGrid(F, nx, ny, x0, y0, d, level) {
  const adj = new Map()
  const link = (a, b) => {
    const pa = adj.get(a)
    if (pa) pa.push(b)
    else adj.set(a, [b])
    const pb = adj.get(b)
    if (pb) pb.push(a)
    else adj.set(b, [a])
  }
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i
      const v0 = F[k]
      const v1 = F[k + 1]
      const v2 = F[k + nx + 1]
      const v3 = F[k + nx]
      const c = (v0 > level ? 1 : 0) | (v1 > level ? 2 : 0) | (v2 > level ? 4 : 0) | (v3 > level ? 8 : 0)
      if (c === 0 || c === 15) continue
      const e0 = 2 * k
      const e1 = 2 * (k + 1) + 1
      const e2 = 2 * (k + nx)
      const e3 = 2 * k + 1
      const mid = (v0 + v1 + v2 + v3) / 4 > level
      switch (c) {
        case 1: case 14: link(e3, e0); break
        case 2: case 13: link(e0, e1); break
        case 3: case 12: link(e3, e1); break
        case 4: case 11: link(e1, e2); break
        case 6: case 9: link(e0, e2); break
        case 7: case 8: link(e3, e2); break
        case 5: if (mid) { link(e0, e1); link(e3, e2) } else { link(e3, e0); link(e1, e2) } break
        case 10: if (mid) { link(e3, e0); link(e1, e2) } else { link(e0, e1); link(e3, e2) } break
      }
    }
  const at = (e) => {
    const k = e >> 1
    const i = k % nx
    const j = (k - i) / nx
    const a = F[k]
    if (e & 1) return [x0 + i * d, y0 + (j + (level - a) / (F[k + nx] - a)) * d]
    return [x0 + (i + (level - a) / (F[k + 1] - a)) * d, y0 + j * d]
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
    if (pts.length > 4) loops.push(pts)
  }
  return loops
}

/** A traced loop as even steps along its length, clockwise from its top: a few nodes and a smooth curve. */
export function resample(pts, spacing, minN = 10) {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    area += p[0] * q[1] - q[0] * p[1]
  }
  if (area < 0) pts = pts.slice().reverse()
  let top = 0
  for (let i = 1; i < pts.length; i++) if (pts[i][1] < pts[top][1]) top = i
  pts = pts.slice(top).concat(pts.slice(0, top))
  const len = [0]
  for (let i = 1; i <= pts.length; i++) {
    const p = pts[i % pts.length]
    const q = pts[i - 1]
    len.push(len[i - 1] + Math.hypot(p[0] - q[0], p[1] - q[1]))
  }
  const total = len[pts.length]
  const n = Math.max(minN, Math.round(total / spacing))
  const out = []
  let j = 0
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total
    while (len[j + 1] < target) j++
    const f = (target - len[j]) / (len[j + 1] - len[j] || 1)
    const p = pts[j]
    const q = pts[(j + 1) % pts.length]
    out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f])
  }
  return { pts: out, len: total }
}

/* ======================================================================
   The five variants

   Each variant's `spec` is drawn per size band. Below L, a band's strokes and dots are set for the
   band's reference size (REF) and keep their pixel weight across the whole band: `weights` names
   the spec keys that scale so. `bounds` moves a band's lower edge for one variant.
   ====================================================================== */

/** The going-live moment, e seconds in: flood 1.1 s, hold 0.6 s, ebb 1.2 s. Reduced motion cross-fades. */
export const LIVE_DUR = 2.9
export function liveMoment(e, reduced) {
  if (reduced) {
    const o = smooth(0, 0.2, e) * (1 - smooth(1.4, 1.6, e))
    return { k: 1, o, ink: o, done: e >= 1.6 }
  }
  const k = e < 1.1 ? INOUT(e / 1.1) : e < 1.7 ? 1 : INOUT(1 - (e - 1.7) / 1.2)
  const ink = smooth(0, 0.25, e) * (1 - smooth(2.5, 2.9, e))
  return { k, o: 1, ink, done: e >= 2.9 }
}
const NOT_LIVE = { k: 0, o: 0, ink: 0 }
const o3 = (v) => R(v * 1000) / 1000

/* 1. Summit: one hill whose contours run forever into a single still point. */
const SW = (3 * Math.PI) / 4 // south-west, on screen
const summit = {
  id: 'summit',
  name: 'Summit',
  means: 'Locus is the one place that everything on your company’s map leads to.',
  idea: 'One hill whose contours run forever into a single still point.',
  period: 14,
  flow: 3.5,
  introDur: 1.3,
  // Two calls left to the operator, as switches: going live on this tile, and the point as the seal.
  live: true,
  liveDur: LIVE_DUR,
  moment: liveMoment,
  options: ['seal'],
  palettes: {
    light: { ground: '#fcfdfd', edge: 'rgba(21,25,30,0.12)', line: '#15191e', dot: '#15191e', live: '#c4daee', seal: '#d63c27', sealMark: 'rgba(251,236,231,0.92)' },
    dark: { ground: '#1a212a', edge: 'rgba(232,230,223,0.14)', edgeS: 'rgba(232,230,223,0.18)', line: '#e8e6df', dot: '#e8e6df', live: '#143049', seal: '#ea5a44', sealMark: 'rgba(251,236,231,0.92)' },
  },
  // n rings in the still; dot radius; r0 where a ring ends at the dot; grow: how far a ring at λ = 1
  // reaches on the steep north-east face (the south-west face reaches about twice as far); tri: how
  // three-cornered the rings are; lean: how much longer the gentle side is. 16 and 32 px are one
  // drawing, and 48 px is two rings of the same shape.
  weights: ['sw', 'dot'],
  spec: {
    L: { n: 4, dot: 3.6, sw: 0.72, r0: 5.4, grow: 22.5, dent: 0.11, tri: 0.07, blue: true, seal: true },
    M: { n: 3, dot: 5, sw: 1.3, r0: 7.5, grow: 25, dent: 0.1, tri: 0.07, blue: true, seal: true },
    S: { n: 2, dot: 7, sw: 2.6, r0: 10.5, grow: 28, dent: 0.06, tri: 0.2, lean: 1.5, blue: true },
    XS: { n: 1, dot: 9.5, sw: 6, r0: 12, grow: 33, dent: 0, tri: 0.26, lean: 1.6 },
    XXS: { n: 1, dot: 12, sw: 8.6, r0: 13, grow: 33, dent: 0, tri: 0.26, lean: 1.6 },
  },
  /** The ring shape: steep north-east face, gentle south-west, three soft corners, one shallow west dent. */
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
  frame({ t, p, tier, sp, live, opts }) {
    const N = sp.n
    const P = this.origin(tier)
    const s = p * this.introDur
    const seal = opts.seal && sp.seal
    const sealR = sp.dot * 1.7
    // One contour interval per `flow` seconds: every ring moves one place in towards the point.
    const phi = p < 1 ? 0 : ((t * this.period) / this.flow) % 1
    const kids = []
    // Going live, as an option: the paper beyond the hill floods blue out from its outermost ring and
    // ebbs. The hill stays paper, as Tide's land does.
    const lv = sp.blue && live ? live : NOT_LIVE
    const on = lv.k > 0.001 && lv.o > 0
    kids.push({ el: 'path', d: on ? curve(this.ring(P, sp, lerp(N / (N + 1), 4.5, lv.k))) : 'M0 0', fill: '@live', opacity: o3(on ? lv.o : 0) })
    kids.push({ el: 'path', d: on ? curve(this.ring(P, sp, N / (N + 1))) : 'M0 0', fill: '@ground', opacity: on ? 1 : 0 })
    for (let j = 0; j <= N; j++) {
      const lam = 1 - (j + phi) / (N + 1)
      // Born at the rim over the first 15% of its travel, gone over the last 15%, as it reaches the point.
      let op = smooth(1, 0.85, lam) * smooth(0, 0.15, lam)
      // With the seal, a ring is gone before it reaches the wax.
      if (seal) op *= smooth(sealR + 1, sealR + 3.5, sp.r0 + lam * sp.grow * 0.93)
      let draw = {}
      if (p < 1) {
        if (j === 0) op = 0
        else {
          const k = N - j // innermost first, each starting 25° further round, so the starts don't line up
          draw = drawOn(step(s, 0.25 + 0.12 * k, 0.75 + 0.12 * k), (k * 25) / 360)
        }
      }
      kids.push({ el: 'path', d: curve(this.ring(P, sp, lam)), fill: 'none', stroke: '@line', 'stroke-width': R(sp.sw * 1000) / 1000, 'stroke-linecap': 'round', opacity: o3(op), ...draw })
    }
    // The point is pressed first: 0.6 → 1.08 → 1 over 0.28 s.
    let sc = 1
    let o = 1
    if (p < 1) {
      const k = s / 0.28
      sc = k < 0.6 ? lerp(0.6, 1.08, OUT(k / 0.6)) : lerp(1.08, 1, INOUT((k - 0.6) / 0.4))
      o = clamp(s / 0.1)
    }
    if (seal) {
      // The point as the map's wax seal: a vermilion disc with its paper L, as an option.
      const r = sealR
      const L = `M${R(-0.2 * r)} ${R(-0.42 * r)}L${R(-0.2 * r)} ${R(0.36 * r)}L${R(0.3 * r)} ${R(0.36 * r)}`
      kids.push({
        el: 'g', transform: `translate(${R(P[0])} ${R(P[1])}) scale(${R(sc * 1000) / 1000})`, opacity: o,
        kids: [
          { el: 'circle', r: R(r), fill: '@seal' },
          { el: 'path', d: L, fill: 'none', stroke: '@sealMark', 'stroke-width': R(0.17 * r), 'stroke-linejoin': 'miter' },
        ],
      })
    } else kids.push({ el: 'circle', cx: R(P[0]), cy: R(P[1]), r: R(sp.dot * sc * 100) / 100, fill: '@dot', opacity: o })
    return { kids }
  },
}

/* 2. Tide: an island and its islet in a still grey sea. Going live floods it blue, once, and it ebbs. */
const TIDE_EASE = cubicBezier(0.33, 1, 0.68, 1)
const tide = {
  id: 'tide',
  name: 'Tide',
  means: 'Locus is your company as land. When a copy goes live, the sea floods blue for a moment.',
  idea: 'An island and its islet in a still grey sea. Going live floods it blue for a moment, then it ebbs.',
  period: 12,
  introDur: 1.2,
  live: true,
  liveDur: LIVE_DUR,
  moment: liveMoment,
  palettes: {
    light: { ground: '#d5dce2', edge: 'rgba(21,25,30,0.14)', live: '#c4daee', land: '#fcfdfd', line: '#15191e', coast: 'rgba(21,25,30,0.45)', coastS: 'rgba(21,25,30,0.8)', under: 'rgba(21,25,30,0.2)', water: '#3b78b8' },
    dark: { ground: '#202833', edge: 'rgba(232,230,223,0.14)', edgeS: 'rgba(232,230,223,0.18)', live: '#143049', land: '#e8e6df', line: '#15191e', coast: 'rgba(21,25,30,0.45)', coastS: 'rgba(21,25,30,0.8)', under: 'rgba(232,230,223,0.2)', water: '#7fb0e0' },
  },
  // Contours as λ: 0 at the summit, 1 the still coast. `depth` adds the lines under the sea (λ 1.13 round
  // the island, a ring round the islet). The islet keeps its own sea at every size; ab is its two
  // semi-axes. Only 48 px and up ever turn blue. The south-west inlet is drawn only where it reads.
  // at: where the island's centre sits, from C; I: the islet's centre.
  weights: ['sw', 'coast'],
  spec: {
    L: { lines: [0.4, 0.75], depth: true, sw: 0.5, coast: 0.55, ink: '@coast', ab: [7, 3.5], scale: 0.92, at: [0, 0], I: [83, 40], blue: true, inlet: 1 },
    M: { lines: [0.55], depth: true, sw: 1.1, coast: 1.1, ink: '@coast', ab: [7.7, 3.85], scale: 0.92, at: [0, 0], I: [83, 40], blue: true, inlet: 1 },
    S: { lines: [], depth: false, sw: 0, coast: 2.1, ink: '@coast', ab: [9.4, 4.7], scale: 0.9, at: [-1, 0], I: [84, 40], blue: true, inlet: 0 },
    // At 32 and 16 px the islet is a sliver: a rounder one makes the pair a thought bubble.
    XS: { lines: [], depth: false, sw: 0, coast: 3.44, ink: '@coastS', ab: [14, 5], scale: 0.82, at: [-4, 1], I: [83, 40], blue: false, inlet: 0 },
    XXS: { lines: [], depth: false, sw: 0, coast: 6.88, ink: '@coastS', ab: [17, 6], scale: 0.74, at: [-6, 2], I: [82.5, 40], blue: false, inlet: 0 },
  },
  C: [43, 53],
  S: [40, 50],
  coast: island({ a: 30, b: 23, tilt: -0.26, lobes: [[0.05, 2, 0.6], [0.045, 3, 2.2], [0.035, 5, 0.9], [0.018, 7, 2.8]], dents: [[8, SW, 0.22]] }),
  /** The island's contour at λ, as sixteen nodes (twenty-four where the inlet is drawn). */
  contour(lam, sp) {
    const [cx, cy] = this.C
    const [sx, sy] = this.S
    const [ox, oy] = sp.at
    const soft = Math.min(1, lam) ** 1.3
    return around(cx, cy, sp.inlet ? 24 : 16, 0.2, (th) => this.coast(th, soft, sp.inlet) * sp.scale).map(([x, y]) => [ox + sx + lam * (x - sx), oy + sy + lam * (y - sy)])
  },
  /** The islet: a lower hill lying along the island's east coast, a long oval. It floods at half the island's height. */
  islet(mu, sp) {
    const [a, b] = sp.ab
    const r = (th) => {
      const u = th - 1.22
      return ((a * b) / Math.hypot(b * Math.cos(u), a * Math.sin(u))) * (1 + 0.05 * Math.cos(3 * th + 2))
    }
    return around(sp.I[0], sp.I[1], 10, 1.22, (th) => mu * r(th))
  },
  frame({ t, amp, p, sp, live }) {
    const s = p * this.introDur
    const lv = sp.blue && live ? live : NOT_LIVE
    // The coast, as λ: the still coast is 1. On the intro the sea drains from the summit down.
    const ls = p < 1 ? TIDE_EASE(p) : 1 - 0.15 * amp * wave(t)
    const mu = 1 - (1 - ls) / 0.5 // the islet's coast on the same sea
    // How far each contour has surfaced: crossed over 0.25 s on the intro, or over a small band of tide.
    // A contour the coast is crossing melts into it, in weight and in ink, so the two never print side by side.
    const up = (c) => (p < 1 ? clamp((s - reach(TIDE_EASE, c, this.introDur)) / 0.25) : smooth(-0.02, 0.02, ls - c))
    // Its weight melts over a band of 0.2, and its ink over a wider one, so at high tide no second coast prints.
    const melt = (c) => (p < 1 ? 1 : smooth(0.02, 0.2, Math.abs(ls - c)))
    const fade = (c) => (p < 1 ? 1 : smooth(0.05, 0.3, Math.abs(ls - c)))
    const line = (c, at = c, ring = null) => ({ d: curve(ring || this.contour(c, sp)), k: up(at), m: melt(at), f: fade(at) })
    const lines = sp.lines.map((c) => line(c))
    if (sp.depth) {
      lines.push(line(1.13))
      lines.push(line(1.25, 1.125, this.islet(1.25, sp)))
    }
    const under = []
    const over = []
    for (const { d, k: kc, m, f } of lines) {
      const w = R(sp.sw * m * 1000) / 1000
      under.push({ el: 'path', d, stroke: '@under', 'stroke-width': w, opacity: o3((1 - kc) * f * (1 - lv.ink)) })
      under.push({ el: 'path', d, stroke: '@water', 'stroke-width': w, opacity: o3(0.5 * (1 - kc) * f * lv.ink) })
      over.push({ el: 'path', d, stroke: '@line', 'stroke-width': w, opacity: o3(0.45 * kc * f) })
    }
    const coast = ls > 0.01 ? curve(this.contour(ls, sp)) : 'M0 0'
    const isle = mu > 0.02 ? curve(this.islet(mu, sp)) : 'M0 0'
    const flood = lv.k > 0.001 && lv.o > 0 ? curve(this.contour(lerp(Math.max(ls, 0.01), 3.4, lv.k), sp)) : 'M0 0'
    const cw = R(sp.coast * 1000) / 1000
    return {
      kids: [
        { el: 'path', d: flood, fill: '@live', opacity: o3(lv.k > 0.001 ? lv.o : 0) },
        { el: 'g', fill: 'none', kids: under },
        { el: 'path', d: coast + isle, fill: '@land' },
        { el: 'path', d: coast + isle, fill: 'none', stroke: sp.ink, 'stroke-width': cw, 'stroke-linejoin': 'round', opacity: o3(1 - lv.ink) },
        { el: 'path', d: coast + isle, fill: 'none', stroke: '@water', 'stroke-width': cw, 'stroke-linejoin': 'round', opacity: o3(0.85 * lv.ink) },
        { el: 'g', fill: 'none', kids: over },
      ],
    }
  },
}

/* 3. Counties: three counties of one island, one of them sealed. Only the open land moves. */
const COUNTY_LOBES = [[0.035, 3, 1.2], [0.025, 2, 2.4]]
const counties = {
  id: 'counties',
  name: 'Counties',
  means: 'Locus splits your company into areas, and seals the ones a reader can’t open.',
  idea: 'Three counties of one island, one sealed. The open land’s contours run inland and stop at the seal.',
  period: 12,
  flow: 6,
  introDur: 1.6,
  palettes: {
    light: { ground: '#d5dce2', edge: 'none', land: '#fcfdfd', line: '#15191e', seal: '#d63c27', tint: '#fbe9e4', solid: '#f0b2a5' },
    dark: { ground: '#232c37', edge: 'rgba(232,230,223,0.14)', edgeS: 'rgba(232,230,223,0.18)', land: '#e8e6df', line: '#15191e', seal: '#ea5a44', tint: '#f3d6cf', solid: '#e9a093' },
  },
  // n open contours in the still. `show` are the borders drawn dashed in ink once the intro is over:
  // all three where there's room, only the open one below. The seal is its tint and hatch, with
  // vermilion only along its own coast (`edge`). legs: each border's angle from the junction; bay:
  // the north-west bay [depth, angle, width]. Below 28 px it is the 16 px drawing, with no border.
  weights: ['csw', 'coast', 'hsw', 'bsw', 'edge', 'dash'],
  bounds: { XS: 28 },
  spec: {
    L: { n: 2, csw: 0.55, coast: 0.55, hatch: 2.3, hsw: 0.42, hop: 0.55, dash: '2.6 1.6', bsw: 0.65, show: [0, 1, 2], edge: 0.55, legs: [-1.25, 0.95, 2.75], bay: [5, 3.6, 0.32] },
    M: { n: 1, csw: 1.15, coast: 1.1, hatch: 3.4, hsw: 0.95, hop: 0.55, dash: '4.4 2.8', bsw: 1.2, show: [0, 1, 2], edge: 1.1, legs: [-1.25, 0.95, 2.75], bay: [5, 3.6, 0.32] },
    S: { n: 0, csw: 0, coast: 2.1, hatch: 5.2, hsw: 1.6, hop: 0.7, dash: '5.5 4', bsw: 2.1, show: [2], edge: 2.1, fill: '@solid', legs: [-1.25, 0.95, 1.9], bay: [5, 3.6, 0.32] },
    XS: { n: 0, csw: 0, coast: 3.1, hatch: 6.5, hsw: 3.1, hop: 0.85, dash: '6.25 4.7', bsw: 3.1, show: [2], edge: 3.1, fill: '@solid', legs: [-1.1, 0.8, 1.9], bay: [10, 3.6, 0.5] },
    XXS: { n: 0, csw: 0, coast: 6.2, hatch: 0, dash: '', bsw: 0, show: [], edge: 6.2, fill: '@seal', legs: [-1.1, 0.8, 2.2], bay: [12, 3.6, 0.55] },
  },
  C: [50, 51],
  S: [40, 58],
  J: [61, 44],
  /** Per tier: the island (a longer one, its long axis rising to the north-east) and its borders. */
  geo(tier) {
    const cache = (this._geo ||= {})
    if (cache[tier]) return cache[tier]
    const sp = this.spec[tier]
    return (cache[tier] = { coast: island({ a: 41, b: 27, tilt: -0.5, lobes: COUNTY_LOBES, dents: [sp.bay] }), legs: sp.legs })
  },
  /** A leg's angle at distance r from the junction: a gentle wander on two periods that never repeat. */
  legAngle(g, i, r) {
    const ph = [0.4, 2.1, 4.0][i]
    const m = (1.3 * Math.sin((TAU * r) / 26 + ph) + 0.55 * Math.sin((TAU * r) / 11.3 + 2.3 * ph)) * smooth(0, 8, r)
    return g.legs[i] + m / Math.max(r, 10)
  },
  inLand(g, x, y) {
    const [cx, cy] = this.C
    return Math.hypot(x - cx, y - cy) < g.coast(Math.atan2(y - cy, x - cx))
  },
  inSealed(g, x, y) {
    const [jx, jy] = this.J
    const r = Math.hypot(x - jx, y - jy)
    const a = Math.atan2(y - jy, x - jx)
    return a > this.legAngle(g, 0, r) && a < this.legAngle(g, 1, r)
  },
  /** Leg i's points, from the junction to exactly where it meets the coast. */
  leg(g, i) {
    const [jx, jy] = this.J
    const at = (r) => [jx + r * Math.cos(this.legAngle(g, i, r)), jy + r * Math.sin(this.legAngle(g, i, r))]
    let lo = 0
    let hi = 90
    for (let k = 0; k < 40; k++) {
      const m = (lo + hi) / 2
      if (this.inLand(g, ...at(m))) lo = m
      else hi = m
    }
    const pts = []
    const n = Math.max(4, Math.round(lo / 3.5))
    for (let k = 0; k <= n; k++) pts.push(at((k / n) * lo))
    return pts
  },
  /** The coast as nodes from one point on it to another, clockwise round the island's centre. */
  arc(g, from, to) {
    const [cx, cy] = this.C
    const a = Math.atan2(from[1] - cy, from[0] - cx)
    let b = Math.atan2(to[1] - cy, to[0] - cx)
    while (b <= a) b += TAU
    const pts = [from]
    const stepA = TAU / 32
    for (let th = Math.ceil(a / stepA + 0.2) * stepA; th < b - 0.2 * stepA; th += stepA) {
      const r = g.coast(th)
      pts.push([cx + r * Math.cos(th), cy + r * Math.sin(th)])
    }
    pts.push(to)
    return pts
  },
  coastPts(g, lam = 1) {
    const [cx, cy] = this.C
    const [sx, sy] = this.S
    return around(cx, cy, 32, 0, (th) => g.coast(th, Math.min(1, lam) ** 1.3)).map(([x, y]) => [sx + lam * (x - sx), sy + lam * (y - sy)])
  },
  /** Diagonal hatch inside the sealed county, as segments. */
  hatch(g, gap) {
    const u = [Math.SQRT1_2, -Math.SQRT1_2]
    const nrm = [Math.SQRT1_2, Math.SQRT1_2]
    const inside = (x, y) => this.inLand(g, x, y) && this.inSealed(g, x, y)
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
  /** The parts that never move, built once per tier. */
  fixed(tier) {
    const cache = (this._fixed ||= {})
    if (cache[tier]) return cache[tier]
    const sp = this.spec[tier]
    const g = this.geo(tier)
    const legs = [0, 1, 2].map((i) => this.leg(g, i))
    const endA = legs[0][legs[0].length - 1]
    const endB = legs[1][legs[1].length - 1]
    const shore = this.arc(g, endA, endB)
    const county = curve(legs[0], false) + curve(shore, false, false) + curve(legs[1].slice().reverse(), false, false) + 'Z'
    // The open land, for the contours: they never enter the seal, not even while the intro writes them.
    const open = curve(legs[1], false) + curve(this.arc(g, endB, endA), false, false) + curve(legs[0].slice().reverse(), false, false) + 'Z'
    return (cache[tier] = { g, legs, county, open, shore: curve(shore, false), coast: curve(this.coastPts(g)), hatch: sp.hatch ? this.hatch(g, sp.hatch) : [] })
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
  frame({ t, p, tier, sp }) {
    const fx = this.fixed(tier)
    const s = p * this.introDur
    const intro = p < 1
    // The open land's contours run inland from the coast, one interval every 6 s, and die out at λ 0.2.
    const phi = intro ? 0 : ((t * this.period) / this.flow) % 1
    const gap = 0.8 / (sp.n + 1)
    const contours = []
    for (let j = 0; j <= sp.n && sp.n; j++) {
      const lam = 1 - gap * (j + phi)
      // Hidden until it is well clear of the coast, so the coast never doubles; gone by λ 0.2.
      let op = smooth(0.85, 0.72, lam) * smooth(0.2, 0.32, lam)
      let draw = {}
      if (intro) {
        if (j === 0) op = 0
        else draw = drawOn(step(s, 0.55, 0.95))
      }
      contours.push({ el: 'path', d: curve(this.coastPts(fx.g, lam)), opacity: o3(op), ...draw })
    }
    // While the intro writes the coast and the seal's shore, their own pathLength is 1 so a dash can measure them.
    const len1 = intro ? { pathLength: 1 } : {}
    // The seal arrives as one hard wipe from the junction, across the county to the far coast.
    const wipe = intro ? lerp(-4, 50, step(s, 1.05, 1.3, INOUT)) : null
    const sealKids = [{ el: 'use', href: '#county', fill: sp.fill || '@tint' }]
    if (fx.hatch.length) sealKids.push({ el: 'path', d: fx.hatch.map(([a, b]) => `M${pt(a)}L${pt(b)}`).join(''), fill: 'none', stroke: '@seal', 'stroke-width': R(sp.hsw * 1000) / 1000, opacity: sp.hop, 'clip-path': 'url(#sealed)' })
    const kids = [{ el: 'use', href: '#coast', fill: '@land', opacity: intro ? o3(step(s, 0.3, 0.6, INOUT)) : 1 }]
    if (contours.length) kids.push({ el: 'g', fill: 'none', stroke: '@line', 'stroke-width': R(sp.csw * 1000) / 1000, 'stroke-opacity': 0.45, 'clip-path': 'url(#open)', kids: contours })
    kids.push(intro ? { el: 'g', 'clip-path': 'url(#wipe)', kids: sealKids } : { el: 'g', kids: sealKids })
    if (sp.coast) kids.push({ el: 'use', href: '#coast', fill: 'none', stroke: '@line', 'stroke-width': R(sp.coast * 1000) / 1000, 'stroke-linejoin': 'round', opacity: 0.45, ...(intro ? drawOn(step(s, 0, 0.45)) : {}) })
    // The Y, dashed ink: written out from the junction on the intro, and kept.
    if (sp.bsw && sp.show.length) {
      const k = intro ? step(s, 0.45, 0.85) : 1
      kids.push({
        el: 'g', fill: 'none', stroke: '@line', 'stroke-width': R(sp.bsw * 1000) / 1000, 'stroke-linecap': 'round', opacity: 0.9,
        ...(sp.dash ? { 'stroke-dasharray': sp.dash } : {}),
        kids: sp.show.map((i) => ({ el: 'path', d: curve(this.partial(fx.legs[i], k), false) })),
      })
    }
    // Vermilion only on sealed land: along the sealed county's own coast, written last.
    if (sp.edge) kids.push({ el: 'use', href: '#shore', fill: 'none', stroke: '@seal', 'stroke-width': R(sp.edge * 1000) / 1000, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...(intro ? drawOn(step(s, 1.3, 1.55)) : {}) })
    const [jx, jy] = this.J
    const deg = R((((fx.g.legs[0] + fx.g.legs[1]) / 2) * 180) / Math.PI)
    return {
      defs: [
        { el: 'path', id: 'coast', d: fx.coast, ...len1 },
        { el: 'path', id: 'county', d: fx.county },
        { el: 'path', id: 'shore', d: fx.shore, ...len1 },
        { el: 'clipPath', id: 'open', kids: [{ el: 'path', d: fx.open }] },
        { el: 'clipPath', id: 'sealed', kids: [{ el: 'use', href: '#county' }] },
        ...(intro ? [{ el: 'clipPath', id: 'wipe', kids: [{ el: 'rect', x: -200, y: -200, width: R(200 + wipe), height: 400, transform: `translate(${jx} ${jy}) rotate(${deg})` }] }] : []),
      ],
      kids,
    }
  },
}

/* 4. Col: a summit, a lower knoll and the pass between them, marked with the pass sign. */
const col = {
  id: 'col',
  name: 'Col',
  means: 'Locus is the pass: the one way through, where your company and an agent meet.',
  idea: 'A summit, a lower knoll and the pass between them, marked as hiking maps mark a col: )(.',
  period: 14,
  introDur: 1.4,
  palettes: {
    light: { ground: '#fcfdfd', edge: 'rgba(21,25,30,0.14)', line: '#15191e', mark: '#15191e' },
    dark: { ground: '#1a212a', edge: 'rgba(232,230,223,0.14)', edgeS: 'rgba(232,230,223,0.18)', line: '#e8e6df', mark: '#e8e6df' },
  },
  // One height field and one contour interval: `ks` are steps of `h` above (+) or below (−) the col's
  // height. Above it a contour rings one summit; below it, it rings both. `index` is drawn at `iw`.
  // The pass sign )( (arc radius, distance from the col to each arc's crown, half its sweep) is drawn
  // at the index's weight, from 64 px up (the middle band has one summit ring fewer than L, so it
  // doesn't clog). Below that the mark is one line round its point, with a dent
  // under the col (`dent`, in units) so its base is never flat. span: how wide the outermost contour
  // is drawn, so each size fills its tile.
  weights: ['sw', 'iw', 'dot'],
  bounds: { M: 64 },
  spec: {
    L: { ks: [2.5, 1.5, 0.5, -0.5, -1.5], index: -1.5, sw: 0.6, iw: 1.2, arc: 8, gap: 3.2, sweep: 0.6, dot: 1.6, span: 68, hb: 0.62 },
    M: { ks: [1.5, -0.5, -1.5], index: -1.5, sw: 1.25, iw: 2.4, arc: 8, gap: 3.6, sweep: 0.6, dot: 2.4, span: 70, hb: 0.62 },
    S: { ks: [-1.5], index: -1.5, sw: 5.2, iw: 5.2, arc: 0, dot: 4.6, sb: 14, hb: 0.72, span: 74, dent: 3 },
    XS: { ks: [-3.5], index: -3.5, sw: 5.8, iw: 5.8, arc: 0, dot: 6.4, sb: 14, hb: 0.72, span: 74, dent: 3 },
    XXS: { ks: [-3.5], index: -3.5, sw: 8.6, iw: 8.6, arc: 0, dot: 10.5, sb: 14, hb: 0.72, span: 74, dent: 3 },
  },
  // On a shallow axis, about 21°, so no size reads as a chain link.
  A: [33, 44],
  B: [69, 58],
  sa: 22,
  sb: 14,
  hb: 0.7,
  h: 0.13,
  field(ha, hb, [ax, ay], [bx, by], sa, sb) {
    const a2 = sa * sa
    const b2 = sb * sb
    return (x, y) => ha * Math.exp(-((x - ax) ** 2 + (y - ay) ** 2) / a2) + hb * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / b2)
  },
  /** A contour as n nodes round a centre: along each ray, the first place the field falls below the level. */
  ring(F, c, level, n, a0, dent = null) {
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
      return dent ? lo - dent.depth * Math.exp(-((wrap(a - dent.at) / 0.42) ** 2)) : lo
    })
  },
  /** The whole drawing at one moment, in field coordinates: the col, its height, and each contour. */
  build(sp, t, amp) {
    const [ax, ay] = this.A
    const [bx, by] = this.B
    const u = [bx - ax, by - ay]
    const ua = Math.atan2(u[1], u[0])
    // The summit and the knoll rise and fall in turn, by 2.5%, and the col follows.
    const ha = 1 + 0.025 * amp * wave(t)
    const hb = (sp.hb || this.hb) - 0.025 * amp * wave(t)
    const F = this.field(ha, hb, this.A, this.B, this.sa, sp.sb || this.sb)
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
    const rings = []
    // The dent sits on the south side, straight under the col.
    const dent = sp.dent ? { depth: sp.dent, at: ua + Math.PI / 2 } : null
    for (const k of sp.ks) {
      const level = fc + this.h * k
      if (k > 0) {
        for (const [H, toward] of [[this.A, ua], [this.B, ua + Math.PI]]) {
          if (F(...H) < level + 0.005) continue
          const pts = this.ring(F, H, level, 10, toward)
          const mean = pts.reduce((a, q) => a + Math.hypot(q[0] - H[0], q[1] - H[1]), 0) / pts.length
          // A ring too small to read fades out rather than popping.
          rings.push({ k, pts, op: smooth(2.5, 4, mean) })
        }
      } else rings.push({ k, pts: this.ring(F, c, level, dent ? 32 : 24, ua + Math.PI / 2, dent), op: 1 })
    }
    return { c, ua, rings }
  },
  /** Per size: centre the outermost contour in the tile and draw it `span` units across. */
  fit(tier) {
    const cache = (this._fit ||= {})
    if (cache[tier]) return cache[tier]
    const sp = this.spec[tier]
    const { rings } = this.build(sp, 0, 0)
    const outer = rings.find((r) => r.k === Math.min(...sp.ks)).pts
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const [x, y] of outer) {
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
    const z = sp.span / Math.max(x1 - x0, y1 - y0)
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    return (cache[tier] = { z, map: (q) => [50 + z * (q[0] - cx), 50 + z * (q[1] - cy)] })
  },
  frame({ t, amp, p, tier, sp }) {
    const s = p * this.introDur
    const intro = p < 1
    const { z, map } = this.fit(tier)
    const { c: c0, ua, rings } = this.build(sp, t, amp)
    const c = map(c0)
    const lines = []
    const n = sp.ks.length
    rings.forEach(({ k, pts, op }) => {
      const i = sp.ks.indexOf(k)
      const w = R((k === sp.index ? sp.iw : sp.sw) * 1000) / 1000
      // Written from the col side, the outermost first, 0.4 s each, 0.06 s apart: 0.45–1.09 s in all.
      const draw = intro ? drawBoth(step(s, 0.45 + 0.06 * (n - 1 - i), 0.85 + 0.06 * (n - 1 - i))) : {}
      lines.push({ el: 'path', d: curve(pts.map(map)), 'stroke-width': w, opacity: o3(op), ...draw })
    })
    const kids = [{ el: 'g', fill: 'none', stroke: '@line', 'stroke-linecap': 'round', kids: lines }]
    // The point. On the intro it is the sight: a ring that closes on the col from inside the tile,
    // fading in as it starts, and fills to become the point.
    if (intro) {
      const k = step(s, 0, 0.5, INOUT)
      const fillK = smooth(0.4, 0.46, s)
      const thin = 1 - smooth(0.44, 0.5, s)
      kids.push({ el: 'circle', cx: R(c[0]), cy: R(c[1]), r: R(lerp(34, sp.dot, k)), fill: '@mark', 'fill-opacity': o3(fillK), stroke: '@mark', 'stroke-width': o3(Math.max(sp.sw, 0.9) * thin), opacity: o3(clamp(s / 0.12)) })
    } else kids.push({ el: 'circle', cx: R(c[0]), cy: R(c[1]), r: R(sp.dot * 1000) / 1000, fill: '@mark' })
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
        el: 'path', d: arcAt(-1) + arcAt(1), fill: 'none', stroke: '@mark', 'stroke-width': o3(sp.iw / z), 'stroke-linecap': 'round', opacity: m.o,
        transform: `translate(${R(c[0])} ${R(c[1])}) rotate(${R((ua * 1800) / Math.PI) / 10}) scale(${R(z * m.s * 1000) / 1000})`,
      })
    }
    return { kids }
  },
}

/* 5. Inset: the tile's own outline laid on a coast, as an atlas marks an inset. */
const inset = {
  id: 'inset',
  name: 'Inset',
  means: 'Locus is the close-up: one place on the map, shown in the detail you choose to share.',
  idea: 'The tile’s own outline laid on a coast, as an atlas marks an inset: the place, shown in detail.',
  period: 16,
  introDur: 1.4,
  palettes: {
    light: { ground: '#d5dce2', groundS: '#c9d1da', edge: 'rgba(21,25,30,0.14)', land: '#fcfdfd', coast: 'rgba(21,25,30,0.55)', coastS: '#15191e', frame: '#15191e', line: '#15191e' },
    dark: { ground: '#202833', edge: 'rgba(232,230,223,0.14)', edgeS: 'rgba(232,230,223,0.18)', land: '#e8e6df', coast: 'rgba(232,230,223,0.5)', coastS: 'rgba(232,230,223,0.85)', frame: '#15191e', line: '#15191e' },
  },
  // frame: the inset's size in units; frameW its stroke, always heavier than the coast's. Inside the
  // frame, at L and M only, the land's contours (`levels` of one hill) and its point. Below that the
  // frame is empty: a dot in a small rounded square reads as a stop button.
  weights: ['coastW', 'frameW', 'sw', 'dot'],
  spec: {
    L: { frame: 30, frameW: 1.1, coastW: 0.49, ink: '@coast', levels: [0.2, 0.45, 0.7], sw: 0.7, dot: 2.2, nodes: 76, crinkle: 1 },
    M: { frame: 30, frameW: 1.667, coastW: 0.91, ink: '@coast', levels: [0.3, 0.6], sw: 0.9, dot: 3, nodes: 44, crinkle: 0 },
    S: { frame: 28, frameW: 2.917, coastW: 2.083, ink: '@coastS', levels: [], sw: 0, dot: 0, nodes: 32, crinkle: 0 },
    XS: { frame: 28, frameW: 4.22, coastW: 3.125, ink: '@coastS', levels: [], sw: 0, dot: 0, nodes: 32, crinkle: 0 },
    XXS: { frame: 30, frameW: 6.56, coastW: 6.25, ink: '@coastS', levels: [], sw: 0, dot: 0, nodes: 28, crinkle: 0, ground: '@groundS' },
  },
  // The land is the south-west, a great curve of coast round (−4, 104), running off the left and
  // bottom edges. The frame sits on the land: at least 6.7 units from the coast at every moment of
  // the drift, and 17 from the tile's edge. The hill stands south-west of the frame's centre, its
  // outer rings running off the frame, so the frame crops a slope rather than framing a lens. Its
  // point, 0.4 units north-east of the hill's centre, sits 4.4 units off the frame's centre and at
  // most 8.7 as the land moves, at least 6 units inside the frame's stroke.
  O: [-4, 104],
  F: [32, 68],
  hillAt: [-4, 3],
  coastR(a, crinkle) {
    // The last term pulls the coast in where it meets the bottom edge, so the corner holds a patch of sea.
    return 86 - 4.2 * Math.sin(7 * a + 0.4) - 2.2 * Math.sin(17 * a + 1.3) - crinkle * 0.8 * Math.sin(41 * a) - 6 * Math.exp(-(((a + 0.05) / 0.25) ** 2))
  },
  coastPts(sp, off) {
    const [ox, oy] = this.O
    const pts = []
    const a0 = -1.78
    const a1 = 0.16
    for (let i = 0; i <= sp.nodes; i++) {
      const a = lerp(a0, a1, i / sp.nodes)
      const r = this.coastR(a, sp.crinkle)
      pts.push([ox + off[0] + r * Math.cos(a), oy + off[1] + r * Math.sin(a)])
    }
    return pts
  },
  /** An ellipse as two arcs, from the end of its long axis: small, exact and editable. */
  ellipse(c, rx, ry, rot) {
    const ux = Math.cos(rot)
    const uy = Math.sin(rot)
    const p0 = [c[0] + rx * ux, c[1] + rx * uy]
    const p1 = [c[0] - rx * ux, c[1] - rx * uy]
    const deg = R((rot * 180) / Math.PI)
    const a = `${R(rx)} ${R(ry)} ${deg} 1 1`
    return `M${pt(p0)}A${a} ${pt(p1)}A${a} ${pt(p0)}Z`
  },
  frame({ t, amp, p, sp }) {
    const s = p * this.introDur
    const intro = p < 1
    // The land drifts under the still frame along a small ellipse, as the product's map pans under its view.
    const off = [3.5 * amp * Math.sin(TAU * t), 2.5 * amp * Math.cos(TAU * t)]
    const pts = this.coastPts(sp, off)
    const coast = curve(pts, false)
    const last = pts[pts.length - 1]
    const land = coast + `L${R(last[0])} 140L-40 140L-40 ${R(pts[0][1])}Z`
    const [fx, fy] = this.F
    const S = sp.frame / 100
    const frameT = (k) => `translate(${R(fx)} ${R(fy)}) scale(${R(S * k * 1e4) / 1e4}) translate(-50 -50)`
    const kids = [{ el: 'path', d: land, fill: '@land', opacity: intro ? o3(step(s, 0.3, 0.55, INOUT)) : 1 }]
    const defs = []
    // Inside the frame, and only there, the land's detail: one hill's contours and its point.
    if (sp.levels.length) {
      const H = [fx + this.hillAt[0] + off[0], fy + this.hillAt[1] + off[1]]
      const rings = sp.levels.map((l, i) => {
        const q = Math.sqrt(-Math.log(l))
        // The intro brings them up outward from the point, 0.08 s apart, after the point is pressed. They
        // fade in place: written on, all from one angle, they read as a spiral.
        const k = sp.levels.length - 1 - i
        const op = intro ? step(s, 0.9 + 0.08 * k, 1.24 + 0.08 * k) : 1
        return { el: 'path', d: this.ellipse(H, 16 * q, 12 * q, -0.5), opacity: o3(op) }
      })
      defs.push({ el: 'clipPath', id: 'inset', kids: [{ el: 'use', href: '#tile', transform: frameT(1) }] })
      const m = intro ? summitPress(s - 0.85) : { s: 1, o: 1 }
      kids.push({
        el: 'g', 'clip-path': 'url(#inset)',
        kids: [
          { el: 'g', fill: 'none', stroke: '@line', 'stroke-opacity': 0.5, 'stroke-width': o3(sp.sw), kids: rings },
          { el: 'circle', cx: R(H[0] + 0.4), cy: R(H[1] - 0.4), r: o3(sp.dot * m.s), fill: '@line', opacity: o3(m.o) },
        ],
      })
    }
    kids.push({ el: 'path', d: coast, fill: 'none', stroke: sp.ink, 'stroke-width': o3(sp.coastW), 'stroke-linejoin': 'round', ...(intro ? { pathLength: 1, ...drawOn(step(s, 0, 0.5, TIDE_EASE)) } : {}) })
    // The frame: the tile's own outline, solid, never filled, always on the land. Placed, then still.
    const k = intro ? step(s, 0.55, 0.85) : 1
    const sc = lerp(1.15, 1, k)
    kids.push({ el: 'use', href: '#tile', transform: frameT(sc), fill: 'none', stroke: '@frame', 'stroke-width': o3(sp.frameW / (S * sc)), opacity: o3(intro ? k : 1) })
    // At 16 px on light the sea is a step deeper, so the coast reads as a coast and not as a page.
    return { defs, kids, ground: sp.ground }
  },
}

/** Summit's press: 0.6 → 1.08 → 1 over 0.28 s, s seconds since it began. */
function summitPress(s) {
  if (s <= 0) return { s: 0.6, o: 0 }
  const k = s / 0.28
  return { s: k >= 1 ? 1 : k < 0.6 ? lerp(0.6, 1.08, OUT(k / 0.6)) : lerp(1.08, 1, INOUT((k - 0.6) / 0.4)), o: clamp(s / 0.1) }
}

export const VARIANTS = [summit, tide, counties, col, inset]

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
export function compose(v, { t = 0, amp = 0, p = 1, live = 0, tier, size, fade = 0, opts = {} } = {}) {
  tier ||= size ? tierOf(v, size) : 'L'
  size ||= REF[tier]
  const k = tier === 'L' ? 1 : REF[tier] / size
  const sp = specAt(v, tier, k)
  let out = v.frame({ t, amp, p, live, tier, sp, opts })
  // A flowing mark switched off far from its still stops, then cross-fades to the still.
  if (fade > 0) {
    const still = v.frame({ t: 0, amp: 0, p, live, tier, sp, opts })
    out = { ...out, kids: [{ el: 'g', opacity: R4(1 - fade), kids: out.kids }, { el: 'g', opacity: R4(fade), kids: still.kids }] }
  }
  const edge = SMALL.has(tier) ? '@edgeS' : '@edge'
  // The squircle is written once and used three times: as the clip, the ground and the edge.
  return [
    { el: 'defs', kids: [{ el: 'path', id: 'tile', d: SQUIRCLE }, { el: 'clipPath', id: 'sq', kids: [{ el: 'use', href: '#tile' }] }, ...(out.defs || [])] },
    { el: 'use', href: '#tile', fill: out.ground || '@ground' },
    { el: 'g', 'clip-path': 'url(#sq)', kids: [...out.kids, { el: 'use', href: '#tile', fill: 'none', stroke: edge, 'stroke-width': R(200 / size) }] },
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
export function svgFile(v, theme = 'light', size = 1024, opts = {}) {
  const pal = { edgeS: v.palettes[theme].edge, groundS: v.palettes[theme].ground, ...v.palettes[theme] }
  const uid = v.id
  const tier = tierOf(v, size)
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
  const kids = compose(v, { tier, size, opts })
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
    this.liveAt = null // live variants: when the going-live moment started (it may wait for the intro)
    this.lv = null
    this.opts = {} // the operator's options, such as Summit's seal
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
    this.mounts.push({ m, tier: tierOf(this.v, size), size })
    return m
  }
  /** Play the going-live moment once, after the intro if one is running. */
  goLive(now = performance.now()) {
    if (!this.v.live) return
    this.liveAt = this.introAt != null ? Math.max(now, this.introAt + this.v.introDur * 1000) : now
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
    const st = { t: (this.time / this.v.period) % 1, amp: this.amp, p: this.p, live: this.lv, fade: this.fade == null ? 0 : ease3(this.fade), opts: this.opts }
    for (const { m, tier, size } of this.mounts) m.draw((cache[size] ||= compose(this.v, { ...st, tier, size })))
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
    // Going live is a moment, played once: flood, hold, ebb. It waits for the intro to finish.
    if (this.liveAt != null && !intro) {
      const e = (now - this.liveAt) / 1000
      const m = e < 0 ? null : this.v.moment(e, this.reduced)
      this.lv = m && !m.done ? m : null
      if (m && m.done) this.liveAt = null
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
        // Off: if the next still can be reached within 1.2 s, finish the interval, braking at the end.
        // Otherwise stop over 0.5 s, then cross-fade to the still.
        const into = this.time % f
        const left = into < 1e-6 ? 0 : f - into
        // (Finishing at full speed until 0.35 from the still, then braking, takes left − 0.35 + 0.7 s.)
        if (this.braking || left <= 0.85 * this.spd) {
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
    return intro || moving || this.liveAt != null
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
