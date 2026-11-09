# Changelog

Everything notable that changes in a release. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Until 1.0, a minor version may break things; the notes will say how.

## Unreleased

### Added
- A website at `/`, an onboarding flow at `/start`, the example at `/example` and your maps at `/map`, with working Back and a way home from the map.
- Optional sign-in with Google on a host, to claim an address and find your maps on another device. It never touches the sealed map or the recovery key.
- The map zooms much further out (to an island with the company's name) and in (to read what's in each item), and changes what it shows at each scale.
- Arrow keys pan the map.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue and pull-request templates, CI, a Compose file and a self-hosting guide.
- The Locus mark, Col: two heights and the pass between them, in contour, black lines on a white tile, drawn in once as a pen draws it. It comes with a tab icon (`.ico`) and a touch icon.

- The brand pack, `brand/`: a brand book (`brand/index.html`) covering the mark, colour, type, the interface, the map's look and words; every logo file, link cards, design tokens (CSS and Design Tokens JSON), the face with its licence, and `brand.json` for agents. `npm run brand` writes it, and a test keeps it in step with the app.

### Fixed
- One map stuffed with tens of thousands of items or links could hold the host up for seconds a request. Reading and searching a map now take time in proportion to its size.
- Requests without a password could use up a map's reading budget, so its readers were refused. Only a request a password opened counts now.
- Large uploads were held in memory before any check, so a few at once could exhaust it. Bodies are read only where one belongs, four uploads at most at once, and slow clients are cut off.
- The limiter forgot every limit once it had seen enough addresses. It forgets only what has run out, and an IPv6 /64 counts as one client.
- The lock page's mark was a missing file. A missing file is now a 404 rather than the app.
- The mark's tile is the same on every version of Node, so the brand test passes on Node 22 as well as 24. It moved by under a hundredth of a unit.

### Security
- New addresses are capped per hour across the whole host (`LOCUS_CLAIMS_PER_HOUR`), and punycode names and the names of well-known services aren't given out.
- Behind HTTPS every reply carries `Strict-Transport-Security`, and a proxy that reports plain HTTP can't be used to publish or delete.
- `bundle.json` and the Studio's files have a per-client budget; an unchanged bundle is answered with a 304, and `locus mcp` asks for one.
- `www.` and other names under the host's domain redirect to it, and `LOCUS_DOMAIN` must be a bare domain.
- The host stops cleanly on SIGTERM.

### Changed
- The logo workbench is gone. Its four other candidates are recorded in `docs/design/qa-rounds.md`.
- Scrolling, pinching and dragging follow the input exactly; mouse-wheel notches glide; a thrown drag carries on and slows.

## 0.1.0

The first version: the Studio, sealing, the host, the `locus` command, local and remote MCP, and the free hosted mode. Not published.
