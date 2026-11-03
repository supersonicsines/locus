// Top centre: the one thing worth saying right now. Top right: what it costs, adding to the map, and going live.

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatMoney, summarize } from '../../core/money.ts'
import { needs, pending, sortNeeds, type Need, type NeedKind } from '../../core/status.ts'
import { addArea, addPiece, changePiece, publish, updateVault } from '../actions.ts'
import { setState, useStore } from '../store.ts'
import { Icon, plural, ServiceMark, useEscape } from './bits.tsx'
import { contentOf } from './data.ts'

/** How each kind of need reads in the one-line summary. */
const SUMMARY: Record<NeedKind, (n: number) => string> = {
  exposure: (n) => `${n} still readable`,
  secret: (n) => plural(n, 'exposed secret'),
  proposal: (n) => `${n} to approve`,
  conflict: (n) => plural(n, 'contradiction'),
  gap: (n) => `${n} missing`,
  due: (n) => `${n} coming up`,
  stale: (n) => `${n} out of date`,
  price: (n) => plural(n, 'price note'),
}

/** The worst few kinds by name, then how many more. A count alone tells you nothing. */
function summaryOf(list: Need[]): string {
  const groups: [NeedKind, number][] = []
  for (const n of sortNeeds(list)) {
    const last = groups[groups.length - 1]
    if (last?.[0] === n.kind) last[1]++
    else groups.push([n.kind, 1])
  }
  const shown = groups.slice(0, 3)
  const rest = groups.slice(3).reduce((sum, g) => sum + g[1], 0)
  const words = shown.map(([k, n]) => SUMMARY[k](n))
  if (rest) return `${words.join(', ')} and ${rest} more`
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0]
}

export function StatusLine() {
  const vault = useStore((s) => s.vault)
  const view = useStore((s) => s.view)
  const panel = useStore((s) => s.panel)
  const lens = useStore((s) => s.lens)
  const selected = useStore((s) => s.selected)
  const sheet = useStore((s) => s.sheet)
  const cmdk = useStore((s) => s.cmdk)
  const lensPw = vault?.passwords.find((p) => p.id === lens) ?? null
  const done = () => setState({ lens: null, agentView: false, panel: panel === 'share' ? null : panel })
  useEscape(done, !!lensPw && panel !== 'share' && !selected && !sheet && !cmdk)

  if (view) {
    return (
      <div className="status panel" role="status">
        <span>Reading as <b>{view.passwordName}</b>. </span>
        <span className="quiet">
          {plural(view.gates.length, 'area')} open{view.closedGates ? `, ${view.closedGates} closed to you` : ''}.
        </span>{' '}
        <span className="quiet optional-phone">Decrypted in this browser.</span>
      </div>
    )
  }
  if (!vault) return null

  // The empty map says this itself, in the middle of the screen.
  if (!vault.pieces.length) return null

  if (lensPw) {
    return (
      <div className="status panel is-lens" role="status">
        <span>Seeing the map as <b>{lensPw.name}</b>. <span className="quiet optional">Click an area to change what they can read.</span></span>
        <button className="status-done" onClick={done}>Done</button>
      </div>
    )
  }

  const p = pending(vault)
  const list = needs(vault)
  const open = () => setState({ panel: panel === 'needs' ? null : 'needs', highlight: null })

  // Someone can still read something you closed. That's the only thing worth saying first.
  if (vault.published && vault.site && p.exposures.length > 0) {
    return (
      <div className="status panel" role="status">
        <button className="status-open" onClick={open}><b>{p.exposures[0].message}</b></button>
      </div>
    )
  }

  if (!list.length) {
    return (
      <div className="status panel" role="status">
        <span className="quiet">Nothing needs you.</span>
      </div>
    )
  }

  return (
    <div className="status panel" role="status">
      <button className="status-open" onClick={open} aria-expanded={panel === 'needs'}>
        <b>Needs you</b>
        <span className="quiet">{summaryOf(list)}</span>
        <Icon name="chevron" size={13} />
      </button>
    </div>
  )
}

const KIND_NAMES: Record<NeedKind, string> = {
  exposure: 'Still readable',
  secret: 'Exposed secret',
  proposal: 'Waiting for your approval',
  conflict: 'Contradiction',
  gap: 'Missing',
  due: 'Coming up',
  stale: 'Out of date',
  price: 'Prices',
}

export function NeedsPanel() {
  const vault = useStore((s) => s.vault)
  useEscape(() => setState({ panel: null, highlight: null }))
  if (!vault) return null
  const list = sortNeeds(needs(vault))

  const focus = (n: Need) => {
    if (n.pieces[0]) setState({ selected: n.pieces[0], panel: null, highlight: null })
  }

  const approve = (n: Need) => {
    const id = n.pieces[0]
    if (n.id.startsWith('rule-')) changePiece(id, { always: 'approved' })
    if (n.id.startsWith('mcp-')) {
      const p = vault.pieces.find((x) => x.id === id)
      if (p?.mcp) changePiece(id, { mcp: { ...p.mcp, approved: true } })
    }
  }

  const reject = (n: Need) => {
    const id = n.pieces[0]
    if (n.id.startsWith('rule-')) changePiece(id, { always: undefined })
    if (n.id.startsWith('mcp-')) changePiece(id, { mcp: undefined })
  }

  const dismiss = (n: Need) => updateVault((v) => ({ ...v, findings: v.findings.map((f) => (f.id === n.id ? { ...f, dismissed: true } : f)) }))

  // Where a need is about one service, its logo says which at a glance.
  const serviceOf = (n: Need) => {
    if (n.pieces.length !== 1) return null
    const p = vault.pieces.find((x) => x.id === n.pieces[0])
    return p?.kind === 'service' ? p.title : null
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0 }} onClick={() => setState({ panel: null, highlight: null })} />
      <div className="needs-panel panel" role="dialog" aria-label="Things that need you">
        {!list.length && <div className="needs-empty">Nothing needs you.</div>}
        {list.map((n, i) => (
          <div
            key={n.id}
            className={`need ${n.pieces.length ? 'clickable' : ''}`}
            onMouseEnter={() => n.pieces.length && setState({ highlight: new Set(n.pieces) })}
            onMouseLeave={() => setState({ highlight: null })}
            onClick={() => focus(n)}
          >
            {serviceOf(n) ? <ServiceMark name={serviceOf(n)!} size={18} /> : <span className="need-mark" aria-hidden="true">!</span>}
            <div>
              {list[i - 1]?.kind !== n.kind && <span className="need-kind">{KIND_NAMES[n.kind]}</span>}
              {n.message}
              {n.quote && <blockquote className="need-quote">{n.quote}</blockquote>}
              {n.kind === 'exposure' && (
                <div className="need-actions">
                  <button
                    className="btn btn-ink"
                    onClick={(e) => {
                      e.stopPropagation()
                      void publish()
                    }}
                  >
                    Update
                  </button>
                </div>
              )}
              {n.kind === 'proposal' && (
                <div className="need-actions">
                  <button
                    className="btn btn-paper"
                    onClick={(e) => {
                      e.stopPropagation()
                      approve(n)
                    }}
                  >
                    Approve
                  </button>
                  <button
                    className="btn btn-quiet"
                    onClick={(e) => {
                      e.stopPropagation()
                      reject(n)
                    }}
                  >
                    Reject
                  </button>
                </div>
              )}
              {(n.kind === 'conflict' || n.kind === 'gap') && (
                <div className="need-actions">
                  <button
                    className="btn btn-quiet"
                    onClick={(e) => {
                      e.stopPropagation()
                      dismiss(n)
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function AddMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEscape(() => setOpen(false), open)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', away)
    return () => window.removeEventListener('mousedown', away)
  }, [open])

  const act = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <div className="add-menu" ref={ref}>
      <button className="btn btn-paper" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="plus" size={13} /> Add
      </button>
      {open && (
        <div className="menu panel" role="menu">
          <button className="menu-item" role="menuitem" onClick={act(() => document.getElementById('add-files')?.click())}>Documents from your computer</button>
          <button className="menu-item" role="menuitem" onClick={act(() => setState({ sheet: { kind: 'add-service' } }))}>A service you use</button>
          <button className="menu-item" role="menuitem" onClick={act(() => addPiece())}>A note</button>
          <button className="menu-item" role="menuitem" onClick={act(addArea)}>A new area</button>
        </div>
      )}
    </div>
  )
}

export function TopRight() {
  const vault = useStore((s) => s.vault)
  const view = useStore((s) => s.view)
  const dollars = useStore((s) => s.dollars)
  const period = useStore((s) => s.period)
  const publishing = useStore((s) => s.publishing)
  const server = useStore((s) => s.server)
  const content = useStore((s) => contentOf(s))

  const hasMoney = view ? !!view.costs : !!vault && vault.costs.length > 0
  const p = vault ? pending(vault) : null
  const isSampleHosted = !!vault?.sample && server?.mode === 'hosted'
  const clean = !!vault?.published && p?.changes === 0

  const total = useMemo(() => {
    if (!content?.costs) return null
    const s = summarize(content.costs, content.gates, content.pieces, content.currency)
    const mult = period === 'year' ? 12 : 1
    return {
      approx: s.approximate,
      main: formatMoney(s.total * mult, s.currency),
      others: s.others.map((o) => formatMoney(o.amount * mult, o.currency)),
    }
  }, [content, period])

  return (
    <div className="top-right">
      {hasMoney && total && (
        <button
          className="dollar-toggle"
          aria-pressed={dollars}
          title={dollars ? 'Hide prices on the map ($)' : 'Show what each service costs on the map ($)'}
          onClick={() => setState({ dollars: !dollars })}
        >
          <span className="cost-figure">
            {total.approx ? '≈' : ''}{total.main}
            {total.others.length > 0 && <span className="cost-others"> + {total.others.join(' + ')}</span>}
          </span>
          <span className="cost-per">a {period}<span className="optional"> on tools</span></span>
        </button>
      )}
      {vault && <AddMenu />}
      {vault && (
        <button
          className={`btn go-live ${clean ? 'btn-paper' : 'btn-ink'}`}
          disabled={publishing || !vault.pieces.length || isSampleHosted || clean}
          title={isSampleHosted ? "The sample can't go live here. Drop your own files." : clean ? 'Everything on this map is live.' : vault.published ? `${plural(p?.changes ?? 0, 'change')} not live yet.` : 'Puts an encrypted copy online for your readers. Nothing can be read without a password.'}
          onClick={() => void publish()}
        >
          {publishing ? 'Going live' : clean ? 'Up to date' : vault.published ? 'Update' : 'Go live'}
        </button>
      )}
    </div>
  )
}
