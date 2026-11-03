# QA rounds

The record of the polish programme. Each round adds a section: what it saw, what it changed, what it decided and why, and the worst thing left. A later round can overturn an earlier decision, but only with evidence from the screen.

## Foundation: the interface sans

A narrow step before the rounds. It replaced the font and nothing else.

**What was wrong.** Livvic has a single-storey a and soft terminals, so the interface read as childlike next to Lustria. Its 300 weight was loaded and never used.

**The bake-off.** Fourteen open fonts and Livvic ran in the real Studio on the sample map, under the real CSP, with only the sans swapped. Each got the same shots: left panel, status line, top buttons, service panel, money panel, canvas labels, dark mode, first run, real 1x pixels and 4x crops of the 11.5 to 13px text. A figures probe in a real panel compared default figures with `tabular-nums`.

| Font | `tabular-nums` works | Status line at 13px | Verdict |
| --- | --- | --- | --- |
| Geist | yes | 388px | **Chosen** |
| Schibsted Grotesk | yes | 396px | **Runner-up.** Warmest beside Lustria, but the tabular comma opens a hole (`$1 , 111`) and it softens at 10.5px |
| Instrument Sans | yes | 383px | Most elegant in isolation, but word spaces collapse when small (`to 1password`) |
| Hanken Grotesk | yes | 384px | Calm but soft. Figures default to tabular width, so prices look loose |
| IBM Plex Sans | yes | 385px | Precise but busy when small, slab-footed 1, reads as IBM |
| Inter | yes | 409px | Widest, and its tall x-height outshouts Lustria. It doesn't win |
| Public Sans | yes | 392px | Civic, with gappy figures |
| Source Sans 3 | yes | 354px | Small on the body, so the whole interface shrinks |
| Host Grotesk | yes | 400px | Wide, with a mannered 1 |
| Mona Sans | yes | 393px | Single-storey a and a marked zero: Livvic's problem again |
| Onest | yes | 400px | Round, with a u-shaped y |
| Figtree | yes | 379px | Friendly-rounded |
| Albert Sans | **no** | 391px | Out: the feature does nothing in the shipped subset |
| Libre Franklin | **no** | 391px | Out: the feature does nothing in the shipped subset |
| Livvic | yes | 383px | Today |

**Decision: Geist.** It's the crispest at the sizes this interface really uses, from the 10.5px map names to the 13px rows. Word spaces stay open, so a line reads at a glance. Its tabular figures are the cleanest of the set, because the comma stays narrow. It's neutral without being rounded, which leaves the character to Lustria: the serif carries the place names and Geist carries the labels and numbers. Its status line is 5px wider than Livvic's, and nothing clips. The cost is that it's a familiar font in developer tools, though less of a default than Inter.

**Licence.** SIL Open Font License 1.1, from `@fontsource/geist` 5.3.0. Copyright 2024 The Geist Project Authors (github.com/vercel/geist-font). The licence declares no Reserved Font Name. Fonts may be bundled with software, including MIT software, as long as each copy carries the copyright notice and the licence. The font files hold the copyright line and a licence URL in their metadata, but no full text. `dist` has no OFL text either, and Lustria is in the same position. Nothing has been distributed yet, so this is a job for before the first `npm publish`: ship the OFL text alongside the fonts.

**What changed.**
- `--sans` in `styles.css` is the only place the sans is named. `MapView` reads that token for canvas text, because canvas fonts can't use `var()`. Rewriting only that declaration moved DOM text and canvas text together in Chrome.
- A swap means that line, the import lines in `main.tsx` and the devDependency. A stylesheet import and a family name are two separate facts, so it can't get smaller without build machinery that isn't worth having.
- Only 400 and 500 ship, as static files, because nothing asks for another weight. The two Latin files that load total 26 KB. The variable file is 29 KB and carries weights nothing uses.
- `vite.config.ts` never inlines a font. See the first trap below.
- Knock-on fixes only: `tabular-nums` on the prices in the Add a service list, and each first-run sentence balances on its own, so the wider metrics don't split "exported tokens." across lines.

**Traps for later rounds.**
- Vite inlines assets under 4 KB as `data:` URLs. Geist's cyrillic-ext and vietnamese subsets are that small, Chrome loads `data:` fonts eagerly, and `font-src 'self'` rightly blocks them, which put four errors in the console. The bake-off couldn't catch this because it served fonts through a route, and only checking the shipped build did. The fix stops the inlining and leaves the CSP alone.
- Livvic's default figures were tabular and Geist's are proportional. Any column of numbers in the sans must set `tabular-nums`. Canvas text can't, so don't stack sans figures on the canvas.
- Geist's Latin subset has no `≈`, `→` or `✓`, and neither did Livvic's. In the sans those fall back to the next font in the stack. Today's `≈` is set in Lustria.

**Verified.** In real Chrome on the shipped build, `document.fonts` shows Geist 400, Geist 500 and Lustria 400 loaded, and `document.fonts.check` passes for all three. Canvas text sets `Geist` at 10.5px and 12px. `tabular-nums` measures a spread of 0 across the digits at both weights. There were no CSP violations and no page errors, and no request left localhost.

**Not verified.** Windows and Linux rendering. These files have no hinting, so 1x on Windows may look softer than the 1x shots here, which came from macOS. Firefox and Safari weren't run.

**Worst thing left.** At 480px wide the page looks the same as it did before. A better font was overdue, but it doesn't make the page answer anything at a glance.

## Foundation: service logos

A second narrow step before the rounds: real logos wherever a service appears, so the rounds judge the real thing. It didn't redesign the page.

**What was wrong.** Every service on the map was the same ring with a dot, and you had to find its label to know which one it was. The label budget hid the rest, so on the sample map about half the services were anonymous.

**The list.** `src/studio/logos/services.ts` has 892 services, each with an id, display name, aliases, category and domain. The order is editorial judgement and says so. The first block is hand-ordered, and after that it's grouped by category. Every domain resolves in DNS, which catches typos but doesn't prove it's the right company. It holds no prices. The catalog stays the only source of those, and a service with no checked price stays unknown in the Add a service list.

**The file.** `src/studio/logos/logos.bundle.json` is one file holding the list and every logo: 645 KB raw and 212 KB gzipped, against a budget of 1.5 MB. The largest logo is 8,986 bytes, under a cap of 9,000. Vite emits it hashed under `assets/`, so it caches for good. It's fetched whole, once a map is open, whatever the map holds. A locked or empty page doesn't ask for it. The main JS grew by 7 KB because the list isn't in it. The CSP is unchanged: `connect-src 'self'` covers the fetch and `img-src data:` covers the images.

**Sources.** Checked by reading each licence, not from a list.

| Source | Terms | Logos |
| --- | --- | --- |
| gilbarbara/logos | CC0 | 234 |
| theSVG | Per icon. Only CC0, MIT, Apache, BSD, ISC, Unlicense and CC BY pass | 146 |
| svgl | MIT for the project. Logos remain their owners' | 93 |
| Dashboard Icons | Apache 2.0 | 42 |
| Simple Icons | CC0 unless the icon says otherwise, which is checked per icon | 12 |
| Lobe Icons | MIT | 7 |
| Devicon | MIT | 5 |
| selfh.st | CC BY 4.0 | 3 |
| Companies' own sites | None. The last resort | 111 |

Turned down after reading their terms: VectorLogoZone (AGPL, and logos stay with their owners), 2FA Directory (its images are explicitly outside its licence), and Airbyte's connector icons (Elastic License). theSVG entries marked Trademark, Fair Use, brand-use or proprietary were refused one by one.

**Coverage.** 653 of 892. Top 100: 99. Top 300: 290. Without the companies' own files it would be 542, 92 and 228, which is why they're there. `node scripts/build-logos.mjs --strip-official` takes them out without needing any downloads, because shipping them is a decision the operator may want to make for themselves.

**Decisions and why.**
- Tiles stay near-white in dark mode. It removes dark-on-dark with no per-logo work, and it reads like app icons. A white mark gets a dark or brand tile, and a mark too pale for white gets its brand colour as the tile.
- A monogram is paper, a hairline and a letter, so it can't be taken for a brand. It has the same shape as a logo tile, so the swap moves nothing.
- Aliases only count where a service's own name finds nothing in a pack. Without that rule, the alias "Cloudflare Workers" gave Cloudflare the wrong logo.
- Where one word means two companies, neither gets it: Runway, Lambda, Fathom, Luma, Apollo, Cube, Copilot. The bare word stays a monogram.
- Stripe is the S on its own colour, because its newer flag mark doesn't read at 20px. A later round can overturn this one.
- Lockups are cropped to their symbol, with a clip so the square frame can't show the neighbouring letter.

**Traps for later rounds.**
- SVGO's `inlineStyles` leaves a class used twice in its stylesheet by default. The allowlist then dropped the stylesheet and the mark turned black. It's fixed with `onlyMatchedOnce: false`, but it's the kind of bug only a contact sheet shows.
- Sites' logo links and "logo" SVGs are often customers' logos. Every file from a site was picked by eye for this reason. A scripted pick would have given Clari and Drift the Salesloft logo, since their sites now redirect there.
- Firefox needs width and height on an SVG before it will draw it on a canvas, and Safari needs `decode()` first. The bundle has the first and `tiles.ts` does the second.
- Canvas tiles are drawn once per device-pixel size on whole pixels, or they blur. `RASTER_BUDGET` limits how many are drawn fresh per frame, so zooming can't hitch.
- Playwright's `page.screenshot` injects a `<style>`, which WebKit reports as a CSP refusal. It isn't the app's. Measure CSP before screenshotting.
- Opening a piece in WebKit logs two `style-src-attr` refusals. They're the same on the build before this step, so they aren't from logos, and they're still unexplained.

**Verified.** In Chrome 156, Firefox 157 and WebKit 27.2 on the shipped build: one logo request, same origin, and none on a locked or empty page. No request names a service, nothing goes to a third party, and there are no CSP violations at load. Logos appear on the map, in the side panel, in ⌘K, in Add a service, in what needs you, in both `$` overlays and for a read-only reader who unlocked by password. Agent text and MCP output carry none. With the file held back the map shows monograms, and the swap moves nothing around it. With the file blocked the page works. Services called `__proto__`, `constructor` and `<svg onload=...>` get monograms, and nothing runs. Crops at 1x, 1.5x, 2x and 3x stay sharp in all three.

A map with 60 services and 300 pieces, panning under 4x CPU throttling: JS per frame went from 1.4 ms to 2.3 ms at the median and from 4.3 ms to 5.2 ms at worst. Zooming's worst frame went from 2.3 ms to 6.5 ms. Frame spacing didn't change. Those figures are JS time in headless Chrome, not paint time.

**Not verified.** Real Safari (only Playwright's WebKit). A real phone. Windows. `npm run dev`. Each company's brand terms for the 111 files from their own sites. Which logos are out of date: a logo that's the right company but an old mark wouldn't show on a contact sheet.

**Worst thing left.** The map now says which services a company uses, but every other piece is still a tiny unexplained symbol, and labels are chosen by a budget nobody can predict. Tiles also crowd on a phone at fit zoom, where they sit at their 14px floor. That's work for the layout rounds.

## Round 1: can a stranger understand this page?

**The page's structure. Later rounds work from this.**

The primary object is the map: one company, divided into areas, each an island of land on a plain sea. Under each area's name the map says who can read it. Everything else serves the map, and each job has one place.

- **Top left, the card.** Which company, one line saying what this is, and who can read it. This is the page's only list, and it doesn't repeat the map. Pick a reader and the map becomes what they can see.
- **Top centre, one line.** The one thing worth saying now: what needs you, by kind and count. Or a warning that someone can still read something, or whose eyes you're seeing the map through.
- **Top right, three controls.** What it costs (the number itself, and clicking it spreads prices over the map), Add, and Go live, which becomes Update and then Up to date.
- **The map.** Click an item to open it. Click an area's land or name to open that area. Zoom is bottom right.
- **The right-hand slot.** One panel, opened from the map or the card: an item, an area, or a reader's password and setup.

| The UI says | The code says | Why |
| --- | --- | --- |
| area | gate | There are no gates on the screen. Everyone knows what an area of a map is |
| item, or "a note" when adding by hand | piece | "Piece" asks "of what?" |
| reader | a password and whoever holds it | Who, not how. "Password" now appears only in the setup panel, the go-live dialog and the locked page |
| Go live, Update, Up to date | publish | Over a company's contracts, "publish" reads as "make public", which is frightening and false |
| Can't read, No one can read this | sealed | Vermilion and the wax carry the idea, and the words say what it means for you |
| Needs you | things that need you | Same idea, in fewer words, next to what's actually wrong |
| Read with Claude, Sort here | shred | "Shred" sounds like destroying your files |
| AI tool | agent | The one exception is the locked page's note addressed to agents themselves |

MCP stays only where it's literally the thing: a service's details, the setup commands and one approval callout. Owner key stays too, and it's a candidate for later.

**What I saw, worst first.** Written down before any code changed.

1. Critical. Nothing said what this is. One sentence on first run, gone after one click.
2. Critical. Who can read what, the relation the product exists for, was invisible. "Open to 2 passwords" counted an unexplained noun, the real readers sat behind Share, and the best explaining moment in the product took two clicks and arrived with a terminal command beside it.
3. Critical. The left panel repeated the map, six names twice, and outweighed it. At 480px the panel and the black button survived, and land barely differed from sea. The hierarchy said the primary object was a list.
4. Critical. The marks were a private alphabet with a Legend button admitting it: eleven rows to memorise. Half a circle meant Design token, and a dotted ring meant a hazard to sailors only.
5. Critical. Inside each region: six contour rings for "connection density", straight lines, arcs scratching across the sea, unnamed marks and arbitrary labels, with nothing in any order. This is the operator's "jumbled".
6. High. Labels were a lottery chosen by link count, so Stripe had no name and Runway did. Long ones hung out over the coast.
7. High. One status sentence bundled three unrelated facts. "12 things need you" tells you nothing about which things.
8. High. A bare `$` and a toggle hid an answer that could simply be on the button.
9. High. Share and Publish looked alike and neither explained itself.
10. High. The words: gate, piece, sealed, open to, shred. Three add buttons, and the main way to add, files, wasn't among them.
11. High. Land and names did nothing when clicked, and search was keyboard-only. "What do I do next?" had no answer.
12. Medium. A sealed area differed only by a red blob that read as a notification.
13. Medium. First run was charming and said nothing about what you get.

**What changed.**
- The gates panel is gone. The card lists readers instead, with how much each can open. Picking one opens switches for each area and shows the map through their eyes, with Done at top centre. Password and setup is one deliberate click further on, so nobody meets `claude mcp add` by accident.
- Each area's name carries a line: Read by Claude Code, or No one can read this in vermilion with the wax beside it and a vermilion coast. Under a picked reader it says Can read or Can't read.
- Land is now clearly land: near-white on a darker sea. Inland contours are texture only and no longer ring single items.
- Links aren't drawn until you point at or open something. Nobody asked about those lines, and removing them did more for the page than anything else.
- Small pictures replace the alphabet: a shield with a tick for a rule, the information sign for a fact, a signpost for a decision, § for a clause, a clipboard for a spec, a drop of colour for a design token, a signed page for a contract, a head and shoulders for a person, a page with lines for a document. The Legend is deleted.
- Needs you is a badge with `!`, as on a phone's home screen, in ink, because vermilion means sealed.
- Areas sit in rows, sized by what they hold, nudged off the line so they read as islands. Like things gather inside each one: tools at the top, rules on the left, paperwork and facts on the right.
- Names go to logos first, then rules, then whatever needs you. Long names wrap to two lines and stay on their own land. Counted by eye on the sample at fit zoom: named items went from 30 of 76 to 54 of 76, and unnamed logos from 16 of 28 to 3 of 28.
- Top centre names the kinds: Needs you, 1 exposed secret, 2 to approve, 2 contradictions and 7 more.
- The cost button is the number. Add holds documents, services, notes and areas in one menu. Search has an icon in the card.
- New: clicking an area opens its panel, with who can read it and what's in it. It's how an area gets renamed now, and ⌘K reaches it too.
- First run says what you get: Teach your AI tools about your company, and Nothing leaves this device until you say so.

**Decisions and why.**
- Readers on the left and areas on the map, not the other way round. The map already shows the areas, and who can read them is what it didn't show.
- Towns is now the default, as the brief allowed. Both options and the switch stay. Towns reads better on this layout: Soundings' rings overlap and collide in Engineering. That's an observation, not the operator's pick.
- The map never understates who can read. `readersByArea` counts what's live as well as what's set here, including a removed reader whose password still works and an item moved out of an area they can read. Without it, closing an area on someone's password would have printed No one can read this while their live password still opened it. Under a picked reader, such an area now says Can read until you update, in ink, because it isn't sealed yet. There are tests in `test/readers.test.ts`.
- Vermilion came off Delete this map and off removing a reader, because neither means sealed.
- Agent text now says "area" as well, so See what they read matches the page. It's the one change outside the UI: `src/core/agent.ts` and its pinned test. API and tool names such as `read_piece` stay, so agent text now mixes "area" and "piece".
- The Vadere name is still absent from the main page, apart from the company menu. A sentence explains more than a wordmark. On a live map that sentence gives way to the address, because by then you know.

**A bug this round found.** Adding a piece with a password selected used the password's id as the gate id, which put the piece in no gate at all. New items now go to the open area, or the first one.

**Traps for later rounds.**
- Plainer words must not make a stronger promise. My first pass said "The host can't read it", which is false for a reader with remote access on, and that's the default. It also said a removed reader's password "opens nothing", when it still opens any old copy they saved. Both were caught before committing and now match `docs/SECURITY.md`. Check that file before rewording anything about encryption.
- `SAMPLE_LAYOUT` in `actions.ts`: bump it when the layout changes, or a sample already in a browser keeps its old positions. Real maps never reflow, so one made before this round keeps its force-drawn layout.
- Labels are placed inside the pointer handler whenever what you're pointing at changes. My coast test took the worst case to 20 ms, or 59 ms at 4x CPU, so wrapping and measuring are now cached and the cheapest tests run first. Keep it that way.
- `shots.mjs` finds land by looking for pixels at 250 or brighter, so a darker land colour breaks its `12-area-panel` step.
- The fit inset in `computeFit` (300) has to match `.left-col`'s width (272) plus the gutter.
- `flow4`, `flow5`, `cross`, `stress` and `touch2` still use the old selectors. `shots.mjs` is updated. Round 7 needs to update the rest.
- `docs/images/seal.png` and `towns.png` in the README show the old page.

**Verified.** Chrome, shipped build, all 26 shots in the fixed set read by eye, plus these, used for real: search, an area panel with its switches and rename, picking a reader, clicking a closed area on the map, Done and Esc, adding and removing a reader, adding a note and an area, the cost button with month and year, adding a document with no AI, going live, closing an area while live (warned, then cleared by Update), moving an item into a sealed area while live (its line named the readers until Update, then sealed again), removing a reader while live, a reader unlocking with a password, panning from land (doesn't open the area), dragging an item between areas with Undo. Light and dark. Widths 760 to 1440 have no overlaps. Real layouts at 1 area with 12 items, 2 with 20, 6 with 100 and 300, 12 with 120, and on a phone with 60. No page errors. Nothing left the machine and there were no CSP refusals across load, picking a reader, prices and a local document. `seal.ts`, the server, the CSP and the dependencies are untouched. 84 tests pass and types are clean.

Firefox and WebKit: main page, a picked reader and a click on land, with those shots read. Firefox was clean. WebKit logged only the two `page.screenshot` refusals described in the logos section. Text metrics differ a little between browsers, so a few labels land on a different side.

On a map with 300 items, 60 services and 374 links, in headless Chrome, JS time only: the pointer handler takes 0.2 ms at the median, 4.9 ms at the 95th percentile and 7 ms at worst, and 0.4, 9.8 and 11.6 ms under 4x throttling. Panning under 4x has a worst frame of 3.7 ms against the logos section's 5.2, probably because links aren't drawn at rest. That run isn't strictly comparable, since the layouts differ. The pre-round build's pointer handler was never measured, so there's no before figure for it.

**Not verified.**
- No real person has seen this. Every claim about a stranger is my judgement, from someone who read the PRD first.
- Hosted mode, including the blocked sample and the full-accounts sheet. Their wording changed.
- Read with Claude, since there's no key. Its wording changed and its logic didn't.
- Real Safari, a real phone, Windows, and a screen reader. The gates panel was part of the keyboard path, which is now ⌘K, the area panel and the reader switches. I only used ⌘K, Enter and Esc, and focus order wasn't audited.
- The area and reader panels on a phone.
- `flow4`, `flow5` and `stress`.

**Regression I accepted.** On a phone, Add is hidden for lack of room, and those buttons used to live in the panel. A phone can now only add a reader. The Studio is for laptops, and the PRD only asks that it doesn't break, but it's a real loss.

**Did it fix "jumbled"?** Between the regions, yes. There's one reading order, the sea is empty, and the 480px squint now shows six named islands, who reads them and the one sealed area. Inside each region, only partly.

**Worst thing left.** Inside an area, the marks are still a loose scatter. 22 of 76 have no name, including a rule waiting for approval (Copy support logs to HelpSync), which wears a badge and says nothing, and three logos: Anthropic API, which also has a badge, Hetzner Storage and Google Workspace. Names land on whichever side fits, so there's no rhythm to read along. At 300 items an area is a wall of repeated pictures with a few logos named. At 1x the signed page and the lined page are nearly the same mark. Round 3 owns this.

**Also left.**
- 5 of the 12 things that need you are price notes, so the count overstates urgency and the list is long. Its kind label still shows only on the first row of each group, so the rows after it look unrelated.
- Top right shows the total and the open cartouche shows it again. "Soundings" and "Towns" mean nothing to a stranger, and "3 to check" is cryptic.
- Go live is the only thing saying a map isn't live.
- A map closed here but not yet updated still hatches in vermilion, though its words now say otherwise.
- Remote access and owner key are still jargon.
- "A note" arrives as a Fact in the kind menu.

