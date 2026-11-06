// Where the page is: the website at /, the first steps at /start, your own map at /map, and the sample at /example.
// The History API and nothing else. Reader addresses (/s/<name>/ and a site's own host) never get this far: App shows them the locked page.

import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'
import { loadSample, openVault, signinTrouble } from '../actions.ts'
import { getState, storage } from '../store.ts'

export type Route = 'home' | 'start' | 'map' | 'example'

const PATHS: Record<string, Route> = { '/': 'home', '/start': 'start', '/map': 'map', '/example': 'example' }
const clean = (pathname: string) => pathname.replace(/\/+$/, '') || '/'

export function routeOf(pathname = location.pathname): Route {
  return PATHS[clean(pathname)] ?? 'home'
}

/** The Studio's own pages, where the map is the app. The others are pages that scroll. */
export const isStudio = (r: Route) => r === 'map' || r === 'example'

/** What the address said when the page loaded, before anything tidied it. Google's answer arrives in it. */
const bootQuery = new URLSearchParams(location.search)

// Each entry in the history has a number, and leaving it keeps how far it was scrolled, so Back lands where you were.
const numberOf = (state: unknown) => (state && typeof state === 'object' && typeof (state as { locus?: unknown }).locus === 'number' ? (state as { locus: number }).locus : 0)
// Counted on from the time, so entries left in the history by an earlier load of the page keep numbers of their own.
let entries = Date.now()
let here = numberOf(history.state) || ++entries
const scrolled = new Map<number, number>()
try {
  history.scrollRestoration = 'manual'
} catch {}

const listeners = new Set<() => void>()
const tell = () => listeners.forEach((l) => l())
let started = false
let current: Route = routeOf()
let page = location.pathname + location.search

/** After the next paint, when the new page is there to scroll. */
const thenScroll = (top: number | null) =>
  requestAnimationFrame(() => {
    if (top !== null) window.scrollTo({ top, behavior: 'instant' })
    else if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView()
    else window.scrollTo({ top: 0, behavior: 'instant' })
  })

window.addEventListener('popstate', (e) => {
  scrolled.set(here, window.scrollY)
  here = numberOf(e.state)
  const now = location.pathname + location.search
  // Within the page, to a heading or back from one: go where that entry was, or to its heading.
  if (now === page) {
    tell()
    thenScroll(location.hash ? null : (scrolled.get(here) ?? 0))
    return
  }
  page = now
  const next = routeOf()
  const moved = next !== current
  current = next
  tell()
  if (started && moved) void arrive(next)
  thenScroll(scrolled.get(here) ?? 0)
})

/** Something to do on arriving instead of what the page does by itself. "Start your own map" makes a new one, for instance. */
let intent: (() => Promise<void>) | null = null

export function go(to: string, { replace = false, then }: { replace?: boolean; then?: () => Promise<void> } = {}) {
  scrolled.set(here, window.scrollY)
  if (!replace) here = ++entries
  if (replace) history.replaceState({ locus: here }, '', to)
  else history.pushState({ locus: here }, '', to)
  page = location.pathname + location.search
  const next = routeOf()
  const moved = next !== current
  current = next
  if (then) intent = then
  tell()
  if (!started) return
  if (moved || intent) void arrive(next)
  if (!replace) thenScroll(null)
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => current)
}

/** The address's query, so a step in the first steps follows Back and Forward. */
export function useSearch(): string {
  return useSyncExternalStore(subscribe, () => location.search)
}

/** A real link. With a modifier it opens a new tab as any link does; otherwise it moves without reloading. */
export function Link({ to, then, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; then?: () => Promise<void> }) {
  return (
    <a
      href={to}
      {...rest}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        go(to, { then })
      }}
    />
  )
}

// Arriving: the sample opens the sample, and /map opens your own map, or sends you to make one. Your own maps stay as they are either way.

let arriving = 0
let ticket = 0

/** While a page is opening its map, the map in hand is the one being left, so the address mustn't be made to match it. */
export const isArriving = () => arriving > 0

/** The same, for a component, which looks again once the page has finished opening. */
export function useArriving(): boolean {
  return useSyncExternalStore(subscribe, () => arriving > 0)
}

async function arrive(route: Route): Promise<void> {
  const mine = ++ticket
  const run = intent
  intent = null
  arriving++
  tell()
  try {
    if (run) {
      await run()
      return
    }
    if (route === 'example') {
      if (!getState().vault?.sample) await loadSample()
    } else if (route === 'map') {
      const v = getState().vault
      if (v && !v.sample) return
      const all = (await storage.vaults()).filter((x) => !x.sample)
      if (mine !== ticket) return
      if (!all.length) {
        go('/start', { replace: true })
        return
      }
      const last = await storage.get<string>('lastMap')
      const pick = all.find((x) => x.id === last) ?? [...all].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (mine === ticket) await openVault(pick)
    }
  } finally {
    arriving--
    // The map that opened may not be the one the address names, if someone moved on meanwhile. Say so to whoever's listening.
    tell()
  }
}

/** Why Google sent someone back without signing them in, when they went from the first steps. The account step says it, once. */
export let startTrouble = ''
export const clearStartTrouble = () => {
  startTrouble = ''
}

const FROM_START = 'locus-google-from-start'

/** A sign-in that fails comes back to the home page, and one begun in the first steps belongs back on their account step. */
export function leavingForGoogle() {
  try {
    sessionStorage.setItem(FROM_START, '1')
  } catch {}
}

/**
 * Called once the Studio knows this is its own host and not a reader's address. Tidies the address, then opens what it names, and
 * resolves once that's open, so a map is in hand before the Studio says it's ready (a return from Google reopens a sheet on it).
 */
export function startRouting(): Promise<void> {
  let fromStart = false
  try {
    fromStart = sessionStorage.getItem(FROM_START) === '1'
    sessionStorage.removeItem(FROM_START)
  } catch {}
  let to = location.pathname + location.search + location.hash
  if (fromStart && bootQuery.get('signin') === 'failed') {
    startTrouble = signinTrouble(bootQuery.get('why') ?? 'error')
    to = '/start?step=account'
  } else if (clean(location.pathname) === '/' && new URLSearchParams(location.search).has('sample')) {
    // The old way to the sample keeps working. Anything else in the query, such as ?style=, stays.
    const q = new URLSearchParams(location.search)
    q.delete('sample')
    to = `/example${q.toString() ? `?${q}` : ''}`
  } else if (!(clean(location.pathname) in PATHS)) {
    to = '/'
  }
  history.replaceState({ locus: here }, '', to)
  page = location.pathname + location.search
  started = true
  current = routeOf()
  tell()
  return arrive(current)
}

/** Whether the address is being followed yet. Before then, the map in hand says nothing about where the page is. */
export const routing = () => started

// Whether this browser has been through the first steps.

const ONBOARDED = 'locus-onboarded'

export function onboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED) === '1'
  } catch {
    return false
  }
}

export function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDED, '1')
  } catch {}
}
