# Changelog

Everything notable that changes in a release. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Until 1.0, a minor version may break things; the notes will say how.

## Unreleased

### Added
- A website at `/`, an onboarding flow at `/start`, the example at `/example` and your maps at `/map`, with working Back and a way home from the map.
- Optional sign-in with Google on a host, to claim an address and find your maps on another device. It never touches the sealed map or the recovery key.
- The map zooms much further out (to an island with the company's name) and in (to read what's in each item), and changes what it shows at each scale.
- Arrow keys pan the map.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue and pull-request templates, CI, a Compose file and a self-hosting guide.
- The Locus mark, Col: two heights and the pass between them, in contour, black lines on a white tile, drawn in once as a pen draws it. It comes with a tab icon (`.ico`) and a touch icon, and the full set of files, an animated SVG among them, is in `workbench/logo/col/`.

### Changed
- Scrolling, pinching and dragging follow the input exactly; mouse-wheel notches glide; a thrown drag carries on and slows.

## 0.1.0

The first version: the Studio, sealing, the host, the `locus` command, local and remote MCP, and the free hosted mode. Not published.
