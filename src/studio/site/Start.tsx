// The first steps, at /start: what Locus does, four features in four short motion graphics, then how to keep your maps (where the host
// can sign you in with Google), then your first map. Each step is in the address (?step=), so Back and Forward walk through them, and a
// return from Google lands on the step after the account.

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type DragEvent, type ReactNode } from 'react'
import { newMap, signInWithGoogle, signOut } from '../actions.ts'
import { setState, useStore } from '../store.ts'
import { SiteHeader, ThemeButton, useSitePage } from './frame.tsx'
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
  body?: ReactNode
  graphic?: ComponentType
}

const ALL: Step[] = [
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
    title: 'One command connects an agent.',
    body: "Run it in a terminal for Claude Code; Cursor and other MCP clients take the same server. The agent learns the rules to follow, where everything lives and which tool to use, and it's told what's closed to it.",
    graphic: ConnectMotion,
  },
  {
    id: 'encrypted',
    name: 'Encryption',
    title: 'Encrypted on your device.',
    body: (
      <>
        Your map is sealed in this browser before it goes live, so the host stores only ciphertext. Anyone can check that with <code>locus verify</code>.
      </>
    ),
    graphic: EncryptedMotion,
  },
  { id: 'account', name: 'Your account', title: 'Keep your maps with you.' },
  { id: 'begin', name: 'Your first map', title: 'Add your documents.' },
]

/** The steps this host has. Without Google there's nothing to choose about an account, so there's no step for it. */
const stepsFor = (google: boolean) => (google ? ALL : ALL.filter((s) => s.id !== 'account'))

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

/** Google's standard "G", in its own colours, as its sign-in branding asks. The only mark of another company on the site, and only here. */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function Account({ next, after }: { next: () => void; after: string }) {
  const me = useStore((s) => s.me)
  // Why Google sent you back unsigned. Only worth saying if you aren't signed in after all.
  const [cameBack] = useState(startTrouble)
  const [trouble, setTrouble] = useState('')
  // Said here, once, in place. The same words would otherwise also lie over the page as a toast.
  useLayoutEffect(() => {
    if (startTrouble) setState({ toasts: [] })
    clearStartTrouble()
  }, [])

  if (me?.signedIn) {
    return (
      <>
        <p className="step-body">
          You're signed in as <b>{me.name || me.email}</b>
          {me.name && me.email ? <span className="step-soft"> ({me.email})</span> : null}. This host knows which addresses are yours, so on another device you'll only need your recovery key.
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
      <p className="step-body">Signing in with Google tells this host who you are, so you can claim an address and find your maps on another device. Google never sees your map or your recovery key.</p>
      <div className="step-choices">
        <button
          className="btn btn-lg btn-google"
          onClick={() => {
            leavingForGoogle()
            signInWithGoogle(after)
          }}
        >
          <GoogleG />
          Continue with Google
        </button>
        <button className="text-btn step-device" onClick={next}>
          Continue on this device
        </button>
      </div>
      <p className="step-soft step-small">On this device, with no account, your map stays in this browser until you go live.</p>
      {(trouble || cameBack) && (
        <p className="step-trouble" role="alert">
          {trouble || cameBack}
        </p>
      )}
    </>
  )
}

function Begin() {
  const me = useStore((s) => s.me)
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
      {/* Back from Google, this is the first thing seen, so it says the sign-in took. */}
      {me?.signedIn && <p className="step-soft step-small">Signed in as {me.name || me.email}.</p>}
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
  // Whether this host signs in with Google is known before this page is drawn, so the count of steps never changes under you.
  const google = useStore((s) => !!s.server?.google)
  const steps = stepsFor(google)
  const asked = new URLSearchParams(search).get('step')
  const found = steps.findIndex((s) => s.id === asked)
  // An old link to the account step, on a host without Google, goes on to the first map.
  const index = found >= 0 ? found : asked === 'account' ? steps.findIndex((s) => s.id === 'begin') : 0
  const step = steps[index]
  /** The first step that asks you to choose something. Skip intro goes there. */
  const choosing = steps.findIndex((s) => !s.graphic)
  const explaining = index < choosing
  const url = (i: number) => (i === 0 ? '/start' : `/start?step=${steps[i].id}`)
  const heading = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)

  const to = (i: number) => {
    if (i < 0 || i >= steps.length || i === index) return
    moved.current = true
    go(url(i))
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
      else if (e.key === 'Escape' && explaining) to(choosing)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })

  const Graphic = step.graphic

  return (
    <div className={`site start ${explaining ? 'is-explaining' : ''}`}>
      <SiteHeader>
        <ThemeButton />
        {explaining && (
          <Link to={url(choosing)} className="site-skip" onClick={() => (moved.current = true)}>
            Skip intro
          </Link>
        )}
      </SiteHeader>

      <main className={`start-main ${Graphic ? 'has-graphic' : ''}`} id="main">
        <div className="start-stage" key={step.id}>
          {Graphic && (
            <div className="plate start-plate">
              <Graphic />
            </div>
          )}
          <div className="start-text">
            <p className="eyebrow">
              <span className="eyebrow-n">{`${index + 1} of ${steps.length}`}</span>
              {step.name}
            </p>
            <h1 ref={heading} tabIndex={-1}>
              {step.title}
            </h1>
            {step.body && <p className="step-body">{step.body}</p>}
            {step.id === 'account' && <Account next={() => to(index + 1)} after={url(index + 1)} />}
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
          {/* One stop for Tab, on the step you're at. The arrows move between steps. */}
          {steps.map((s, i) => (
            <li key={s.id}>
              <button
                className={`dot ${i === index ? 'is-on' : ''} ${i < index ? 'is-done' : ''}`}
                tabIndex={i === index ? 0 : -1}
                aria-label={`Step ${i + 1} of ${steps.length}: ${s.name}`}
                aria-current={i === index ? 'step' : undefined}
                onClick={() => to(i)}
              />
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
