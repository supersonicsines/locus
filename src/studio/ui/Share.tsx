// A reader's password and how to hand it over. The map beside it shows what they can see.

import { useEffect, useRef, useState } from 'react'
import { llmsTxt, viewFor } from '../../core/agent.ts'
import { pending } from '../../core/status.ts'
import type { Password } from '../../core/types.ts'
import { changePassword, copy, createPassword, publish, revokePassword, siteAddress } from '../actions.ts'
import { setState, useStore } from '../store.ts'
import { Icon, listWords, useEscape } from './bits.tsx'

type Tab = 'code' | 'web' | 'cursor' | 'any'

function CodeBlock({ text, label }: { text: string; label: string }) {
  return (
    <div className="code-block">
      {text}
      <button className="icon-btn" aria-label={`Copy ${label}`} onClick={() => void copy(text, `${label} copied.`)}>
        <Icon name="copy" size={14} />
      </button>
    </div>
  )
}

function Connect({ pw, address, name }: { pw: Password; address: string; name: string }) {
  const [tab, setTab] = useState<Tab>('code')
  const [viaHost, setViaHost] = useState(false)
  const slug = name.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  const local = `claude mcp add ${slug} -e VADERE_KEY=${pw.key} -- npx -y vadere mcp ${address}`
  const remote = `claude mcp add --transport http ${slug} ${address}/mcp --header "Authorization: Bearer ${pw.key}"`
  const urlMcp = `${address}/k/${pw.key}/mcp`
  const cursor = pw.remote
    ? JSON.stringify({ mcpServers: { [slug]: { url: `${address}/mcp`, headers: { Authorization: `Bearer ${pw.key}` } } } }, null, 2)
    : JSON.stringify({ mcpServers: { [slug]: { command: 'npx', args: ['-y', 'vadere', 'mcp', address], env: { VADERE_KEY: pw.key } } } }, null, 2)
  const prompt = pw.remote
    ? `Our company's map is at ${address}/k/${pw.key}/llms.txt\nRead it before doing any company work. It has the rules you must follow and says where everything lives.`
    : `Our company's map is at ${address}. Read it with: npx vadere pull ${address} --key ${pw.key}\nThen read COMPANY_MAP.md before doing any company work.`

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="AI tool">
        {(
          [
            ['code', 'Claude Code'],
            ['web', 'Claude.ai'],
            ['cursor', 'Cursor'],
            ['any', 'Any AI tool'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} className="tab" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'code' && (
        <>
          <CodeBlock text={viaHost && pw.remote ? remote : local} label="Command" />
          <p className="hint" style={{ margin: '6px 0 0' }}>
            {viaHost && pw.remote ? 'No local process. The host decrypts for each request.' : 'Decrypts on your machine, so the host never sees the password.'}
            {pw.remote && (
              <>
                {' '}
                <button className="text-btn" onClick={() => setViaHost(!viaHost)}>{viaHost ? 'Decrypt locally instead' : 'Use the host instead'}</button>
              </>
            )}
          </p>
        </>
      )}
      {tab === 'web' &&
        (pw.remote ? (
          <>
            <CodeBlock text={urlMcp} label="Connector URL" />
            <p className="hint" style={{ margin: '6px 0 0' }}>In Claude, open Settings, Connectors, Add custom connector, and paste this. Claude.ai can't set headers, so the password is in the URL: treat the whole URL as the password. The host must be public and on HTTPS.</p>
          </>
        ) : (
          <p className="hint" style={{ margin: '8px 0 0' }}>Claude.ai connectors run in the cloud, so they need remote access. Turn it on above, or use Claude Code.</p>
        ))}
      {tab === 'cursor' && (
        <>
          <CodeBlock text={cursor} label="Config" />
          <p className="hint" style={{ margin: '6px 0 0' }}>Add this to .cursor/mcp.json.</p>
        </>
      )}
      {tab === 'any' && (
        <>
          <CodeBlock text={prompt} label="Prompt" />
          <p className="hint" style={{ margin: '6px 0 0' }}>Paste it into any AI tool's instructions.</p>
        </>
      )}
      <p className="hint" style={{ margin: '10px 0 0' }}>
        Is this for a person?{' '}
        <button className="text-btn" onClick={() => void copy(`${address}/#key=${pw.key}`, 'Link copied. The password is after the #, which browsers never send to the host.')}>Copy a link that opens the map</button>
      </p>
    </div>
  )
}

function PasswordDetail({ pw }: { pw: Password }) {
  const vault = useStore((s) => s.vault)!
  const publishing = useStore((s) => s.publishing)
  const [shown, setShown] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const agentView = useStore((s) => s.agentView)
  useEffect(() => {
    setShown(false)
    setConfirming(false)
  }, [pw.id])

  const opened = vault.gates.filter((g) => pw.gates.includes(g.id)).map((g) => g.name)
  const before = vault.published?.passwords[pw.id]
  const stillOpen = before ? before.filter((g) => !pw.gates.includes(g)) : []
  const stillNames = stillOpen.map((g) => vault.gates.find((x) => x.id === g)?.name ?? 'a deleted area')
  const address = vault.site ? siteAddress(vault.site.name) : 'https://your-address'
  const p = pending(vault)

  return (
    <div>
      <p className="hint" style={{ margin: '0 0 14px' }}>
        {opened.length ? `Can read ${listWords(opened)}. ` : "Can't read anything yet. "}
        Click an area on the map to change that.
      </p>

      {stillOpen.length > 0 && (
        <div className="exposure" role="alert">
          {pw.name} can still read {listWords(stillNames)} until you update.
          <br />
          <button className="btn btn-ink" disabled={publishing} onClick={() => void publish()}>
            {publishing ? 'Updating' : 'Update now'}
          </button>
        </div>
      )}

      <label className="label">Password</label>
      <div className="key-box" style={{ marginTop: 4 }}>
        <code>{shown ? pw.key : `${pw.key.slice(0, 8)}${'•'.repeat(14)}`}</code>
        <button className="btn btn-quiet" style={{ height: 26, padding: '0 6px' }} onClick={() => setShown(!shown)}>{shown ? 'Hide' : 'Show'}</button>
        <button className="icon-btn" aria-label="Copy password" onClick={() => void copy(pw.key, 'Password copied.')}>
          <Icon name="copy" size={14} />
        </button>
      </div>
      <p className="hint" style={{ margin: '6px 0 0' }}>Vadere makes the password, because the encrypted map is public and a chosen password could be guessed.</p>

      <button className="row-between" style={{ width: '100%', margin: '14px 0 0', textAlign: 'left' }} role="switch" aria-checked={pw.remote} onClick={() => changePassword(pw.id, { remote: !pw.remote })}>
        <span>
          Remote access
          <span className="hint" style={{ display: 'block' }}>
            {pw.remote
              ? 'On: AI tools in the cloud can read this. The host decrypts it in memory for each request, then forgets.'
              : "Off: this only works from the reader's own machine. The host only ever sees the encrypted copy."}
          </span>
        </span>
        <span className="switch" aria-checked={pw.remote} style={{ marginTop: 1 }} />
      </button>

      <div className="section-title">Give it to them</div>
      {!vault.published && <p className="hint" style={{ margin: '0 0 8px' }}>This works once you've gone live. The address below is a placeholder until then.</p>}
      <Connect pw={pw} address={address} name={vault.site?.name ?? vault.company.name} />

      <button className="btn btn-paper" style={{ width: '100%', marginTop: 12 }} aria-pressed={agentView} onClick={() => setState({ agentView: !agentView })}>
        {agentView ? 'Hide what they read' : 'See what they read'}
      </button>

      <div className="section-title" />
      {!confirming ? (
        <button className="btn btn-quiet" style={{ paddingLeft: 0 }} onClick={() => setConfirming(true)}>Remove this reader</button>
      ) : (
        <div className="callout">
          {vault.published ? (
            <>
              This updates the live map straight away{p.changes > 1 ? `, including your ${p.changes - 1} other changes` : ''}. What {pw.name} has already read, it keeps.
            </>
          ) : (
            <>This removes the password.</>
          )}
          <div className="actions">
            <button className="btn btn-ink" onClick={() => void revokePassword(pw.id)}>Remove</button>
            <button className="btn btn-quiet" onClick={() => setConfirming(false)}>Keep it</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function SharePanel() {
  const vault = useStore((s) => s.vault)
  const lens = useStore((s) => s.lens)
  const selected = useStore((s) => s.selected)
  const close = () => setState({ panel: null, agentView: false })
  useEscape(close, !selected)
  const name = useRef<HTMLInputElement>(null)
  const pw = vault?.passwords.find((p) => p.id === lens) ?? null
  const fresh = pw?.name === 'New reader'
  useEffect(() => {
    if (fresh) name.current?.select()
  }, [fresh, pw?.id])
  if (!vault || !pw) return null

  return (
    <aside className="side panel" aria-label={pw.name}>
      <div className="side-head">
        <input ref={name} className="grow title-input" aria-label="Reader's name" value={pw.name} onChange={(e) => changePassword(pw.id, { name: e.target.value })} />
        <button className="icon-btn" onClick={close} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div className="side-body">
        <PasswordDetail pw={pw} />
      </div>
    </aside>
  )
}

export function AgentView() {
  const vault = useStore((s) => s.vault)
  const lens = useStore((s) => s.lens)
  const on = useStore((s) => s.agentView)
  useEscape(() => setState({ agentView: false }), on)
  if (!vault || !on) return null
  const pw = vault.passwords.find((p) => p.id === lens)
  if (!pw) return null
  const address = vault.site ? siteAddress(vault.site.name) : 'https://your-address'
  const text = llmsTxt(viewFor(vault, pw), { kind: 'http', base: address })
  return (
    <section className="agent-view panel" aria-label={`What ${pw.name} sees`}>
      <div className="side-head">
        <span className="grow">What {pw.name} reads</span>
        <button className="icon-btn" aria-label="Copy" onClick={() => void copy(text, 'Copied.')}>
          <Icon name="copy" size={14} />
        </button>
        <button className="icon-btn" aria-label="Close" onClick={() => setState({ agentView: false })}>
          <Icon name="close" />
        </button>
      </div>
      <pre className="agent-text" tabIndex={0}>{text}</pre>
    </section>
  )
}
