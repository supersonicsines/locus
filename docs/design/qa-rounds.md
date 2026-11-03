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
