// The website, at /. What Locus is, shown with the map's own pieces, and how to run your own.

import { useEffect, useState, type ReactNode } from 'react'
import { PACKAGE } from '../../core/agent.ts'
import { copy } from '../actions.ts'
import { setState, useStore } from '../store.ts'
import { REPO_URL, repoFile, SiteHeader, ThemeButton, useSitePage } from './frame.tsx'
import { Mark } from './Mark.tsx'
import { ConnectMotion } from './motion/Connect.tsx'
import { CostsMotion } from './motion/Costs.tsx'
import { EncryptedMotion } from './motion/Encrypted.tsx'
import { MapFormsMotion } from './motion/MapForms.tsx'
import { SealMotion } from './motion/Seal.tsx'
import { Link } from './route.tsx'
import './site.css'

function Feature({ id, n, label, title, graphic, children, facts }: { id: string; n: number; label: string; title: string; graphic: ReactNode; children: ReactNode; facts: ReactNode[] }) {
  return (
    <section className="feature" id={id} aria-labelledby={`${id}-title`}>
      <div className="plate">{graphic}</div>
      <div className="feature-text">
        <p className="eyebrow">
          <span className="eyebrow-n">{String(n).padStart(2, '0')}</span>
          {label}
        </p>
        <h2 id={`${id}-title`}>{title}</h2>
        <p className="feature-body">{children}</p>
        <ul className="facts">
          {facts.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** A command to copy, the way the Studio shows one. */
function Command({ title, lines, note }: { title: string; lines: string[]; note: ReactNode }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <div className="command">
      <div className="command-head">
        <h3>{title}</h3>
        <button className="btn btn-paper command-copy" aria-label={`Copy: ${title}`} onClick={async () => setCopied(await copy(lines.join('\n'), null))}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="command-code">
        {lines.map((l, i) => (
          <code key={i}>
            <span className="command-prompt" aria-hidden="true">
              ${' '}
            </span>
            {l}
          </code>
        ))}
      </pre>
      <p className="command-note">{note}</p>
    </div>
  )
}

/** A link into the repository, or plain words while it isn't public yet. */
function RepoLink({ path, children }: { path: string; children: ReactNode }) {
  const href = repoFile(path)
  return href ? (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ) : (
    <>{children}</>
  )
}

export function Home() {
  useSitePage('Locus: a map of your company that any agent can read')
  const list = useStore((s) => s.vaultList)
  const server = useStore((s) => s.server)
  const hasOwn = list.some((m) => !m.sample)
  const accounts = server?.accounts
  const donate = server?.mode === 'hosted' || !!server?.donateUrl

  return (
    <div className="site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader>
        <nav className="site-nav" aria-label="On this page">
          <a href="#how">How it works</a>
          <a href="#security">Security</a>
          <a href="#run">Run your own</a>
        </nav>
        <ThemeButton />
        {hasOwn ? (
          <Link to="/map" className="btn btn-ink site-cta">
            Open your map
          </Link>
        ) : (
          <Link to="/start" className="btn btn-ink site-cta">
            Get started
          </Link>
        )}
      </SiteHeader>

      <main id="main" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-brand">
            <Mark size={52} animated />
            <span>Locus</span>
          </div>
          <h1 id="hero-title">A map of your company that any agent can read.</h1>
          <p className="lede">
            Your brand book, contracts, specs and invoices become one map. Each reader gets a password that opens only the areas you choose, and the map is encrypted before it leaves your browser.
          </p>
          <div className="hero-actions">
            {hasOwn && (
              <Link to="/map" className="btn btn-ink btn-lg">
                Open your map
              </Link>
            )}
            <Link to="/start" className={`btn ${hasOwn ? 'btn-paper' : 'btn-ink'} btn-lg`}>
              Get started
            </Link>
            <Link to="/example" className="btn btn-paper btn-lg">
              See an example
            </Link>
          </div>
          <p className="hero-note">
            <span>Free and open source.</span> <span>Nothing leaves this device until you say so.</span>{' '}
            <button className="text-btn" onClick={() => setState({ sheet: { kind: 'signin' } })}>
              Sign in with a recovery key
            </button>
          </p>
          {accounts && (
            <p className="hero-note">
              {accounts.used >= accounts.max ? 'Every free account on this host is taken. You can still build a map here, or run your own.' : `Free on this host while there's room: ${accounts.used} of ${accounts.max} accounts taken.`}
            </p>
          )}
        </section>

        <Feature
          id="how"
          n={1}
          label="Your documents"
          title="Your documents become one map."
          graphic={<MapFormsMotion />}
          facts={[
            'Read with your own Claude key, from the browser, or with no AI at all, on your device.',
            'Secrets are removed before anything leaves.',
            'A rule or MCP server that a document proposes waits for your approval.',
          ]}
        >
          Drop in a brand book, contracts, specs, invoices and exported tokens. They're broken into small items and sorted into areas, along with the tools you run on.
        </Feature>

        <Feature
          id="readers"
          n={2}
          label="Readers"
          title="Each reader opens only what you choose."
          graphic={<SealMotion />}
          facts={[
            'Every password has its own keys, so a sealed area is cryptography, not a setting.',
            'See the exact text an agent gets with that password.',
            'Closing an area takes effect at your next update, and the map says so until then.',
          ]}
        >
          Pick a reader and the map shows what they can see. Press an area to seal it from them.
        </Feature>

        <Feature
          id="agents"
          n={3}
          label="Agents"
          title="One line connects an agent."
          graphic={<ConnectMotion />}
          facts={[
            <>
              With <code>locus mcp</code>, Claude Code and Cursor decrypt on your machine, so the host never sees the password.
            </>,
            'Claude.ai and other cloud tools can read through the host, if you let them.',
            <>
              Anything that can fetch a URL can read <code>/llms.txt</code>.
            </>,
          ]}
        >
          Give an agent one address and one password. It gets the rules to follow, where everything lives and which tool to use for what, and it's told what's closed to it, so it says so instead of guessing.
        </Feature>

        <Feature
          id="security"
          n={4}
          label="Encryption"
          title="Encrypted before it leaves."
          graphic={<EncryptedMotion />}
          facts={[
            'For each map the host keeps a folder holding a sealed bundle and a hash. There is no database.',
            <>
              Anyone can download the bundle, and <code>locus verify</code> shows what it does and doesn't reveal.
            </>,
            <>
              The <RepoLink path="docs/SECURITY.md">threat model</RepoLink> says plainly what isn't protected. The code hasn't had a professional audit.
            </>,
          ]}
        >
          Your map is sealed in this browser before it goes live, so the host stores only ciphertext. When it's live, the sea turns blue.
        </Feature>

        <Feature
          id="costs"
          n={5}
          label="Costs"
          title="What it costs, on the map."
          graphic={<CostsMotion />}
          facts={['From your invoices, your own numbers, or a dated catalog of list prices that always shows as an estimate.', "Prices are sealed in Money, so a reader who can't open it never sees one."]}
        >
          Press the total and every tool's price spreads over the map, so the biggest bills are the biggest places on it.
        </Feature>

        <section className="run" id="run" aria-labelledby="run-title">
          <div className="run-head">
            <p className="eyebrow">
              <span className="eyebrow-n">06</span>
              Open source
            </p>
            <h2 id="run-title">Run your own.</h2>
            <p className="feature-body">
              Locus is MIT licensed and built to be run by anyone. The host has no runtime dependencies and no database: a map is a folder holding a sealed bundle and a hash. Running your own is also the most private way to use it, because the page that decrypts a map in a reader's browser then comes from your server.
            </p>
          </div>
          <div className="run-grid">
            <Command title="On your computer" lines={[`npx -y ${PACKAGE} serve`]} note={<>Needs Node 22 or later. Then open http://localhost:4747.</>} />
            <Command
              title="On a server, with Docker"
              lines={['cp .env.example .env', 'docker compose --profile public up -d']}
              note={<>From a clone of the repository. Set your domain in .env; Caddy gets a certificate for it and for every address on it.</>}
            />
          </div>
          <div className="run-note">
            <p>
              <b>On a public domain, always run hosted mode,</b> even for a host that's yours alone, with one account. Plain self-host mode has no account cap, so anyone could claim names and fill your disk. The Compose file sets both.
            </p>
            <p>
              Put it behind HTTPS, never behind a CDN that decrypts, and back up its data folder.{' '}
              {REPO_URL ? (
                <>
                  <RepoLink path="docs/SELF-HOSTING.md">Running your own</RepoLink> walks through each way.
                </>
              ) : (
                <>The repository's guide to running your own walks through each way.</>
              )}
            </p>
          </div>
        </section>
      </main>

      <footer className="site-foot">
        <div className="site-foot-brand">
          <Mark size={20} />
          <span>Locus{server?.version ? ` ${server.version}` : ''}</span>
        </div>
        <nav className="site-foot-links" aria-label="About Locus">
          <a href="/licenses/LICENSE-Locus.txt" target="_blank" rel="noreferrer noopener">
            MIT licence
          </a>
          <a href="/licenses/NOTICE.txt" target="_blank" rel="noreferrer noopener">
            Notices
          </a>
          {REPO_URL && (
            <>
              <a href={repoFile('docs/SECURITY.md')} target="_blank" rel="noreferrer noopener">
                Security policy
              </a>
              <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
                Source
              </a>
            </>
          )}
          {donate && (
            <button className="site-foot-btn" onClick={() => setState({ sheet: { kind: 'donate' } })}>
              Donate
            </button>
          )}
        </nav>
      </footer>
    </div>
  )
}
