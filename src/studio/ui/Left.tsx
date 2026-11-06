// Top left: the company, and who can read its map. Pick a reader and the map shows what they see.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { pending } from '../../core/status.ts'
import type { Password } from '../../core/types.ts'
import { askFit, copy, createPassword, loadSample, newMap, setTheme, siteAddress, switchVault, tidyMap, toggleGateOnPassword } from '../actions.ts'
import { setState, useStore } from '../store.ts'
import { Icon, NeedMark, plural, ReaderMark, useEscape } from './bits.tsx'
import { areasOnMap, contentOf, NO_GATES, NO_PIECES, readersByArea } from './data.ts'

function CompanyMenu({ close, done }: { close: () => void; done: () => void }) {
  const vault = useStore((s) => s.vault)
  const list = useStore((s) => s.vaultList)
  const theme = useStore((s) => s.theme)
  const server = useStore((s) => s.server)
  const view = useStore((s) => s.view)
  useEscape(close)

  // Choosing something finishes with the card too, or a phone is left looking at it with what you chose behind it.
  const act = (fn: () => void) => () => {
    close()
    done()
    fn()
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 29 }} onClick={close} />
      <div className="menu panel company-menu" style={{ top: 50, left: 0, right: 0 }} role="menu">
        {!view && vault && (
          <>
            <button className="menu-item" role="menuitem" onClick={act(() => setState({ sheet: { kind: 'rename' } }))}>
              Company details
            </button>
            {vault.site && (
              <button className="menu-item" role="menuitem" onClick={act(() => setState({ sheet: { kind: 'owner-key' } }))}>
                Recovery key
              </button>
            )}
            {vault.pieces.length > 0 && (
              <button className="menu-item" role="menuitem" onClick={act(() => { tidyMap(); askFit() })}>
                Tidy up the map
              </button>
            )}
            <div className="menu-sep" />
            {list.map((m) => (
              <button key={m.id} className={`menu-item ${m.id === vault.id ? 'is-on' : ''}`} role="menuitem" onClick={act(() => void switchVault(m.id))}>
                <span>{m.name}</span>
                <span className="meta">{m.sample ? 'Sample' : plural(m.items ?? 0, 'item')}</span>
              </button>
            ))}
            <button className="menu-item" role="menuitem" onClick={act(() => void newMap())}>
              New map
            </button>
            {!list.some((m) => m.sample) && (
              <button className="menu-item" role="menuitem" onClick={act(() => void loadSample())}>
                Open the sample company
              </button>
            )}
            <button className="menu-item" role="menuitem" onClick={act(() => setState({ sheet: { kind: 'signin' } }))}>
              Sign in with a recovery key
            </button>
            <div className="menu-sep" />
          </>
        )}
        <button className="menu-item" role="menuitem" onClick={act(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}>
          {theme === 'dark' ? 'Light' : 'Dark'} mode
        </button>
        {!view && (server?.mode === 'hosted' || server?.donateUrl) && (
          <button className="menu-item" role="menuitem" onClick={act(() => setState({ sheet: { kind: 'donate' } }))}>
            Donate
          </button>
        )}
        {!view && vault && (
          <>
            <div className="menu-sep" />
            <button className="menu-item" role="menuitem" onClick={act(() => setState({ sheet: { kind: 'confirm-delete' } }))}>
              Delete this map
            </button>
          </>
        )}
        <div className="menu-sep" />
        <div className="menu-note">
          Locus {server?.version}. Open source, MIT licensed. Logos belong to their owners.{' '}
          <a href="/licenses/NOTICE.txt" target="_blank" rel="noreferrer noopener">Notices</a>
        </div>
      </div>
    </>
  )
}

function ReaderRow({ pw, index, live, picked }: { pw: Password; index: number; live: boolean; picked: () => void }) {
  const vault = useStore((s) => s.vault)
  const gates = vault ? areasOnMap(vault) : NO_GATES
  const lens = useStore((s) => s.lens)
  const panel = useStore((s) => s.panel)
  const on = lens === pw.id
  const count = gates.filter((g) => pw.gates.includes(g.id)).length
  // Until you update, what you closed is still readable, so the row counts it: the map may never say a reader reads less than they do.
  const still = vault ? (pending(vault).exposures.find((e) => e.who === pw.name && e.gates?.length && !e.message.includes('through the host'))?.gates ?? []) : []
  const reads = count + gates.filter((g) => still.includes(g.id) && !pw.gates.includes(g.id)).length

  const pick = () => {
    if (on) setState({ lens: null, panel: panel === 'share' ? null : panel, agentView: false })
    else {
      setState({ lens: pw.id, selected: null, area: null, panel: panel === 'share' ? 'share' : null, agentView: false })
      picked()
    }
  }

  return (
    <div className={`reader ${on ? 'is-on' : ''}`}>
      <button className="reader-row" aria-expanded={on} onClick={pick}>
        <ReaderMark name={pw.name} index={index} size={22} />
        <span className="reader-name">{pw.name}</span>
        <span className="reader-count" title={reads > count ? `${reads} of ${plural(gates.length, 'area')} until you update, then ${count}` : count ? `${count} of ${plural(gates.length, 'area')}` : undefined}>
          {reads > count && <NeedMark level="now" />}
          {reads ? `${reads} of ${gates.length}` : 'Nothing yet'}
        </span>
      </button>
      {on && (
        <div className="reader-more">
          {gates.map((g) => {
            const open = pw.gates.includes(g.id)
            return (
              <button
                key={g.id}
                className="reader-area"
                role="switch"
                aria-checked={open}
                onMouseEnter={() => setState({ hoverGate: g.id })}
                onMouseLeave={() => setState({ hoverGate: null })}
                onClick={() => toggleGateOnPassword(pw.id, g.id)}
              >
                <span>{g.name}</span>
                <span className="switch" aria-checked={open} />
              </button>
            )
          })}
          <button className="btn btn-paper reader-setup" aria-expanded={panel === 'share'} onClick={() => setState({ panel: panel === 'share' ? null : 'share', agentView: false })}>
            {live ? 'Connect this reader' : 'How to connect them'}
          </button>
        </div>
      )}
    </div>
  )
}

function Readers({ picked }: { picked: () => void }) {
  const vault = useStore((s) => s.vault)!
  const live = !!vault.published && !!vault.site
  const address = vault.site ? siteAddress(vault.site.name) : ''
  return (
    <>
      {live ? (
        <button className="left-about is-live" title="Copy the address" onClick={() => void copy(address, 'Address copied.')}>
          <span>{address.replace(/^https?:\/\//, '')}</span>
          <Icon name="copy" size={13} />
        </button>
      ) : (
        <>
          <p className="left-about">
            {vault.sample ? "A made-up company's map for its AI tools and people. Pick a name to see what they can read." : 'What your AI tools and people need to know, on one map. You choose who can read which parts.'}
          </p>
          {vault.sample && <button className="text-btn start-own" onClick={() => { picked(); void newMap() }}>Start your own map</button>}
        </>
      )}
      <div className="left-title">{live ? 'Who can read it' : 'Who can read it once live'}</div>
      <div className="reader-list">
        {vault.passwords.map((p, i) => <ReaderRow key={p.id} pw={p} index={i} live={live} picked={picked} />)}
        {!readersByArea(vault).size && !vault.passwords.length && <p className="reader-none">No one yet, so everything here is private.</p>}
      </div>
      <div className="left-foot">
        <button
          className="btn btn-quiet reader-add"
          onClick={() => {
            createPassword()
            setState({ panel: 'share', area: null })
            picked()
          }}
        >
          <Icon name="plus" size={13} /> Add a reader
        </button>
      </div>
    </>
  )
}

/** For someone reading with a password, there's nobody else to show: only what they can open. */
function ReaderAreas() {
  const gates = useStore((s) => contentOf(s)?.gates ?? NO_GATES)
  const pieces = useStore((s) => contentOf(s)?.pieces ?? NO_PIECES)
  const hoverGate = useStore((s) => s.hoverGate)
  return (
    <>
      <div className="left-title">You can read</div>
      <div className="gate-list" role="list" aria-label="Areas">
        {gates.map((g) => (
          <button
            key={g.id}
            className={`gate-row ${hoverGate === g.id ? 'is-hot' : ''}`}
            onMouseEnter={() => setState({ hoverGate: g.id })}
            onMouseLeave={() => setState({ hoverGate: null })}
            onClick={() => setState({ area: g.id, panel: 'area' })}
          >
            <span className="gate-name">{g.name}</span>
            <span className="gate-count">{pieces.filter((p) => p.gate === g.id).length}</span>
          </button>
        ))}
      </div>
    </>
  )
}

/** The card folds as the panel opens and unfolds as it closes, with the same ease, so it's plain the one gave way to the other. */
function useFoldMotion(folded: boolean) {
  const box = useRef<HTMLDivElement>(null)
  const last = useRef({ folded, height: 0 })
  // What's inside can change the card's height with no word to this component, and the fold starts from wherever it really was.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const watch = new ResizeObserver(() => {
      if (!el.getAnimations().length) last.current.height = el.getBoundingClientRect().height
    })
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const height = el.getBoundingClientRect().height
    const { folded: before, height: from } = last.current
    last.current = { folded, height }
    if (before === folded || !from || from === height || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.classList.add('is-folding')
    el.animate({ height: [`${from}px`, `${height}px`], maxHeight: [`${from}px`, `${height}px`] }, { duration: 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }).onfinish = () => {
      // A class, so the map hears of it: names give way to what floats over them, and this has only now reached its height.
      el.classList.remove('is-folding')
    }
  }, [folded])
  return box
}

export function Left() {
  const company = useStore((s) => contentOf(s)?.company)
  const sample = useStore((s) => !!s.vault?.sample)
  const readOnly = useStore((s) => !!s.view)
  const readerCount = useStore((s) => s.vault?.passwords.length ?? 0)
  const areaCount = useStore((s) => s.view?.gates.length ?? 0)
  const [menu, setMenu] = useState(false)
  const [openOnPhone, setOpenOnPhone] = useState(false)
  // A reader's panel holds what the card holds about them, so one of them is enough: the card folds to its heading, and the map has the room. A narrow window folds it anyway.
  // With an item or an area open, that's what you're working on, so the card folds then too and leaves the land to the left of the panel uncovered.
  const panel = useStore((s) => s.panel)
  const itemOpen = useStore((s) => !!s.selected)
  const folded = panel === 'share' || panel === 'area' || itemOpen
  const box = useFoldMotion(folded)
  useEffect(() => {
    setOpenOnPhone(false)
  }, [folded])
  // In a narrow window the open card stands over the map's west, so the map moves over beside it rather than under it.
  useEffect(() => {
    setState({ cardOpen: openOnPhone })
  }, [openOnPhone])

  return (
    <div ref={box} className={`left panel ${openOnPhone ? 'is-open' : ''} ${folded ? 'is-folded' : ''}`}>
      {openOnPhone && <div className="phone-backdrop" onClick={() => setOpenOnPhone(false)} />}
      <div className="left-head">
        <button
          className="company-btn"
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => {
            if ((window.innerWidth <= 980 || folded) && !openOnPhone) setOpenOnPhone(true)
            else setMenu(!menu)
          }}
        >
          <span className="company-stack">
            <span className="company-name">{company?.name}</span>
            {/* Folded, the heading is all there is of this card, so it says what's inside. */}
            {/* With nobody to read it, this is the next step and not a status, so it looks like something to press. */}
            {!readOnly && !readerCount ? (
              <span className="company-fold is-ask"><Icon name="plus" size={11} /> Add a reader</span>
            ) : (
              <span className="company-fold">{sample && <span className="fold-sample">Sample · </span>}{readOnly ? `You can read ${plural(areaCount, 'area')}` : plural(readerCount, 'reader')}</span>
            )}
          </span>
          <Icon name="chevron" size={14} />
        </button>
        <button className="icon-btn" aria-label="Search the map" title="Search the map (⌘K)" onClick={() => { setOpenOnPhone(false); setState({ cmdk: true }) }}>
          <Icon name="search" size={15} />
        </button>
      </div>
      {menu && <CompanyMenu close={() => setMenu(false)} done={() => setOpenOnPhone(false)} />}
      {/* On a phone, picking someone puts the card away: the map is what you came to see, and the sheet below it holds the rest. */}
      {readOnly ? <ReaderAreas /> : <Readers picked={() => (window.innerWidth <= 720 || folded) && setOpenOnPhone(false)} />}
    </div>
  )
}
