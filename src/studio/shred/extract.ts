// Reads dropped files into text, on this machine. Secrets are removed here,
// before anything can be sent anywhere.

import { scrubSecrets } from '../../core/secrets.ts'

export interface Extracted {
  name: string
  size: number
  type: 'text' | 'pdf' | 'image' | 'unreadable'
  text: string
  /** For sending to Claude natively. Dropped if a secret was found in the file. */
  base64?: string
  mediaType?: string
  pages?: number
  secrets: string[]
  note?: string
}

const TEXT = /\.(md|markdown|txt|text|json|csv|tsv|yaml|yml|toml|html?|xml|css|scss|tokens|mdx|log)$/i
const IMAGE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,noscript').forEach((n) => n.remove())
  return doc.body?.textContent?.replace(/\n{3,}/g, '\n\n').trim() ?? ''
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function readPdf(buffer: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: buffer.slice(0), disableFontFace: true }).promise
  const out: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let line = ''
    for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
      line += item.str ?? ''
      if (item.hasEOL) line += '\n'
    }
    out.push(line)
  }
  return { text: out.join('\n\n'), pages: doc.numPages }
}

async function readDocx(buffer: ArrayBuffer): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const files = unzipSync(new Uint8Array(buffer))
  const xml = files['word/document.xml']
  if (!xml) throw new Error('No document in this file')
  return strFromU8(xml)
    .replace(/<\/w:p>/g, '\n\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim()
}

/** Text with nothing in it can't make an item, so it says why and doesn't pretend to be readable. */
function orEmpty(out: Extracted): Extracted {
  return out.text.trim() ? out : { ...out, type: 'unreadable', note: 'There is nothing in this file.' }
}

export async function extract(file: File): Promise<Extracted> {
  const base = { name: file.name, size: file.size }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  try {
    if (ext === 'pdf') {
      const buffer = await file.arrayBuffer()
      const { text, pages } = await readPdf(buffer)
      const { text: clean, found } = scrubSecrets(text)
      return {
        ...base,
        type: 'pdf',
        text: clean,
        pages,
        secrets: found,
        // A PDF with a secret in it never leaves as a PDF. Only the cleaned text can.
        ...(found.length ? {} : { base64: toBase64(buffer), mediaType: 'application/pdf' }),
      }
    }
    if (IMAGE[ext]) {
      const buffer = await file.arrayBuffer()
      return { ...base, type: 'image', text: '', secrets: [], base64: toBase64(buffer), mediaType: IMAGE[ext], note: 'Only Claude can read images.' }
    }
    if (ext === 'docx') {
      const raw = await readDocx(await file.arrayBuffer())
      const scrubbed = scrubSecrets(raw)
      return orEmpty({ ...base, type: 'text', text: scrubbed.text, secrets: scrubbed.found })
    }
    if (TEXT.test(file.name) || file.type.startsWith('text/')) {
      let raw = await file.text()
      if (/\.html?$/i.test(file.name)) raw = stripHtml(raw)
      const scrubbed = scrubSecrets(raw)
      return orEmpty({ ...base, type: 'text', text: scrubbed.text, secrets: scrubbed.found })
    }
  } catch {
    return { ...base, type: 'unreadable', text: '', secrets: [], note: 'This file seems to be damaged.' }
  }
  return { ...base, type: 'unreadable', text: '', secrets: [], note: "Vadere can't read this type of file." }
}

/** A rough guess at tokens, for the estimate shown before a Claude run. */
export function estimateTokens(files: Extracted[]): number {
  let total = 0
  for (const f of files) {
    if (f.type === 'image') total += 1500
    else if (f.type === 'pdf' && f.base64) total += f.text.length / 4 + (f.pages ?? 1) * 1500
    else total += f.text.length / 4
  }
  return Math.round(total)
}
