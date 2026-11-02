// Everything the app does: changing the map, minting passwords, publishing.

import { generatePassword, newId, openBundle, openOwnerCopy, publishToken, sealVault, sha256Hex, WrongPassword } from '../core/seal.ts'
import { createEmptyVault, createSample } from '../core/sample.ts'
import { snapshot } from '../core/status.ts'
import type { Bundle, Cost, Gate, Password, Piece, Vault } from '../core/types.ts'
import { layoutPieces } from './map/layout.ts'
import { getState, setState, storage, type Toast } from './store.ts'

// Toasts

let toastId = 1

export function toast(message: string, action?: Toast['action']) {
  const id = toastId++
  setState({ toasts: [...getState().toasts, { id, message, action }] })
  setTimeout(() => dismissToast(id), action ? 7000 : 3600)
}

export function dismissToast(id: number) {
  setState({ toasts: getState().toasts.filter((t) => t.id !== id) })
}

// Vault changes. Every change saves itself, like Figma and Notion.

let saveTimer = 0

function refreshList(all: Vault[]) {
  setState({ vaultList: all.map((v) => ({ id: v.id, name: v.company.name, sample: v.sample })) })
}

export function updateVault(change: (v: Vault) => Vault) {
  const v = getState().vault
  if (!v) return
  const next = { ...change(v), updatedAt: Date.now() }
  setState({ vault: next })
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    void storage.saveVault(next)
    const list = getState().vaultList.map((x) => (x.id === next.id ? { ...x, name: next.company.name } : x))
    setState({ vaultList: list })
  }, 180)
}

export function placeNewPieces(v: Vault, opts: { reflow?: boolean } = {}): Vault {
  const moved = layoutPieces(v.gates, v.pieces, v.links, opts)
  if (!moved.size) return v
  return { ...v, pieces: v.pieces.map((p) => (moved.has(p.id) ? { ...p, ...moved.get(p.id) } : p)) }
}

export async function openVault(v: Vault) {
  const placed = placeNewPieces(v)
  setState({ vault: placed, selected: null, lens: null, panel: null, dollars: false, agentView: false, mode: 'studio', view: null })
  await storage.saveVault(placed)
  await storage.set('lastVault', placed.id)
  const all = await storage.vaults()
  refreshList(all)
}

export async function loadSample() {
  const existing = (await storage.vaults()).find((v) => v.sample)
  await openVault(existing ?? createSample())
}

export async function newMap(name = 'Untitled company') {
  await openVault(createEmptyVault(name))
}

export async function switchVault(id: string) {
  const v = (await storage.vaults()).find((x) => x.id === id)
  if (v) await openVault(v)
}

export async function deleteCurrentMap() {
  const v = getState().vault
  if (!v) return
  // Removing it from the host frees the account's spot.
  if (v.site && v.published) {
    try {
      const token = await publishToken(v.site.ownerKey)
      await fetch(`/api/sites/${v.site.name}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    } catch {}
  }
  await storage.deleteVault(v.id)
  const rest = await storage.vaults()
  if (rest.length) {
    await openVault(rest[0])
  } else {
    await storage.remove('lastVault')
    setState({ vault: null, vaultList: [], selected: null, lens: null, panel: null, sheet: null })
  }
  setState({ sheet: null })
  toast(`Deleted ${v.company.name}.`)
}

// Pieces

export function addPiece(partial: Partial<Piece> = {}): string {
  const id = newId()
  const v = getState().vault!
  const gate = partial.gate ?? getState().lens ?? v.gates[0]?.id
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
  const before = { pieces: v.pieces, links: v.links, costs: v.costs }
  updateVault((x) => ({
    ...x,
    pieces: x.pieces.filter((p) => p.id !== id),
    links: x.links.filter((l) => l.from !== id && l.to !== id),
    costs: x.costs.filter((c) => c.piece !== id),
  }))
  setState({ selected: null })
  toast(`Deleted ${piece?.title ?? 'piece'}.`, {
    label: 'Undo',
    run: () => updateVault((x) => ({ ...x, ...before })),
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

export function renameGate(id: string, name: string) {
  updateVault((v) => ({ ...v, gates: v.gates.map((g) => (g.id === id ? { ...g, name } : g)) }))
}

export function deleteGate(gate: Gate) {
  const v = getState().vault!
  if (gate.builtin === 'money') return
  if (v.pieces.some((p) => p.gate === gate.id)) {
    toast('Move the pieces out of this gate first.')
    return
  }
  updateVault((x) => ({
    ...x,
    gates: x.gates.filter((g) => g.id !== gate.id),
    passwords: x.passwords.map((p) => ({ ...p, gates: p.gates.filter((g) => g !== gate.id) })),
  }))
}

// Passwords

export function createPassword(name = 'New password'): Password {
  const pw: Password = { id: newId(), name, key: generatePassword(), gates: [], remote: true, createdAt: Date.now() }
  updateVault((v) => ({ ...v, passwords: [...v.passwords, pw] }))
  setState({ lens: pw.id })
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

export async function revokePassword(id: string) {
  const v = getState().vault!
  const pw = v.passwords.find((p) => p.id === id)
  if (!pw) return
  updateVault((x) => ({ ...x, passwords: x.passwords.filter((p) => p.id !== id) }))
  setState({ lens: null })
  // Revoking takes effect right away. Waiting for a later publish would be a false sense of safety.
  if (v.site && v.published) {
    const ok = await publish()
    if (ok) toast(`Revoked ${pw.name}. It can't read anything published from now on.`)
  } else {
    toast(`Removed ${pw.name}.`)
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

export async function publish(): Promise<boolean> {
  const v = getState().vault
  if (!v) return false
  if (!v.site) {
    setState({ sheet: { kind: 'publish' } })
    return false
  }
  lastPublishFailure = null
  setState({ publishing: true })
  try {
    let version = (v.published?.version ?? 0) + 1
    const server = getState().server
    let nonce = ''
    if (!v.published && server?.powBits) nonce = await solvePow(v.site.name, server.powBits)

    const token = await publishToken(v.site.ownerKey)
    const send = async (ver: number) =>
      fetch(`/api/sites/${v.site!.name}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(nonce ? { 'x-vadere-pow': nonce } : {}) },
        // The sealed copy records its own publish, so a new device starts up to date.
        body: JSON.stringify(await sealVault({ ...v, published: snapshot(v, ver) }, ver)),
      })

    let res = await send(version)
    if (res.status === 409) {
      // Another device published first. Go past it.
      const body = await res.json()
      version = (body.version ?? version) + 1
      res = await send(version)
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      lastPublishFailure = { code: body.code ?? 'error', message: body.error ?? `The host answered ${res.status}.` }
      if (body.accounts) setState({ server: { ...getState().server!, accounts: body.accounts } })
      toast(lastPublishFailure.message)
      return false
    }
    updateVault((x) => ({ ...x, published: snapshot(x, version) }))
    void refreshServer()
    return true
  } catch (e) {
    lastPublishFailure = { code: 'network', message: "Couldn't reach the host. Your map is safe in this browser." }
    toast(lastPublishFailure.message)
    return false
  } finally {
    setState({ publishing: false })
  }
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
    if (res.status === 404) return `Nothing is published under "${name}".`
    if (!res.ok) return `The host answered ${res.status}.`
    const bundle = (await res.json()) as Bundle
    const vault = await openOwnerCopy(bundle, ownerKey)
    await openVault(vault)
    setState({ sheet: null })
    toast(`Signed in to ${vault.company.name}.`)
    return null
  } catch (e) {
    if (e instanceof WrongPassword) return "That owner key doesn't open this map."
    return "Couldn't reach the host."
  }
}

// Reading a published map with a password, in this browser.

export async function unlockViewer(name: string, key: string): Promise<string | null> {
  try {
    const prefix = location.pathname.startsWith('/s/') ? `/s/${name}` : ''
    const res = await fetch(`${prefix}/bundle.json`)
    if (res.status === 404) return 'Nothing is published here yet.'
    if (!res.ok) return `The host answered ${res.status}.`
    const view = await openBundle((await res.json()) as Bundle, key.trim())
    // A reader gets a map of what they can see, drawn fresh, with no gaps where closed gates sit.
    const moved = layoutPieces(view.gates, view.pieces, view.links, { wide: window.innerWidth > window.innerHeight })
    setState({ view: { ...view, pieces: view.pieces.map((p) => ({ ...p, ...moved.get(p.id) })) }, mode: 'viewer' })
    return null
  } catch (e) {
    if (e instanceof WrongPassword) return "That password doesn't open this map."
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

export async function copy(text: string, label = 'Copied.') {
  try {
    await navigator.clipboard.writeText(text)
    toast(label)
    return true
  } catch {
    toast("Couldn't reach the clipboard. Select the text and copy it by hand.")
    return false
  }
}
