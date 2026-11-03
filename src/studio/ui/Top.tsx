// Top centre: the one thing worth saying right now, as loud as it deserves. Top right: what it costs, adding to the map, and whether it's live.

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatMoney, summarize } from '../../core/money.ts'
import { levelOf, needs, pending, priceNotes, sortNeeds, type Need, type NeedKind } from '../../core/status.ts'
import { addArea, addPiece, publish } from '../actions.ts'
import type { MapView } from '../map/MapView.ts'
import { setState, useStore } from '../store.ts'
import { Icon, NeedActions, NeedMark, plural, ServiceMark, useEscape } from './bits.tsx'
import { contentOf, placeOf } from './data.ts'

/** How each kind of need reads in the one-line summary. */
const SUMMARY: Record<NeedKind, (n: number) => string> = {
  exposure: (n) => `${n} still readable`,
  secret: (n) => plural(n, 'exposed secret'),
  proposal: (n) => `${n} to approve`,
  conflict: (n) => plural(n, 'contradiction'),
  gap: (n) => `${n} missing`,
  due: (n) => `${n} coming up`,
  stale: (n) => `${n} out of date`,
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
  const publishing = useStore((s) => s.publishing)
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

  // The empty map says this itself, in the middle of the screen. Unless it's live, because then what you deleted can still be read.
  if (!vault.pieces.length && !vault.published) return null

  if (lensPw) {
    return (
      <div key="lens" className="status panel is-lens" role="status">
        <span>Seeing the map as <b>{lensPw.name}</b>. <span className="quiet optional">Click an area to change what they can read.</span></span>
        <button className="status-done" onClick={done}>Done</button>
      </div>
    )
  }

  const list = sortNeeds(needs(vault))
  const open = () => setState({ panel: panel === 'needs' ? null : 'needs', highlight: null })
  const expanded = panel === 'needs'

  // Nothing to say, so it takes up next to nothing. A real need never looks like this.
  if (!list.length) {
    return (
      <div key="clear" className="status is-clear" role="status">
        <Icon name="check" size={13} /> Nothing needs you
      </div>
    )
  }

  // What needs you now gets the one loud thing on the page.
  const worst = list[0]
  if (levelOf(worst.kind) === 'now') {
    const same = list.filter((n) => n.kind === worst.kind)
    const places = new Set(same.map((n) => placeOf(vault, n.pieces, n.gates)))
    const where = places.size === 1 ? placeOf(vault, worst.pieces, worst.gates) : null
    // An exposure names who and what, so it says itself. Anything else says how many, and where.
    const headline = worst.kind === 'exposure' ? worst.message.replace(/\.$/, '') : `${SUMMARY[worst.kind](same.length)}${where ? ` in ${where}` : ''}`
    const rest = list.length - (worst.kind === 'exposure' ? 1 : same.length)
    return (
      // Its own key, or React reuses the focused Done button as this Update button, and a second Enter on Done would publish.
      <div key="now" className="status panel is-now" role="alert">
        <button className="status-open" onClick={open} aria-expanded={expanded}>
          <NeedMark level="now" />
          <b title={headline}>{headline}</b>
          {rest > 0 && <span className="status-more">and {rest} more</span>}
          <Icon name="chevron" size={13} />
        </button>
        {worst.kind === 'exposure' && <button className="status-do go-live" disabled={publishing} onClick={() => void publish()}>{publishing ? 'Updating' : 'Update'}</button>}
      </div>
    )
  }

  return (
    <div key="needs" className="status panel" role="status">
      <button className="status-open" onClick={open} aria-expanded={expanded}>
        <NeedMark level={levelOf(worst.kind)} />
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
}

export function NeedsPanel({ map }: { map: React.RefObject<MapView | null> }) {
  const vault = useStore((s) => s.vault)
  useEscape(() => setState({ panel: null, highlight: null }))
  if (!vault) return null
  const list = sortNeeds(needs(vault))

  // An area that's since been deleted has nowhere to go.
  const gateOf = (n: Need) => n.gates?.find((g) => vault.gates.some((x) => x.id === g))

  // Takes you to it: the map moves to the place, and the item's own panel says what to do.
  const go = (n: Need) => {
    if (n.pieces[0]) {
      setState({ selected: n.pieces[0], panel: null, highlight: null })
      map.current?.focusPiece(n.pieces[0])
    } else if (gateOf(n)) {
      setState({ area: gateOf(n), panel: 'area', highlight: null })
    }
  }

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
        {list.map((n) => {
          const where = placeOf(vault, n.pieces, n.gates)
          const service = serviceOf(n)
          return (
            <div
              key={n.id}
              className={`need is-${levelOf(n.kind)} ${n.pieces.length || gateOf(n) ? 'clickable' : ''}`}
              onMouseEnter={() => n.pieces.length && setState({ highlight: new Set(n.pieces) })}
              onMouseLeave={() => setState({ highlight: null })}
              onClick={() => go(n)}
            >
              <NeedMark level={levelOf(n.kind)} />
              <div className="need-text">
                <span className="need-kind">
                  {service && <ServiceMark name={service} size={14} />}
                  {KIND_NAMES[n.kind]}{where ? ` in ${where}` : ''}
                </span>
                {n.message}
                {n.quote && <blockquote className="need-quote">{n.quote}</blockquote>}
                <NeedActions need={n} />
              </div>
            </div>
          )
        })}
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
  const lens = useStore((s) => s.lens)
  const content = useStore((s) => contentOf(s))

  const hasMoney = view ? !!view.costs : !!vault && vault.costs.length > 0
  const p = vault ? pending(vault) : null
  const isSampleHosted = !!vault?.sample && server?.mode === 'hosted'
  const isLive = !!vault?.published && !!vault.site
  const clean = isLive && p?.changes === 0
  // Someone can still read what you closed, so the bar at top centre has the button. Two would only compete.
  const barHasUpdate = isLive && !!p?.exposures.length && !lens

  const total = useMemo(() => {
    if (!content?.costs) return null
    const s = summarize(content.costs, content.gates, content.pieces, content.currency)
    const mult = period === 'year' ? 12 : 1
    return {
      notes: priceNotes(content.costs).length,
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
          title={`${dollars ? 'Hide prices on the map ($)' : 'Show what each service costs on the map ($)'}${total.notes ? `. ${plural(total.notes, 'price note')} to look at.` : ''}`}
          onClick={() => setState({ dollars: !dollars })}
        >
          <span className="cost-figure">
            {total.approx ? '≈' : ''}{total.main}
            {total.others.length > 0 && <span className="cost-others"> + {total.others.join(' + ')}</span>}
          </span>
          <span className="cost-per">a {period}<span className="optional"> on tools</span></span>
          {total.notes > 0 && <i className="cost-dot" aria-hidden="true" />}
        </button>
      )}
      {vault && <AddMenu />}
      {vault && (vault.pieces.length > 0 || isLive) && (
        <div className={`live-state ${isLive ? 'is-live' : 'is-not-live'} ${clean || barHasUpdate ? 'is-current' : ''}`} title={clean ? 'Everything on this map is live.' : isLive ? `Readers are still seeing the last update.` : 'Saved in this browser. No reader can open it until it goes live.'}>
          <span className="live-word">
            <i className="live-dot" aria-hidden="true" />
            {clean ? 'Live, up to date' : isLive ? `${plural(p?.changes ?? 0, 'change')} not live` : 'Not live'}
          </span>
          {!clean && !barHasUpdate && (
            <button
              className="btn btn-ink go-live"
              disabled={publishing || isSampleHosted}
              title={isSampleHosted ? "The sample can't go live here. Drop your own files." : isLive ? `${plural(p?.changes ?? 0, 'change')} not live yet.` : 'Puts an encrypted copy online for your readers. Nothing can be read without a password.'}
              onClick={() => void publish()}
            >
              {publishing ? (isLive ? 'Updating' : 'Going live') : isLive ? 'Update' : 'Go live'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
