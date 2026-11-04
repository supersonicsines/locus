// Bottom right: zoom. Bottom left: the money cartouche.

import { useState } from 'react'
import { formatMoney, summarize, TOWN_CLASSES } from '../../core/money.ts'
import { priceNotes } from '../../core/status.ts'
import type { MapView } from '../map/MapView.ts'
import { setState, useStore } from '../store.ts'
import { Icon, plural } from './bits.tsx'
import { contentOf } from './data.ts'

export function Cartouche() {
  const dollars = useStore((s) => s.dollars)
  const content = useStore((s) => contentOf(s))
  const period = useStore((s) => s.period)
  const style = useStore((s) => s.dollarStyle)
  const [notesOpen, setNotesOpen] = useState(false)
  if (!dollars || !content?.costs) return null

  const s = summarize(content.costs, content.gates, content.pieces, content.currency)
  const notes = priceNotes(content.costs)
  const mult = period === 'year' ? 12 : 1
  const others = s.others.map((o) => formatMoney(o.amount * mult, o.currency))

  // Each gate's share, drawn like a chart's alternating scale bar.
  const segments = s.byGate.filter((g) => g.share > 0)

  return (
    <div className="cartouche" role="group" aria-label="What the company spends">
      {style === 'towns' && (
        <div className="town-legend panel" aria-hidden="true">
          <span className="hint">Disc size, by monthly bill</span>
          {TOWN_CLASSES.map((c) => (
            <div className="town-legend-row" key={c.r}>
              <i style={{ width: c.r * 0.5, height: c.r * 0.5 }} />
              {c.label}
            </div>
          ))}
        </div>
      )}
      <div className="cartouche-inner">
        {/* The total is on the button that opened this, and it follows month and year. Twice on one screen, it's two things to compare. */}
        <div className="cart-per">
          <span>Prices per</span>
          <div className="segmented" role="group" aria-label="Show per">
            <button aria-pressed={period === 'month'} onClick={() => setState({ period: 'month' })}>month</button>
            <button aria-pressed={period === 'year'} onClick={() => setState({ period: 'year' })}>year</button>
          </div>
        </div>
        <div className="cart-style">
          <span>Show as</span>
          <div className="segmented" role="group" aria-label="Show prices as">
            <button aria-pressed={style === 'soundings'} onClick={() => setState({ dollarStyle: 'soundings' })}>Rings</button>
            <button aria-pressed={style === 'towns'} onClick={() => setState({ dollarStyle: 'towns' })}>Discs</button>
          </div>
        </div>

        <div className="scale-bar" role="img" aria-label={segments.map((g) => `${g.name} ${Math.round(g.share * 100)}%`).join(', ')}>
          {segments.map((g, i) => (
            <div
              key={g.gate}
              className={`scale-seg ${i % 2 === 0 ? 'fill' : ''}`}
              style={{ width: `${g.share * 100}%` }}
              title={`${g.name}: ${formatMoney(g.amount * mult, s.currency)}`}
              onMouseEnter={() => setState({ hoverGate: g.gate })}
              onMouseLeave={() => setState({ hoverGate: null })}
            />
          ))}
        </div>
        <div className="scale-labels" aria-hidden="true">
          {segments.map((g) => (
            <div key={g.gate} className="scale-label" style={{ width: `${g.share * 100}%` }}>
              {/* Whatever fits, so an even spread of areas doesn't leave a bar with no words. */}
              {g.share * 100 > g.name.length * 2.6 ? g.name : ''}
            </div>
          ))}
        </div>

        <p className="cart-note">
          {/* A phone's button has room for one currency, so the others are said here. */}
          {others.length > 0 && <span className="cart-also">Plus {others.join(' + ')}. </span>}
          {s.fromInvoices}% from invoices.{' '}
          {notes.length > 0 && (
            <button aria-expanded={notesOpen} onClick={() => setNotesOpen(!notesOpen)}>
              <i className="price-mark" aria-hidden="true" />
              {plural(notes.length, 'price note')}
            </button>
          )}
        </p>
        {notesOpen && (
          <ul className="cart-notes">
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  disabled={!content.pieces.some((p) => p.id === n.pieces[0])}
                  onClick={() => setState({ selected: n.pieces[0] })}
                >
                  {n.message}
                </button>
              </li>
            ))}
          </ul>
        )}

      </div>
    </div>
  )
}

export function BottomRight({ map }: { map: React.RefObject<MapView | null> }) {
  const zoom = useStore((s) => s.zoom)
  const fitZoom = useStore((s) => s.fitZoom)
  const moved = useStore((s) => s.mapMoved)
  const panel = useStore((s) => s.panel)
  const hasContent = useStore((s) => (contentOf(s)?.pieces.length ?? 0) > 0)
  const selected = useStore((s) => s.selected)

  if (!hasContent) return null
  // The side panel occupies this corner while it's open.
  const hidden = panel === 'share' || panel === 'area' || !!selected

  return (
    <div className="bottom-right" style={hidden ? { right: 396 } : undefined}>
      <div className={`zoom panel ${!moved && Math.abs(zoom - fitZoom) < 0.01 ? 'is-fit' : ''}`}>
        <button className="icon-btn" aria-label="Zoom out" onClick={() => map.current?.zoomBy(1 / 1.3)}>
          <Icon name="minus" size={14} />
        </button>
        <button className="pct" title="Fit the whole map" aria-label="Fit the whole map" onClick={() => map.current?.fit()}>
          {Math.round(zoom * 100)}%
        </button>
        <button className="icon-btn" aria-label="Zoom in" onClick={() => map.current?.zoomBy(1.3)}>
          <Icon name="plus" size={14} />
        </button>
      </div>
    </div>
  )
}
