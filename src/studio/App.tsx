// The one screen. Everything floats over the map.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toCheck } from '../core/money.ts'
import { levelOf, needs, pending, sortNeeds, type NeedKind, type NeedLevel } from '../core/status.ts'
import { clearPlainToasts, dismissToast, loadSample, movePiece, newMap, openVault, refreshServer, toggleGateOnPassword, unlockViewer } from './actions.ts'
import { loadLogos } from './logos/store.ts'
import { MapView, type Palette } from './map/MapView.ts'
import { readerColour } from './map/symbols.ts'
import { getState, setState, storage, useStore } from './store.ts'
import { NeedMark, ReaderMark, useEscape, useNarrow } from './ui/bits.tsx'
import { BottomRight, Cartouche } from './ui/Bottom.tsx'
import { CommandK } from './ui/CommandK.tsx'
import { areasOnMap, contentOf, exposedAreas, pricesReadableIn, readersByArea } from './ui/data.ts'
import { AreaPanel } from './ui/Area.tsx'
import { Left } from './ui/Left.tsx'
import { Peek } from './ui/Peek.tsx'
import { AgentView, SharePanel } from './ui/Share.tsx'
import { Sheets, ShredStrip } from './ui/Sheets.tsx'
import { NeedsPanel, StatusLine, stillOpenFor, TopRight } from './ui/Top.tsx'

const PALETTES: Record<'light' | 'dark', Palette> = {
  light: {
    paper: '#e2e6ea',
    liveSea: '#cbdfef',
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
    vermilionInk: '#c4351f',
    vermilionRGB: '214,60,39',
    waxShadow: 'rgba(90,18,10,0.55)',
    waxHighlight: 'rgba(255,214,200,0.75)',
    dark: false,
  },
  dark: {
    paper: '#0e1319',
    liveSea: '#0c1c2c',
    land: '#1a212a',
    sealedLand: '#2a1d1e',
    exposedLand: '#2e2815',
    alert: '#f5b400',
    alertRGB: '245,180,0',
    onAlert: '#15191e',
    ink: '#e8e6df',
    inkRGB: '232,230,223',
    paperRGB: '14,19,25',
    vermilion: '#ea5a44',
    vermilionInk: '#ea5a44',
    vermilionRGB: '234,90,68',
    waxShadow: 'rgba(40,6,2,0.8)',
    waxHighlight: 'rgba(255,214,200,0.7)',
    dark: true,
  },
}

const NEED_WORDS: Record<NeedKind, string> = {
  exposure: 'Still readable',
  secret: 'Secret to change',
  proposal: 'Waiting for your approval',
  conflict: 'Contradiction',
  gap: 'Missing',
  due: 'Coming up',
  stale: 'Out of date',
}

/** Point at an item with a mark on it and this says what the mark is about, so the mark doesn't need explaining anywhere else. */
function MapTip({ tip }: { tip: { id: string; x: number; y: number } | null }) {
  const vault = useStore((s) => s.vault)
  const selected = useStore((s) => s.selected)
  if (!tip || !vault || selected === tip.id) return null
  const need = sortNeeds(needs(vault)).find((n) => n.pieces.includes(tip.id))
  if (!need) return null
  // Beside the pointer, on whichever side has room.
  const style = { left: Math.min(tip.x + 14, window.innerWidth - 316), top: tip.y + 300 > window.innerHeight ? undefined : tip.y + 16, bottom: tip.y + 300 > window.innerHeight ? window.innerHeight - tip.y + 12 : undefined }
  return (
    <div className="map-tip panel" style={style} role="tooltip">
      <b>{NEED_WORDS[need.kind]}</b>
      {need.message}
    </div>
  )
}

function MapSurface({ map }: { map: React.RefObject<MapView | null> }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null)
  const tipTimer = useRef(0)

  useLayoutEffect(() => {
    const canvas = ref.current!
    // Read once and kept until something on the page changes, because the map asks for this on every frame it draws.
    let floatingOver: DOMRect[] | null = null
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
      // It waits for you to stop on something. A pointer on its way past shouldn't set off words.
      itemHover: (id, x, y) => {
        clearTimeout(tipTimer.current)
        if (!id) setTip(null)
        else tipTimer.current = window.setTimeout(() => setTip({ id, x, y }), 240)
      },
      pieceMoved: (id, x, y, gate) => movePiece(id, x, y, gate),
      cameraChanged: (k, fitK) => {
        const s = getState()
        const moved = view.moved
        if (s.zoom !== k || s.fitZoom !== fitK || s.mapMoved !== moved) setState({ zoom: k, fitZoom: fitK, mapMoved: moved })
      },
      covers: () => Array.from(document.querySelectorAll('.left-col > *'), (el) => el.getBoundingClientRect()),
      overlays: () => (floatingOver ??= Array.from(document.querySelectorAll('.left-col > *, .status.panel, .side, .top-right > *, .lens-sheet'), (el) => el.getBoundingClientRect())),
    })
    map.current = view
    view.setPalette(PALETTES[getState().theme])

    const size = () => {
      floatingOver = null
      view.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2.5))
    }
    size()
    window.addEventListener('resize', size)
    void document.fonts?.ready.then(() => view.fontsReady())
    // An area's name gives way to what's floating over it, so when something opens or closes, the map has to look again.
    const floating = new MutationObserver(() => {
      floatingOver = null
      view.invalidate()
    })
    floating.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
    // A panel slides in, so where it was read on opening isn't where it stops. Read again once it has.
    const settled = () => {
      floatingOver = null
      view.invalidate()
    }
    document.addEventListener('transitionend', settled)
    return () => {
      floating.disconnect()
      document.removeEventListener('transitionend', settled)
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
  const behind = useMemo(() => !view && live && !!vault && pending(vault).changes > 0, [vault, view, live])
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
      behind,
      priceChecks,
      sealedToAll,
      readers,
      readerColours,
      readOnly: c?.readOnly ?? false,
    })
  }, [vault, view, flagged, exposed, pricesReadable, live, behind, priceChecks, sealedToAll, readers, readerColours, map])

  const panel = useStore((s) => s.panel)
  const rightOpen = panel === 'share'
  // In a narrow window the panel floats over the land, because shrinking the map into what's left only makes it unreadable.
  // On a laptop a reader's panel is a little narrower, which is what it takes for everything on the land to clear it at the map's own scale.
  useEffect(() => map.current?.setRightInset(rightOpen && window.innerWidth > 1100 ? (window.innerWidth > 1360 ? 428 : 388) : 32), [rightOpen, map])

  useEffect(() => map.current?.setSelected(selected), [selected, map])
  useEffect(() => map.current?.setHighlight(highlight), [highlight, map])
  useEffect(() => map.current?.setGateHover(hoverGate), [hoverGate, map])
  useEffect(() => map.current?.setActiveArea(panel === 'area' ? area : null), [panel, area, map])
  useEffect(() => map.current?.setDollars(dollars, style, period), [dollars, style, period, map])

  const fitAsk = useStore((s) => s.fitAsk)
  useEffect(() => {
    if (fitAsk) map.current?.fit(true)
  }, [fitAsk, map])

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

  return (
    <>
      <canvas ref={ref} className="map-canvas" tabIndex={-1} aria-hidden="true" />
      <MapTip tip={tip} />
    </>
  )
}

/** A picked reader on a phone. It holds what the card holds on a laptop, and it's short, because the map above it is the point. */
function PhoneLens({ map }: { map: React.RefObject<MapView | null> }) {
  const narrow = useNarrow()
  const vault = useStore((s) => s.vault)
  const lens = useStore((s) => s.lens)
  const panel = useStore((s) => s.panel)
  const ref = useRef<HTMLElement>(null)
  const pw = vault?.passwords.find((p) => p.id === lens) ?? null
  const showing = narrow && !!pw && panel !== 'share'
  // While their panel is up the map stays as it is, so closing it doesn't move anything.
  const hasReader = !!pw
  useLayoutEffect(() => {
    if (!narrow || !hasReader) map.current?.setBottomInset(0)
    else if (showing && ref.current) map.current?.setBottomInset(ref.current.getBoundingClientRect().height + 24)
  }, [narrow, hasReader, showing, map])
  if (!showing || !pw || !vault) return null
  const live = !!vault.published && !!vault.site
  const still = stillOpenFor(vault, pw.name)
  return (
    <section className="lens-sheet panel" aria-label={`What ${pw.name} can read`} ref={ref}>
      <div className="lens-head">
        <ReaderMark name={pw.name} index={vault.passwords.indexOf(pw)} size={24} />
        <span className="grow">Seeing the map as <b style={{ fontWeight: 500 }}>{pw.name}</b></span>
        <button className="status-done" onClick={() => setState({ lens: null, agentView: false })}>Done</button>
      </div>
      {still && (
        <div className="lens-still-row" role="alert">
          <NeedMark level="now" />
          <span>{still}.</span>
        </div>
      )}
      <div className="lens-chips">
        {/* With nothing on, a row of names after "Can read" reads as a sentence that says the opposite. */}
        <span className="lens-note">{pw.gates.length ? 'Can read' : 'Can read nothing yet. Press an area to let them read it.'}</span>
        {areasOnMap(vault).map((g) => (
          <button key={g.id} className="lens-chip" role="switch" aria-checked={pw.gates.includes(g.id)} onClick={() => toggleGateOnPassword(pw.id, g.id)}>{g.name}</button>
        ))}
      </div>
      <button className="btn btn-paper reader-setup" onClick={() => setState({ panel: 'share', agentView: false })}>{live ? 'Connect this reader' : 'How to connect them'}</button>
    </section>
  )
}

function FirstRun() {
  const server = useStore((s) => s.server)
  const input = useRef<HTMLInputElement>(null)
  const accounts = server?.accounts
  return (
    <div className="empty">
      <div className="empty-word">Locus</div>
      <h1>Teach your AI tools about your company.</h1>
      <p><span>Add your documents: brand{'\u00a0'}book, contracts, specs, invoices.</span> <span>They become one map, and you choose which parts each AI tool or person can read.</span></p>
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
            {accounts.used >= accounts.max ? 'Every free account is taken. You can still build a map here.' : `Free while there's room: ${accounts.used} of ${accounts.max} accounts taken.`}
          </span>
        )}
        {(server?.mode === 'hosted' || server?.donateUrl) && <button onClick={() => setState({ sheet: { kind: 'donate' } })}>Donate</button>}
      </div>
    </div>
  )
}

function BlankMap() {
  const reading = useStore((s) => !!s.shred)
  const coarse = useMemo(() => matchMedia('(pointer: coarse)').matches, [])
  // It was just given what it's asking for. The progress card takes it from here.
  if (reading) return null
  return (
    <div className="empty blank">
      <h1>{coarse ? 'Choose your files.' : 'Drop your files anywhere.'}</h1>
      <p>Brand book, contracts, specs, invoices. They become this map.</p>
      <div className="empty-actions">
        <button className="btn btn-ink" onClick={() => document.getElementById('add-files')?.click()}>Choose files</button>
      </div>
    </div>
  )
}

/** Files always land on a real map. The sample is a made-up company, and your documents don't belong in it. */
async function startWith(files: File[]) {
  const v = getState().vault
  if (!v || v.sample) await newMap()
  setState({ sheet: { kind: 'shred', files, fromSample: !!v?.sample } })
}

function Locked({ name }: { name: string }) {
  const [key, setKey] = useState('')
  const lockError = useStore((s) => s.lockError)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [nothing, setNothing] = useState(false)
  useEffect(() => {
    // Don't ask for a password to something that isn't there. If this can't tell, the form still works and says so when it's used.
    const prefix = location.pathname.startsWith('/s/') ? `/s/${name}` : ''
    void fetch(`${prefix}/bundle.json`, { method: 'HEAD' }).then((r) => r.status === 404 && setNothing(true)).catch(() => {})
  }, [name])
  const go = async () => {
    setBusy(true)
    setError('')
    setState({ lockError: '' })
    const err = await unlockViewer(name, key)
    setBusy(false)
    if (err) setError(err)
  }
  if (nothing) {
    return (
      <div className="lock">
        <div className="lock-card">
          <div className="lock-inner">
            <img src="/favicon.svg" width="40" height="40" alt="" />
            <h1>{name}</h1>
            <p>Nothing is live at this address. Check it with whoever sent it to you.</p>
          </div>
        </div>
      </div>
    )
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
          <input className="field mono" autoFocus placeholder="lcr_" aria-label="Password" spellCheck={false} autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
          <button className="btn btn-ink" aria-busy={busy} disabled={!key.trim() || busy}>{busy ? 'Opening' : 'Open'}</button>
          <div className="lock-error" role="alert">{error || lockError}</div>
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
  // Whatever opens, a message from before it would lie over its controls. A way out such as Undo stays.
  const opened = useStore((s) => (s.agentView ? 'text' : s.selected ?? (s.panel === 'area' ? `area-${s.area}` : s.panel === 'share' ? `reader-${s.lens}` : null)))
  useEffect(() => {
    if (opened) clearPlainToasts(400)
  }, [opened])

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
      {!view && <PhoneLens map={map} />}
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
        const key = location.hash.match(/key=(lcr_[0-9a-z]+)/)?.[1]
        if (key) {
          history.replaceState(null, '', location.pathname)
          const err = await unlockViewer(site, key)
          if (err) setState({ lockError: err })
        }
        return
      }
      const savedKey = await storage.get<string>('claudeKey')
      if (savedKey) setState({ claudeKey: savedKey, claudeKeySaved: true })
      const all = await storage.vaults()
      const last = await storage.get<string>('lastVault')
      const v = all.find((x) => x.id === last) ?? all[0]
      if (v) await openVault(v)
      setState({ mode: 'studio', vaultList: all.map((x) => ({ id: x.id, name: x.company.name, sample: x.sample, items: x.pieces.length })) })
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
      {dropping && <div className="drop-hint">{vault?.sample ? 'Drop to start your own map' : 'Drop to add to the map'}</div>}
    </>
  )
}
