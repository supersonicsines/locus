// Small shared pieces: icons, safe Markdown, the symbol glyph, text that grows.

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { linkParts } from '../../core/links.ts'
import type { Need, NeedLevel } from '../../core/status.ts'
import type { PieceKind } from '../../core/types.ts'
import { changePiece, publishAndSay, rejectItem, updateVault } from '../actions.ts'
import { monogramOf } from '../logos/lookup.ts'
import { logoSource, serviceFor, TILE_PADDING, TILE_RADIUS, useLogosVersion } from '../logos/store.ts'
import { drawSymbol, readerColour } from '../map/symbols.ts'
import { useStore } from '../store.ts'

const paths = {
  close: 'M4 4l8 8M12 4l-8 8',
  plus: 'M8 3v10M3 8h10',
  minus: 'M3 8h10',
  chevron: 'M4 6l4 4 4-4',
  copy: 'M6 6h7v7H6zM3 10V3h7',
  search: 'M7 12A5 5 0 107 2a5 5 0 000 10zM11 11l3 3',
  check: 'M3 8.5l3.2 3L13 4.5',
  back: 'M10 3L5 8l5 5',
}

export function Icon({ name, size = 16 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

/** An item's picture, drawn the same way as on the map. */
export function Symbol({ kind, size = 14 }: { kind: PieceKind; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const theme = useStore((s) => s.theme)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = size * dpr
    c.height = size * dpr
    const x = c.getContext('2d')!
    x.scale(dpr, dpr)
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()
    x.fillStyle = ink
    x.strokeStyle = ink
    drawSymbol(x, kind, size / 2, size / 2, size)
  }, [kind, size, theme])
  return <canvas ref={ref} style={{ width: size, height: size, flex: 'none' }} aria-hidden="true" />
}

/** A service's logo on its tile, or a monogram that never pretends to be a brand. The same shape on the map. */
export function ServiceMark({ name, size = 20 }: { name: string; size?: number }) {
  useLogosVersion()
  const service = serviceFor(name)
  const src = service ? logoSource(service) : null
  const borderRadius = size * TILE_RADIUS
  if (!service || !src) {
    return (
      <span className="svc-tile svc-mono" style={{ width: size, height: size, borderRadius, fontSize: size * 0.5 }} aria-hidden="true">
        {monogramOf(name)}
      </span>
    )
  }
  const inner = service.full ? size : size - 2 * Math.round(size * TILE_PADDING)
  return (
    <span className="svc-tile" style={{ width: size, height: size, borderRadius, background: service.tile ?? '#fff' }} aria-hidden="true">
      <img src={src} width={inner} height={inner} alt="" draggable={false} />
    </span>
  )
}

/** A reader: their tool's logo if they have one, or a round mark in their own colour, the same one the map shows. */
export function ReaderMark({ name, index, size = 22 }: { name: string; index: number; size?: number }) {
  useLogosVersion()
  const service = serviceFor(name)
  if (service?.svg) return <ServiceMark name={name} size={size} />
  return (
    <span className="reader-mark" style={{ width: size, height: size, fontSize: size * 0.54, background: readerColour(index) }} aria-hidden="true">
      {monogramOf(name)}
    </span>
  )
}

/** The same three marks the map uses, so the list and the map point at each other. */
export function NeedMark({ level }: { level: NeedLevel }) {
  return <span className={`need-mark is-${level}`} aria-hidden="true">{level === 'now' ? '!' : level === 'decide' ? '?' : ''}</span>
}

/** The one step that deals with a need, the same wherever it's shown. */
export function NeedActions({ need }: { need: Need }) {
  const vault = useStore((s) => s.vault)
  const publishing = useStore((s) => s.publishing)
  const id = need.pieces[0]
  const act = (fn: () => void) => (e: ReactMouseEvent) => {
    e.stopPropagation()
    fn()
  }
  const settle = () => updateVault((v) => ({ ...v, settled: [...(v.settled ?? []), need.id] }))
  const dismiss = () => updateVault((v) => ({ ...v, findings: v.findings.map((f) => (f.id === need.id ? { ...f, dismissed: true } : f)) }))

  if (need.kind === 'exposure') {
    return (
      <div className="need-actions">
        <button className="btn btn-ink" aria-busy={publishing} disabled={publishing} onClick={act(() => void publishAndSay())}>{publishing ? 'Updating' : 'Update'}</button>
      </div>
    )
  }
  if (need.kind === 'secret') {
    return (
      <div className="need-actions">
        <button className="btn btn-paper" onClick={act(settle)}>I've changed it</button>
      </div>
    )
  }
  if (need.kind === 'proposal') {
    const isRule = need.id.startsWith('rule-')
    const piece = vault?.pieces.find((p) => p.id === id)
    return (
      <div className="need-actions">
        <button className="btn btn-paper" onClick={act(() => (isRule ? changePiece(id, { always: 'approved' }) : piece?.mcp && changePiece(id, { mcp: { ...piece.mcp, approved: true } })))}>Approve</button>
        <button className="btn btn-quiet" onClick={act(() => rejectItem(id))}>Reject</button>
      </div>
    )
  }
  return (
    <div className="need-actions">
      <button className="btn btn-quiet" onClick={act(need.kind === 'conflict' || need.kind === 'gap' ? dismiss : settle)}>Dismiss</button>
    </div>
  )
}

/** What stands for an item in a list: a service's mark, or any other item's picture. */
export function PieceMark({ kind, name, size = 14 }: { kind: PieceKind; name: string; size?: number }) {
  // A logo's tile is wider than a kind's icon, so each stands in a box of one width and every name in a list starts on one edge.
  const box = Math.max(size + 4, 16)
  return (
    <span className="piece-mark" style={{ width: box }}>
      {kind === 'service' ? <ServiceMark name={name} size={box} /> : <Symbol kind={kind} size={size} />}
    </span>
  )
}

/** A textarea that fits its content, for Notion-style editing in place. */
export function GrowingText(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [props.value])
  return <textarea ref={ref} rows={1} {...props} />
}

// A very small Markdown subset, rendered as React elements and never as raw HTML.
// Piece bodies come from untrusted files, so nothing here can execute.

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\(https?:\/\/[^\s)]+\))|(https?:\/\/[^\s)<>]+)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = key
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    if (t.startsWith('`')) out.push(<code key={i++}>{t.slice(1, -1)}</code>)
    else if (t.startsWith('**')) out.push(<strong key={i++} style={{ fontWeight: 400, textDecoration: 'underline', textDecorationThickness: 1, textUnderlineOffset: 3 }}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith('*')) out.push(<span key={i++}>{t.slice(1, -1)}</span>)
    else if (t.startsWith('[')) {
      const { label, href } = linkParts(t)
      out.push(href ? <a key={i++} href={href} target="_blank" rel="noreferrer noopener">{label}</a> : label)
    } else out.push(<a key={i++} href={t} target="_blank" rel="noreferrer noopener">{t}</a>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.split(/\r?\n/)
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      blocks.push(heading[1].length <= 2 ? <h3 key={key++}>{inline(heading[2])}</h3> : <h4 key={key++}>{inline(heading[2])}</h4>)
      i++
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(<li key={items.length}>{inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>)
        i++
      }
      blocks.push(<ul key={key++}>{items}</ul>)
      continue
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(<li key={items.length}>{inline(lines[i].replace(/^\s*\d+[.)]\s+/, ''))}</li>)
        i++
      }
      blocks.push(<ol key={key++}>{items}</ol>)
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*]\s|\s*\d+[.)]\s)/.test(lines[i])) {
      para.push(lines[i])
      i++
    }
    blocks.push(<p key={key++}>{inline(para.join(' '))}</p>)
  }
  return <>{blocks}</>
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

export function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** Whether the last thing the person did was press a key. A ring after a click is only noise on a button nobody is looking at. */
let lastInputWasKeys = false
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => { if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') lastInputWasKeys = true }, true)
  window.addEventListener('pointerdown', () => { lastInputWasKeys = false }, true)
}

/**
 * A panel takes the keyboard when it opens, so Tab walks through it and not through the page behind, and gives it back when it closes.
 * A panel that puts its own cursor somewhere first keeps it there.
 */
export function usePanelFocus<T extends HTMLElement = HTMLElement>(key: unknown) {
  const ref = useRef<T>(null)
  // Read while rendering, and once. By the time an effect runs, a field in the panel may have taken focus for itself.
  const opener = useRef(document.activeElement as HTMLElement | null)
  // How it was opened decides whether the way back shows a ring, whatever was typed in between.
  const byKeys = useRef(lastInputWasKeys)
  useEffect(() => {
    const el = ref.current
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true })
  }, [key])
  useEffect(
    () => () => {
      const from = opener.current
      if (from && from !== document.body && from.isConnected) from.focus({ preventScroll: true, focusVisible: byKeys.current } as FocusOptions)
    },
    [],
  )
  return ref
}

/** Whether this is a phone-sized window, kept up to date as it changes. */
export function useNarrow(width = 720): boolean {
  const [narrow, setNarrow] = useState(() => matchMedia(`(max-width: ${width}px)`).matches)
  useEffect(() => {
    const q = matchMedia(`(max-width: ${width}px)`)
    const on = () => setNarrow(q.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [width])
  return narrow
}

/** Closes on Escape. */
export function useEscape(run: () => void, active = true) {
  useEffect(() => {
    if (!active) return
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        run()
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [run, active])
}
