# Where things stand

Last updated 2026-11-09, when the repository went public on GitHub. Before that, 2026-11-07, after Col's pen pass (white tile, fine lines, drawn in), at the end of the board pass. Read this before picking the project up again.

## State

- v1 is built. After it came a polish programme (seven QA rounds, two sweeps, a design pass), then the **Locus pass** (the rename, one face, larger chrome, a load intro, four critique rounds, two audits), then the **board pass**:
  - **Navigation like Miro or Figma.** Two fingers pan, a pinch zooms anywhere on the page, a mouse wheel's notches glide, a throw coasts, the arrows pan. Zoom runs in proportion from an island with the company's name to eight times closer, and the map changes in kind across it. Names are placed from the map and the zoom alone, so a pan never moves them.
  - **A website and onboarding**: `/` home, `/start` (five or six steps with motion graphics), `/example`, `/map`, with Back, Forward and a way home from the map.
  - **Sign in with Google**, optional per host.
  - **What an open-source project needs**: a self-hosting guide, a Compose file with Caddy, contributing notes, a code of conduct, templates, CI, Dependabot and a changelog.
  - **The brand pack**, `brand/`: a brand book, every logo file, tokens, the face and a manifest for agents, written by `npm run brand` and checked against the app by a test. The logo workbench and its four other candidates are gone; the record is in [design/qa-rounds.md](design/qa-rounds.md).
  - Three critique passes on the map, three on the website, and five on the logo, each by Opus critics, with fixes and fresh screenshots each time. Then the operator chose Col, and it had four more rounds of its own: a growth from nothing as its only motion, five drawings chosen by device pixels, and an export set. After that the operator asked for black lines on white, a finer, map-like line and an intro that is drawn rather than grown, and got them: the pen pass. The record is [design/qa-rounds.md](design/qa-rounds.md).
- `npm test` passes 163 of 163 on Node 22 and 24, and `npm run typecheck` is clean. The Docker image was first built by CI on 2026-11-09; it builds, starts and answers.
- The repository is public at https://github.com/supersonicsines/locus, and every commit is authored `supersonicsines`. The package isn't on npm yet.
- To see it: `npm run build && npm start`, then http://localhost:4747. To see sign-in without a Google client: `npm run preview:google` (port 4760). The brand: open `brand/index.html`; rebuild it with `npm run brand`.
- [LAUNCH.md](LAUNCH.md) is the plan for going public on Railway; [SELF-HOSTING.md](SELF-HOSTING.md) is the guide for everyone else.

## Decisions waiting on the operator

Agents made each of these changes without a ruling. The recommendation is theirs, not a decision.

| Question | Now | Recommendation |
| --- | --- | --- |
| **The logo** | Decided: **Col**: black lines on a white tile, fine contours with the col's own contour as the heavier index line, drawn in once by a pen. It's in the site (`src/studio/site/Mark.tsx`), with an `.ico` and a touch icon, and in the brand pack, `brand/` | The brand book is `brand/index.html`: the mark, colour, type, the interface, the map's look, words, and every file. Agents start at `brand/README.md` or `brand/brand.json`. Look at it in real browser tabs (Chrome, Safari, Firefox) and on a phone's home screen, which no agent could. The solid small form (under 48 device px) is still close to an ∞ cut into a pebble |
| **The mark's licence** | `brand/` sits in an MIT repository and says nothing of its own, so as things stand the mark and the name are MIT like the code | Most open-source projects keep their name and logo out of the code's licence, with a short trademark policy that says how others may use them. Decide before the repository is public, alongside the trademark check |
| **Trackpad scrolling pans** (you asked for scroll to zoom in the Locus pass) | Two fingers pan and a pinch zooms, as in Miro and Figma; a mouse wheel still zooms; ⌘ or ctrl and scroll zooms on anything | Keep. Every critic who drove it called this the source of "not buttery". `wheelKind` in `MapView.ts` is where it's decided |
| **Sign in with Google** on the public host | Off unless `LOCUS_GOOGLE_CLIENT_ID` and `LOCUS_GOOGLE_CLIENT_SECRET` are set. With hosted mode, it replaces proof of work for claiming an address | Turn it on for the public host, after a Google Cloud OAuth client and consent screen ([SELF-HOSTING.md](SELF-HOSTING.md)). Google's branding review may want the button checked |
| **The repository's address** | Decided: `REPO_URL` in `src/studio/site/frame.tsx` is https://github.com/supersonicsines/locus, so the site shows its source links | Done |
| **Served docs as plain text** | `/docs/SECURITY.md`, `SELF-HOSTING.md` and `PRD-QA.md` are served as plain Markdown text | Fine for now; link to GitHub's rendering once `REPO_URL` is set |
| **The npm name** | `locus-harness` (set once as `PACKAGE` in `src/core/agent.ts`); the command is `locus`. `locus` on npm belongs to someone else | Claim it before anything public points at it ([LAUNCH.md](LAUNCH.md), step 1). The home page and onboarding show `npx -y locus-harness …`, which fails until then. Get a trademark check on "Locus" too: it's a common name, and there are mapping products called Locus |
| The face | Spline Sans Mono for everything | Keep |
| The map as one country with dashed county borders, or as separate islands | One country | Keep |
| Land drawn as a plain fill with no coast line | Plain fill | Keep |
| A deeper grey sea, and a bluer sea when live | Both deeper | Keep |
| When the live copy is behind: an ink pill, plus a sea part-way to blue | Both | Keep. `BEHIND_SEA = 1` in `src/studio/map/MapView.ts` undoes the sea part |
| A pale tint per county | None | Worth trying |
| Rings or Discs for prices (Soundings or Towns in the code) | Both built, Discs the default | Keep Discs, then delete Rings and the switch |
| Hide proposed rules from readers entirely, rather than serving them as reference until rejected | Served as reference, and the Studio says so | Hide. It needs a change to `seal.ts` or the publish path |
| A priced tool keeps its place on the map when only its MCP address is rejected | Keeps its place | Confirm |
| Pins as badges on the mark, not tailed pins leaning beside it | Badges | Keep |
| Live as one blue, the dot included (it was green) | Blue | Keep |
| No resting glow round what needs you now; the amber badge says it | No glow | Keep |
| The prices card without its bar of shares, and discs with one rim | Removed | Keep |
| A reader's line says "For X" live or not, never "Read by" | "For" | Keep |
| A reader's view shows the tools a sealed county still gives them | Shown, a step back | Keep |
| A reader's or an area's panel shrinks the map to fit, never below 0.22, instead of sliding it off the screen | Shrinks | Keep |
| Lines between two items in one county aren't drawn; the panel lists them | Not drawn | Keep |
| The owner's to-dos hidden in a reader's view | Hidden, except a proposed rule's "?" | Keep |
| "Sample" said in words on the folded card, not as a chip | Words | Keep |

Also open:

- **npm.** Publish `locus-harness`, or the default connect step (`npx -y locus-harness mcp …`) fails. Until then, run `node dist/cli.mjs mcp …` from a clone.
- **The domain.**
- **Logos.** 111 logos come from companies' own sites with no licence (`node --experimental-strip-types scripts/build-logos.mjs --strip-official` removes them, with no downloads). There's also the svgl copyright line, and a trademark review before going public.
- **Donation target** for the free hosted mode. The slot exists; the address doesn't.
- **GitHub.** Done on 2026-11-09: public at https://github.com/supersonicsines/locus, `REPO_URL` set, private vulnerability reporting, secret scanning and push protection on, and CI and Dependabot running. Logos stay as they are until GitHub or an owner asks otherwise; `--strip-official` is the answer then.
- **Abuse.** Take legal advice before opening a free hosted instance to the public. See [SECURITY.md](SECURITY.md). For a host that's yours alone, run hosted mode with one account ([SELF-HOSTING.md](SELF-HOSTING.md)).

## Never verified

- A real person using it without help. This is the test that matters most, and no agent can stand in for it.
- Real Safari, a real phone, Windows, or a screen reader. Playwright's WebKit and Firefox passed in the polish programme, as did a touch emulation at 390 wide and a real Chrome. The Locus pass and the board pass were judged in Chrome only.
- A real Claude run in the browser with a key. The browser path is tested against a mock. The prompts and schemas were tested with real Claude through `claude -p`.
- Claude Code or Claude.ai reading a hosted address over the internet, and the hosted mode in public.
- **Real Google sign-in.** It was built and tested against a stand-in Google only. The redirect URI, the consent screen and a real ID token are unchecked.
- **Real trackpads and mice.** Wheel routing was tested with synthetic events in Chrome. How a real Mac mouse, a Windows touchpad, a high-resolution mouse and Firefox are classified (`wheelKind`) is unverified, as is Safari's pinch (its gesture events were built in the page) and an iPhone's.
- 120 Hz. Every frame measurement in the board pass ran at 60 Hz or below.
- A professional security audit. Two adversarial reviews by AI agents have been done, and their findings fixed: [PRD-QA.md](PRD-QA.md), and the Locus pass's audits in [design/qa-rounds.md](design/qa-rounds.md).

## Known faults left

The last sections of [design/qa-rounds.md](design/qa-rounds.md) list them. The worst:

- Zoomed out to the gathered form, some county names stand over the sea or on a border, and while things gather each line's icon passes over its own first letter.
- In a reader's view, Engineering's seal is drawn as a small dot beside its long name rather than full size.
- Carta's logo is a blank tile in dark mode, and Vercel's price disc touches Anthropic's.
- The website's graphics pick a phone or laptop layout when first drawn; a rotation redraws them, a slow resize across 720 px may not.

- In the prices view, Rings still has touching marks, and some disc names sit above their disc while the rest sit below.
- Neighbouring county names sit a few pixels off a shared baseline.
- On a phone, a few counts touch a county's border.
- In dark mode, black one-colour logos are recoloured on the map but not in the card and panels.

## Before the rename

Locus was called Vadere until 2026-11-05. A browser that used the old build kept its maps under the old name, and this build doesn't read them. Nothing was ever published, so no sealed `vadere/1` bundle exists anywhere.

## The QA harness

The scripts, the screenshots of every round, and the agents' read logs and defect lists are in `qa/` in this folder. It's kept out of git on purpose (several GB, with absolute paths and working notes), so it exists only on the machine that ran it. `qa/README.md` says how to run it. The Locus pass is in `qa/rounds/locus/`; the board pass in `qa/rounds/nav/` (map and website), `qa/rounds/logo/` (the logo), `qa/rounds/col/` (Col's four rounds, and the pen pass in `pen/`), `qa/rounds/site/` (the website's own iterations) and `qa/rounds/canvas/` (measurements).
