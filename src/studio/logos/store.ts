// The logo bundle at runtime.
//
// Which services a company uses is sealed data, so nothing here can tell the host anything about it. All
// logos come as one same-origin file, fetched whole, whatever the map holds, only once a map is open. There's
// no per-logo request, no third-party request, and no logo in anything an agent reads. Until the file
// arrives, or if it never does, services show monograms and everything works.

import { useSyncExternalStore } from 'react'
import bundleUrl from './logos.bundle.json?url'
import { buildIndex, fromRows, resolveService, type BundleRow, type KnownService } from './lookup.ts'

// One tile, in fractions of its size, shared by the map and the panels so they can't drift.
export const TILE_RADIUS = 0.235
export const TILE_PADDING = 0.15

let services: KnownService[] = []
let index = new Map<string, KnownService>()
let version = 0
let started = false
const listeners = new Set<() => void>()
const sources = new Map<string, string>()

/** Starts the one request. Calling it again does nothing. */
export function loadLogos() {
  if (started) return
  started = true
  void (async () => {
    try {
      const res = await fetch(bundleUrl, { credentials: 'same-origin' })
      if (!res.ok) return
      const bundle = (await res.json()) as { v: number; services: BundleRow[] }
      if (bundle.v !== 1 || !Array.isArray(bundle.services)) return
      services = fromRows(bundle.services)
      index = buildIndex(services)
      version++
      listeners.forEach((l) => l())
    } catch {
      // Monograms it is. The page doesn't need logos to work.
    }
  })()
}

export function serviceFor(name: unknown): KnownService | undefined {
  return resolveService(index, name)
}

export function allServices(): KnownService[] {
  return services
}

export function logoSource(service: KnownService): string | null {
  if (!service.svg) return null
  let src = sources.get(service.id)
  if (!src) {
    src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(service.svg)}`
    sources.set(service.id, src)
  }
  return src
}

export function onLogosLoaded(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Re-renders a component when the logos arrive. */
export function useLogosVersion(): number {
  return useSyncExternalStore(onLogosLoaded, () => version)
}
