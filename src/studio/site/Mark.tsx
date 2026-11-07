// The Locus mark, Col, and the only place the site draws it. A summit, a lower knoll and the col between them,
// in contour: the col's own contour crosses itself at the pass, and the point sits on the crossing.
// The geometry is in `mark-paths.ts`, written by `npm run brand` from the brand pack (`brand/logo/tiers.json`;
// `brand/logo/CONSTRUCTION.md` gives the rules). Each size gets its own drawing, chosen by device pixels: below 26 the land
// with its point cut out, below 48 the land with the col's contour cut through it, then the contours themselves.
// Black lines on a white tile on every page, weighted like a survey sheet: the contours fine, the col's own contour
// (the index) twice their width. On a light page a 1 device px ink hairline holds the tile off the ground.

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
/** A contour; the index is twice it, and the point 3¼ times the index across. */
const linePx = (n: number) => Math.max(1, 1.2 * (n / 256) ** 0.6)
const INDEX = 2
const POINT = 3.25

export function Mark({ size = 24, animated = false, className, title }: { size?: number; animated?: boolean; className?: string; title?: string }) {
  const clip = `mark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const ref = useRef<SVGSVGElement>(null)
  const n = Math.max(1, Math.round(size * useDpr()))
  const d = [...DRAWINGS].reverse().find((x) => n >= x.from) ?? DRAWINGS[0]
  const line = units(linePx(n), n)

  // At the sizes the site uses the mark is never drawn in (that plays only from 160 device px: brand/logo/motion/). It
  // arrives once, by fading in, as the header does.
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
      <path d={TILE} fill={PAPER} />
      {/* The hairline: the tile's own edge stroked in ink and clipped to the tile, so 1 device px shows inside it. Light pages only. */}
      <path className="mark-edge" d={TILE} fill="none" stroke={INK} strokeOpacity={n <= 95 ? 0.22 : 0.16} strokeWidth={units(2, n)} clipPath={`url(#${clip})`} />
      {d.land && <path d={d.land} fill={INK} />}
      {d.cut && <path d={d.cut} fill="none" stroke={PAPER} strokeWidth={units(cutPx(n), n)} strokeLinecap="butt" />}
      {(d.lines || d.index) && (
        <g fill="none" stroke={INK} strokeWidth={line} strokeLinecap="round">
          {d.lines?.map((p, i) => (
            <path key={i} d={p} />
          ))}
          {d.index && <path d={d.index} strokeWidth={INDEX * line} />}
        </g>
      )}
      {d.point && <circle cx={d.point.cx} cy={d.point.cy} r={d.point.r ?? (POINT / 2) * INDEX * line} fill={d.point.ink ? INK : PAPER} />}
    </svg>
  )
}
