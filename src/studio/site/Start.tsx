// The first steps, at /start: what Locus does, four features in four short motion graphics, then how to keep your maps, then your documents.
// Each step is in the address (?step=), so Back and Forward walk through them, and a return from Google lands on the step after the account.

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type DragEvent } from 'react'
import { newMap, signInWithGoogle, signOut } from '../actions.ts'
import { setState, useStore } from '../store.ts'
import { SiteHeader, ThemeButton, useSitePage } from './frame.tsx'
import { Mark } from './Mark.tsx'
import { ConnectMotion } from './motion/Connect.tsx'
import { EncryptedMotion } from './motion/Encrypted.tsx'
import { MapFormsMotion } from './motion/MapForms.tsx'
import { SealMotion } from './motion/Seal.tsx'
import { clearStartTrouble, go, Link, leavingForGoogle, markOnboarded, startTrouble, useSearch } from './route.tsx'
import './site.css'

interface Step {
  id: string
  /** For the dots, and for a screen reader. */
  name: string
  title: string
  body?: string
  graphic?: ComponentType
}

const STEPS: Step[] = [
  {
    id: 'map',
    name: 'Your documents',
    title: 'Your documents become one map.',
    body: 'Brand book, contracts, specs, invoices: each is broken into small items and sorted into areas, with the tools you run on. Secrets are removed before anything leaves, and a rule a document proposes waits for your approval.',
    graphic: MapFormsMotion,
  },
  {
    id: 'readers',
    name: 'Readers',
    title: 'Pick a reader. Press an area. It seals.',
    body: 'Each reader gets a password that opens only the areas you choose. Every password has its own keys, so a sealed area is cryptography, not a setting.',
    graphic: SealMotion,
  },
  {
    id: 'agents',
    name: 'Agents',
    title: 'One line connects an agent.',
    body: "Paste it into Claude Code, Cursor or any MCP client. The agent learns the rules to follow, where everything lives and which tool to use, and it's told what's closed to it.",
    graphic: ConnectMotion,
  },
  {
    id: 'encrypted',
    name: 'Encryption',
    title: 'Encrypted on your device.',
    body: 'Your map is sealed in this browser before it goes live, so the host stores only ciphertext. Anyone can check that with locus verify.',
    graphic: EncryptedMotion,
  },
  { id: 'account', name: 'Your account', title: 'Keep your maps with you.' },
  { id: 'begin', name: 'Your documents', title: 'Add your documents.' },
]

const ACCOUNT = STEPS.findIndex((s) => s.id === 'account')
const stepUrl = (i: number) => (i === 0 ? '/start' : `/start?step=${STEPS[i].id}`)

function indexOf(search: string): number {
  const id = new URLSearchParams(search).get('step')
  const i = STEPS.findIndex((s) => s.id === id)
  return i < 0 ? 0 : i
}

/** Files always start a map of your own, never the sample. The shred sheet opens on it, at /map. */
function begin(files: File[]) {
  markOnboarded()
  go('/map', {
    then: async () => {
      await newMap()
      setState({ sheet: { kind: 'shred', files } })
    },
  })
}

function Account({ next }: { next: () => void }) {
  const server = useStore((s) => s.server)
  const me = useStore((s) => s.me)
  // Why Google sent you back unsigned. Only worth saying if you aren't signed in after all.
  const [cameBack] = useState(startTrouble)
  const [trouble, setTrouble] = useState('')
  // Said here, once, in place. The same words would otherwise also lie over the page as a toast.
  useLayoutEffect(() => {
    if (startTrouble) setState({ toasts: [] })
    clearStartTrouble()
  }, [])
  const google = !!server?.google
  const signedIn = !!me?.signedIn

  if (signedIn) {
    return (
      <>
        <p className="step-body">
          You're signed in as <b>{me?.name || me?.email}</b>
          {me?.name && me.email ? <span className="step-soft"> ({me.email})</span> : null}. This host knows which addresses are yours, so on another device you'll only need your recovery key.
        </p>
        <div className="step-choices">
          <button className="btn btn-ink btn-lg" onClick={next}>
            Continue
          </button>
          <button
            className="btn btn-quiet btn-lg"
            onClick={() =>
              void signOut().then((ok) => {
                if (!ok) setTrouble("Couldn't sign out. Check your connection and try again.")
              })
            }
          >
            Sign out
          </button>
        </div>
        {trouble && (
          <p className="step-trouble" role="alert">
            {trouble}
          </p>
        )}
      </>
    )
  }

  return (
    <>
      <p className="step-body">
        {google
          ? 'Signing in with Google tells this host who you are, so you can claim an address and find your maps on another device. Google never sees your map or your recovery key.'
          : 'Your map stays in this browser until you go live. Going live gives you a recovery key, and that key is how you open your map on another device.'}
      </p>
      <div className="step-choices">
        {google && (
          <button
            className="btn btn-ink btn-lg"
            onClick={() => {
              leavingForGoogle()
              signInWithGoogle(stepUrl(ACCOUNT + 1))
            }}
          >
            Continue with Google
          </button>
        )}
        <button className={`btn ${google ? 'btn-paper' : 'btn-ink'} btn-lg`} onClick={next}>
          Continue on this device
        </button>
      </div>
      <p className="step-soft step-small">{google ? 'On this device, with no account, your map stays in this browser until you go live.' : 'No account, no email: nothing about you is stored.'}</p>
      {(trouble || cameBack) && (
        <p className="step-trouble" role="alert">
          {trouble || cameBack}
        </p>
      )}
    </>
  )
}

function Begin() {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const drag = {
    onDragEnter: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      depth.current++
      setOver(true)
    },
    onDragOver: (e: DragEvent) => {
      if (e.dataTransfer.types.includes('Files')) e.preventDefault()
    },
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1)
      if (!depth.current) setOver(false)
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      depth.current = 0
      setOver(false)
      const files = [...e.dataTransfer.files]
      if (files.length) begin(files)
    },
  }
  return (
    <>
      <p className="step-body">PDFs, Word files, Markdown, text and images. They're read on this device, or with your own Claude key if you add one, and nothing leaves until you say so.</p>
      <div className={`drop ${over ? 'is-over' : ''}`} {...drag}>
        <svg className="drop-art" width="56" height="44" viewBox="0 0 56 44" aria-hidden="true">
          <rect x="12" y="4" width="26" height="33" rx="3" transform="rotate(-8 25 20)" />
          <rect x="18" y="6" width="26" height="33" rx="3" transform="rotate(6 31 22)" />
          <path d="M24 16h12M24 21h14M24 26h9" transform="rotate(6 31 22)" />
        </svg>
        <p className="drop-words">{over ? 'Drop to start your map' : 'Drop your files here'}</p>
        <button className="btn btn-ink btn-lg" onClick={() => input.current?.click()}>
          Choose files
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            if (files.length) begin(files)
          }}
        />
      </div>
      <div className="step-choices">
        <Link to="/example" className="btn btn-paper btn-lg" onClick={() => markOnboarded()}>
          Start from the example
        </Link>
        <Link
          to="/map"
          className="text-btn step-empty"
          onClick={() => markOnboarded()}
          then={async () => {
            await newMap()
          }}
        >
          Start with an empty map
        </Link>
      </div>
    </>
  )
}

export function Start() {
  useSitePage('Get started with Locus')
  const search = useSearch()
  const index = indexOf(search)
  const step = STEPS[index]
  const explaining = index < ACCOUNT
  const heading = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)

  const to = (i: number) => {
    if (i < 0 || i >= STEPS.length || i === index) return
    moved.current = true
    go(stepUrl(i))
  }

  // After a step changes, its heading has the focus, so a screen reader reads where you are, and Enter carries on.
  useLayoutEffect(() => {
    if (moved.current) heading.current?.focus({ preventScroll: true })
  }, [index])

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.sheet')) return
      const t = e.target as HTMLElement
      const onControl = /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName)
      if (e.key === 'ArrowRight' && explaining) to(index + 1)
      else if (e.key === 'ArrowLeft') to(index - 1)
      else if (e.key === 'Enter' && explaining && !onControl) to(index + 1)
      else if (e.key === 'Escape' && explaining) to(ACCOUNT)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })

  const Graphic = step.graphic
  const google = useStore((s) => !!s.server?.google)

  return (
    <div className="site start">
      <SiteHeader>
        <ThemeButton />
        {explaining && (
          <Link to={stepUrl(ACCOUNT)} className="site-skip" onClick={() => (moved.current = true)}>
            Skip intro
          </Link>
        )}
      </SiteHeader>

      <main className={`start-main ${Graphic ? 'has-graphic' : ''}`} id="main">
        <div className="start-stage" key={step.id}>
          {Graphic ? (
            <div className="plate start-plate">
              <Graphic />
            </div>
          ) : (
            <div className="start-mark" aria-hidden="true">
              <Mark size={88} animated />
            </div>
          )}
          <div className="start-text">
            <p className="eyebrow">
              <span className="eyebrow-n">{`${index + 1} of ${STEPS.length}`}</span>
              {step.id === 'account' && !google ? 'This device' : step.name}
            </p>
            <h1 ref={heading} tabIndex={-1}>
              {step.id === 'account' && !google ? 'No account needed.' : step.title}
            </h1>
            {step.body && <p className="step-body">{step.body}</p>}
            {step.id === 'account' && <Account next={() => to(ACCOUNT + 1)} />}
            {step.id === 'begin' && <Begin />}
          </div>
        </div>
      </main>

      <nav className="start-nav" aria-label="Steps">
        <div className="start-nav-side">
          {index > 0 && (
            <button className="btn btn-quiet btn-lg" onClick={() => to(index - 1)}>
              Back
            </button>
          )}
        </div>
        <ol className="dots">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button className={`dot ${i === index ? 'is-on' : ''} ${i < index ? 'is-done' : ''}`} aria-label={`Step ${i + 1} of ${STEPS.length}: ${s.name}`} aria-current={i === index ? 'step' : undefined} onClick={() => to(i)} />
            </li>
          ))}
        </ol>
        <div className="start-nav-side is-end">
          {explaining && (
            <button className="btn btn-ink btn-lg" onClick={() => to(index + 1)}>
              Next
            </button>
          )}
        </div>
      </nav>
    </div>
  )
}
