# Locus PRD

Status: final for v1. QA findings applied (see [PRD-QA.md](PRD-QA.md)), then a visual polish programme (see [design/qa-rounds.md](design/qa-rounds.md)). Where things stand, and the design calls still open, are in [STATUS.md](STATUS.md).

*Locus* is Latin for "place": the spot on a map where something is, and in mathematics the set of every point that meets a rule. Locus is the one place your agents go to learn where everything in your company is, and the rules that apply.

## 1. The problem

A founder's company is scattered across Figma, a brand book, contracts, specs, invoices and a dozen services. Every new agent session starts blank, so the founder re-explains the company by hand. The ones who feel this most have been vibecoding for about six months. They live in Notion and Figma, they understand MCP, and they do not know how to build a harness.

## 2. The product in one paragraph

Drop your company's pile onto a map. AI shreds it into small pieces and links them, along with the services you run on. Gates divide the map into regions such as Brand, Product, Legal and Money. A password opens a chosen set of gates. Hand any agent one address and one password, and it can read exactly that part of the company: the rules it must follow, where everything lives, which tool or MCP server to use for what. It is a harness you don't have to build, and it's encrypted so the host can't read it at rest.

## 3. Who it is for

Notion and Figma semi-natives, about six months into vibecoding, who understand MCP but can't build a harness.

Their existing habits guide how the app behaves. We don't copy either product; we use what people already intuit:

| They already know | So in Locus |
| --- | --- |
| Figma's canvas: pan, zoom, floating panels | The map behaves the same way |
| Figma's layers panel | The list of who can read the map, top left over the map |
| Figma's Dev Mode switch, top right | The cost button sits in the same place, and spreads prices over the map |
| Share in both products | A reader's password and setup open from their row on the left |
| Notion's side peek | A piece opens as a peek on the right |
| Notion's and Figma's quick actions | ⌘K finds any piece or action |
| Figma's "publish" and autosave | Your work saves itself; Publish is one deliberate click |

## 4. Binding principle

**The map is the app.** One screen. Everything slides over the map. No dashboards, tables, settings pages or nav sidebar. Power features live behind ⌘K. Anything that would crowd the screen gets cut.

Where this collides with anything else in this document, this wins.

## 5. The at-a-glance test

Once set up, a user glancing at the screen must know the state of their company map without clicking. That means answering four questions in about two seconds:

1. **Is it live and current?** Live or not, and whether there are changes not yet published.
2. **Who can read what?** How many passwords are out, and which gates each opens.
3. **Does anything need me?** Conflicts, gaps, secrets found in documents, renewals due.
4. **What does it cost?** With `$` on, the monthly total and where it goes.

Delivered by:

- **The top of the screen.** Top centre says what needs you, by name and count, or that nothing does. Top right gives the monthly cost and whether the map is live and current.
- **The map itself.** Territories show which regions exist and how big they are. A sealed territory looks sealed. A piece that needs you carries a mark.
- **The names on the map.** Each area says who can read it. Top left lists those readers and how much each can open.

## 6. Vocabulary

| Word | Meaning |
| --- | --- |
| Piece | The smallest useful unit: a rule, fact, decision, clause, spec, token set, service, contract, person |
| Link | A relationship between two pieces |
| Map | All pieces and links |
| Gate | A named region of the map. Every piece is in exactly one gate |
| Password | A generated key that opens a chosen set of gates |
| Owner key | Your account: claims your name, publishes, restores your map on another device |
| Publish | Seal the map and put it live at your address |
| Sealed | Encrypted. A closed gate is sealed, not hidden |

Technical terms the audience already knows (MCP, API) are fine in the interface. Crypto terms stay in the security docs.

**The interface uses plainer words than this table** (QA round 1, see [design/qa-rounds.md](design/qa-rounds.md)): an area is a gate, an item is a piece, a reader is a password's holder, a tool is a service, the recovery key is the owner key, going live or updating is publishing, and **Let AI tools in the cloud read this** is Remote access. The code keeps the names above.

## 7. Scope

### In

**Two ways to run it**

- **Self-hosted:** one command runs everything, or one container. No limits.
- **SaaS-lite:** the same code in hosted mode. Free, a cap on accounts, a donation button. An account is a claimed name plus an owner key: no email, no personal data stored. A name is claimed by its first successful publish, so there are no empty reservations, and deleting an account frees its spot. When full, the map still works locally and the interface offers the self-host command. Hosted limits: 10 MB per account, a small proof-of-work on claiming, a per-IP limit, reserved names, and `locus admin remove <name>` with a configurable abuse contact for takedowns. The crypto donation target gets wired up later; v1 ships the slot and its configuration.

**The map (Studio)**

- Drop files; extract locally; shred with Claude using your own key, or locally with no AI.
- Map with territories, stable positions, pan and zoom, drag a piece between gates.
- Gates panel, status line, peek, ⌘K, add a piece or service by hand.
- Share: create a password, flip gates on and off and watch the map seal live, get copy-paste connection instructions.
- "See what it sees": the exact text an agent would get with that password.
- `$` switch: the price overlay (section 10).
- Publish, re-publish, revoke, sign in with an owner key on another device. First publish can't complete until the owner key has been copied or downloaded; nobody can recover it.
- Several maps per browser, switched from the top-left menu.
- A sample company, so the product can be understood in ten seconds with no setup. On the hosted service the sample can't be published, so it can't burn a free account; self-hosted, it can, which is how you try the whole flow.
- Light and dark.

**The address (`yourco.domain`)**

- For people: an unlock page and a read-only map, decrypted in the browser. Works on a phone. The Studio is designed for a laptop. On a phone it's for checking on the map and answering it: see who can read what and what it costs, deal with what needs you, change what a reader can read, connect them, add to the map and go live. Arranging things by hand stays on a laptop, because a finger on the map moves the map.
- Every address is also available at `/s/<name>/`, for Safari on `*.localhost` and self-hosters without wildcard DNS.
- For agents with a local process: CLI and local MCP that decrypt on their own machine.
- For agents without one: a remote endpoint and remote MCP that decrypt in memory per request.

**The proof**

- Open source, small, auditable crypto with no dependencies beyond the platform.
- The sealed bundle is publicly downloadable, and `locus verify` shows what it does and doesn't reveal.
- A written threat model that says plainly what is not protected.

### Out, for now

- Live sync with Figma, Notion and others. The map tells agents where things live and which MCP to use; it doesn't mirror them.
- Cheaper-alternative recommendations and our own lightweight LLM (the overlay leaves a place for them).
- Real-time collaboration, teams, roles.
- Email accounts, billing.
- Password expiry, read receipts.
- Storing original files. Pieces hold the extracted text.
- Vector search. See 11.4.

## 8. How it works

### 8.1 Shredding

Two steps, run from the browser with the user's key:

1. **Reader**, per file, concurrently. Claude reads PDFs and images natively. It returns pieces, including services and their prices where it finds them.
2. **Cartographer**, once. Given every piece's title and summary, it names the gates, assigns pieces, draws links, and flags conflicts and gaps.

Pieces arrive on the map as they're produced. There is no separate processing screen.

The **no-AI fallback** runs entirely in the tab. It splits on headings, guesses kind and gate from keywords, links pieces by shared terms, and recognises known services from the catalog. It is rougher, and the UI says so.

Before anything is sent, a local scan replaces anything that looks like a live secret with a labelled placeholder and flags the piece. An estimate of the cost appears before a Claude run, and actual usage after it. The model is selectable; the default is Opus 5.5. The Claude key stays in the browser and is never part of what gets sealed.

Re-dropping a file with the same name replaces its pieces. Pieces with the same title keep their position and links, so the map stays recognisable. An approved rule stays approved only if its words are unchanged.

Dropped documents are data, not instructions. Reader and Cartographer are told so, and everything an agent reads is labelled the same way.

**Proposals.** Shredding can't grant itself authority. Anything that would instruct agents, meaning an "Always follow" rule or an MCP server not in the bundled catalog, is a proposal until the user approves it. Until then it's listed under "things that need you" and left out of the agent's rules and routes. Its words are still on the map, so a reader of that area gets them as reference; the Studio says so, and a reader's page files them with the facts. Reject takes the item off the map, with Undo, and remembers the words so a re-drop doesn't bring them back. New words ask again. A service with a real price keeps its place and loses only the address.

**Prices stay structured.** Reader puts prices only in the cost field. A local pass strips currency sentences from service pieces. Invoices and pricing documents default to the Money gate.

### 8.2 Things that need you

| Kind | Found by | Example |
| --- | --- | --- |
| Conflict | Cartographer | Brand book says "Meridian Inc", MSA says "Meridian Ltd" |
| Gap | Cartographer | "Handles customer data, but no DPA in the pile" |
| Secret | Local pattern match | A live API key pasted into a doc |
| Due | Dates in pieces | Contract ends or service renews in 30 days |
| Stale | Dates in pieces | Pricing sheet is 14 months old |
| Proposal | Shredding | Proposed rule or MCP server waiting for approval |
| Exposure | Publish state | "Contractor can still read Legal until you publish" |

### 8.3 What an agent reads

`/llms.txt` is the harness. In order:

1. Who this company is.
2. What this password can and can't see ("2 gates are closed to this password"), so the agent says it doesn't know rather than guessing.
3. **Always follow:** rules that apply to every task.
4. **Where things live:** services, their links, and which MCP server to connect, generated from service pieces.
5. **The map:** every readable piece as an ID and a one-line summary, grouped by gate.
6. **How to read more:** search and read endpoints.

Endpoints: `/llms.txt`, `/llms-full.txt`, `/v1/search?q=`, `/v1/pieces/:id`, `/v1/costs` (only if Money is open), `/mcp`, `/bundle.json`.

Three ways to present a password, because agents differ:

| How | For | Who decrypts | Trusting the host |
| --- | --- | --- | --- |
| `locus mcp`, `locus pull` | Claude Code, Cursor | The reader's machine | Not needed. The host only ever sees ciphertext |
| Browser unlock | People | The reader's browser | Needed: the page's code comes from the host. Self-host to remove this |
| `Authorization: Bearer` | Anything that can set a header | The host, in memory, per request | Needed |
| `/k/<password>/...` in the URL | Claude.ai connectors and fetch tools that can't set headers | The host, in memory, per request | Needed, and the URL itself is sensitive |

Each password has a switch, **Remote access**, that makes the host refuse the last two. The host never logs these paths, sends `Referrer-Policy: no-referrer`, and rejects remote use over plain HTTP where the proxy reports it.

**Changing access.** A change that reduces access doesn't take effect until the next publish, whether that's closing a gate, moving a piece somewhere more private, or switching Remote access off. The interface says so in place ("Contractor can still read Legal until you publish"), with Publish right there. Revoking publishes immediately, and says so if that also publishes other pending changes. Every publish rotates every gate key, so a revoked password can't read anything published afterwards. Whatever it already read, it keeps.

## 9. Design

**Look: Atlas.** Cool white paper, ink-black text, engraved-chart hairlines. The company is one country, its land a plain fill on the sea with nothing drawn round it, and each gate is a county of it, with dashed borders. Pieces stand in columns by kind, as small ink symbols or real logos, each with its name, so nothing needs a legend. Vermilion means sealed and nothing else: a closed gate carries a wax-seal mark. Full dark mode.

**Type.** One face, Spline Sans Mono, for everything: the company name, county names, item titles and bodies, interface text, numbers, passwords and what an agent sees. It's a monospace with drawn, warm curves rather than a terminal's, so the map reads like a surveyor's chart. Hierarchy comes from size, weight, case and ink. The font ships with the app.

**The one memorable moment:** flipping a gate closed on a password. The county seals, its land turns vermilion-pink and its edge wears the colour, the wax mark lands, and the links crossing into it fade. Everything else stays quiet so that this moment lands.

## 10. The `$` switch

A switch top right, in the same place as Figma's Dev Mode. It overlays the price of every service on the map. A password without the Money gate never sees it.

Two options came out of the design debate, and **both get built so the founder can pick**. They split on one question: does money annotate the geography, or replace it?

- **Rings** (Soundings, in the code): press `$` and every service's price prints onto the chart like depth soundings, and ink pools where the money is.
- **Discs** (Towns, in the code): press `$` and services swell into engraved towns, so the biggest bills are the biggest places on the map.

Full spec, shared rules and rejected ideas: [design/dollar-overlay.md](design/dollar-overlay.md).

**Prices** come from three sources with different trust: an invoice you dropped, a price you typed, or a bundled catalog of list prices, checked by hand and dated, which is shown as an estimate. A price the catalog can't back up stays unknown rather than guessed.

**Later:** cheaper-alternative recommendations, powered by our own lightweight LLM. Both options have a marked place for them, so they can arrive without a redesign.

## 11. Architecture

### 11.1 Shape

One package, four parts:

- `core`: types, sealing, search, the agent text. Platform crypto only. Runs in browser and Node.
- `server`: the host. Claims names, stores sealed bundles, serves addresses and agent endpoints, serves the Studio.
- `studio`: the map. A static React app; plaintext never leaves it except by explicit Claude shredding.
- `cli`: `locus serve`, `mcp`, `pull`, `verify`.

### 11.2 Sealing

- Every gate gets a random 256-bit key, new on every publish.
- A password is a generated 130-bit key. HKDF-SHA-256 turns it into a wrapping key, and AES-256-GCM wraps the gate keys that password opens.
- Links between two gates are sealed under a key derived from both, so they're readable only by a password that opens both.
- Prices are sealed in the Money gate, so a password can open a gate full of services and still see no prices.
- Readers don't receive the owner's layout. They get a fresh map of what they can see, so nothing hints at closed gates.
- The owner key seals a full copy of the map, so you can restore from any device.
- Plaintext is padded to size buckets before sealing. Every part is bound to site, version and part name.
- Each password's envelope lists the hash of everything it may read, because gate keys are shared and AES-GCM alone can't tell one reader from another. A reader refuses anything that doesn't match.

### 11.3 No accounts database

A site is a folder holding a sealed bundle and a hash of its publish token. There is nothing else to leak.

### 11.4 Search

BM25 plus one hop along links. No embeddings: agents already reformulate queries well, embeddings would need another model, and embeddings leak meaning.

### 11.5 Browser safety

The browser holds plaintext, passwords and the Claude key, so piece bodies are rendered through a safe Markdown subset with no raw HTML. Strict CSP: no inline script, `connect-src` limited to self and `api.anthropic.com`. The bundled pdf.js has no eval path, and the CSP would block one anyway. ⌘K, the area panel and peek are a complete keyboard and screen-reader path to every piece, since a canvas alone offers neither. Reduced motion is respected.

## 12. Success

- A new user understands the sample in ten seconds.
- A real pile becomes a useful map in under five minutes.
- Pasting one line into Claude Code gives a session that follows the company's rules.
- A glance passes the test in section 5.
- `locus verify` confirms the host holds only ciphertext.

## 13. Testing

Build first, then test where it counts:

- **Crypto:** round trips, wrong key, closed gate unreadable, cross-gate links hidden, tampering rejected, parts not swappable between versions, revocation.
- **Host, end to end:** claim, publish, agent endpoints, MCP, cap, limits, no secrets in logs.
- **Real clients:** Claude Code connected over both remote and local MCP.
- **Browser flows:** driven in a real browser. Several rounds of visual QA across light, dark, phone and sample data.

## 14. License and commits

MIT, chosen for reach and auditability; easy to change before the first public push. All commits are authored `anon`, in UTC, with no trailers, and nothing in the repo points to a person.
