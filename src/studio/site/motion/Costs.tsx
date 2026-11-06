// What it costs. Press the total and every tool's price spreads over the map: tools swell into discs as big as their bills, each area
// says what it costs a month, and an area with no prices says so rather than guessing.

import { $, $$, discRadius, EASE, EASE_IN_OUT, enter, GLIDE, Hatches, Island, money, Plate, Pointer, Sea, swap, Tile, TOOLS, track, useLook, useMotion, useSvgId, type Key } from './kit.tsx'

const CYCLE = 9800
const BACK = 8000
const PRESS = 1600
const TILE_K = 0.82

const TOTAL = TOOLS.reduce((s, t) => s + t.price, 0)
/** The biggest bills swell first. */
const ORDER = [...TOOLS].sort((a, b) => b.price - a.price)
const totalOf = (id: string) => TOOLS.filter((t) => t.county === id).reduce((s, t) => s + t.price, 0)
/** A disc big enough to carry its tool's name as well as its price. */
const BIG = 20

export function CostsMotion() {
  const look = useLook()
  const hatch = useSvgId('disc')
  // Where each tile stands on this layout before prices are up. A phone draws fewer tiles.
  const tiles = look.counties.flatMap((c) => c.tools)
  /** Where a tool's tile sits once its disc is up: on the disc's rim, so the price has the middle. */
  const rim = (t: (typeof TOOLS)[number]) => ({ x: t.disc[0], y: t.disc[1] - discRadius(t.price) })
  // On a phone it stands a gutter's width in from the edge, as the page's own words do.
  const pill = look.narrow ? { x: 297, y: 8, w: 150, h: 32, big: 13.5, small: 13.5 } : { x: 336, y: 12, w: 130, h: 26, big: 10.4, small: 8.6 }

  const ref = useMotion<SVGSVGElement>((root) => {
    const parts: (Animation | null)[] = []
    const at = (x: number, y: number) => `translate(${x}px, ${y}px)`
    const target = [pill.x + pill.w * 0.6, pill.y + pill.h * 0.65] as const
    // The pointer goes to the total, top right, and presses it.
    parts.push(
      track(
        $(root, '[data-pointer]'),
        [
          { at: 0, opacity: 0, transform: at(300, 214) },
          { at: 300, opacity: 0, transform: at(300, 214) },
          { at: 600, opacity: 1, transform: at(296, 208), ease: GLIDE },
          { at: PRESS - 120, opacity: 1, transform: at(target[0], target[1]) },
          { at: PRESS + 700, opacity: 1, transform: at(target[0], target[1]), ease: EASE_IN_OUT },
          { at: PRESS + 1100, opacity: 0, transform: at(target[0] + 8, target[1] + 13) },
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
      const tile = tiles.find((x) => x.id === t.id)
      if (tile) {
        const r = rim(t)
        parts.push(swap($(root, `[data-tile="${t.id}"]`), CYCLE, go, 620, { transform: `translate(0px, 0px) scale(1)` }, { transform: `translate(${r.x - tile.x}px, ${r.y - tile.y}px) scale(${TILE_K})` }, BACK, { backDur: 600 }))
      }
      const disc: Key[] = [
        { at: 0, opacity: 0, transform: 'scale(0)' },
        { at: go, opacity: 0, transform: 'scale(0)', ease: EASE },
        { at: go + 80, opacity: 1, transform: 'scale(0.2)', ease: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' },
        { at: go + 620, opacity: 1, transform: 'scale(1)' },
        { at: BACK, opacity: 1, transform: 'scale(1)', ease: EASE_IN_OUT },
        { at: BACK + 600, opacity: 0, transform: 'scale(0)' },
      ]
      parts.push(track($(root, `[data-disc="${t.id}"]`), disc, CYCLE))
      parts.push(enter($(root, `[data-price="${t.id}"]`), CYCLE, go + 380, 320, { opacity: 0 }, BACK, { to: { opacity: 1 }, fade: 300 }))
    })
    // Each area says what it costs.
    look.counties.forEach((c, i) => parts.push(enter($(root, `[data-area-total="${c.id}"]`), CYCLE, PRESS + 900 + i * 70, 420, { opacity: 0, transform: 'translate(0px, 3px)' }, BACK)))
    return parts
  }, { rebuild: look.narrow ? 'n' : 'w' })

  return (
    <Plate reff={ref} name="costs" viewBox={look.viewBox} label="Pressing the monthly total spreads every tool's price over the map: each tool becomes a disc sized by its bill, and each area shows what it costs a month.">
      <Hatches ink={hatch} />
      <Sea />
      <Island
        look={look}
        tools={false}
        itemsOff
        extra={(c) => (
          <text className="mg-sub" data-area-total={c.id} x={c.x} y={c.y + look.subDy} fontSize={look.sub}>
            {totalOf(c.id) ? (look.narrow ? money(totalOf(c.id)) : `${money(totalOf(c.id))} a month`) : look.narrow ? 'No prices' : 'No prices yet'}
          </text>
        )}
      />
      {TOOLS.map((t) => (
        <g key={t.id} transform={`translate(${t.disc[0]} ${t.disc[1]})`}>
          <g className="o" data-disc={t.id}>
            <circle className="mg-disc" r={discRadius(t.price)} />
            <circle r={discRadius(t.price)} fill={`url(#${hatch})`} />
            <circle className="mg-disc-edge" r={discRadius(t.price)} />
          </g>
        </g>
      ))}
      {tiles.map((t) => {
        const full = TOOLS.find((x) => x.id === t.id)!
        return (
          <g key={t.id} transform={`translate(${t.x} ${t.y})`}>
            <g data-tile={t.id} style={{ transform: `translate(${rim(full).x - t.x}px, ${rim(full).y - t.y}px) scale(${TILE_K})` }}>
              <Tile letter={t.letter} size={look.tile} />
            </g>
          </g>
        )
      })}
      {TOOLS.map((t) => {
        const big = discRadius(t.price) > BIG
        // On a phone a small disc's price would be too small to read, so only the biggest bills say theirs. The size says the rest.
        if (look.narrow && !big) return null
        return (
          <g key={t.id} data-price={t.id}>
            <text className="mg-price" x={t.disc[0]} y={t.disc[1] + (big ? (look.narrow ? 4.6 : 1) : 3.4)} fontSize={look.narrow ? 13.5 : big ? 9.6 : 7.6} textAnchor="middle">
              {money(t.price)}
            </text>
            {big && !look.narrow && (
              <text className="mg-price mg-price-name" x={t.disc[0]} y={t.disc[1] + 12} fontSize={7.6} textAnchor="middle">
                {t.name}
              </text>
            )}
          </g>
        )
      })}
      <g>
        <rect className="mg-card-shadow" x={pill.x} y={pill.y + 1.5} width={pill.w} height={pill.h} rx={9} />
        <rect className="mg-card" x={pill.x} y={pill.y} width={pill.w} height={pill.h} rx={9} />
        <rect className="mg-pill-on" data-on="" x={pill.x + 0.5} y={pill.y + 0.5} width={pill.w - 1} height={pill.h - 1} rx={8.5} />
        <text x={pill.x + 12} y={pill.y + pill.h / 2 + pill.big * 0.36} fontSize={pill.big}>
          <tspan fontWeight={500}>≈{money(TOTAL)}</tspan>
          <tspan className="mg-soft" fontSize={pill.small}>
            {' '}a month
          </tspan>
        </text>
      </g>
      <g data-pointer="" data-off="">
        <g data-press="">
          <Pointer k={look.pointer} />
        </g>
      </g>
    </Plate>
  )
}

export default CostsMotion
