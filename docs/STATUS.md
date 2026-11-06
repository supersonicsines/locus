# Where things stand

Last updated 2026-11-06, at the end of the Locus pass. Read this before picking the project up again.

## State

- v1 is built. After it came a polish programme (seven QA rounds, two sweeps, a design pass), then the **Locus pass**: the rename from Vadere, one monospace face (Spline Sans Mono), larger chrome with more room, scroll to zoom, a load intro, and four rounds of critique by two Opus critics each, with fixes and fresh screenshots every round. Then two code audits, whose findings were fixed. The full record is [design/qa-rounds.md](design/qa-rounds.md).
- `npm test` passes 140 of 140 and `npm run typecheck` is clean.
- Git is local only. There's no remote, nothing has been pushed, and the package isn't on npm.
- No demo is running. To see it, run `npm run build && npm start` and open http://localhost:4747, then choose **See an example**.
- [LAUNCH.md](LAUNCH.md) is the plan for going public on Railway.

## Decisions waiting on the operator

Agents made each of these changes without a ruling. The recommendation is theirs, not a decision.

| Question | Now | Recommendation |
| --- | --- | --- |
| **The npm name** | `locus-harness` (set once as `PACKAGE` in `src/core/agent.ts`); the command is `locus`. `locus` on npm belongs to someone else | Claim it before anything public points at it ([LAUNCH.md](LAUNCH.md), step 1). Get a trademark check on "Locus" too: it's a common name, and there are mapping products called Locus |
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
- **GitHub.** Where it lives, and when.
- **Abuse.** Take legal advice before opening a free hosted instance to the public. See [SECURITY.md](SECURITY.md). For a host that's yours alone, run hosted mode with one account ([LAUNCH.md](LAUNCH.md)).

## Never verified

- A real person using it without help. This is the test that matters most, and no agent can stand in for it.
- Real Safari, a real phone, Windows, or a screen reader. Playwright's WebKit and Firefox passed in the polish programme, as did a touch emulation at 390 wide and a real Chrome. The Locus pass was judged in Chrome only.
- A real Claude run in the browser with a key. The browser path is tested against a mock. The prompts and schemas were tested with real Claude through `claude -p`.
- Claude Code or Claude.ai reading a hosted address over the internet, and the hosted mode in public.
- A Docker build. There's no Docker on the machine that did this work, so Railway's first build will be the first.
- A professional security audit. Two adversarial reviews by AI agents have been done, and their findings fixed: [PRD-QA.md](PRD-QA.md), and the Locus pass's audits in [design/qa-rounds.md](design/qa-rounds.md).

## Known faults left

The last section of [design/qa-rounds.md](design/qa-rounds.md) lists them. The worst:

- In the prices view, Rings still has touching marks, and some disc names sit above their disc while the rest sit below.
- Neighbouring county names sit a few pixels off a shared baseline.
- On a phone, a few counts touch a county's border.
- In dark mode, black one-colour logos are recoloured on the map but not in the card and panels.

## Before the rename

Locus was called Vadere until 2026-11-05. A browser that used the old build kept its maps under the old name, and this build doesn't read them. Nothing was ever published, so no sealed `vadere/1` bundle exists anywhere.

## The QA harness

The scripts, the screenshots of every round, and the agents' read logs and defect lists are in `qa/` in this folder. It's kept out of git on purpose (several GB, with absolute paths and working notes), so it exists only on the machine that ran it. `qa/README.md` says how to run it. The Locus pass is in `qa/rounds/locus/`.
