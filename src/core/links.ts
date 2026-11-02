// Pulls a Markdown link apart. Only http and https ever become a link: documents
// are untrusted, and a vscode: or file: link in one is an attack on whoever clicks it.

const SAFE = /^https?:\/\//i

export function isSafeUrl(url: string): boolean {
  return SAFE.test(url)
}

export function linkParts(token: string): { label: string; href: string | null } {
  const split = token.indexOf('](')
  const label = token.slice(1, split)
  const href = token.slice(split + 2, -1)
  return { label, href: isSafeUrl(href) ? href : null }
}
