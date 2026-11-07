# Col: the Locus mark

A summit, a lower knoll and the col between them, drawn in contour: black lines on white paper, as on a survey sheet. The col’s own contour crosses itself at the pass, and the point sits on the crossing: Locus is the one place two heights share. Every curve is a circle or an arc tangent to one; every file is written from `brand/source/mark.js`.

## Geometry

| | |
| --- | --- |
| ridge | 22.5°, a sixteenth of a turn |
| summit | circle A, RA = 16, \|AC\| = 2 RA |
| crossing | two axes through C at ±ψ to the ridge, sin ψ = 4/5 (53.1°) |
| branches | each the arc tangent to its axis at C and tangent inside to its lobe’s circle: Q = 5/2 R |
| knoll | the summit’s lobe scaled by −1/2 through C: RB = RA / 2, \|BC\| = 2 RB |
| interval | d = RA / 4; the summit ends 4 d up, the knoll 2 d |
| above C | each lobe scaled by (R + s) / R about H, 3R/8 beyond its centre; its tip rounded with ρ = 3/2 \|s\| (eased onto R above ρ = 0.55 R, so a tip grows from a circle smoothly) |
| below C | the figure-eight offset by s; its notches rounded with ρ = 7/4 s, half the branch beside them |
| line | the contours fine, max(1, 1.2 (N / 256)^0.6) device px; the col’s own contour the index, at 2×; the point 3.25× the index across |
| fit | span 68, farthest point 37 ≤ 37; centred ⅔ of the way from box to centroid |
| file | every arc written at 0.001 units and no wider than 90°, so the browser draws the construction (≤ 0.06 px off at 1024) |

## The drawings

Chosen by device pixels (css px × devicePixelRatio).

| Drawing | Device px | What it draws |
| --- | --- | --- |
| L | 256 and up | the card as above: d = RA/4; the outline at +2d and +1d below the col, the col’s own contour, the summit’s −1d, −2d and −3d rings, the knoll’s −1d; H at 3R/8 |
| L− | 160–255 | L without the summit’s −3d ring; H at R/4 |
| M | 96–159 | d = RA/3; the outline at +1d, the col’s own contour, the summit’s −1d and −2d, the knoll’s −1d; H at R/5 |
| S | 48–95 | d = RA/2; the outline at +1d, the col’s own contour and the summit’s top, a circle |
| X (Col-X) | 26–47 | one land in ink, the hull at s = ¾ RA with its notches rounded ρ = s, the col’s own contour cut through it in paper; the crossing is the point |
| X· | 16–25 | the same land with the point cut alone, r = 1.3 px at 16 |

Col-X and X· are solid because a line under 48 device px blurs; they are never shown without the tile. The bare glyph starts at 96 px, the relief stamp at 160.

## The line system

As on a survey sheet: the contours are fine, and one of them, the index contour, is drawn at twice their weight. The index is the col’s own contour, so the figure-eight is the heaviest line and the crossing the heaviest place.

- A contour: w = max(1, 1.2 (N / 256)^0.6) device px (1 at 96, 1 at 180, 1.2 at 256, 1.82 at 512, 2.76 at 1024). Nothing is drawn under 1 px.
- The index: 2 w. The point: 3.25 × the index across (11.82 px at 512).
- Col-X: the cut is clamp(0.9 + 0.035 N, 1.5, 3.2) px wide (2.02 at 32, 2.54 at 47).
- In a lockup the mark is the drawing its device pixels get, at its own weights.

## Colours

- Ink #15191e and paper #fcfdfd, nothing else. The tile is paper and the drawing ink, on every page, the favicon included.
- On a light page the tile has an ink hairline 1 device px wide inside its edge, the sheet’s neatline (the tile stroked at 200/N units, clipped to itself): stroke-opacity 0.22 up to 95 px, 0.16 above. On a dark page it needs none.
- The reverse, paper on an ink tile, is kept for the rare place that needs a dark mark on a light ground.
- One ink: the tile in one colour with the drawing knocked out of it, so it prints on any paper.

## The lockup

- Spline Sans Mono at weight 540, tracking −0.01 em, L–o −0.06 em, u–s −0.01 em; the word is outlined in the files.
- Horizontal: the word at 0.688 M, so its cap height is ½ M, the caps centred on the tile; the L’s stem 0.4 M from the tile.
- Stacked: the word at 0.4 M, its caps 0.25 M under the tile, both centred.
- Clear space: ½ M on every side, not drawn into the files. Smallest: M = 20 px.

## Icons

A tab icon is 16 css px on every screen, and only a bitmap can know the pixel density, so the tab icon is the ICO:

```html
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
```

The manifest lists `icon-192.png` and `icon-512.png` (purpose "any") and `icon-512-maskable.png` (purpose "maskable"). `favicon.svg` (Col-X) is for uses drawn at 26 to 47 device px, not the tab.

## Motion

Drawn once, for L and L− (160 device px and up); every smaller drawing, and reduced motion, is the still. No loop. 2.17 s in all.

- The index contour first, in one stroke: the pen leaves the pass at 0.08 s, rounds the summit, crosses the pass at 0.68 s and rounds the knoll back to it (1.43 s, cubic-bezier(0.36, 0, 0.2, 1)).
- The two contours below the col leave the upper notch 0.16 s and 0.28 s behind the pen and follow it round the summit, then wrap the knoll (the same curve).
- As the pen crosses the pass, the summit’s contours follow, each from its tip, 0.08 s apart; the knoll’s starts 0.3 s before the pen closes. Each lasts 0.3 s + 0.0042 s per unit of its length, on cubic-bezier(0.4, 0, 0.16, 1).
- The point is set on the crossing last: 0.26 s, scale from 0, cubic-bezier(0.2, 0, 0, 1).
- A stroke is drawn by its dash, its pen a round cap, and snaps whole once it has 0.3 device px to go. A line once drawn never moves again. `tiers.json` carries the score, and `motion/locus-mark-512-draw.svg` plays it as CSS.

## Files

Every file is written by `brand/source/build.mjs` from `brand/source/mark.js`: `npm run brand`.

| File | Use |
| --- | --- |
| mark/locus-mark-1024-light.svg | the full sheet, for 256 device px and up; on a light page: the paper tile with its ink hairline |
| mark/locus-mark-1024-dark.svg | the full sheet, for 256 device px and up; on a dark page: the paper tile alone |
| mark/locus-mark-1024-reverse.svg | the full sheet, for 256 device px and up; the reverse, paper lines on an ink tile |
| mark/locus-mark-1024-oneink.svg | the full sheet, for 256 device px and up; one ink: the tile in ink with the drawing knocked out, for print, stamps and lasers |
| mark/locus-mark-1024-bare.svg | the full sheet, for 256 device px and up; the drawing alone, no tile, in ink |
| mark/locus-mark-512-light.svg | the full sheet, for 256 device px and up; on a light page: the paper tile with its ink hairline |
| mark/locus-mark-512-dark.svg | the full sheet, for 256 device px and up; on a dark page: the paper tile alone |
| mark/locus-mark-512-reverse.svg | the full sheet, for 256 device px and up; the reverse, paper lines on an ink tile |
| mark/locus-mark-512-oneink.svg | the full sheet, for 256 device px and up; one ink: the tile in ink with the drawing knocked out, for print, stamps and lasers |
| mark/locus-mark-512-bare.svg | the full sheet, for 256 device px and up; the drawing alone, no tile, in ink |
| mark/locus-mark-180-light.svg | L−, for 160–255 device px: the touch icon, a 96 pt icon at ×2; on a light page: the paper tile with its ink hairline |
| mark/locus-mark-180-dark.svg | L−, for 160–255 device px: the touch icon, a 96 pt icon at ×2; on a dark page: the paper tile alone |
| mark/locus-mark-180-reverse.svg | L−, for 160–255 device px: the touch icon, a 96 pt icon at ×2; the reverse, paper lines on an ink tile |
| mark/locus-mark-180-oneink.svg | L−, for 160–255 device px: the touch icon, a 96 pt icon at ×2; one ink: the tile in ink with the drawing knocked out, for print, stamps and lasers |
| mark/locus-mark-128-light.svg | M, for 96–159 device px: a 64 px icon at ×2, a dock icon; on a light page: the paper tile with its ink hairline |
| mark/locus-mark-128-dark.svg | M, for 96–159 device px: a 64 px icon at ×2, a dock icon; on a dark page: the paper tile alone |
| mark/locus-mark-128-reverse.svg | M, for 96–159 device px: a 64 px icon at ×2, a dock icon; the reverse, paper lines on an ink tile |
| mark/locus-mark-128-oneink.svg | M, for 96–159 device px: a 64 px icon at ×2, a dock icon; one ink: the tile in ink with the drawing knocked out, for print, stamps and lasers |
| mark/locus-mark-128-bare.svg | M, for 96–159 device px: a 64 px icon at ×2, a dock icon; the drawing alone, no tile, in ink |
| mark/locus-mark-64-light.svg | S, for 48–95 device px: a 32 px icon at ×2; on a light page: the paper tile with its ink hairline |
| mark/locus-mark-64-dark.svg | S, for 48–95 device px: a 32 px icon at ×2; on a dark page: the paper tile alone |
| mark/locus-mark-64-reverse.svg | S, for 48–95 device px: a 32 px icon at ×2; the reverse, paper lines on an ink tile |
| mark/locus-mark-64-oneink.svg | S, for 48–95 device px: a 32 px icon at ×2; one ink: the tile in ink with the drawing knocked out, for print, stamps and lasers |
| mark/locus-mark-32-light.svg | X, for 26–47 device px: the solid land, its crossing cut through; on a light page: the paper tile with its ink hairline |
| mark/locus-mark-32-dark.svg | X, for 26–47 device px: the solid land, its crossing cut through; on a dark page: the paper tile alone |
| mark/locus-mark-32-reverse.svg | X, for 26–47 device px: the solid land, its crossing cut through; the reverse, paper lines on an ink tile |
| mark/locus-mark-32-oneink.svg | X, for 26–47 device px: the solid land, its crossing cut through; one ink: the tile in ink with the drawing knocked out, for print, stamps and lasers |
| mark/locus-mark-16-light.svg | X·, for 16–25 device px: the solid land and the point; on a light page: the paper tile with its ink hairline |
| mark/locus-mark-16-dark.svg | X·, for 16–25 device px: the solid land and the point; on a dark page: the paper tile alone |
| mark/locus-mark-16-reverse.svg | X·, for 16–25 device px: the solid land and the point; the reverse, paper lines on an ink tile |
| mark/locus-mark-16-oneink.svg | X·, for 16–25 device px: the solid land and the point; one ink: the tile in ink with the drawing knocked out, for print, stamps and lasers |
| motion/locus-mark-1024-draw.svg | the mark drawn in once by its own CSS, then still; reduced motion shows the still |
| motion/locus-mark-512-draw.svg | the mark drawn in once by its own CSS, then still; reduced motion shows the still |
| motion/locus-mark-180-draw.svg | the mark drawn in once by its own CSS, then still; reduced motion shows the still |
| lockup/locus-lockup-horizontal-light.svg | horizontal lockup for a light page, drawn for a mark of 48 css px and up |
| lockup/locus-lockup-stacked-light.svg | stacked lockup for a light page, drawn for a mark of 48 css px and up |
| lockup/locus-lockup-horizontal-light-small.svg | horizontal lockup for a light page, drawn for a 26 px mark (a site header) |
| lockup/locus-lockup-stacked-light-small.svg | stacked lockup for a light page, drawn for a 26 px mark (a site header) |
| lockup/locus-lockup-horizontal-dark.svg | horizontal lockup for a dark page, drawn for a mark of 48 css px and up |
| lockup/locus-lockup-stacked-dark.svg | stacked lockup for a dark page, drawn for a mark of 48 css px and up |
| lockup/locus-lockup-horizontal-dark-small.svg | horizontal lockup for a dark page, drawn for a 26 px mark (a site header) |
| lockup/locus-lockup-stacked-dark-small.svg | stacked lockup for a dark page, drawn for a 26 px mark (a site header) |
| lockup/locus-lockup-horizontal-oneink.svg | horizontal lockup for print, in one ink, drawn for a mark of 48 css px and up |
| lockup/locus-lockup-stacked-oneink.svg | stacked lockup for print, in one ink, drawn for a mark of 48 css px and up |
| lockup/locus-lockup-horizontal-oneink-small.svg | horizontal lockup for print, in one ink, drawn for a 26 px mark (a site header) |
| lockup/locus-lockup-stacked-oneink-small.svg | stacked lockup for print, in one ink, drawn for a 26 px mark (a site header) |
| icon/favicon-16.png | the tab icon at ×1 |
| icon/favicon-32.png | the tab icon at ×2 |
| icon/favicon-48.png | the tab icon at ×3, Windows |
| icon/favicon.ico | the tab icon: 16, 32 and 48 px frames, so each screen gets its own drawing |
| icon/favicon.svg | Col-X as SVG, for uses drawn at 26–47 device px; not the tab icon |
| icon/apple-touch-icon.png | the iOS home-screen icon: full bleed and opaque, iOS rounds it |
| icon/icon-192.png | a web app manifest icon, purpose any |
| icon/icon-512.png | a web app manifest icon, purpose any |
| icon/icon-512-maskable.png | a web app manifest icon, purpose maskable: the form inside the safe zone |
| social/locus-social-light.png | the 1200 × 630 link card (og:image), light |
| social/locus-social-dark.png | the 1200 × 630 link card (og:image), dark |
| tiers.json | every drawing’s geometry, colours and widths, and the drawing’s score, for code |
| CONSTRUCTION.md | this sheet |
