// A reader's password and how to hand it over. The map beside it shows what they can see.

import { useEffect, useRef, useState } from 'react'
import { llmsTxt, viewFor } from '../../core/agent.ts'
import { pending } from '../../core/status.ts'
import type { Password } from '../../core/types.ts'
import { changePassword, copy, publishAndSay, replacePassword, revokePassword, siteAddress } from '../actions.ts'
import { getState, setState, useStore } from '../store.ts'
import { Icon, listWords, useEscape, usePanelFocus } from './bits.tsx'
import { areasOnMap } from './data.ts'

const onHostedServer = () => getState().server?.mode === 'hosted'

type Tab = 'code' | 'web' | 'cursor' | 'any' | 'person'

/** What you'd paste, with the password covered on screen until asked for. Copying always gives the real thing. */
function CodeBlock({ text, label, secret, shown }: { text: string; label: string; secret: string; shown: boolean }) {
  return (
    <div className="code-block">
      <code>{shown ? text : text.split(secret).join(`${secret.slice(0, 8)}${'•'.repeat(8)}`)}</code>
      <button className="btn btn-paper code-copy" aria-label={`Copy ${label}`} onClick={() => void copy(text, `${label} copied.`)}>
        <Icon name="copy" size={13} /> Copy
      </button>
    </div>
  )
}

function Steps({ children, note }: { children: React.ReactNode; note: React.ReactNode }) {
  return (
    <>
      <ol className="steps">{children}</ol>
      <p className="hint step-note">{note}</p>
    </>
  )
}

const isLocalAddress = (address: string) => /\/\/([^/]*\.)?localhost(:\d+)?$|\/\/127\.0\.0\.1/.test(address)

function Connect({ pw, address, name, shown }: { pw: Password; address: string; name: string; shown: boolean }) {
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
  const link = `${address}/#key=${pw.key}`
  const cloudOff = (
    <p className="hint" style={{ margin: '8px 0 0' }}>
      This needs an AI tool in the cloud to read the map, and that's switched off for this reader.{' '}
      <button className="text-btn" onClick={() => changePassword(pw.id, { remote: true })}>Switch it on</button>
    </p>
  )

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="How they'll read it">
        {(
          [
            ['code', 'Claude Code'],
            ['web', 'Claude'],
            ['cursor', 'Cursor'],
            ['any', 'Other AI'],
            ['person', 'A person'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} className="tab" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'code' && (
        <Steps
          note={
            <>
              {viaHost && pw.remote ? 'The host decrypts it for each request, so you’re trusting the host with this password.' : 'Connected this way it decrypts on that computer, and the host never sees the password. It needs Node.js 22 or newer.'}
              {pw.remote && (
                <>
                  {' '}
                  <button className="text-btn" onClick={() => setViaHost(!viaHost)}>{viaHost ? 'Decrypt on that computer instead' : 'No Node.js? Let the host decrypt it'}</button>
                </>
              )}
            </>
          }
        >
          <li>On the computer where you use Claude Code, open a terminal.</li>
          <li>
            Paste this, then press Return.
            <CodeBlock text={viaHost && pw.remote ? remote : local} label="Command" secret={pw.key} shown={shown} />
          </li>
          <li>Start Claude Code again. It can now read the map.</li>
        </Steps>
      )}
      {tab === 'web' &&
        (pw.remote ? (
          <Steps note="The password is part of this URL, so treat the whole thing as the password. The host decrypts it for each request, so you’re trusting the host with it.">
            <li>In Claude, on the web or in the app, open Settings, then Connectors.</li>
            <li>
              Choose Add custom connector, and paste this as its URL.
              <CodeBlock text={urlMcp} label="Connector URL" secret={pw.key} shown={shown} />
            </li>
            <li>Give it any name and save it. Claude can now read the map.</li>
          </Steps>
        ) : (
          cloudOff
        ))}
      {tab === 'cursor' && (
        <Steps note={pw.remote ? 'The host decrypts it for each request, so you’re trusting the host with this password.' : 'Connected this way it decrypts on that computer, and the host never sees the password. It needs Node.js 22 or newer.'}>
          <li>In your project, open the file <code className="inline">.cursor/mcp.json</code>, or make it.</li>
          <li>
            Paste this in. If the file already lists servers, add this one to them.
            <CodeBlock text={cursor} label="Settings" secret={pw.key} shown={shown} />
          </li>
          <li>Restart Cursor. It can now read the map.</li>
        </Steps>
      )}
      {tab === 'any' && (
        <Steps note={pw.remote ? 'The tool has to be able to open web links. The password is in this text, so only give it to tools you trust. The host decrypts it for each request, so you’re trusting the host with it.' : 'The tool has to be able to run commands on your computer. The password is in this text, so only give it to tools you trust.'}>
          <li>
            Paste this into the tool’s instructions, or at the start of a chat.
            <CodeBlock text={prompt} label="Text" secret={pw.key} shown={shown} />
          </li>
        </Steps>
      )}
      {tab === 'person' && (
        <Steps note="The password is part of the link, so send it privately. Browsers don’t send the part after the # to the host, but the page itself comes from the host, so you’re trusting it.">
          <li>
            Send them this link. It opens the map in their browser.
            <CodeBlock text={link} label="Link" secret={pw.key} shown={shown} />
          </li>
        </Steps>
      )}
    </div>
  )
}

function PasswordDetail({ pw }: { pw: Password }) {
  const vault = useStore((s) => s.vault)!
  const publishing = useStore((s) => s.publishing)
  const [shown, setShown] = useState(false)
  const [confirming, setConfirming] = useState<null | 'remove' | 'replace'>(null)
  const agentView = useStore((s) => s.agentView)
  useEffect(() => {
    setShown(false)
    setConfirming(null)
  }, [pw.id])

  const areas = areasOnMap(vault)
  const opened = areas.filter((g) => pw.gates.includes(g.id)).map((g) => g.name)
  const before = vault.published?.passwords[pw.id]
  const stillOpen = before ? before.filter((g) => !pw.gates.includes(g)) : []
  const stillNames = stillOpen.map((g) => vault.gates.find((x) => x.id === g)?.name ?? 'a deleted area')
  const live = !!vault.published && !!vault.site
  const address = vault.site ? siteAddress(vault.site.name) : ''
  const p = pending(vault)
  const others = p.changes > 1 ? `, including your ${p.changes - 1} other changes` : ''

  return (
    <div>
      <p className="hint" style={{ margin: '0 0 12px' }}>
        {opened.length ? `Can read ${listWords(opened)}. ` : "Can't read anything yet. "}
        Click an area on the map to change that.
      </p>
      <button className="btn btn-paper" style={{ width: '100%' }} aria-pressed={agentView} onClick={() => setState({ agentView: !agentView })}>
        {agentView ? 'Hide what they read' : 'See what they read'}
      </button>

      {stillOpen.length > 0 && (
        <div className="exposure" role="alert">
          {pw.name} can still read {listWords(stillNames)} until you update.
          <br />
          <button className="btn btn-ink" disabled={publishing} onClick={() => void publishAndSay()}>
            {publishing ? 'Updating' : 'Update now'}
          </button>
        </div>
      )}

      <div className="section-title">How will they read it?</div>
      {live ? (
        <>
          {isLocalAddress(address) && <p className="hint" style={{ margin: '0 0 8px' }}>This address only works on this computer, so nobody else can use it yet, and neither can AI tools in the cloud. To share it, run your host on a server.</p>}
          <Connect pw={pw} address={address} name={vault.site?.name ?? vault.company.name} shown={shown} />

          <div className="section-title">Password</div>
          <div className="key-box">
            <code>{shown ? pw.key : `${pw.key.slice(0, 8)}${'•'.repeat(14)}`}</code>
            <button className="btn btn-quiet" style={{ height: 26, padding: '0 6px' }} onClick={() => setShown(!shown)}>{shown ? 'Hide' : 'Show'}</button>
            <button className="icon-btn" aria-label="Copy password" onClick={() => void copy(pw.key, 'Password copied.')}>
              <Icon name="copy" size={14} />
            </button>
          </div>
          <p className="hint" style={{ margin: '6px 0 0' }}>Vadere makes the password, because the encrypted map is public and a chosen password could be guessed.</p>
          {confirming === 'replace' ? (
            <div className="callout" style={{ marginTop: 10 }}>
              The old password stops working on the live map straight away{others}, so whatever uses it has to be connected again. Anything it already read or saved, it keeps.
              <div className="actions">
                <button className="btn btn-ink" disabled={publishing} onClick={() => void replacePassword(pw.id)}>Make a new password</button>
                <button className="btn btn-quiet" onClick={() => setConfirming(null)}>Keep this one</button>
              </div>
            </div>
          ) : (
            <button className="text-btn" style={{ marginTop: 8 }} onClick={() => setConfirming('replace')}>Make a new password</button>
          )}

        </>
      ) : (
        <>
          <p className="hint" style={{ margin: 0 }}>Once this map is live, their password and the steps to connect them will be here.</p>
          <button className="btn btn-ink" style={{ marginTop: 10 }} disabled={publishing || (!!vault.sample && onHostedServer())} onClick={() => void publishAndSay()}>Go live</button>
        </>
      )}

      <button className="row-between" style={{ width: '100%', margin: '14px 0 0', textAlign: 'left' }} role="switch" aria-checked={pw.remote} onClick={() => changePassword(pw.id, { remote: !pw.remote })}>
        <span>
          Let AI tools in the cloud read this
          <span className="hint" style={{ display: 'block' }}>
            {pw.remote
              ? 'On: tools that run online, like Claude on the web, can read it. To answer them the host decrypts it in memory for each request, so you’re trusting the host with this password.'
              : 'Off: it only decrypts on the reader’s own computer, so the host never needs this password.'}
          </span>
        </span>
        <span className="switch" aria-checked={pw.remote} style={{ marginTop: 1 }} />
      </button>

      <div className="section-title" />
      {confirming !== 'remove' ? (
        <button className="btn btn-quiet" style={{ paddingLeft: 0 }} onClick={() => setConfirming('remove')}>Remove this reader</button>
      ) : (
        <div className="callout">
          {live ? (
            <>
              This updates the live map straight away{others}. Anything {pw.name} already read or saved, they keep.
            </>
          ) : (
            <>This removes the reader and their password.</>
          )}
          <div className="actions">
            <button className="btn btn-ink" onClick={() => void revokePassword(pw.id)}>Remove</button>
            <button className="btn btn-quiet" onClick={() => setConfirming(null)}>Keep them</button>
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
  const focusRef = usePanelFocus<HTMLElement>(lens)
  if (!vault || !pw) return null

  return (
    <aside className="side panel" aria-label={pw.name} ref={focusRef} tabIndex={-1}>
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
