// App state: a tiny store, plus saving to this browser.
// Nothing here talks to any server. Publishing is explicit, in actions.ts.

import { useSyncExternalStore } from 'react'
import type { MoneyPeriod } from '../core/money.ts'
import type { Vault, View } from '../core/types.ts'
import type { DollarStyle } from './map/MapView.ts'

export interface ServerInfo {
  version: string
  mode: 'hosted' | 'self'
  address: string
  site: string | null
  accounts: { used: number; max: number } | null
  donateUrl: string
  abuseContact: string
  powBits: number
  maxBundleBytes: number
  /** Whether signing in with Google works here. Older hosts don't say. */
  google?: boolean
  /** Whether a new address on this host needs a Google account. */
  signinToClaim?: boolean
  /** How many addresses one Google account can take, when it needs one. */
  mapsPerAccount?: number | null
}

/** Who this browser is signed in to the host as, with Google. The host only knows a keyed hash; the name and email come from this browser's own cookie. */
export interface Me {
  signedIn: boolean
  name?: string
  email?: string
  /** The addresses this account took on this host. */
  maps?: string[]
}

/** What was typed in the publish sheet before going to sign in with Google, so it comes back as it was. */
export interface PublishDraft {
  company: string
  name: string
  touched: boolean
  ownerKey?: string
  saved?: boolean
}

export type Sheet =
  | null
  | { kind: 'publish'; draft?: PublishDraft; signinFailed?: string }
  | { kind: 'signin'; signinFailed?: string }
  | { kind: 'donate' }
  | { kind: 'owner-key' }
  | { kind: 'shred'; files: File[]; error?: string; fromSample?: boolean }
  | { kind: 'add-service' }
  | { kind: 'confirm-delete' }
  | { kind: 'rename' }

export type Panel = null | 'share' | 'needs' | 'area'

export interface Toast {
  id: number
  message: string
  action?: { label: string; run: () => void }
  /** About how things stand right now, so it goes once they've changed. */
  status?: boolean
  /** Says what the next update will do, so it goes once that's happened. */
  untilUpdate?: boolean
  /** When it was said, so something opening can tell what was said before it from what was said about it. */
  at?: number
}

export interface ShredProgress {
  phase: string
  done: number
  total: number
  pieces: number
  usage?: { input: number; output: number; cost: number }
}

export interface State {
  mode: 'loading' | 'studio' | 'viewer' | 'locked'
  vault: Vault | null
  vaultList: { id: string; name: string; sample?: boolean; items?: number }[]
  view: View | null
  siteName: string | null
  server: ServerInfo | null
  /** Null until the host has said. */
  me: Me | null
  selected: string | null
  /** The reader whose view of the map is showing. */
  lens: string | null
  /** The area open in the side panel. */
  area: string | null
  highlight: Set<string> | null
  hoverGate: string | null
  dollars: boolean
  dollarStyle: DollarStyle
  period: MoneyPeriod
  panel: Panel
  sheet: Sheet
  agentView: boolean
  cmdk: boolean
  uiHidden: boolean
  /** The card is open over the map in a narrow window, so the map makes room for it. */
  cardOpen: boolean
  theme: 'light' | 'dark'
  toasts: Toast[]
  shred: ShredProgress | null
  publishing: boolean
  /** Why the password in a link didn't open the map. */
  lockError: string
  zoom: number
  fitZoom: number
  /** Whether someone has moved the map from where it fits itself. */
  mapMoved: boolean
  /** Goes up when something has changed the map enough that it should be seen whole. */
  fitAsk: number
  claudeKey: string
  /** Whether that key is saved in this browser, and not only held in memory for this session. */
  claudeKeySaved: boolean
  claudeModel: string
}

function initialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('locus-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {}
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

let state: State = {
  mode: 'loading',
  vault: null,
  vaultList: [],
  view: null,
  siteName: null,
  server: null,
  me: null,
  selected: null,
  lens: null,
  area: null,
  highlight: null,
  hoverGate: null,
  dollars: false,
  dollarStyle: new URLSearchParams(location.search).get('style') === 'soundings' ? 'soundings' : 'towns',
  period: 'month',
  panel: null,
  sheet: null,
  agentView: false,
  cmdk: false,
  uiHidden: false,
  cardOpen: false,
  theme: initialTheme(),
  toasts: [],
  shred: null,
  publishing: false,
  lockError: '',
  zoom: 1,
  fitZoom: 1,
  mapMoved: false,
  fitAsk: 0,
  claudeKey: '',
  claudeKeySaved: false,
  claudeModel: 'claude-opus-5-5',
}

const listeners = new Set<() => void>()

export function getState(): State {
  return state
}

export function setState(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

/** Runs once the state passes `ready`: now, or at the first change that makes it so. */
export function once(ready: (s: State) => boolean, run: () => void) {
  if (ready(state)) return run()
  const check = () => {
    if (!ready(state)) return
    listeners.delete(check)
    run()
  }
  listeners.add(check)
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => select(state),
  )
}

// Saving, to IndexedDB in this browser.

const DB = 'locus'
let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB, 1)
      open.onupgradeneeded = () => {
        open.result.createObjectStore('vaults', { keyPath: 'id' })
        open.result.createObjectStore('settings')
      }
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
  }
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = run(d.transaction(store, mode).objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export const storage = {
  vaults: () => tx<Vault[]>('vaults', 'readonly', (s) => s.getAll()).catch(() => [] as Vault[]),
  saveVault: (v: Vault) => tx('vaults', 'readwrite', (s) => s.put(v)).catch(() => undefined),
  deleteVault: (id: string) => tx('vaults', 'readwrite', (s) => s.delete(id)).catch(() => undefined),
  get: <T,>(key: string) => tx<T>('settings', 'readonly', (s) => s.get(key)).catch(() => undefined),
  set: (key: string, value: unknown) => tx('settings', 'readwrite', (s) => s.put(value, key)).catch(() => undefined),
  remove: (key: string) => tx('settings', 'readwrite', (s) => s.delete(key)).catch(() => undefined),
}
