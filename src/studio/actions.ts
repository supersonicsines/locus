// Everything the app does: changing the map, minting passwords, publishing.

import { AlteredBundle, generatePassword, newId, openBundle, openOwnerCopy, publishToken, sealVault, sha256Hex, WrongPassword } from '../core/seal.ts'
import { createEmptyVault, createSample } from '../core/sample.ts'
import { snapshot } from '../core/status.ts'
import type { Bundle, Cost, Gate, Password, Piece, Vault } from '../core/types.ts'
import { layoutPieces, restorePositions } from './map/layout.ts'
import { getState, setState, storage, type Toast } from './store.ts'
import { asReaderSees, putAreaBack, putPieceBack, rejectKeepsItem, rejectProposal, undoRejectProposal, withoutArea, withoutPiece } from './ui/data.ts'

// Toasts

let toastId = 1

/**
 * One message at a time. Two stacked hide more of the map than either, and the newer one usually overtakes the older. The exception is a way out, such as Undo: it stays beside a plain message, until another replaces it.
 * `status` is for a message about how things stand right now: it goes as soon as they've changed.
 */
export function toast(message: string, action?: Toast['action'], { status = false, untilUpdate = false }: { status?: boolean; untilUpdate?: boolean } = {}) {
  const id = toastId++
  const keep = action ? [] : getState().toasts.filter((t) => t.action && !t.status).slice(-1)
  setState({ toasts: [...keep, { id, message, action, status, untilUpdate }] })
  // Long enough to read. A sentence that says what went wrong is no use gone in three seconds.
  setTimeout(() => dismissToast(id), Math.max(action ? 8000 : 3600, message.length * 70))
}

export function dismissToast(id: number) {
  setState({ toasts: getState().toasts.filter((t) => t.id !== id) })
}

/** Something that interrupts the page has opened. What was said before it opened would only sit on top of it. */
export function clearToasts() {
  if (getState().toasts.length) setState({ toasts: [] })
}

/** A list is opening that fills the page, so what was said before it would only lie across it. A way out stays. */
export function clearPlainToasts() {
  const now = getState().toasts
  if (now.some((t) => !t.action)) setState({ toasts: now.filter((t) => t.action) })
}

/** "Updated" or "You're live", once that's no longer how things stand. */
export function clearStatusToasts() {
  const now = getState().toasts
  if (now.some((t) => t.status)) setState({ toasts: now.filter((t) => !t.status) })
}

// Vault changes. Every change saves itself, like Figma and Notion.

let saveTimer = 0

function refreshList(all: Vault[]) {
  setState({ vaultList: all.map((v) => ({ id: v.id, name: v.company.name, sample: v.sample, items: v.pieces.length })) })
}

export function updateVault(change: (v: Vault) => Vault) {
  const v = getState().vault
  if (!v) return
  const next = { ...change(v), updatedAt: Date.now() }
  setState({ vault: next })
  clearStatusToasts()
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    void storage.saveVault(next)
    const list = getState().vaultList.map((x) => (x.id === next.id ? { ...x, name: next.company.name, items: next.pieces.length } : x))
    setState({ vaultList: list })
  }, 180)
}

/** The shape of the room the map has on this screen: its width over its height, once what floats over it is taken off. */
const mapRoom = () => (window.innerWidth <= 720 ? (window.innerWidth - 32) / Math.max(1, window.innerHeight - 210) : (window.innerWidth - 328) / Math.max(1, window.innerHeight - 134))

export function placeNewPieces(v: Vault, opts: { reflow?: boolean } = {}): Vault {
  const moved = layoutPieces(v.gates, v.pieces, { wide: window.innerWidth > window.innerHeight, room: mapRoom(), ...opts })
  if (!moved.size) return v
  return { ...v, pieces: v.pieces.map((p) => (moved.has(p.id) ? { ...p, ...moved.get(p.id) } : p)) }
}

/** Bump when the layout changes, so a sample already in this browser gets redrawn. Real maps keep their positions. */
const SAMPLE_LAYOUT = 4

/**
 * A map drawn before areas had any order keeps a scatter nobody chose. One that has never gone live gets redrawn, once, and says so, with a way back,
 * because it might be an arrangement someone made by hand. A live map isn't touched, because someone may know their way around it. Tidy up the map does it on request.
 */
const MAP_LAYOUT = 1

export async function openVault(v: Vault) {
  let placed = placeNewPieces(v)
  if (v.sample && (await storage.get<number>('sampleLayout')) !== SAMPLE_LAYOUT) {
    placed = placeNewPieces(placed, { reflow: true })
    await storage.set('sampleLayout', SAMPLE_LAYOUT)
  }
  const stamp = `mapLayout:${v.id}`
  let redrawnFrom: Piece[] | null = null
  if (!v.sample && (await storage.get<number>(stamp)) !== MAP_LAYOUT) {
    if (!v.published && v.pieces.some((p) => p.x !== undefined)) {
      const redrawn = placeNewPieces(placed, { reflow: true })
      const held = new Map(placed.pieces.map((p) => [p.id, p]))
      // Worth saying only if something really moved. Positions are saved to a tenth.
      if (redrawn.pieces.some((p) => Math.abs(p.x! - (held.get(p.id)?.x ?? p.x!)) >= 0.5 || Math.abs(p.y! - (held.get(p.id)?.y ?? p.y!)) >= 0.5)) redrawnFrom = placed.pieces
      placed = redrawn
    }
    await storage.set(stamp, MAP_LAYOUT)
  }
  // Anything still on screen is about the map being left. An Undo pressed here would act on this one, and "5 items on the map" over an empty one is simply false.
  setState({ vault: placed, selected: null, lens: null, area: null, panel: null, dollars: false, agentView: false, mode: 'studio', view: null, toasts: [] })
  await storage.saveVault(placed)
  await storage.set('lastVault', placed.id)
  const all = await storage.vaults()
  refreshList(all)
  if (redrawnFrom) {
    const before = redrawnFrom
    toast('Tidied this map, so like things sit together.', { label: 'Undo', run: () => putBack(placed.id, before) })
  } else if (placed.published) await offerTidy(placed)
}

/**
 * A live map keeps its positions, so one arranged long ago or by hand can open with names on top of each other, and on a phone there's no dragging them apart. The cure is one press away and otherwise lives in a menu, so it's offered, once for each map.
 */
async function offerTidy(v: Vault) {
  const stamp = `tidyOffered:${v.id}`
  if (await storage.get<boolean>(stamp)) return
  const tidy = placeNewPieces(v, { reflow: true })
  const held = new Map(v.pieces.map((p) => [p.id, p]))
  const astray = tidy.pieces.filter((p) => Math.hypot(p.x! - (held.get(p.id)?.x ?? p.x!), p.y! - (held.get(p.id)?.y ?? p.y!)) >= 60).length
  if (astray < Math.max(4, v.pieces.length * 0.4)) return
  await storage.set(stamp, true)
  toast("This map's names may sit on top of each other, because of how it was arranged.", { label: 'Tidy up', run: () => { tidyMap(); askFit() } })
}

/** Undo for anything that redraws the map. By then the person may have gone to another map, which it mustn't touch. */
function putBack(id: string, before: Piece[]) {
  updateVault((vault) => (vault.id === id ? { ...vault, pieces: restorePositions(vault.pieces, before) } : vault))
}

export async function loadSample() {
  const existing = (await storage.vaults()).find((v) => v.sample)
  await openVault(existing ?? createSample())
}

/** Something has changed the map enough that it should be seen whole, even if you've moved it. */
export function askFit() {
  setState({ fitAsk: getState().fitAsk + 1 })
}

export async function newMap(name = 'Untitled company') {
  // Asked for twice, that's still one new map. An empty one with no name is the map you were asking for.
  const spare = (await storage.vaults()).find((v) => !v.sample && !v.site && !v.pieces.length && !v.passwords.length && v.company.name === name)
  await openVault(spare ?? createEmptyVault(name))
}

export async function switchVault(id: string) {
  const v = (await storage.vaults()).find((x) => x.id === id)
  if (v) await openVault(v)
}

export async function deleteCurrentMap() {
  const v = getState().vault
  if (!v) return
  // Removing it from the host frees the account's spot. If that fails, keep the
  // map: claiming it's gone while every password still works would be worse.
  if (v.site && v.published) {
    const failed = "Couldn't take it off the host, so nothing was deleted and every password still works. Check your connection and try again."
    try {
      const token = await publishToken(v.site.ownerKey)
      const res = await fetch(`/api/sites/${v.site.name}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok && res.status !== 404) {
        setState({ sheet: null })
        toast(failed)
        return
      }
    } catch {
      setState({ sheet: null })
      toast(failed)
      return
    }
  }
  await storage.deleteVault(v.id)
  const rest = await storage.vaults()
  if (rest.length) {
    await openVault(rest[0])
  } else {
    await storage.remove('lastVault')
    setState({ vault: null, vaultList: [], selected: null, lens: null, area: null, panel: null, sheet: null })
  }
  setState({ sheet: null })
  toast(`Deleted ${v.company.name}.`)
}

// Pieces

export function addPiece(partial: Partial<Piece> = {}): string {
  const id = newId()
  const v = getState().vault!
  const gate = partial.gate ?? getState().area ?? v.gates[0]?.id
  const piece: Piece = { id, title: 'Untitled', summary: '', body: '', kind: 'fact', gate: gate!, updatedAt: Date.now(), ...partial }
  updateVault((x) => placeNewPieces({ ...x, pieces: [...x.pieces, piece] }))
  setState({ selected: id })
  return id
}

export function changePiece(id: string, patch: Partial<Piece>) {
  updateVault((v) => ({ ...v, pieces: v.pieces.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)) }))
}

export function deletePiece(id: string) {
  const v = getState().vault!
  const piece = v.pieces.find((p) => p.id === id)
  updateVault((x) => withoutPiece(x, id))
  setState({ selected: null })
  toast(`Deleted ${piece?.title ?? 'that item'}.`, {
    label: 'Undo',
    run: () => updateVault((x) => (x.id === v.id ? putPieceBack(x, v, id) : x)),
  })
}

/** Saying no to what a document proposed. It says what that did, because until now the words were reaching readers, and on a live map they still are until the update. */
export function rejectItem(id: string) {
  const v = getState().vault
  const piece = v?.pieces.find((p) => p.id === id)
  if (!v || !piece) return
  const keeps = rejectKeepsItem(v, piece)
  updateVault((x) => rejectProposal(x, id))
  if (!keeps && getState().selected === id) setState({ selected: null })
  const live = !!v.published && !!v.site
  const said = keeps
    ? `Rejected the address for ${piece.title}. It stays on the map because it has a price. Delete it if you don't use it.`
    : `Rejected ${piece.title}. It's off the map, ${live ? 'and readers stop getting it at your next update' : 'so no reader will get it'}.`
  toast(said, { label: 'Undo', run: () => updateVault((x) => (x.id === v.id ? undoRejectProposal(x, v, id) : x)) }, { untilUpdate: live })
}

/** Puts everything back in order, area by area, for a map that's been dragged about or was drawn long ago. */
export function tidyMap() {
  const v = getState().vault
  if (!v) return
  const before = v.pieces
  updateVault((vault) => placeNewPieces(vault, { reflow: true }))
  toast('Tidied the map.', {
    label: 'Undo',
    run: () => putBack(v.id, before),
  })
}

export function movePiece(id: string, x: number, y: number, gate: string | null) {
  const v = getState().vault
  if (!v) return
  const piece = v.pieces.find((p) => p.id === id)
  if (!piece) return
  const oldGate = piece.gate
  const oldX = piece.x
  const oldY = piece.y
  updateVault((vault) => ({
    ...vault,
    pieces: vault.pieces.map((p) => (p.id === id ? { ...p, x, y, ...(gate ? { gate } : {}) } : p)),
  }))
  if (gate) {
    const name = v.gates.find((g) => g.id === gate)?.name
    toast(`Moved ${piece.title} to ${name}.`, {
      label: 'Undo',
      run: () => updateVault((vault) => ({ ...vault, pieces: vault.pieces.map((p) => (p.id === id ? { ...p, gate: oldGate, x: oldX, y: oldY } : p)) })),
    })
  }
}

export function setCost(pieceId: string, patch: Partial<Cost> | null) {
  updateVault((v) => {
    if (patch === null) return { ...v, costs: v.costs.filter((c) => c.piece !== pieceId) }
    const existing = v.costs.find((c) => c.piece === pieceId)
    if (existing) return { ...v, costs: v.costs.map((c) => (c.piece === pieceId ? { ...c, ...patch } : c)) }
    const piece = v.pieces.find((p) => p.id === pieceId)
    const cost: Cost = { piece: pieceId, label: piece?.title ?? '', amount: null, currency: v.currency, unit: 'flat', period: 'month', source: 'you', ...patch }
    return { ...v, costs: [...v.costs, cost] }
  })
}

// Gates

export function addGate(name: string): string {
  const id = newId()
  updateVault((v) => ({ ...v, gates: [...v.gates, { id, name }] }))
  return id
}

/** An area with nothing in it has no land on the map, so a new one starts with a first note. */
/** An area needs something on it to have any land. Until someone writes in it, this note says what it's for, and follows the area's name. */
const firstNote = (area: string) => `About ${area}`

export function addArea() {
  const id = addGate('New area')
  addPiece({ gate: id, title: firstNote('New area') })
  setState({ selected: null, area: id, panel: 'area' })
}

export function renameGate(id: string, name: string) {
  updateVault((v) => {
    const old = v.gates.find((g) => g.id === id)?.name
    return {
      ...v,
      gates: v.gates.map((g) => (g.id === id ? { ...g, name } : g)),
      pieces: v.pieces.map((p) => (p.gate === id && old !== undefined && p.title === firstNote(old) && !p.summary && !p.body ? { ...p, title: firstNote(name) } : p)),
    }
  })
}

/** An area and everything on it. The wrong one is a click away from being put back. */
export function deleteArea(gate: Gate) {
  const v = getState().vault!
  if (gate.builtin === 'money') return
  const count = v.pieces.filter((p) => p.gate === gate.id).length
  updateVault((x) => withoutArea(x, gate.id))
  setState({ area: null, panel: null, selected: null })
  askFit()
  toast(`Deleted ${gate.name}${count ? ` and ${count === 1 ? 'its item' : `its ${count} items`}` : ''}.`, {
    label: 'Undo',
    run: () => updateVault((x) => (x.id === v.id ? putAreaBack(x, v, gate.id) : x)),
  })
}

// Passwords

export function createPassword(name = 'New reader'): Password {
  const pw: Password = { id: newId(), name, key: generatePassword(), gates: [], remote: true, createdAt: Date.now() }
  updateVault((v) => ({ ...v, passwords: [...v.passwords, pw] }))
  setState({ lens: pw.id, selected: null })
  return pw
}

export function changePassword(id: string, patch: Partial<Password>) {
  updateVault((v) => ({ ...v, passwords: v.passwords.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
}

export function toggleGateOnPassword(pwId: string, gateId: string) {
  const v = getState().vault!
  const pw = v.passwords.find((p) => p.id === pwId)
  if (!pw) return
  const open = pw.gates.includes(gateId)
  changePassword(pwId, { gates: open ? pw.gates.filter((g) => g !== gateId) : [...pw.gates, gateId] })
}

/** Why a password that was meant to stop didn't. What to do follows it, so this is only the what. */
const whyNot = () => (lastPublishFailure?.code === 'network' ? "Couldn't reach the host." : (lastPublishFailure?.message ?? "Couldn't update."))

export async function revokePassword(id: string) {
  const v = getState().vault!
  const pw = v.passwords.find((p) => p.id === id)
  if (!pw) return
  updateVault((x) => ({ ...x, passwords: x.passwords.filter((p) => p.id !== id) }))
  // Their panel goes with them, so it can't hold the map's right-hand side open with nothing in it.
  setState({ lens: null, agentView: false, panel: getState().panel === 'share' ? null : getState().panel })
  // Revoking takes effect right away. Waiting for a later publish would be a false sense of safety.
  if (v.site && v.published) {
    const ok = await publish({ quiet: true })
    if (ok) toast(`Removed ${pw.name}. They can't read anything that goes live from now on.`)
    else if (lastPublishFailure?.code !== 'stale') toast(`${whyNot()} So ${pw.name}'s password still works. Press Update to try again.`)
  } else {
    toast(`Removed ${pw.name}.`)
  }
}

/**
 * Stops one password and makes another for the same reader, who keeps their name, their place and what they can read.
 * A new id too: the old one is what the live copy knows, so until the update lands the map still says the old password works.
 */
export async function replacePassword(id: string) {
  const v = getState().vault!
  const pw = v.passwords.find((p) => p.id === id)
  if (!pw) return
  const fresh: Password = { ...pw, id: newId(), key: generatePassword(), createdAt: Date.now() }
  updateVault((x) => ({ ...x, passwords: x.passwords.map((p) => (p.id === id ? fresh : p)) }))
  setState({ lens: fresh.id })
  if (v.site && v.published) {
    const ok = await publish({ quiet: true })
    if (ok) toast(`${pw.name} has a new password, and the old one can't read anything that goes live from now on. Connect them again with the new one.`)
    else if (lastPublishFailure?.code !== 'stale') toast(`${whyNot()} So the old password still works. Press Update to try again.`)
  } else {
    toast(`${pw.name} has a new password.`)
  }
}

// Publishing

/** A little work for the first claim of a name, so a script can't take every free account. */
async function solvePow(name: string, bits: number): Promise<string> {
  if (bits <= 0) return ''
  const zeroHexChars = Math.floor(bits / 4)
  const rest = bits % 4
  const prefix = '0'.repeat(zeroHexChars)
  for (let n = 0; ; n++) {
    const hex = await sha256Hex(`vadere claim ${name} ${n}`)
    if (!hex.startsWith(prefix)) continue
    if (rest === 0 || parseInt(hex[zeroHexChars], 16) < 2 ** (4 - rest)) return String(n)
  }
}

export function siteAddress(name: string): string {
  const template = getState().server?.address
  if (template) return template.replace('{name}', name)
  return `${location.protocol}//${name}.${location.host}`
}

export interface PublishFailure {
  code: string
  message: string
}

export let lastPublishFailure: PublishFailure | null = null

/** Updating from a button: it says it worked, because the only other sign is a small word changing in a corner. */
export async function publishAndSay() {
  const wasLive = !!getState().vault?.published
  if ((await publish()) && wasLive) toast('Updated. Your readers get this the next time they read the map.', undefined, { status: true })
}

const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0)} MB`

export async function publish({ quiet = false }: { quiet?: boolean } = {}): Promise<boolean> {
  const v = getState().vault
  if (!v) return false
  if (!v.site) {
    setState({ sheet: { kind: 'publish' } })
    return false
  }
  lastPublishFailure = null
  setState({ publishing: true })
  try {
    const version = (v.published?.version ?? 0) + 1
    const server = getState().server
    let nonce = ''
    if (!v.published && server?.powBits) nonce = await solvePow(v.site.name, server.powBits)

    const token = await publishToken(v.site.ownerKey)
    // What was sealed is what counts as published, even if you keep editing meanwhile.
    const sealedState = snapshot(v, version)
    // The sealed copy records its own publish, so a new device starts up to date.
    const body = JSON.stringify(await sealVault({ ...v, published: sealedState }, version))
    const sealedBytes = new TextEncoder().encode(body).length
    const res = await fetch(`/api/sites/${v.site.name}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(nonce ? { 'x-vadere-pow': nonce } : {}) },
      body,
    })

    if (res.status === 409) {
      // Another device published first. Publishing over it from this older copy
      // could quietly bring back a password that was revoked there.
      lastPublishFailure = { code: 'stale', message: "A newer version went live from another device, so this one didn't." }
      // Always said, because Load it is the only way out and only this toast offers it.
      toast(`${lastPublishFailure.message} Loading it replaces any changes here that aren't live yet.`, { label: 'Load it', run: () => void reloadFromHost() })
      return false
    }
    if (!res.ok) {
      const answer = await res.json().catch(() => ({}))
      // Far over the limit, the host hangs up before it can say why, so a bare 413 has to be explained here.
      const tooBig = `This map is too big to go live here: its encrypted copy is ${megabytes(sealedBytes)}${server?.maxBundleBytes ? `, and the limit is ${megabytes(server.maxBundleBytes)}` : ', which is over the limit'}. Take something off the map, or run your own host.`
      // The host knows the limit, and only this side knows how far over it is.
      lastPublishFailure = { code: answer.code ?? 'error', message: answer.code === 'too-large' || res.status === 413 ? tooBig : (answer.error ?? `The host answered ${res.status}. Try again in a moment.`) }
      if (answer.accounts) setState({ server: { ...getState().server!, accounts: answer.accounts } })
      if (!quiet) toast(lastPublishFailure.message)
      return false
    }
    updateVault((x) => ({ ...x, published: sealedState }))
    void refreshServer()
    // "Couldn't reach the host, so this password still works" mustn't sit beside the update that fixed it.
    setState({ toasts: getState().toasts.filter((t) => t.action && !t.untilUpdate) })
    return true
  } catch (e) {
    lastPublishFailure = { code: 'network', message: "Couldn't reach the host. Your map is still here, in this browser. Check your connection and try again." }
    if (!quiet) toast(lastPublishFailure.message)
    return false
  } finally {
    setState({ publishing: false })
  }
}

/** Replaces this device's copy with what's live, using the owner key. */
export async function reloadFromHost() {
  const site = getState().vault?.site
  if (!site) return
  const err = await signIn(site.name, site.ownerKey)
  if (err) toast(err)
}

export async function refreshServer() {
  try {
    const res = await fetch('/api/info')
    if (res.ok) setState({ server: await res.json() })
  } catch {}
}

// Signing in with an owner key on another device.

export async function signIn(name: string, ownerKey: string): Promise<string | null> {
  try {
    const res = await fetch(`/s/${encodeURIComponent(name)}/bundle.json`)
    if (res.status === 404) return `Nothing is live under "${name}". Check the address.`
    if (!res.ok) return `The host answered ${res.status}.`
    const bundle = (await res.json()) as Bundle
    const vault = await openOwnerCopy(bundle, ownerKey)
    await openVault(vault)
    setState({ sheet: null })
    toast(`Signed in to ${vault.company.name}.`)
    return null
  } catch (e) {
    if (e instanceof WrongPassword) return "That recovery key doesn't open this map. Check you copied all of it."
    return "Couldn't reach the host. Check your connection and try again."
  }
}

// Reading a published map with a password, in this browser.

export async function unlockViewer(name: string, key: string): Promise<string | null> {
  try {
    const prefix = location.pathname.startsWith('/s/') ? `/s/${name}` : ''
    let res: Response
    try {
      res = await fetch(`${prefix}/bundle.json`)
    } catch {
      return "Couldn't reach this map. Check your connection and try again."
    }
    if (res.status === 404) return 'Nothing is live at this address.'
    if (!res.ok) return `The host answered ${res.status}. Try again in a moment.`
    const view = await openBundle((await res.json()) as Bundle, key.trim())
    // A reader gets a map of what they can see, drawn fresh, with no gaps where closed gates sit.
    // Laid out as it'll be shown, so a rule that's only reference sits with the facts it's filed with.
    const moved = layoutPieces(view.gates, view.pieces.map(asReaderSees), { wide: window.innerWidth > window.innerHeight, room: mapRoom() })
    setState({ view: { ...view, pieces: view.pieces.map((p) => ({ ...p, ...moved.get(p.id) })) }, mode: 'viewer' })
    return null
  } catch (e) {
    if (e instanceof WrongPassword) return "That password doesn't open this map. Check you copied all of it, or ask whoever gave it to you for a new one."
    if (e instanceof AlteredBundle) return e.message
    return "Couldn't read this map."
  }
}

export function setTheme(theme: 'light' | 'dark') {
  try {
    localStorage.setItem('vadere-theme', theme)
  } catch {}
  document.documentElement.dataset.theme = theme
  setState({ theme })
}

export function downloadText(filename: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** With no label, the button that was pressed says so itself, and nothing else on the page has to move. */
export async function copy(text: string, label: string | null = 'Copied.') {
  try {
    await navigator.clipboard.writeText(text)
    if (label) toast(label)
    return true
  } catch {
    toast("Couldn't reach the clipboard. Select the text and copy it by hand.")
    return false
  }
}
