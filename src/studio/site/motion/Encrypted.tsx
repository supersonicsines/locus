// Encrypted before it leaves. The map is sealed in the browser into one bundle; the bundle goes to the host, which holds only ciphertext;
// the sea turns blue because the map is live; and `locus verify` shows anyone what the host really holds.

import { $, $$, enter, EASE, GLIDE, Island, Plate, Sea, swap, track, typing, useMotion, useSvgId, Wax, type Key } from './kit.tsx'

const CYCLE = 10600
const OUT = 9000
const ISLAND = { x: 6, y: 22, k: 0.5 }
const HOST = { x: 262, y: 30, w: 204, h: 150 }
const BUNDLE = { x: 122, y: 108 }
const DROP = { x: HOST.x + HOST.w / 2, y: HOST.y + 82 }
const TERM = { x: 12, y: 210, w: 456, h: 80 }
const FONT = 9
const CW = FONT * 0.6
const X = TERM.x + 26
const VERIFY = 'locus verify https://meridian.example'
const TYPE = { at: 3900, dur: VERIFY.length * 36 }

/** What the host stores: the address name and version in the clear, as SECURITY.md says, and everything else as ciphertext. */
const HELD = [
  '{"site":"meridian","version":3,',
  ' "head":"u7Qe0mZ3kXbV9rPqYt1…",',
  ' "gates":{',
  '  "g7":"Zq1Tn8vLwE3oYcRb2s…",',
  '  "k2":"Hb6yR0pXcM4sJtQe9v…",',
  '  "p9":"3VnLq8TzWk0aDfGh7n…"},',
  ' "passwords":{"a4":"Fj2Ws7…"}}',
]

/** Three lines of what `locus verify` prints, as it prints them. */
const SAYS = ['  Gates:        6, names sealed', '  Passwords:    3, names sealed', '  Plaintext:    none of the data format appears in the ciphertext']

export function EncryptedMotion() {
  const clip = useSvgId('verify')
  const ref = useMotion<SVGSVGElement>((root) => {
    const parts: (Animation | null)[] = []
    // Sealed here, into one bundle.
    const at = (x: number, y: number, k = 1) => `translate(${x}px, ${y}px) scale(${k})`
    const bundle: Key[] = [
      { at: 0, opacity: 0, transform: at(0, 0, 0.6) },
      { at: 450, opacity: 0, transform: at(0, 0, 0.6), ease: EASE },
      { at: 950, opacity: 1, transform: at(0, 0, 1) },
      { at: 1200, opacity: 1, transform: at(0, 0, 1), ease: GLIDE },
      { at: 2050, opacity: 1, transform: at(DROP.x - BUNDLE.x, DROP.y - BUNDLE.y, 1), ease: 'ease-in' },
      { at: 2300, opacity: 0, transform: at(DROP.x - BUNDLE.x, DROP.y - BUNDLE.y, 0.7) },
      { at: CYCLE, opacity: 0, transform: at(0, 0, 0.6) },
    ]
    parts.push(track($(root, '[data-bundle]'), bundle, CYCLE))
    parts.push(enter($(root, '[data-path]'), CYCLE, 1100, 300, { opacity: 0 }, 2200, { to: { opacity: 1 }, fade: 300 }))
    // The host holds it, and can't read a word of it.
    $$(root, '[data-held]').forEach((el, i) => parts.push(enter(el, CYCLE, 2150 + i * 95, 380, { opacity: 0, transform: 'translate(0px, 3px)' }, OUT)))
    // Live: the sea turns blue, and the address says so.
    parts.push(swap($(root, '[data-live-sea]'), CYCLE, 3000, 700, { opacity: 0 }, { opacity: 1 }, OUT, { backDur: 700 }))
    parts.push(enter($(root, '[data-live]'), CYCLE, 3200, 500, { opacity: 0, transform: 'translate(0px, 4px)' }, OUT))
    // Anyone can check what the host holds.
    parts.push(...typing($(root, '[data-cover]'), $(root, '[data-cursor]'), CYCLE, TYPE.at, TYPE.dur, VERIFY.length, CW, OUT, { blinkUntil: TYPE.at + TYPE.dur + 300 }))
    parts.push(track($(root, '[data-typed]'), [{ at: 0, opacity: 1 }, { at: OUT, opacity: 1, ease: 'ease-in-out' }, { at: OUT + 450, opacity: 0 }, { at: CYCLE - 2, opacity: 0, ease: 'step-end' }, { at: CYCLE, opacity: 1 }], CYCLE))
    $$(root, '[data-says]').forEach((el, i) => parts.push(enter(el, CYCLE, TYPE.at + TYPE.dur + 380 + i * 150, 300, { opacity: 0 }, OUT, { to: { opacity: 1 }, fade: 450 })))
    return parts
  })

  return (
    <Plate reff={ref} name="encrypted" label="The map is sealed in the browser into one bundle and sent to the host, which holds only ciphertext. The sea turns blue as the map goes live, and locus verify shows that the host holds no plaintext.">
      <defs>
        <clipPath id={clip}>
          <rect x={TERM.x} y={TERM.y} width={TERM.w} height={TERM.h} rx={10} />
        </clipPath>
      </defs>
      <Sea live />
      <text className="mg-soft" x={22} y={34} fontSize={8.6} fontWeight={500}>
        In this browser
      </text>
      <g transform={`translate(${ISLAND.x} ${ISLAND.y}) scale(${ISLAND.k})`}>
        <Island labels={false} nameSize={19} />
      </g>
      <g data-live="">
        <rect className="mg-card-shadow" x={22} y={180.5} width={150} height={20} rx={10} />
        <rect className="mg-card" x={22} y={179} width={150} height={20} rx={10} />
        <circle className="mg-live-dot" cx={34} cy={189} r={3.4} />
        <text x={43} y={192} fontSize={8.6}>
          <tspan fontWeight={500}>Live</tspan>
          <tspan className="mg-soft"> meridian.example</tspan>
        </text>
      </g>

      <path className="mg-path" data-path="" data-off="" d={`M${BUNDLE.x + 30} ${BUNDLE.y} C ${BUNDLE.x + 90} ${BUNDLE.y - 30}, ${DROP.x - 90} ${DROP.y - 30}, ${DROP.x - 22} ${DROP.y}`} />

      <rect className="mg-card-shadow" x={HOST.x} y={HOST.y + 2} width={HOST.w} height={HOST.h} rx={10} />
      <rect className="mg-card" x={HOST.x} y={HOST.y} width={HOST.w} height={HOST.h} rx={10} />
      <text className="mg-soft" x={HOST.x + 13} y={HOST.y + 19} fontSize={8.6} fontWeight={500}>
        The host holds
      </text>
      <text className="mg-soft" x={HOST.x + HOST.w - 13} y={HOST.y + 19} fontSize={8.6} textAnchor="end">
        bundle.json
      </text>
      <line className="mg-hair" x1={HOST.x} x2={HOST.x + HOST.w} y1={HOST.y + 28} y2={HOST.y + 28} />
      {HELD.map((t, i) => (
        <text key={i} data-held={i} className="mg-cipher" x={HOST.x + 11} y={HOST.y + 46 + i * 14} fontSize={7.6} xmlSpace="preserve">
          {t}
        </text>
      ))}

      <g transform={`translate(${BUNDLE.x} ${BUNDLE.y})`}>
        <g data-bundle="" data-off="">
          <rect className="mg-card-shadow" x={-26} y={-15.5} width={52} height={33} rx={5} />
          <rect className="mg-card" x={-26} y={-17} width={52} height={33} rx={5} />
          <rect className="mg-line" x={-18} y={-8} width={22} height={2.4} rx={1.2} />
          <rect className="mg-line" x={-18} y={-2} width={28} height={2.4} rx={1.2} />
          <rect className="mg-line" x={-18} y={4} width={16} height={2.4} rx={1.2} />
          <g transform="translate(15 6)">
            <Wax size={13} />
          </g>
        </g>
      </g>

      <rect className="mg-term-shadow" x={TERM.x} y={TERM.y + 2} width={TERM.w} height={TERM.h} rx={10} />
      <rect className="mg-term" x={TERM.x} y={TERM.y} width={TERM.w} height={TERM.h} rx={10} />
      <g clipPath={`url(#${clip})`}>
        <text className="mg-term-soft" x={TERM.x + 14} y={TERM.y + 22} fontSize={FONT}>
          $
        </text>
        <g data-typed="">
          <text className="mg-term-text" x={X} y={TERM.y + 22} fontSize={FONT}>
            {VERIFY}
          </text>
          <rect className="mg-term-cover" data-cover="" x={X - 0.5} y={TERM.y + 12} width={TERM.w} height={14} style={{ transform: `translateX(${(VERIFY.length * CW).toFixed(2)}px)` }} />
          <rect className="mg-term-cursor" data-cursor="" x={X} y={TERM.y + 13.6} width={CW} height={10} data-off="" />
        </g>
        {SAYS.map((t, i) => (
          <text key={i} data-says={i} className="mg-term-text" x={TERM.x + 14} y={TERM.y + 40 + i * 13} fontSize={8.4} xmlSpace="preserve">
            {t}
          </text>
        ))}
      </g>
    </Plate>
  )
}

export default EncryptedMotion
