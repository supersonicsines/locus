// Documents become one map. Three files arrive; a secret in one is struck out before anything leaves; the land comes up under them, and
// what's in each file flies out as small items and tools onto its area. A rule one document proposes lands with a "?": it waits for you.

import { $, $$, enter, EASE, Island, itemEnd, Plate, Sea, track, useLook, useMotion, type Key } from './kit.tsx'

const CYCLE = 9800
const OUT = 8500

const FILES = [
  { name: 'invoices.pdf', dx: -12, dy: 8, rot: -7, lines: [62, 70, 48, 66, 40, 70, 58] },
  { name: 'contract.pdf', dx: 10, dy: 4, rot: 5, lines: [70, 64, 70, 52, 68, 44, 60] },
  { name: 'eng-notes.md', dx: 0, dy: 0, rot: -1.5, lines: [66, 52, 0, 70, 46, 62] },
]

/** The rule a document proposes. It doesn't instruct anyone until it's approved. */
const PROPOSED = { county: 'brand', item: 1 }

/** As the hero, it plays as soon as any of it is seen, and while it waits it shows the files already stacked, never an empty sea. */
export function MapFormsMotion({ hero = false }: { hero?: boolean }) {
  const look = useLook()
  // On a phone the files are drawn larger, so their names can be read.
  const k = look.narrow ? 1.4 : 1
  const CARD = { w: 92, h: 116 }
  const FROM = { x: 240, y: 150 }
  const STACK = { x: FROM.x - (CARD.w * k) / 2, y: FROM.y - (CARD.h * k) / 2 }
  const PILE = look.narrow ? { x: 18, y: 8, k: 0.34 } : { x: 12, y: 10, k: 0.34 }

  const ref = useMotion<SVGSVGElement>((root) => {
    const parts: (Animation | null)[] = []
    // The files arrive, one on another, opaque almost at once, so one never shows through another as they land.
    $$(root, '[data-file]').forEach((el, i) => {
      const at = 150 + i * 160
      parts.push(
        track(
          el,
          [
            { at: 0, opacity: 0, transform: 'translate(0px, 14px)' },
            { at, opacity: 0, transform: 'translate(0px, 14px)', ease: 'linear' },
            { at: at + 40, opacity: 1, transform: 'translate(0px, 13px)', ease: EASE },
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
    const stack = `translate(${STACK.x}px, ${STACK.y}px) scale(${k})`
    parts.push(
      track(
        $(root, '[data-files]'),
        [
          { at: 0, transform: stack },
          { at: 2950, transform: stack, ease: 'cubic-bezier(0.65, 0, 0.25, 1)' },
          { at: 3700, transform: `translate(${PILE.x}px, ${PILE.y}px) scale(${PILE.k})` },
        ],
        CYCLE,
      ),
    )
    // The land comes up under them.
    parts.push(enter($(root, '[data-land]'), CYCLE, 1250, 800, { opacity: 0 }, OUT, { to: { opacity: 1 } }))
    parts.push(enter($(root, '[data-borders]'), CYCLE, 1500, 700, { opacity: 0 }, OUT, { to: { opacity: 1 } }))
    look.counties.forEach((c, i) => parts.push(enter($(root, `[data-name="${c.id}"]`), CYCLE, 1650 + i * 70, 520, { opacity: 0, transform: 'translate(0px, 5px) scale(1)' }, OUT)))
    // And what's in the files flies out onto it, area by area.
    look.counties.forEach((c, ci) => {
      const pieces = [...c.items.map((it, i) => ({ el: $(root, `[data-item="${c.id}-${i}"]`), x: it.x + look.glyph * 0.6, y: it.y - look.glyph * 0.33 })), ...c.tools.map((t) => ({ el: $(root, `[data-tool="${t.id}"]`), x: t.x, y: t.y }))]
      pieces.forEach((p, i) => {
        const at = 1900 + ci * 150 + i * 70
        const away = `translate(${FROM.x - p.x}px, ${FROM.y - p.y}px) scale(0.4)`
        parts.push(
          track(
            p.el,
            [
              { at: 0, opacity: 0, transform: away },
              { at, opacity: 0, transform: away, ease: 'linear' },
              { at: at + 120, opacity: 1, transform: `translate(${(FROM.x - p.x) * 0.9}px, ${(FROM.y - p.y) * 0.9}px) scale(0.5)`, ease: 'cubic-bezier(0.2, 0.6, 0.25, 1)' },
              { at: at + 950, opacity: 1, transform: 'translate(0px, 0px) scale(1)' },
              { at: OUT, opacity: 1, transform: 'translate(0px, 0px) scale(1)', ease: 'ease-in-out' },
              { at: OUT + 500, opacity: 0, transform: 'translate(0px, 0px) scale(1)' },
              { at: CYCLE, opacity: 0, transform: away },
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
  }, { start: hero ? 0.01 : 0.65, rest: hero ? 700 : 0, rebuild: look.narrow ? 'n' : 'w' })

  const proposed = look.counties.find((c) => c.id === PROPOSED.county)!.items[PROPOSED.item]
  const askR = look.narrow ? 7 : 5.2
  const askX = itemEnd(look, proposed) + askR + 3
  const askY = proposed.y - look.item * 0.34
  const title = look.narrow ? 10 : 7.4

  return (
    <Plate reff={ref} name="map" viewBox={look.viewBox} label="Three files become one map: a secret in one is struck out first, the land comes up, and the files' contents land as items and tools in their areas. One proposed rule is marked with a question mark.">
      <Sea />
      <Island look={look} />
      <g transform={`translate(${askX} ${askY})`}>
        <g className="o" data-ask="">
          <circle className="mg-ask" r={askR} />
          <text className="mg-ask-q" x={0} y={askR * 0.48} fontSize={askR * 1.42} textAnchor="middle">
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
              <text x={9} y={look.narrow ? 19 : 17} fontSize={title} fontWeight={500}>
                {f.name}
              </text>
              {f.lines.map((w, j) => (w ? <rect key={j} className="mg-line" x={9} y={30 + j * 10} width={w} height={2.6} rx={1.3} /> : null))}
              {i === FILES.length - 1 && (
                <g transform="translate(9 56.4)">
                  <text className="mg-secret" x={0} y={0} fontSize={look.narrow ? 7.4 : 6.4}>
                    KEY=sk_7f3a91c2
                  </text>
                  <rect className="mg-redact" data-redact="" x={(look.narrow ? 7.4 : 6.4) * 0.6 * 4} y={-6.4} width={(look.narrow ? 7.4 : 6.4) * 0.6 * 11 + 1} height={8} rx={1.2} />
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
