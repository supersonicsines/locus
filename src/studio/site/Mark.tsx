// The Locus mark, Col, and the only place the site draws it. A summit, a lower knoll and the col between them,
// in contour: the col's own contour crosses itself at the pass, and the point sits on the crossing.
// The geometry is in `mark-paths.ts`, written from the workbench's export (`workbench/logo/col/`, where
// CONSTRUCTION.md gives the rules). Each size gets its own drawing, chosen by device pixels: below 26 the land
// with its point cut out, below 96 the land with the col's contour cut through it, then the contours themselves.
// The tile is ink on every page; on a dark page a 1 device px hairline of paper holds it off the ground.

import { useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { DRAWINGS, TILE } from './mark-paths'

const INK = '#15191e'
const PAPER = '#fcfdfd'

/** Device pixels per CSS pixel, kept current when a window moves to another screen. */
function useDpr(): number {
  return useSyncExternalStore(
    (next) => {
      if (typeof matchMedia !== 'function') return () => {}
      const q = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      q.addEventListener('change', next)
      return () => q.removeEventListener('change', next)
    },
    () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1),
    () => 1,
  )
}

/** Line weights in device px, as the construction sets them, turned into units of the 100-unit box at n device px. */
const units = (px: number, n: number) => (px * 100) / n
const cutPx = (n: number) => Math.min(3.2, Math.max(1.5, 0.9 + 0.035 * n))
const linePx = (name: string, n: number) => (name === 'M' ? 2.0 * (n / 96) ** 0.2 : 2.5 * (n / 280) ** 0.8)

export function Mark({ size = 24, animated = false, className, title }: { size?: number; animated?: boolean; className?: string; title?: string }) {
  const clip = `mark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const ref = useRef<SVGSVGElement>(null)
  const n = Math.max(1, Math.round(size * useDpr()))
  const d = [...DRAWINGS].reverse().find((x) => n >= x.from) ?? DRAWINGS[0]
  const line = units(linePx(d.name, n), n)

  // At the sizes the site uses the mark never grows (it grows only from 160 device px, in the workbench). It arrives
  // once, by fading in, as the header does.
  useLayoutEffect(() => {
    const svg = ref.current
    if (!animated || !svg || matchMedia('(prefers-reduced-motion: reduce)').matches || typeof svg.animate !== 'function') return
    const a = svg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 120, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' })
    return () => a.cancel()
  }, [animated])

  return (
    <svg
      ref={ref}
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={{ display: 'block', flex: 'none' }}
    >
      <defs>
        <clipPath id={clip}>
          <path d={TILE} />
        </clipPath>
      </defs>
      <path d={TILE} fill={INK} />
      {/* The hairline: the tile's own edge stroked in paper and clipped to the tile, so 1 device px shows inside it. Dark pages only. */}
      <path className="mark-edge" d={TILE} fill="none" stroke={PAPER} strokeOpacity={n <= 95 ? 0.24 : 0.16} strokeWidth={units(2, n)} clipPath={`url(#${clip})`} />
      {d.land && <path d={d.land} fill={PAPER} />}
      {d.cut && <path d={d.cut} fill="none" stroke={INK} strokeWidth={units(cutPx(n), n)} strokeLinecap="butt" />}
      {d.lines && (
        <g fill="none" stroke={PAPER} strokeWidth={line}>
          {d.lines.map((p, i) => (
            <path key={i} d={p} />
          ))}
        </g>
      )}
      {d.point && <circle cx={d.point.cx} cy={d.point.cy} r={d.point.r ?? 1.5 * line} fill={d.point.ink ? INK : PAPER} />}
    </svg>
  )
}
