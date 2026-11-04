// ⌘K finds anything on the map, or any action. No animation: it opens a hundred times a day.

import { useEffect, useMemo, useRef, useState } from 'react'
import { llmsFull, viewFor } from '../../core/agent.ts'
import { search } from '../../core/search.ts'
import type { Password, PieceKind } from '../../core/types.ts'
import { addArea, addPiece, createPassword, downloadText, newMap, publishAndSay, setTheme, tidyMap, toast } from '../actions.ts'
import { getState, setState, useStore } from '../store.ts'
import { PieceMark, useEscape } from './bits.tsx'
import { contentOf } from './data.ts'
import type { MapView } from '../map/MapView.ts'

interface Item {
  id: string
  group: string
  title: string
  note?: string
  meta?: string
  kind?: PieceKind
  /** Other words it answers to. */
  words?: string
  run: () => void
}

const NO_PASSWORDS: Password[] = []

export function CommandK({ map }: { map: React.RefObject<MapView | null> }) {
  const content = useStore((s) => contentOf(s))
  const readOnly = useStore((s) => !!s.view)
  const dollars = useStore((s) => s.dollars)
  const theme = useStore((s) => s.theme)
  const server = useStore((s) => s.server)
  const published = useStore((s) => !!s.vault?.published)
  const passwords = useStore((s) => s.vault?.passwords ?? NO_PASSWORDS)
  const [q, setQ] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const close = () => setState({ cmdk: false })
  useEscape(close)

  const actions: Item[] = useMemo(() => {
    const a: Item[] = []
    if (content?.costs) a.push({ id: 'dollars', group: 'Actions', title: dollars ? 'Hide prices' : 'Show prices', meta: '$', run: () => setState({ dollars: !dollars }) })
    a.push({ id: 'fit', group: 'Actions', title: 'Fit the whole map', meta: '⇧1', run: () => map.current?.fit() })
    if (!readOnly) {
      a.push(
        { id: 'publish', group: 'Actions', title: published ? 'Update the live map' : 'Go live', run: () => void publishAndSay() },
        { id: 'new-pw', group: 'Actions', title: 'Add a reader', run: () => { setState({ panel: 'share', area: null }); createPassword() } },
        { id: 'add-files', group: 'Actions', title: 'Add documents', run: () => document.getElementById('add-files')?.click() },
        { id: 'add-piece', group: 'Actions', title: 'Add a note', run: () => addPiece() },
        { id: 'add-service', group: 'Actions', title: 'Add a service', run: () => setState({ sheet: { kind: 'add-service' } }) },
        { id: 'add-area', group: 'Actions', title: 'Add an area', run: () => addArea() },
        { id: 'needs', group: 'Actions', title: 'Things that need you', run: () => setState({ panel: 'needs' }) },
        // People look for how to hand this over by what it's made of, so these answer to those words too.
        ...passwords.map((p) => ({ id: `connect-${p.id}`, group: 'Actions', title: `Connect ${p.name}`, words: 'password key link share mcp connector token', run: () => setState({ lens: p.id, panel: 'share', selected: null, area: null }) })),
        { id: 'tidy', group: 'Actions', title: 'Tidy up the map', run: () => { tidyMap(); map.current?.fit() } },
        {
          id: 'export',
          group: 'Actions',
          title: 'Download everything as COMPANY_MAP.md',
          run: () => {
            const v = getState().vault!
            const all = { id: '', name: 'Owner', key: '', gates: v.gates.map((g) => g.id), remote: false, createdAt: 0 }
            downloadText('COMPANY_MAP.md', llmsFull(viewFor(v, all)))
            toast('Downloaded COMPANY_MAP.md. It is not encrypted.')
          },
        },
        { id: 'new-map', group: 'Actions', title: 'New map', run: () => void newMap() },
        { id: 'delete-map', group: 'Actions', title: 'Delete this map', run: () => setState({ sheet: { kind: 'confirm-delete' } }) },
      )
      if (server?.mode === 'hosted' || server?.donateUrl) a.push({ id: 'donate', group: 'Actions', title: 'Donate', run: () => setState({ sheet: { kind: 'donate' } }) })
    }
    a.push({ id: 'theme', group: 'Actions', title: theme === 'dark' ? 'Light mode' : 'Dark mode', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') })
    return a
  }, [content?.costs, dollars, readOnly, theme, server, published, passwords, map])

  const items: Item[] = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const open = (id: string) => () => {
      setState({ selected: id })
      map.current?.focusPiece(id)
    }
    if (!needle) {
      const recent = (content?.pieces ?? []).filter((p) => p.always === 'approved').slice(0, 4)
      return [
        ...actions.slice(0, 7),
        ...recent.map((p) => ({ id: p.id, group: 'Rules every AI tool follows', title: p.title, kind: p.kind, run: open(p.id) })),
      ]
    }
    const pieces = content?.pieces ?? []
    const links = content?.links ?? []
    const byTitle = pieces.filter((p) => p.title.toLowerCase().includes(needle))
    const hits = search(pieces, links, needle, 12).map((h) => h.piece)
    const seen = new Set<string>()
    const found = [...byTitle, ...hits].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).slice(0, 12)
    const gateName = (id: string) => content?.gates.find((g) => g.id === id)?.name
    // Areas open from the map, so this is also how a keyboard reaches them.
    const areas = (content?.gates ?? [])
      .filter((g) => g.name.toLowerCase().includes(needle))
      .map((g) => ({ id: `area-${g.id}`, group: 'Areas', title: g.name, meta: `${pieces.filter((p) => p.gate === g.id).length}`, run: () => setState({ area: g.id, panel: 'area', selected: null }) }))
    // If you've typed the start of an action's name, you meant the action.
    const matching = actions.filter((a) => a.title.toLowerCase().includes(needle) || a.words?.includes(needle))
    const exact = matching.filter((a) => a.title.toLowerCase().startsWith(needle))
    const rest = matching.filter((a) => !exact.includes(a))
    return [
      ...exact,
      ...areas,
      ...found.map((p) => ({ id: p.id, group: 'On the map', title: p.title, note: p.summary, meta: gateName(p.gate), kind: p.kind, run: open(p.id) })),
      ...rest,
    ]
  }, [q, content, actions, map])

  useEffect(() => setIndex(0), [q])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const run = (item?: Item) => {
    if (!item) return
    close()
    item.run()
  }

  let lastGroup = ''
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={close} />
      <div className="cmdk panel" role="dialog" aria-label="Search and actions">
        <input
          autoFocus
          value={q}
          placeholder="Search the map, or say what you want to do"
          aria-label="Search"
          role="combobox"
          aria-expanded="true"
          aria-controls="cmdk-list"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex((i) => Math.min(i + 1, items.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              run(items[index])
            }
          }}
        />
        <div className="cmdk-list" id="cmdk-list" ref={listRef} role="listbox">
          {!items.length && <div className="needs-empty">Nothing matches. Try other words.</div>}
          {items.map((item, i) => {
            const head = item.group !== lastGroup
            lastGroup = item.group
            return (
              <div key={item.id}>
                {head && <div className="cmdk-group">{item.group}</div>}
                <button className="cmdk-item" role="option" aria-selected={i === index} onMouseMove={() => setIndex(i)} onClick={() => run(item)}>
                  {item.kind && <PieceMark kind={item.kind} name={item.title} size={13} />}
                  <span className="title">
                    {item.title}
                    {item.note && <small>{item.note}</small>}
                  </span>
                  {item.meta && <span className="meta">{item.meta}</span>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
