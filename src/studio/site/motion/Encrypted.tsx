// Encrypted before it leaves. What's on the map is gathered into one bundle in the browser and the wax is pressed on it; the bundle goes
// to the host, which holds only ciphertext; the sea turns blue because the map is live; and `locus verify` shows what the host really holds.

import { $, $$, enter, EASE, EASE_IN_OUT, Island, Plate, Sea, swap, track, typing, useMotion, useNarrow, useSvgId, Wax, WIDE, type Key } from './kit.tsx'

const CYCLE = 10600
const OUT = 9200
const VERIFY = 'locus verify https://meridian.example'

const LAYOUTS = {
  wide: {
    island: { x: 6, y: 22, k: 0.5 },
    caption: { x: 22, y: 34, size: 8.6 },
    names: true,
    host: { x: 262, y: 30, w: 204, h: 150 },
    hostLabel: 8.6,
    tag: true,
    held: [
      '{"site":"meridian","version":3,',
      ' "head":"u7Qe0mZ3kXbV9rPqYt1…",',
      ' "gates":{',
      '  "g7":"Zq1Tn8vLwE3oYcRb2s…",',
      '  "k2":"Hb6yR0pXcM4sJtQe9v…",',
      '  "p9":"3VnLq8TzWk0aDfGh7n…"},',
      ' "passwords":{"a4":"Fj2Ws7…"}}',
    ],
    heldFont: 7.6,
    heldStep: 14,
    bundle: { x: 122, y: 96, k: 1 },
    live: { x: 22, y: 179, w: 150, h: 20, font: 8.6 },
    term: { x: 12, y: 210, w: 456, h: 80 },
    font: 9,
    says: ['  Areas:        6, names sealed', '  Readers:      3, names sealed', '  Plaintext:    none of the data format appears in the ciphertext'],
    sayFont: 8.4,
    sayStep: 13,
  },
  narrow: {
    island: { x: 4, y: 34, k: 0.46 },
    caption: { x: 16, y: 26, size: 13.5 },
    names: false,
    host: { x: 226, y: 10, w: 242, h: 150 },
    hostLabel: 13.5,
    tag: false,
    held: ['{"site":"meridian",', ' "head":"u7Qe0mZ3k…",', ' "gates":{"g7":"Zq1…",', '  "k2":"Hb6yR0…"}}'],
    heldFont: 13.5,
    heldStep: 22,
    bundle: { x: 116, y: 104, k: 1.3 },
    live: { x: 16, y: 176, w: 206, h: 28, font: 13.5 },
    term: { x: 12, y: 214, w: 456, h: 82 },
    font: 13.5,
    says: ['  Plaintext:    none of the data format', '                appears in the ciphertext'],
    sayFont: 13.5,
    sayStep: 20,
  },
}

/** What's on each area, as plain marks: the words aren't the point here, that they go into the bundle is. */
const CONTENT = WIDE.counties.flatMap((c) => c.items.map((it, i) => ({ id: `${c.id}-${i}`, x: it.x, y: it.y - 5, w: 26 + it.label.length * 3.2 })))

/** A point on a cubic Bézier, for a flight that follows the drawn path. */
function bezier(p: number[][], t: number): [number, number] {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return [a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1]]
}

export function EncryptedMotion() {
  const narrow = useNarrow()
  const L = narrow ? LAYOUTS.narrow : LAYOUTS.wide
  const clip = useSvgId('verify')
  const I = L.island
  const B = L.bundle
  const Hst = L.host
  const T = L.term
  const cw = L.font * 0.6
  const X = T.x + (L.font === 9 ? 26 : 30)
  // The command's baseline, and the first result's: tighter on a phone, where the result wraps to two lines.
  const cmdY = T.y + L.font * (L.font === 9 ? 2.4 : 1.85)
  const sayY = cmdY + L.sayFont * (L.font === 9 ? 2 : 1.55)
  const drop = { x: Hst.x + Hst.w / 2, y: Hst.y + Hst.h * 0.62 }
  // The bundle's way to the host arcs above the island, never across it, and the bundle rides it: the line runs through its middle.
  const arc = [
    [B.x, B.y],
    [B.x + 20, 2],
    [drop.x - 50, 2],
    [drop.x, drop.y - 10],
  ]
  // Where the bundle sits, in the island's own units, for what flies into it.
  const into = { x: (B.x - I.x) / I.k, y: (B.y - I.y) / I.k }

  const ref = useMotion<SVGSVGElement>((root) => {
    const parts: (Animation | null)[] = []
    // What's on the map is gathered up into one place.
    $$(root, '[data-content]').forEach((el, i) => {
      const c = CONTENT[i]
      const away = `translate(${(into.x - c.x - c.w / 2).toFixed(1)}px, ${(into.y - c.y).toFixed(1)}px) scale(0.4)`
      const at = 300 + (i % 6) * 45 + Math.floor(i / 6) * 25
      parts.push(
        track(
          el,
          [
            { at: 0, opacity: 1, transform: 'translate(0px, 0px) scale(1)' },
            { at, opacity: 1, transform: 'translate(0px, 0px) scale(1)', ease: 'cubic-bezier(0.5, 0, 0.75, 0.4)' },
            { at: at + 500, opacity: 0, transform: away },
            { at: OUT, opacity: 0, transform: away, ease: 'step-end' },
            { at: OUT + 1, opacity: 0, transform: 'translate(0px, 0px) scale(1)', ease: EASE_IN_OUT },
            { at: OUT + 700, opacity: 1, transform: 'translate(0px, 0px) scale(1)' },
          ],
          CYCLE,
        ),
      )
    })
    // It becomes one bundle, and the wax is pressed onto it.
    const at = (x: number, y: number, k = 1) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${k})`
    const flight: Key[] = []
    for (let i = 0; i <= 8; i++) {
      const t = i / 8
      // Eased along the curve, so it leaves gently and arrives gently.
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      const [x, y] = bezier(arc, e)
      flight.push({ at: 1650 + t * 850, opacity: 1, transform: at(x - B.x, y - B.y), ease: 'linear' })
    }
    parts.push(
      track(
        $(root, '[data-bundle]'),
        [
          { at: 0, opacity: 0, transform: at(0, 0, 0.8) },
          { at: 820, opacity: 0, transform: at(0, 0, 0.8), ease: EASE },
          { at: 1100, opacity: 1, transform: at(0, 0, 1) },
          ...flight,
          { at: 2700, opacity: 0, transform: at(drop.x - B.x, drop.y - B.y, 0.7) },
          { at: CYCLE, opacity: 0, transform: at(0, 0, 0.8) },
        ],
        CYCLE,
      ),
    )
    const land = 1000
    parts.push(
      track(
        $(root, '[data-wax]'),
        [
          { at: 0, opacity: 0, transform: 'scale(1.9) rotate(-16deg)' },
          { at: land, opacity: 0, transform: 'scale(1.9) rotate(-16deg)', ease: 'cubic-bezier(0.55, 0, 0.75, 0.3)' },
          { at: land + 220, opacity: 1, transform: 'scale(0.9) rotate(3deg)', ease: EASE },
          { at: land + 380, opacity: 1, transform: 'scale(1.05) rotate(0deg)', ease: EASE_IN_OUT },
          { at: land + 520, opacity: 1, transform: 'scale(1) rotate(0deg)' },
        ],
        CYCLE,
      ),
    )
    // The line goes once the bundle has reached the host, so it never lingers where the bundle no longer is.
    parts.push(enter($(root, '[data-path]'), CYCLE, 1450, 300, { opacity: 0 }, 2200, { to: { opacity: 1 }, fade: 300 }))
    // The host holds it, and can't read a word of it.
    $$(root, '[data-held]').forEach((el, i) => parts.push(enter(el, CYCLE, 2550 + i * 95, 380, { opacity: 0, transform: 'translate(0px, 3px)' }, OUT)))
    // Live: the sea turns blue, and the address says so.
    parts.push(swap($(root, '[data-live-sea]'), CYCLE, 3400, 700, { opacity: 0 }, { opacity: 1 }, OUT, { backDur: 700 }))
    parts.push(enter($(root, '[data-live]'), CYCLE, 3600, 500, { opacity: 0, transform: 'translate(0px, 4px)' }, OUT))
    // Anyone can check what the host holds.
    const type = { at: 4300, dur: VERIFY.length * 36 }
    parts.push(...typing($(root, '[data-cover]'), $(root, '[data-cursor]'), CYCLE, type.at, type.dur, VERIFY.length, cw, OUT, { blinkUntil: type.at + type.dur + 300 }))
    parts.push(track($(root, '[data-typed]'), [{ at: 0, opacity: 1 }, { at: OUT, opacity: 1, ease: 'ease-in-out' }, { at: OUT + 450, opacity: 0 }, { at: CYCLE - 2, opacity: 0, ease: 'step-end' }, { at: CYCLE, opacity: 1 }], CYCLE))
    $$(root, '[data-says]').forEach((el, i) => parts.push(enter(el, CYCLE, type.at + type.dur + 380 + i * 150, 300, { opacity: 0 }, OUT, { to: { opacity: 1 }, fade: 450 })))
    return parts
  }, { rebuild: narrow ? 'n' : 'w' })

  const bw = 52
  const bh = 33

  return (
    <Plate reff={ref} name="encrypted" label="What's on the map is gathered into one sealed bundle in the browser and sent to the host, which holds only ciphertext. The sea turns blue as the map goes live, and locus verify shows that the host holds no plaintext.">
      <defs>
        {/* A unit inside the terminal's edge, so the line's cover never touches the edge's anti-aliasing. */}
        <clipPath id={clip}>
          <rect x={T.x + 1} y={T.y + 1} width={T.w - 2} height={T.h - 2} rx={9} />
        </clipPath>
      </defs>
      <Sea live />
      <text className="mg-soft" x={L.caption.x} y={L.caption.y} fontSize={L.caption.size} fontWeight={500}>
        In this browser
      </text>
      <g transform={`translate(${I.x} ${I.y}) scale(${I.k})`}>
        <Island look={WIDE} names={L.names} items={false} tools={false} nameSize={17} />
        {CONTENT.map((c) => (
          <g key={c.id} transform={`translate(${c.x} ${c.y})`}>
            <rect className="mg-content o" data-content={c.id} x={0} y={-3.5} width={c.w} height={7} rx={3.5} data-off="" />
          </g>
        ))}
      </g>
      <g data-live="">
        <rect className="mg-card-shadow" x={L.live.x} y={L.live.y + 1.5} width={L.live.w} height={L.live.h} rx={L.live.h / 2} />
        <rect className="mg-card" x={L.live.x} y={L.live.y} width={L.live.w} height={L.live.h} rx={L.live.h / 2} />
        <circle className="mg-live-dot" cx={L.live.x + L.live.h * 0.6} cy={L.live.y + L.live.h / 2} r={L.live.h * 0.17} />
        <text x={L.live.x + L.live.h * 1.05} y={L.live.y + L.live.h / 2 + L.live.font * 0.35} fontSize={L.live.font}>
          <tspan fontWeight={500}>Live</tspan>
          <tspan className="mg-soft"> meridian.example</tspan>
        </text>
      </g>

      <path className="mg-path" data-path="" data-off="" d={`M${arc[0][0]} ${arc[0][1]} C ${arc[1][0]} ${arc[1][1]}, ${arc[2][0]} ${arc[2][1]}, ${arc[3][0]} ${arc[3][1]}`} />

      <rect className="mg-card-shadow" x={Hst.x} y={Hst.y + 2} width={Hst.w} height={Hst.h} rx={10} />
      <rect className="mg-card" x={Hst.x} y={Hst.y} width={Hst.w} height={Hst.h} rx={10} />
      <text className="mg-soft" x={Hst.x + 13} y={Hst.y + L.hostLabel * 2.1} fontSize={L.hostLabel} fontWeight={500}>
        The host holds
      </text>
      {L.tag && (
        <text className="mg-soft" x={Hst.x + Hst.w - 13} y={Hst.y + L.hostLabel * 2.1} fontSize={L.hostLabel} textAnchor="end">
          bundle.json
        </text>
      )}
      <line className="mg-hair" x1={Hst.x} x2={Hst.x + Hst.w} y1={Hst.y + L.hostLabel * 3.1} y2={Hst.y + L.hostLabel * 3.1} />
      {L.held.map((t, i) => (
        <text key={i} data-held={i} className="mg-cipher" x={Hst.x + 11} y={Hst.y + L.hostLabel * 3.1 + L.heldFont * 2 + i * L.heldStep} fontSize={L.heldFont} xmlSpace="preserve">
          {t}
        </text>
      ))}

      <g transform={`translate(${B.x} ${B.y})`}>
        <g data-bundle="" data-off="">
          <g transform={`scale(${B.k})`}>
          <rect className="mg-card-shadow" x={-bw / 2} y={-bh / 2 + 1.5} width={bw} height={bh} rx={5} />
          <rect className="mg-card" x={-bw / 2} y={-bh / 2} width={bw} height={bh} rx={5} />
          <rect className="mg-line" x={-18} y={-8} width={22} height={2.4} rx={1.2} />
          <rect className="mg-line" x={-18} y={-2} width={28} height={2.4} rx={1.2} />
          <rect className="mg-line" x={-18} y={4} width={16} height={2.4} rx={1.2} />
          <g transform="translate(15 6)">
            <g className="mg-wax-drop" data-wax="">
              <Wax size={13} />
            </g>
          </g>
          </g>
        </g>
      </g>

      <rect className="mg-term-shadow" x={T.x} y={T.y + 2} width={T.w} height={T.h} rx={10} />
      <rect className="mg-term" x={T.x} y={T.y} width={T.w} height={T.h} rx={10} />
      <g clipPath={`url(#${clip})`}>
        <text className="mg-term-soft" x={T.x + 14} y={cmdY} fontSize={L.font}>
          $
        </text>
        <g data-typed="">
          <text className="mg-term-text" x={X} y={cmdY} fontSize={L.font}>
            {VERIFY}
          </text>
          {/* At rest it's stepped aside, so a still shows the whole line. */}
          <rect className="mg-term-cover" data-cover="" x={X - 0.5} y={cmdY - L.font * 1.1} width={T.w} height={L.font * 1.55} style={{ transform: `translateX(${(VERIFY.length * cw).toFixed(2)}px)` }} />
          <rect className="mg-term-cursor" data-cursor="" x={X} y={cmdY - L.font * 0.9} width={cw} height={L.font * 1.1} data-off="" />
        </g>
        {L.says.map((t, i) => (
          <text key={i} data-says={i} className="mg-term-text" x={T.x + 14} y={sayY + i * L.sayStep} fontSize={L.sayFont} xmlSpace="preserve">
            {t}
          </text>
        ))}
      </g>
    </Plate>
  )
}

export default EncryptedMotion
