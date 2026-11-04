// What a reader gets, as opposed to what the owner keeps. One place, so the sealed
// bundle and the Studio's preview can't disagree.

import type { Cost, Piece } from './types.ts'

export function pieceForReaders(p: Piece): Piece {
  const out: Piece = { ...p }
  // Unapproved proposals must never reach an agent as instructions. The piece itself still does, as reference.
  if (out.always === 'proposed') delete out.always
  if (out.mcp && !out.mcp.approved) delete out.mcp
  // Where pieces sit on the owner's map could hint at what's behind closed gates.
  delete out.x
  delete out.y
  return out
}

export function costForReaders(c: Cost): Cost {
  // Money can be open while the document's own gate is closed, and a file's name
  // can say a lot. "Project-Falcon-acquisition.pdf" shouldn't travel with a price.
  return c.statedIn ? { ...c, statedIn: 'a document' } : c
}
