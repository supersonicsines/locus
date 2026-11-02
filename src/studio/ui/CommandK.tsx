// ⌘K finds any piece or action. No animation: it opens a hundred times a day.

import { useEffect, useMemo, useRef, useState } from 'react'
import { llmsFull, viewFor } from '../../core/agent.ts'
import { search } from '../../core/search.ts'
import type { PieceKind } from '../../core/types.ts'
import { addPiece, createPassword, downloadText, newMap, publish, setTheme, toast } from '../actions.ts'
import { getState, setState, useStore } from '../store.ts'
import { Symbol, useEscape } from './bits.tsx'
import { contentOf } from './data.ts'
import type { MapView } from '../map/MapView.ts'

interface Item {
  id: string
  group: string
  title: string
  note?: string
  meta?: string
  kind?: PieceKind
  run: () => void
}

export function CommandK({ map }: { map: React.RefObject<MapView | null> }) {
  const content = useStore((s) => contentOf(s))
  const readOnly = useStore((s) => !!s.view)
  const dollars = useStore((s) => s.dollars)
  const theme = useStore((s) => s.theme)
  const server = useStore((s) => s.server)
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
        { id: 'share', group: 'Actions', title: 'Share', run: () => setState({ panel: 'share' }) },
        { id: 'publish', group: 'Actions', title: 'Publish', run: () => void publish() },
        { id: 'new-pw', group: 'Actions', title: 'New password', run: () => { setState({ panel: 'share' }); createPassword() } },
        { id: 'add-piece', group: 'Actions', title: 'Add a piece', run: () => addPiece() },
        { id: 'add-service', group: 'Actions', title: 'Add a service', run: () => setState({ sheet: { kind: 'add-service' } }) },
        { id: 'needs', group: 'Actions', title: 'Things that need you', run: () => setState({ panel: 'needs' }) },
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
      )
      if (server?.mode === 'hosted' || server?.donateUrl) a.push({ id: 'donate', group: 'Actions', title: 'Donate', run: () => setState({ sheet: { kind: 'donate' } }) })
    }
    a.push({ id: 'theme', group: 'Actions', title: theme === 'dark' ? 'Light mode' : 'Dark mode', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') })
    return a
  }, [content?.costs, dollars, readOnly, theme, server, map])

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
        ...recent.map((p) => ({ id: p.id, group: 'Rules every agent follows', title: p.title, kind: p.kind, run: open(p.id) })),
      ]
    }
    const pieces = content?.pieces ?? []
    const links = content?.links ?? []
    const byTitle = pieces.filter((p) => p.title.toLowerCase().includes(needle))
    const hits = search(pieces, links, needle, 12).map((h) => h.piece)
    const seen = new Set<string>()
    const found = [...byTitle, ...hits].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).slice(0, 12)
    const gateName = (id: string) => content?.gates.find((g) => g.id === id)?.name
    return [
      ...found.map((p) => ({ id: p.id, group: 'Pieces', title: p.title, note: p.summary, meta: gateName(p.gate), kind: p.kind, run: open(p.id) })),
      ...actions.filter((a) => a.title.toLowerCase().includes(needle)),
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
          placeholder="Find a piece, or do something"
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
                  {item.kind && <Symbol kind={item.kind} size={13} />}
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
