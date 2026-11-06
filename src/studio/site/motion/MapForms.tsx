// Documents become one map. Three files arrive; a secret in one is struck out before anything leaves; the land comes up under them, and
// what's in each file flies out as small items and tools onto its area. A rule one document proposes lands with a "?": it waits for you.

import { $, $$, COUNTIES, enter, EASE, Island, ITEM_SIZE, Plate, Sea, track, useMotion, type Key } from './kit.tsx'

const CYCLE = 9800
const OUT = 8500
/** Where the files stand while they're read, and where they're put once they have been. */
const STACK = { x: 194, y: 92 }
const PILE = { x: 12, y: 10, k: 0.34 }
const CARD = { w: 92, h: 116 }
const FROM = { x: STACK.x + CARD.w / 2, y: STACK.y + CARD.h / 2 }

const FILES = [
  { name: 'invoices.pdf', dx: -12, dy: 8, rot: -7, lines: [62, 70, 48, 66, 40, 70, 58] },
  { name: 'contract.pdf', dx: 10, dy: 4, rot: 5, lines: [70, 64, 70, 52, 68, 44, 60] },
  { name: 'eng-notes.md', dx: 0, dy: 0, rot: -1.5, lines: [66, 52, 0, 70, 46, 62] },
]

/** The rule a document proposes. It doesn't instruct anyone until it's approved. */
const PROPOSED = { county: 'brand', item: 1 }

export function MapFormsMotion() {
  const ref = useMotion<SVGSVGElement>((root) => {
    const parts: (Animation | null)[] = []
    // The files arrive, one on another.
    // Opaque almost at once, so one file never shows through another as they land.
    $$(root, '[data-file]').forEach((el, i) => {
      const at = 150 + i * 160
      parts.push(
        track(
          el,
          [
            { at: 0, opacity: 0, transform: 'translate(0px, 14px)' },
            { at, opacity: 0, transform: 'translate(0px, 14px)', ease: 'linear' },
            { at: at + 110, opacity: 1, transform: 'translate(0px, 10px)', ease: EASE },
            { at: at + 560, opacity: 1, transform: 'translate(0px, 0px)' },
            { at: OUT, opacity: 1, transform: 'translate(0px, 0px)', ease: 'ease-in-out' },
            { at: OUT + 500, opacity: 0, transform: 'translate(0px, 0px)' },
            { at: CYCLE, opacity: 0, transform: 'translate(0px, 14px)' },
          ],
          CYCLE,
        ),
      )
    })
    // A key pasted into a note is struck out here, on this device.
    parts.push(
      track(
        $(root, '[data-redact]'),
        [
          { at: 0, transform: 'scaleX(0)' },
          { at: 820, transform: 'scaleX(0)', ease: 'cubic-bezier(0.5, 0, 0.2, 1)' },
          { at: 1180, transform: 'scaleX(1)' },
        ],
        CYCLE,
      ),
    )
    // Once read, the files are put to one side.
    parts.push(
      track(
        $(root, '[data-files]'),
        [
          { at: 0, transform: `translate(${STACK.x}px, ${STACK.y}px) scale(1)` },
          { at: 2950, transform: `translate(${STACK.x}px, ${STACK.y}px) scale(1)`, ease: 'cubic-bezier(0.65, 0, 0.25, 1)' },
          { at: 3700, transform: `translate(${PILE.x}px, ${PILE.y}px) scale(${PILE.k})` },
        ],
        CYCLE,
      ),
    )
    // The land comes up under them.
    parts.push(enter($(root, '[data-land]'), CYCLE, 1250, 800, { opacity: 0 }, OUT, { to: { opacity: 1 } }))
    parts.push(enter($(root, '[data-borders]'), CYCLE, 1500, 700, { opacity: 0 }, OUT, { to: { opacity: 1 } }))
    COUNTIES.forEach((c, i) => parts.push(enter($(root, `[data-name="${c.id}"]`), CYCLE, 1650 + i * 70, 520, { opacity: 0, transform: 'translate(0px, 5px) scale(1)' }, OUT)))
    // And what's in the files flies out onto it, area by area.
    COUNTIES.forEach((c, ci) => {
      const pieces = [...c.items.map((it, i) => ({ el: $(root, `[data-item="${c.id}-${i}"]`), x: it.x + 6, y: it.y - 3 })), ...c.tools.map((t) => ({ el: $(root, `[data-tool="${t.letter}"]`), x: t.x, y: t.y }))]
      pieces.forEach((p, i) => {
        const at = 1900 + ci * 150 + i * 70
        parts.push(
          track(
            p.el,
            [
              { at: 0, opacity: 0, transform: `translate(${FROM.x - p.x}px, ${FROM.y - p.y}px) scale(0.4)` },
              { at, opacity: 0, transform: `translate(${FROM.x - p.x}px, ${FROM.y - p.y}px) scale(0.4)`, ease: 'linear' },
              { at: at + 120, opacity: 1, transform: `translate(${(FROM.x - p.x) * 0.9}px, ${(FROM.y - p.y) * 0.9}px) scale(0.5)`, ease: 'cubic-bezier(0.2, 0.6, 0.25, 1)' },
              { at: at + 950, opacity: 1, transform: 'translate(0px, 0px) scale(1)' },
              { at: OUT, opacity: 1, transform: 'translate(0px, 0px) scale(1)', ease: 'ease-in-out' },
              { at: OUT + 500, opacity: 0, transform: 'translate(0px, 0px) scale(1)' },
              { at: CYCLE, opacity: 0, transform: `translate(${FROM.x - p.x}px, ${FROM.y - p.y}px) scale(0.4)` },
            ],
            CYCLE,
          ),
        )
      })
    })
    // The proposed rule asks: a "?" pops onto it, last.
    const ask: Key[] = [
      { at: 0, opacity: 0, transform: 'scale(0)' },
      { at: 3950, opacity: 0, transform: 'scale(0)', ease: EASE },
      { at: 4200, opacity: 1, transform: 'scale(1.18)', ease: 'ease-in-out' },
      { at: 4380, opacity: 1, transform: 'scale(1)' },
      { at: OUT, opacity: 1, transform: 'scale(1)', ease: 'ease-in-out' },
      { at: OUT + 400, opacity: 0, transform: 'scale(1)' },
      { at: CYCLE, opacity: 0, transform: 'scale(0)' },
    ]
    parts.push(track($(root, '[data-ask]'), ask, CYCLE))
    return parts
  })

  const proposed = COUNTIES.find((c) => c.id === PROPOSED.county)!.items[PROPOSED.item]
  const askX = proposed.x + 13 + proposed.label.length * ITEM_SIZE * 0.6 + 8
  const askY = proposed.y - 3

  return (
    <Plate reff={ref} name="map" label="Three files become one map: a secret in one is struck out first, the land comes up, and the files' contents land as items and tools in their areas. One proposed rule is marked with a question mark.">
      <Sea />
      <Island />
      <g transform={`translate(${askX} ${askY})`}>
        <g className="o" data-ask="">
          <circle className="mg-ask" r={5.2} />
          <text className="mg-ask-q" x={0} y={2.5} fontSize={7.4} textAnchor="middle">
            ?
          </text>
        </g>
      </g>
      <g data-files="" style={{ transform: `translate(${PILE.x}px, ${PILE.y}px) scale(${PILE.k})` }}>
        {FILES.map((f, i) => (
          <g key={f.name} transform={`translate(${f.dx} ${f.dy}) rotate(${f.rot} ${CARD.w / 2} ${CARD.h / 2})`}>
            <g data-file={i}>
              <rect className="mg-card-shadow" x={0} y={1.6} width={CARD.w} height={CARD.h} rx={5} />
              <rect className="mg-card" width={CARD.w} height={CARD.h} rx={5} />
              <text x={9} y={17} fontSize={7.4} fontWeight={500}>
                {f.name}
              </text>
              {f.lines.map((w, j) =>
                w ? <rect key={j} className="mg-line" x={9} y={28 + j * 10} width={w} height={2.6} rx={1.3} /> : null,
              )}
              {i === FILES.length - 1 && (
                <g transform="translate(9 54.4)">
                  <text className="mg-secret" x={0} y={0} fontSize={6.4}>
                    KEY=sk_7f3a91c2
                  </text>
                  <rect className="mg-redact" data-redact="" x={15.4} y={-6} width={43} height={7.6} rx={1.2} />
                </g>
              )}
            </g>
          </g>
        ))}
      </g>
    </Plate>
  )
}

export default MapFormsMotion
