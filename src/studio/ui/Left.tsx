// Top left: the company, and who can read its map. Pick a reader and the map shows what they see.

import { useState } from 'react'
import type { Password } from '../../core/types.ts'
import { copy, createPassword, loadSample, newMap, setTheme, siteAddress, switchVault, toggleGateOnPassword } from '../actions.ts'
import { setState, useStore } from '../store.ts'
import { Icon, plural, ServiceMark, useEscape } from './bits.tsx'
import { contentOf, NO_GATES, NO_PIECES, readersByArea } from './data.ts'

function CompanyMenu({ close }: { close: () => void }) {
  const vault = useStore((s) => s.vault)
  const list = useStore((s) => s.vaultList)
  const theme = useStore((s) => s.theme)
  const server = useStore((s) => s.server)
  const view = useStore((s) => s.view)
  useEscape(close)

  const act = (fn: () => void) => () => {
    close()
    fn()
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 29 }} onClick={close} />
      <div className="menu panel" style={{ top: 48, left: 0 }} role="menu">
        {!view && vault && (
          <>
            <button className="menu-item" role="menuitem" onClick={act(() => setState({ sheet: { kind: 'rename' } }))}>
              Company details
            </button>
            {vault.site && (
              <button className="menu-item" role="menuitem" onClick={act(() => setState({ sheet: { kind: 'owner-key' } }))}>
                Owner key
              </button>
            )}
            <div className="menu-sep" />
            {list.map((m) => (
              <button key={m.id} className={`menu-item ${m.id === vault.id ? 'is-on' : ''}`} role="menuitem" onClick={act(() => void switchVault(m.id))}>
                <span>{m.name}</span>
                <span className="meta">{m.sample ? 'Sample' : m.id === vault.id ? 'Open' : ''}</span>
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
              Sign in with an owner key
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
          Vadere {server?.version}. Open source, MIT licensed. Logos belong to their owners.{' '}
          <a href="/licenses/NOTICE.txt" target="_blank" rel="noreferrer noopener">Notices</a>
        </div>
      </div>
    </>
  )
}

function ReaderRow({ pw }: { pw: Password }) {
  const gates = useStore((s) => s.vault?.gates ?? NO_GATES)
  const lens = useStore((s) => s.lens)
  const panel = useStore((s) => s.panel)
  const on = lens === pw.id
  const count = gates.filter((g) => pw.gates.includes(g.id)).length

  const pick = () => {
    if (on) setState({ lens: null, panel: panel === 'share' ? null : panel, agentView: false })
    else setState({ lens: pw.id, selected: null, area: null, panel: panel === 'share' ? 'share' : null, agentView: false })
  }

  return (
    <div className={`reader ${on ? 'is-on' : ''}`}>
      <button className="reader-row" aria-expanded={on} onClick={pick}>
        <ServiceMark name={pw.name} size={22} />
        <span className="reader-name">{pw.name}</span>
        <span className="reader-count">{count ? `${count} of ${plural(gates.length, 'area')}` : 'Nothing yet'}</span>
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
            Password and setup
          </button>
        </div>
      )}
    </div>
  )
}

function Readers() {
  const vault = useStore((s) => s.vault)!
  const live = !!vault.published && !!vault.site
  const address = vault.site ? siteAddress(vault.site.name) : ''
  return (
    <>
      {live ? (
        <button className="left-about is-live" title="Copy the address" onClick={() => void copy(address, 'Address copied.')}>
          Live at {address.replace(/^https?:\/\//, '')}
        </button>
      ) : (
        <p className="left-about">
          {vault.sample ? "A made-up company's map of what its AI tools and people need to know. Pick a name to see what they can read." : 'What your AI tools and people need to know, on one map. You choose who can read which parts.'}
        </p>
      )}
      <div className="left-title">Who can read it</div>
      <div className="reader-list">
        {vault.passwords.map((p) => <ReaderRow key={p.id} pw={p} />)}
        {!readersByArea(vault).size && !vault.passwords.length && <p className="reader-none">No one yet, so everything here is private.</p>}
      </div>
      <div className="left-foot">
        <button
          className="btn btn-quiet reader-add"
          onClick={() => {
            createPassword()
            setState({ panel: 'share', area: null })
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

export function Left() {
  const company = useStore((s) => contentOf(s)?.company)
  const sample = useStore((s) => !!s.vault?.sample)
  const readOnly = useStore((s) => !!s.view)
  const [menu, setMenu] = useState(false)
  const [openOnPhone, setOpenOnPhone] = useState(false)

  return (
    <div className={`left panel ${openOnPhone ? 'is-open' : ''}`}>
      {openOnPhone && <div className="phone-backdrop" onClick={() => setOpenOnPhone(false)} />}
      <div className="left-head">
        <button
          className="company-btn"
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => {
            if (window.innerWidth <= 720 && !openOnPhone) setOpenOnPhone(true)
            else setMenu(!menu)
          }}
        >
          <span className="company-name">{company?.name}</span>
          {sample && <span className="tag">Sample</span>}
          <Icon name="chevron" size={14} />
        </button>
        <button className="icon-btn" aria-label="Search the map" title="Search the map (⌘K)" onClick={() => setState({ cmdk: true })}>
          <Icon name="search" size={15} />
        </button>
      </div>
      {menu && <CompanyMenu close={() => setMenu(false)} />}
      {readOnly ? <ReaderAreas /> : <Readers />}
    </div>
  )
}
