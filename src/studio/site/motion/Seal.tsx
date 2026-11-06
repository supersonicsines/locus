// Who reads what. Pick a reader and the map shows what they can see; press an area and it seals: its land turns vermilion-pink, its edge
// wears the colour, what's on it goes, the links into it fade, and the wax lands. The product's one memorable moment, so it's given room.

import { $, $$, COUNTIES, enter, EASE, EASE_IN_OUT, GLIDE, Hatches, Island, nameEnd, NAME_SIZE, Plate, Pointer, Sea, shapeOf, swap, track, useMotion, useSvgId, Wax, type Key } from './kit.tsx'

const CYCLE = 10200
const BACK = 8300
/** Pressed, in order, and when. */
const PRESSES = [
  { id: 'legal', at: 2050, tip: [156, 250] as const },
  { id: 'money', at: 3650, tip: [408, 262] as const },
]
const SEALED = new Set(PRESSES.map((p) => p.id))
const WAX = 15

/** Links that cross between areas, as the map draws them. The ones into a sealed area fade with it. */
const LINKS = [
  { into: 'legal', d: 'M108 151 C 126 172, 134 205, 150 226' },
  { into: 'money', d: 'M412 149 C 418 175, 410 205, 402 226' },
]

export function SealMotion() {
  const hatch = useSvgId('sealed')
  const ref = useMotion<SVGSVGElement>((root) => {
    const parts: (Animation | null)[] = []
    // Picking the reader: the line that says whose view this is, and what each area lets them read.
    parts.push(enter($(root, '[data-pill]'), CYCLE, 250, 520, { opacity: 0, transform: 'translate(0px, -8px)' }, BACK))
    for (const c of COUNTIES) {
      const can = $(root, `[data-can="${c.id}"]`)
      const press = PRESSES.find((p) => p.id === c.id)
      if (!press) parts.push(enter(can, CYCLE, 520, 420, { opacity: 0, transform: 'translate(0px, 3px)' }, BACK))
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

    // Each press seals its area.
    for (const p of PRESSES) {
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
    const [a, b] = PRESSES
    parts.push(
      track(
        $(root, '[data-pointer]'),
        [
          { at: 0, opacity: 0, transform: at(292, 274) },
          { at: 760, opacity: 0, transform: at(292, 274) },
          { at: 1060, opacity: 1, transform: at(286, 268), ease: GLIDE },
          { at: a.at - 120, opacity: 1, transform: at(a.tip[0], a.tip[1]) },
          { at: a.at + 520, opacity: 1, transform: at(a.tip[0], a.tip[1]), ease: GLIDE },
          { at: b.at - 120, opacity: 1, transform: at(b.tip[0], b.tip[1]) },
          { at: b.at + 700, opacity: 1, transform: at(b.tip[0], b.tip[1]), ease: EASE_IN_OUT },
          { at: b.at + 1100, opacity: 0, transform: at(b.tip[0] + 8, b.tip[1] + 10) },
          { at: CYCLE, opacity: 0, transform: at(292, 274) },
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
  })

  return (
    <Plate reff={ref} name="seal" label="Seeing the map as one reader. Pressing Legal and then Money seals them: each turns vermilion, what's on it goes, and a wax seal lands on it.">
      <Hatches sealed={hatch} />
      <Sea />
      <Island
        off={SEALED}
        extra={(c) => (
          // What this reader can read, said under each name, as the map says it.
          <text className="mg-sub" data-can={c.id} x={c.x} y={c.y + 13} fontSize={9} data-off={SEALED.has(c.id) ? '' : undefined}>
            Can read
          </text>
        )}
      />
      {LINKS.map((l, i) => (
        <path key={i} className="mg-link" d={l.d} data-link-into={l.into || undefined} data-off={l.into ? '' : undefined} />
      ))}
      {COUNTIES.filter((c) => SEALED.has(c.id)).map((c) => (
        <g key={c.id}>
          <g className="mg-sealed o" data-seal={c.id}>
            <path className="mg-sealed-land" d={shapeOf(c.id)} />
            <path d={shapeOf(c.id)} fill={`url(#${hatch})`} />
            <path className="mg-sealed-edge" d={shapeOf(c.id)} />
          </g>
          <text className="mg-name mg-name-sealed" data-name-sealed={c.id} x={c.x} y={c.y} fontSize={NAME_SIZE}>
            {c.name}
          </text>
          <text className="mg-sub mg-sub-sealed" data-cant={c.id} x={c.x} y={c.y + 13} fontSize={9}>
            Can't read
          </text>
          <g transform={`translate(${nameEnd(c) + 11} ${c.y - 4.6})`}>
            <circle className="mg-impact" data-ring={c.id} r={WAX * 0.5} data-off="" />
            <g className="mg-wax-drop" data-wax={c.id}>
              <Wax size={WAX} />
            </g>
          </g>
        </g>
      ))}
      <g data-pill="">
        <rect className="mg-card-shadow" x={114} y={13.5} width={252} height={26} rx={9} />
        <rect className="mg-card" x={114} y={12} width={252} height={26} rx={9} />
        <circle cx={130} cy={25} r={7} className="mg-reader" />
        <text className="mg-reader-l" x={130} y={28.1} fontSize={8.2} textAnchor="middle">
          D
        </text>
        <text x={143} y={28.2} fontSize={9.4}>
          <tspan className="mg-soft">Seeing the map as </tspan>
          <tspan fontWeight={500}>Design contractor</tspan>
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

export default SealMotion
