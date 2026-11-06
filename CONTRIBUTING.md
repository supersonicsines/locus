# Contributing to Locus

Thanks for wanting to help. Locus is small on purpose, and these notes keep it that way.

## Before you start

- **Read [docs/STATUS.md](docs/STATUS.md)** for where things stand and which design questions are still open. Please don't send a change that settles one of those; open an issue to discuss it instead.
- **Read [docs/PRD.md](docs/PRD.md)** for what Locus is and isn't. The short version: the map is the app, one screen, and anything that would crowd it gets cut.
- **Security problems go privately**, never in a public issue or pull request. See [docs/SECURITY.md](docs/SECURITY.md#reporting-a-problem).
- For anything bigger than a fix, open an issue first so we can agree on the shape before you spend time on it.

## Setting up

You need Node 22 or later.

```sh
npm ci
npm run dev          # the Studio with hot reload, and the host, at http://localhost:5173
npm test             # crypto, host and layout, end to end
npm run typecheck
npm run build && npm start   # the real thing, at http://localhost:4747
```

## How the code is laid out

| Folder | What's in it | Rules |
| --- | --- | --- |
| `src/core` | Types, sealing, search, the text agents read | Runs in the browser and in Node. `seal.ts` uses Web Crypto and nothing else |
| `src/server` | The host | **No runtime dependencies.** Node built-ins and `fetch` only |
| `src/cli` | The `locus` command | Same as the host |
| `src/studio` | The map and the website, a static React app | The map is drawn on one canvas in `map/MapView.ts` |

`CLAUDE.md` holds the rules that bind the build, written for AI coding agents but true for everyone. The ones people trip on:

- **The host has no runtime dependencies.** If a change needs a package on the server, it needs a very good reason.
- **Documents never gain authority.** Anything a dropped document says is data. Rules and MCP servers found in documents stay proposals until the owner approves them.
- **A reader trusts only what its own envelope vouches for.** A new field in a bundle is either sealed or listed in the manifest.
- **One face, and colours with one meaning each:** vermilion is sealed, amber is urgent, blue is live.
- **Logos are one file, fetched whole.** Never a request per logo, never a logo CDN.

## Making a change

1. Branch from `main`.
2. Keep the change to one thing. Match the code around it: short functions, comments that say *why*, the screen's plain words (area, item, reader, tool, recovery key).
3. Add or update tests for anything in `src/core`, `src/server` or `src/cli`. `npm test` and `npm run typecheck` must pass.
4. For a change you can see, attach before-and-after screenshots at a laptop width and a phone width, light and dark. Judge looks from screenshots, not from the code.
5. If the change alters what the README, the PRD or the security notes say, change them in the same pull request.
6. Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md).

## Commits

Write the subject as what the change does, in the present tense ("Let a reader see the costs file"). Say why in the body when it isn't obvious.

## Licence

By contributing you agree that your work is released under the [MIT licence](LICENSE), the same as the rest of the code. The bundled font and logos have their own terms: see [NOTICE.md](NOTICE.md).
