// The shared vocabulary of Vadere. Everything else is built from these.

export type PieceKind =
  | 'rule'
  | 'fact'
  | 'decision'
  | 'clause'
  | 'spec'
  | 'token'
  | 'service'
  | 'contract'
  | 'person'
  | 'doc'

export const PIECE_KINDS: PieceKind[] = [
  'rule', 'fact', 'decision', 'clause', 'spec', 'token', 'service', 'contract', 'person', 'doc',
]

export interface Piece {
  id: string
  title: string
  /** One line. This is what an agent sees on the map. */
  summary: string
  /** Markdown subset. Never rendered as raw HTML. */
  body: string
  kind: PieceKind
  gate: string
  source?: { file: string; where?: string }
  url?: string
  /** A rule that binds every agent. Shredding can only propose; the owner approves. */
  always?: 'proposed' | 'approved'
  /** Remote MCP server for a service. Unapproved servers never reach an agent. */
  mcp?: { url: string; approved: boolean }
  /** When this piece expires, renews or was last true. */
  date?: { on: string; means: 'ends' | 'renews' | 'as-of' }
  /** Saved position on the map. Spatial memory is part of the product. */
  x?: number
  y?: number
  updatedAt: number
}

export interface Link {
  from: string
  to: string
  kind: 'related' | 'governs' | 'uses' | 'conflicts'
  label?: string
}

export interface Gate {
  id: string
  name: string
  note?: string
  /** The Money gate holds prices and can't be deleted. */
  builtin?: 'money'
}

export type CostSource = 'invoice' | 'list' | 'you'
export type CostUnit = 'flat' | 'seat' | 'usage'

/** One service has one cost record. Precedence: you, then invoice, then list. */
export interface Cost {
  piece: string
  /** Kept here so a password with Money but not the service's gate can still read the bill. */
  label: string
  /** Null means the price is unknown. Zero means free. */
  amount: number | null
  currency: string
  unit: CostUnit
  seats?: number
  period: 'month' | 'year'
  source: CostSource
  plan?: string
  asOf?: string
  renews?: string
  /** The bundled list price, kept to compare against an invoice. */
  listAmount?: number
  /** The previous invoice's amount, to spot a usage jump. */
  previous?: number
}

export interface Password {
  id: string
  name: string
  /** vdr_... generated, never chosen. Kept so the owner can re-seal and show it again. */
  key: string
  gates: string[]
  /** Whether the host may decrypt on this password's behalf. */
  remote: boolean
  createdAt: number
}

/** Something Cartographer noticed: a contradiction, or a thing that ought to exist. */
export interface Finding {
  id: string
  kind: 'conflict' | 'gap'
  message: string
  pieces: string[]
  dismissed?: boolean
}

export interface Company {
  name: string
  about: string
}

export interface PublishedState {
  version: number
  at: number
  /** content hash per piece id, to count what changed since publishing */
  pieces: Record<string, string>
  /** which gate each piece was in when published */
  pieceGates: Record<string, string>
  /** gates each password opened when published */
  passwords: Record<string, string[]>
  /** hash of everything else that ends up in the bundle */
  rest: string
}

export interface Site {
  name: string
  ownerKey: string
  /** Where it is published, for example http://localhost:4747 */
  origin: string
  ownerKeySaved?: boolean
}

/** Everything the owner has. Lives in the browser; a sealed copy goes in the bundle. */
export interface Vault {
  format: 1
  id: string
  sample?: boolean
  company: Company
  gates: Gate[]
  pieces: Piece[]
  links: Link[]
  costs: Cost[]
  passwords: Password[]
  findings: Finding[]
  site?: Site
  published?: PublishedState
  currency: string
  createdAt: number
  updatedAt: number
}

// What sits on the host.

export interface Sealed {
  iv: string
  ct: string
}

export interface Bundle {
  format: 'vadere/1'
  site: string
  version: number
  sealedAt: string
  head: Sealed
  gates: Record<string, Sealed>
  bridges: Record<string, Sealed>
  passwords: Record<string, { remote: boolean; sealed: Sealed }>
  owner: Sealed
}

/** What one password can read once a bundle is opened. */
export interface View {
  site: string
  version: number
  sealedAt: string
  passwordName: string
  company: Company
  currency: string
  gates: Gate[]
  closedGates: number
  pieces: Piece[]
  links: Link[]
  /** Null unless this password opens Money. */
  costs: Cost[] | null
  remote: boolean
}
