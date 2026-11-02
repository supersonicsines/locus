// Sheets: the few moments that deserve to interrupt the map.

import { useEffect, useMemo, useState } from 'react'
import { CATALOG, CATALOG_AS_OF } from '../../core/catalog.ts'
import { generateOwnerKey, looksLikeKey } from '../../core/seal.ts'
import { shredLocally, DEFAULT_GATES } from '../../core/shred-local.ts'
import { addPiece, copy, deleteCurrentMap, downloadText, lastPublishFailure, placeNewPieces, publish, refreshServer, setCost, signIn, siteAddress, toast, updateVault } from '../actions.ts'
import { MODELS, shredWithClaude } from '../shred/claude.ts'
import { estimateTokens, extract, type Extracted } from '../shred/extract.ts'
import { merge } from '../shred/merge.ts'
import { getState, setState, storage, useStore } from '../store.ts'
import { newId } from '../../core/seal.ts'
import { plural, useEscape } from './bits.tsx'

function Sheet({ children, onClose, label }: { children: React.ReactNode; onClose?: () => void; label: string }) {
  useEscape(() => onClose?.(), !!onClose)
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet-wrap">
        <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
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

function PublishSheet() {
  const vault = useStore((s) => s.vault)!
  const server = useStore((s) => s.server)
  const publishing = useStore((s) => s.publishing)
  const [company, setCompany] = useState(vault.company.name === 'Untitled company' ? '' : vault.company.name)
  const [name, setName] = useState(slugify(vault.company.name === 'Untitled company' ? '' : vault.company.name))
  const [touched, setTouched] = useState(false)
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'free' | 'taken' | 'reserved' | 'invalid'>('idle')
  const [ownerKey] = useState(generateOwnerKey)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const full = !!server?.accounts && server.accounts.used >= server.accounts.max

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
        setAvailability('idle')
      }
    }, 250)
    return () => clearTimeout(t)
  }, [name])

  const address = server?.address.replace('{name}', name || 'yourco').replace(/^https?:\/\//, '') ?? ''
  const domainPart = address.slice((name || 'yourco').length)

  const note: Record<typeof availability, string> = {
    idle: '',
    checking: 'Checking.',
    free: 'Available.',
    taken: 'Already taken.',
    reserved: 'That name is reserved.',
    invalid: 'Three or more letters, numbers or hyphens.',
  }

  const ready = availability === 'free' && saved && !!company.trim() && !publishing

  const go = async () => {
    setError('')
    updateVault((v) => ({
      ...v,
      company: { ...v.company, name: company.trim() },
      site: { name, ownerKey, origin: siteAddress(name), ownerKeySaved: true },
    }))
    const ok = await publish()
    if (ok) {
      setState({ sheet: null })
      toast(`Published. Live at ${siteAddress(name).replace(/^https?:\/\//, '')}.`)
    } else {
      // Undo the claim locally so another name can be tried.
      updateVault((v) => ({ ...v, site: undefined }))
      setError(lastPublishFailure?.message ?? 'Publishing failed.')
      void refreshServer()
    }
  }

  if (full) {
    return (
      <Sheet label="Every free account is taken" onClose={close}>
        <h2>Every free account is taken</h2>
        <p>
          Your map is safe in this browser, and it works fully without publishing. To publish today, run your own host: it takes one command and has no limits.
        </p>
        <div className="code-block">npx vadere serve</div>
        <div className="actions">
          {server?.donateUrl && (
            <button className="btn btn-paper" onClick={() => setState({ sheet: { kind: 'donate' } })}>Donate</button>
          )}
          <button className="btn btn-ink" onClick={close}>Done</button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet label="Publish your map" onClose={publishing ? undefined : close}>
      <h2>Publish your map</h2>
      <p>This seals the map on this device and puts it at your address. The host stores only ciphertext, and nothing opens until you give someone a password.</p>

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
      <div className="field-note" aria-live="polite">{note[availability]}</div>

      <label>Your owner key</label>
      <code className="owner-key">{ownerKey}</code>
      <p style={{ marginBottom: 8 }}>
        This is your account. It publishes your map and restores it on another device. <strong style={{ fontWeight: 500, color: 'var(--ink)' }}>Nobody can recover it for you</strong>, so save it in your password manager now.
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn btn-paper"
          onClick={async () => {
            if (await copy(ownerKey, 'Owner key copied.')) setSaved(true)
          }}
        >
          Copy it
        </button>
        <button
          className="btn btn-paper"
          onClick={() => {
            downloadText(`vadere-owner-key-${name || 'map'}.txt`, `Vadere owner key for ${name}\n${ownerKey}\n\nNobody can recover this for you.\n`)
            setSaved(true)
          }}
        >
          Download it
        </button>
      </div>

      {error && <p style={{ margin: '12px 0 0', color: 'var(--ink)' }} role="alert">{error}</p>}

      <div className="actions">
        <button className="btn btn-quiet" disabled={publishing} onClick={close}>Not yet</button>
        <button className="btn btn-ink" disabled={!ready} onClick={() => void go()} title={!saved ? 'Copy or download your owner key first' : undefined}>
          {publishing ? 'Publishing' : !saved ? 'Save your key to continue' : 'Publish'}
        </button>
      </div>
    </Sheet>
  )
}

function SignInSheet() {
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
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
      <p>Your owner key restores your map from its sealed copy. It's decrypted here, in this browser.</p>
      <label htmlFor="si-name">Your address name</label>
      <input id="si-name" className="field" autoFocus value={name} placeholder="yourco" onChange={(e) => setName(e.target.value)} />
      <label htmlFor="si-key">Owner key</label>
      <input id="si-key" className="field mono" value={key} placeholder="vdo_" spellCheck={false} onChange={(e) => setKey(e.target.value)} />
      {error && <p style={{ margin: '10px 0 0', color: 'var(--ink)' }} role="alert">{error}</p>}
      <div className="actions">
        <button className="btn btn-quiet" onClick={close}>Cancel</button>
        <button className="btn btn-ink" disabled={busy || !name.trim() || !looksLikeKey(key.trim()) || !key.trim().startsWith('vdo_')} onClick={() => void go()}>
          {busy ? 'Signing in' : 'Sign in'}
        </button>
      </div>
    </Sheet>
  )
}

function OwnerKeySheet() {
  const vault = useStore((s) => s.vault)!
  const [shown, setShown] = useState(false)
  return (
    <Sheet label="Owner key" onClose={close}>
      <h2>Owner key</h2>
      <p>This publishes your map and restores it on another device. Anyone who has it owns this map. Nobody can recover it for you.</p>
      <code className="owner-key">{shown ? vault.site?.ownerKey : `vdo_${'•'.repeat(26)}`}</code>
      <div className="actions">
        <button className="btn btn-paper" onClick={() => setShown(!shown)}>{shown ? 'Hide' : 'Show'}</button>
        <button className="btn btn-paper" onClick={() => void copy(vault.site?.ownerKey ?? '', 'Owner key copied.')}>Copy</button>
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
        Vadere is open source and free to run yourself. Donations pay for the free hosted accounts
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
        This removes the map from this browser{vault.published ? ' and takes it off the host, so every password stops working' : ''}. It can't be undone.
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
      <p>Agents read this first.</p>
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

function AddServiceSheet() {
  const [q, setQ] = useState('')
  const vault = useStore((s) => s.vault)!
  const have = useMemo(() => new Set(vault.pieces.filter((p) => p.kind === 'service').map((p) => p.title.toLowerCase())), [vault.pieces])
  const list = CATALOG.filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()) && !have.has(e.name.toLowerCase()))

  const add = (name: string) => {
    const entry = CATALOG.find((e) => e.name === name)
    if (!entry) {
      const id = addPiece({ title: name, kind: 'service', summary: 'A service the company uses.', gate: 'product' })
      setCost(id, { amount: null, source: 'you', unit: 'flat' })
      close()
      return
    }
    const gateByCat: Record<string, string> = { design: 'brand', code: 'engineering', hosting: 'engineering', data: 'engineering', ai: 'engineering', security: 'engineering', payments: 'money', finance: 'money', legal: 'legal', people: 'people', workspace: 'people' }
    const wanted = gateByCat[entry.category] ?? 'product'
    const gate = vault.gates.some((g) => g.id === wanted) ? wanted : vault.gates[0].id
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
    <Sheet label="Add a service" onClose={close}>
      <h2>Add a service</h2>
      <p>List prices were checked on {CATALOG_AS_OF}, and show as estimates until you drop an invoice or type your own.</p>
      <input className="field" autoFocus placeholder="Find a service" aria-label="Find a service" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) add(list[0]?.name ?? q.trim()) }} />
      <div className="catalog-list">
        {list.map((e) => (
          <button key={e.name} className="catalog-item" onClick={() => add(e.name)}>
            <span>{e.name}</span>
            <span className="meta">{e.amount === null ? e.plan : `$${e.amount}${e.unit === 'seat' ? ' a seat' : ''}`}</span>
          </button>
        ))}
        {q.trim() && !list.some((e) => e.name.toLowerCase() === q.trim().toLowerCase()) && (
          <button className="catalog-item" onClick={() => add(q.trim())}>
            <span>Add "{q.trim()}"</span>
            <span className="meta">No price yet</span>
          </button>
        )}
      </div>
    </Sheet>
  )
}

function ShredSheet({ files }: { files: File[] }) {
  const stored = useStore((s) => s.claudeKey)
  const model = useStore((s) => s.claudeModel)
  const [extracted, setExtracted] = useState<Extracted[] | null>(null)
  const [mode, setMode] = useState<'claude' | 'local'>('claude')
  const [key, setKey] = useState(stored)
  const [remember, setRemember] = useState(!!stored)

  useEffect(() => {
    let live = true
    void Promise.all(files.map(extract)).then((r) => live && setExtracted(r))
    return () => {
      live = false
    }
  }, [files])

  const readable = extracted?.filter((f) => f.type !== 'unreadable') ?? []
  const tokens = extracted ? estimateTokens(readable) : 0
  const m = MODELS.find((x) => x.id === model) ?? MODELS[0]
  const cost = ((tokens * 1.25) / 1e6) * m.input + ((tokens * 0.55) / 1e6) * m.output
  const secrets = extracted?.flatMap((f) => f.secrets) ?? []
  const imagesOnlyForClaude = extracted?.filter((f) => f.type === 'image').length ?? 0

  const start = () => {
    if (!extracted) return
    if (mode === 'claude') {
      setState({ claudeKey: key })
      if (remember) void storage.set('claudeKey', key)
      else void storage.remove('claudeKey')
    }
    setState({ sheet: null })
    void runShred(readable, mode, key, model, extracted.filter((f) => f.type === 'unreadable').map((f) => f.name))
  }

  return (
    <Sheet label="Add to the map" onClose={close}>
      <h2>{files.length === 1 ? files[0].name : `Add ${files.length} files to the map`}</h2>
      {!extracted ? (
        <p>Reading on this device.</p>
      ) : (
        <>
          {files.length > 1 && (
            <ul className="file-list">
              {extracted.map((f) => (
                <li key={f.name} className="file-row">
                  <span>{f.name}</span>
                  <span>{f.type === 'unreadable' ? "Can't read" : f.type === 'image' ? 'Image' : f.pages ? plural(f.pages, 'page') : plural(f.text.trim().split(/\s+/).length, 'word')}</span>
                </li>
              ))}
            </ul>
          )}
          {secrets.length > 0 && (
            <div className="exposure" role="alert">
              Found {plural(secrets.length, 'secret')} ({[...new Set(secrets)].join(', ')}) and removed {secrets.length === 1 ? 'it' : 'them'} before anything else happens. Rotate {secrets.length === 1 ? 'it' : 'them'}: anyone with the file has {secrets.length === 1 ? 'it' : 'them'}.
            </div>
          )}

          <button className="choice" aria-pressed={mode === 'claude'} onClick={() => setMode('claude')}>
            <b>Shred with Claude</b>
            <span>The best map: reads PDFs and images, finds conflicts and gaps. These files go to Anthropic under your own key.</span>
          </button>
          <button className="choice" aria-pressed={mode === 'local'} onClick={() => setMode('local')}>
            <b>Shred here, with no AI</b>
            <span>Nothing leaves this device. Rougher: it splits on headings and guesses from keywords.{imagesOnlyForClaude ? " It can't read images." : ''}</span>
          </button>

          {mode === 'claude' && (
            <>
              <label htmlFor="claude-key">Your Claude API key</label>
              <input id="claude-key" className="field mono" autoFocus={!stored} value={key} placeholder="sk-ant-" spellCheck={false} autoComplete="off" onChange={(e) => setKey(e.target.value.trim())} />
              <div className="row-between" style={{ marginTop: 8, alignItems: 'center' }}>
                <select className="select" aria-label="Model" value={model} onChange={(e) => setState({ claudeModel: e.target.value })}>
                  {MODELS.map((x) => (
                    <option key={x.id} value={x.id}>{x.name}: {x.note}</option>
                  ))}
                </select>
                <span className="hint">About ${cost < 0.01 ? '0.01' : cost.toFixed(2)}</span>
              </div>
              <button className="row-between" style={{ width: '100%', marginTop: 10, alignItems: 'center' }} role="switch" aria-checked={remember} onClick={() => setRemember(!remember)}>
                <span className="hint">Remember the key in this browser</span>
                <span className="switch" aria-checked={remember} />
              </button>
            </>
          )}
        </>
      )}
      <div className="actions">
        <button className="btn btn-quiet" onClick={close}>Cancel</button>
        <button className="btn btn-ink" disabled={!extracted || !readable.length || (mode === 'claude' && !key.startsWith('sk-'))} onClick={start}>
          Shred
        </button>
      </div>
    </Sheet>
  )
}

/** Runs a shred, landing pieces on the map as they arrive. */
export async function runShred(files: Extracted[], mode: 'claude' | 'local', key: string, model: string, skipped: string[] = []) {
  if (mode === 'local') {
    setState({ shred: { phase: 'Shredding on this device', done: 0, total: 1, pieces: 0 } })
    await new Promise((r) => setTimeout(r, 30))
    const result = shredLocally(files.filter((f) => f.text).map((f) => ({ name: f.name, text: f.text })), () => newId())
    updateVault((v) => placeNewPieces(merge(v, result)))
    setState({ shred: null })
    toast(`${plural(result.pieces.length, 'piece')} on the map.${skipped.length ? ` Skipped ${skipped.join(', ')}.` : ''}`)
    return
  }

  const m = MODELS.find((x) => x.id === model) ?? MODELS[0]
  let input = 0
  let output = 0
  let count = 0
  setState({ shred: { phase: 'Reading', done: 0, total: files.length + 1, pieces: 0 } })

  // Pieces already on the map keep their place and gate through a re-drop.
  const before = new Set(getState().vault?.pieces.map((p) => p.id))
  const idMap = new Map<string, string>()

  try {
    const result = await shredWithClaude(files, key, model, {
      pieces(pieces, costs) {
        count += pieces.length
        // Pieces land on the map as they're read, then settle once the map is drawn.
        updateVault((v) => placeNewPieces(merge(v, { gates: DEFAULT_GATES, pieces, links: [], costs }, idMap)))
        const s = getState().shred
        if (s) setState({ shred: { ...s, pieces: count } })
      },
      progress(phase, done, total) {
        const s = getState().shred
        setState({ shred: { phase, done, total, pieces: s?.pieces ?? count, usage: s?.usage } })
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
        const same = gates.find((x) => x.name.toLowerCase() === g.name.toLowerCase())
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
      const findings = [...v.findings, ...result.findings.map((f) => ({ ...f, pieces: f.pieces.map(final) }))]
      const named = v.company.name && v.company.name !== 'Untitled company'
      return placeNewPieces({
        ...v,
        gates,
        pieces,
        links,
        findings,
        sample: false,
        company: named ? v.company : (result.company ?? v.company),
      })
    })

    const spent = (input / 1e6) * m.input + (output / 1e6) * m.output
    setState({ shred: null })
    toast(`${plural(result.pieces.length, 'piece')} on the map. That cost about $${spent < 0.01 ? '0.01' : spent.toFixed(2)}.${skipped.length ? ` Skipped ${skipped.join(', ')}.` : ''}`)
  } catch (e: any) {
    setState({ shred: null })
    const status = e?.status
    if (status === 401) toast('Claude rejected that API key.')
    else if (status === 429) toast('Claude is rate limiting this key. Try again in a minute.')
    else toast(e?.message && !status ? e.message : "Couldn't finish shredding. What's on the map so far is saved.")
  }
}

export function Sheets() {
  const sheet = useStore((s) => s.sheet)
  if (!sheet) return null
  switch (sheet.kind) {
    case 'publish':
      return <PublishSheet />
    case 'signin':
      return <SignInSheet />
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
      return <ShredSheet files={sheet.files} />
  }
}

export function ShredStrip() {
  const shred = useStore((s) => s.shred)
  if (!shred) return null
  return (
    <div className="shred-strip panel" role="status" aria-live="polite">
      <div className="line">
        <span>{shred.phase}</span>
        <span>{plural(shred.pieces, 'piece')}</span>
      </div>
      <div className="shred-bar">
        <i style={{ width: `${Math.round((shred.done / Math.max(shred.total, 1)) * 100)}%` }} />
      </div>
    </div>
  )
}
