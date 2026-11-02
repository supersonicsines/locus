# Security

What Vadere protects, how, and what it doesn't. **This code has not had an independent audit.** You can check the claims below yourself, and we'd like you to try to break them.

## The short version

- The host stores only ciphertext. Your data is encrypted on your device before it's published.
- A password opens only the gates it was given keys for. That's cryptography, not a permission check.
- When an agent reads through the host, the host does see the password and the plaintext, in memory, for that one request. If that's not acceptable, decrypt on your own machine or turn **Remote access** off for that password.

## Who can read what

| How the reader connects | Who decrypts | Do you need to trust the host? |
| --- | --- | --- |
| `vadere mcp`, `vadere pull` | The reader's machine | No. The host only ever serves ciphertext |
| Browser, at your address | The reader's browser | **Yes.** The page's code comes from the host, so a dishonest host could serve code that steals the password. Self-host to remove this |
| `Authorization: Bearer` | The host, in memory, per request | **Yes** |
| `/k/<password>/...` | The host, in memory, per request | **Yes**, and the URL itself is sensitive |

Open source can't prove what a hosted server is actually running. Only the first row, or running your own host, is independent of whoever hosts it.

## How it's sealed

All of it is in `src/core/seal.ts`, using only Web Crypto.

- **Passwords and owner keys** are 130 random bits, generated, never chosen.
- **No Argon2, on purpose.** The sealed bundle is public, so a human-chosen password could be attacked offline. Slow hashing exists to protect guessable secrets; these aren't guessable. HKDF-SHA-256 turns them into purpose-specific keys, with a different label for each purpose.
- **Gates:** each has a random AES-256-GCM key, new on every publish.
- **Passwords:** each has an envelope holding the keys to its gates, sealed under a key derived from the password.
- **Links across two gates** are sealed under a key derived from both, and their location comes from both too. A password missing either can't read one, or even find it.
- **Prices** are sealed in the Money gate, separately from the services they describe.
- **The owner copy** is sealed under the owner key, for signing in on another device.
- **Binding:** every part is authenticated against its site, version and slot, so parts can't be swapped between versions or moved between sites.
- **Padding:** Padmé, with a 1 KiB minimum, so sizes reveal little.
- **Publishing** needs a token derived from the owner key. The host stores only its hash.

## What anyone can see

The bundle is public by design: `curl https://yourco.domain/bundle.json`, or run `vadere verify`. It reveals:

- The address name, the version and when it was sealed.
- How many gates and passwords exist, and roughly how big each part is.
- How many groups of links cross between gates.
- Whether each password allows remote access.

Gate names, password names, company name, pieces, links, prices and readers' layouts are all sealed.

## What this does not protect against

- **What someone already read.** Revoking stops them reading anything published afterwards. They keep what they already have, including any old bundle they saved.
- **Delay.** A closed gate stays readable until you publish, and so does a password with Remote access switched off. The app says so until you do. Revoking publishes immediately; if it can't reach the host, the app says the password still works.
- **A dishonest host serving old versions.** It can't forge or read anything, but it could serve an older bundle, and a reader has no way to detect that yet.
- **Your own browser.** The Studio keeps your map, passwords and optional Claude key in plain form in this browser's storage. Anyone with access to your browser profile has them.
- **Anthropic, if you shred with Claude.** Those files go to Anthropic under your own key. The no-AI shredder keeps everything on your device.
- **Prompt injection, entirely.** Documents are treated as data, and shredding can't grant itself authority: rules and MCP servers stay proposals until you approve them. Agent output separates approved rules from reference text, and a document can't forge a section. But an agent reading reference text can still be influenced by it, because that's what reading is.
- **Secrets in unusual forms.** The scan finds common key formats and removes them before anything leaves. It will miss some.
- **Prices in ordinary text.** Prices go in a sealed field, and currency sentences are stripped from service pieces. A price written into some other document is just text in that document's gate.
- **Passwords in URLs.** The `/k/` form exists because Claude.ai connectors can't set headers. The host never logs paths and sends `Referrer-Policy: no-referrer`, but a URL can still end up in a proxy log or browser history.
- **Losing your owner key.** Nobody can recover it. That's the cost of a host that can't read your data.

## Running a public host

- Put it behind HTTPS and pass `--trust-proxy`. Passwords over plain HTTP are refused when the proxy reports them.
- **Free, encrypted hosting attracts abuse, and you can't inspect what's stored.** Hosted mode limits each account to 10 MB, accepts only valid bundles, and serves them as JSON with `nosniff`, so it's a poor file host. Set `--abuse-contact`, and use `vadere admin remove <name>` for takedowns. Take advice on your own legal position before opening a public instance.

## Checking it yourself

```sh
vadere verify https://yourco.domain              # what the host really holds
vadere verify https://yourco.domain --key vdr_…  # what a password opens, and that tampering is refused
npm test                                         # the claims above, as tests
```

Look at the Studio's `Content-Security-Policy` response header: the page can reach its own host and `api.anthropic.com`, and nothing else.

## Reporting a problem

Open a private security advisory on the repository, rather than a public issue.
