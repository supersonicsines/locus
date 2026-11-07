# Col: the Locus mark

A summit, a lower knoll and the col between them, drawn in contour. The col’s own contour crosses itself at the pass, and the point sits on the crossing: Locus is the one place two heights share. Every curve is a circle or an arc tangent to one; every file is written from `workbench/logo/col.js`.

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
| line | one weight, 2.5 px at 280 (size^0.8 in L); the point three line-widths across |
| fit | span 68, farthest point 37 ≤ 37; centred ⅔ of the way from box to centroid |
| file | every arc written at 0.001 units and no wider than 90°, so the browser draws the construction (≤ 0.06 px off at 1024) |

## The drawings

Chosen by device pixels (css px × devicePixelRatio).

| Drawing | Device px | What it draws |
| --- | --- | --- |
| L | 256 and up | the card as above: d = RA/4; the outline at +2d and +1d below the col, the col’s own contour, the summit’s −1d, −2d and −3d rings, the knoll’s −1d; H at 3R/8 |
| L− | 160–255 | L without the summit’s −3d ring; H at R/4 |
| M | 96–159 | d = RA/3; the outline at +1d, the col’s own contour, the summit’s −1d and −2d, the knoll’s −1d; H at R/5 (the far walls 1.6 px clear at 96) |
| X (Col-X) | 26–95 | one land, the hull at s = ¾ RA with its notches rounded ρ = s, the col’s own contour cut through it as ground; the crossing is the point |
| X· | 16–25 | the same land with the point cut alone, r = 1.3 px at 16 |

Col-X and X· are never shown without the ink tile: bare, their nearest neighbour is an ∞ in a pebble. The bare glyph starts at 96 px, the relief stamp at 160.

## The line system

- One line weight per drawing; the point is three line-widths across, the only heavy element.
- L and L−: w = 2.5 (N / 280)^0.8 px at N device px (4.05 at 512, 1.76 at 180, 1.60 at 160).
- M: w = 2.0 (N / 96)^0.2 px (2.00 at 96, 2.12 at 128, 2.21 at 159).
- Col-X: the cut is clamp(0.9 + 0.035 N, 1.5, 3.2) px wide (2.02 at 32, 2.58 at 48, 3.2 from 66).
- In a lockup from 96 px, the mark is the M drawing at w = 0.016 M, a sixth of the L’s stem. Nothing is drawn under 1 px.

## Colours

- Ink #15191e and paper #fcfdfd, nothing else. The tile is ink everywhere, the favicon included.
- On a dark page the tile has a paper hairline 1 device px wide inside its edge (the tile stroked at 200/N units, clipped to itself): stroke-opacity 0.24 up to 95 px, 0.16 above.
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

The manifest lists `icon-192.png` and `icon-512.png` (purpose "any") and `icon-512-maskable.png` (purpose "maskable"). `favicon.svg` (Col-X) is for uses drawn at 26 to 95 device px, not the tab.

## Motion

Growth from nothing, once, for L and L− (160 device px and up); every smaller drawing, and reduced motion, is the still. No loop.

- The tops appear and the land rises, one ring at a time per hill, each leaving the ring inside it and settling into its place; the knoll’s top appears as the summit reaches its height.
- The hills’ last rings close as )( and touch at C: both tips on one clock, reaching C in the same frame. The X holds. The rings below the col leave it, the outline last, and the point grows on the crossing.
- A step lasts T = 0.65 (0.22 + 0.14 clamp((N − 96) / 416)) s, 0.234 s from 512 px; a ring below the col lasts T √(its notch’s travel / 1.4 d).
- Curves: STEP cubic-bezier(0.33, 1, 0.68, 1) for the rings; TIP cubic-bezier(0.5, 1, 0.89, 1) for a tip, lasting ⅔ T × (its travel / the near side’s) — for the join, D = ⅔ T × 13.5 / 5.5 (1.64 T) from the join’s start, each apex at a0 (1 − TIP(u)); LAND cubic-bezier(0.2, 0, 0, 1) for the point.
- Every clock ends once its line’s fastest point has 0.3 px left (SNAP). One-line steps overlap by a tenth; the only rest is the hold, 0.36 s. The point grows over 0.20 s. About 2.0 s in all at 512 px.

## Files

Every file is written by `qa/rounds/col/export.mjs` from `col.js`.

| File | Comes from |
| --- | --- |
| locus-L-512-light.svg | exportSvg(L, 512, light) |
| locus-L-512-dark.svg | exportSvg(L, 512, dark) |
| locus-L-512-oneink.svg | exportSvg(L, 512, oneink) |
| locus-L-512-bare.svg | exportSvg(L, 512, bare) |
| locus-Lminus-180-light.svg | exportSvg(Lminus, 180, light) |
| locus-Lminus-180-dark.svg | exportSvg(Lminus, 180, dark) |
| locus-Lminus-180-oneink.svg | exportSvg(Lminus, 180, oneink) |
| locus-M-128-light.svg | exportSvg(M, 128, light) |
| locus-M-128-dark.svg | exportSvg(M, 128, dark) |
| locus-M-128-oneink.svg | exportSvg(M, 128, oneink) |
| locus-M-128-bare.svg | exportSvg(M, 128, bare) |
| locus-X-48-light.svg | exportSvg(X, 48, light) |
| locus-X-48-dark.svg | exportSvg(X, 48, dark) |
| locus-X-48-oneink.svg | exportSvg(X, 48, oneink) |
| locus-X-32-light.svg | exportSvg(X, 32, light) |
| locus-X-32-dark.svg | exportSvg(X, 32, dark) |
| locus-X-32-oneink.svg | exportSvg(X, 32, oneink) |
| locus-Xdot-16-light.svg | exportSvg(Xdot, 16, light) |
| locus-Xdot-16-dark.svg | exportSvg(Xdot, 16, dark) |
| locus-Xdot-16-oneink.svg | exportSvg(Xdot, 16, oneink) |
| favicon.svg | exportSvg(X, 32, dark) |
| locus-lockup-h-light-large.svg | lockup(h, light, large: the M drawing at 0.016 M) |
| locus-lockup-s-light-large.svg | lockup(s, light, large: the M drawing at 0.016 M) |
| locus-lockup-h-light-small.svg | lockup(h, light, small: Col-X for 52 device px) |
| locus-lockup-s-light-small.svg | lockup(s, light, small: Col-X for 52 device px) |
| locus-lockup-h-dark-large.svg | lockup(h, dark, large: the M drawing at 0.016 M) |
| locus-lockup-s-dark-large.svg | lockup(s, dark, large: the M drawing at 0.016 M) |
| locus-lockup-h-dark-small.svg | lockup(h, dark, small: Col-X for 52 device px) |
| locus-lockup-s-dark-small.svg | lockup(s, dark, small: Col-X for 52 device px) |
| locus-lockup-h-oneink-large.svg | lockup(h, oneink, large: the M drawing at 0.016 M) |
| locus-lockup-s-oneink-large.svg | lockup(s, oneink, large: the M drawing at 0.016 M) |
| locus-lockup-h-oneink-small.svg | lockup(h, oneink, small: Col-X for 52 device px) |
| locus-lockup-s-oneink-small.svg | lockup(s, oneink, small: Col-X for 52 device px) |
| favicon-16.png | X· at 16, dark, the hole hinted to (10, 9) px |
| favicon-32.png | Col-X at 32, dark |
| favicon-48.png | Col-X at 48, dark |
| favicon.ico | favicon-16/32/48.png as PNG entries |
| apple-touch-icon.png | L− at 180, full bleed, opaque |
| icon-192.png | L− at 192 on the squircle |
| icon-512.png | L at 512 on the squircle |
| icon-512-maskable.png | L at 512, full bleed, for a mask |
| tiers.json | tiersData() |
| tiers.json | tiersData() |
| CONSTRUCTION.md | constructionMarkdown() |
