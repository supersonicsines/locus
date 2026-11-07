# Locus mark

**The operator chose Col (04 below), a summit, a lower knoll and the pass between them, drawn in contour.** It then had four more rounds of design and critique of its own, which redrew it from the construction up.
- **The studio:** `col.html`, at http://localhost:4800/col.html. It shows every drawing at every size, the growth, and the checks.
- **The finished files:** `col/`. These are the tier SVGs, favicons, app icons and lockups. `col/CONSTRUCTION.md` says how the mark is built and where each file comes from, and `col/tiers.json` holds the drawings for the site's `Mark.tsx`.
- **The record:** the final shots and notes are in `qa/rounds/col/final/`.
- **Slot 04** on the main page now shows the final Col.

The rest of this page is the record of the five-way choice that came before it.

---

# The five finals

Five marks in one squircle, each drawn from a few curves. Four had five rounds of design and critique; Inset, which replaced Spur, had two. The workbench (`npm run workbench`, then http://localhost:4800) shows each one large and small, on light and dark, still and moving, with downloads. The final shots are in `qa/rounds/logo/final/`; `glyphs.png` (each mark at 16 and 32 px beside the familiar glyphs it must not be) and `bounds.png` (each mark either side of its size boundaries) are the ones to judge them by.

Every mark is ink and paper, plus one meaning at most:
- Vermilion appears in Counties, where it means sealed, and in Summit only if its Seal option is on.
- Blue appears only for a moment, when a copy goes live, and only from 48 px up.

**Motion runs at 60 fps.** The checks read 33 ms frames because the machine was on battery, which caps every page at 30 fps: an empty page read the same 33 ms. With the cap lifted, a frame with all five marks moving takes 0.9 ms (2.3 ms at worst).

---

## 01 Summit: one hill whose contours run forever into a single still point

**What it says:** Locus is the one place that everything on your company's map leads to.

**Strengths**
- The most legible at every size.
- At 16 px it's a three-cornered ring with its point off-centre. It's the only one that sits beside no familiar glyph: not a bullseye, a radio button or an eye.
- Its motion states the idea: the land flows in to a point that never moves.
- It's the closest to a well-made app icon: one closed form, one point.

**Risks**
- It's in a crowded genre, contour rings round a dot, though no single mark it copies.
- It's the least specific to Locus's story of sharing and sealing.

**Two calls left to you, as controls on its card:**
- **Seal:** the point becomes a vermilion disc with a paper L, from 72 px up. That is the product's own "Can't read" stamp, mark for mark. In the logo it would say "sealed" on every page where nothing is sealed, and beside real sealed areas on the map it would read as one more. It also puts a letter back into the mark. Recommended: off.
- **Go live:** the paper round the hill floods blue, holds and ebbs, once, when a copy goes live, from 48 px up. That is exactly what blue means in the product. Recommended: on.

## 02 Tide: an island and its islet in a still grey sea

**What it says:** Locus is your company as land. When a copy goes live, the sea floods blue for a moment.

**Strengths**
- It's the product's own look: plain land on a grey sea.
- It has the best motion moment in the set: going live floods the sea blue, holds, and ebbs.

**Risks**
- It's the quietest at 16 px: an island with a thin grain of an islet beside it. A rounder islet made the pair the thought-bubble glyph on light, so at 32 and 16 px the islet is now a sliver.
- Without its live moment it's a generic island. Its moment lives on in Summit's Go live.

## 03 Counties: three counties of one island, one sealed

**What it says:** Locus splits your company into areas, and seals the ones a reader can't open.

**Strengths**
- The only mark that tells what Locus does.
- Vermilion is used exactly as it is in the product.
- The open land's contours flow, and the seal never moves.

**Risks**
- It's the busiest: coast, borders, hatch and contours.
- At 16 px it's the pill glyph, a slanted white capsule with a red end, and in a lockup it reads as a pharmacy. Five rounds found no fix: a white island with one red end is the pill.
- So it's finished as an illustration at 72 px and up, the best one for the README and onboarding, but not as a mark.

## 04 Col: a summit, a lower knoll and the pass between them

**What it says:** Locus is the pass: the one way through, where your company and an agent meet.

**Strengths**
- The most ownable large drawing: real map grammar, with the walkers' `)(` sign for a col.
- No other company's mark describes this place.
- Its intro is a sight closing on the pass.

**Risks**
- Below 64 px it's a single lumpy outline with a point, and that covers every browser tab and the 48 px icon. It passes the glyph check, but it takes a second look to read as terrain.
- From 64 px up it now shows two tops, the pass and the `)(`, with one ring fewer than the large drawing so it doesn't clog.
- The `)(` needs explaining once.

## 05 Inset: the tile's own outline laid on a coast, as an atlas marks an inset

**What it says:** Locus is the close-up: one place on the map, shown in the detail you choose to share.

**Strengths**
- The only mark where the tile itself is part of the drawing.
- The only one that runs off its edges: a coast, not an island.
- Detail appears only inside the frame, which is the product's idea of choosing what to show.

**Risks**
- The newest, with two rounds of critique instead of five.
- At 72–160 px, with the hill centred in the frame, it was the outline camera glyph: a lens in a rounded square, the family Instagram's mark belongs to. The hill now stands off-centre with its outer rings running off the frame, so the frame crops a slope. It's better, but this is the size to check first.
- Below 72 px the frame is empty, and its nearest neighbour is a page with a box on it (on light) or a file with a box (on dark). A dot or arcs in a frame that small read as a stop button or a scribble.

---

## Recommendation: Summit, with Seal off and Go live on

It's the only mark that's finished at every size, still and moving, and the only one with no familiar glyph beside it at 16 and 32 px. It's the calmest of the five, and its flow into a still point says "the one place it all leads to" without a word.

- **Seal off:** the vermilion L is the product's "Can't read" stamp, and a logo shouldn't say "sealed".
- **Go live on:** the blue flood says "live" only when a copy goes live, which is exactly what blue means in the product.

Then freeze it and export the set: a favicon `.ico` of the 16, 32 and 48 px drawings plus the SVG, a 180 px touch icon, a 512 px maskable icon with the rings inside the safe zone, a one-ink version, and a lockup with the name in Spline Sans Mono at weight 560.

**Second: Col.** Its large drawing is the strongest and most ownable in the set. But most uses of a mark fall below 64 px, where it's a gourd with a point.

**Keep Counties** as the illustration for the README and onboarding, at 72 px and up only.

**Not for this release:** Tide, whose moment Summit carries, and Inset, the best new idea of the last round but two rounds old, with its strongest size still to prove.
