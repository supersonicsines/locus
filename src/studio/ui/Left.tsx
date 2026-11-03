// Top left: the company menu, and the gates. Like Figma's layers panel.

import { useRef, useState } from 'react'
import { addGate, addPiece, loadSample, newMap, renameGate, setTheme, switchVault, toggleGateOnPassword } from '../actions.ts'
import { getState, setState, useStore } from '../store.ts'
import { Icon, plural, useEscape } from './bits.tsx'
import { contentOf, NO_GATES, NO_PIECES } from './data.ts'

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
            <button className="menu-item btn-danger" role="menuitem" onClick={act(() => setState({ sheet: { kind: 'confirm-delete' } }))}>
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

export function Left() {
  const company = useStore((s) => contentOf(s)?.company)
  const gates = useStore((s) => contentOf(s)?.gates ?? NO_GATES)
  const pieces = useStore((s) => contentOf(s)?.pieces ?? NO_PIECES)
  const vault = useStore((s) => s.vault)
  const readOnly = useStore((s) => !!s.view)
  const lens = useStore((s) => s.lens)
  const hoverGate = useStore((s) => s.hoverGate)
  const [menu, setMenu] = useState(false)
  const [openOnPhone, setOpenOnPhone] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const passwords = vault?.passwords ?? []
  const lensPw = passwords.find((p) => p.id === lens) ?? null

  const add = () => {
    const name = 'New gate'
    const id = addGate(name)
    setRenaming(id)
    setTimeout(() => nameRef.current?.select(), 0)
  }

  return (
    <div className={`left panel ${openOnPhone ? 'is-open' : ''}`}>
      {openOnPhone && <div className="phone-backdrop" onClick={() => setOpenOnPhone(false)} />}
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
        <Icon name="chevron" size={14} />
      </button>
      {menu && <CompanyMenu close={() => setMenu(false)} />}

      {lensPw && (
        <div className="lens-title">
          Gates for <b>{lensPw.name}</b>. Click one to open or close it.
        </div>
      )}

      <div className="gate-list" role={lensPw ? 'group' : 'list'} aria-label="Gates">
        {gates.map((g) => {
          const count = pieces.filter((p) => p.gate === g.id).length
          const openTo = passwords.filter((p) => p.gates.includes(g.id)).length
          const isOpen = lensPw ? lensPw.gates.includes(g.id) : readOnly || openTo > 0

          if (renaming === g.id) {
            return (
              <div className="gate-row" key={g.id}>
                <span className="gate-mark" />
                <input
                  ref={nameRef}
                  className="field"
                  style={{ height: 24 }}
                  defaultValue={g.name}
                  autoFocus
                  aria-label="Gate name"
                  onBlur={(e) => {
                    renameGate(g.id, e.target.value.trim() || g.name)
                    setRenaming(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
                  }}
                />
              </div>
            )
          }

          return (
            <button
              key={g.id}
              className={`gate-row ${hoverGate === g.id ? 'is-hot' : ''}`}
              role={lensPw ? 'switch' : undefined}
              aria-checked={lensPw ? isOpen : undefined}
              onMouseEnter={() => setState({ hoverGate: g.id })}
              onMouseLeave={() => setState({ hoverGate: null })}
              onClick={() => {
                if (lensPw) toggleGateOnPassword(lensPw.id, g.id)
                else setState({ highlight: getState().highlight ? null : new Set(pieces.filter((p) => p.gate === g.id).map((p) => p.id)) })
              }}
              onDoubleClick={() => {
                if (!readOnly && !lensPw) {
                  setState({ highlight: null })
                  setRenaming(g.id)
                }
              }}
            >
              <span className={`gate-mark ${isOpen ? (lensPw ? 'is-open' : 'is-read') : 'is-sealed'}`} aria-hidden="true" />
              <span className="gate-text">
                <span className="gate-name">{g.name}</span>
                {lensPw ? (
                  <span className="gate-sub">{isOpen ? 'Open' : 'Sealed'}</span>
                ) : !readOnly ? (
                  <span className="gate-sub">{openTo ? `Open to ${plural(openTo, 'password')}` : 'Sealed to everyone'}</span>
                ) : null}
              </span>
              <span className="gate-count">{count}</span>
            </button>
          )
        })}
      </div>

      {!readOnly && (
        <div className="left-foot">
          <button className="btn btn-quiet" onClick={() => addPiece()}>
            <Icon name="plus" size={13} /> Piece
          </button>
          <button className="btn btn-quiet" onClick={() => setState({ sheet: { kind: 'add-service' } })}>
            <Icon name="plus" size={13} /> Service
          </button>
          <button className="btn btn-quiet" onClick={add}>
            <Icon name="plus" size={13} /> Gate
          </button>
        </div>
      )}
    </div>
  )
}
