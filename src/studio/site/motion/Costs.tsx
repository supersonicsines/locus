// What it costs. Press the total and every tool's price spreads over the map: tools swell into discs as big as their bills, each area
// says what it costs a month, and an area with no prices says so rather than guessing.

import { $, $$, COUNTIES, discRadius, EASE, EASE_IN_OUT, enter, GLIDE, Hatches, Island, money, Plate, Pointer, Sea, swap, Tile, track, useMotion, useSvgId, type Key, type Tool } from './kit.tsx'

const CYCLE = 9800
const BACK = 8000
const PRESS = 1600
const TILE_K = 0.82

const TOOLS = COUNTIES.flatMap((c) => c.tools.map((t) => ({ ...t, county: c.id })))
const TOTAL = TOOLS.reduce((s, t) => s + t.price, 0)
/** The biggest bills swell first. */
const ORDER = [...TOOLS].sort((a, b) => b.price - a.price)
const totalOf = (id: string) => COUNTIES.find((c) => c.id === id)!.tools.reduce((s, t) => s + t.price, 0)

/** Where a tool's tile sits once its disc is up: on the disc's rim, so the price has the middle. */
const rim = (t: Tool) => ({ x: t.disc[0], y: t.disc[1] - discRadius(t.price) })

const PILL = { x: 336, y: 12, w: 130, h: 26 }

export function CostsMotion() {
  const hatch = useSvgId('disc')
  const ref = useMotion<SVGSVGElement>((root) => {
    const parts: (Animation | null)[] = []
    const at = (x: number, y: number) => `translate(${x}px, ${y}px)`
    // The pointer goes to the total, top right, and presses it.
    parts.push(
      track(
        $(root, '[data-pointer]'),
        [
          { at: 0, opacity: 0, transform: at(300, 214) },
          { at: 300, opacity: 0, transform: at(300, 214) },
          { at: 600, opacity: 1, transform: at(296, 208), ease: GLIDE },
          { at: PRESS - 120, opacity: 1, transform: at(PILL.x + 78, PILL.y + 17) },
          { at: PRESS + 700, opacity: 1, transform: at(PILL.x + 78, PILL.y + 17), ease: EASE_IN_OUT },
          { at: PRESS + 1100, opacity: 0, transform: at(PILL.x + 86, PILL.y + 30) },
          { at: CYCLE, opacity: 0, transform: at(300, 214) },
        ],
        CYCLE,
      ),
    )
    parts.push(track($(root, '[data-press]'), [{ at: 0, transform: 'scale(1)' }, { at: PRESS - 70, transform: 'scale(1)', ease: 'ease-out' }, { at: PRESS, transform: 'scale(0.8)', ease: 'ease-out' }, { at: PRESS + 170, transform: 'scale(1)' }], CYCLE))
    parts.push(swap($(root, '[data-on]'), CYCLE, PRESS, 160, { opacity: 0 }, { opacity: 1 }, BACK + 400, { backDur: 300 }))
    // What isn't a tool steps back.
    for (const el of $$(root, '[data-item]')) parts.push(swap(el, CYCLE, PRESS + 80, 320, { opacity: 1 }, { opacity: 0 }, BACK + 300))
    // Each tool swells into a disc as big as its bill, and its tile rides to the rim.
    ORDER.forEach((t, i) => {
      const go = PRESS + 140 + i * 70
      const r = rim(t)
      parts.push(swap($(root, `[data-tile="${t.letter}"]`), CYCLE, go, 620, { transform: `translate(0px, 0px) scale(1)` }, { transform: `translate(${r.x - t.x}px, ${r.y - t.y}px) scale(${TILE_K})` }, BACK, { backDur: 600 }))
      const disc: Key[] = [
        { at: 0, opacity: 0, transform: 'scale(0)' },
        { at: go, opacity: 0, transform: 'scale(0)', ease: EASE },
        { at: go + 80, opacity: 1, transform: 'scale(0.2)', ease: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' },
        { at: go + 620, opacity: 1, transform: 'scale(1)' },
        { at: BACK, opacity: 1, transform: 'scale(1)', ease: EASE_IN_OUT },
        { at: BACK + 600, opacity: 0, transform: 'scale(0)' },
      ]
      parts.push(track($(root, `[data-disc="${t.letter}"]`), disc, CYCLE))
      parts.push(enter($(root, `[data-price="${t.letter}"]`), CYCLE, go + 380, 320, { opacity: 0 }, BACK, { to: { opacity: 1 }, fade: 300 }))
    })
    // Each area says what it costs.
    COUNTIES.forEach((c, i) => parts.push(enter($(root, `[data-area-total="${c.id}"]`), CYCLE, PRESS + 900 + i * 70, 420, { opacity: 0, transform: 'translate(0px, 3px)' }, BACK)))
    return parts
  })

  return (
    <Plate reff={ref} name="costs" label="Pressing the monthly total spreads every tool's price over the map: each tool becomes a disc sized by its bill, and each area shows what it costs a month.">
      <Hatches ink={hatch} />
      <Sea />
      <Island
        tools={false}
        itemsOff
        extra={(c) => (
          <text className="mg-sub" data-area-total={c.id} x={c.x} y={c.y + 13} fontSize={9}>
            {c.tools.length ? `${money(totalOf(c.id))} a month` : 'No prices yet'}
          </text>
        )}
      />
      {TOOLS.map((t) => (
        <g key={t.letter} transform={`translate(${t.disc[0]} ${t.disc[1]})`}>
          <g className="o" data-disc={t.letter}>
            <circle className="mg-disc" r={discRadius(t.price)} />
            <circle r={discRadius(t.price)} fill={`url(#${hatch})`} />
            <circle className="mg-disc-edge" r={discRadius(t.price)} />
          </g>
        </g>
      ))}
      {TOOLS.map((t) => (
        <g key={t.letter} transform={`translate(${t.x} ${t.y})`}>
          <g data-tile={t.letter} style={{ transform: `translate(${rim(t).x - t.x}px, ${rim(t).y - t.y}px) scale(${TILE_K})` }}>
            <Tile letter={t.letter} />
          </g>
        </g>
      ))}
      {TOOLS.map((t) => (
        <text key={t.letter} className="mg-price" data-price={t.letter} x={t.disc[0]} y={t.disc[1] + 3.4} fontSize={discRadius(t.price) > 20 ? 9.6 : 7.6} textAnchor="middle">
          {money(t.price)}
        </text>
      ))}
      <g>
        <rect className="mg-card-shadow" x={PILL.x} y={PILL.y + 1.5} width={PILL.w} height={PILL.h} rx={9} />
        <rect className="mg-card" x={PILL.x} y={PILL.y} width={PILL.w} height={PILL.h} rx={9} />
        <rect className="mg-pill-on" data-on="" x={PILL.x + 0.5} y={PILL.y + 0.5} width={PILL.w - 1} height={PILL.h - 1} rx={8.5} />
        <text x={PILL.x + 12} y={PILL.y + 17.4} fontSize={10.4}>
          <tspan fontWeight={500}>≈{money(TOTAL)}</tspan>
          <tspan className="mg-soft" fontSize={8.6}>
            {' '}a month
          </tspan>
        </text>
      </g>
      <g data-pointer="" data-off="">
        <g data-press="">
          <Pointer />
        </g>
      </g>
    </Plate>
  )
}

export default CostsMotion
