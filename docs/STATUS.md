# Where things stand

Last updated 2026-11-04, at the end of the polish programme. Read this before picking the project up again.

## State

- v1 is built. A polish programme then ran on it: a new interface sans (Geist), real logos for about 900 services, seven QA rounds, two read-only sweeps of every screenshot, two fix rounds and a final design pass. The full record, round by round, is [design/qa-rounds.md](design/qa-rounds.md).
- `npm test` passes 140 of 140 and `npm run typecheck` is clean.
- Git is local only. There's no remote, nothing has been pushed, and the package isn't on npm.
- No demo is running. To see it, run `npm run build && npm start` and open http://localhost:4747, then choose **See an example**.

## Decisions waiting on the operator

QA agents made each of these changes without a ruling. The recommendation is the programme's, not a decision.

| Question | Now | Recommendation |
| --- | --- | --- |
| The map as one country with dashed county borders, or as separate islands | One country | Keep |
| Land drawn as a plain fill with no coast line | Plain fill | Keep |
| A deeper grey sea, and a bluer sea when live | Both deeper | Keep |
| When the live copy is behind: an ink pill, plus a sea part-way to blue | Both | Keep. `BEHIND_SEA = 1` in `src/studio/map/MapView.ts` undoes the sea part |
| A pale tint per county | None | Worth trying |
| Rings or Discs for prices (Soundings or Towns in the code) | Both built, Discs the default | Keep Discs, then delete Rings and the switch |
| Hide proposed rules from readers entirely, rather than serving them as reference until rejected | Served as reference, and the Studio says so | Hide. It needs a change to `seal.ts` or the publish path |
| A priced tool keeps its place on the map when only its MCP address is rejected | Keeps its place | Confirm |

Also open:

- **npm.** Publish the package, or the default connect step (`npx -y vadere mcp …`) fails. Until then, run `node dist/cli.mjs mcp …` from a clone.
- **Logos.** 111 logos come from companies' own sites with no licence (`node --experimental-strip-types scripts/build-logos.mjs --strip-official` removes them, with no downloads). The svgl copyright line, and a trademark review before going public.
- **Donation target** for the free hosted mode. The slot exists; the address doesn't.
- **GitHub.** Where it lives, and when.
- **Abuse.** Take legal advice before opening a free hosted instance to the public. See [SECURITY.md](SECURITY.md).

## Never verified

- A real person using it without help. This is the test that matters most and no agent can stand in for it.
- Real Safari, a real phone, Windows, or a screen reader. Playwright's WebKit and Firefox pass, as do a touch emulation at 390 wide and a real Chrome.
- A real Claude run in the browser with a key. The browser path is tested against a mock; the prompts and schemas were tested with real Claude through `claude -p`.
- Claude Code or Claude.ai reading a hosted address over the internet, and the hosted mode in public.
- A Docker build.
- A professional security audit. One adversarial review by an AI agent was done, and its findings fixed: [PRD-QA.md](PRD-QA.md).

## Known faults left

The last section of [design/qa-rounds.md](design/qa-rounds.md) lists them all. The worst:

- At 1440 wide, opening a rule in Money zooms the map, and Brand's name ends up under the card.
- At 800 and 1280 wide, one faint grid line crosses the "a" of the wordmark on the first page.
- An area's panel doesn't slide the map to show what's linked; only an item's panel does.
- A row with two kinds on one line shows no icon for the second kind.

## The QA harness

The scripts, the screenshots of every round and the agents' read logs and defect lists are in `qa/` in this folder. It's kept out of git on purpose (about 5.7 GB, with absolute paths and working notes), so it exists only on the machine that ran it. `qa/README.md` says how to run it.
