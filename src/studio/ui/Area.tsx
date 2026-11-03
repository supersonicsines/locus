// An area, opened from the map: what it's called, who can read it, and what's in it.

import { PIECE_KINDS } from '../../core/types.ts'
import { addPiece, renameGate, toggleGateOnPassword } from '../actions.ts'
import { setState, useStore } from '../store.ts'
import { Icon, PieceMark, plural, ServiceMark, useEscape } from './bits.tsx'
import { contentOf, readersByArea } from './data.ts'

export function AreaPanel() {
  const areaId = useStore((s) => s.area)
  const content = useStore((s) => contentOf(s))
  const vault = useStore((s) => s.vault)
  const selected = useStore((s) => s.selected)
  const close = () => setState({ panel: null, area: null })
  useEscape(close, !selected)

  const gate = content?.gates.find((g) => g.id === areaId)
  if (!content || !gate) return null
  const { readOnly } = content
  const items = content.pieces
    .filter((p) => p.gate === gate.id)
    .sort((a, b) => PIECE_KINDS.indexOf(a.kind) - PIECE_KINDS.indexOf(b.kind) || a.title.localeCompare(b.title))
  const readers = vault?.passwords ?? []
  const noOne = !readOnly && readers.length > 0 && !readersByArea(vault).has(gate.id)

  return (
    <aside className="side panel" aria-label={gate.name}>
      <div className="side-head">
        {readOnly || gate.builtin === 'money' ? (
          <span className="grow title-input">{gate.name}</span>
        ) : (
          <input className="grow title-input" aria-label="Area name" value={gate.name} onChange={(e) => renameGate(gate.id, e.target.value)} onBlur={(e) => !e.target.value.trim() && renameGate(gate.id, 'Untitled area')} />
        )}
        <button className="icon-btn" onClick={close} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div className="side-body">
        {!readOnly && (
          <>
            <div className="side-label">Who can read this</div>
            {noOne && <p className="hint area-closed">No one can read this.</p>}
            {readers.map((p) => {
              const open = p.gates.includes(gate.id)
              return (
                <button key={p.id} className="reader-area in-panel" role="switch" aria-checked={open} onClick={() => toggleGateOnPassword(p.id, gate.id)}>
                  <ServiceMark name={p.name} size={20} />
                  <span className="reader-name">{p.name}</span>
                  <span className="switch" aria-checked={open} />
                </button>
              )
            })}
            {!readers.length && <p className="hint" style={{ margin: 0 }}>No readers yet. Add one on the left.</p>}
          </>
        )}

        {readOnly ? <div className="side-label">{plural(items.length, 'item')}</div> : <div className="section-title">{plural(items.length, 'item')}</div>}
        <ul className="link-list">
          {items.map((p) => (
            <li key={p.id}>
              <button className="link-item" onClick={() => setState({ selected: p.id })}>
                <PieceMark kind={p.kind} name={p.title} size={15} />
                <span>{p.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {!readOnly && (
        <div className="side-foot">
          <button className="btn btn-quiet" onClick={() => addPiece({ gate: gate.id })}>
            <Icon name="plus" size={13} /> Add a note here
          </button>
        </div>
      )}
    </aside>
  )
}
