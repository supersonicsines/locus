// The one screen. Everything floats over the map.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toCheck } from '../core/money.ts'
import { levelOf, needs, sortNeeds, type NeedLevel } from '../core/status.ts'
import { dismissToast, loadSample, movePiece, newMap, openVault, refreshServer, toggleGateOnPassword, unlockViewer } from './actions.ts'
import { loadLogos } from './logos/store.ts'
import { MapView, type Palette } from './map/MapView.ts'
import { readerColour } from './map/symbols.ts'
import { getState, setState, storage, useStore } from './store.ts'
import { useEscape } from './ui/bits.tsx'
import { BottomRight, Cartouche } from './ui/Bottom.tsx'
import { CommandK } from './ui/CommandK.tsx'
import { contentOf, exposedAreas, pricesReadableIn, readersByArea } from './ui/data.ts'
import { AreaPanel } from './ui/Area.tsx'
import { Left } from './ui/Left.tsx'
import { Peek } from './ui/Peek.tsx'
import { AgentView, SharePanel } from './ui/Share.tsx'
import { Sheets, ShredStrip } from './ui/Sheets.tsx'
import { NeedsPanel, StatusLine, TopRight } from './ui/Top.tsx'

const PALETTES: Record<'light' | 'dark', Palette> = {
  light: {
    paper: '#eef1f3',
    liveSea: '#d6e4ef',
    land: '#fcfdfd',
    sealedLand: '#fcf1ee',
    exposedLand: '#fdf3d4',
    alert: '#f5b400',
    alertRGB: '245,180,0',
    onAlert: '#15191e',
    ink: '#15191e',
    inkRGB: '21,25,30',
    paperRGB: '243,245,246',
    vermilion: '#d63c27',
    vermilionRGB: '214,60,39',
    waxShadow: 'rgba(90,18,10,0.55)',
    waxHighlight: 'rgba(255,214,200,0.75)',
    dark: false,
  },
  dark: {
    paper: '#0e1319',
    liveSea: '#0c1c2c',
    land: '#171d25',
    sealedLand: '#2a1d1e',
    exposedLand: '#2e2815',
    alert: '#f5b400',
    alertRGB: '245,180,0',
    onAlert: '#15191e',
    ink: '#e8e6df',
    inkRGB: '232,230,223',
    paperRGB: '14,19,25',
    vermilion: '#ea5a44',
    vermilionRGB: '234,90,68',
    waxShadow: 'rgba(40,6,2,0.8)',
    waxHighlight: 'rgba(255,214,200,0.7)',
    dark: true,
  },
}

function MapSurface({ map }: { map: React.RefObject<MapView | null> }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useLayoutEffect(() => {
    const canvas = ref.current!
    const view = new MapView(canvas, {
      select: (id) => setState({ selected: id }),
      gateClick: (gate) => {
        const lens = getState().lens
        if (lens) toggleGateOnPassword(lens, gate)
      },
      areaClick: (gate) => {
        const s = getState()
        if (gate) setState({ area: gate, panel: 'area', highlight: null })
        else if (s.panel === 'area') setState({ area: null, panel: null })
      },
      gateHover: (gate) => setState({ hoverGate: gate }),
      pieceMoved: (id, x, y, gate) => movePiece(id, x, y, gate),
      cameraChanged: (k, fitK) => {
        const s = getState()
        if (s.zoom !== k || s.fitZoom !== fitK) setState({ zoom: k, fitZoom: fitK })
      },
    })
    map.current = view
    view.setPalette(PALETTES[getState().theme])

    const size = () => view.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2.5))
    size()
    window.addEventListener('resize', size)
    void document.fonts?.ready.then(() => view.fontsReady())
    return () => {
      window.removeEventListener('resize', size)
      view.destroy()
      map.current = null
    }
  }, [map])

  const theme = useStore((s) => s.theme)
  const vault = useStore((s) => s.vault)
  const view = useStore((s) => s.view)
  const selected = useStore((s) => s.selected)
  const lens = useStore((s) => s.lens)
  const area = useStore((s) => s.area)
  const highlight = useStore((s) => s.highlight)
  const hoverGate = useStore((s) => s.hoverGate)
  const dollars = useStore((s) => s.dollars)
  const style = useStore((s) => s.dollarStyle)
  const period = useStore((s) => s.period)

  useEffect(() => map.current?.setPalette(PALETTES[theme]), [theme, map])

  // The loudest need on an item decides how it looks, so the worst come last and overwrite the rest.
  const flagged = useMemo(() => {
    const out = new Map<string, NeedLevel>()
    if (!vault) return out
    for (const n of sortNeeds(needs(vault)).reverse()) for (const id of n.pieces) out.set(id, levelOf(n.kind))
    return out
  }, [vault])

  const exposed = useMemo(() => exposedAreas(vault), [vault])
  const pricesReadable = useMemo(() => pricesReadableIn(vault, lens), [vault, lens])
  const live = !!view || (!!vault?.published && !!vault.site)
  const readerColours = useMemo(() => new Map((vault?.passwords ?? []).map((p, i) => [p.name, readerColour(i)])), [vault])

  const readers = useMemo(() => readersByArea(vault), [vault])

  const sealedToAll = useMemo(() => {
    if (!vault || !vault.passwords.length) return new Set<string>()
    return new Set(vault.gates.filter((g) => !readers.has(g.id)).map((g) => g.id))
  }, [vault, readers])

  const priceChecks = useMemo(() => {
    const costs = view?.costs ?? vault?.costs ?? []
    return new Set(toCheck(costs).map((c) => c.piece))
  }, [vault, view])

  useEffect(() => {
    const c = contentOf({ vault, view })
    map.current?.setData({
      gates: c?.gates ?? [],
      pieces: c?.pieces ?? [],
      links: c?.links ?? [],
      costs: c?.costs ?? null,
      currency: c?.currency ?? 'USD',
      flagged,
      exposed,
      pricesReadable,
      live,
      priceChecks,
      sealedToAll,
      readers,
      readerColours,
      readOnly: c?.readOnly ?? false,
    })
  }, [vault, view, flagged, exposed, pricesReadable, live, priceChecks, sealedToAll, readers, readerColours, map])

  const panel = useStore((s) => s.panel)
  const rightOpen = panel === 'share'
  useEffect(() => map.current?.setRightInset(rightOpen && window.innerWidth > 720 ? 396 : 28), [rightOpen, map])

  useEffect(() => map.current?.setSelected(selected), [selected, map])
  useEffect(() => map.current?.setHighlight(highlight), [highlight, map])
  useEffect(() => map.current?.setGateHover(hoverGate), [hoverGate, map])
  useEffect(() => map.current?.setActiveArea(panel === 'area' ? area : null), [panel, area, map])
  useEffect(() => map.current?.setDollars(dollars, style, period), [dollars, style, period, map])

  // Picking a password is about the whole map, wherever you'd zoomed to.
  const hasLens = !!lens
  useEffect(() => {
    if (hasLens) map.current?.fit(true)
  }, [hasLens, map])

  useEffect(() => {
    if (!vault || !lens) {
      map.current?.setLens(null)
      return
    }
    const pw = vault.passwords.find((p) => p.id === lens)
    if (!pw) {
      map.current?.setLens(null)
      return
    }
    const before = vault.published?.passwords[pw.id] ?? []
    map.current?.setLens(
      new Set(vault.gates.filter((g) => !pw.gates.includes(g.id)).map((g) => g.id)),
      new Set(before.filter((g) => !pw.gates.includes(g))),
    )
  }, [vault, lens, map])

  return <canvas ref={ref} className="map-canvas" tabIndex={-1} aria-hidden="true" />
}

function FirstRun() {
  const server = useStore((s) => s.server)
  const input = useRef<HTMLInputElement>(null)
  const accounts = server?.accounts
  return (
    <div className="empty">
      <div className="empty-word">Vadere</div>
      <h1>Teach your AI tools about your company.</h1>
      <p><span>Drop in your documents: brand book, contracts, specs, invoices.</span> <span>They become one map, and you choose which parts each AI tool or person can read.</span></p>
      <div className="empty-actions">
        <button className="btn btn-ink" onClick={() => input.current?.click()}>Choose files</button>
        <button className="btn btn-paper" onClick={() => void loadSample()}>See an example</button>
      </div>
      <div className="empty-note">Nothing leaves this device until you say so.</div>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          if (files.length) void startWith(files)
          e.target.value = ''
        }}
      />
      <div className="empty-foot">
        <button onClick={() => setState({ sheet: { kind: 'signin' } })}>Already have a map? Sign in</button>
        {accounts && (
          <span>
            Free while there's room: {accounts.used} of {accounts.max} accounts taken.
          </span>
        )}
        {(server?.mode === 'hosted' || server?.donateUrl) && <button onClick={() => setState({ sheet: { kind: 'donate' } })}>Donate</button>}
      </div>
    </div>
  )
}

function BlankMap() {
  return (
    <div className="empty blank">
      <h1>Drop your files anywhere.</h1>
      <p>Brand book, contracts, specs, invoices. They become this map.</p>
      <div className="empty-actions">
        <button className="btn btn-ink" onClick={() => document.getElementById('add-files')?.click()}>Choose files</button>
      </div>
    </div>
  )
}

async function startWith(files: File[]) {
  if (!getState().vault) await newMap()
  setState({ sheet: { kind: 'shred', files } })
}

function Locked({ name }: { name: string }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    setError('')
    const err = await unlockViewer(name, key)
    setBusy(false)
    if (err) setError(err)
  }
  return (
    <div className="lock">
      <form
        className="lock-card"
        onSubmit={(e) => {
          e.preventDefault()
          void go()
        }}
      >
        <div className="lock-inner">
          <img src="/favicon.svg" width="40" height="40" alt="" />
          <h1>{name}</h1>
          <p>This map is encrypted. A password opens the parts it's allowed to.</p>
          <input className="field mono" autoFocus placeholder="vdr_" aria-label="Password" spellCheck={false} autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
          <button className="btn btn-ink" disabled={!key.trim() || busy}>{busy ? 'Opening' : 'Open'}</button>
          <div className="lock-error" role="alert">{error}</div>
          <p className="lock-note">It decrypts in this browser. The host only stores the encrypted copy. If you're an AI agent, ask your user for the password and read /llms.txt.</p>
        </div>
      </form>
    </div>
  )
}

function Toasts() {
  const toasts = useStore((s) => s.toasts)
  if (!toasts.length) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <span>{t.message}</span>
          {t.action && <button onClick={() => { t.action!.run(); dismissToast(t.id) }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  )
}

function Chrome({ map }: { map: React.RefObject<MapView | null> }) {
  const panel = useStore((s) => s.panel)
  const selected = useStore((s) => s.selected)
  const uiHidden = useStore((s) => s.uiHidden)
  const view = useStore((s) => s.view)
  const vault = useStore((s) => s.vault)

  if (uiHidden) return null
  return (
    <>
      <div className="left-col">
        <Left />
        <Cartouche />
      </div>
      <div className="top-bar">
        <div className="status-slot">
          <StatusLine />
          {panel === 'needs' && !view && <NeedsPanel map={map} />}
        </div>
        <TopRight />
      </div>
      <BottomRight map={map} />
      {panel === 'share' && vault && <SharePanel />}
      {panel === 'share' && <AgentView />}
      {panel === 'area' && <AreaPanel />}
      {selected && <Peek />}
    </>
  )
}

export function App() {
  const mode = useStore((s) => s.mode)
  const vault = useStore((s) => s.vault)
  const view = useStore((s) => s.view)
  const siteName = useStore((s) => s.siteName)
  const cmdk = useStore((s) => s.cmdk)
  const map = useRef<MapView | null>(null)
  const [dropping, setDropping] = useState(false)
  const depth = useRef(0)

  useEffect(() => {
    document.documentElement.dataset.theme = getState().theme
    void (async () => {
      await refreshServer()
      const server = getState().server
      const pathSite = location.pathname.match(/^\/s\/([a-z0-9-]+)/)?.[1]
      const site = pathSite ?? server?.site ?? null
      if (site) {
        setState({ mode: 'locked', siteName: site })
        // A link can carry the password in its fragment, which never reaches the host.
        const key = location.hash.match(/key=(vdr_[0-9a-z]+)/)?.[1]
        if (key) {
          history.replaceState(null, '', location.pathname)
          await unlockViewer(site, key)
        }
        return
      }
      const savedKey = await storage.get<string>('claudeKey')
      if (savedKey) setState({ claudeKey: savedKey })
      const all = await storage.vaults()
      const last = await storage.get<string>('lastVault')
      const v = all.find((x) => x.id === last) ?? all[0]
      if (v) await openVault(v)
      setState({ mode: 'studio', vaultList: all.map((x) => ({ id: x.id, name: x.company.name, sample: x.sample })) })
      if (new URLSearchParams(location.search).get('sample') !== null && !v) await loadSample()
    })()
  }, [])

  // Keyboard, in Figma's and Notion's vocabulary.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable
      const s = getState()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setState({ cmdk: !s.cmdk })
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        setState({ uiHidden: !s.uiHidden })
        return
      }
      if (typing) return
      if (s.mode !== 'studio' && s.mode !== 'viewer') return
      if (e.key === '$') setState({ dollars: !s.dollars })
      else if (e.shiftKey && (e.key === '!' || e.code === 'Digit1')) map.current?.fit()
      else if (e.key === '+' || e.key === '=') map.current?.zoomBy(1.3)
      else if (e.key === '-') map.current?.zoomBy(1 / 1.3)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  // Dropping files anywhere on the map.
  useEffect(() => {
    if (mode !== 'studio') return
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      depth.current++
      setDropping(true)
    }
    const over = (e: DragEvent) => e.preventDefault()
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1)
      if (!depth.current) setDropping(false)
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      depth.current = 0
      setDropping(false)
      const files = [...(e.dataTransfer?.files ?? [])]
      if (files.length) void startWith(files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [mode])

  useEscape(() => {
    const s = getState()
    if (s.highlight) setState({ highlight: null })
  })

  const hasMap = !!vault || !!view

  // One file, whatever the map holds, and only once there's a map to show.
  useEffect(() => {
    if (hasMap) loadLogos()
  }, [hasMap])

  return (
    <>
      <MapSurface map={map} />
      {mode === 'locked' && siteName && <Locked name={siteName} />}
      {mode === 'studio' && !vault && <FirstRun />}
      {mode === 'studio' && vault && !vault.pieces.length && <BlankMap />}
      <input
        id="add-files"
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          if (files.length) void startWith(files)
          e.target.value = ''
        }}
      />
      {(mode === 'studio' || mode === 'viewer') && hasMap && <Chrome map={map} />}
      {cmdk && hasMap && <CommandK map={map} />}
      <Sheets />
      <ShredStrip />
      <Toasts />
      {dropping && <div className="drop-hint">Drop to add to the map</div>}
    </>
  )
}
