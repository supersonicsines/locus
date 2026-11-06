// One command connects an agent. It's pasted into a terminal and run, and then the map arrives as that agent reads it: who it's
// reading as, what's open to it and what's closed, the rules it must follow, and where things live.

import { Fragment } from 'react'
import { PACKAGE } from '../../../core/agent.ts'
import { $, $$, enter, Plate, Sea, track, useMotion, useNarrow, useSvgId, type Key } from './kit.tsx'

const CYCLE = 7600
const OUT = 6400
const PASTE = 500
const RUN = 1300
const CARD_IN = 1500

/** A line of what the agent reads, rendered as the Markdown it is: headings and the rules' names in weight, never their marks. */
type Read = { text: string; strong?: boolean; lead?: string; head?: boolean }

const LAYOUTS = {
  wide: {
    font: 10,
    term: { x: 16, y: 16, w: 448, h: 102 },
    lines: [`claude mcp add meridian -e LOCUS_KEY=lcr_7Hq2… \\`, `  -- npx -y ${PACKAGE} mcp https://meridian.example`],
    lineY: 60,
    step: 16,
    prompt: true,
    card: { x: 52, y: 134, w: 376, h: 156 },
    readFont: 8.2,
    readStep: 11.4,
    reads: [
      { text: 'Meridian', head: true },
      { text: "You are reading this company's map through Locus, as the" },
      { text: 'reader "Claude Code". It opens: Brand, Product, Engineering.' },
      { text: '3 other areas are closed to this reader.' },
      { text: 'Always follow', head: true },
      { lead: '• Voice is plain and warm.', text: ' Write like a good vet talks.' },
      { lead: '• Always "Meridian", alone.', text: '' },
      { text: 'Where things live', head: true },
      { lead: '• HelpSync:', text: ' Support log sync. Link: helpsync.example' },
    ] as Read[],
  },
  narrow: {
    font: 13.5,
    term: { x: 12, y: 10, w: 456, h: 114 },
    lines: ['claude mcp add meridian \\', '  -e LOCUS_KEY=lcr_7Hq2… \\', `  -- npx -y ${PACKAGE} \\`, '  mcp https://meridian.example'],
    lineY: 50,
    step: 20,
    prompt: false,
    card: { x: 12, y: 136, w: 456, h: 160 },
    readFont: 13.5,
    readStep: 18,
    reads: [
      { text: 'Meridian', head: true },
      { text: "You are reading this company's map through" },
      { text: 'Locus, as the reader "Claude Code".' },
      { text: '3 other areas are closed to this reader.' },
      { text: 'Always follow', head: true },
      { lead: '• Voice is plain and warm.', text: '' },
    ] as Read[],
  },
}

export function ConnectMotion() {
  const L = useNarrow() ? LAYOUTS.narrow : LAYOUTS.wide
  const clip = useSvgId('term')
  const T = L.term
  const cw = L.font * 0.6
  const X = T.x + (L.font === 10 ? 30 : 32)
  const lastY = L.lineY + (L.lines.length - 1) * L.step
  const endX = X + L.lines[L.lines.length - 1].length * cw

  const ref = useMotion<SVGSVGElement>((root) => {
    const parts: (Animation | null)[] = []
    // Pasted, all at once, with the selection's tint going as it lands.
    parts.push(enter($(root, '[data-pasted]'), CYCLE, PASTE, 1, { opacity: 0 }, OUT, { to: { opacity: 1 }, fade: 450 }))
    parts.push(
      track(
        $(root, '[data-tint]'),
        [
          { at: 0, opacity: 0 },
          { at: PASTE, opacity: 0, ease: 'step-end' },
          { at: PASTE + 1, opacity: 0.25 },
          { at: PASTE + 320, opacity: 0 },
        ],
        CYCLE,
      ),
    )
    // The cursor waits at the end of what was pasted, blinking, until Enter.
    const wait: Key[] = [{ at: 0, opacity: 0 }, { at: PASTE, opacity: 0, ease: 'step-end' }]
    for (let t = PASTE; t < RUN; t += 520) wait.push({ at: t + 1, opacity: 1, ease: 'step-end' }, { at: Math.min(t + 400, RUN - 1), opacity: 0, ease: 'step-end' })
    wait.push({ at: RUN, opacity: 0 })
    parts.push(track($(root, '[data-cursor="paste"]'), wait, CYCLE))
    // Enter: a fresh prompt, and a cursor that waits there.
    if (L.prompt) {
      parts.push(enter($(root, '[data-prompt]'), CYCLE, RUN, 1, { opacity: 0 }, OUT, { to: { opacity: 1 }, fade: 400 }))
      const blink: Key[] = [{ at: 0, opacity: 0 }, { at: RUN, opacity: 0, ease: 'step-end' }]
      for (let t = RUN; t + 1060 < OUT; t += 1060) blink.push({ at: t + 1, opacity: 1, ease: 'step-end' }, { at: t + 530, opacity: 0, ease: 'step-end' })
      blink.push({ at: OUT, opacity: 0 })
      parts.push(track($(root, '[data-cursor="run"]'), blink, CYCLE))
    }
    // Then the map, as this agent reads it, in reading order.
    parts.push(enter($(root, '[data-reads]'), CYCLE, CARD_IN, 560, { opacity: 0, transform: 'translate(0px, 14px)' }, OUT))
    $$(root, '[data-read]').forEach((el, i) => parts.push(enter(el, CYCLE, CARD_IN + 260 + i * 110, 380, { opacity: 0, transform: 'translate(0px, 3px)' }, OUT)))
    return parts
  })

  // Each line's place, with a little room before each heading, as the text has a blank line there.
  const readY = L.reads.reduce<number[]>((ys, r, i) => [...ys, i === 0 ? 0 : ys[i - 1] + L.readStep + (r.head ? L.readStep * 0.35 : 0)], [])
  const C = L.card
  const label = L.readFont === 13.5 ? 13.5 : 8.6
  const headY = C.y + label * 1.9
  const hairY = C.y + label * 2.6
  const firstY = hairY + L.readFont * 1.6

  return (
    <Plate reff={ref} name="connect" label="One command, pasted into a terminal, adds the map to Claude Code. Then the card shows what Claude Code reads: which areas are open to it, which are closed, and the rules it must follow.">
      <defs>
        {/* A unit inside the terminal's edge, so nothing that moves in it ever touches the edge's anti-aliasing. */}
        <clipPath id={clip}>
          <rect x={T.x + 1} y={T.y + 1} width={T.w - 2} height={T.h - 2} rx={9} />
        </clipPath>
      </defs>
      <Sea />
      <rect className="mg-term-shadow" x={T.x} y={T.y + 2} width={T.w} height={T.h} rx={10} />
      <rect className="mg-term" x={T.x} y={T.y} width={T.w} height={T.h} rx={10} />
      {[0, 1, 2].map((i) => (
        <circle key={i} className="mg-term-dot" cx={T.x + 15 + i * 11} cy={T.y + 14} r={3.1} />
      ))}
      <g clipPath={`url(#${clip})`}>
        <text className="mg-term-soft" x={T.x + 16} y={L.lineY} fontSize={L.font}>
          $
        </text>
        <rect className="mg-term-tint" data-tint="" x={X - 3} y={L.lineY - L.font * 1.05} width={Math.max(...L.lines.map((l) => l.length)) * cw + 6} height={lastY - L.lineY + L.font * 1.45} rx={2} data-off="" />
        <g data-pasted="">
          {L.lines.map((l, i) => (
            <text key={i} className="mg-term-text" x={X} y={L.lineY + i * L.step} fontSize={L.font} xmlSpace="preserve">
              {l}
            </text>
          ))}
        </g>
        <rect className="mg-term-cursor" data-cursor="paste" x={endX + cw * 0.3} y={lastY - L.font * 0.86} width={cw} height={L.font * 1.1} data-off="" />
        {L.prompt && (
          <>
            <g data-prompt="" data-off="">
              <text className="mg-term-soft" x={T.x + 16} y={lastY + 24} fontSize={L.font}>
                $
              </text>
            </g>
            <rect className="mg-term-cursor" data-cursor="run" x={X} y={lastY + 24 - L.font * 0.86} width={cw} height={L.font * 1.1} data-off="" />
          </>
        )}
      </g>

      <g data-reads="">
        <rect className="mg-card-shadow" x={C.x} y={C.y + 2} width={C.w} height={C.h} rx={10} />
        <rect className="mg-card" x={C.x} y={C.y} width={C.w} height={C.h} rx={10} />
        <text className="mg-soft" x={C.x + 14} y={headY} fontSize={label} fontWeight={500}>
          What the agent reads
        </text>
        <text className="mg-soft" x={C.x + C.w - 14} y={headY} fontSize={label} textAnchor="end">
          as Claude Code
        </text>
        <line className="mg-hair" x1={C.x} x2={C.x + C.w} y1={hairY} y2={hairY} />
        {L.reads.map((r, i) => (
          <text key={i} data-read={i} x={C.x + 14} y={firstY + readY[i]} fontSize={r.head && i === 0 ? L.readFont * 1.12 : L.readFont} fontWeight={r.head ? 600 : 400} className={r.head ? undefined : 'mg-read'} xmlSpace="preserve">
            {r.lead ? (
              <Fragment>
                <tspan className="mg-read-strong">{r.lead}</tspan>
                {r.text}
              </Fragment>
            ) : (
              r.text
            )}
          </text>
        ))}
      </g>
    </Plate>
  )
}

export default ConnectMotion
