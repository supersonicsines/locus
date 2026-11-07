# Locus brand

Everything that makes Locus look and sound like itself, ready to take: the mark, the colours, the face, the interface's components, the map's look and the words. Take files from here rather than redrawing, recolouring or retyping anything.

- **The brand book** is [`index.html`](index.html). Open it in a browser, straight from disk.
- **For agents**, [`brand.json`](brand.json) lists every file with its use, every colour with its meaning, the type and the rules.

<p>
  <img src="logo/lockup/locus-lockup-horizontal-light.svg" alt="Locus" height="64">
</p>

## Which file

| For | Take |
| --- | --- |
| A tab icon | `logo/icon/favicon.ico` (its 16, 32 and 48 px frames are each their own drawing) |
| An iOS home screen | `logo/icon/apple-touch-icon.png` |
| A web app manifest | `logo/icon/icon-192.png`, `logo/icon/icon-512.png`, `logo/icon/icon-512-maskable.png` |
| A link preview (`og:image`) | `logo/social/locus-social-light.png`, 1200 × 630 |
| A README or a document's header | `logo/lockup/locus-lockup-stacked-light.svg` |
| A site's header | `logo/lockup/locus-lockup-horizontal-light-small.svg` (a 26 px mark) |
| The mark at a given size | `logo/mark/locus-mark-<size>-<kind>.svg`, drawn for that size: see below |
| The mark, drawn in | `logo/motion/locus-mark-512-draw.svg` (it plays once by its own CSS) |
| An avatar | `logo/icon/icon-512-maskable.png`, which survives a circle crop |
| Print, a stamp, a laser | the `oneink` files |
| Colours in code | `tokens/tokens.css` (custom properties) or `tokens/tokens.json` (Design Tokens format) |
| The face | `fonts/` (Spline Sans Mono, variable, with its licence) |
| The mark in code | `logo/tiers.json`: every drawing's geometry, widths and colours, and the drawing-in's score |

### Choosing a mark

Each size is its own drawing, so pick the file by the **device pixels** it will be drawn at: CSS pixels × the screen's density. A 32 px icon on a ×2 screen is 64 device pixels.

| Device px | File | Drawing |
| --- | --- | --- |
| 256 and up | `locus-mark-512-…` or `locus-mark-1024-…` | L: the full sheet |
| 160–255 | `locus-mark-180-…` | L−: one summit ring fewer |
| 96–159 | `locus-mark-128-…` | M: five lines |
| 48–95 | `locus-mark-64-…` | S: the pass's contour, the outline, the summit |
| 26–47 | `locus-mark-32-…` | X: a solid land, its crossing cut through |
| 16–25 | `locus-mark-16-…` | X·: the solid land and the point |

Then pick the kind by the ground it sits on:
- `light` on a light page. It carries an ink hairline 1 device pixel wide, which holds the white tile off the page.
- `dark` on a dark page.
- `reverse` for paper lines on an ink tile.
- `oneink` for print.
- `bare` for the drawing with no tile. It exists only from 96 px, because small and bare it reads as an ∞ in a pebble.

## The rules

- **Never redraw, trace, recolour, stretch, rotate or add effects to the mark.**
- **Never scale a large drawing down to a small size.** Use the file drawn for that size.
- **Black lines on a white tile, on every page.**
- **The mark is ink and paper only.** In the product, vermilion means sealed, amber urgent and blue live, and none of them ever enters the mark.
- **Clear space is half the mark's height on every side.** The smallest mark is 16 px, and the smallest lockup has a 20 px mark.
- **One face, Spline Sans Mono.** Hierarchy comes from size, weight, case and ink, never a second family.
- **The mark's only motion is being drawn once.** Nothing loops, glows or bounces.
- **It's *Locus*.** The npm package is `locus-harness` and its command is `locus`. Never write `npx locus`: that name belongs to someone else.

## What's here

```
index.html        the brand book
brand.json        the pack as data, for agents
logo/
  mark/           the mark, one file per drawing and kind
  motion/         the mark drawn in, as self-playing SVGs
  lockup/         the mark with the name, horizontal and stacked
  icon/           favicon.ico, favicon.svg, touch and manifest icons
  social/         1200 × 630 link cards
  tiers.json      every drawing as data
  CONSTRUCTION.md the rules the mark is built by
tokens/           tokens.css and tokens.json
fonts/            Spline Sans Mono, its @font-face rules and its licence (SIL OFL 1.1)
ui/               copies of the app's stylesheets, and screenshots, for the book's interface pages
source/           what writes all of the above
```

## Changing it

Everything here except `README.md` and `source/` is written by one command:

```sh
npm run brand
```

**What it writes from:**
- the mark from `source/mark.js`, its single definition;
- the tokens and `ui/` from the app's own stylesheets, `src/studio/styles.css` and `src/studio/site/site.css`;
- the face from the font the app ships;
- the book from `source/book.mjs`.

It also writes what the site takes from the pack: `src/studio/site/mark-paths.ts` and the tab and touch icons in `src/studio/public/`. `test/brand.test.ts` fails if the pack, the app and the sources ever disagree, so change the source, not the output.

**Other sources:**
- The face's outlines, which the lockups and link cards are set from so they never depend on the face being installed, are in `source/outlines.json`. To make them again, run `source/outline.py` (it needs `fonttools` and `brotli`).
- `npm run brand -- --inline <file>` also writes the book as one self-contained HTML file, to send or publish.
