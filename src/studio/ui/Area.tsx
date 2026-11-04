// An area, opened from the map: what it's called, who can read it, and what's in it.

import { PIECE_KINDS } from '../../core/types.ts'
import { addPiece, createPassword, deleteArea, publishAndSay, renameGate, toggleGateOnPassword } from '../actions.ts'
import { setState, useStore } from '../store.ts'
import { Icon, NeedMark, PieceMark, plural, ReaderMark, useEscape, usePanelFocus } from './bits.tsx'
import { contentOf, exposedAreas, pricesReadableIn, readersByArea } from './data.ts'

export function AreaPanel() {
  const areaId = useStore((s) => s.area)
  const content = useStore((s) => contentOf(s))
  const vault = useStore((s) => s.vault)
  const selected = useStore((s) => s.selected)
  const publishing = useStore((s) => s.publishing)
  const close = () => setState({ panel: null, area: null })
  useEscape(close, !selected)
  const focusRef = usePanelFocus(areaId)

  const gate = content?.gates.find((g) => g.id === areaId)
  if (!content || !gate) return null
  const { readOnly } = content
  const items = content.pieces
    .filter((p) => p.gate === gate.id)
    .sort((a, b) => PIECE_KINDS.indexOf(a.kind) - PIECE_KINDS.indexOf(b.kind) || a.title.localeCompare(b.title, undefined, { numeric: true }))
  const readers = vault?.passwords ?? []
  const noOne = !readOnly && readers.length > 0 && !readersByArea(vault).has(gate.id)
  const exposed = readOnly ? undefined : exposedAreas(vault).get(gate.id)

  return (
    <aside className="side panel" aria-label={gate.name} ref={focusRef} tabIndex={-1}>
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
        {exposed && (
          <div className="callout has-mark is-now" role="alert">
            <NeedMark level="now" />
            <div>
              {exposed}.
              <div className="need-actions">
                <button className="btn btn-ink" disabled={publishing} onClick={() => void publishAndSay()}>{publishing ? 'Updating' : 'Update'}</button>
              </div>
            </div>
          </div>
        )}
        {!readOnly && (
          <>
            <div className="side-label">Who can read this</div>
            {noOne && (
              <p className="hint area-closed">
                {pricesReadableIn(vault).has(gate.id)
                  ? `Whoever can read ${content.gates.find((g) => g.builtin === 'money')?.name ?? 'Money'} can see what each service here is called, its plan and what it costs. They can't open anything in this area.`
                  : 'No one can read this.'}
              </p>
            )}
            {readers.map((p, i) => {
              const open = p.gates.includes(gate.id)
              return (
                <button key={p.id} className="reader-area in-panel" role="switch" aria-checked={open} onClick={() => toggleGateOnPassword(p.id, gate.id)}>
                  <ReaderMark name={p.name} index={i} size={20} />
                  <span className="reader-name">{p.name}</span>
                  <span className="switch" aria-checked={open} />
                </button>
              )
            })}
            {!readers.length && (
              <p className="hint" style={{ margin: 0 }}>
                No readers yet.{' '}
                <button className="text-btn" onClick={() => { createPassword(); setState({ panel: 'share', area: null }) }}>Add a reader</button>
              </p>
            )}
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
          {gate.builtin !== 'money' && (
            <button className="btn btn-quiet" onClick={() => deleteArea(gate)}>Delete this area</button>
          )}
        </div>
      )}
    </aside>
  )
}
