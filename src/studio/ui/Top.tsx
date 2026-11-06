// Top centre: the one thing worth saying right now, as loud as it deserves. Top right: what it costs, adding to the map, and whether it's live.

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatMoney, summarize } from '../../core/money.ts'
import { levelOf, needs, pending, priceNotes, sortNeeds, whatChanged, type Need, type NeedKind } from '../../core/status.ts'
import { addArea, addPiece, clearPlainToasts, newMap, publishAndSay, toast } from '../actions.ts'
import type { MapView } from '../map/MapView.ts'
import { setState, useStore } from '../store.ts'
import type { Vault } from '../../core/types.ts'
import { Icon, NeedActions, NeedMark, plural, ServiceMark, useEscape, usePanelFocus } from './bits.tsx'
import { contentOf, placeOf } from './data.ts'

/** How each kind of need reads in the one-line summary. */
const SUMMARY: Record<NeedKind, (n: number) => string> = {
  exposure: (n) => `${n} still readable`,
  // It was taken out before anything went on the map, so no reader has it. What's left is the key itself, out there in the file.
  secret: (n) => (n === 1 ? 'Change 1 secret found in a file' : `Change ${n} secrets found in files`),
  proposal: (n) => `${n} to approve`,
  conflict: (n) => plural(n, 'contradiction'),
  gap: (n) => `${n} to look at`,
  due: (n) => `${n} coming up`,
  stale: (n) => `${n} out of date`,
}

/** What's waiting, in the same two words the marks on the map stand for, wherever it's said. The list says what each one is. */
function summaryOf(list: Need[]): string {
  const asked = list.filter((n) => levelOf(n.kind) === 'decide').length
  const looks = list.filter((n) => levelOf(n.kind) === 'look').length
  return [asked && `${asked} to approve`, looks && `${looks} to look at`].filter(Boolean).join(' and ')
}

/** The shortest whole form of what needs you now, for when the long one won't fit. Never a cut word. */
const SHORT: Partial<Record<NeedKind, (n: number) => string>> = {
  secret: (n) => (n === 1 ? 'Change 1 secret' : `Change ${n} secrets`),
}

/** Two whole forms of one sentence. The top line shows the short one only when the long one won't fit. */
function Forms({ long, short }: { long: string; short: string }) {
  if (long === short) return <>{long}</>
  return (
    <>
      <span className="form-long">{long}</span>
      <span className="form-short">{short}</span>
    </>
  )
}

/**
 * The top line's steps, least needed first. Each is a class on .top-bar, and styles.css says what it hides.
 * Cost steps shorten the price; status steps shorten what needs you. The price only gives way for the status where the two share a row.
 */
const FIT_STEPS: { name: string; frees: 'cost' | 'status' }[] = [
  { name: 'fit-1', frees: 'cost' }, // "on tools"
  { name: 'fit-2', frees: 'status' }, // the marks spelled out become a count, and the lens's hint goes
  { name: 'fit-3', frees: 'cost' }, // "a month" becomes "/mo", before any of the bill goes
  { name: 'fit-4', frees: 'status' }, // the short form of the sentence, so the count of what else is waiting can stay
  { name: 'fit-5', frees: 'status' }, // "and 3 more" and the summary
  { name: 'fit-6', frees: 'cost' }, // the other currencies, leaving a + to say there are some
  { name: 'fit-7', frees: 'cost' }, // the folded card's "Sample ·", which its own menu still says
  { name: 'fit-8', frees: 'cost' }, // the folded card's search, which ⌘K and the open card still have
]

/**
 * The top line fits itself. Whatever's in it, at whatever width, it gives up words in order until nothing is cut or covered, and never more than it has to:
 * a card that's short of room only costs the price its words, and a status on a row of its own only shortens itself.
 */
export function useFitTop() {
  useLayoutEffect(() => {
    const bar = document.querySelector<HTMLElement>('.top-bar')
    if (!bar) return
    const root = document.documentElement
    // Cut means the words don't fit their box: they've been ended with an ellipsis, or they run out of it. A sentence broken over two lines counts too, because the last word alone on a line reads as a fragment.
    const cut = (e: Element) => {
      if (e.scrollWidth > e.clientWidth + 1) return true
      if (e.tagName !== 'B') return false
      const line = parseFloat(getComputedStyle(e).lineHeight) || 20
      return e.getBoundingClientRect().height > line * 1.5
    }
    const overlap = (a: DOMRect, b: DOMRect, gap = 8) => a.right + gap > b.left && b.right + gap > a.left && a.top < b.bottom && b.top < a.bottom
    const problems = () => {
      const right = bar.querySelector('.top-right')
      // A card folded to its heading shares the top of the screen with the price, so its width is what the price leaves it.
      if (right) root.style.setProperty('--top-right-w', `${Math.ceil(right.getBoundingClientRect().width)}px`)
      const status = bar.querySelector('.status')
      // The status itself, never its slot: the needs list opens inside the slot, and measuring that would shorten the line you just pressed.
      const statusCut = [...bar.querySelectorAll('.status, .status > span, .status-open, .status b, .status .quiet, .lens-still')].some(cut)
      const priceCut = [...bar.querySelectorAll('.top-right, .dollar-toggle')].some(cut)
      // Folded, the card's own words must fit beside the price. Open or folded, its heading must never run under it.
      const card = document.querySelector('.left')
      let cardCut = false
      if (card) {
        if (!card.classList.contains('is-open')) cardCut = [...card.querySelectorAll('.company-name, .company-fold')].some(cut)
        const head = card.querySelector('.left-head') ?? card
        if (right && overlap(head.getBoundingClientRect(), right.getBoundingClientRect())) cardCut = true
      }
      const sharesRow = !!status && !!right && overlap(status.getBoundingClientRect(), right.getBoundingClientRect(), 1e4)
      return { status: statusCut || (sharesRow && priceCut), cost: cardCut || priceCut || (sharesRow && statusCut) }
    }
    const fit = () => {
      for (const s of FIT_STEPS) bar.classList.remove(s.name)
      let now = problems()
      for (const step of FIT_STEPS) {
        if (!now.status && !now.cost) break
        if (!now[step.frees]) continue
        bar.classList.add(step.name)
        now = problems()
      }
    }
    fit()
    // Both answer before the next paint, so a line that wouldn't fit is never seen not fitting.
    const sized = new ResizeObserver(fit)
    sized.observe(document.body)
    const changed = new MutationObserver(fit)
    changed.observe(bar, { childList: true, subtree: true, characterData: true })
    const card = document.querySelector('.left')
    if (card) changed.observe(card, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] })
    document.fonts?.addEventListener('loadingdone', fit)
    return () => {
      sized.disconnect()
      changed.disconnect()
      document.fonts?.removeEventListener('loadingdone', fit)
    }
  }, [])
}

/** A file's name breaks at its hyphen like any word, and "engineering-/notes.md" reads as two things. So names of files stay whole. */
function wholeNames(text: string) {
  return text.split(/(\S+\.(?:md|txt|pdf|docx?|csv|json|xlsx?|png|jpe?g))/i).map((part, i) => (i % 2 ? <span key={i} style={{ whiteSpace: 'nowrap' }}>{part}</span> : part))
}

/** The sentence that says this reader can still read something you've closed, if there is one. */
export function stillOpenFor(vault: Vault, name: string): string | null {
  const e = pending(vault).exposures.find((x) => x.message.startsWith(`${name} can still read `))
  return e ? e.message.replace(/\.$/, '') : null
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
  const reading = useStore((s) => s.agentView)
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
    // What this reader can still do out there, though you've changed it here. While their picture is showing, nothing else on the page would say so.
    const still = stillOpenFor(vault, lensPw.name)
    if (still) {
      return (
        <div key="lens-now" className="status panel is-now is-lens" role="alert">
          <NeedMark level="now" />
          <b className="lens-still" title={still}><Forms long={still} short={still.replace(/ until you update$/, '')} /></b>
          {/* The sentence ends "until you update", so the button beside it is Update. Leaving the lens is a quiet × after it. */}
          <button className="status-do go-live" aria-busy={publishing} disabled={publishing} onClick={() => void publishAndSay()}>{publishing ? 'Updating' : 'Update'}</button>
          <button className="status-x icon-btn" aria-label={`Stop seeing the map as ${lensPw.name}`} title="Stop seeing the map as them (Esc)" onClick={done}><Icon name="close" size={13} /></button>
        </div>
      )
    }
    return (
      <div key="lens" className="status panel is-lens" role="status">
        <span><Forms long="Seeing the map as " short="As " /><b>{lensPw.name}</b>. {!reading && <span className="quiet optional">Click an area to change this.</span>}</span>
        <button className="status-done" onClick={done}>Done</button>
      </div>
    )
  }

  const list = sortNeeds(needs(vault))
  const open = () => setState({ panel: panel === 'needs' ? null : 'needs', highlight: null })
  const expanded = panel === 'needs'
  // The same marks the map wears, beside what they mean, so the line teaches them with no legend. Where there's room for it.
  const parts = (from: Need[]) => {
    const asked = from.filter((n) => levelOf(n.kind) === 'decide').length
    const looks = from.filter((n) => levelOf(n.kind) === 'look').length
    return (
      <span className="status-parts">
        {asked > 0 && <span className="status-part is-decide"><NeedMark level="decide" /><b>{asked}</b> to approve</span>}
        {looks > 0 && <span className="status-part"><NeedMark level="look" />{looks} to look at</span>}
      </span>
    )
  }

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
    // An exposure names who and what, so it says itself. A secret says what to do, and no area, because it isn't in one: it was taken out before it reached the map.
    const headline = worst.kind === 'exposure' ? worst.message.replace(/\.$/, '') : SUMMARY[worst.kind](same.length)
    const rest = list.length - (worst.kind === 'exposure' ? 1 : same.length)
    const others = list.filter((n) => levelOf(n.kind) !== 'now')
    return (
      // Its own key, or React reuses the focused Done button as this Update button, and a second Enter on Done would publish.
      <div key="now" className="status panel is-now" role="alert">
        <button className={`status-open ${rest > 0 && rest === others.length ? 'has-parts' : ''} ${rest > 0 ? 'has-more' : ''}`} onClick={open} aria-expanded={expanded}>
          <span className="status-head">
            <NeedMark level="now" />
            <b title={headline}><Forms long={headline} short={worst.kind === 'exposure' ? headline.replace(/ until you update$/, '') : SHORT[worst.kind]?.(same.length) ?? headline} /></b>
          </span>
          {rest > 0 && <span className="status-more">and {rest} more</span>}
          {rest > 0 && rest === others.length && parts(others)}
          <Icon name="chevron" size={13} />
        </button>
        {worst.kind === 'exposure' && <button className="status-do go-live" aria-busy={publishing} disabled={publishing} onClick={() => void publishAndSay()}>{publishing ? 'Updating' : 'Update'}</button>}
      </div>
    )
  }

  return (
    <div key="needs" className="status panel" role="status">
      <button className={`status-open ${levelOf(worst.kind) === 'decide' ? 'has-parts' : ''}`} onClick={open} aria-expanded={expanded}>
        <NeedMark level={levelOf(worst.kind)} />
        <b>Needs you</b>
        <span className="quiet">{summaryOf(list)}</span>
        {levelOf(worst.kind) === 'decide' && parts(list)}
        <Icon name="chevron" size={13} />
      </button>
    </div>
  )
}

const KIND_NAMES: Record<NeedKind, string> = {
  exposure: 'Still readable',
  secret: 'Secret to change',
  proposal: 'Waiting for your approval',
  conflict: 'Contradiction',
  gap: 'Missing',
  due: 'Coming up',
  stale: 'Out of date',
}

export function NeedsPanel({ map }: { map: React.RefObject<MapView | null> }) {
  const vault = useStore((s) => s.vault)
  useEscape(() => setState({ panel: null, highlight: null }))
  const ref = usePanelFocus<HTMLDivElement>('needs')
  useEffect(() => clearPlainToasts(), [])
  if (!vault) return null
  const list = sortNeeds(needs(vault))
  // An item wears its loudest mark, so a look on something that's also waiting for approval shows a question, not a dot. Only say dots mark these where one does.
  const wears = new Map<string, string>()
  for (const n of [...list].reverse()) for (const id of n.pieces) wears.set(id, levelOf(n.kind))
  const dots = new Set(list.filter((n) => levelOf(n.kind) === 'look').flatMap((n) => n.pieces.filter((id) => wears.get(id) === 'look'))).size
  const dotted = dots > 0

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
      <div className="needs-panel panel" role="dialog" aria-label="Things that need you" ref={ref} tabIndex={-1}>
        {!list.length && <div className="needs-empty">Nothing needs you.</div>}
        {list.map((n, i) => {
          const where = placeOf(vault, n.pieces, n.gates)
          const service = serviceOf(n)
          const firstQuiet = levelOf(n.kind) === 'look' && (i === 0 || levelOf(list[i - 1].kind) !== 'look')
          return (
            <Fragment key={n.id}>
            {firstQuiet && <p className="need-group">Worth a look when you have a minute.{dotted ? ' The dots on the map mark them.' : ''}</p>}
            <div
              className={`need is-${levelOf(n.kind)} ${n.pieces.length || gateOf(n) ? 'clickable' : ''}`}
              onMouseEnter={() => n.pieces.length && setState({ highlight: new Set(n.pieces) })}
              onMouseLeave={() => setState({ highlight: null })}
              onClick={() => go(n)}
            >
              <NeedMark level={levelOf(n.kind)} />
              <div className="need-text">
                <span className="need-kind">
                  {service && <ServiceMark name={service} size={14} />}
                  {KIND_NAMES[n.kind]}{where && n.kind !== 'secret' ? ` in ${where}` : ''}
                </span>
                {wholeNames(n.message)}
                {n.quote && <blockquote className="need-quote">{n.quote}</blockquote>}
                <NeedActions need={n} />
              </div>
            </div>
            </Fragment>
          )
        })}
        {/* On a phone the list covers the screen, so it needs its own way out at its foot. */}
        <button className="btn btn-paper needs-close" onClick={() => setState({ panel: null, highlight: null })}>Close</button>
      </div>
    </>
  )
}

function AddMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
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
    // The item you pressed is about to go, so what opens next hands focus back to Add when it closes.
    button.current?.focus()
    fn()
  }

  return (
    <div className="add-menu" ref={ref}>
      <button ref={button} className="btn btn-paper" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="plus" size={13} /> Add
      </button>
      {open && (
        <div className="menu panel" role="menu">
          <button className="menu-item" role="menuitem" onClick={act(() => document.getElementById('add-files')?.click())}>Documents from your computer</button>
          <button className="menu-item" role="menuitem" onClick={act(() => setState({ sheet: { kind: 'add-service' } }))}>A tool you use</button>
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
  const shredding = useStore((s) => !!s.shred)
  const content = useStore((s) => contentOf(s))
  const [changesOpen, setChangesOpen] = useState(false)
  useEscape(() => setChangesOpen(false), changesOpen)

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
      // A service with no known price isn't free, so a bill of nothing but those isn't $0.
      unknown: content.costs.length > 0 && content.costs.every((c) => c.amount === null),
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
          {total.unknown ? (
            <span className="cost-per cost-none">No prices yet</span>
          ) : (
            <>
              <span className="cost-figure">
                {total.approx ? '≈' : ''}{total.main}
                {total.others.length > 0 && <span className="cost-others"> + {total.others.join(' + ')}</span>}
                {total.others.length > 0 && <span className="cost-more" aria-hidden="true">+</span>}
              </span>
              <span className="cost-per"><span className="per-long">a {period}<span className="optional"> on tools</span></span><span className="per-short">/{period === 'year' ? 'yr' : 'mo'}</span></span>
            </>
          )}
        </button>
      )}
      {vault && <AddMenu />}
      {vault && (vault.pieces.length > 0 || isLive) && (
        <div className={`live-state ${isLive ? 'is-live' : 'is-not-live'} ${clean || barHasUpdate ? 'is-current' : ''} ${isLive && !clean ? 'has-changes' : ''}`} title={clean ? 'Everything on this map is live.' : isLive ? `Readers are still seeing the last update.` : 'Saved in this browser. No reader can open it until it goes live.'}>
          {isLive && !clean ? (
            <button className="live-word live-changes" aria-expanded={changesOpen} onClick={() => setChangesOpen(!changesOpen)}>
              <i className="live-dot" aria-hidden="true" />
              {plural(p?.changes ?? 0, 'change')} not live
              <Icon name="chevron" size={12} />
            </button>
          ) : (
            <span className="live-word">
              <i className="live-dot" aria-hidden="true" />
              {clean ? 'Live, up to date' : 'Not live'}
            </span>
          )}
          {!clean && !barHasUpdate && (
            <button
              // It can't do this right now, and a greyed button that says nothing can't be told from a broken one, so it looks held back and a press gets the reason.
              className={`btn btn-ink go-live ${isSampleHosted || shredding ? 'is-held' : ''}`}
              aria-busy={publishing}
              disabled={publishing}
              title={isLive ? `${plural(p?.changes ?? 0, 'change')} not live yet.` : 'Puts an encrypted copy online for your readers. Nothing can be read without a password.'}
              onClick={() => {
                if (shredding) toast('Wait for the files to finish.')
                else if (isSampleHosted) toast("The sample can't go live here, because it's a made-up company.", { label: 'Start your own map', run: () => void newMap() })
                else void publishAndSay()
              }}
            >
              {publishing ? (isLive ? 'Updating' : 'Going live') : isLive ? 'Update' : 'Go live'}
            </button>
          )}
          {changesOpen && isLive && !clean && vault && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 29 }} onClick={() => setChangesOpen(false)} />
              <div className="changes panel" role="dialog" aria-label="What isn't live yet">
                <p>Your readers still see the last update, without these:</p>
                <ul>
                  {whatChanged(vault).slice(0, 8).map((c, i) => <li key={i}>{c}</li>)}
                  {whatChanged(vault).length > 8 && <li className="quiet">and {whatChanged(vault).length - 8} more</li>}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Renders nothing. It's in the top line so the top line can fit itself once it's there. */
export function FitTop() {
  useFitTop()
  return null
}
