// The website, at /. What Locus is, shown with the map's own pieces, and how to run your own.

import { useEffect, useState, type ReactNode } from 'react'
import { PACKAGE } from '../../core/agent.ts'
import { copy } from '../actions.ts'
import { setState, useStore } from '../store.ts'
import { REPO_URL, SiteHeader, ThemeButton, useSitePage } from './frame.tsx'
import { Mark } from './Mark.tsx'
import { ConnectMotion } from './motion/Connect.tsx'
import { CostsMotion } from './motion/Costs.tsx'
import { EncryptedMotion } from './motion/Encrypted.tsx'
import { MapFormsMotion } from './motion/MapForms.tsx'
import { SealMotion } from './motion/Seal.tsx'
import { Link, onboarded } from './route.tsx'
import './site.css'

/** A feature, led by its graphic. The first has no graphic of its own here, because the hero shows it: its words and facts stand side by side. */
function Feature({ id, n, label, title, graphic, children, facts }: { id: string; n: number; label: string; title: string; graphic?: ReactNode; children: ReactNode; facts: ReactNode[] }) {
  const list = (
    <ul className="facts">
      {facts.map((f, i) => (
        <li key={i}>{f}</li>
      ))}
    </ul>
  )
  return (
    <section className={`feature ${graphic ? '' : 'is-bare'}`} id={id} aria-labelledby={`${id}-title`}>
      {graphic && <div className="plate">{graphic}</div>}
      <div className="feature-text">
        <p className="eyebrow">
          <span className="eyebrow-n">{String(n).padStart(2, '0')}</span>
          {label}
        </p>
        <h2 id={`${id}-title`}>{title}</h2>
        <p className="feature-body">{children}</p>
        {graphic && list}
      </div>
      {!graphic && list}
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

/** One of the documents every host serves itself, the version that's running here, as plain text. */
function Doc({ path, children }: { path: string; children: ReactNode }) {
  return (
    <a href={path} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  )
}

export function Home() {
  useSitePage('Locus: a map of your company that any agent can read')
  const list = useStore((s) => s.vaultList)
  const server = useStore((s) => s.server)
  const hasOwn = list.some((m) => !m.sample)
  const accounts = server?.accounts
  const donate = server?.mode === 'hosted' || !!server?.donateUrl
  // Someone who's been through the first steps doesn't need them again: a new map starts at the last of them.
  const start = onboarded() ? { to: '/start?step=begin', words: hasOwn ? 'Start another map' : 'Start a map' } : { to: '/start', words: 'Get started' }

  return (
    <div className="site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader animated>
        {/* Each a step in the history, so Back returns to where you were on the page. */}
        <nav className="site-nav" aria-label="On this page">
          <Link to="/#how">How it works</Link>
          <Link to="/#security">Security</Link>
          <Link to="/#run">Run your own</Link>
        </nav>
        <ThemeButton />
        {hasOwn ? (
          <Link to="/map" className="btn btn-ink site-cta">
            Open your map
          </Link>
        ) : (
          <Link to={start.to} className="btn btn-ink site-cta">
            {start.words}
          </Link>
        )}
      </SiteHeader>

      <main id="main" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-text">
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
            <Link to={start.to} className={`btn ${hasOwn ? 'btn-paper' : 'btn-ink'} btn-lg`}>
              {start.words}
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
          </div>
          {/* What Locus is, shown rather than said: files in, a secret struck out, a map comes up. */}
          <div className="plate hero-plate">
            <MapFormsMotion hero />
          </div>
        </section>

        <Feature
          id="how"
          n={1}
          label="Your documents"
          title="Your documents become one map."
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
          title="One command connects an agent."
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
              The <Doc path="/docs/SECURITY.md">threat model</Doc> says plainly what isn't protected. The code hasn't had a professional audit.
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
              note={
                <>
                  From a clone of the {REPO_URL ? <a href={REPO_URL} target="_blank" rel="noreferrer noopener">repository</a> : 'repository'}. Set your domain in .env; Caddy gets a certificate for it and for every address on it.
                </>
              }
            />
          </div>
          <div className="run-note">
            <p>
              <b>On a public domain, always run hosted mode,</b> even for a host that's yours alone, with one account. Plain self-host mode has no account cap, so anyone could claim names and fill your disk. The Compose file sets both.
            </p>
            <p>
              Put it behind HTTPS, never behind a CDN that decrypts, and back up its data folder. <Doc path="/docs/SELF-HOSTING.md">The guide to running your own</Doc> walks through each way, and <Doc path="/docs/SECURITY.md">the security policy</Doc> says what it does and doesn't protect.
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
          {/* The reader most convinced is the one at the bottom, so the way on is here too. */}
          {hasOwn ? <Link to="/map">Open your map</Link> : <Link to={start.to}>{start.words}</Link>}
          <Link to="/example">See an example</Link>
          <Doc path="/docs/SELF-HOSTING.md">Running your own</Doc>
          <Doc path="/docs/SECURITY.md">Security</Doc>
          {REPO_URL && (
            <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
              Source
            </a>
          )}
          <a href="/licenses/LICENSE-Locus.txt" target="_blank" rel="noreferrer noopener">
            MIT licence
          </a>
          <a href="/licenses/NOTICE.txt" target="_blank" rel="noreferrer noopener">
            Notices
          </a>
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
