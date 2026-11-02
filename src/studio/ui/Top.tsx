// The status line and the top-right controls. Together they pass the glance test.

import { needs, pending, sortNeeds, type Need, type NeedKind } from '../../core/status.ts'
import { changePiece, copy, publish, siteAddress, updateVault } from '../actions.ts'
import { setState, useStore } from '../store.ts'
import { plural, useEscape } from './bits.tsx'

function hostOf(address: string) {
  return address.replace(/^https?:\/\//, '')
}

export function StatusLine() {
  const vault = useStore((s) => s.vault)
  const view = useStore((s) => s.view)
  const panel = useStore((s) => s.panel)

  if (view) {
    return (
      <div className="status panel" role="status">
        <span className="clause">Reading as {view.passwordName}. </span>
        <span className="clause quiet">
          {plural(view.gates.length, 'gate')} open{view.closedGates ? `, ${view.closedGates} sealed` : ''}. Decrypted in this browser.
        </span>
      </div>
    )
  }
  if (!vault) return null

  if (!vault.pieces.length) {
    return (
      <div className="status panel" role="status">
        <span className="clause quiet">Nothing on the map yet. Drop your files anywhere.</span>
      </div>
    )
  }

  const p = pending(vault)
  const list = needs(vault)
  const open = () => setState({ panel: panel === 'needs' ? null : 'needs', highlight: null })
  const share = () => setState({ panel: panel === 'share' ? null : 'share' })
  const live = !!vault.published && !!vault.site
  const address = vault.site ? siteAddress(vault.site.name) : ''
  // Someone can still read something you closed. That's the only thing worth saying first.
  const exposed = live && p.exposures.length > 0

  return (
    <div className="status panel" role="status">
      {vault.sample && !live && <><span className="clause quiet">This is a sample company.</span>{' '}</>}
      {exposed ? null : live ? (
        <button className="clause" onClick={() => void copy(address, 'Address copied.')} title="Copy the address">
          Live at {hostOf(address)}.
        </button>
      ) : !vault.sample ? (
        <span className="clause">Not published.</span>
      ) : null}{' '}
      {live && p.exposures.length > 0 ? (
        <button className="clause strong" onClick={open}>
          {p.exposures[0].message}
        </button>
      ) : live && p.changes > 0 ? (
        <button className="clause strong" onClick={() => void publish()}>
          {plural(p.changes, 'change')} not published.
        </button>
      ) : live ? (
        <span className="clause quiet optional">Up to date.</span>
      ) : null}{' '}
      {!exposed && (
        <>
          <button className={`clause ${vault.passwords.length ? '' : 'quiet'} optional`} onClick={share}>
            {vault.passwords.length ? `${plural(vault.passwords.length, 'password')} ${live ? 'out' : 'ready'}.` : 'No passwords yet.'}
          </button>{' '}
        </>
      )}
      {list.length > 0 ? (
        <button className="clause strong" onClick={open} aria-expanded={panel === 'needs'}>
          {list.length === 1 ? '1 thing needs you.' : `${list.length} things need you.`}
        </button>
      ) : (
        <span className="clause quiet">Nothing needs you.</span>
      )}
    </div>
  )
}

const KIND_NAMES: Record<NeedKind, string> = {
  exposure: 'Still readable',
  secret: 'Secret found',
  proposal: 'Waiting for your approval',
  conflict: 'Conflict',
  gap: 'Missing',
  due: 'Coming up',
  stale: 'Out of date',
  price: 'Price',
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

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 11 }} onClick={() => setState({ panel: null, highlight: null })} />
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
            <span className="need-mark" aria-hidden="true" />
            <div>
              {list[i - 1]?.kind !== n.kind && <span className="need-kind">{KIND_NAMES[n.kind]}</span>}
              {n.message}
              {n.kind === 'exposure' && (
                <div className="need-actions">
                  <button
                    className="btn btn-ink"
                    onClick={(e) => {
                      e.stopPropagation()
                      void publish()
                    }}
                  >
                    Publish
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

export function TopRight() {
  const vault = useStore((s) => s.vault)
  const view = useStore((s) => s.view)
  const dollars = useStore((s) => s.dollars)
  const panel = useStore((s) => s.panel)
  const publishing = useStore((s) => s.publishing)
  const server = useStore((s) => s.server)

  const hasMoney = view ? !!view.costs : !!vault && vault.costs.length > 0
  const p = vault ? pending(vault) : null
  const isSampleHosted = !!vault?.sample && server?.mode === 'hosted'
  const clean = !!vault?.published && p?.changes === 0

  return (
    <div className="top-right">
      {hasMoney && (
        <button
          className="dollar-toggle"
          role="switch"
          aria-checked={dollars}
          aria-label="Show what each service costs"
          title="Show what each service costs ($)"
          onClick={() => setState({ dollars: !dollars })}
        >
          $<span className="switch" aria-checked={dollars} />
        </button>
      )}
      {vault && (
        <>
          <button className="btn btn-paper" aria-expanded={panel === 'share'} onClick={() => (panel === 'share' ? setState({ panel: null, lens: null, agentView: false }) : setState({ panel: 'share' }))}>
            Share
          </button>
          <button
            className="btn btn-ink"
            disabled={publishing || !vault.pieces.length || isSampleHosted || clean}
            title={isSampleHosted ? 'The sample can\'t be published here. Drop your own files.' : undefined}
            onClick={() => void publish()}
          >
            {publishing ? 'Publishing' : clean ? 'Published' : 'Publish'}
          </button>
        </>
      )}
    </div>
  )
}
