# The `$` switch: two options

Worked out in a three-round debate between two Claude Opus 5.5 instances. One started with three proposals (Price Pins, Spend Relief, Ledger Plate) and the other replied with two of its own. Each then critiqued the other's until these two were locked. Both are built, and the founder picks one.

The options split on one question: **does money annotate the geography, or replace it?**

## The two options

**Soundings:** press `$` and nothing moves. Every service's price prints onto your chart like depth soundings, and ink pools where the money is.

**Towns:** press `$` and your services swell into engraved towns, so the biggest bills are the biggest places on the map.

The reviewing agent's vote was Soundings, as the one to keep open every day. Towns wins the first two seconds and the screenshot.

## Shared by both

- **The switch:** top right, like Figma's Dev Mode. A password without the Money gate never sees it, and prices never reach that client.
- **Cartouche**, three rows, styled like a chart's scale box:
  1. The total, for example `≈$1,240 + €120`, with a month/year switch.
  2. A scale bar of gates by share of spend, sorted descending. Segments are labelled when wide enough; hovering one lights its territory, and vice versa.
  3. One quiet sentence: `71% from invoices. 4 unpriced. 5 to check.` "5 to check" opens the existing things-that-need-you list.
- **Subtotals** on territory labels.
- **Colour:** ink only. Vermilion keeps its one meaning, sealed.
- **Three trust states:** known (invoice or typed; full ink), estimate (`≈` at reduced ink; list prices and usage), unknown (`?`). `free` is a value, not a state. The source itself goes in the peek.
- **To check** means something you can act on: unknown price (grouped into one entry), invoice more than 20% above list (flat plans or known seat counts only), renewal within 30 days, or a usage jump above 25% (needs two invoices). Marked with a small diamond beside the figure.
- **One cost per service.** Precedence: you, invoice, list. The latest invoice wins, and annual invoices become monthly.
- **Currencies are never converted.** A map has a main currency. Shares and sizes use the main currency only. Other-currency services get the smallest mark, their own figure, and no share of the bar.
- **Names by priority.** Every figure is always placed. Names are added where they fit: to-check items first, then by cost. Valid placements persist when zoom settles, and only changed labels crossfade. Hover names anything unnamed.
- **The camera stays where you put it.** If you've panned or zoomed, the toggle leaves it alone, unless no service would be in view at all. If you haven't, it eases just enough to keep every price in frame. (Changed during build: big marks otherwise spilled off screen and hid territory names.)
- **Later:** cheaper-alternative recommendations arrive in the peek, with a mark on the map (below).

## Soundings: nothing moves

- **Mark:** hairline ring plus a 6% ink wash, so overlaps accumulate like ink on paper. Stacked darkness clamps at about 30%, and figures get a paper halo.
- **Size:** true area, no floor. Radius = 72 × √(cost ÷ max(biggest bill, $500)). $4,000 gives 72, $300 gives 20.
- **Labels:** greedy placement, biggest money first, with hairline leaders as a fallback.
- **Other pieces:** drop to 15%.
- **Transition:** rings and wash ripple out of the symbols, figures print largest-first, about 500 ms. Reversible.
- **Later:** a dagger on the figure.
- **Weakness:** a dense gate can still get busy, and rings answer "where does the money go?" more quietly than Towns.

## Towns: services shoulder aside, land frozen

- **Mark:** a disc with fine engraved hatching, figure knocked out in the centre. Rim by trust: double (known), single (estimate), dashed (unknown, unhatched, smallest class).
- **Size:** five fixed classes, like settlement symbols on an old chart. Fixed classes mean a single large bill doesn't flatten the rest, and symbols don't change when another bill does.

  | Monthly cost | Radius |
  | --- | --- |
  | under $50 | 20 |
  | $50 to $249 | 28 |
  | $250 to $999 | 40 |
  | $1,000 to $4,999 | 56 |
  | $5,000 and up | 72 |

- **Position:** collision physics pushes discs apart, each pulled towards its own saved position, with centres kept inside the territory's outer contour. Territories stay frozen, so the land stays recognisable.
- **Zoom:** discs scale with zoom, figures stay a constant screen size, and zoom-out clamps at fit-all while the overlay is on. In year view, a figure that doesn't fit moves beneath its disc.
- **Legend:** five reference symbols, shown only while hovering the cartouche.
- **Other pieces:** fade to 15%.
- **Transition:** discs swell and shoulder their neighbours, about 700 ms, one precomputed reversible tween that lands exactly on the saved layout.
- **Later:** a small satellite disc with the cheaper price, so the saving shows as a size difference.
- **Weakness:** motion costs spatial memory while the overlay is on, and it needs excellent engraving to avoid looking like a bubble chart.

## What the build showed

![Soundings](options/soundings.png)

![Towns](options/towns.png)

Tested at 5 services and at 60, among 40 to 240 other pieces, at 60 frames a second.

- **At 60 services, Towns is the clearer of the two.** This goes against the debate's prediction. Figures sit inside their discs, so they never collide. In Soundings, big rings overlap and a dense gate gets busy, though it stays readable.
- **At a typical 25 services, both read well.** Soundings keeps your place, and every service's position, exactly.
- **Soundings' names sit beside their figures; Towns' sit under their discs.**

## Rejected along the way

- **Price Pins:** pure Airbnb costume, and 60 of them bury the map.
- **Spend Relief (terrain):** gorgeous, but Gaussians sum, so two neighbouring $100 tools read as one $200 peak, and a legend claiming "1 contour = $50" lies. It also can't show what's off.
- **Ledger Plate:** a table in engraver's clothes, which strains "the map is the app". Its two-way hover survives.
- **Literal coins:** mush at small sizes, and coins plus a crypto donation button reads as a token launch.
- **Green ink:** would end vermilion's status as the only colour.
