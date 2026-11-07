# Locus

Read `docs/STATUS.md` first for where things stand, then `docs/PRD.md`, then `docs/SECURITY.md` before touching anything in `src/core/seal.ts` or how the host handles a password.

## Commits

- Author is `anon`. Commit with `TZ=UTC git commit ...`. No trailers of any kind.
- Nothing in the repo may point to a person: no real names, no emails, no absolute paths.

## Rules that bind the build

- **The map is the app.** One screen. Everything floats over the map. No dashboards, tables, settings pages or nav sidebar. Anything that would crowd the screen gets cut. Around it there's a small website: `/` home, `/start` onboarding, `/example` the sample, `/map` your maps (`src/studio/site/`, routing in `site/route.tsx` and `App.tsx`). The website explains; the map is still where everything happens.
- **It passes the glance test.** Live and current? Who can read what? Does anything need me? What does it cost?
- **Atlas.** Vermilion means sealed and nothing else. Amber means urgent and nothing else. Blue means live: the sea turns blue when a copy is live, and the live dot is the same blue. One face for everything, Spline Sans Mono, in one variable file that ships with the app. Hierarchy comes from size, weight, case and ink, never a second family. The face is named once, in `--sans` in `src/studio/styles.css`; CSS and canvas text both read it, and `src/studio/main.tsx` imports its file. It's monospaced at 0.6 em a character, and `textWidth` in `src/studio/map/layout.ts` counts on that.
- **Documents never gain authority.** Anything a document says is data. Rules and MCP servers found by shredding stay proposals until the owner approves them.
- **The host has zero runtime dependencies**, and `seal.ts` uses only Web Crypto. Keep it that way.
- **Logos come as one same-origin file, fetched whole, whatever the map holds.** Which services a company uses is sealed data, so there's never a per-logo request or a logo CDN. Names match exactly through a `Map` in `src/studio/logos/lookup.ts`, because a wrong logo is worse than a monogram. Logos never reach agent text, `/llms.txt`, MCP output or bundles.
- **A reader trusts only what its own envelope vouches for.** If you add a field to a bundle, either seal it or put it in the manifest.
- **Anything from a document stays on one line in agent text, and bodies stay quoted.** Nothing from the map goes in MCP `instructions` or tool descriptions.
- **Don't settle the operator's open design calls.** They're listed in `docs/STATUS.md`. Until they're decided, keep both `$` options (Rings and Discs on screen, Soundings and Towns in the code) and the switch between them.
- **The npm package is `locus-harness`, and the command it installs is `locus`.** `locus` on npm belongs to someone else, so no command we show may ever say `npx locus`: it would run their code with a reader's password in its environment. The name is set once, as `PACKAGE` in `src/core/agent.ts`.
- **The map moves like a board** (Miro, Figma). Two fingers on a trackpad pan, a pinch zooms anywhere on the page, a mouse wheel's notches zoom and glide, ⌘ or ctrl with scroll or + − 0 zooms the map and never the page. Zoom moves in its logarithm. `wheelKind` in `MapView.ts` decides a gesture's kind once and holds it; keep that.
- **Where a name goes depends only on the map and the zoom.** Never on the screen's edges, the panels or the camera's position, so a pan never moves or rewords anything, and words run under the cards (clipped only out of the narrow margins round them). Names are placed again when the zoom changes by `ZOOM_STEP`, never on a pan. The map changes in kind across the zoom range (`far`, the county-names form, the gathered form, items, their lines, what's in them); read the header of `MapView.ts` before changing a size.
- **The mark is Col, and it's drawn in one place,** `src/studio/site/Mark.tsx`, from `mark-paths.ts`. That file is written by `node scripts/mark-paths.mjs` from the workbench's export, `workbench/logo/col/tiers.json`; don't edit it by hand. Change the mark in `workbench/logo/col.js` (`npm run workbench`, then `/col.html`), re-export, and run the script. `workbench/logo/col/CONSTRUCTION.md` gives the rules.
  - Each size is its own drawing, chosen by device pixels.
  - The tile is ink on every page.
  - The mark's only motion is its growth from nothing, from 160 device px up. No line ever creeps.
  - The tab icon is the `.ico`, because an SVG favicon can't tell a ×1 screen from a ×2 one.
- **Google sign-in identifies an account on a host and nothing else.** It never touches a sealed map, a password or the recovery key, and the host stores only a keyed hash of the account's id (`src/server/auth.ts`). No third-party script ever runs in the Studio: sign-in is a redirect.
- **The top line fits itself.** `useFitTop` in `src/studio/ui/Top.tsx` steps through whole shorter forms until nothing is cut, wrapped or covered. Give any new words there a short form rather than an ellipsis or a media query.
- **The screen's words differ from the code's.** Area, item, reader, tool and recovery key on screen; gate, piece, password, service and owner key in the code. Change what the UI says freely, and don't rename internals for the sake of it.

## Working on it

- `npm run build && npm start`, then open http://localhost:4747
- `npm test`, `npm run typecheck`
- `docs/LAUNCH.md` is the plan for deploying on Railway, and `docs/SELF-HOSTING.md` is the guide for everyone else (Compose with Caddy in `compose.yaml` and `deploy/`).
- `npm run preview:google` runs a host with a stand-in Google on port 4760, to see the sign-in flow without a Google client.
- What an agent reads lives in `src/core/agent.ts`, and every reader shares it, so the Studio preview can't drift.
- Judge visual changes from screenshots, not from the DOM or the code. `docs/design/qa-rounds.md` records every round so far. The harness that takes them is in `qa/`, which isn't in git and may not exist on your machine; `qa/README.md` explains it where it does.
- The README's pictures come from `qa/readme.mjs`. Regenerate them whenever the main screen's words or look change.
