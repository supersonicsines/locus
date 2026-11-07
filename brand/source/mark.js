/*
  Col: the Locus mark. A summit, a lower knoll and the col between them, drawn in contour; the col's own contour
  crosses itself at the pass and the point sits on the crossing. This file is its one definition: the construction,
  the drawings per size, the drawing-in, and the files. Nothing here draws to a screen: brand/source/build.mjs writes
  every file in brand/logo from it, and `construction()` and `constructionMarkdown()` write the construction sheet from
  the same numbers, so the files, the book and the doc can't disagree.

  The construction (at L; every other drawing states its departures in `spec`)
  - Frame: C, the col, is the origin; the ridge runs along x from the summit (x < 0) to the knoll, laid at 22.5°.
  - The summit: circle A, RA = 16, |AC| = 2 RA. The crossing: two axes through C at ±ψ to the ridge, sin ψ = 4/5. Each of
    the four branches is the arc tangent to its axis at C and tangent inside to its lobe's circle: Q = 5/2 R.
  - The knoll: the summit's lobe scaled by −½ through C, so RB = RA/2 and C is the circles' internal centre of similitude.
  - The interval d = RA/4; the summit ends 4d above the col, the knoll 2d.
  - Above the col: each lobe scaled by (R + s)/R about H, 3R/8 beyond its centre; its tip rounded with ρ = 3/2 |s|,
    eased onto R above ρ = 0.55 R so a tip grows from a circle smoothly. Below the col: the figure-eight offset by s, its
    notches rounded with ρ = 7/4 s.
  - The line system of a survey sheet: the contours fine, the col's own contour the index at twice their weight, the
    point 3¼ times the index across (see LINES). Black lines on a white tile.
  - Every arc in a file is a true circular arc of at most 90°, at 0.001 units, so the browser draws the construction.

  The drawings, by device px: L ≥ 256; L− 160–255 (the summit's −3d ring left out, H at R/4); M 96–159 (d = RA/3: the
  outline at +d, the col's contour, the summit's −1d and −2d, the knoll's −1d, H at R/5); S 48–95 (d = RA/2: the outline,
  the col's contour and the summit's top); Col-X 26–47 (one land in ink, the hull at s = ¾ RA, ρ = s, the col's contour
  cut through it in paper, clamp(0.9 + 0.035 px, 1.5, 3.2) px wide); below 26 the same land with the point alone.

  Motion: the mark is drawn once, at 160 device px and up; every smaller drawing is the still, and so is reduced motion.
  The index contour first, in one stroke from the pass round the summit, through the pass and round the knoll; the
  contours below the col follow it out of the pass; the summit's contours follow as it crosses the pass, then the
  knoll's; the point is set on the crossing last. Then nothing moves. See `drawScore`.
*/

const TAU = Math.PI * 2
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))

/** CSS's cubic-bezier(), as a function of progress. */
function cubicBezier(x1, y1, x2, y2) {
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
const R2 = (v) => Math.round(v * 100) / 100
const o3 = (v) => Math.round(v * 1000) / 1000

/* ---------- vectors ---------- */

const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const mul = (a, k) => [a[0] * k, a[1] * k]
const len = (a) => Math.hypot(a[0], a[1])
const unit = (a) => mul(a, 1 / len(a))
const angle = (c, p) => Math.atan2(p[1] - c[1], p[0] - c[0])
const polar = (c, r, a) => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]
const flipX = (p) => [-p[0], p[1]]
const flipY = (p) => [p[0], -p[1]]

/* ---------- paths as segments ----------
   [{ M: p }, { L: p }, { A: p, c, r, dir }, { Z: true }]. dir +1 runs clockwise on screen. */

/** The sweep of an arc from a to b round c in the direction dir, in [0, 2π) or (−2π, 0]. */
function sweepOf(c, a, b, dir) {
  let d = angle(c, b) - angle(c, a)
  if (dir > 0) while (d < 0) d += TAU
  else while (d > 0) d -= TAU
  return d
}
/** An arc to `to` round c: the short way, or the way that passes through `via`. */
function arc(c, r, from, to, via) {
  const cw = sweepOf(c, from, to, 1)
  const dir = via ? (sweepOf(c, from, via, 1) <= cw ? 1 : -1) : cw <= Math.PI ? 1 : -1
  return { A: to, c, r, dir }
}

/** A transform: scale by z, rotate by th about the origin, then translate by o. Arcs stay arcs. */
function placement(th, o, z = 1) {
  const c = Math.cos(th) * z
  const s = Math.sin(th) * z
  const f = (p) => [o[0] + p[0] * c - p[1] * s, o[1] + p[0] * s + p[1] * c]
  f.z = z
  return f
}

const R3 = (v) => Math.round(v * 1000) / 1000
/** A number for a path, to 0.001: no trailing zeros, no leading zero ('.5', '-.5'). */
const num = (v) => {
  const t = String(R3(v) || 0)
  return t.startsWith('0.') ? t.slice(1) : t.startsWith('-0.') ? '-' + t.slice(2) : t
}
/** Numbers joined as SVG allows: a space between two, none before a minus sign. */
const join = (...xs) => xs.map((x, i) => (i && !String(x).startsWith('-') ? ' ' : '') + x).join('')
/** A path string rewritten compactly (the tile's, say), with the same numbers. */
export const compactPath = (d) => {
  let out = ''
  let prevNum = false
  for (const t of d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g)) {
    if (/[A-Za-z]/.test(t)) {
      out += t
      prevNum = false
    } else {
      const v = num(+t)
      out += (prevNum && !v.startsWith('-') ? ' ' : '') + v
      prevNum = true
    }
  }
  return out
}

/**
 * A segment list as an SVG path in the tile, to 0.001 units. An SVG arc is drawn from its end points and radius, and
 * the browser solves for the centre; when the chord is (nearly) the diameter that solve is ill-conditioned, and a
 * rounding of 0.01 can move the centre by √(r·δ). So no arc is written wider than 90°: any wider is split into equal
 * pieces of 90° or less, and a circle is four quarters. Every arc then lands on the construction.
 */
function toD(segs, map) {
  let d = ''
  let at = null
  const P = (q) => join(num(q[0]), num(q[1]))
  for (const g of segs) {
    if (g.M) {
      at = g.M
      d += `M${P(map(at))}`
    } else if (g.L) {
      if (len(sub(g.L, at)) < 1e-4) continue
      at = g.L
      d += `L${P(map(at))}`
    } else if (g.A) {
      const sw = sweepOf(g.c, at, g.A, g.dir)
      if (Math.abs(sw) < 1e-5 || g.r < 1e-4 || len(sub(g.A, at)) < 1e-5) {
        at = g.A
        continue
      }
      const rr = num(g.r * map.z)
      const n = Math.abs(sw) > Math.PI / 2 + 1e-9 ? Math.ceil(Math.abs(sw) / (Math.PI / 2) - 1e-9) : 1
      const a0 = angle(g.c, at)
      for (let i = 1; i <= n; i++) {
        const q = i === n ? g.A : polar(g.c, g.r, a0 + (sw * i) / n)
        const e = map(q)
        d += `A${join(rr, rr, 0, 0, g.dir > 0 ? 1 : 0, num(e[0]), num(e[1]))}`
      }
      at = g.A
    } else if (g.Z) d += 'Z'
  }
  return d
}

/** Each segment's length, in construction units. */
function lengths(segs) {
  const out = []
  let at = null
  for (const g of segs) {
    if (g.M) at = g.M
    else if (g.L) {
      out.push(len(sub(g.L, at)))
      at = g.L
    } else if (g.A) {
      out.push(len(sub(g.A, at)) < 1e-5 ? 0 : Math.abs(sweepOf(g.c, at, g.A, g.dir)) * g.r)
      at = g.A
    }
  }
  return out
}

/** Points along a segment list. */
function sample(segs, step = 0.4) {
  const pts = []
  let at = null
  for (const g of segs) {
    if (g.M) at = g.M
    else if (g.L) {
      const n = Math.max(1, Math.ceil(len(sub(g.L, at)) / step))
      for (let i = 1; i <= n; i++) pts.push(add(at, mul(sub(g.L, at), i / n)))
      at = g.L
    } else if (g.A) {
      const sw = len(sub(g.A, at)) < 1e-5 ? 0 : sweepOf(g.c, at, g.A, g.dir)
      const a0 = angle(g.c, at)
      const n = Math.max(2, Math.ceil((Math.abs(sw) * g.r) / step))
      for (let i = 1; i <= n; i++) pts.push(polar(g.c, g.r, a0 + (sw * i) / n))
      at = g.A
    }
  }
  return pts
}

const mirrorX = (segs) => segs.map((g) => (g.M ? { M: flipX(g.M) } : g.L ? { L: flipX(g.L) } : g.A ? { A: flipX(g.A), c: flipX(g.c), r: g.r, dir: -g.dir } : g))

/** A whole circle from angle a0, as four quarter arcs, so it can be written on from that point and is drawn exact. */
function circle(c, r, a0 = 0, dir = 1) {
  const q = (k) => polar(c, r, a0 + dir * k * (Math.PI / 2))
  return [{ M: q(0) }, { A: q(1), c, r, dir }, { A: q(2), c, r, dir }, { A: q(3), c, r, dir }, { A: q(0), c, r, dir }, { Z: true }]
}

/** Where circles (a, ra) and (b, rb) meet, on the side sg of the line from a to b (−1: left on screen). */
function meet(a, ra, b, rb, pick) {
  const D = len(sub(b, a))
  const x = (ra * ra - rb * rb + D * D) / (2 * D)
  const h2 = ra * ra - x * x
  if (h2 < 0 || D < 1e-9) return null
  const u = unit(sub(b, a))
  const n = [-u[1], u[0]]
  const base = add(a, mul(u, x))
  const p1 = add(base, mul(n, Math.sqrt(h2)))
  const p2 = sub(base, mul(n, Math.sqrt(h2)))
  return pick(p1) < pick(p2) ? p1 : p2
}

/* ======================================================================
   The construction
   ====================================================================== */

export const RIDGE = Math.PI / 8 // 22.5°
export const PSI = Math.asin(4 / 5)

/**
 * A lobe built on the +x side (the knoll's; the summit's is its mirror): its circle (A, R) at |AC| = c R, and the two
 * branches that leave C at ±ψ, each the arc tangent to its axis at C and tangent inside to the circle at T.
 */
function lobeOf(R, c, psi = PSI) {
  const sn = Math.sin(psi)
  const cs = Math.cos(psi)
  const A = [c * R, 0]
  const Q = (R * (c * c - 1)) / (2 * (c * sn - 1))
  const Pu = [Q * sn, Q * cs] // the upper branch's centre: below the ridge, as the branch bends towards it
  const Tu = add(Pu, mul(unit(sub(A, Pu)), Q))
  return { A, R, Q, Pu, Pl: flipY(Pu), Tu, Tl: flipY(Tu), C: [0, 0], far: [A[0] + R, 0] }
}

/** A lobe scaled by k about H (on the ridge). */
function scaled(L, H, k) {
  const f = (p) => add(H, mul(sub(p, H), k))
  return { A: f(L.A), R: L.R * k, Q: L.Q * k, Pu: f(L.Pu), Pl: f(L.Pl), Tu: f(L.Tu), Tl: f(L.Tl), C: f(L.C), far: f(L.far) }
}

/**
 * A lobe's ring on the +x side, its tip at L.C rounded with radius rho. rho = 0 is the col's own sharp lobe, written
 * from C round the lobe and back (open, so no join is drawn at the X); rho ≥ R is the lobe's circle alone.
 */
function lobeRing(L, rho, open = false) {
  if (rho >= L.R - 1e-6) return circle(L.A, L.R, Math.PI, 1)
  if (rho <= 1e-6) {
    const segs = [{ M: L.C }, arc(L.Pu, L.Q, L.C, L.Tu), arc(L.A, L.R, L.Tu, L.Tl, L.far), arc(L.Pl, L.Q, L.Tl, L.C)]
    return open ? segs : [...segs, { Z: true }]
  }
  const py = L.Pu[1] - L.C[1]
  const fx = L.Pu[0] - Math.sqrt((L.Q - rho) ** 2 - py * py)
  const F = [fx, 0]
  const fu = add(L.Pu, mul(unit(sub(F, L.Pu)), L.Q))
  const fl = flipY(fu)
  const apex = [fx - rho, 0]
  return [{ M: apex }, arc(F, rho, apex, fu), arc(L.Pu, L.Q, fu, L.Tu), arc(L.A, L.R, L.Tu, L.Tl, L.far), arc(L.Pl, L.Q, L.Tl, fl), arc(F, rho, fl, apex), { Z: true }]
}

/** The geometry every contour is built from: both lobes, the interval, the rounding. */
function saddleGeo({ RA = 16, rb = 0.5, c = 2, lam = 0.5, mu = 1.5, muN = 1.75, d = RA / 4, psi = PSI } = {}) {
  const LB = lobeOf(RA * rb, c, psi)
  const LAr = lobeOf(RA, c, psi) // built on +x, mirrored when drawn
  return { RA, RB: RA * rb, c, lam, mu, muN, d, LAr, LB, HA: [LAr.A[0] + lam * RA, 0], HB: [LB.A[0] + lam * LB.R, 0] }
}

/** Is p on the arc of circle cen that runs from a (the C end) towards b (the T end), the short way, give or take? */
function onArc(cen, a, b, p) {
  const full = sweepOf(cen, a, b, 1)
  const dir = full <= Math.PI ? 1 : -1
  const span = Math.abs(sweepOf(cen, a, b, dir))
  const at = sweepOf(cen, a, p, dir)
  const x = dir > 0 ? at : -at
  return (x <= span + 1e-6 && x >= -0.35) || x >= TAU - 0.35
}

/**
 * A hull ring at s > 0: the outward offset of the figure-eight by s, its notches rounded with rho. Returns the segments
 * from the upper notch round the summit, the lower notch and the knoll, and `fb`, how far along its length the lower
 * notch is (the intro writes it from both notches).
 */
function hullRing(G, s, rho) {
  const A = { L: G.LAr, flip: true }
  const B = { L: G.LB, flip: false }
  const side = (S, part, up) => {
    const L = S.L
    const f = S.flip ? flipX : (p) => p
    const fy = up ? (p) => p : flipY
    if (part === 'branch') return { c: f(fy(L.Pu)), r: L.Q + s, a: f(fy(L.C)), b: f(fy(L.Tu)) }
    return { c: f(L.A), r: L.R + s }
  }
  const notch = (up) => {
    const pick = (p) => (up ? p[1] : -p[1])
    for (const [pa, pb] of [['branch', 'branch'], ['circle', 'branch'], ['branch', 'circle'], ['circle', 'circle']]) {
      const a = side(A, pa, up)
      const b = side(B, pb, up)
      const F = meet(a.c, a.r + rho, b.c, b.r + rho, pick)
      if (!F) continue
      const ta = add(a.c, mul(unit(sub(F, a.c)), a.r))
      const tb = add(b.c, mul(unit(sub(F, b.c)), b.r))
      if (pa === 'branch' && !onArc(a.c, a.a, a.b, ta)) continue
      if (pb === 'branch' && !onArc(b.c, b.a, b.b, tb)) continue
      return { F, ta, tb, pa, pb, a, b }
    }
    return null
  }
  const top = notch(true)
  const bot = notch(false)
  const LA = G.LAr
  const LB = G.LB
  const cA = flipX(LA.A)
  const cB = LB.A
  const rA = LA.R + s
  const rB = LB.R + s
  // Where each offset branch meets its offset circle (on the line through both centres, as for the originals).
  const jAu = add(cA, mul(unit(sub(flipX(LA.Tu), cA)), rA))
  const jAl = flipY(jAu)
  const jBu = add(cB, mul(unit(sub(LB.Tu, cB)), rB))
  const jBl = flipY(jBu)
  const mid = (N, from, to) => {
    const a1 = angle(N.F, from)
    const sw = sweepOf(N.F, from, to, sweepOf(N.F, from, to, 1) <= Math.PI ? 1 : -1)
    return polar(N.F, rho, a1 + sw / 2)
  }
  const mt = mid(top, top.tb, top.ta)
  const segs = [{ M: mt }, arc(top.F, rho, mt, top.ta)]
  if (top.pa === 'branch') segs.push(arc(top.a.c, top.a.r, top.ta, jAu))
  const aFrom = top.pa === 'branch' ? jAu : top.ta
  const aTo = bot.pa === 'branch' ? jAl : bot.ta
  segs.push(arc(cA, rA, aFrom, aTo, [cA[0] - rA, 0]))
  if (bot.pa === 'branch') segs.push(arc(bot.a.c, bot.a.r, jAl, bot.ta))
  const mb = mid(bot, bot.ta, bot.tb)
  segs.push(arc(bot.F, rho, bot.ta, mb))
  const fbAt = segs.length
  segs.push(arc(bot.F, rho, mb, bot.tb))
  if (bot.pb === 'branch') segs.push(arc(bot.b.c, bot.b.r, bot.tb, jBl))
  const bFrom = bot.pb === 'branch' ? jBl : bot.tb
  const bTo = top.pb === 'branch' ? jBu : top.tb
  segs.push(arc(cB, rB, bFrom, bTo, [cB[0] + rB, 0]))
  if (top.pb === 'branch') segs.push(arc(top.b.c, top.b.r, jBu, top.tb))
  segs.push(arc(top.F, rho, top.tb, mt), { Z: true })
  const ls = lengths(segs)
  const total = ls.reduce((a, b) => a + b, 0)
  const fb = ls.slice(0, fbAt - 1).reduce((a, b) => a + b, 0) / total
  return { segs, fb, total, notchTop: mt, notchBot: mb, infl: [top.ta, top.tb, bot.ta, bot.tb] }
}

/**
 * A lobe's tip rounding, as a fraction of its radius, from u = ρ/R by the card's rule (ρ = 3/2 |s|). The rule holds
 * exactly up to u = 0.55, which covers every tipped ring the still draws (they sit at u = 0.5). Above it, ρ eases onto R
 * as 1 − ρ/R = 0.45 (1 − v)⁴ (1 + 3v), v = (u − 0.55) / 0.45, matched in slope at 0.55. Without that, the tip's apex moves
 * as √(R − ρ), infinitely fast at the moment a circle first grows a tip, and in the growth the tip springs out.
 */
const U0 = 0.55
function tipRound(u) {
  if (u <= U0) return u
  if (u >= 1) return 1
  const v = (u - U0) / (1 - U0)
  return 1 - (1 - U0) * (1 - v) ** 4 * (1 + 3 * v)
}

/**
 * The contour at level s, as parts: { who: 'hull' | 'A' | 'B' | 'col', segs, total, fb?, R? }.
 * mu may be given to round the notches differently (the small form).
 */
function contour(G, s, mu) {
  if (Math.abs(s) < 1e-9) {
    const a = mirrorX(lobeRing(G.LAr, 0, true))
    const b = lobeRing(G.LB, 0, true)
    return [
      { who: 'col', lobe: 'A', segs: a, total: sumLen(a) },
      { who: 'col', lobe: 'B', segs: b, total: sumLen(b) },
    ]
  }
  if (s > 0) {
    const h = hullRing(G, s, (mu ?? G.muN) * s)
    return [{ who: 'hull', ...h }]
  }
  const parts = []
  for (const [L, H, who] of [[G.LAr, G.HA, 'A'], [G.LB, G.HB, 'B']]) {
    const k = (L.R + s) / L.R
    if (k <= 1e-4) continue
    const S = scaled(L, H, k)
    const segs0 = lobeRing(S, S.R * tipRound(((mu ?? G.mu) * -s) / S.R))
    const segs = who === 'A' ? mirrorX(segs0) : segs0
    parts.push({ who, segs, total: sumLen(segs), R: S.R, k, lobeR: L.R })
  }
  return parts
}
const sumLen = (segs) => lengths(segs).reduce((a, b) => a + b, 0)

/* ======================================================================
   The crossing's edges: the col's own contour as a band of half-width h
   ====================================================================== */

/**
 * The 8 as a band of half-width h (construction units), as closed arc loops: its outer edge, then each lobe's counter
 * (its inner edge). Each edge is the 8's own arcs offset by ±h about their own centres, which stay tangent where they
 * meet. Near C the edges meet in corners (circle–circle intersections): the outer edge above and below C, each counter
 * at its tip. With rp > 0 the point's disc (radius rp, centre C) is joined to the band, and its circle replaces those
 * corners.
 */
function crossingEdges(G, h, rp = 0) {
  const O = [0, 0]
  const side = (wantX, wantY) => (p) => (Math.sign(p[0]) === wantX && Math.sign(p[1]) === wantY ? -1 : 1)
  const off = (L, k) => {
    const u = unit(sub(L.Tu, L.Pu))
    const Tu = add(L.Pu, mul(u, L.Q + k))
    return { Tu, Tl: flipY(Tu), far: [L.A[0] + L.R + k, 0], Q: L.Q + k, R: L.R + k }
  }
  // A lobe's counter, built on +x.
  const counter = (L) => {
    const o = off(L, -h)
    let start
    let close
    if (rp > 0) {
      start = meet(L.Pu, o.Q, O, rp, side(1, -1))
      close = (q) => [arc(L.Pl, o.Q, o.Tl, q), arc(O, rp, q, start, [rp, 0])]
    } else {
      start = [L.Pu[0] - Math.sqrt(o.Q * o.Q - L.Pu[1] * L.Pu[1]), 0]
      close = () => [arc(L.Pl, o.Q, o.Tl, start)]
    }
    const end = rp > 0 ? flipY(start) : start
    return [{ M: start }, arc(L.Pu, o.Q, start, o.Tu), arc(L.A, o.R, o.Tu, o.Tl, o.far), ...close(end), { Z: true }]
  }
  // The outer edge, round both lobes.
  const LA = G.LAr
  const LB = G.LB
  const a = off(LA, h)
  const b = off(LB, h)
  const PuA = flipX(LA.Pu)
  const PlA = flipX(LA.Pl)
  let outer
  if (rp > 0) {
    const bt = meet(LB.Pu, b.Q, O, rp, side(1, -1))
    const at = meet(PuA, a.Q, O, rp, side(-1, -1))
    const bb = flipY(bt)
    const ab = flipY(at)
    outer = [
      { M: bt }, arc(LB.Pu, b.Q, bt, b.Tu), arc(LB.A, b.R, b.Tu, b.Tl, b.far), arc(LB.Pl, b.Q, b.Tl, bb),
      arc(O, rp, bb, ab, [0, rp]),
      arc(PlA, a.Q, ab, flipX(a.Tl)), arc(flipX(LA.A), a.R, flipX(a.Tl), flipX(a.Tu), flipX(a.far)), arc(PuA, a.Q, flipX(a.Tu), at),
      arc(O, rp, at, bt, [0, -rp]), { Z: true },
    ]
  } else {
    const kt = meet(PuA, a.Q, LB.Pu, b.Q, (p) => p[1])
    const kb = flipY(kt)
    outer = [
      { M: kt }, arc(LB.Pu, b.Q, kt, b.Tu), arc(LB.A, b.R, b.Tu, b.Tl, b.far), arc(LB.Pl, b.Q, b.Tl, kb),
      arc(PlA, a.Q, kb, flipX(a.Tl)), arc(flipX(LA.A), a.R, flipX(a.Tl), flipX(a.Tu), flipX(a.far)), arc(PuA, a.Q, flipX(a.Tu), kt), { Z: true },
    ]
  }
  return [outer, mirrorX(counter(LA)), counter(LB)]
}

/**
 * A closed loop of arcs offset by k (outward > 0) along its normals: each arc keeps its centre and changes its radius by
 * ±k, + where the loop's inside is on the centre's side (a convex arc), − where it isn't (a concave one, like a notch).
 */
function offsetLoop(segs, k) {
  const poly = [segs[0].M, ...sample(segs, 0.2)]
  const inside = (p) => {
    let c = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]
      const b = poly[j]
      if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c
    }
    return c
  }
  const out = []
  let at = segs[0].M
  let first = null
  for (const g of segs) {
    if (g.M) {
      at = g.M
      continue
    }
    if (g.Z) break
    const sw = sweepOf(g.c, at, g.A, g.dir)
    const mid = polar(g.c, g.r, angle(g.c, at) + sw / 2)
    const convex = inside(add(mid, mul(unit(sub(g.c, mid)), Math.min(0.05, g.r * 0.01))))
    const r = g.r + (convex ? k : -k)
    const p0 = add(g.c, mul(unit(sub(at, g.c)), r))
    const p1 = add(g.c, mul(unit(sub(g.A, g.c)), r))
    if (!first) {
      first = p0
      out.push({ M: p0 })
    }
    out.push({ A: p1, c: g.c, r, dir: g.dir })
    at = g.A
  }
  out.push({ Z: true })
  return out
}

/** The construction point that a placement maps to the tile point q. */
function inverse(map, q) {
  const o = map([0, 0])
  const e = sub(map([1, 0]), o)
  const z2 = e[0] * e[0] + e[1] * e[1]
  const v = sub(q, o)
  return [(v[0] * e[0] + v[1] * e[1]) / z2, (-v[0] * e[1] + v[1] * e[0]) / z2]
}

/* ======================================================================
   Placing a drawing in the tile
   ====================================================================== */

/**
 * The rule: turn the outline to the ridge, scale its longer side to `span`, put its box's centre on the tile's centre,
 * then move it two-thirds of the way from there to where its area's centroid would sit on the centre (the eye centres a
 * mass between its box and its centroid). If its farthest point is then more than `rmax` from the centre, shrink it.
 */
function fitTo(segs, { span, rmax = 50, optical = 2 / 3 }) {
  const pts = sample(segs, 0.25)
  const turn = placement(RIDGE, [0, 0])
  const q = pts.map(turn)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of q) {
    x0 = Math.min(x0, p[0])
    x1 = Math.max(x1, p[0])
    y0 = Math.min(y0, p[1])
    y1 = Math.max(y1, p[1])
  }
  // Area centroid of the closed outline (shoelace).
  let A = 0, cx = 0, cy = 0
  for (let i = 0; i < q.length; i++) {
    const a = q[i]
    const b = q[(i + 1) % q.length]
    const cr = a[0] * b[1] - b[0] * a[1]
    A += cr
    cx += (a[0] + b[0]) * cr
    cy += (a[1] + b[1]) * cr
  }
  cx /= 3 * A
  cy /= 3 * A
  let z = span / Math.max(x1 - x0, y1 - y0)
  const bc = [(x0 + x1) / 2, (y0 + y1) / 2]
  const off = [(bc[0] - cx) * optical, (bc[1] - cy) * optical]
  for (let it = 0; it < 4; it++) {
    const o = [50 - z * bc[0] + z * off[0], 50 - z * bc[1] + z * off[1]]
    let far = 0
    for (const p of q) far = Math.max(far, Math.hypot(o[0] + z * p[0] - 50, o[1] + z * p[1] - 50))
    if (far <= rmax + 1e-6) {
      const map = placement(RIDGE, o, z)
      return { map, z, far, centroid: [o[0] + z * cx, o[1] + z * cy], box: [o[0] + z * x0, o[1] + z * y0, o[0] + z * x1, o[1] + z * y1] }
    }
    z *= rmax / far
  }
  const o = [50 - z * bc[0] + z * off[0], 50 - z * bc[1] + z * off[1]]
  return { map: placement(RIDGE, o, z), z, far: rmax, centroid: [o[0] + z * cx, o[1] + z * cy], box: [o[0] + z * x0, o[1] + z * y0, o[0] + z * x1, o[1] + z * y1] }
}

/* ======================================================================
   Colours. The tile is paper and the drawing ink: black lines on white, on every page.
   ====================================================================== */

export const INK = '#15191e'
export const PAPER = '#fcfdfd'

/* ======================================================================
   The line system
   ====================================================================== */

/*
  As on a survey sheet: the contours are fine, and one of them, the index contour, is drawn at twice their weight. Here
  the index is the col's own contour, the figure-eight, so the crossing is the heaviest line; the point sits on it at
  2½ times the index's width. Weights are set in device px and never fall under 1.
*/
export const LINES = {
  /** A contour's width in device px at N device px. */
  w: (N) => Math.max(1, 1.2 * (N / 256) ** 0.6),
  index: 2,
  dot: 3.25,
  law: 'max(1, 1.2 (N / 256)^0.6) device px',
}

/* ======================================================================
   The drawing: the only motion
   ====================================================================== */

/*
  The mark is drawn once, the way a surveyor inks a sheet. The index contour comes first: the col's own figure-eight,
  one stroke that leaves the pass, rounds the summit, crosses the pass and rounds the knoll back to it. As the pen
  crosses the pass, the summit's contours follow it, each from its tip (the point nearest the pass) in the sense the
  summit was drawn, then the knoll's; the two contours below the col leave the pass above it and wrap both hills; the
  point is set on the crossing last. A pen runs at speed and lands long; a line once drawn never moves again.
*/
/** A cubic-bezier ease that remembers its numbers, so a file can write it as CSS. */
const bezier = (...a) => Object.assign(cubicBezier(...a), { args: a })
const PEN = bezier(0.4, 0, 0.16, 1) // a contour: the pen lifts off, runs, and lands long
const PEN8 = bezier(0.36, 0, 0.2, 1) // the index contour: one gesture, an even run through the pass
const LAND = bezier(0.2, 0, 0, 1) // the point set on the crossing
const SNAP = 0.3 // a stroke ends once its pen has this many device px left to go
/** Seconds. A stroke lasts base + per × its length in construction units (the summit's −1d ring is about 75). */
const DRAW = { start: 0.08, eight: [0.5, 0.005], ring: [0.3, 0.0042], hull: [0.5, 0.005], ringLag: 0.08, ringLead: 0.06, hullLag: 0.16, hullStep: 0.12, knollLead: 0.3, point: 0.26, pointLead: 0.04 }
const durOf = ([base, per], total) => base + per * total

/** The u in [0, 1] at which ease(u) first reaches f. */
function uAt(ease, f) {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2
    if (ease(m) < f) lo = m
    else hi = m
  }
  return hi
}

/**
 * The score at `size` device px: per stroke its start, duration, ease and the moment it snaps whole (SNAP px left), and
 * the point's start and length. The timing is the same at every size; only the snap depends on it.
 */
function drawScore(v, tier, size) {
  const cache = (v._score ||= {})
  const key = tier + ':' + size
  if (cache[key]) return cache[key]
  const { G, sp, map } = v.geo(tier)
  const px = (map.z * size) / 100 // device px per construction unit
  const strokes = v.strokes(G, sp)
  const out = {}
  const put = (s, t0, law, ease) => {
    const dur = durOf(law, s.total)
    const u = uAt(ease, 1 - SNAP / (s.total * px))
    out[s.id] = { id: s.id, t0, dur, ease, end: t0 + u * dur, px: s.total * px }
  }
  const eight = strokes.find((s) => s.id === 'col')
  const t8 = DRAW.start
  put(eight, t8, DRAW.eight, PEN8)
  const d8 = out.col.dur
  // The moment the pen crosses the pass, the summit drawn.
  const tx = t8 + uAt(PEN8, eight.split) * d8
  const A = strokes.filter((s) => s.who === 'A' && s.n < 0).sort((a, b) => b.n - a.n)
  const B = strokes.filter((s) => s.who === 'B' && s.n < 0).sort((a, b) => b.n - a.n)
  const H = strokes.filter((s) => s.who === 'H').sort((a, b) => a.n - b.n)
  // The summit's contours follow the pen as it crosses the pass; the knoll's as it rounds the knoll. The two below the
  // col follow the pen out of the pass a moment behind it, round the summit in the sense it took.
  A.forEach((s, i) => put(s, tx - DRAW.ringLead + i * DRAW.ringLag, DRAW.ring, PEN))
  B.forEach((s, i) => put(s, t8 + d8 - DRAW.knollLead + i * DRAW.ringLag, DRAW.ring, PEN))
  H.forEach((s, i) => put(s, t8 + DRAW.hullLag + i * DRAW.hullStep, DRAW.hull, PEN8))
  const last = Math.max(...Object.values(out).map((s) => s.end))
  const p0 = last - DRAW.pointLead
  const score = { strokes: out, point: [p0, DRAW.point, p0 + DRAW.point], total: p0 + DRAW.point, tx }
  return (cache[key] = score)
}

/* ======================================================================
   The mark
   ====================================================================== */

const col = {
  id: 'col',
  name: 'Col',
  means: 'Locus is the pass: the one place two heights share, where your company and an agent meet.',
  idea: 'The col’s own contour crosses itself at the pass and the point sits on the crossing. Every other contour is that figure-eight offset or scaled; in the smallest sizes the land is one solid and the crossing is cut through it.',
  // Device px: L from 256; L− (spec M) 160–255; M (spec S) 96–159; S (spec SL) 48–95, the index, the outline and the
  // summit's top; Col-X (spec XS) 26–47; below 26 (spec XXS) the same land with the point alone.
  bounds: { L: 256, M: 160, S: 96, SL: 48, XS: 26 },
  tierName: { L: 'L', M: 'L−', S: 'M', SL: 'S', XS: 'X', XXS: 'X·' },
  tiers: ['XXS', 'XS', 'SL', 'S', 'M', 'L'],
  tierOf(size) {
    const b = this.bounds
    return size >= b.L ? 'L' : size >= b.M ? 'M' : size >= b.S ? 'S' : size >= b.SL ? 'SL' : size >= b.XS ? 'XS' : 'XXS'
  },
  // Per drawing: d is the interval in RA; out the outline's level and top the highest ring (exclusive), both in
  // intervals; lam is where each lobe's rings are scaled about, in R beyond its centre; span and rmax are the fit.
  // Lines (L, L− and M): see LINES. The contours at w, the col's own contour as the index at 2 w, the point 2.5 × that.
  // Col-X: the land at out (in d) with its notches rounded ρ = s (sMu 1); the col's own contour cut through it as
  // ground, clamp(0.9 + 0.035 px, 1.5, 3.2) px wide; below 26 px the point alone, r = 1.3 px at 16.
  spec: {
    L: { d: 1 / 4, out: 2, top: -4, lam: 3 / 8, span: 68, rmax: 37, col: true },
    M: { d: 1 / 4, out: 2, top: -3, lam: 1 / 4, span: 68, rmax: 37, col: true },
    S: { d: 1 / 3, out: 1, top: -3, lam: 1 / 5, span: 70, rmax: 41, col: true },
    SL: { d: 1 / 2, out: 1, top: -2, span: 72, rmax: 43, col: true },
    XS: { d: 1 / 2, out: 1.5, solid: true, sMu: 1, span: 72, rmax: 43, cut: 'loops', cutMax: 3.2 },
    XXS: { d: 1 / 2, out: 1.5, solid: true, sMu: 1, span: 72, rmax: 43, cut: 'point' },
  },
  geo(tier, over) {
    const cache = (this._geo ||= {})
    const key = tier + (over ? JSON.stringify(over) : '')
    if (cache[key]) return cache[key]
    const sp = { ...this.spec[tier], ...over }
    const RA = 16
    const G = saddleGeo({ RA, d: RA * sp.d, ...(sp.c ? { c: sp.c } : {}), ...(sp.psi ? { psi: sp.psi } : {}), ...(sp.lam != null ? { lam: sp.lam } : {}), ...(sp.rb ? { rb: sp.rb } : {}), ...(sp.mu ? { mu: sp.mu } : {}) })
    const sOut = sp.out * G.d
    const outline = contour(G, sOut, sp.solid ? sp.sMu : undefined)[0].segs
    const fit = fitTo(outline, sp)
    return (cache[key] = { G, sOut, sp, ...fit })
  },
  /** A contour's width, the index contour's and the point's diameter, in tile units, at `size` device px. */
  weightOf(sp, tier, size) {
    const w = sp.wUnits ?? (LINES.w(size) * 100) / size
    return { w, wi: LINES.index * w, dot: LINES.dot * LINES.index * w }
  },
  /** The still's lines: [{ who: 'A' | 'B' | 'H', n }], levels in intervals; A and B at 0 are the col's own contour. */
  lines(G, sp) {
    // The summit's rings from its top down, the knoll's, the col's own contour, then the rings below the col.
    const out = []
    const up = (top) => {
      const r = []
      for (let n = -1; n > sp.top && n > top + 1e-9; n--) r.unshift(n)
      return r
    }
    for (const n of up(-G.RA / G.d)) out.push({ who: 'A', n })
    for (const n of up(-G.RB / G.d)) out.push({ who: 'B', n })
    if (sp.col) out.push({ who: 'A', n: 0 }, { who: 'B', n: 0 })
    for (let n = 1; n <= Math.round(sp.out); n++) out.push({ who: 'H', n })
    return out
  },
  /** One line's path(s) at level s (construction units). */
  linePaths(G, who, s) {
    if (who === 'H') return s > 1e-3 ? contour(G, s).filter((p) => p.who === 'hull') : []
    return contour(G, s).filter((p) => (p.lobe || p.who) === who)
  },
  /**
   * The still's strokes, each a stable id, its segments in construction units (written the way its pen draws it: from
   * the point nearest the pass) and its length. The col's own contour is one stroke, 'col', the index: the summit's lobe
   * from C and back, then on through C round the knoll's; `split` is how far along it the pen crosses the pass.
   */
  strokes(G, sp) {
    const cache = (G._strokes ||= new Map())
    if (cache.has(sp)) return cache.get(sp)
    const out = []
    for (const l of this.lines(G, sp)) {
      if (l.n === 0 && l.who === 'B') continue
      if (l.n === 0) {
        const [a, b] = contour(G, 0)
        const segs = [...a.segs, ...b.segs.slice(1)]
        out.push({ id: 'col', who: 'col', n: 0, index: true, segs, total: a.total + b.total, split: a.total / (a.total + b.total) })
        continue
      }
      for (const part of this.linePaths(G, l.who, l.n * G.d)) out.push({ id: `${l.who}:${l.n}`, who: l.who, n: l.n, segs: part.segs, total: part.total ?? sumLen(part.segs) })
    }
    cache.set(sp, out)
    return out
  },
  /** Col-X and X·'s land as one even-odd path in the tile: the hull, then the cut (the 8's two edges) or the point. */
  landD(tier, size, opts = {}) {
    const { G, sOut, sp, map } = this.geo(tier, opts.over)
    let d = toD(contour(G, sOut, sp.sMu)[0].segs, map)
    if (sp.cut === 'point') {
      const r = (opts.pointPx != null ? (opts.pointPx * 100) / size : 130 / 16) / map.z // 1.3 px at 16 device px
      const c = opts.pointAt ? [(opts.pointAt[0] * 100) / size, (opts.pointAt[1] * 100) / size] : null
      const C = c ? inverse(map, c) : [0, 0]
      d += toD(circle(C, r, 0, -1), map)
    } else {
      const cw = (opts.cutPx ?? clamp(0.9 + 0.035 * size, 1.5, sp.cutMax)) * (100 / size)
      for (const loop of crossingEdges(G, cw / 2 / map.z)) d += toD(loop, map)
    }
    return d
  },
  /** The still's strokes for a drawing (the files and the site read these). */
  linesAt(tier, size, t, over) {
    const { G, sp } = this.geo(tier, over)
    return this.strokes(G, sp)
  },
  /** The drawing's score at `size` device px, for the files and the site: per stroke its timing and ease. */
  score(tier, size) {
    return drawScore(this, tier, size)
  },
}

/**
 * The drawing, measured on the page's own clock at `fps`: per stroke its length, start and end, its pen's top speed and
 * its frames under 0.5 px a frame before it snaps whole; and the most strokes drawing at once.
 */
export function motionAudit(v, size, fps = 60) {
  const tier = v.tierOf(size)
  const { sp } = v.geo(tier)
  if (sp.solid || !(tier === 'L' || tier === 'M')) return { size, tier: v.tierName[tier], still: true }
  const score = drawScore(v, tier, size)
  const rows = []
  let maxMoving = 0
  const frames = Math.ceil(score.total * fps) + 2
  const prev = {}
  const moving = new Array(frames).fill(0)
  for (const id in score.strokes) {
    const s = score.strokes[id]
    let top = 0
    let slow = 0
    let last = 0
    let n = 0
    for (let i = 0; i < frames; i++) {
      const t = i / fps
      const f = t < s.t0 ? 0 : t >= s.end ? 1 : s.ease((t - s.t0) / s.dur)
      const step = (f - last) * s.px
      if (step > 1e-6) {
        n++
        moving[i]++
        top = Math.max(top, step)
        if (step < 0.5 && f < 1) slow++
      }
      last = f
    }
    prev[id] = last
    rows.push({ id, px: Math.round(s.px), from: +s.t0.toFixed(2), to: +s.end.toFixed(2), frames: n, top: +top.toFixed(1), slow })
  }
  for (const m of moving) maxMoving = Math.max(maxMoving, m)
  return { size, tier: v.tierName[tier], total: +score.total.toFixed(2), maxMoving, rows }
}

/* ======================================================================
   The set, cards and files
   ====================================================================== */

export const MARK = col
/**
 * The construction sheet at L: guides in tile units and the card's rules, one per line. `inflect` marks where a line's
 * curvature changes sign; the rule is that this happens only at a notch facing C.
 */
export function construction(v = col, tier = 'L') {
  const { G, map, sp, centroid, far } = v.geo(tier)
  const guide = []
  const marks = []
  const P = (p) => map(p).map(R2)
  const z = map.z
  const line = (a, b) => guide.push({ el: 'path', d: `M${P(a).join(' ')}L${P(b).join(' ')}`, dash: true })
  const ring = (c, r, dash = false) => guide.push({ el: 'circle', cx: P(c)[0], cy: P(c)[1], r: R2(r * z), dash })
  const LA = G.LAr
  const LB = G.LB
  const sn = Math.sin(PSI)
  const cs = Math.cos(PSI)
  // The ridge, the crossing's two axes, the lobes' circles, and one branch circle drawn in full for each lobe.
  line([-LA.A[0] - LA.R - 8, 0], [LB.A[0] + LB.R + 8, 0])
  line(mul([cs, sn], -26), mul([cs, sn], 16))
  line(mul([cs, -sn], -26), mul([cs, -sn], 16))
  ring(flipX(LA.A), LA.R)
  ring(LB.A, LB.R)
  ring(flipX(LA.Pu), LA.Q, true)
  ring(LB.Pu, LB.Q, true)
  marks.push({ p: P(flipX(LA.A)), label: 'A' }, { p: P(LB.A), label: 'B' }, { p: P([0, 0]), label: 'C' })
  marks.push({ p: P(G.HA.map((x, i) => (i ? x : -x))), dot: true, label: 'H' }, { p: P(G.HB), dot: true, label: 'H' })
  marks.push({ p: P(flipX(LA.Tu)), dot: true }, { p: P(flipX(LA.Tl)), dot: true }, { p: P(LB.Tu), dot: true }, { p: P(LB.Tl), dot: true })
  // Inflections on the outline: only where a notch's fillet meets a branch.
  const out = contour(G, G.d * sp.out)[0]
  const infl = out.infl
  const legend = [
    ['ridge', '22.5°, a sixteenth of a turn'],
    ['summit', 'circle A, RA = 16, |AC| = 2 RA'],
    ['crossing', 'two axes through C at ±ψ to the ridge, sin ψ = 4/5 (53.1°)'],
    ['branches', 'each the arc tangent to its axis at C and tangent inside to its lobe’s circle: Q = 5/2 R'],
    ['knoll', 'the summit’s lobe scaled by −1/2 through C: RB = RA / 2, |BC| = 2 RB'],
    ['interval', 'd = RA / 4; the summit ends 4 d up, the knoll 2 d'],
    ['above C', 'each lobe scaled by (R + s) / R about H, 3R/8 beyond its centre; its tip rounded with ρ = 3/2 |s| (eased onto R above ρ = 0.55 R, so a tip grows from a circle smoothly)'],
    ['below C', 'the figure-eight offset by s; its notches rounded with ρ = 7/4 s, half the branch beside them'],
    ['line', `the contours fine, ${LINES.law}; the col’s own contour the index, at ${LINES.index}×; the point ${LINES.dot}× the index across`],
    ['fit', `span ${sp.span}, farthest point ${R2(far)} ≤ ${sp.rmax}; centred ⅔ of the way from box to centroid`],
    ['file', 'every arc written at 0.001 units and no wider than 90°, so the browser draws the construction (≤ 0.06 px off at 1024)'],
  ]
  return { guide, marks, legend, inflect: infl.map(P), centroid: centroid.map(R2) }
}

/**
 * CONSTRUCTION.md, from the card's own legend and the spec, so the file, the card and the doc can't disagree. `files` is
 * the export set as [name, where it comes from].
 */
export function constructionMarkdown(v = col, { files = [] } = {}) {
  const { legend } = construction(v)
  const b = v.bounds
  const esc = (t) => t.replace(/\|/g, '\\|')
  const px = (N) => R2(LINES.w(N))
  const sc = drawScore(v, 'L', 512)
  const k = (id) => sc.strokes[id]
  const L = []
  L.push('# Col: the Locus mark', '')
  L.push('A summit, a lower knoll and the col between them, drawn in contour: black lines on white paper, as on a survey sheet. The col’s own contour crosses itself at the pass, and the point sits on the crossing: Locus is the one place two heights share. Every curve is a circle or an arc tangent to one; every file is written from `brand/source/mark.js`.', '')
  L.push('## Geometry', '', '| | |', '| --- | --- |', ...legend.map(([key, t]) => `| ${key} | ${esc(t)} |`), '')
  L.push('## The drawings', '', 'Chosen by device pixels (css px × devicePixelRatio).', '')
  L.push('| Drawing | Device px | What it draws |', '| --- | --- | --- |')
  L.push(`| L | ${b.L} and up | the card as above: d = RA/4; the outline at +2d and +1d below the col, the col’s own contour, the summit’s −1d, −2d and −3d rings, the knoll’s −1d; H at 3R/8 |`)
  L.push(`| L− | ${b.M}–${b.L - 1} | L without the summit’s −3d ring; H at R/4 |`)
  L.push(`| M | ${b.S}–${b.M - 1} | d = RA/3; the outline at +1d, the col’s own contour, the summit’s −1d and −2d, the knoll’s −1d; H at R/5 |`)
  L.push(`| S | ${b.SL}–${b.S - 1} | d = RA/2; the outline at +1d, the col’s own contour and the summit’s top, a circle |`)
  L.push(`| X (Col-X) | ${b.XS}–${b.SL - 1} | one land in ink, the hull at s = ¾ RA with its notches rounded ρ = s, the col’s own contour cut through it in paper; the crossing is the point |`)
  L.push(`| X· | 16–${b.XS - 1} | the same land with the point cut alone, r = 1.3 px at 16 |`, '')
  L.push('Col-X and X· are solid because a line under 48 device px blurs; they are never shown without the tile. The bare glyph starts at 96 px, the relief stamp at 160.', '')
  L.push('## The line system', '')
  L.push('As on a survey sheet: the contours are fine, and one of them, the index contour, is drawn at twice their weight. The index is the col’s own contour, so the figure-eight is the heaviest line and the crossing the heaviest place.', '')
  L.push(`- A contour: w = ${LINES.law} (${px(96)} at 96, ${px(180)} at 180, ${px(256)} at 256, ${px(512)} at 512, ${px(1024)} at 1024). Nothing is drawn under 1 px.`)
  L.push(`- The index: ${LINES.index} w. The point: ${LINES.dot} × the index across (${R2(LINES.dot * LINES.index * LINES.w(512))} px at 512).`)
  L.push('- Col-X: the cut is clamp(0.9 + 0.035 N, 1.5, 3.2) px wide (2.02 at 32, 2.54 at 47).')
  L.push('- In a lockup the mark is the drawing its device pixels get, at its own weights.', '')
  L.push('## Colours', '', `- Ink ${INK} and paper ${PAPER}, nothing else. The tile is paper and the drawing ink, on every page, the favicon included.`)
  L.push(`- On a light page the tile has an ink hairline 1 device px wide inside its edge, the sheet’s neatline (the tile stroked at 200/N units, clipped to itself): stroke-opacity ${HAIR.small} up to 95 px, ${HAIR.large} above. On a dark page it needs none.`)
  L.push('- The reverse, paper on an ink tile, is kept for the rare place that needs a dark mark on a light ground.')
  L.push('- One ink: the tile in one colour with the drawing knocked out of it, so it prints on any paper.', '')
  L.push('## The lockup', '', '- Spline Sans Mono at weight 540, tracking −0.01 em, L–o −0.06 em, u–s −0.01 em; the word is outlined in the files.')
  L.push('- Horizontal: the word at 0.688 M, so its cap height is ½ M, the caps centred on the tile; the L’s stem 0.4 M from the tile.')
  L.push('- Stacked: the word at 0.4 M, its caps 0.25 M under the tile, both centred.')
  L.push('- Clear space: ½ M on every side, not drawn into the files. Smallest: M = 20 px.', '')
  L.push('## Icons', '', 'A tab icon is 16 css px on every screen, and only a bitmap can know the pixel density, so the tab icon is the ICO:', '')
  L.push('```html', '<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">', '<link rel="apple-touch-icon" href="/apple-touch-icon.png">', '<link rel="manifest" href="/site.webmanifest">', '```', '')
  L.push('The manifest lists `icon-192.png` and `icon-512.png` (purpose "any") and `icon-512-maskable.png` (purpose "maskable"). `favicon.svg` (Col-X) is for uses drawn at 26 to 47 device px, not the tab.', '')
  L.push('## Motion', '', `Drawn once, for L and L− (160 device px and up); every smaller drawing, and reduced motion, is the still. No loop. ${R2(sc.total)} s in all.`, '')
  L.push(`- The index contour first, in one stroke: the pen leaves the pass at ${R2(k('col').t0)} s, rounds the summit, crosses the pass at ${R2(sc.tx)} s and rounds the knoll back to it (${R2(k('col').dur)} s, cubic-bezier(${PEN8.args.join(', ')})).`)
  L.push(`- The two contours below the col leave the upper notch ${DRAW.hullLag} s and ${R2(DRAW.hullLag + DRAW.hullStep)} s behind the pen and follow it round the summit, then wrap the knoll (the same curve).`)
  L.push(`- As the pen crosses the pass, the summit’s contours follow, each from its tip, ${DRAW.ringLag} s apart; the knoll’s starts ${DRAW.knollLead} s before the pen closes. Each lasts ${DRAW.ring[0]} s + ${DRAW.ring[1]} s per unit of its length, on cubic-bezier(${PEN.args.join(', ')}).`)
  L.push(`- The point is set on the crossing last: ${DRAW.point} s, scale from 0, cubic-bezier(${LAND.args.join(', ')}).`)
  L.push(`- A stroke is drawn by its dash, its pen a round cap, and snaps whole once it has ${SNAP} device px to go. A line once drawn never moves again. \`tiers.json\` carries the score, and \`motion/locus-mark-512-draw.svg\` plays it as CSS.`, '')
  if (files.length) {
    L.push('## Files', '', 'Every file is written by `brand/source/build.mjs` from `brand/source/mark.js`: `npm run brand`.', '', '| File | Use |', '| --- | --- |')
    for (const [f, from] of files) L.push(`| ${f} | ${esc(from)} |`)
    L.push('')
  }
  return L.join('\n')
}

/* ======================================================================
   The files: every exported SVG is written here, from the same construction
   ====================================================================== */

/**
 * The tile: a squircle, |x|^5 + |y|^5 = 1, on the 100-unit box, as `count` cubic segments: nodes evenly spaced along
 * the edge, each control point on the edge's own tangent a third of the way to the next node (a Hermite fit), so 24
 * segments hold it to well under a hundredth of a unit.
 */
function squircleD(n = 5, count = 24) {
  const pt = (p) => `${R3(p[0])} ${R3(p[1])}`
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

/** The tile's path, written compactly. */
export const TILE = compactPath(squircleD())
const HAIR = { small: 0.22, large: 0.16 } // the ink hairline's opacity on a light page: up to 95 device px, and above

/**
 * The mark's own elements for a file, as SVG markup in the 100-unit box: { defs, body }. kind is 'light' (the paper tile
 * with its ink hairline, for a light page), 'dark' (the paper tile alone, for a dark page), 'square' (a full-bleed paper
 * square, for icons the platform masks), 'reverse' (paper lines on an ink tile), 'oneink' (one fill: the tile in ink with
 * the drawing knocked out of it) or 'bare' (no tile: the drawing in ink; L, L− and M only). id prefixes any id, so two
 * files inlined in one page never share one. `draw` adds the drawing as CSS, played once (L and L− only).
 */
export function markParts(v, { size, tier, kind = 'light', over, pointAt, id = 'locus', lineUnits, draw = false }) {
  tier ||= v.tierOf(size)
  const { G, sp, map } = v.geo(tier, over)
  const ground = kind === 'reverse' ? INK : PAPER
  const fg = kind === 'reverse' ? PAPER : INK
  let defs = ''
  let body = ''
  // The tile.
  if (kind === 'square') body += `<path d="M0 0H100V100H0Z" fill="${PAPER}"/>`
  else if (kind === 'light') {
    defs += `<clipPath id="${id}-clip"><path d="${TILE}"/></clipPath>`
    body += `<path d="${TILE}" fill="${PAPER}" stroke="${INK}" stroke-opacity="${size <= 95 ? HAIR.small : HAIR.large}" stroke-width="${num(200 / size)}" clip-path="url(#${id}-clip)"/>`
  } else if (kind === 'dark' || kind === 'reverse') body += `<path d="${TILE}" fill="${ground}"/>`
  const one = kind === 'oneink' || kind === 'bare'
  if (sp.solid) {
    if (kind === 'bare') throw new Error('The small form is never without its tile')
    const land = v.landD(tier, size, { over, pointAt })
    if (kind === 'oneink') body = `<path d="${TILE}${land}" fill="${INK}" fill-rule="evenodd"/>`
    else body += `<path d="${land}" fill="${fg}" fill-rule="evenodd"/>`
    return { defs, body }
  }
  const wt = v.weightOf(lineUnits ? { ...sp, wUnits: lineUnits } : sp, tier, size)
  const strokes = v.linesAt(tier, size, null, over)
  const C = map([0, 0])
  if (kind !== 'oneink') {
    const score = draw ? v.score(tier, size) : null
    const anim = []
    const path = (s) => {
      const d = toD(s.segs, map)
      const sw = s.index ? ` stroke-width="${num(wt.wi)}"` : ''
      if (!score) return `<path d="${d}"${sw}/>`
      // Drawn by its dash: the path's own length (in tile units) as dash and gap, the offset run from the length to 0.
      const L = num(s.total * map.z + 0.5)
      const k = score.strokes[s.id]
      anim.push(`#${id} .${css(s.id)}{stroke-dasharray:${L} ${L};animation:${id}-d${css(s.id)} ${num(k.dur)}s ${bez(k.ease)} ${num(k.t0)}s both,${id}-on .001s ${num(k.t0)}s both}@keyframes ${id}-d${css(s.id)}{from{stroke-dashoffset:${L}}to{stroke-dashoffset:0}}`)
      return `<path class="${css(s.id)}" d="${d}"${sw}/>`
    }
    const ink = kind === 'bare' ? INK : fg
    body += `<g fill="none" stroke="${ink}" stroke-width="${num(wt.w)}" stroke-linecap="round">${strokes.map(path).join('')}</g>`
    body += `<circle class="pt" cx="${num(C[0])}" cy="${num(C[1])}" r="${num(wt.dot / 2)}" fill="${ink}"/>`
    if (score) {
      const [p0, pd] = score.point
      const style = `#${id} path,#${id} circle{transform-box:fill-box}${anim.join('')}#${id} .pt{transform-origin:center;animation:${id}-pt ${num(pd)}s ${bez(LAND)} ${num(p0)}s both}@keyframes ${id}-pt{from{transform:scale(0)}to{transform:scale(1)}}@keyframes ${id}-on{from{visibility:hidden}to{visibility:visible}}@media (prefers-reduced-motion:reduce){#${id} *{animation:none!important}}`
      defs += `<style>${style}</style>`
    }
    return { defs, body }
  }
  // One ink: each line as the band between its two offset edges; the col's own contour and the point as one region.
  const h = wt.w / 2 / map.z
  let d = TILE
  for (const s of strokes) {
    if (s.index) continue
    d += toD(offsetLoop(s.segs, h), map) + toD(offsetLoop(s.segs, -h), map)
  }
  if (sp.col) for (const loop of crossingEdges(G, wt.wi / 2 / map.z, wt.dot / 2 / map.z)) d += toD(loop, map)
  body = `<path d="${d}" fill="${INK}" fill-rule="evenodd"/>`
  return { defs, body }
}
const css = (id) => (id === 'col' ? 'ix' : id.replace(':-', 'm').replace(':', 'p'))
const bez = (e) => `cubic-bezier(${e.args.join(',')})`

/** A tier's file: the root exactly as the checklist has it, the mark inside, nothing else. */
export function exportSvg(v, { size, tier, kind, over, pointAt, id, draw }) {
  const { defs, body } = markParts(v, { size, tier, kind, over, pointAt, id, draw })
  return `<svg xmlns="http://www.w3.org/2000/svg"${draw ? ` id="${id}"` : ''} viewBox="0 0 100 100" width="${size}" height="${size}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`
}

/**
 * The drawings for the site, in the still state, as data: per drawing its device-px range and its elements in the
 * 100-unit box in drawing order, with geometry, paint, role and colour token. Line widths follow LINES, given as the law
 * and its values at the drawing's own sizes. The drawings that are drawn in (L and L−) carry their score.
 */
export function tiersData(v = col) {
  const b = v.bounds
  const keys = v.tiers
  const lo = { XXS: 16, XS: b.XS, SL: b.SL, S: b.S, M: b.M, L: b.L }
  const hi = { XXS: b.XS - 1, XS: b.SL - 1, SL: b.S - 1, S: b.M - 1, M: b.L - 1, L: null }
  const samples = { XXS: [16, 20, 22, 25], XS: [26, 32, 40, 44, 47], SL: [48, 52, 64, 80, 95], S: [96, 104, 128, 159], M: [160, 180, 192, 255], L: [256, 512, 1024] }
  const r3 = (x) => R3(x)
  const out = { units: 'the 100 × 100 box', colours: { ink: INK, paper: PAPER, tile: 'paper', drawing: 'ink' }, lines: {
    contour: LINES.law, index: `${LINES.index} × the contour (the col’s own contour)`, point: `${LINES.dot} × the index, across`,
  }, hairline: {
    what: 'On a light page only: the tile path stroked in ink at stroke-width 200/N units (N = device px), clipped to the tile, so 1 device px shows inside its edge.',
    opacity: { 'up to 95 device px': HAIR.small, '96 and up': HAIR.large },
  }, tiers: [] }
  for (const key of keys) {
    const { G, sp, map, sOut } = v.geo(key)
    const C = map([0, 0])
    const els = [{ role: 'tile', type: 'path', d: TILE, paint: 'fill', colour: 'paper' }]
    const base = { name: v.tierName[key], key, devicePx: [lo[key], hi[key]] }
    if (sp.solid) {
      els.push({ role: 'land', type: 'path', d: toD(contour(G, sOut, sp.sMu)[0].segs, map), paint: 'fill', colour: 'ink' })
      if (sp.cut === 'point') els.push({ role: 'point', type: 'circle', cx: r3(C[0]), cy: r3(C[1]), r: 8.125, paint: 'fill', colour: 'paper', note: 'the point cut out of the land: r = 1.3 px at 16 device px, held in units' })
      else els.push({ role: 'cut', type: 'path', d: contour(G, 0).map((q) => toD(q.segs, map)).join(''), paint: 'stroke', colour: 'paper', strokeLinecap: 'butt',
        strokeWidth: { law: 'clamp(0.9 + 0.035 N, 1.5, 3.2) device px, i.e. that × 100 / N units', units: Object.fromEntries(samples[key].map((N) => [N, r3((clamp(0.9 + 0.035 * N, 1.5, sp.cutMax) * 100) / N)])) },
        note: 'the col’s own contour, stroked in paper over the land: the same picture as the land with the band knocked out (the exported files draw it that way, as one even-odd path)' })
      out.tiers.push({ ...base, draws: false, elements: els })
      continue
    }
    const wAt = (N) => r3(v.weightOf(sp, key, N).w)
    const strokes = v.strokes(G, sp)
    for (const st of strokes) els.push({ role: 'line', id: st.id, ...(st.index ? { index: true } : {}), type: 'path', d: toD(st.segs, map), paint: 'stroke', colour: 'ink', length: r3(st.total * map.z) })
    els.push({ role: 'point', type: 'circle', cx: r3(C[0]), cy: r3(C[1]), paint: 'fill', colour: 'ink', r: { law: `${LINES.dot / 2} × the index width`, units: Object.fromEntries(samples[key].map((N) => [N, r3((LINES.dot / 2) * LINES.index * wAt(N))])) } })
    const tier = { ...base, draws: key === 'L' || key === 'M', lineWidth: { law: LINES.law, index: LINES.index, units: Object.fromEntries(samples[key].map((N) => [N, wAt(N)])) }, elements: els }
    if (tier.draws) {
      const sc = v.score(key, samples[key][0])
      tier.draw = {
        what: 'Each line drawn by its dash (dasharray = its length; dashoffset from its length to 0), its pen a round cap; hidden until it starts. The point scales from 0 about its centre. Times in seconds from the start; nothing moves after `total`.',
        total: r3(sc.total),
        lines: Object.fromEntries(Object.values(sc.strokes).map((k) => [k.id, { start: r3(k.t0), duration: r3(k.dur), ease: k.ease.args }])),
        point: { start: r3(sc.point[0]), duration: r3(sc.point[1]), ease: LAND.args },
      }
    }
    out.tiers.push(tier)
  }
  return out
}

/** src/studio/site/mark-paths.ts, which the site's Mark.tsx draws from: each drawing from tiersData(), as TypeScript. */
export function siteMarkPaths(tiers) {
  const tile = tiers.tiers[0].elements.find((e) => e.role === 'tile').d
  const drawings = tiers.tiers.map((t, i) => {
    const of = (role) => t.elements.filter((e) => e.role === role)
    const point = of('point')[0]
    const d = {
      name: t.name,
      // Device px from which this drawing is used. The smallest is used below its own range too.
      from: i === 0 ? 0 : t.devicePx[0],
      land: of('land')[0]?.d,
      cut: of('cut')[0]?.d,
      lines: of('line').filter((e) => !e.index).map((e) => e.d),
      // The index contour, the col's own: drawn at twice a contour's width.
      index: of('line').find((e) => e.index)?.d,
      point: point && { cx: point.cx, cy: point.cy, ...(typeof point.r === 'number' ? { r: point.r } : {}), ink: point.colour === 'ink' },
    }
    for (const k of Object.keys(d)) if (d[k] === undefined || (Array.isArray(d[k]) && !d[k].length)) delete d[k]
    return d
  })
  return `// The mark's geometry, written by brand/source/build.mjs from brand/logo/tiers.json. Don't edit by hand: change the
// mark in brand/source/mark.js and run \`npm run brand\`. Units are the 100-unit box.

export type Drawing = {
  name: string
  from: number
  land?: string
  cut?: string
  lines?: string[]
  index?: string
  point?: { cx: number; cy: number; r?: number; ink: boolean }
}

export const TILE = ${JSON.stringify(tile)}

export const DRAWINGS: Drawing[] = ${JSON.stringify(drawings, null, 2)}
`
}
