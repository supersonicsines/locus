# Notices

Locus's own code is under the MIT licence, in `LICENSE`. Three things that ship with it are not.

## Service logos

The logos in `src/studio/logos/logos.bundle.json` are trademarks of their owners. They aren't covered by Locus's MIT licence, and nothing here gives you a right to use them.

They're shown only to identify the services a company uses, on that company's own private map. **No endorsement or affiliation is implied**, by or with any company. Locus isn't connected with any of them.

If you own a mark and want it changed or removed, open an issue.

The Google "G" belongs to Google. It appears only on the "Continue with Google" button, as Google's sign-in branding guidelines ask, and only on a host that has sign-in with Google turned on.

### Where each one came from

`licenses/logo-sources.csv` lists every service, in the list's order, with the source and licence of its logo, or the reason it has none. A pack's licence covers the drawing in the file. It doesn't touch the trademark, whatever the licence says.

| Source | Licence | Used for |
| --- | --- | --- |
| [gilbarbara/logos](https://github.com/gilbarbara/logos) | CC0 1.0 | Most full-colour marks |
| [Simple Icons](https://github.com/simple-icons/simple-icons) | CC0 1.0, per icon where it says otherwise | One-colour marks, in the brand's colour |
| [theSVG](https://github.com/glincker/thesvg) | Per icon. Only CC0, MIT, Apache 2.0, BSD, ISC, Unlicense and CC BY icons are used | Marks in brand colours |
| [svgl](https://github.com/pheralb/svgl) | MIT, for the project. Its logos remain their owners' | Full-colour marks |
| [Lobe Icons](https://github.com/lobehub/lobe-icons) | MIT | AI companies |
| [Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) | Apache 2.0 | Marks not found elsewhere |
| [selfh.st icons](https://github.com/selfhst/icons) | CC BY 4.0 | Marks not found elsewhere |
| [Devicon](https://github.com/devicons/devicon) | MIT | Developer tools |
| Companies' own sites | None. The owner's own file, used to identify it | Services no open pack has. Each one's URL is in the CSV |

Every file was changed: sanitised, optimised and re-framed so its mark is centred, and some were cropped to the symbol of a lockup or recoloured for contrast. Those changes are indicated here for CC BY and Apache 2.0. The texts of these licences are in `licenses/logo-packs.txt`.

## Fonts

Spline Sans Mono ships with the Studio under the SIL Open Font License 1.1. A build copies its licence, with its copyright notice, into `dist/studio/licenses/OFL-SplineSansMono.txt` from the `@fontsource-variable/spline-sans-mono` package in `node_modules`, so every copy of the built app carries it. Spline Sans Mono is copyright The Spline Sans Mono Project Authors.

## Libraries

The Studio bundles these, and a build copies each one's licence from its package into `dist/studio/licenses/`, so every copy of the built app carries them. The host and CLI have no runtime dependencies.

| Library | Licence | What it does here |
| --- | --- | --- |
| [React and React DOM](https://github.com/facebook/react), with scheduler | MIT | The Studio's interface |
| [PDF.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | Apache 2.0 | Reads PDFs in the browser. Unchanged |
| [fflate](https://github.com/101arrowz/fflate) | MIT | Reads Word files |
| [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) | Apache 2.0 | Talks to Claude with your own key |
| [OpenTelemetry API](https://github.com/open-telemetry/opentelemetry-js), [standardwebhooks](https://github.com/standard-webhooks/standard-webhooks), [@stablelib/base64](https://github.com/StableLib/stablelib), [fast-sha256](https://github.com/dchest/fast-sha256-js) | Apache 2.0, MIT, MIT, Unlicense | Come with the SDK |
| [d3-contour](https://github.com/d3/d3-contour), with d3-array | ISC | Shapes the land |
