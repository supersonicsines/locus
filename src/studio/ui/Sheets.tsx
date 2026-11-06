// Sheets: the few moments that deserve to interrupt the map.

import { useEffect, useMemo, useState } from 'react'
import { CATALOG, CATALOG_AS_OF, findInCatalog, type CatalogEntry } from '../../core/catalog.ts'
import { PACKAGE } from '../../core/agent.ts'
import type { Gate } from '../../core/types.ts'
import { generateOwnerKey, looksLikeKey } from '../../core/seal.ts'
import { shredLocally, DEFAULT_GATES } from '../../core/shred-local.ts'
import { addPiece, askFit, clearToasts, copy, createPassword, deleteCurrentMap, downloadText, lastPublishFailure, placeNewPieces, publish, refreshServer, setCost, signIn, signInWithGoogle, signinTrouble, signOut, siteAddress, toast, updateVault } from '../actions.ts'
import { MODELS, shredWithClaude } from '../shred/claude.ts'
import { estimateTokens, extract, type Extracted } from '../shred/extract.ts'
import { alreadyRejected, merge } from '../shred/merge.ts'
import { getState, setState, storage, useStore, type PublishDraft } from '../store.ts'
import { newId } from '../../core/seal.ts'
import { normaliseName, type KnownService } from '../logos/lookup.ts'
import { allServices, serviceFor, useLogosVersion } from '../logos/store.ts'
import { Icon, listWords, plural, ServiceMark, useEscape, usePanelFocus } from './bits.tsx'

function Sheet({ children, onClose, label }: { children: React.ReactNode; onClose?: () => void; label: string }) {
  useEscape(() => onClose?.(), !!onClose)
  const ref = usePanelFocus<HTMLDivElement>(label)
  // What was said before this opened would only sit on top of it, sometimes on the very button it's talking about.
  useEffect(() => clearToasts(), [])
  // A sheet interrupts the page, so Tab stays in it, and focus goes back where it came from afterwards.
  const keepFocus = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !ref.current) return
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex="0"]')).filter((x) => !(x as HTMLButtonElement).disabled && x.offsetParent !== null)
    if (!items.length) return e.preventDefault()
    const first = items[0]
    const last = items[items.length - 1]
    const at = document.activeElement
    if (e.shiftKey && (at === first || at === ref.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && at === last) {
      e.preventDefault()
      first.focus()
    }
  }
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet-wrap">
        <div className="sheet" role="dialog" aria-modal="true" aria-label={label} ref={ref} tabIndex={-1} onKeyDown={keepFocus}>
          <div className="sheet-inner">{children}</div>
        </div>
      </div>
    </>
  )
}

const close = () => setState({ sheet: null })

const nameRule = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32)
}

/** Running your own host, for when this one has no room. */
function SelfHost() {
  const [copied, setCopied] = useState(false)
  return (
    <div className="code-block">
      <code>npx -y {PACKAGE} serve</code>
      <button className="btn btn-paper code-copy" aria-label="Copy the command" onClick={async () => { if (await copy(`npx -y ${PACKAGE} serve`, null)) setCopied(true) }}>
        <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function PublishSheet({ draft, signinFailed }: { draft?: PublishDraft; signinFailed?: string }) {
  const vault = useStore((s) => s.vault)!
  const server = useStore((s) => s.server)
  const me = useStore((s) => s.me)
  const publishing = useStore((s) => s.publishing)
  const [company, setCompany] = useState(draft?.company ?? (vault.company.name === 'Untitled company' ? '' : vault.company.name))
  const [name, setName] = useState(draft?.name ?? slugify(vault.company.name === 'Untitled company' ? '' : vault.company.name))
  const [touched, setTouched] = useState(draft?.touched ?? false)
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'free' | 'taken' | 'reserved' | 'invalid' | 'unreachable'>('idle')
  const [tries, setTries] = useState(0)
  // Back from signing in with Google, it's the key that was already saved, not a new one.
  const [ownerKey] = useState(() => draft?.ownerKey ?? generateOwnerKey())
  const [saved, setSaved] = useState(draft?.saved ?? false)
  const [error, setError] = useState(signinFailed ? signinTrouble(signinFailed) : '')
  const [copiedKey, setCopiedKey] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  // The host turned the map away for its size. Pressing again can't change that, so the button says so, as it does for every other refusal.
  const [tooBig, setTooBig] = useState(false)
  // The host wanted a Google account, or a fresh sign-in, or this account has all the addresses it can have.
  const [needsSignin, setNeedsSignin] = useState(false)
  const [accountFull, setAccountFull] = useState(false)

  const full = !!server?.accounts && server.accounts.used >= server.accounts.max
  const cap = server?.mapsPerAccount ?? null
  const mine = me?.signedIn ? (me.maps ?? []) : []
  const signinFirst = !!server?.signinToClaim && (!me?.signedIn || needsSignin)
  const capped = !!server?.signinToClaim && !!me?.signedIn && (accountFull || (cap !== null && mine.length >= cap))
  // Going to Google and back takes what's typed here with it. The key only if it was saved, because only then does it matter that it stays the same.
  const toGoogle = () => signInWithGoogle(undefined, { sheet: 'publish', draft: { company, name, touched, ...(saved ? { ownerKey, saved } : {}) } })

  useEffect(() => {
    if (!name) return setAvailability('idle')
    if (!nameRule.test(name)) return setAvailability('invalid')
    setAvailability('checking')
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sites/${name}`)
        const body = await res.json()
        setAvailability(body.available ? 'free' : body.reason === 'taken' ? 'taken' : body.reason === 'reserved' ? 'reserved' : 'invalid')
      } catch {
        setAvailability('unreachable')
      }
    }, 250)
    return () => clearTimeout(t)
  }, [name, tries])

  const address = server?.address.replace('{name}', name || 'yourco').replace(/^https?:\/\//, '') ?? ''
  const domainPart = address.slice((name || 'yourco').length)

  const note: Record<typeof availability, string> = {
    idle: '',
    checking: 'Checking.',
    free: 'Available.',
    taken: 'That address is taken. Try another.',
    reserved: 'That address is reserved. Try another.',
    invalid: 'Use three or more letters, numbers or hyphens.',
    unreachable: "Couldn't reach the host to check that address.",
  }

  const ready = availability === 'free' && saved && !!company.trim() && !publishing && !tooBig
  // The button says the one thing still in the way, in the order you'd come to them.
  const missing = tooBig
    ? 'Too big to go live here'
    : !company.trim()
    ? 'Name your company first'
    : availability === 'unreachable'
      ? "Can't reach the host"
      : availability === 'taken' || availability === 'reserved'
        ? 'Choose another address'
        : availability !== 'free' && availability !== 'checking'
          ? 'Choose an address first'
          : !saved
            ? 'Save your key to continue'
            : 'Go live'

  const go = async () => {
    setError('')
    updateVault((v) => ({
      ...v,
      company: { ...v.company, name: company.trim() },
      site: { name, ownerKey, origin: siteAddress(name), ownerKeySaved: true },
    }))
    // Quiet, because a failure is said here in the sheet, beside what can fix it.
    const ok = await publish({ quiet: true })
    if (ok) {
      setState({ sheet: null })
      // What going live was for. Nothing else on the page says this is the next step.
      const reader = getState().vault?.passwords[0]
      toast(
        `You're live at ${siteAddress(name).replace(/^https?:\/\//, '')}.`,
        reader
          ? { label: `Connect ${reader.name}`, run: () => setState({ lens: reader.id, panel: 'share', selected: null, area: null }) }
          : { label: 'Add a reader', run: () => { createPassword(); setState({ panel: 'share', area: null }) } },
        { status: true },
      )
    } else {
      // Undo the claim locally so another name can be tried.
      updateVault((v) => ({ ...v, site: undefined }))
      const code = lastPublishFailure?.code
      setError(code === 'signin' ? 'Your sign-in with Google has run out. Sign in again, and this address and recovery key stay as they are.' : (lastPublishFailure?.message ?? "Couldn't go live."))
      setTooBig(code === 'too-large' || !!lastPublishFailure?.message.startsWith('This map is too big'))
      setNeedsSignin(code === 'signin')
      setAccountFull(code === 'account-full')
      void refreshServer()
    }
  }

  if (full) {
    return (
      <Sheet label="Every free account is taken" onClose={close}>
        <h2>Every free account is taken</h2>
        <p>
          Your map is still here, in this browser, and you can keep building it. Nobody else can read it until it's live. To go live today, run your own host on a computer with Node.js: it takes one command in a terminal, and it has no limit on accounts.
        </p>
        <SelfHost />
        <div className="actions">
          {server?.donateUrl && (
            <button className="btn btn-paper" onClick={() => setState({ sheet: { kind: 'donate' } })}>Donate</button>
          )}
          <button className="btn btn-ink" onClick={close}>Done</button>
        </div>
      </Sheet>
    )
  }

  if (signinFirst) {
    // Signing in only works at the host's own domain, not at another name it answers to.
    const domain = server?.address.replace(/^https?:\/\/\{name\}\./, '') ?? ''
    return (
      <Sheet label="Go live" onClose={close}>
        <h2>Go live</h2>
        <p>
          This host gives each Google account {cap ? plural(cap, 'address', 'addresses') : 'a few addresses'}, so sign in with Google first. Google only tells the host who you are. It never sees your map, and your recovery key is still the only thing that updates it or brings it back.
        </p>
        {error && <p className="sheet-error" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn btn-quiet" onClick={close}>Not yet</button>
          {server?.google ? (
            <button className="btn btn-ink" onClick={toGoogle}>Sign in with Google</button>
          ) : (
            <button className="btn btn-ink" disabled>Sign in at {domain}</button>
          )}
        </div>
      </Sheet>
    )
  }

  if (capped) {
    return (
      <Sheet label="No more addresses" onClose={close}>
        <h2>No more addresses</h2>
        <p>
          Each Google account can have {plural(cap ?? mine.length, 'address', 'addresses')} on this host, and {me?.email || 'yours'} has {mine.length ? listWords(mine) : 'them'}. Your map is still here, in this browser. To go live, delete a map you don't need, sign in with another Google account, or run your own host, which has no limit.
        </p>
        <SelfHost />
        <div className="actions">
          <button className="btn btn-quiet" onClick={close}>Not yet</button>
          <button className="btn btn-paper" onClick={toGoogle}>Use another account</button>
          <button className="btn btn-ink" onClick={close}>Done</button>
        </div>
      </Sheet>
    )
  }

  const left = cap !== null ? cap - mine.length : null

  return (
    <Sheet label="Go live" onClose={publishing ? undefined : close}>
      <h2>Go live</h2>
      <p>This encrypts the map on this device and puts that copy online at your address. The host, the server that keeps it online, only stores the encrypted copy, and nothing opens without a password.</p>
      {server?.signinToClaim && me?.signedIn && (
        <p className="hint" style={{ margin: '0 0 4px' }}>
          Signed in with Google as {me.email}{left !== null ? `, which can take ${left === 1 ? 'one more address' : `${left} more addresses`} here` : ''}.
        </p>
      )}

      <label htmlFor="company">Company name</label>
      <input
        id="company"
        className="field"
        autoFocus
        value={company}
        onChange={(e) => {
          setCompany(e.target.value)
          if (!touched) setName(slugify(e.target.value))
        }}
      />

      <label htmlFor="address">Address</label>
      <div className="address-field">
        <input
          id="address"
          value={name}
          spellCheck={false}
          onChange={(e) => {
            setTouched(true)
            setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
          }}
        />
        <span>{domainPart}</span>
      </div>
      <div className={`field-note ${availability === 'taken' || availability === 'reserved' || availability === 'invalid' || availability === 'unreachable' ? 'is-wrong' : ''}`} aria-live="polite">
        {note[availability]}
        {availability === 'unreachable' && <> <button className="text-btn" onClick={() => setTries(tries + 1)}>Try again</button></>}
      </div>

      <label>Your recovery key</label>
      <code className="owner-key">{ownerKey}</code>
      <p style={{ marginBottom: 8 }}>
        This is your account: it updates your live map, and it brings the map back on another device. <strong style={{ fontWeight: 500, color: 'var(--ink)' }}>Nobody can recover it for you</strong>, so save it in your password manager now.
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn btn-paper"
          onClick={async () => {
            if (await copy(ownerKey, null)) {
              setSaved(true)
              setCopiedKey(true)
            }
          }}
        >
          {copiedKey ? 'Copied' : 'Copy it'}
        </button>
        <button
          className="btn btn-paper"
          onClick={() => {
            downloadText(`locus-recovery-key-${name || 'map'}.txt`, `Locus recovery key for ${name}\n${ownerKey}\n\nNobody can recover this for you.\n`)
            setSaved(true)
            setDownloaded(true)
          }}
        >
          {downloaded ? 'Downloaded' : 'Download it'}
        </button>
      </div>

      {error && <p style={{ margin: '12px 0 0', color: 'var(--ink)' }} role="alert">{error}</p>}

      <div className="actions">
        <button className="btn btn-quiet" disabled={publishing} onClick={close}>Not yet</button>
        <button className="btn btn-ink" aria-busy={publishing} disabled={!ready} onClick={() => void go()} title={!saved ? 'Copy or download your recovery key first' : undefined}>
          {publishing ? 'Going live' : missing}
        </button>
      </div>
    </Sheet>
  )
}

function SignInSheet({ signinFailed }: { signinFailed?: string }) {
  const server = useStore((s) => s.server)
  const me = useStore((s) => s.me)
  // Signed in with Google, the maps this account took here are listed, so only the recovery key needs pasting.
  const mine = me?.signedIn ? (me.maps ?? []) : []
  const [other, setOther] = useState(false)
  const listed = mine.length > 0 && !other
  const [name, setName] = useState(mine.length === 1 ? mine[0] : '')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(signinFailed ? signinTrouble(signinFailed) : '')
  const go = async () => {
    setBusy(true)
    setError('')
    const err = await signIn(name.trim().toLowerCase(), key.trim())
    setBusy(false)
    if (err) setError(err)
  }
  return (
    <Sheet label="Sign in" onClose={close}>
      <h2>Sign in</h2>
      <p>Your recovery key brings your map back from its encrypted copy. It's decrypted here, in this browser.</p>
      {listed ? (
        <>
          <label>Your maps on this host</label>
          {mine.map((n) => (
            <button key={n} className="choice" aria-pressed={name === n} onClick={() => setName(n)}>
              <b>{n}</b>
              <span>{siteAddress(n).replace(/^https?:\/\//, '')}</span>
            </button>
          ))}
          <p className="hint" style={{ margin: '4px 0 0' }}>
            <button className="text-btn" onClick={() => { setOther(true); setName('') }}>Another address</button>
          </p>
        </>
      ) : (
        <>
          <label htmlFor="si-name">Your address</label>
          <input id="si-name" className="field" autoFocus value={name} placeholder="yourco" onChange={(e) => setName(e.target.value)} />
          {server?.google && !me?.signedIn && (
            <p className="hint" style={{ margin: '6px 0 0' }}>
              <button className="text-btn" onClick={() => signInWithGoogle(undefined, { sheet: 'signin' })}>Sign in with Google</button> to choose from the maps your account has here.
            </p>
          )}
        </>
      )}
      <label htmlFor="si-key">Recovery key</label>
      <input id="si-key" className="field mono" autoFocus={listed} value={key} placeholder="lco_" spellCheck={false} onChange={(e) => setKey(e.target.value)} />
      {me?.signedIn && (
        <p className="hint" style={{ margin: '6px 0 0' }}>
          Signed in with Google as {me.email}. <button className="text-btn" onClick={() => void signOut().then((ok) => { if (!ok) setError("Couldn't sign out. Check your connection and try again.") })}>Sign out</button>
        </p>
      )}
      {error && <p style={{ margin: '10px 0 0', color: 'var(--ink)' }} role="alert">{error}</p>}
      <div className="actions">
        <button className="btn btn-quiet" onClick={close}>Cancel</button>
        <button className="btn btn-ink" aria-busy={busy} disabled={busy || !name.trim() || !looksLikeKey(key.trim()) || !key.trim().startsWith('lco_')} onClick={() => void go()}>
          {busy ? 'Signing in' : 'Sign in'}
        </button>
      </div>
    </Sheet>
  )
}

function OwnerKeySheet() {
  const vault = useStore((s) => s.vault)!
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)
  return (
    <Sheet label="Recovery key" onClose={close}>
      <h2>Recovery key</h2>
      <p>This updates your live map, and it brings the map back on another device. Anyone who has it controls this map. Nobody can recover it for you.</p>
      <code className="owner-key">{shown ? vault.site?.ownerKey : `lco_${'•'.repeat(26)}`}</code>
      <div className="actions">
        <button className="btn btn-paper" onClick={() => setShown(!shown)}>{shown ? 'Hide' : 'Show'}</button>
        <button className="btn btn-paper" onClick={async () => { if (await copy(vault.site?.ownerKey ?? '', null)) setCopied(true) }}>{copied ? 'Copied' : 'Copy'}</button>
        <button className="btn btn-ink" onClick={close}>Done</button>
      </div>
    </Sheet>
  )
}

function DonateSheet() {
  const server = useStore((s) => s.server)
  const accounts = server?.accounts
  return (
    <Sheet label="Donate" onClose={close}>
      <h2>Keep it free</h2>
      <p>
        Locus is open source and free to run yourself. Donations pay for the free hosted accounts
        {accounts ? `, of which ${accounts.used} of ${accounts.max} are taken` : ''}.
      </p>
      <div className="actions">
        <button className="btn btn-quiet" onClick={close}>Close</button>
        {server?.donateUrl ? (
          <a className="btn btn-ink" href={server.donateUrl} target="_blank" rel="noreferrer noopener" style={{ textDecoration: 'none' }}>Donate</a>
        ) : (
          <button className="btn btn-ink" disabled>Donations open soon</button>
        )}
      </div>
    </Sheet>
  )
}

function DeleteSheet() {
  const vault = useStore((s) => s.vault)!
  return (
    <Sheet label="Delete this map" onClose={close}>
      <h2>Delete {vault.company.name}?</h2>
      <p>
        This removes the map from this browser{vault.published ? ' and takes it off the host, so no password can read it there. Anything readers already saved, they keep' : ''}. It can't be undone.
      </p>
      <div className="actions">
        <button className="btn btn-quiet" onClick={close}>Keep it</button>
        <button className="btn btn-ink" onClick={() => void deleteCurrentMap()}>Delete</button>
      </div>
    </Sheet>
  )
}

function RenameSheet() {
  const vault = useStore((s) => s.vault)!
  const [name, setName] = useState(vault.company.name)
  const [about, setAbout] = useState(vault.company.about)
  const save = () => {
    updateVault((v) => ({ ...v, company: { name: name.trim() || v.company.name, about: about.trim() } }))
    close()
  }
  return (
    <Sheet label="Company details" onClose={close}>
      <h2>Company details</h2>
      <p>AI tools read this first.</p>
      <label htmlFor="co-name">Name</label>
      <input id="co-name" className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <label htmlFor="co-about">What it does, in one sentence</label>
      <input id="co-about" className="field" value={about} onChange={(e) => setAbout(e.target.value)} />
      <div className="actions">
        <button className="btn btn-quiet" onClick={close}>Cancel</button>
        <button className="btn btn-ink" onClick={save}>Save</button>
      </div>
    </Sheet>
  )
}

/** Each kind of service lands in the gate it most likely belongs to, if the map has that gate. */
const GATE_BY_CATEGORY: Record<string, string> = {
  design: 'brand', marketing: 'brand', code: 'engineering', dev: 'engineering', cloud: 'engineering', hosting: 'engineering', data: 'engineering', ai: 'engineering', security: 'engineering',
  payments: 'money', finance: 'money', legal: 'legal', people: 'people', workspace: 'people', comms: 'people', ops: 'people',
}
const CATEGORY_WORDS: Record<string, string> = {
  cloud: 'hosting', dev: 'developer', ai: 'AI', data: 'data', analytics: 'analytics', product: 'product', design: 'design', workspace: 'workspace', comms: 'communication',
  marketing: 'marketing', sales: 'sales', support: 'support', finance: 'finance', people: 'people', legal: 'legal', security: 'security', ops: 'operations', commerce: 'commerce',
}
const SHOWN_AT_ONCE = 60

/** Where a known service has a checked price, that's the only place one comes from. */
function catalogEntryFor(s: KnownService) {
  for (const name of [s.name, ...s.aliases]) {
    const entry = findInCatalog(name)
    if (entry) return entry
  }
  return undefined
}

function AddServiceSheet() {
  const [q, setQ] = useState('')
  const vault = useStore((s) => s.vault)!
  useLogosVersion()
  const have = useMemo(() => {
    const titles = vault.pieces.filter((p) => p.kind === 'service').map((p) => p.title)
    return { names: new Set(titles.map(normaliseName)), ids: new Set(titles.map((t) => serviceFor(t)?.id)) }
  }, [vault.pieces])
  const needle = normaliseName(q)
  const known = allServices()
  // Until the list arrives, the catalog is what there is.
  const rows = known.length
    ? known
        .filter((s) => !have.ids.has(s.id) && !have.names.has(normaliseName(s.name)))
        .filter((s) => !needle || normaliseName(s.name).includes(needle) || s.aliases.some((a) => normaliseName(a).includes(needle)))
        .slice(0, SHOWN_AT_ONCE)
        .map((s) => ({ name: s.name, service: s as KnownService | undefined, entry: catalogEntryFor(s) }))
    : CATALOG.filter((e) => normaliseName(e.name).includes(needle) && !have.names.has(normaliseName(e.name))).map((e) => ({ name: e.name, service: undefined as KnownService | undefined, entry: e as CatalogEntry | undefined }))
  const exact = !!needle && (rows.some((r) => normaliseName(r.name) === needle) || !!serviceFor(q))

  const add = (name: string, service?: KnownService, entry?: CatalogEntry) => {
    const category = entry?.category ?? service?.category
    const wanted = category ? GATE_BY_CATEGORY[category] ?? 'product' : 'product'
    const gate = vault.gates.some((g) => g.id === wanted) ? wanted : (vault.gates[0]?.id ?? 'product')
    if (!entry) {
      const id = addPiece({
        title: name,
        kind: 'service',
        summary: service ? `The ${CATEGORY_WORDS[service.category]} service the company uses.` : 'A service the company uses.',
        gate: service ? gate : 'product',
        url: service ? `https://${service.domain}` : undefined,
      })
      setCost(id, { amount: null, source: 'you', unit: 'flat' })
      close()
      return
    }
    const id = addPiece({
      title: entry.name,
      kind: 'service',
      summary: `The ${entry.category} service the company uses.`,
      gate,
      url: entry.pricingUrl ? new URL(entry.pricingUrl).origin : undefined,
      ...(entry.mcpUrl ? { mcp: { url: entry.mcpUrl, approved: true } } : {}),
    })
    setCost(id, {
      amount: entry.amount,
      unit: entry.unit,
      source: 'list',
      plan: entry.plan,
      asOf: CATALOG_AS_OF,
      ...(entry.amount !== null ? { listAmount: entry.amount } : {}),
    })
    close()
  }

  return (
    <Sheet label="Add a tool" onClose={close}>
      <h2>Add a tool</h2>
      <p>List prices were checked on {CATALOG_AS_OF}, and show as estimates until you drop an invoice or type your own.</p>
      <input
        className="field"
        autoFocus
        placeholder="Find a tool"
        aria-label="Find a tool"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !q.trim()) return
          const first = rows[0]
          if (first) add(first.name, first.service, first.entry)
          else add(q.trim())
        }}
      />
      <div className="catalog-list">
        {rows.map((r) => (
          <button key={r.name} className="catalog-item" onClick={() => add(r.name, r.service, r.entry)}>
            <ServiceMark name={r.name} size={20} />
            <span className="grow">{r.name}</span>
            {r.entry && <span className="meta">{r.entry.amount === null ? r.entry.plan : `$${r.entry.amount}${r.entry.unit === 'seat' ? ' a seat' : ''}`}</span>}
          </button>
        ))}
        {q.trim() && !exact && (
          <button className="catalog-item" onClick={() => add(q.trim())}>
            <ServiceMark name={q.trim()} size={20} />
            <span className="grow">Add "{q.trim()}"</span>
            <span className="meta">No price yet</span>
          </button>
        )}
      </div>
    </Sheet>
  )
}

/** Why a file can't go on the map, and what would work. */
/** Around here a file has more sections than one file can put on the map. It's a warning, so it doesn't have to be exact. */
const LONG_FILE = 400_000

const READS = 'Locus reads PDFs, Word documents, images and text files such as Markdown, CSV and JSON.'

/** What a run costs beyond the files' own words: the instructions and schema on each call, what comes back, and the step that sorts the map. Rough, and on the safe side, because it's someone's own money. Not yet checked against a real bill. */
const PER_CALL_IN = 1200
const PER_CALL_OUT = 900

/** Why a row in the list won't be added, in the fewest words that are true. */
const whyNot = (note?: string) => (note === 'This file seems to be damaged.' ? 'Damaged' : "Can't read")

function ShredSheet({ files, error, fromSample }: { files: File[]; error?: string; fromSample?: boolean }) {
  const stored = useStore((s) => s.claudeKey)
  const model = useStore((s) => s.claudeModel)
  const [extracted, setExtracted] = useState<Extracted[] | null>(null)
  const [picked, setPicked] = useState<'claude' | 'local' | null>(null)
  const [key, setKey] = useState(stored)
  const saved = useStore((s) => s.claudeKeySaved)
  const [remember, setRemember] = useState(saved)

  useEffect(() => {
    let live = true
    void Promise.all(files.map(extract)).then((r) => live && setExtracted(r))
    return () => {
      live = false
    }
  }, [files])

  const readable = extracted?.filter((f) => f.type !== 'unreadable') ?? []
  const unreadable = extracted?.filter((f) => f.type === 'unreadable') ?? []
  // Images and scanned pages have no text to sort, so only Claude can do anything with them.
  const sortable = readable.filter((f) => f.text.trim())
  // What works right now, so the first press does something. Claude if there's a key or nothing else will do.
  const mode = picked ?? (stored || error || (readable.length && !sortable.length) ? 'claude' : 'local')
  const tokens = extracted ? estimateTokens(readable) : 0
  const m = MODELS.find((x) => x.id === model) ?? MODELS[0]
  // One call for each file, and one more to sort them all.
  const calls = readable.length + 1
  const cost = ((tokens * 1.25 + calls * PER_CALL_IN) / 1e6) * m.input + ((tokens * 0.55 + calls * PER_CALL_OUT) / 1e6) * m.output
  const secrets = extracted?.flatMap((f) => f.secrets) ?? []
  const left = readable.length - sortable.length
  const overflowing = sortable.filter((f) => f.text.length > LONG_FILE).map((f) => f.name)
  const listOf = (names: string[]) => (names.length === 1 ? names[0] : `${names.length} of these`)

  const badKey = mode === 'claude' && !!key && !key.startsWith('sk-')
  const ready = !!extracted && (mode === 'claude' ? !!readable.length && key.startsWith('sk-') : sortable.length > 0)

  const start = () => {
    if (!extracted) return
    if (mode === 'claude') {
      setState({ claudeKey: key, claudeKeySaved: remember })
      if (remember) void storage.set('claudeKey', key)
      else void storage.remove('claudeKey')
    }
    setState({ sheet: null })
    const going = mode === 'claude' ? readable : sortable
    void runShred(going, mode, key, model, extracted.filter((f) => !going.includes(f)).map((f) => f.name), files)
  }

  // Nothing in the pile can be read, so there's no choice to offer.
  if (extracted && !readable.length) {
    const only = extracted.length === 1 ? extracted[0] : null
    return (
      <Sheet label="These files can't be added" onClose={close}>
        <h2>{only ? `Can't add ${only.name}` : `Can't add these ${files.length} files`}</h2>
        {only ? (
          <p>{only.note} {only.note === "Locus can't read this type of file." ? READS : only.note === 'This file seems to be damaged.' ? 'Try saving it again from wherever it came from.' : ''}{/\.(xlsx?|numbers|ods)$/i.test(only.name) ? ' For a spreadsheet, save it as CSV and add that.' : ''}</p>
        ) : (
          <>
            <ul className="file-list">
              {extracted.map((f) => (
                <li key={f.name} className="file-row">
                  <span>{f.name}</span>
                  <span>{whyNot(f.note)}</span>
                </li>
              ))}
            </ul>
            <p style={{ marginTop: 10 }}>{READS} Save them as one of those and add them again.</p>
          </>
        )}
        <div className="actions">
          <button className="btn btn-ink" onClick={close}>Close</button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet label="Add to the map" onClose={close}>
      <h2>{files.length === 1 ? `Add ${files[0].name}` : `Add ${files.length} files`}</h2>
      {fromSample && <p className="sheet-aside">This starts your own map. The sample stays in the menu.</p>}
      {!extracted ? (
        <p>Reading on this device.</p>
      ) : (
        <>
          {files.length > 1 && (
            <ul className="file-list">
              {extracted.map((f) => (
                <li key={f.name} className="file-row">
                  <span>{f.name}</span>
                  <span>{f.type === 'unreadable' ? whyNot(f.note) : f.type === 'image' ? 'Image' : f.pages ? plural(f.pages, 'page') : plural(f.text.trim().split(/\s+/).length, 'word')}</span>
                </li>
              ))}
            </ul>
          )}
          {unreadable.length > 0 && <p className="hint" style={{ margin: '8px 0 0' }}>{unreadable.length === 1 ? "The one marked here won't be added." : "The ones marked here won't be added."} {READS}</p>}
          {secrets.length > 0 && (
            <div className="exposure" role="alert">
              Found {plural(secrets.length, 'secret')} ({[...new Set(secrets)].join(', ')}) and took {secrets.length === 1 ? 'it' : 'them'} out before anything else happens. Change {secrets.length === 1 ? 'it' : 'them'}: anyone with the file has {secrets.length === 1 ? 'it' : 'them'}.
            </div>
          )}

          <button className="choice" aria-pressed={mode === 'local'} onClick={() => setPicked('local')}>
            <b>Sort {files.length === 1 ? 'it' : 'them'} here, with no AI</b>
            <span>Free, and nothing leaves this device. It splits on headings and guesses from keywords, so the map is rougher.{left ? ` It can't read images or scanned pages.` : ''}</span>
          </button>
          <button className="choice" aria-pressed={mode === 'claude'} onClick={() => setPicked('claude')}>
            <b>Read {files.length === 1 ? 'it' : 'them'} with Claude</b>
            <span>The best map: it reads PDFs and images, and finds contradictions and gaps. {files.length === 1 ? 'This file goes' : 'These files go'} to Anthropic, under your own key.</span>
          </button>

          {mode === 'local' && !sortable.length && <p className="hint" style={{ margin: '10px 0 0' }}>There's no text in this to sort. Read it with Claude instead.</p>}
          {mode === 'local' && overflowing.length > 0 && <p className="hint" style={{ margin: '10px 0 0' }}>{listOf(overflowing)} {overflowing.length === 1 ? 'is' : 'are'} very long. Only the start will fit on the map this way, and the map will say so.</p>}

          {mode === 'claude' && (
            <>
              <label htmlFor="claude-key">Your Claude API key</label>
              <input id="claude-key" className="field mono" autoFocus={!stored} value={key} placeholder="sk-ant-" spellCheck={false} autoComplete="off" aria-invalid={badKey} onChange={(e) => setKey(e.target.value.trim())} />
              <p className="hint" style={{ margin: '6px 0 0' }} role={badKey ? 'alert' : undefined}>
                {badKey ? "That doesn't look like a Claude key. They start with sk-ant-. " : ''}
                {!key || badKey ? <>Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer noopener">console.anthropic.com</a>. </> : null}
                You pay Anthropic directly: about ${cost < 0.01 ? '0.01' : cost.toFixed(2)} for this.
              </p>
              <div className="row-between" style={{ marginTop: 10, alignItems: 'center' }}>
                <label className="hint" htmlFor="claude-model" style={{ margin: 0 }}>Model</label>
                <div className="select-wrap">
                  <select id="claude-model" className="select" value={model} onChange={(e) => setState({ claudeModel: e.target.value })}>
                    {MODELS.map((x) => (
                      <option key={x.id} value={x.id}>{x.name}: {x.note}</option>
                    ))}
                  </select>
                  <Icon name="chevron" size={12} />
                </div>
              </div>
              <button className="row-between" style={{ width: '100%', marginTop: 10, alignItems: 'center' }} role="switch" aria-checked={remember} onClick={() => setRemember(!remember)}>
                <span className="hint">Remember the key in this browser, unencrypted</span>
                <span className="switch" aria-checked={remember} />
              </button>
            </>
          )}
        </>
      )}
      {/* The sheet came straight back with the same files on it, so what stopped them goes where the eye ends up, beside the button. */}
      {error && <p className="sheet-error" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn btn-quiet" onClick={close}>Cancel</button>
        <button className="btn btn-ink" aria-busy={!extracted} disabled={!ready} onClick={start}>
          {extracted ? 'Add to the map' : 'Reading the file'}
        </button>
      </div>
    </Sheet>
  )
}

/** What went wrong with Claude, and what to do about it. */
function claudeTrouble(e: any): string {
  const status = e?.status
  const said = String(e?.message ?? '')
  if (status === 401) return 'Claude rejected that key. Check you copied all of it, or sort with no AI.'
  if (status === 403) return "That key isn't allowed to do this. Check its permissions in your Anthropic account."
  if (status === 429) return 'Claude has had too many requests from this key. Wait a minute and try again.'
  if (status === 413) return 'Those files are too big to send in one go. Add them a few at a time, or split them.'
  if (status === 400 && /credit/i.test(said)) return "That key's account has run out of credit. Top it up with Anthropic, or sort with no AI."
  if (status >= 500 && status < 600) return 'Claude is having trouble right now. Try again in a few minutes.'
  if (!status && /connect|network|fetch/i.test(`${e?.name} ${said}`)) return "Couldn't reach Claude. Check your connection and try again."
  if (!status && said) return said
  return "Couldn't finish reading them. Try again in a moment."
}

/** Where items wait during a read, before they've been sorted. It's only a real area if the read stops before it can sort them. */
const ARRIVALS: Gate = { id: 'arrivals', name: 'New arrivals' }

/** Runs a shred, landing pieces on the map as they arrive. */
export async function runShred(files: Extracted[], mode: 'claude' | 'local', key: string, model: string, skipped: string[] = [], originals: File[] = []) {
  const counted = () => getState().vault?.pieces.length ?? 0
  const startedWith = counted()
  // Starting again means the last failure has been heard. It mustn't sit beside the run that fixed it.
  setState({ toasts: getState().toasts.filter((t) => t.action) })
  const landed = () => {
    const added = counted() - startedWith
    if (added <= 0) return 'Those files were on the map already, and it now matches them.'
    return `${plural(added, startedWith ? 'more item' : 'item')} on the map.`
  }
  const skips = skipped.length ? ` Skipped ${skipped.join(', ')}.` : ''
  const stayedOff = (n: number) => (n ? ` ${n === 1 ? 'One thing you rejected stayed' : `${n} things you rejected stayed`} off the map.` : '')
  // Reading them again is the answer to having missed them.
  const clearUnread = () => updateVault((v) => ({ ...v, findings: v.findings.filter((f) => !files.some((x) => f.id === `unread-${x.name}`)) }))

  if (mode === 'local') {
    setState({ shred: { phase: 'Sorting on this device', done: 0, total: 1, pieces: 0 } })
    await new Promise((r) => setTimeout(r, 30))
    const result = shredLocally(files.map((f) => ({ name: f.name, text: f.text })), () => newId())
    const refused = alreadyRejected(getState().vault!, result.pieces)
    clearUnread()
    updateVault((v) => placeNewPieces(merge(v, result)))
    setState({ shred: null })
    askFit()
    // A file too long to sort says so here, and stays in what needs you until someone deals with it.
    toast(`${landed()}${stayedOff(refused)}${result.cut.length ? ` Only the start of ${result.cut.join(', ')} fits. The rest is not on the map.` : ''}${skips}`)
    return
  }

  const m = MODELS.find((x) => x.id === model) ?? MODELS[0]
  let input = 0
  let output = 0
  let count = 0
  setState({ shred: { phase: 'Reading your files', done: 0, total: files.length + 1, pieces: 0 } })

  // Pieces already on the map keep their place and area through a re-drop. Those still waiting from a read that stopped don't count: they haven't been sorted.
  const before = new Set(getState().vault?.pieces.filter((p) => p.gate !== ARRIVALS.id).map((p) => p.id))
  const idMap = new Map<string, string>()
  let refused = 0
  const nameWas = getState().vault?.company.name

  try {
    const result = await shredWithClaude(files, key, model, {
      pieces(pieces, costs) {
        count += pieces.length
        refused += alreadyRejected(getState().vault!, pieces)
        // Pieces land on the map as they're read, in one place, because nothing has sorted them yet.
        updateVault((v) => placeNewPieces(merge(v, { gates: [ARRIVALS], pieces: pieces.map((p) => ({ ...p, gate: ARRIVALS.id })), links: [], costs }, idMap)))
        const s = getState().shred
        if (s) setState({ shred: { ...s, pieces: counted() - startedWith } })
      },
      progress(phase, done, total) {
        const s = getState().shred
        setState({ shred: { phase, done, total, pieces: s?.pieces ?? 0, usage: s?.usage } })
      },
      usage(i, o) {
        input += i
        output += o
      },
    })

    // Now the Cartographer's map replaces the provisional one.
    updateVault((v) => {
      const final = (id: string) => idMap.get(id) ?? id
      const assigned = new Map(result.pieces.map((p) => [final(p.id), p]))
      const gates = [...v.gates]
      const gateIds = new Map<string, string>()
      for (const g of result.gates) {
        const same = gates.find((x) => x.id === g.id) ?? gates.find((x) => x.name.toLowerCase() === g.name.toLowerCase())
        if (same) gateIds.set(g.id, same.id)
        else {
          gates.push(g)
          gateIds.set(g.id, g.id)
        }
      }
      const pieces = v.pieces.map((p) => {
        const r = assigned.get(p.id)
        if (!r) return p
        // Never let a new proposal overwrite an approval that still stands.
        const always = p.always === 'approved' ? p.always : r.always
        if (before.has(p.id)) return { ...p, always }
        return { ...p, gate: gateIds.get(r.gate) ?? r.gate, always, x: undefined, y: undefined }
      })
      const known = new Set(pieces.map((p) => p.id))
      const links = [
        ...v.links,
        ...result.links.map((l) => ({ ...l, from: final(l.from), to: final(l.to) })).filter((l) => known.has(l.from) && known.has(l.to) && l.from !== l.to),
      ]
      const findings = [
        ...v.findings.filter((f) => !files.some((x) => f.id === `unread-${x.name}`)),
        // What a message would have said and lost: this file isn't on the map, until someone adds it again.
        ...result.failed.map((name) => ({ id: `unread-${name}`, kind: 'gap' as const, message: `Claude couldn't read "${name}", so it isn't on the map. Add it again to try once more.`, pieces: [] })),
        ...result.findings.map((f) => ({ ...f, pieces: f.pieces.map(final).filter((id) => known.has(id)) })),
      ]
      const named = v.company.name && v.company.name !== 'Untitled company'
      return placeNewPieces({
        ...v,
        gates: gates.filter((g) => g.id !== ARRIVALS.id || pieces.some((p) => p.gate === ARRIVALS.id)),
        pieces,
        links,
        findings,
        sample: false,
        company: named ? v.company : (result.company ?? v.company),
      })
    })

    const spent = (input / 1e6) * m.input + (output / 1e6) * m.output
    setState({ shred: null })
    askFit()
    const unread = result.failed.length ? ` Claude couldn't read ${result.failed.join(', ')}, so ${result.failed.length === 1 ? "it isn't" : "they aren't"} on the map. Add ${result.failed.length === 1 ? 'it' : 'them'} again to try once more.` : ''
    const nameNow = getState().vault?.company.name
    const named = nameNow && nameNow !== nameWas ? ` Named it ${nameNow}, from your files. Change it from the menu.` : ''
    toast(`${landed()}${stayedOff(refused)}${named} That cost about $${spent < 0.01 ? '0.01' : spent.toFixed(2)}.${skips}${unread}`)
  } catch (e: any) {
    setState({ shred: null })
    const trouble = claudeTrouble(e)
    // Nothing landed, so nothing is lost if the same files come straight back with the reason on them.
    if (!count && originals.length) {
      setState({ sheet: { kind: 'shred', files: originals, error: trouble } })
      return
    }
    askFit()
    toast(`${trouble} What was read so far is on the map, in ${ARRIVALS.name}. Add the files again to finish.`)
  }
}

export function Sheets() {
  const sheet = useStore((s) => s.sheet)
  if (!sheet) return null
  switch (sheet.kind) {
    case 'publish':
      return <PublishSheet draft={sheet.draft} signinFailed={sheet.signinFailed} />
    case 'signin':
      return <SignInSheet signinFailed={sheet.signinFailed} />
    case 'owner-key':
      return <OwnerKeySheet />
    case 'donate':
      return <DonateSheet />
    case 'confirm-delete':
      return <DeleteSheet />
    case 'rename':
      return <RenameSheet />
    case 'add-service':
      return <AddServiceSheet />
    case 'shred':
      return <ShredSheet files={sheet.files} error={sheet.error} fromSample={sheet.fromSample} />
  }
}

export function ShredStrip() {
  const shred = useStore((s) => s.shred)
  if (!shred) return null
  return (
    <div className="shred-strip panel" role="status" aria-live="polite">
      <div className="line">
        <span>{shred.phase}</span>
        {shred.pieces > 0 && <span>{plural(shred.pieces, 'item')}</span>}
      </div>
      <div className="shred-bar">
        <i style={{ width: `${Math.round((shred.done / Math.max(shred.total, 1)) * 100)}%` }} />
      </div>
      <div className="shred-note">Keep this tab open until it's finished.</div>
    </div>
  )
}
