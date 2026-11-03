// A piece opens as a peek on the right, and you edit it in place, like Notion.

import { useEffect, useState } from 'react'
import { findInCatalog } from '../../core/catalog.ts'
import { figure, monthly, trustOf } from '../../core/money.ts'
import type { Cost, CostUnit, Piece, PieceKind } from '../../core/types.ts'
import { PIECE_KINDS } from '../../core/types.ts'
import { changePiece, deletePiece, setCost } from '../actions.ts'
import { KIND_LABELS } from '../map/symbols.ts'
import { setState, useStore } from '../store.ts'
import { GrowingText, Icon, Markdown, PieceMark, plural, useEscape } from './bits.tsx'
import { contentOf } from './data.ts'

const LINK_NOTE: Record<string, string> = { conflicts: 'Conflicts', governs: 'Governs', uses: 'Uses' }

function CostBlock({ piece, cost, readOnly }: { piece: Piece; cost: Cost | null; readOnly: boolean }) {
  const period = useStore((s) => s.period)
  const [editing, setEditing] = useState(false)
  useEffect(() => setEditing(false), [piece.id])

  if (!cost && readOnly) return null

  const setYou = (patch: Partial<Cost>) => setCost(piece.id, { source: 'you', ...patch })
  const trust = cost ? trustOf(cost) : 'unknown'
  const pricing = findInCatalog(piece.title)?.pricingUrl
  const per = cost && monthly(cost) !== null && monthly(cost)! > 0 ? ` a ${period}` : ''

  let note = 'No known price. Type one in if you know it.'
  if (cost && cost.amount !== null) {
    if (cost.source === 'invoice') note = `From an invoice${cost.unit === 'usage' ? ', and it varies with use' : ''}.`
    else if (cost.source === 'you') note = 'You typed this in.'
    else if (cost.statedIn) note = `Stated in ${cost.statedIn}, so it may be out of date.`
    else note = `List price as of ${cost.asOf ?? 'an unknown date'}, so it may be out of date.`
  }
  const seatNote = cost?.unit === 'seat' && cost.amount !== null ? `${figure({ ...cost, seats: 1, source: 'invoice', period: 'month' })} a seat, ${plural(cost.seats ?? 1, 'seat')}.` : ''

  return (
    <>
      <div className="section-title">What it costs</div>
      {cost && <div className="money-big">{figure(cost, period)}{per}</div>}
      {cost?.plan && <p className="source-note" style={{ marginTop: 0 }}>{cost.plan} plan.</p>}
      {seatNote && <p className="source-note" style={{ marginTop: 2 }}>{seatNote}</p>}
      <p className="source-note">{note}</p>
      {cost?.renews && <p className="source-note">Renews {cost.renews}.</p>}
      {trust === 'estimate' && pricing && (
        <p className="source-note">
          <a href={pricing} target="_blank" rel="noreferrer noopener">Check the current price</a>
        </p>
      )}
      {!readOnly && !editing && (
        <button className="btn btn-paper" style={{ marginTop: 10, height: 28 }} onClick={() => setEditing(true)}>
          {cost?.amount === null || !cost ? 'Add a price' : 'Change the price'}
        </button>
      )}
      {!readOnly && editing && (
        <div className="money-grid" style={{ marginTop: 10 }}>
          <label className="label">
            Amount
            <input
              className="field"
              type="number"
              min="0"
              step="0.01"
              autoFocus
              defaultValue={cost?.amount ?? ''}
              onChange={(e) => setYou({ amount: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </label>
          <label className="label">
            Charged
            <select className="field" value={cost?.unit ?? 'flat'} onChange={(e) => setYou({ unit: e.target.value as CostUnit })}>
              <option value="flat">Flat</option>
              <option value="seat">Per seat</option>
              <option value="usage">By usage</option>
            </select>
          </label>
          <label className="label">
            Every
            <select className="field" value={cost?.period ?? 'month'} onChange={(e) => setYou({ period: e.target.value as Cost['period'] })}>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </label>
          {cost?.unit === 'seat' ? (
            <label className="label">
              Seats
              <input className="field" type="number" min="1" defaultValue={cost.seats ?? ''} onChange={(e) => setYou({ seats: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </label>
          ) : (
            <label className="label">
              Currency
              <input className="field" defaultValue={cost?.currency ?? 'USD'} maxLength={3} onChange={(e) => setYou({ currency: e.target.value.toUpperCase() })} />
            </label>
          )}
        </div>
      )}
    </>
  )
}

export function Peek() {
  const selected = useStore((s) => s.selected)
  const content = useStore((s) => contentOf(s))
  const [editingBody, setEditingBody] = useState(false)
  const close = () => setState({ selected: null })
  useEscape(close, !!selected)
  useEffect(() => setEditingBody(false), [selected])

  if (!content || !selected) return null
  const piece = content.pieces.find((p) => p.id === selected)
  if (!piece) return null
  const { readOnly, gates, links, pieces, costs } = content
  const byId = new Map(pieces.map((p) => [p.id, p]))
  const gate = gates.find((g) => g.id === piece.gate)
  const linked = links.filter((l) => l.from === piece.id || l.to === piece.id)
  const cost = costs?.find((c) => c.piece === piece.id) ?? null

  return (
    <aside className="side panel" aria-label={piece.title} key={piece.id}>
      <div className="side-head">
        <span className="piece-kind grow">
          <PieceMark kind={piece.kind} name={piece.title} size={piece.kind === 'service' ? 20 : 14} />
          {readOnly ? (
            KIND_LABELS[piece.kind]
          ) : (
            <select className="select" aria-label="Kind" value={piece.kind} onChange={(e) => changePiece(piece.id, { kind: e.target.value as PieceKind })}>
              {PIECE_KINDS.map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k]}</option>
              ))}
            </select>
          )}
        </span>
        <button className="icon-btn" onClick={close} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div className="side-body">
        {piece.always === 'proposed' && !readOnly && (
          <div className="callout">
            Shredding proposes this as a rule for every agent. It stays out until you approve it.
            <div className="actions">
              <button className="btn btn-paper" onClick={() => changePiece(piece.id, { always: 'approved' })}>Approve</button>
              <button className="btn btn-quiet" onClick={() => changePiece(piece.id, { always: undefined })}>Reject</button>
            </div>
          </div>
        )}
        {piece.mcp && !piece.mcp.approved && !readOnly && (
          <div className="callout">
            A document names this MCP server. Agents won't be told about it until you approve it.
            <div className="mono" style={{ marginTop: 6, wordBreak: 'break-all' }}>{piece.mcp.url}</div>
            <div className="actions">
              <button className="btn btn-paper" onClick={() => changePiece(piece.id, { mcp: { ...piece.mcp!, approved: true } })}>Approve</button>
              <button className="btn btn-quiet" onClick={() => changePiece(piece.id, { mcp: undefined })}>Reject</button>
            </div>
          </div>
        )}

        {readOnly ? (
          <>
            <h2 className="piece-title" style={{ fontWeight: 400 }}>{piece.title}</h2>
            <p className="piece-summary">{piece.summary}</p>
          </>
        ) : (
          <>
            <GrowingText className="piece-title" aria-label="Title" value={piece.title} placeholder="Untitled" onChange={(e) => changePiece(piece.id, { title: e.target.value.replace(/\n/g, ' ') })} />
            <GrowingText className="piece-summary" aria-label="Summary" value={piece.summary} placeholder="One line an agent sees on the map" onChange={(e) => changePiece(piece.id, { summary: e.target.value.replace(/\n/g, ' ') })} />
          </>
        )}

        {editingBody && !readOnly ? (
          <GrowingText
            className="piece-body-edit"
            aria-label="Body"
            autoFocus
            value={piece.body}
            placeholder="Write here"
            onBlur={() => setEditingBody(false)}
            onChange={(e) => changePiece(piece.id, { body: e.target.value })}
          />
        ) : piece.body ? (
          <div
            className={`piece-body ${readOnly ? 'is-readonly' : ''}`}
            onClick={(e) => {
              if ((e.target as HTMLElement).tagName !== 'A' && !readOnly) setEditingBody(true)
            }}
          >
            <Markdown text={piece.body} />
          </div>
        ) : !readOnly ? (
          <div className="piece-body placeholder" onClick={() => setEditingBody(true)}>Add detail</div>
        ) : null}

        <dl className="props">
          <dt>Gate</dt>
          <dd>
            {readOnly ? (
              gate?.name
            ) : (
              <select className="select" aria-label="Gate" value={piece.gate} onChange={(e) => changePiece(piece.id, { gate: e.target.value })}>
                {gates.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
          </dd>
          {piece.source && (
            <>
              <dt>From</dt>
              <dd>
                {piece.source.file}
                {piece.source.where ? `, ${piece.source.where}` : ''}
              </dd>
            </>
          )}
          {piece.date && (
            <>
              <dt>{piece.date.means === 'ends' ? 'Ends' : piece.date.means === 'renews' ? 'Renews' : 'True as of'}</dt>
              <dd>{piece.date.on}</dd>
            </>
          )}
          {piece.kind === 'rule' && !readOnly && (
            <>
              <dt>For agents</dt>
              <dd>
                <button className="row-between" style={{ width: '100%', alignItems: 'center' }} role="switch" aria-checked={piece.always === 'approved'} onClick={() => changePiece(piece.id, { always: piece.always === 'approved' ? undefined : 'approved' })}>
                  <span>Always follow</span>
                  <span className="switch" aria-checked={piece.always === 'approved'} />
                </button>
              </dd>
            </>
          )}
          {piece.kind === 'rule' && readOnly && piece.always === 'approved' && (
            <>
              <dt>For agents</dt>
              <dd>Always follow</dd>
            </>
          )}
          {piece.kind === 'service' && (piece.url || !readOnly) && (
            <>
              <dt>Link</dt>
              <dd>
                {readOnly ? (
                  /^https?:\/\//.test(piece.url ?? '') ? <a href={piece.url} target="_blank" rel="noreferrer noopener">{piece.url}</a> : piece.url
                ) : (
                  <input className="prop-input" aria-label="Link" placeholder="https://" value={piece.url ?? ''} onChange={(e) => changePiece(piece.id, { url: e.target.value || undefined })} />
                )}
              </dd>
            </>
          )}
          {piece.kind === 'service' && piece.mcp?.approved && (
            <>
              <dt>MCP server</dt>
              <dd className="mono" style={{ fontSize: 11.5 }}>{piece.mcp.url}</dd>
            </>
          )}
        </dl>

        {piece.kind === 'service' && <CostBlock piece={piece} cost={cost} readOnly={readOnly} />}

        {linked.length > 0 && (
          <>
            <div className="section-title">Linked to</div>
            <ul className="link-list">
              {linked.map((l, i) => {
                const other = byId.get(l.from === piece.id ? l.to : l.from)
                if (!other) return null
                return (
                  <li key={i}>
                    <button className="link-item" onClick={() => setState({ selected: other.id })}>
                      <PieceMark kind={other.kind} name={other.title} size={12} />
                      <span>{other.title}</span>
                      {LINK_NOTE[l.kind] && <span className="note">{LINK_NOTE[l.kind]}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
      {!readOnly && (
        <div className="side-foot">
          <button className="btn btn-quiet" onClick={() => deletePiece(piece.id)}>Delete piece</button>
        </div>
      )}
    </aside>
  )
}
