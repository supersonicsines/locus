// A reader's password and how to hand it over. The map beside it shows what they can see.

import { useEffect, useRef, useState } from 'react'
import { llmsTxt, viewFor } from '../../core/agent.ts'
import { pending } from '../../core/status.ts'
import type { Password } from '../../core/types.ts'
import { changePassword, clearStatusToasts, copy, newMap, publishAndSay, replacePassword, revokePassword, siteAddress, toast, toggleGateOnPassword } from '../actions.ts'
import { getState, setState, useStore } from '../store.ts'
import { Icon, listWords, useEscape, usePanelFocus } from './bits.tsx'
import { areasOnMap } from './data.ts'

const onHostedServer = () => getState().server?.mode === 'hosted'

type Tab = 'code' | 'web' | 'cursor' | 'any' | 'person'

/** Breaks a command only between its words. Selecting it by hand still gives the real thing, because the spaces and letters are untouched. A word too long for the box can still break. */
function Words(text: string) {
  return text.split(/(\s+)/).map((word, i) => (word.length > 40 || !word.trim() ? word : <span className="tok" key={i}>{word}</span>))
}

/** What you'd paste, with the password covered on screen until asked for. Copying always gives the real thing. */
function CodeBlock({ text, label, secret, shown, shaped }: { text: string; label: string; secret: string; shown: boolean; shaped?: boolean }) {
  // The button says so itself. A message would land on the words around it, and they're the ones saying what you're trusting.
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])
  const shownText = shown ? text : text.split(secret).join(`${secret.slice(0, 8)}${'•'.repeat(8)}`)
  return (
    <div className={`code-block ${shaped ? 'is-shaped' : ''}`}>
      <code>{shaped ? shownText : Words(shownText)}</code>
      <button
        className="btn btn-paper code-copy"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          if (await copy(text, null)) {
            setCopied(true)
            clearTimeout(timer.current)
            timer.current = window.setTimeout(() => setCopied(false), 1800)
          }
        }}
      >
        <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function Steps({ children, note }: { children: React.ReactNode; note: React.ReactNode }) {
  // One step isn't a list.
  const single = Array.isArray(children) ? children.filter(Boolean).length === 1 : true
  return (
    <>
      <ol className={`steps ${single ? 'is-single' : ''}`}>{children}</ol>
      <p className="hint step-note">{note}</p>
    </>
  )
}

const isLocalAddress = (address: string) => /\/\/([^/]*\.)?localhost(:\d+)?$|\/\/127\.0\.0\.1/.test(address)

/** How to say it's readable, given what this reader can read so far. */
const canNowRead = (pw: Password) => (pw.gates.length ? 'It can now read the map.' : 'It can read whatever you open for it.')

const HOST_NEVER = 'Connected this way it decrypts on that computer, and the host never sees the password, as long as nothing else uses this password through the host. For that, give it its own reader. It needs Node.js 22 or newer.'

function Connect({ pw, address, name, shown }: { pw: Password; address: string; name: string; shown: boolean }) {
  const onThisComputer = isLocalAddress(address)
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
    ? `Our company's map is at ${address}/k/${pw.key}/llms.txt\nRead it before doing any company work. It has any rules you must follow and says where everything lives.`
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
              {viaHost && pw.remote ? "The host decrypts it for each request, so you're trusting the host with this password." : HOST_NEVER}
              {pw.remote && (
                <>
                  {' '}
                  <button className="text-btn" onClick={() => setViaHost(!viaHost)}>{viaHost ? 'Decrypt on that computer instead' : 'No Node.js? Let the host decrypt it'}</button>
                </>
              )}
            </>
          }
        >
          <li>{onThisComputer ? 'On this computer, open a terminal.' : 'On the computer where you use Claude Code, open a terminal.'}</li>
          <li>
            Paste this, then press Return.
            <CodeBlock text={viaHost && pw.remote ? remote : local} label="Command" secret={pw.key} shown={shown} />
          </li>
          <li>Start Claude Code again. {canNowRead(pw)}</li>
        </Steps>
      )}
      {tab === 'web' &&
        (onThisComputer ? (
          <p className="hint tab-note">Claude can't connect yet. Its connectors run in the cloud, and this address only exists on this computer. This works once your host is on a server with a public address and you go live from there.</p>
        ) : pw.remote ? (
          <Steps note="The password is part of this URL, so treat the whole thing as the password. The host decrypts it for each request, so you're trusting the host with it.">
            <li>In Claude, on the web or in the app, open Settings, then Connectors.</li>
            <li>
              Choose Add custom connector, and paste this as its URL.
              <CodeBlock text={urlMcp} label="Connector URL" secret={pw.key} shown={shown} />
            </li>
            <li>Give it any name and save it. {pw.gates.length ? 'Claude can now read the map.' : 'Claude can read whatever you open for it.'}</li>
          </Steps>
        ) : (
          cloudOff
        ))}
      {tab === 'cursor' && (
        <Steps note={pw.remote ? "The host decrypts it for each request, so you're trusting the host with this password." : HOST_NEVER}>
          <li>In your project, open the file <code className="inline">.cursor/mcp.json</code>, or make it. The password goes in this file, so keep it out of git.</li>
          <li>
            Paste this in. If the file already lists servers, add this one to them.
            <CodeBlock text={cursor} label="Settings" secret={pw.key} shown={shown} shaped />
          </li>
          <li>Restart Cursor. {canNowRead(pw)}</li>
        </Steps>
      )}
      {tab === 'any' && (
        <Steps
          note={`${onThisComputer ? "This only works for a tool running on this computer, because this address only exists here. A tool in the cloud can't reach it until your host is on a server with a public address. " : pw.remote ? 'The tool has to be able to open web links. ' : ''}${pw.remote ? "The password is in this text, so only give it to tools you trust. The host decrypts it for each request, so you're trusting the host with it." : `${onThisComputer ? '' : 'The tool has to be able to run commands on your computer. '}The password is in this text, so only give it to tools you trust.`}`}
        >
          <li>
            Paste this into the tool's instructions, or at the start of a chat.
            <CodeBlock text={prompt} label="Text" secret={pw.key} shown={shown} />
          </li>
        </Steps>
      )}
      {tab === 'person' && (
        <Steps note={onThisComputer ? "The password is part of the link. Once they can reach it, send it privately. Browsers don't send the part after the # to the host, but the page itself comes from the host, so you're trusting it." : "The password is part of the link, so send it privately. Browsers don't send the part after the # to the host, but the page itself comes from the host, so you're trusting it."}>
          <li>
            {onThisComputer ? "Someone on another computer can't open this yet, because this address only exists here. It works once your host is on a server with a public address. For now, this link shows you what they'd see." : 'Send them this link. It opens the map in their browser.'}
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
  const [more, setMore] = useState(false)
  const agentView = useStore((s) => s.agentView)
  const confirm = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setShown(false)
    setConfirming(null)
    setMore(false)
  }, [pw.id])
  // You pressed something at the foot of a long panel, and the answer needs its buttons on screen.
  useEffect(() => {
    if (confirming) confirm.current?.scrollIntoView({ block: 'nearest' })
  }, [confirming])

  const areas = areasOnMap(vault)
  const opened = areas.filter((g) => pw.gates.includes(g.id)).map((g) => g.name)
  const before = vault.published?.passwords[pw.id]
  const stillOpen = before ? before.filter((g) => !pw.gates.includes(g)) : []
  const stillNames = stillOpen.map((g) => vault.gates.find((x) => x.id === g)?.name ?? 'a deleted area')
  const live = !!vault.published && !!vault.site
  const address = vault.site ? siteAddress(vault.site.name) : ''
  const p = pending(vault)
  const others = p.changes > 1 ? `, including your ${p.changes - 1} other changes` : ''
  // The switch moves here at once, and the live copy only moves on Update, so until then the words have to say which one they mean.
  const wasRemote = live ? vault.published?.passwordInfo?.[pw.id]?.remote : undefined
  const hostStill = wasRemote === true && !pw.remote
  const hostNotYet = wasRemote === false && pw.remote

  return (
    <div>
      {/* The card folds away while this is open, so its switches come here. */}
      <div className="lens-chips" style={{ marginTop: 0 }}>
        {/* With nothing on, a row of names after "Can read" reads as a sentence that says the opposite. */}
        <span className="lens-note">{pw.gates.length ? 'Can read' : 'Can read nothing yet. Press an area to let them read it.'}</span>
        {areas.map((g) => (
          <button key={g.id} className="lens-chip" role="switch" aria-checked={pw.gates.includes(g.id)} onClick={() => toggleGateOnPassword(pw.id, g.id)}>{g.name}</button>
        ))}
      </div>
      <button className="btn btn-paper" style={{ width: '100%' }} aria-pressed={agentView} onClick={() => setState({ agentView: !agentView })}>
        {agentView ? 'Hide what they read' : 'See what they read'}
      </button>

      {(stillOpen.length > 0 || hostStill) && (
        <div className="exposure" role="alert">
          {stillOpen.length > 0 && <>{pw.name} can still read {listWords(stillNames)} until you update.<br /></>}
          {hostStill && <>{pw.name} can still read through the host until you update.<br /></>}
          <button className="btn btn-ink" aria-busy={publishing} disabled={publishing} onClick={() => void publishAndSay()}>
            {publishing ? 'Updating' : 'Update now'}
          </button>
        </div>
      )}

      <div className="section-title">How will they read it?</div>
      {live ? (
        <>
          {isLocalAddress(address) && <p className="hint" style={{ margin: '0 0 8px' }}>This address only exists on this computer, so only AI tools on this computer can use it for now.</p>}
          <Connect pw={pw} address={address} name={vault.site?.name ?? vault.company.name} shown={shown} />

          {/* The steps carry the password. This is for doing something else with it, so it waits to be asked for. */}
          <button className="more-toggle" aria-expanded={more} onClick={() => setMore(!more)}>
            <span>Password and access</span>
            <Icon name="chevron" size={13} />
          </button>
          {more && (
          <div style={{ marginTop: 8 }}>
          <div className="key-box">
            <code>{shown ? pw.key : `${pw.key.slice(0, 8)}${'•'.repeat(14)}`}</code>
            <button className="btn btn-quiet" style={{ height: 26, padding: '0 6px' }} onClick={() => setShown(!shown)}>{shown ? 'Hide' : 'Show'}</button>
            <button className="icon-btn" aria-label="Copy password" onClick={() => void copy(pw.key, 'Password copied.')}>
              <Icon name="copy" size={14} />
            </button>
          </div>
          <p className="hint" style={{ margin: '6px 0 0' }}>Vadere makes the password, because the encrypted map is public and a chosen password could be guessed.</p>
          {confirming === 'replace' ? (
            <div className="callout" style={{ marginTop: 10 }} ref={confirm}>
              The old password stops working on the live map straight away{others}, so whatever uses it has to be connected again. Anything it already read or saved, it keeps.
              <div className="actions">
                <button className="btn btn-ink" aria-busy={publishing} disabled={publishing} onClick={() => void replacePassword(pw.id)}>Make a new password</button>
                <button className="btn btn-quiet" onClick={() => setConfirming(null)}>Keep this one</button>
              </div>
            </div>
          ) : (
            <button className="text-btn" style={{ marginTop: 8 }} onClick={() => setConfirming('replace')}>Make a new password</button>
          )}
          </div>
          )}

        </>
      ) : (
        <>
          <p className="hint" style={{ margin: 0 }}>Once this map is live, their password and the steps to connect them will be here.</p>
          {/* A phone's Go live is under this panel. Anywhere else it's in plain sight at the top, and two would only compete. */}
          <button
            className={`btn btn-ink panel-go-live ${vault.sample && onHostedServer() ? 'is-held' : ''}`}
            style={{ marginTop: 10 }}
            aria-busy={publishing}
            disabled={publishing}
            onClick={() => {
              if (vault.sample && onHostedServer()) toast("The sample can't go live here, because it's a made-up company.", { label: 'Start your own map', run: () => void newMap() })
              else void publishAndSay()
            }}
          >
            Go live
          </button>
        </>
      )}

      {(!live || more) && <button className="row-between" style={{ width: '100%', margin: '14px 0 0', textAlign: 'left' }} role="switch" aria-checked={pw.remote} onClick={() => changePassword(pw.id, { remote: !pw.remote })}>
        <span>
          Let AI tools in the cloud read this
          <span className="hint" style={{ display: 'block' }}>
            {pw.remote
              ? `On: tools that run online, like Claude on the web, can read it. To answer them the host decrypts it in memory for each request, so you're trusting the host with this password.${hostNotYet ? ' This starts when you update.' : ''}`
              : hostStill
                ? "Off once you update. Until then the live copy still lets the host decrypt with this password, so you're still trusting the host with it. If it was ever used through the host, make a new password too."
                : `Off: it only decrypts on the reader's own computer, so the host doesn't need this password.${live ? ' If it was ever used through the host, make a new password too.' : ''}`}
          </span>
        </span>
        <span className="switch" aria-checked={pw.remote} style={{ marginTop: 1 }} />
      </button>}
      {/* It says to update, so the button is here too. The one above is a scroll away by now. */}
      {(!live || more) && hostStill && (
        <button className="btn btn-ink" style={{ marginTop: 10 }} aria-busy={publishing} disabled={publishing} onClick={() => void publishAndSay()}>
          {publishing ? 'Updating' : 'Update now'}
        </button>
      )}

      <div className="section-title" />
      {confirming !== 'remove' ? (
        <button className="btn btn-quiet btn-flush" onClick={() => setConfirming('remove')}>Remove this reader</button>
      ) : (
        <div className="callout" ref={confirm}>
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
  // "You're live, connect them" has done its job once their panel is open.
  useEffect(() => clearStatusToasts(), [])
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
        <span className="grow">What {pw.name} reads<span className="agent-note">This is the text AI tools get</span></span>
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
