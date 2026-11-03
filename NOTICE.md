# Notices

Vadere's own code is under the MIT licence, in `LICENSE`. Two things that ship with it are not.

## Service logos

The logos in `src/studio/logos/logos.bundle.json` are trademarks of their owners. They aren't covered by Vadere's MIT licence, and nothing here gives you a right to use them.

They're shown only to identify the services a company uses, on that company's own private map. **No endorsement or affiliation is implied**, by or with any company. Vadere isn't connected with any of them.

If you own a mark and want it changed or removed, open an issue.

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

Geist and Lustria ship with the Studio under the SIL Open Font License 1.1. A build copies each font's licence, with its copyright notice, into `dist/studio/licenses/` (`OFL-Geist.txt` and `OFL-Lustria.txt`) from the `@fontsource` packages in `node_modules`, so every copy of the built app carries them. Geist is copyright The Geist Project Authors. Lustria's copyright notice and Reserved Font Name are in its licence file.
