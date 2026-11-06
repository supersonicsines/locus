// One line connects an agent. The command types itself out in a terminal, and then the map arrives as that agent reads it: who it's
// reading as, what's open to it and what's closed, the rules it must follow, and where things live.

import { PACKAGE } from '../../../core/agent.ts'
import { $, $$, enter, Plate, Sea, track, typing, useMotion, useSvgId, type Key } from './kit.tsx'

const CYCLE = 10600
const OUT = 9100
const FONT = 10
const CW = FONT * 0.6
const TERM = { x: 16, y: 16, w: 448, h: 102 }
const X = TERM.x + 30

const LINE_1 = 'claude mcp add meridian -e LOCUS_KEY=lcr_7Hq2… \\'
const LINE_2 = `  -- npx -y ${PACKAGE} mcp https://meridian.example`
const T1 = { at: 650, dur: LINE_1.length * 34 }
const T2 = { at: T1.at + T1.dur + 260, dur: LINE_2.length * 30 }
const ENTER = T2.at + T2.dur + 220

/** An excerpt of /llms.txt for this reader, in the words the host really serves. */
const READS: { text: string; strong?: boolean }[] = [
  { text: '# Meridian', strong: true },
  { text: "You are reading this company's map through Locus, as the" },
  { text: 'reader "Claude Code". It opens: Brand, Product, Engineering.' },
  { text: '3 other areas are closed to this reader.' },
  { text: '## Always follow', strong: true },
  { text: '- **Voice is plain and warm.** Write like a good vet talks.' },
  { text: '- **Always "Meridian", alone.**' },
  { text: '## Where things live', strong: true },
  { text: '- **HelpSync:** Support log sync. Link: helpsync.example' },
]
const PANEL = { x: 52, y: 134, w: 376, h: 156 }
/** Each line's place, with a little room before each heading, as the text has a blank line there. */
const readY = READS.reduce<number[]>((ys, r, i) => [...ys, i === 0 ? 0 : ys[i - 1] + 11.4 + (r.strong ? 4.6 : 0)], [])

export function ConnectMotion() {
  const clip = useSvgId('term')
  const ref = useMotion<SVGSVGElement>((root) => {
    const parts: (Animation | null)[] = []
    parts.push(...typing($(root, '[data-cover="1"]'), $(root, '[data-cursor="1"]'), CYCLE, T1.at, T1.dur, LINE_1.length, CW, OUT, { blinkUntil: T1.at + T1.dur + 200 }))
    parts.push(...typing($(root, '[data-cover="2"]'), $(root, '[data-cursor="2"]'), CYCLE, T2.at, T2.dur, LINE_2.length, CW, OUT, { blinkUntil: ENTER - 1 }))
    // Enter: a fresh prompt, and a cursor that waits there.
    parts.push(enter($(root, '[data-prompt="3"]'), CYCLE, ENTER, 1, { opacity: 0 }, OUT, { to: { opacity: 1 }, fade: 400 }))
    const blink: Key[] = [{ at: 0, opacity: 0 }, { at: ENTER, opacity: 0, ease: 'step-end' }]
    for (let t = ENTER; t + 1060 < OUT; t += 1060) blink.push({ at: t + 1, opacity: 1, ease: 'step-end' }, { at: t + 530, opacity: 0, ease: 'step-end' })
    blink.push({ at: OUT, opacity: 0 })
    parts.push(track($(root, '[data-cursor="3"]'), blink, CYCLE))
    // What was typed goes with the rest, before the covers come back.
    parts.push(track($(root, '[data-typed]'), [{ at: 0, opacity: 1 }, { at: OUT, opacity: 1, ease: 'ease-in-out' }, { at: OUT + 450, opacity: 0 }, { at: CYCLE - 2, opacity: 0, ease: 'step-end' }, { at: CYCLE, opacity: 1 }], CYCLE))
    // Then the map, as this agent reads it, in reading order.
    parts.push(enter($(root, '[data-reads]'), CYCLE, ENTER + 200, 640, { opacity: 0, transform: 'translate(0px, 14px)' }, OUT))
    $$(root, '[data-read]').forEach((el, i) => parts.push(enter(el, CYCLE, ENTER + 520 + i * 120, 420, { opacity: 0, transform: 'translate(0px, 3px)' }, OUT)))
    return parts
  })

  const line = (n: number, y: number, text: string) => (
    <g>
      <text className="mg-term-text" x={X} y={y} fontSize={FONT} xmlSpace="preserve">
        {text}
      </text>
      {/* At rest it's stepped aside, so a still shows the whole line. */}
      <rect className="mg-term-cover" data-cover={n} x={X - 0.5} y={y - 10.5} width={TERM.w} height={14} style={{ transform: `translateX(${(text.length * CW).toFixed(2)}px)` }} />
      <rect className="mg-term-cursor" data-cursor={n} x={X} y={y - 8.6} width={CW} height={11} data-off="" />
    </g>
  )

  return (
    <Plate reff={ref} name="connect" label="A terminal types one command that adds the map to Claude Code, and then shows what Claude Code reads: which areas are open to it, which are closed, the rules it must follow, and where things live.">
      <defs>
        <clipPath id={clip}>
          <rect x={TERM.x} y={TERM.y} width={TERM.w} height={TERM.h} rx={10} />
        </clipPath>
      </defs>
      <Sea />
      <rect className="mg-term-shadow" x={TERM.x} y={TERM.y + 2} width={TERM.w} height={TERM.h} rx={10} />
      <rect className="mg-term" x={TERM.x} y={TERM.y} width={TERM.w} height={TERM.h} rx={10} />
      {[0, 1, 2].map((i) => (
        <circle key={i} className="mg-term-dot" cx={TERM.x + 15 + i * 11} cy={TERM.y + 14} r={3.1} />
      ))}
      <g clipPath={`url(#${clip})`}>
        <text className="mg-term-soft" x={TERM.x + 16} y={60} fontSize={FONT}>
          $
        </text>
        <g data-typed="">
          {line(1, 60, LINE_1)}
          {line(2, 76, LINE_2)}
        </g>
        <g data-prompt="3" data-off="">
          <text className="mg-term-soft" x={TERM.x + 16} y={100} fontSize={FONT}>
            $
          </text>
        </g>
        <rect className="mg-term-cursor" data-cursor="3" x={X} y={100 - 8.6} width={CW} height={11} data-off="" />
      </g>

      <g data-reads="">
        <rect className="mg-card-shadow" x={PANEL.x} y={PANEL.y + 2} width={PANEL.w} height={PANEL.h} rx={10} />
        <rect className="mg-card" x={PANEL.x} y={PANEL.y} width={PANEL.w} height={PANEL.h} rx={10} />
        <text className="mg-soft" x={PANEL.x + 14} y={PANEL.y + 19} fontSize={8.6} fontWeight={500}>
          What Claude Code reads
        </text>
        <text className="mg-soft" x={PANEL.x + PANEL.w - 14} y={PANEL.y + 19} fontSize={8.6} textAnchor="end">
          /llms.txt
        </text>
        <line className="mg-hair" x1={PANEL.x} x2={PANEL.x + PANEL.w} y1={PANEL.y + 28} y2={PANEL.y + 28} />
        {READS.map((r, i) => (
          <text key={i} data-read={i} x={PANEL.x + 14} y={PANEL.y + 44 + readY[i]} fontSize={8.2} fontWeight={r.strong ? 600 : 400} className={r.strong ? undefined : 'mg-read'} xmlSpace="preserve">
            {r.text}
          </text>
        ))}
      </g>
    </Plate>
  )
}

export default ConnectMotion
