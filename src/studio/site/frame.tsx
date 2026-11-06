// What the website's pages share: a page that scrolls, its header, and the switch between light and dark.

import { useLayoutEffect, type ReactNode } from 'react'
import { setTheme } from '../actions.ts'
import { useStore } from '../store.ts'
import { Mark } from './Mark.tsx'
import { Link } from './route.tsx'

/**
 * Where the source lives. Written once, here. Empty until the repository is public, and every link that needs it hides until then.
 * Set it to the repository's address, such as https://github.com/<owner>/<repo>, with no trailing slash.
 */
export const REPO_URL: string = ''

/** A file in the repository, on its main branch. */
export const repoFile = (path: string) => (REPO_URL ? `${REPO_URL}/blob/main/${path}` : '')

/** The Studio's page is fixed and never scrolls, because the map is the app. These pages scroll. Set before the first paint, so nothing jumps. */
export function useSitePage(title: string) {
  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.add('site-page')
    const was = document.title
    document.title = title
    return () => {
      root.classList.remove('site-page')
      document.title = was
    }
  }, [title])
}

export function ThemeButton() {
  const theme = useStore((s) => s.theme)
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button className="site-icon-btn" aria-label={`Switch to ${next} mode`} title={`${next[0].toUpperCase()}${next.slice(1)} mode`} onClick={() => setTheme(next)}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor" />
      </svg>
    </button>
  )
}

/** The header every page of the website has: the mark and the name, going home, and whatever the page puts on the right. */
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="site-head">
      <Link to="/" className="site-brand" aria-label="Locus, home">
        <Mark size={26} />
        <span>Locus</span>
      </Link>
      <div className="site-head-right">{children}</div>
    </header>
  )
}
