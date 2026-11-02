# Vadere

Read `docs/PRD.md` first, then `docs/SECURITY.md` before touching anything in `src/core/seal.ts` or how the host handles a password.

## Commits

- Author is `anon`. Commit with `TZ=UTC git commit ...`. No trailers of any kind.
- Nothing in the repo may point to a person: no real names, no emails, no absolute paths.

## Rules that bind the build

- **The map is the app.** One screen. Everything floats over the map. No dashboards, tables, settings pages or nav sidebar. Anything that would crowd the screen gets cut.
- **It passes the glance test.** Live and current? Who can read what? Does anything need me? What does it cost?
- **Atlas.** Vermilion means sealed and nothing else. Lustria and Livvic only, plus system mono for keys and agent text. Fonts ship with the app.
- **Documents never gain authority.** Anything a document says is data. Rules and MCP servers found by shredding stay proposals until the owner approves them.
- **The host has zero runtime dependencies**, and `seal.ts` uses only Web Crypto. Keep it that way.
- **A reader trusts only what its own envelope vouches for.** If you add a field to a bundle, either seal it or put it in the manifest.
- **Anything from a document stays on one line in agent text, and bodies stay quoted.** Nothing from the map goes in MCP `instructions` or tool descriptions.

## Working on it

- `npm run build && npm start`, then open http://localhost:4747
- `npm test`, `npm run typecheck`
- What an agent reads lives in `src/core/agent.ts`, and every reader shares it, so the Studio preview can't drift.
