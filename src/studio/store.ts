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
}

export type Sheet =
  | null
  | { kind: 'publish' }
  | { kind: 'signin' }
  | { kind: 'donate' }
  | { kind: 'owner-key' }
  | { kind: 'shred'; files: File[]; error?: string }
  | { kind: 'add-service' }
  | { kind: 'confirm-delete' }
  | { kind: 'rename' }

export type Panel = null | 'share' | 'needs' | 'area'

export interface Toast {
  id: number
  message: string
  action?: { label: string; run: () => void }
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
  vaultList: { id: string; name: string; sample?: boolean }[]
  view: View | null
  siteName: string | null
  server: ServerInfo | null
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
  theme: 'light' | 'dark'
  toasts: Toast[]
  shred: ShredProgress | null
  publishing: boolean
  /** Why the password in a link didn't open the map. */
  lockError: string
  zoom: number
  fitZoom: number
  /** Goes up when something has changed the map enough that it should be seen whole. */
  fitAsk: number
  claudeKey: string
  /** Whether that key is saved in this browser, and not only held in memory for this session. */
  claudeKeySaved: boolean
  claudeModel: string
}

function initialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('vadere-theme')
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
  theme: initialTheme(),
  toasts: [],
  shred: null,
  publishing: false,
  lockError: '',
  zoom: 1,
  fitZoom: 1,
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

const DB = 'vadere'
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
