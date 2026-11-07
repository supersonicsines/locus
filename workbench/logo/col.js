/*
  Col: the Locus mark. A summit, a lower knoll and the col between them, drawn in contour; the col's own contour
  crosses itself at the pass and the point sits on the crossing. This file is its one definition: the construction,
  the drawings per size, the growth, and the files. `construction()` writes the card, and `constructionMarkdown()` the
  geometry section of CONSTRUCTION.md, from the same numbers, so the file, the card and the doc can't disagree.

  The construction (at L; every other drawing states its departures in `spec`)
  - Frame: C, the col, is the origin; the ridge runs along x from the summit (x < 0) to the knoll, laid at 22.5°.
  - The summit: circle A, RA = 16, |AC| = 2 RA. The crossing: two axes through C at ±ψ to the ridge, sin ψ = 4/5. Each of
    the four branches is the arc tangent to its axis at C and tangent inside to its lobe's circle: Q = 5/2 R.
  - The knoll: the summit's lobe scaled by −½ through C, so RB = RA/2 and C is the circles' internal centre of similitude.
  - The interval d = RA/4; the summit ends 4d above the col, the knoll 2d.
  - Above the col: each lobe scaled by (R + s)/R about H, 3R/8 beyond its centre; its tip rounded with ρ = 3/2 |s|,
    eased onto R above ρ = 0.55 R so a tip grows from a circle smoothly. Below the col: the figure-eight offset by s, its
    notches rounded with ρ = 7/4 s.
  - One line weight; the point three line-widths across, the only heavy element.
  - Every arc in a file is a true circular arc of at most 90°, at 0.001 units, so the browser draws the construction.

  The drawings, by device px: L ≥ 256; L− 160–255 (the summit's −3d ring left out, H at R/4); M 96–159 (d = RA/3: the
  outline at +d, the col's contour, the summit's −1d and −2d, the knoll's −1d, H at R/5 so the far walls keep 1.5 px clear at 96, w = 2.0 (px/96)^0.2 px);
  Col-X 26–95 (one land, the hull at s = ¾ RA, ρ = s, the col's contour cut through it as ground, clamp(0.9 + 0.035 px,
  1.5, 3.2) px wide); below 26 the same land with the point alone. Col-X is never without its tile.

  Motion: growth from nothing, once, at 160 device px and up; every smaller drawing is the still, and so is reduced
  motion. The tops appear and the land rises one ring at a time per hill; the knoll's top appears as the summit reaches
  its height; the hills' last rings close as )( and touch at C; the X holds; the rings below the col leave it, the
  outline last; the point grows on the crossing. Then nothing moves. See `scoreOf`.
*/

import { Card, Mount, compose, clamp, lerp, cubicBezier, tierOf, REF, SQUIRCLE } from './logos.js'

const TAU = Math.PI * 2
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

/**
 * Line weights are set in px. Below L a weight holds its px across its band; in L it grows as size^0.8, so a large
 * mark's line is finer in proportion, as a map's is at a larger scale. `size` is in device pixels.
 */
export function units(px, tier, size) {
  return tier === 'L' ? ((px * 100) / 280) * (280 / size) ** 0.2 : (px * 100) / size
}

/* ======================================================================
   Palettes. 'dark' is the ink tile (paper lines), the primary; 'light' the paper tile (ink lines).
   ====================================================================== */

const INK = '#15191e'
const PAPER = '#fcfdfd'
const LINE_PALETTES = {
  // The ink tile, everywhere: on light pages and dark, as the favicon, the app icon and the avatar. On a dark page it is
  // held off the page by a hairline of paper, 1 device px: 24 % up to 95 px, 16 % above.
  dark: { ground: INK, edge: 'rgba(252,253,253,0.16)', edgeS: 'rgba(252,253,253,0.24)', line: PAPER, mark: PAPER, cut: INK },
  // The paper tile: kept only as a drawing surface (the construction sheet); the system doesn't use it.
  light: { ground: PAPER, edge: 'rgba(21,25,30,0.14)', edgeS: 'rgba(21,25,30,0.2)', line: INK, mark: INK, cut: PAPER },
}
LINE_PALETTES.darkEdge = LINE_PALETTES.dark
// The ink tile with no hairline: the 'light' files, and the comparison the export checks make.
LINE_PALETTES.plain = { ground: INK, edge: 'none', edgeS: 'none', line: PAPER, mark: PAPER, cut: INK }
/** One ink: black on white is the tile in black with the drawing knocked out; white on black the reverse. */
export const MONO = {
  black: { ground: '#000000', edge: 'none', edgeS: 'none', line: '#ffffff', mark: '#ffffff', cut: '#000000' },
  white: { ground: '#ffffff', edge: 'none', edgeS: 'none', line: '#000000', mark: '#000000', cut: '#ffffff' },
  bare: { ground: 'none', edge: 'none', edgeS: 'none', line: INK, mark: INK, cut: 'none' },
  bareDark: { ground: 'none', edge: 'none', edgeS: 'none', line: PAPER, mark: PAPER, cut: 'none' },
}

/* ======================================================================
   The mark
   ====================================================================== */

/* ======================================================================
   The growth: the only motion
   ====================================================================== */

const STEP = cubicBezier(0.33, 1, 0.68, 1) // a ring leaves the one inside it and settles into its place
const LAND = cubicBezier(0.2, 0, 0, 1) // the point set on the crossing
const TIP = cubicBezier(0.5, 1, 0.89, 1) // a tip growing out of a circle: ease-out quad, so its tail is short
// A step lasts T = 0.65 (0.22 + 0.14 · clamp((px − 96) / 416)) s (0.234 s at 512 and up).
const PACE = 0.65
const HOLD = 0.36 // the X holds, nothing moving, before the rings below the col leave it: the only rest
const POINT = 0.2 // the point grows on LAND, snapping like every line
const SNAP = 0.3 // a clock ends once its line's fastest point has this many device px left to go

/* ---------- a lobe ring with its own tip ---------- */

/** The scaled lobe at body level s (construction units), in its own +x frame: S, and the rule's tip rounding. */
function lobeBody(G, who, s) {
  const L = who === 'A' ? G.LAr : G.LB
  const H = who === 'A' ? G.HA : G.HB
  const k = (L.R + s) / L.R
  const S = scaled(L, H, Math.max(k, 1e-6))
  return { L, S, rule: S.R * tipRound((G.mu * -s) / S.R) }
}
/** Where the tip's apex stands from C (construction units) for a rounding ρ: the circle's near point at ρ ≥ R. */
function apexOf(S, rho) {
  if (rho >= S.R - 1e-9) return S.A[0] - S.R
  const py = S.Pu[1] - S.C[1]
  return S.Pu[0] - Math.sqrt((S.Q - rho) ** 2 - py * py) - rho
}
/** The largest ρ ≤ R whose apex lies within a of C (the tip clock), by bisection. */
function rhoFor(S, a) {
  if (apexOf(S, S.R) <= a) return S.R
  if (apexOf(S, 0) >= a) return 0
  let lo = 0
  let hi = S.R
  for (let i = 0; i < 48; i++) {
    const m = (lo + hi) / 2
    if (apexOf(S, m) <= a) lo = m
    else hi = m
  }
  return lo
}
/** The lobe ring at body level s with its apex at a from C (a == null: the card's rule), drawn in the tile's frame. */
function lobeAt(G, who, s, a) {
  const { S, rule } = lobeBody(G, who, s)
  const rho = a == null ? rule : rhoFor(S, a)
  const segs0 = lobeRing(S, rho)
  const segs = who === 'A' ? mirrorX(segs0) : segs0
  return { who, segs, total: sumLen(segs), R: S.R, lobeR: (who === 'A' ? G.LAr : G.LB).R }
}
const apexRule = (G, who, s) => {
  const { S, rule } = lobeBody(G, who, s)
  return apexOf(S, rule)
}

/* ---------- the score ---------- */

/** When an eased run over `dur` s, travelling `px` device px, has SNAP px or less left. */
function snapAt(ease, dur, px) {
  if (px <= SNAP) return 0
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2
    if ((1 - ease(m)) * px <= SNAP) hi = m
    else lo = m
  }
  return hi * dur
}

/**
 * The score, from the still's own lines. One ring per hill moves at a time: each leaves the ring inside it and eases out
 * one interval to its own level, then holds pixel-still. The knoll's top appears as the summit reaches its height; both
 * hills' last rings close as )( and touch at C (the X); the X holds; the rings below the col leave it one at a time, the
 * outline last; the point grows last of all.
 *
 * Two clocks. A lobe ring that grows a tip (the summit's −2d → −1d, and both joins) has a body (its scale, k, on STEP
 * over T) and a tip (its apex's distance from C, on TIP). A tip growing out of a circle lasts ⅔ T × (its travel / the
 * near side's), so it leaves at the body's own speed and stays ahead of it. The join's two tips share one clock: TIP from
 * the slot's start, lasting D = ⅔ T × a0 / (n0 − n1) of the knoll's, each apex at a0 (1 − TIP(u)) of its own a0, both
 * snapping in the frame the knoll's has SNAP px left. Every other beat is one clock on STEP, lasting T · √(travel / 1.4 d),
 * where a ring below the col travels as far as its notch.
 *
 * Legato. Each clock ends when its line's fastest point has SNAP px left. A slot of one line overlaps the next one-line
 * slot by a tenth; any other slot leaves as the one before it settles. The only rest is the hold at the X.
 * Returns { beats: [{ who, a, b, t0, dur, ease, end, tip? }], point: [t0, dur], total }, levels in intervals.
 */
function scoreOf(G, sp, size, z) {
  const T = PACE * (0.22 + 0.14 * clamp((size - 96) / 416))
  const d = G.d
  const ppu = (z * size) / 100 // device px per construction unit
  const topA = -G.RA / d
  const topB = -G.RB / d
  const up = (top) => {
    const r = []
    for (let n = -1; n > sp.top && n > top + 1e-9; n--) r.unshift(n)
    return r
  }
  const ringsA = up(topA)
  const ringsB = up(topB)
  const slots = []
  const chain = (rings, top, who) => {
    let from = top
    return rings.map((n) => {
      const bt = { who, a: from, b: n }
      from = n
      return bt
    })
  }
  const A = chain(ringsA, topA, 'A')
  const B = chain(ringsB, topB, 'B')
  const lead = A.length - B.length
  A.forEach((bt, i) => (i < lead ? slots.push([bt]) : slots.push([bt, B[i - lead]])))
  slots.push([
    { who: 'A', a: ringsA.length ? -1 : topA, b: 0, join: true },
    { who: 'B', a: ringsB.length ? -1 : topB, b: 0, join: true },
  ])
  for (let n = 1; n <= Math.round(sp.out); n++) slots.push([{ who: 'H', a: n - 1, b: n }])

  // Each beat's clocks.
  const ref = 1.4 * d
  const growsTip = (bt) => bt.who !== 'H' && (() => {
    const { S, rule } = lobeBody(G, bt.who, bt.b * d)
    return rule < S.R - 1e-9
  })()
  for (const slot of slots) {
    for (const bt of slot) {
      bt.ease = STEP
      const travel = travelOf(G, bt.who, bt.a * d, bt.b * d)
      if (growsTip(bt)) {
        // The body: scale on STEP over T, snapping on its own fastest point (the circle's near side, (1 + λ) of the level).
        bt.dur = T
        bt.px = (1 + G.lam) * Math.abs(bt.b - bt.a) * d * ppu
        const S0 = lobeBody(G, bt.who, bt.a * d).S
        const S1 = lobeBody(G, bt.who, bt.b * d).S
        const a0 = apexRule(G, bt.who, bt.a * d)
        const a1 = apexRule(G, bt.who, bt.b * d)
        bt.tip = { a0, a1, ease: TIP, px: Math.abs(a0 - a1) * ppu, lag: 0, n0: apexOf(S0, S0.R), n1: apexOf(S1, S1.R) }
        bt.tip.dur = ((2 / 3) * T * (a0 - a1)) / Math.max(1e-6, bt.tip.n0 - bt.tip.n1)
      } else {
        const notch = bt.who === 'H' ? notchTravel(G, bt.a * d, bt.b * d) : 0
        const reach = Math.max(travel, notch)
        bt.dur = T * Math.sqrt(Math.max(1, reach / ref))
        bt.px = reach * ppu
      }
    }
    if (slot[0].join) {
      // One clock for both tips: the knoll's (the tip that grows out of a circle), from the slot's start, with no lag.
      const lead = slot.find((bt) => bt.tip && bt.tip.a0 >= bt.tip.n0 - 1e-6) || slot.find((bt) => bt.tip)
      const D = lead.tip.dur
      const u = snapAt(TIP, 1, lead.tip.px) // the fraction of D at which the lead tip has SNAP px left
      for (const bt of slot) if (bt.tip) Object.assign(bt.tip, { dur: D, snapU: u })
    }
  }
  // Times, legato.
  const beats = []
  let t = 0
  let last = 0
  slots.forEach((slot, i) => {
    let settle = 0
    let full = 0
    for (const bt of slot) {
      bt.t0 = t
      bt.end = t + snapAt(bt.ease, bt.dur, bt.px)
      if (bt.tip) {
        bt.tip.t0 = t + bt.tip.lag
        bt.tip.end = bt.tip.t0 + (bt.tip.snapU != null ? bt.tip.snapU * bt.tip.dur : snapAt(bt.tip.ease, bt.tip.dur, bt.tip.px))
      }
      settle = Math.max(settle, bt.end, bt.tip ? bt.tip.end : 0)
      full = Math.max(full, t + bt.dur, bt.tip ? bt.tip.t0 + bt.tip.dur : 0)
      beats.push(bt)
    }
    last = settle
    const next = slots[i + 1]
    if (slot[0].join) t = settle + HOLD
    else if (next && slot.length === 1 && next.length === 1) t = Math.min(settle, t + 0.9 * (full - t))
    else t = settle
  })
  // The point grows on the crossing from three quarters of the outline's step, so it is already visibly growing as the
  // outline settles: no rest between them.
  const lastBeat = beats[beats.length - 1]
  const p0 = lastBeat.t0 + 0.75 * (lastBeat.end - lastBeat.t0)
  const rpx = ((sp.dot ?? 3 * sp.w) / 2) * (sp.law ? (size / 280) ** 0.8 : 1)
  const pEnd = p0 + snapAt(LAND, POINT, rpx)
  return { T, beats, point: [p0, POINT, pEnd], total: Math.max(last, pEnd) }
}

/** How far a line travels in one beat, in construction units: the farthest any point of its end lies from its start. */
const _travel = new WeakMap()
function travelOf(G, who, a, b) {
  const cache = _travel.get(G) || new Map()
  _travel.set(G, cache)
  const key = who + a + ':' + b
  if (cache.has(key)) return cache.get(key)
  const shape = (s) => {
    if (who === 'H' && s < 1e-3) return contour(G, 0).flatMap((p) => sample(p.segs, 0.25))
    const L = who === 'A' ? G.LAr : G.LB
    if (who !== 'H' && L.R + s <= 1e-6) return [who === 'A' ? [-G.HA[0], 0] : G.HB]
    return (who === 'H' ? contour(G, s).filter((p) => p.who === 'hull') : contour(G, s).filter((p) => (p.lobe || p.who) === who)).flatMap((p) => sample(p.segs, 0.25))
  }
  const S = shape(a)
  const E = shape(b)
  let mx = 0
  for (const p of E) {
    let mn = Infinity
    for (const q of S) mn = Math.min(mn, Math.hypot(p[0] - q[0], p[1] - q[1]))
    mx = Math.max(mx, mn)
  }
  cache.set(key, mx)
  return mx
}

/** How far a ring below the col's notch moves between two levels: along the bisector through C, construction units. */
function notchTravel(G, a, b) {
  const at = (s) => (s < 1e-3 ? 0 : Math.abs(hullRing(G, s, G.muN * s).notchTop[1]))
  return Math.abs(at(b) - at(a))
}

/** Each beat at time t (seconds): its level s (construction units) and, with a tip clock, its apex's distance a. */
function beatsAt(G, score, t) {
  return score.beats.map((bt) => {
    if (t < bt.t0) return { ...bt, s: null }
    const e = t >= bt.end ? 1 : bt.ease(clamp((t - bt.t0) / bt.dur))
    const out = { ...bt, s: lerp(bt.a, bt.b, e) * G.d }
    if (bt.tip) {
      const k = t < bt.tip.t0 ? 0 : t >= bt.tip.end ? 1 : bt.tip.ease(clamp((t - bt.tip.t0) / bt.tip.dur))
      out.apex = lerp(bt.tip.a0, bt.tip.a1, k)
      out.moving = t < bt.end || t < bt.tip.end
    } else out.moving = t < bt.end
    return out
  })
}

/* ======================================================================
   The mark
   ====================================================================== */

const col = {
  id: 'col',
  name: 'Col',
  means: 'Locus is the pass: the one place two heights share, where your company and an agent meet.',
  idea: 'The col’s own contour crosses itself at the pass and the point sits on the crossing. Every other contour is that figure-eight offset or scaled; in the smallest sizes the land is one solid and the crossing is cut through it.',
  once: true,
  period: 1,
  introDur: 2.5,
  introNote: 'The tops appear and the land rises: the summit’s rings are born one at a time, each leaving the one inside it and settling into place; the knoll’s top appears as the summit reaches its height; their tips reach for the pass on one clock and close as )( in the same frame, the col’s own contour. The X holds for 0.36 s, the only rest. The rings below the col leave it and wrap both hills, the outline last, and the point grows on the crossing. 2.0 s at 512 px, 1.4 s at 180. Once arrived, every line holds pixel-still.',
  palettes: LINE_PALETTES,
  weights: [],
  // Device px: L from 256; L− (spec M) 160–255; M (spec S) 96–159; Col-X (spec XS) 26–95; below 26 (spec XXS) the
  // same land with the point alone.
  bounds: { L: 256, M: 160, S: 96, XS: 26 },
  tierName: { L: 'L', M: 'L−', S: 'M', XS: 'X', XXS: 'X·' },
  // Per drawing: d is the interval in RA; out the outline's level and top the highest ring (exclusive), both in
  // intervals; lam is where each lobe's rings are scaled about, in R beyond its centre; span and rmax are the fit.
  // Lines: L and L− at 2.5 px at 280 by the size^0.8 law (`law`); M at 2.0 (px/96)^0.2 px (`mlaw`); the point 3 w.
  // Col-X: the land at out (in d) with its notches rounded ρ = s (sMu 1); the col's own contour cut through it as
  // ground, clamp(0.9 + 0.035 px, 1.5, 3.2) px wide; below 26 px the point alone, r = 1.3 px at 16.
  spec: {
    L: { d: 1 / 4, out: 2, top: -4, lam: 3 / 8, span: 68, rmax: 37, w: 2.5, dot: 7.5, col: true, law: true },
    M: { d: 1 / 4, out: 2, top: -3, lam: 1 / 4, span: 68, rmax: 37, w: 2.5, dot: 7.5, col: true, law: true },
    S: { d: 1 / 3, out: 1, top: -3, lam: 1 / 5, span: 70, rmax: 41, w: 2.0, col: true, mlaw: true },
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
  /** Line weight and point diameter, in tile units, for a drawing at `size` device px. */
  weightOf(sp, tier, size) {
    if (sp.wUnits) return { w: sp.wUnits, dot: sp.dotUnits ?? 3 * sp.wUnits }
    if (sp.law) return { w: units(sp.w, 'L', size), dot: units(sp.dot, 'L', size) }
    if (sp.mlaw) {
      const px = sp.w * (size / 96) ** 0.2
      return { w: (px * 100) / size, dot: (3 * px * 100) / size }
    }
    return { w: units(sp.w, tier, size), dot: units(sp.dot, tier, size) }
  },
  /** The still's lines: [{ who: 'A' | 'B' | 'H', n }], levels in intervals; A and B at 0 are the col's own contour. */
  lines(G, sp) {
    // In the growth's order, so the still and the growth's last frame are the same drawing, line for line.
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
  frame({ p = 1, tier, size, opts = {} }) {
    const { G, sOut, sp, map } = this.geo(tier, opts.over)
    const d = G.d
    const C = map([0, 0])
    const pxPerUnit = (map.z * size) / 100
    const kids = []
    const edge = size <= 95 ? '@edgeS' : '@edge'

    // Col-X: one land, the crossing cut through it at the pass, as one compound path (the hull, the 8's outer edge and its
    // two counters, even-odd); X·: the land with the point cut alone. It is always the still.
    if (sp.solid) {
      kids.push({ el: 'path', d: this.landD(tier, size, opts), fill: '@line', 'fill-rule': 'evenodd' })
      return { kids, edge }
    }

    // The stamp (one ink, 160 px and up): the land solid at the outline's level, every contour cut through it as a line
    // of ground 0.35 d wide, the crossing as the counter, no point.
    if (opts.relief && size >= 160) {
      const cuts = []
      for (const ln of this.lines(G, sp)) {
        if (ln.who === 'H' && ln.n === Math.round(sp.out)) continue
        for (const part of this.linePaths(G, ln.who, ln.n * d)) cuts.push({ el: 'path', d: toD(part.segs, map) })
      }
      const defs = [{ el: 'mask', id: 'relief', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 100, height: 100, kids: [
        { el: 'rect', width: 100, height: 100, fill: '#fff' },
        { el: 'g', fill: 'none', stroke: '#000', 'stroke-width': o3(0.35 * d * map.z), kids: cuts },
      ] }]
      kids.push({ el: 'path', d: toD(contour(G, sOut)[0].segs, map), fill: '@line', mask: 'url(#relief)' })
      return { defs, kids, edge }
    }

    const { w, dot } = this.weightOf(sp, tier, size)
    // The growth plays only where the drawing is L or L− (160 device px and up); every smaller drawing is the still.
    const grow = p < 1 && (tier === 'L' || tier === 'M')
    const t = p * this.introDur
    const lines = []
    for (const ln of this.linesAt(tier, size, grow ? t : null, opts.over)) {
      // A ring born at a top, in the growth, is thinner until it is three line-widths across. The still is all one weight.
      const f = grow && ln.R != null ? clamp((ln.R * map.z - 0.25 * w) / (1.25 * w)) : 1
      if (f < 0.002) continue
      lines.push({ el: 'path', d: toD(ln.segs, map), 'data-line': ln.id, ...(f < 1 ? { 'stroke-width': o3(w * f) } : {}) })
    }
    kids.push({ el: 'g', fill: 'none', stroke: '@line', 'stroke-width': o3(w), kids: lines })
    // The point grows on the crossing last, from nothing, at full ink: nothing in the mark ever fades.
    let m = 1
    if (grow) {
      const [p0, pd, pEnd] = scoreOf(G, sp, size, map.z).point
      m = t >= pEnd ? 1 : LAND(clamp((t - p0) / pd))
    }
    if (m > 0.001) kids.push({ el: 'circle', cx: R3(C[0]), cy: R3(C[1]), r: o3((dot / 2) * m), fill: '@mark' })
    return { kids, edge }
  },
  /**
   * The lines at time t of the growth (null: the still), each with a stable id (who:level it ends at), its segments in
   * construction units, and its radius if it is a top's ring.
   */
  linesAt(tier, size, t, over) {
    const { G, sp, map } = this.geo(tier, over)
    const d = G.d
    const out = []
    const score = t == null ? null : scoreOf(G, sp, size, map.z)
    // Once the score is over, the still itself, written the same way, so nothing changes when the intro ends.
    if (score && t >= score.total) t = null
    if (t == null) {
      for (const l of this.lines(G, sp)) for (const part of this.linePaths(G, l.who, l.n * d)) out.push({ id: `${l.who}:${l.n}`, who: l.who, segs: part.segs, R: part.R })
      return out
    }
    for (const b of beatsAt(G, score, t)) {
      if (b.s == null) continue
      const parts = b.apex != null ? [lobeAt(G, b.who, b.s, b.apex)] : this.linePaths(G, b.who, b.s)
      for (const part of parts) out.push({ id: `${b.who}:${b.b}`, who: b.who, segs: part.segs, R: part.R })
    }
    return out
  },
}

/**
 * The rays a line is measured along, in tile units: a top's ring from its H (every 15°, with the far wall straight away
 * from C and the tip straight at it); a ring below the col from the two lobes' centres (away from C) and from C across
 * the ridge (its two notches). Distances grow outward, so a move along a ray is signed: forward is growth.
 */
export function raysFor(v, tier, who) {
  const { G, map } = v.geo(tier)
  const C = map([0, 0])
  const ray = (o, ang, kind) => ({ o, u: [Math.cos(ang), Math.sin(ang)], kind })
  const at = (p) => map(p)
  const dir = (from, to) => Math.atan2(to[1] - from[1], to[0] - from[0])
  if (who === 'A' || who === 'B') {
    const H = who === 'A' ? at([-G.HA[0], 0]) : at(G.HB)
    const away = dir(C, H)
    const out = [ray(H, away, 'far'), ray(H, away + Math.PI, 'tip')]
    for (let k = 1; k < 24; k++) if (k !== 12) out.push(ray(H, away + (k * Math.PI) / 12, 'side'))
    return out
  }
  const out = []
  for (const cen of [at(flipX(G.LAr.A)), at(G.LB.A)]) {
    const away = dir(C, cen)
    out.push(ray(cen, away, 'far'))
    for (const k of [-4, -3, -2, -1, 1, 2, 3, 4]) out.push(ray(cen, away + (k * Math.PI) / 9, 'side'))
  }
  const ridge = dir(at(flipX(G.LAr.A)), at(G.LB.A))
  out.push(ray(C, ridge + Math.PI / 2, 'neck'), ray(C, ridge - Math.PI / 2, 'neck'))
  return out
}

/** Where a polyline (tile units) crosses a ray, as the farthest distance along it (null if it doesn't). */
export function alongRay(pts, r) {
  let best = null
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const ax = a[0] - r.o[0], ay = a[1] - r.o[1], bx = b[0] - r.o[0], by = b[1] - r.o[1]
    const ca = -ax * r.u[1] + ay * r.u[0]
    const cb = -bx * r.u[1] + by * r.u[0]
    if ((ca > 0 && cb > 0) || (ca < 0 && cb < 0) || ca === cb) continue
    const f = ca / (ca - cb)
    const along = (ax + f * (bx - ax)) * r.u[0] + (ay + f * (by - ay)) * r.u[1]
    if (along > 0 && (best == null || along > best)) best = along
  }
  return best
}

/**
 * The signed audit, from frames of drawn lines: frames is [{ t, lines: { id: polyline in tile units } }]. For each line:
 * the frames it moves, its backward moves (> 0.05 px against its growth), its fastest point and far wall per frame,
 * the most consecutive frames each spends under 0.5 px, its last move (the snap) over the one before, the frames until
 * it clears its start by a line-width, and (tops' rings) its tip's peak speed. Distances in device px.
 */
export function signedAudit(v, tier, size, frames, w) {
  const k = size / 100
  const ids = [...new Set(frames.flatMap((f) => Object.keys(f.lines)))]
  // The ring each line leaves: the one inside it, or for the first ring below the col, the col's own contour.
  const parentsOf = (id) => {
    const [who, n] = id.split(':')
    const lvl = +n
    if (who === 'H') return lvl === 1 ? ['A:0', 'B:0'] : [`H:${lvl - 1}`]
    return ids.includes(`${who}:${lvl - 1}`) ? [`${who}:${lvl - 1}`] : []
  }
  const rows = []
  for (const id of ids) {
    const who = id.split(':')[0]
    const rays = raysFor(v, tier, who)
    const parents = parentsOf(id)
    const series = []
    const idle = []
    for (let i = 1; i < frames.length; i++) {
      const A = frames[i - 1].lines[id]
      const B = frames[i].lines[id]
      if (!A || !B) continue
      const moves = rays.map((r) => {
        const a = alongRay(A, r)
        const b = alongRay(B, r)
        return a == null || b == null ? null : { kind: r.kind, d: (b - a) * k }
      }).filter(Boolean)
      if (!moves.some((m) => Math.abs(m.d) > 0.01)) {
        if (series.length) idle.push(i)
        continue
      }
      // How near any part of the line is to its parent, along the same rays, in this frame.
      let near = Infinity
      for (const pid of parents) {
        const P = frames[i].lines[pid]
        if (!P) continue
        for (const r of rays) {
          const a = alongRay(B, r)
          const b = alongRay(P, r)
          if (a != null && b != null) near = Math.min(near, Math.abs(a - b) * k)
        }
      }
      series.push({ i, near, fast: Math.max(...moves.map((m) => m.d)), back: Math.min(...moves.map((m) => m.d)), far: Math.min(...moves.filter((m) => m.kind === 'far').map((m) => m.d)), tip: Math.max(0, ...moves.filter((m) => m.kind === 'tip').map((m) => m.d)) })
    }
    if (!series.length) continue
    // A stall: a frame with no motion between two frames of motion.
    const lastMove = series[series.length - 1].i
    const stalls = idle.filter((i) => i < lastMove).length
    const run = (f) => {
      let best = 0
      let cur = 0
      for (const x of series) {
        cur = f(x) ? cur + 1 : 0
        best = Math.max(best, cur)
      }
      return best
    }
    let travelled = 0
    let clear = null
    series.forEach((x, j) => {
      travelled += Math.max(0, x.fast)
      if (clear == null && travelled >= w * k) clear = j + 1
    })
    const last = series[series.length - 1]
    const prev = series[series.length - 2]
    rows.push({
      id,
      frames: series.length,
      backward: series.filter((x) => x.back < -0.05).length,
      worstBack: +Math.min(0, ...series.map((x) => x.back)).toFixed(2),
      fastest: +Math.max(...series.map((x) => x.fast)).toFixed(2),
      tipPeak: +Math.max(...series.map((x) => x.tip)).toFixed(2),
      runUnderHalf: run((x) => x.fast > 0.01 && x.fast < 0.5),
      farRunUnderHalf: run((x) => Number.isFinite(x.far) && x.far > 0.01 && x.far < 0.5),
      stalls: stalls,
      snap: +last.fast.toFixed(2),
      beforeSnap: prev ? +prev.fast.toFixed(2) : 0,
      framesToClear: clear,
      // After its first 3 frames, how often its leading point speeds up more than 1.5× from one frame to the next (its
      // last, snapping frame aside): a restart.
      speedUps: series.filter((x, j) => j >= 3 && j < series.length - 1 && series[j - 1].fast > 0.05 && x.fast > 1.5 * series[j - 1].fast).length,
      // The frames it spends within a line-width of its parent, anywhere along it.
      onParent: parents.length ? series.filter((x) => x.near < w * k).length : 0,
      // The last frame its tip moves (a lobe ring): for the join, the frame its apex reaches C.
      tipEnd: series.filter((x) => x.tip > 0.01).map((x) => x.i).pop() ?? null,
    })
  }
  return rows
}

/** The signed audit of the growth on the construction's own curves, stepped on the page's clock at 60 fps. */
export function motionAudit(v, size, fps = 60) {
  const tier = tierOf(v, size)
  const { G, sp, map } = v.geo(tier)
  if (sp.solid || !(tier === 'L' || tier === 'M')) return { size, tier: v.tierName[tier], still: true }
  const score = scoreOf(G, sp, size, map.z)
  const frames = []
  for (let t = 0; t <= score.total + 2 / fps; t += 1 / fps) {
    const lines = {}
    for (const ln of v.linesAt(tier, size, t)) lines[ln.id] = [ln.segs[0].M, ...sample(ln.segs, 0.3)].map(map)
    frames.push({ t, lines })
  }
  const { w } = v.weightOf(sp, tier, size)
  const rows = signedAudit(v, tier, size, frames, w)
  let maxMoving = 0
  for (let i = 1; i < frames.length; i++) {
    let n = 0
    for (const id in frames[i].lines) {
      const a = frames[i - 1].lines[id]
      const b = frames[i].lines[id]
      if (a && b && (a.length !== b.length || a.some((p, j) => Math.abs(p[0] - b[j][0]) + Math.abs(p[1] - b[j][1]) > 1e-6))) n++
    }
    maxMoving = Math.max(maxMoving, n)
  }
  return { size, tier: v.tierName[tier], T: +score.T.toFixed(3), total: +score.total.toFixed(2), maxMoving, rows }
}

/* ======================================================================
   The set, cards and files
   ====================================================================== */

export const MARK = col
export const ALL = [col]

export function paletteFor(v, mode) {
  return v.palettes[mode] || MONO[mode]
}

/** A card whose mounts each carry their own options, and whose drawing is chosen by device pixels. */
export class StudioCard extends Card {
  /** size: CSS px; dpr: device pixels per CSS px for this mount (default the screen's). */
  add(svg, size, mode = 'dark', mopts = {}) {
    const dpr = mopts.dpr ?? (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)
    const px = Math.round(size * dpr)
    const pal = paletteFor(this.v, mode)
    const m = new Mount(svg, pal, 'Locus')
    this.mounts.push({ m, tier: tierOf(this.v, px), size: px, mopts: { ...mopts, pal, mono: !!MONO[mode] } })
    return m
  }
  /** The growth is the only motion: advance the intro, and nothing else ever moves. */
  step(dt, now) {
    if (this.introAt == null) return false
    this.p = clamp((now - this.introAt) / 1000 / this.v.introDur)
    if (this.p >= 1) this.introAt = null
    if (this.visible) this.render()
    return this.introAt != null
  }
  render() {
    const cache = {}
    const st = { t: 0, amp: 0, p: this.p, live: null, fade: 0 }
    for (const { m, tier, size, mopts } of this.mounts) {
      const key = size + '|' + (mopts.shape || '') + (mopts.band ? 'b' : '')
      m.draw((cache[key] ||= compose(this.v, { ...st, tier, size, opts: { ...this.opts, ...mopts } })))
    }
  }
}

/** The still as a file: `size` is in device pixels and picks the drawing. */
export function colSvg(v, mode = 'dark', size = 1024, shape, extra = {}) {
  // The small form is never without its tile: below 96 device px a bare (one-ink, no tile) glyph is drawn on the tile,
  // the land knocked out of it. Its nearest neighbour bare is an ∞ in a pebble; the tile is part of the small form.
  if (shape === 'none' && size < 96 && !extra.tier) {
    shape = undefined
    mode = mode === 'bareDark' ? 'white' : 'black'
  }
  const pal = paletteFor(v, mode)
  const opts = { shape, pal, mono: !!MONO[mode], ...extra }
  const tier = extra.tier || tierOf(v, size)
  const kids = compose(v, { tier, size, opts })
  const uid = v.id
  const val = (key, x) => {
    if (key === 'id') return `${uid}-${x}`
    if (typeof x === 'number') return String(Math.round(x * 1000) / 1000)
    if (typeof x !== 'string') return String(x)
    if (x[0] === '@') return pal[x.slice(1)] ?? (x === '@edgeS' ? pal.edge : x)
    if (key === 'href' && x[0] === '#') return `#${uid}-${x.slice(1)}`
    if (x.includes('url(#')) return x.replace(/url\(#/g, `url(#${uid}-`)
    return x
  }
  const ser = (n) => {
    if (n.opacity === 0 || n.opacity === '0') return ''
    if (n.el === 'g' && !n.kids?.length) return ''
    let a = ''
    for (const key in n) {
      if (key === 'el' || key === 'kids' || n[key] === undefined || (key === 'opacity' && Number(n[key]) === 1)) continue
      const x = val(key, n[key])
      if (n.el === 'use' && key === 'stroke' && x === 'none') return ''
      a += ` ${key}="${String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`
    }
    const inner = (n.kids || []).map(ser).join('')
    return inner ? `<${n.el}${a}>${inner}</${n.el}>` : `<${n.el}${a}/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${kids.map(ser).join('')}</svg>`
}

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
    ['line', `one weight, ${sp.w} px at 280 (size^0.8 in L); the point three line-widths across`],
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
  const L = []
  L.push('# Col: the Locus mark', '')
  L.push('A summit, a lower knoll and the col between them, drawn in contour. The col’s own contour crosses itself at the pass, and the point sits on the crossing: Locus is the one place two heights share. Every curve is a circle or an arc tangent to one; every file is written from `workbench/logo/col.js`.', '')
  L.push('## Geometry', '', '| | |', '| --- | --- |', ...legend.map(([k, t]) => `| ${k} | ${esc(t)} |`), '')
  L.push('## The drawings', '', 'Chosen by device pixels (css px × devicePixelRatio).', '')
  L.push('| Drawing | Device px | What it draws |', '| --- | --- | --- |')
  L.push(`| L | ${b.L} and up | the card as above: d = RA/4; the outline at +2d and +1d below the col, the col’s own contour, the summit’s −1d, −2d and −3d rings, the knoll’s −1d; H at 3R/8 |`)
  L.push(`| L− | ${b.M}–${b.L - 1} | L without the summit’s −3d ring; H at R/4 |`)
  L.push(`| M | ${b.S}–${b.M - 1} | d = RA/3; the outline at +1d, the col’s own contour, the summit’s −1d and −2d, the knoll’s −1d; H at R/5 (the far walls 1.6 px clear at 96) |`)
  L.push(`| X (Col-X) | ${b.XS}–${b.S - 1} | one land, the hull at s = ¾ RA with its notches rounded ρ = s, the col’s own contour cut through it as ground; the crossing is the point |`)
  L.push(`| X· | 16–${b.XS - 1} | the same land with the point cut alone, r = 1.3 px at 16 |`, '')
  L.push('Col-X and X· are never shown without the ink tile: bare, their nearest neighbour is an ∞ in a pebble. The bare glyph starts at 96 px, the relief stamp at 160.', '')
  L.push('## The line system', '', '- One line weight per drawing; the point is three line-widths across, the only heavy element.')
  L.push('- L and L−: w = 2.5 (N / 280)^0.8 px at N device px (4.05 at 512, 1.76 at 180, 1.60 at 160).')
  L.push('- M: w = 2.0 (N / 96)^0.2 px (2.00 at 96, 2.12 at 128, 2.21 at 159).')
  L.push('- Col-X: the cut is clamp(0.9 + 0.035 N, 1.5, 3.2) px wide (2.02 at 32, 2.58 at 48, 3.2 from 66).')
  L.push('- In a lockup from 96 px, the mark is the M drawing at w = 0.016 M, a sixth of the L’s stem. Nothing is drawn under 1 px.', '')
  L.push('## Colours', '', `- Ink ${INK} and paper ${PAPER}, nothing else. The tile is ink everywhere, the favicon included.`)
  L.push(`- On a dark page the tile has a paper hairline 1 device px wide inside its edge (the tile stroked at 200/N units, clipped to itself): stroke-opacity ${HAIR.small} up to 95 px, ${HAIR.large} above.`)
  L.push('- One ink: the tile in one colour with the drawing knocked out of it, so it prints on any paper.', '')
  L.push('## The lockup', '', '- Spline Sans Mono at weight 540, tracking −0.01 em, L–o −0.06 em, u–s −0.01 em; the word is outlined in the files.')
  L.push('- Horizontal: the word at 0.688 M, so its cap height is ½ M, the caps centred on the tile; the L’s stem 0.4 M from the tile.')
  L.push('- Stacked: the word at 0.4 M, its caps 0.25 M under the tile, both centred.')
  L.push('- Clear space: ½ M on every side, not drawn into the files. Smallest: M = 20 px.', '')
  L.push('## Icons', '', 'A tab icon is 16 css px on every screen, and only a bitmap can know the pixel density, so the tab icon is the ICO:', '')
  L.push('```html', '<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">', '<link rel="apple-touch-icon" href="/apple-touch-icon.png">', '<link rel="manifest" href="/site.webmanifest">', '```', '')
  L.push('The manifest lists `icon-192.png` and `icon-512.png` (purpose "any") and `icon-512-maskable.png` (purpose "maskable"). `favicon.svg` (Col-X) is for uses drawn at 26 to 95 device px, not the tab.', '')
  L.push('## Motion', '', 'Growth from nothing, once, for L and L− (160 device px and up); every smaller drawing, and reduced motion, is the still. No loop.', '')
  L.push('- The tops appear and the land rises, one ring at a time per hill, each leaving the ring inside it and settling into its place; the knoll’s top appears as the summit reaches its height.')
  L.push('- The hills’ last rings close as )( and touch at C: both tips on one clock, reaching C in the same frame. The X holds. The rings below the col leave it, the outline last, and the point grows on the crossing.')
  L.push('- A step lasts T = 0.65 (0.22 + 0.14 clamp((N − 96) / 416)) s, 0.234 s from 512 px; a ring below the col lasts T √(its notch’s travel / 1.4 d).')
  L.push('- Curves: STEP cubic-bezier(0.33, 1, 0.68, 1) for the rings; TIP cubic-bezier(0.5, 1, 0.89, 1) for a tip, lasting ⅔ T × (its travel / the near side’s) — for the join, D = ⅔ T × 13.5 / 5.5 (1.64 T) from the join’s start, each apex at a0 (1 − TIP(u)); LAND cubic-bezier(0.2, 0, 0, 1) for the point.')
  L.push('- Every clock ends once its line’s fastest point has 0.3 px left (SNAP). One-line steps overlap by a tenth; the only rest is the hold, 0.36 s. The point grows over 0.20 s. About 2.0 s in all at 512 px.', '')
  if (files.length) {
    L.push('## Files', '', 'Every file is written by `qa/rounds/col/export.mjs` from `col.js`.', '', '| File | Comes from |', '| --- | --- |')
    for (const [f, from] of files) L.push(`| ${f} | ${esc(from)} |`)
    L.push('')
  }
  return L.join('\n')
}

/* ======================================================================
   The files: every exported SVG is written here, from the same construction
   ====================================================================== */

const TILE = compactPath(SQUIRCLE) // the studio's 24-segment squircle, written compactly
const HAIR = { small: 0.24, large: 0.16 } // the paper hairline's opacity on a dark page: up to 95 device px, and above

/**
 * The mark's own elements for a file, as SVG markup in the 100-unit box: { defs, body }. kind is 'light' (the ink tile),
 * 'dark' (the ink tile with its hairline), 'square' (a full-bleed ink square, for icons the platform masks), 'oneink'
 * (one fill: the tile with the drawing knocked out of it) or 'bare' (no tile: the drawing in ink; L, L− and M only).
 * id prefixes any id, so two files inlined in one page never share one.
 */
export function markParts(v, { size, tier, kind = 'light', over, pointAt, id = 'locus', lineUnits }) {
  tier ||= tierOf(v, size)
  const { G, sp, map } = v.geo(tier, over)
  const d0 = G.d
  const n = (x) => String(R3(x))
  const P = (q) => `${n(q[0])} ${n(q[1])}`
  let defs = ''
  let body = ''
  // The tile.
  if (kind === 'square') body += `<path d="M0 0H100V100H0Z" fill="${INK}"/>`
  else if (kind === 'light' || kind === 'dark') {
    if (kind === 'dark') {
      defs += `<clipPath id="${id}-clip"><path d="${TILE}"/></clipPath>`
      body += `<path d="${TILE}" fill="${INK}" stroke="${PAPER}" stroke-opacity="${size <= 95 ? HAIR.small : HAIR.large}" stroke-width="${num(200 / size)}" clip-path="url(#${id}-clip)"/>`
    } else body += `<path d="${TILE}" fill="${INK}"/>`
  }
  const one = kind === 'oneink' || kind === 'bare'
  if (sp.solid) {
    if (kind === 'bare') throw new Error('The small form is never without its tile')
    const land = v.landD(tier, size, { over, pointAt })
    if (one) body = `<path d="${TILE}${land}" fill="${INK}" fill-rule="evenodd"/>`
    else body += `<path d="${land}" fill="${PAPER}" fill-rule="evenodd"/>`
    return { defs, body }
  }
  const wt = v.weightOf(lineUnits ? { ...sp, wUnits: lineUnits, dotUnits: 3 * lineUnits } : sp, tier, size)
  const lines = v.linesAt(tier, size, null, over)
  const C = map([0, 0])
  if (!one) {
    body += `<g fill="none" stroke="${PAPER}" stroke-width="${num(wt.w)}">${lines.map((ln) => `<path d="${toD(ln.segs, map)}"/>`).join('')}</g>`
    body += `<circle cx="${num(C[0])}" cy="${num(C[1])}" r="${num(wt.dot / 2)}" fill="${PAPER}"/>`
    return { defs, body }
  }
  // One ink: each line as the band between its two offset edges; the col's own contour and the point as one region.
  const h = wt.w / 2 / map.z
  let d = kind === 'oneink' ? TILE : ''
  for (const ln of lines) {
    if (/^[AB]:0$/.test(ln.id)) continue
    d += toD(offsetLoop(ln.segs, h), map) + toD(offsetLoop(ln.segs, -h), map)
  }
  if (sp.col) for (const loop of crossingEdges(G, h, wt.dot / 2 / map.z)) d += toD(loop, map)
  void d0
  void P
  body = `<path d="${d}" fill="${INK}" fill-rule="evenodd"/>`
  return { defs, body }
}

/** A tier's file: the root exactly as the checklist has it, the mark inside, nothing else. */
export function exportSvg(v, { size, tier, kind, over, pointAt, id }) {
  const { defs, body } = markParts(v, { size, tier, kind, over, pointAt, id })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`
}

/**
 * The drawings for the site, in the still state, as data: per drawing its device-px range and its elements in the
 * 100-unit box in drawing order, with geometry, paint, role and colour token (ink-tile mode). Widths that follow a size
 * law are given as the law and its values at the drawing's own sizes.
 */
export function tiersData(v = col) {
  const b = v.bounds
  const ranges = { XXS: [16, b.XS - 1], XS: [b.XS, b.S - 1], S: [b.S, b.M - 1], M: [b.M, b.L - 1], L: [b.L, null] }
  const samples = { XXS: [16, 20, 22, 25], XS: [26, 32, 40, 44, 48, 52, 64, 95], S: [96, 104, 128, 159], M: [160, 180, 192, 255], L: [256, 512, 1024] }
  const r3 = (x) => R3(x)
  const out = { units: 'the 100 × 100 box', colours: { ink: INK, paper: PAPER }, hairline: {
    what: 'On a dark page only: the tile path stroked in paper at stroke-width 200/N units (N = device px), clipped to the tile, so 1 device px shows inside its edge.',
    opacity: { 'up to 95 device px': HAIR.small, '96 and up': HAIR.large },
    visibleUnits: Object.fromEntries([16, 20, 22, 26, 32, 40, 44, 52, 64, 95, 96, 128, 159, 160, 255, 256, 512, 1024].map((N) => [N, r3(100 / N)])),
  }, tiers: [] }
  for (const key of ['XXS', 'XS', 'S', 'M', 'L']) {
    const { G, sp, map, sOut } = v.geo(key)
    const C = map([0, 0])
    const els = [{ role: 'tile', type: 'path', d: TILE, paint: 'fill', colour: 'ink' }]
    if (sp.solid) {
      els.push({ role: 'land', type: 'path', d: toD(contour(G, sOut, sp.sMu)[0].segs, map), paint: 'fill', colour: 'paper' })
      if (sp.cut === 'point') els.push({ role: 'point', type: 'circle', cx: r3(C[0]), cy: r3(C[1]), r: 8.125, paint: 'fill', colour: 'ink', note: 'the point cut out of the land: r = 1.3 px at 16 device px, held in units' })
      else els.push({ role: 'cut', type: 'path', d: contour(G, 0).map((p) => toD(p.segs, map)).join(''), paint: 'stroke', colour: 'ink', strokeLinecap: 'butt',
        strokeWidth: { law: 'clamp(0.9 + 0.035 N, 1.5, 3.2) device px, i.e. that × 100 / N units', units: Object.fromEntries(samples[key].map((N) => [N, r3((clamp(0.9 + 0.035 * N, 1.5, sp.cutMax) * 100) / N)])) },
        note: 'the col’s own contour, stroked in ink over the land: the same picture as the land with the band knocked out (the exported files draw it that way, as one even-odd path)' })
    } else {
      const law = sp.law ? '2.5 (N / 280)^0.8 device px' : '2.0 (N / 96)^0.2 device px'
      const wAt = (N) => r3(v.weightOf(sp, key, N).w)
      for (const ln of v.linesAt(key, samples[key][0], null)) els.push({ role: 'line', id: ln.id, type: 'path', d: toD(ln.segs, map), paint: 'stroke', colour: 'paper' })
      els.push({ role: 'point', type: 'circle', cx: r3(C[0]), cy: r3(C[1]), paint: 'fill', colour: 'paper', r: { law: '1.5 × the line width', units: Object.fromEntries(samples[key].map((N) => [N, r3(1.5 * wAt(N))])) } })
      out.tiers.push({ name: v.tierName[key], key, devicePx: ranges[key], grows: key === 'L' || key === 'M', lineWidth: { law, units: Object.fromEntries(samples[key].map((N) => [N, wAt(N)])) }, elements: els })
      continue
    }
    out.tiers.push({ name: v.tierName[key], key, devicePx: ranges[key], grows: false, elements: els })
  }
  return out
}

/** The construction kernel, for the studio and for sketching. */
export const kernel = { saddleGeo, lobeOf, scaled, lobeRing, hullRing, contour, circle, toD, sample, lengths, fitTo, placement, units, RIDGE, PSI, scoreOf, beatsAt, lobeAt, apexOf, rhoFor, lobeBody, crossingEdges, offsetLoop, inverse }

export { REF }
