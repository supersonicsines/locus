// Small shared pieces: icons, safe Markdown, the symbol glyph, text that grows.

import { useEffect, useLayoutEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from 'react'
import type { PieceKind } from '../../core/types.ts'
import { drawSymbol } from '../map/symbols.ts'
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

/** A piece's map symbol, drawn the same way as on the map. */
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
    x.lineWidth = 1
    drawSymbol(x, kind, size / 2, size / 2, size * 0.28)
  }, [kind, size, theme])
  return <canvas ref={ref} style={{ width: size, height: size, flex: 'none' }} aria-hidden="true" />
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
      const label = t.slice(1, t.indexOf(']'))
      const href = t.slice(t.indexOf('(') + 1, -1)
      out.push(<a key={i++} href={href} target="_blank" rel="noreferrer noopener">{label}</a>)
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
