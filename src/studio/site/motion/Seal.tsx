// Who reads what. Pick a reader and the map shows what they can see; press an area and it seals: its land turns vermilion-pink, its edge
// wears the colour, what's on it goes, the links into it fade, and the wax lands. The product's one memorable moment, so it's given room.

import { $, $$, enter, EASE, EASE_IN_OUT, GLIDE, Hatches, Island, itemEnd, nameEnd, Plate, Pointer, Sea, shapeOf, swap, Tile, track, useLook, useMotion, useSvgId, Wax, type Key } from './kit.tsx'

const CYCLE = 10200
const BACK = 8300
/**
 * Claude Code's own view of the sample: it can't read People, and once Legal and Money are pressed it reads Brand, Product and
 * Engineering, 3 of 6, as in the example and as the next graphic connects it.
 */
const SEALED = new Set(['legal', 'money', 'people'])
/** Closed to this reader already, so it seals the moment the reader is picked. */
const CLOSED = 'people'
const LENS_AT = 560
/** Pressed, in order, and when. The tip lands on empty land in each area. */
const PRESS_AT = { legal: 2050, money: 3650 }

export function SealMotion() {
  const look = useLook()
  const hatch = useSvgId('sealed')
  const county = (id: string) => look.counties.find((c) => c.id === id)!
  const tips = look.narrow
    ? { legal: [158, 232] as const, money: [398, 268] as const }
    : { legal: [156, 250] as const, money: [408, 262] as const }
  const presses = (['legal', 'money'] as const).map((id) => ({ id, at: PRESS_AT[id], tip: tips[id] }))

  // Links that cross between areas, as the map draws them: from the end of one item's name to the end of another's. The ones into a sealed area fade with it.
  const from = (cid: string, i: number) => {
    const it = county(cid).items[i]
    return [itemEnd(look, it) + 4, it.y - look.item * 0.35] as const
  }
  const [a1, b1] = [from('brand', look.narrow ? 1 : 2), from('legal', 0)]
  const [a2, b2] = [from('engineering', look.narrow ? 1 : 2), from('money', 0)]
  const links = [
    { into: 'legal', d: `M${a1[0]} ${a1[1]} C ${a1[0] + 18} ${a1[1] + 24}, ${b1[0] + 8} ${b1[1] - 40}, ${b1[0]} ${b1[1] - 4}` },
    { into: 'money', d: `M${a2[0]} ${a2[1]} C ${a2[0] + 8} ${a2[1] + 26}, ${b2[0] + 8} ${b2[1] - 40}, ${b2[0]} ${b2[1] - 4}` },
  ]

  const ref = useMotion<SVGSVGElement>((root) => {
    const parts: (Animation | null)[] = []
    // Picking the reader: the line that says whose view this is, and what each area lets them read.
    parts.push(enter($(root, '[data-pill]'), CYCLE, 250, 520, { opacity: 0, transform: 'translate(0px, -8px)' }, BACK))
    for (const c of look.counties) {
      const can = $(root, `[data-can="${c.id}"]`)
      const press = presses.find((p) => p.id === c.id)
      if (c.id === CLOSED) parts.push(enter($(root, `[data-cant="${c.id}"]`), CYCLE, 520, 420, { opacity: 0, transform: 'translate(0px, 3px)' }, BACK))
      else if (!press) parts.push(enter(can, CYCLE, 520, 420, { opacity: 0, transform: 'translate(0px, 3px)' }, BACK))
      else {
        parts.push(
          track(
            can,
            [
              { at: 0, opacity: 0, transform: 'translate(0px, 3px)' },
              { at: 520, opacity: 0, transform: 'translate(0px, 3px)' },
              { at: 940, opacity: 1, transform: 'translate(0px, 0px)' },
              { at: press.at, opacity: 1, transform: 'translate(0px, 0px)' },
              { at: press.at + 260, opacity: 0, transform: 'translate(0px, 0px)' },
            ],
            CYCLE,
          ),
        )
        parts.push(enter($(root, `[data-cant="${c.id}"]`), CYCLE, press.at + 120, 360, { opacity: 0, transform: 'translate(0px, 0px)' }, BACK))
      }
    }

    // What the reader can't read seals as soon as they're picked, quietly: it's how things stand, not something done.
    {
      const t = LENS_AT
      parts.push(swap($(root, `[data-seal="${CLOSED}"]`), CYCLE, t, 520, { opacity: 0, transform: 'scale(1.012)' }, { opacity: 1, transform: 'scale(1)' }, BACK, { backDur: 600 }))
      parts.push(swap($(root, `[data-name="${CLOSED}"]`), CYCLE, t, 360, { opacity: 1 }, { opacity: 0 }, BACK + 100))
      parts.push(swap($(root, `[data-name-sealed="${CLOSED}"]`), CYCLE, t, 360, { opacity: 0 }, { opacity: 1 }, BACK + 100))
      for (const el of $$(root, `[data-county-of="${CLOSED}"]`)) parts.push(swap(el, CYCLE, t, 300, { opacity: 1 }, { opacity: 0 }, BACK + 150))
      parts.push(
        track(
          $(root, `[data-wax="${CLOSED}"]`),
          [
            { at: 0, opacity: 0, transform: 'translate(0px, 0px) scale(1.25) rotate(0deg)' },
            { at: t + 120, opacity: 0, transform: 'translate(0px, 0px) scale(1.25) rotate(0deg)', ease: EASE },
            { at: t + 440, opacity: 1, transform: 'translate(0px, 0px) scale(1) rotate(0deg)' },
            { at: BACK, opacity: 1, transform: 'translate(0px, 0px) scale(1) rotate(0deg)', ease: EASE_IN_OUT },
            { at: BACK + 420, opacity: 0, transform: 'translate(0px, -2px) scale(1.12) rotate(0deg)' },
          ],
          CYCLE,
        ),
      )
    }

    // Each press seals its area.
    for (const p of presses) {
      const t = p.at
      // The county's colour settles onto it, a touch from above, as the wax will.
      parts.push(swap($(root, `[data-seal="${p.id}"]`), CYCLE, t, 520, { opacity: 0, transform: 'scale(1.012)' }, { opacity: 1, transform: 'scale(1)' }, BACK, { backDur: 600 }))
      parts.push(swap($(root, `[data-name="${p.id}"]`), CYCLE, t + 60, 360, { opacity: 1 }, { opacity: 0 }, BACK + 100))
      parts.push(swap($(root, `[data-name-sealed="${p.id}"]`), CYCLE, t + 60, 360, { opacity: 0 }, { opacity: 1 }, BACK + 100))
      for (const el of $$(root, `[data-county-of="${p.id}"]`)) parts.push(swap(el, CYCLE, t, 300, { opacity: 1 }, { opacity: 0 }, BACK + 150))
      for (const el of $$(root, `[data-link-into="${p.id}"]`)) parts.push(swap(el, CYCLE, t, 420, { opacity: 1 }, { opacity: 0 }, BACK + 150))
      // The wax drops from above the page and is pressed: a little past flat, then back.
      const land = t + 170
      const wax: Key[] = [
        { at: 0, opacity: 0, transform: 'translate(0px, -4px) scale(1.9) rotate(-16deg)' },
        { at: land, opacity: 0, transform: 'translate(0px, -4px) scale(1.9) rotate(-16deg)', ease: 'cubic-bezier(0.55, 0, 0.75, 0.3)' },
        { at: land + 240, opacity: 1, transform: 'translate(0px, 0px) scale(0.9) rotate(3deg)', ease: EASE },
        { at: land + 400, opacity: 1, transform: 'translate(0px, 0px) scale(1.05) rotate(0deg)', ease: EASE_IN_OUT },
        { at: land + 560, opacity: 1, transform: 'translate(0px, 0px) scale(1) rotate(0deg)' },
        { at: BACK, opacity: 1, transform: 'translate(0px, 0px) scale(1) rotate(0deg)', ease: EASE_IN_OUT },
        { at: BACK + 420, opacity: 0, transform: 'translate(0px, -2px) scale(1.12) rotate(0deg)' },
        { at: CYCLE, opacity: 0, transform: 'translate(0px, -4px) scale(1.9) rotate(-16deg)' },
      ]
      parts.push(track($(root, `[data-wax="${p.id}"]`), wax, CYCLE))
      parts.push(
        track(
          $(root, `[data-ring="${p.id}"]`),
          [
            { at: 0, opacity: 0, transform: 'scale(0.6)' },
            { at: land + 230, opacity: 0, transform: 'scale(0.6)' },
            { at: land + 260, opacity: 0.55, transform: 'scale(0.75)' },
            { at: land + 900, opacity: 0, transform: 'scale(2.1)' },
          ],
          CYCLE,
        ),
      )
    }

    // The pointer: in, to the first area, press, to the second, press, away.
    const at = (x: number, y: number) => `translate(${x}px, ${y}px)`
    const [a, b] = presses
    // It comes in over an area this reader can read, so it never looks as if it pressed the one that was closed already.
    const start = look.narrow ? ([296, 164] as const) : ([292, 160] as const)
    parts.push(
      track(
        $(root, '[data-pointer]'),
        [
          { at: 0, opacity: 0, transform: at(start[0], start[1]) },
          { at: 760, opacity: 0, transform: at(start[0], start[1]) },
          { at: 1060, opacity: 1, transform: at(start[0] - 6, start[1] - 6), ease: GLIDE },
          { at: a.at - 120, opacity: 1, transform: at(a.tip[0], a.tip[1]) },
          { at: a.at + 520, opacity: 1, transform: at(a.tip[0], a.tip[1]), ease: GLIDE },
          { at: b.at - 120, opacity: 1, transform: at(b.tip[0], b.tip[1]) },
          { at: b.at + 700, opacity: 1, transform: at(b.tip[0], b.tip[1]), ease: EASE_IN_OUT },
          { at: b.at + 1100, opacity: 0, transform: at(b.tip[0] + 8, b.tip[1] + 10) },
          { at: CYCLE, opacity: 0, transform: at(start[0], start[1]) },
        ],
        CYCLE,
      ),
    )
    const press = (t: number): Key[] => [
      { at: t - 70, transform: 'scale(1)', ease: 'ease-out' },
      { at: t, transform: 'scale(0.8)', ease: 'ease-out' },
      { at: t + 170, transform: 'scale(1)' },
    ]
    parts.push(track($(root, '[data-press]'), [{ at: 0, transform: 'scale(1)' }, ...press(a.at), ...press(b.at)], CYCLE))
    return parts
  }, { rebuild: look.narrow ? 'n' : 'w' })

  // The line that says whose view this is, sized to its words.
  const pillText = look.narrow ? 13.5 : 9.4
  const pillH = look.narrow ? 32 : 26
  const pillW = 'Seeing the map as Claude Code'.length * pillText * 0.6 + pillH + 26
  const pillX = 240 - pillW / 2
  const pillY = look.narrow ? 8 : 12
  const markR = pillH * 0.27

  return (
    <Plate reff={ref} name="seal" viewBox={look.viewBox} label="Seeing the map as Claude Code, which can't read People. Pressing Legal and then Money seals them too: each turns vermilion, what's on it goes, and a wax seal lands on it. Brand, Product and Engineering stay open.">
      <Hatches sealed={hatch} />
      <Sea />
      <Island
        look={look}
        tools={false}
        off={SEALED}
        extra={(c) => (
          // What this reader can read, said under each name, as the map says it.
          <text className="mg-sub" data-can={c.id} x={c.x} y={c.y + look.subDy} fontSize={look.sub} data-off={SEALED.has(c.id) ? '' : undefined}>
            Can read
          </text>
        )}
      />
      {links.map((l, i) => (
        <path key={i} className="mg-link" d={l.d} data-link-into={l.into} data-off="" />
      ))}
      {look.counties
        .filter((c) => SEALED.has(c.id))
        .map((c) => (
          <g key={c.id}>
            <g className="mg-sealed o" data-seal={c.id}>
              <path className="mg-sealed-land" d={shapeOf(c.id)} />
              <path d={shapeOf(c.id)} fill={`url(#${hatch})`} />
              <path className="mg-sealed-edge" d={shapeOf(c.id)} />
            </g>
            <text className="mg-name mg-name-sealed" data-name-sealed={c.id} x={c.x} y={c.y} fontSize={look.name}>
              {c.name}
            </text>
            <text className="mg-sub mg-sub-sealed" data-cant={c.id} x={c.x} y={c.y + look.subDy} fontSize={look.sub}>
              Can't read
            </text>
            <g transform={`translate(${nameEnd(look, c) + look.wax * 0.75} ${c.y - look.name * 0.32})`}>
              <circle className="mg-impact" data-ring={c.id} r={look.wax * 0.5} data-off="" />
              <g className="mg-wax-drop" data-wax={c.id}>
                <Wax size={look.wax} />
              </g>
            </g>
          </g>
        ))}
      <g data-pill="">
        <rect className="mg-card-shadow" x={pillX} y={pillY + 1.5} width={pillW} height={pillH} rx={9} />
        <rect className="mg-card" x={pillX} y={pillY} width={pillW} height={pillH} rx={9} />
        {/* The reader's tool, as a monogram on its tile, the way the map shows a tool with no logo. */}
        <g transform={`translate(${pillX + 8 + markR} ${pillY + pillH / 2})`}>
          <Tile letter="C" size={markR * 2} />
        </g>
        <text x={pillX + 16 + markR * 2} y={pillY + pillH / 2 + pillText * 0.34} fontSize={pillText}>
          <tspan className="mg-soft">Seeing the map as </tspan>
          <tspan fontWeight={500}>Claude Code</tspan>
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

export default SealMotion
