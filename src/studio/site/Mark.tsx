// The Locus mark, and the only place it's drawn. A placeholder until the chosen variant replaces it: a squircle in ink, with a hill's
// contour lines in paper and a small point at its summit, the spot on the map where something is.

import { useId, useLayoutEffect, useRef } from 'react'

const TAU = Math.PI * 2

/** A superellipse filling the 100-unit box: the squircle every icon sits in. */
const SQUIRCLE = (() => {
  const n = 5
  const pts: string[] = []
  for (let i = 0; i < 96; i++) {
    const t = (i / 96) * TAU
    const c = Math.cos(t)
    const s = Math.sin(t)
    pts.push(`${(50 + 50 * Math.sign(c) * Math.abs(c) ** (2 / n)).toFixed(2)} ${(50 + 50 * Math.sign(s) * Math.abs(s) ** (2 / n)).toFixed(2)}`)
  }
  return `M${pts.join('L')}Z`
})()

/** A closed curve through these points, as cubic Béziers (Catmull-Rom), so a ring has no corners. */
function smoothLoop(pts: [number, number][]): string {
  const n = pts.length
  const at = (i: number) => pts[(i + n) % n]
  let d = `M${at(0)[0].toFixed(2)} ${at(0)[1].toFixed(2)}`
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
  }
  return `${d}Z`
}

const SUMMIT: [number, number] = [61, 39]

/** One contour of the hill: a ridge running down to the lower left, so each wider ring leans further down the slope, as a real hill's do. */
function ring(r: number, k: number): string {
  const cx = SUMMIT[0] - k * 5.2
  const cy = SUMMIT[1] + k * 5.6
  const tilt = -0.55
  const pts: [number, number][] = []
  for (let i = 0; i < 44; i++) {
    const t = (i / 44) * TAU
    const rr = r * (1 + 0.13 * Math.sin(2 * t + 0.9 + k * 0.45) + 0.06 * Math.sin(3 * t + 2.3 - k * 0.5) + 0.025 * Math.sin(5 * t + k))
    const x = Math.cos(t) * rr * 1.16
    const y = Math.sin(t) * rr * 0.86
    pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)])
  }
  return smoothLoop(pts)
}

/** The rings at each size. A small mark has fewer, so its lines never close up. The widest runs off the edge: the map goes on. */
const TIERS = {
  small: [ring(15, 0.6), ring(33, 1.8)],
  medium: [ring(11, 0.4), ring(24, 1.4), ring(39, 2.5)],
  large: [ring(9, 0.3), ring(19.5, 1.1), ring(31, 2), ring(45, 3)],
}

export function Mark({ size = 24, animated = false, className, title }: { size?: number; animated?: boolean; className?: string; title?: string }) {
  const clip = `mark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const ref = useRef<SVGSVGElement>(null)
  const rings = size <= 24 ? TIERS.small : size <= 48 ? TIERS.medium : TIERS.large
  // Lines at least a pixel wide at any size, and a little under three units wide when large.
  const stroke = (Math.max(1.15, size * 0.03) * 100) / size
  const point = Math.max(3.4, (1.5 * 100) / size)

  // The rings come up from the summit outward, and the point lands last. Once, as the mark arrives.
  useLayoutEffect(() => {
    const svg = ref.current
    if (!animated || !svg || matchMedia('(prefers-reduced-motion: reduce)').matches || typeof svg.animate !== 'function') return
    const parts = [...svg.querySelectorAll<SVGElement>('[data-ring]')]
    const anims = parts.map((el, i) =>
      el.animate(
        [
          { opacity: 0, transform: 'scale(0.82)' },
          { opacity: Number(el.style.opacity || 1), transform: 'scale(1)' },
        ],
        { duration: 760, delay: 140 + i * 130, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' },
      ),
    )
    const dot = svg.querySelector<SVGElement>('[data-point]')
    if (dot) anims.push(dot.animate([{ opacity: 0, transform: 'scale(2.4)' }, { opacity: 1, transform: 'scale(0.9)', offset: 0.7 }, { opacity: 1, transform: 'scale(1)' }], { duration: 420, delay: 140 + parts.length * 130 + 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' }))
    return () => anims.forEach((a) => a.cancel())
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
      style={{ display: 'block', flex: 'none', overflow: 'visible' }}
    >
      <defs>
        <clipPath id={clip}>
          <path d={SQUIRCLE} />
        </clipPath>
      </defs>
      <path d={SQUIRCLE} style={{ fill: 'var(--ink)' }} />
      <g clipPath={`url(#${clip})`} style={{ fill: 'none', stroke: 'var(--on-ink)', strokeWidth: stroke }}>
        {rings.map((d, i) => (
          <path key={i} d={d} data-ring="" style={{ opacity: 0.94 - i * 0.08, transformOrigin: `${SUMMIT[0]}px ${SUMMIT[1]}px` }} />
        ))}
      </g>
      <circle data-point="" cx={SUMMIT[0]} cy={SUMMIT[1]} r={point} style={{ fill: 'var(--on-ink)', transformOrigin: `${SUMMIT[0]}px ${SUMMIT[1]}px` }} />
    </svg>
  )
}
