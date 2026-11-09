# Security

What Locus protects, how, and what it doesn't. **This code has not had a professional audit.** It has had one adversarial review, by an AI agent reading the code cold, which found real problems that are now fixed (see `docs/PRD-QA.md`). You can check the claims below yourself, and we'd like you to try to break them.

## The short version

- The host stores only ciphertext. Your data is encrypted on your device before it's published.
- A password opens only the gates it was given keys for. That's cryptography, not a permission check.
- A reader checks everything it reads against what the owner sealed for that password, so neither the host nor another password's holder can change it undetected. The one exception is below.
- When an agent reads through the host, the host does see the password and the plaintext, in memory, for that one request. If that's not acceptable, decrypt on your own machine or turn **Remote access** off for that password. The Studio's switch for it says **Let AI tools in the cloud read this**.
- Which services a company uses stays sealed. Logos come as one file, fetched whole from the same address whatever the map holds, so the request says nothing about what's on the map. No logo is ever fetched from anywhere else.
- Signing in with Google, where a host offers it, only says who owns which address. It never decrypts anything, and the host keeps a keyed hash of the account, not the email or the name.

## Who can read what

| How the reader connects | Who decrypts | Do you need to trust the host? |
| --- | --- | --- |
| `locus mcp`, `locus pull` | The reader's machine | No, as long as this password is never sent to the host. The host only ever serves ciphertext, and anything it changes is refused |
| Browser, at your address | The reader's browser | **Yes.** The page's code comes from the host, so a dishonest host could serve code that steals the password. Self-host to remove this |
| `Authorization: Bearer` | The host, in memory, per request | **Yes** |
| `/k/<password>/...` | The host, in memory, per request | **Yes**, and the URL itself is sensitive |

Open source can't prove what a hosted server is actually running. Only the first row, or running your own host, is independent of whoever hosts it.

**Keep local and remote passwords separate.** Once a password has been sent to a host, that host could use it to alter what that same password reads. Other passwords are unaffected. To keep a reader independent of the host, give it a password with Remote access off.

## How it's sealed

All of it is in `src/core/seal.ts`, using only Web Crypto.

- **Passwords and owner keys** are 130 random bits, generated, never chosen. The Studio calls the owner key your **recovery key**.
- **No Argon2, on purpose.** The sealed bundle is public, so a human-chosen password could be attacked offline. Slow hashing exists to protect guessable secrets; these aren't guessable. HKDF-SHA-256 turns them into purpose-specific keys, with a different label for each purpose.
- **Gates:** each has a random AES-256-GCM key, new on every publish.
- **Passwords:** each has an envelope holding the keys to its gates, sealed under a key derived from the password.
- **Links across two gates** are sealed under a key derived from both, and their location comes from both too. A password missing either can't read one, or even find it.
- **Prices** are sealed in the Money gate, separately from the services they describe.
- **The owner copy** is sealed under the owner key, for signing in on another device.
- **Binding:** every part is authenticated against its site, version and slot, so parts can't be swapped between versions or moved between sites.
- **Manifests:** gate keys are shared, so AES-GCM alone only proves that someone holding that gate's key wrote a part, and that includes every other reader of the gate. So each password's envelope also lists the SHA-256 of every part it may read, the links it must find, the seal date and its remote flag. The envelope is sealed under that password's own key, so nobody else can change what it vouches for. A reader refuses anything that doesn't match.
- **Padding:** Padmé, with a 1 KiB minimum, so sizes reveal little.
- **Publishing** needs a token derived from the owner key. The host stores only its hash.

## What anyone can see

The bundle is public by design: `curl https://yourco.domain/bundle.json`, or run `locus verify`. It reveals:

- The address name, the version and when it was sealed.
- How many gates and passwords exist, and roughly how big each part is.
- How many groups of links cross between gates.
- Whether each password allows remote access.

Gate names, password names, company name, pieces, links, prices and readers' layouts are all sealed.

## What this does not protect against

- **What someone already read.** Revoking stops them reading anything published afterwards. They keep what they already have, including any old bundle they saved.
- **Delay.** A closed gate stays readable until you publish, and so does a deleted piece or a password with Remote access switched off. The app says so until you do. An edited piece's old words also stay readable until you publish, which the app shows as a change not yet published. Revoking publishes immediately, and so does making a reader a new password; if it can't reach the host, the app says the old password still works.
- **A dishonest host serving old versions.** It can't read anything, or change what a password it doesn't hold reads, but it could serve an older bundle, and a reader has no way to detect that yet. Publishing from a device that's behind is refused, so one device can't quietly undo a revoke made on another.
- **Your own browser.** The Studio keeps your map, passwords and optional Claude key in plain form in this browser's storage. Anyone with access to your browser profile has them.
- **Anthropic, if you shred with Claude.** Those files go to Anthropic under your own key. The no-AI shredder keeps everything on your device.
- **Prompt injection, entirely.** Documents are treated as data, and shredding can't grant itself authority: rules and MCP servers stay proposals until you approve them. Agent output separates approved rules from reference text, and a document can't forge a section. But until you reject it, a proposed rule's words reach anyone who can read its area, as reference, and a proposed server's name and summary do too, without its address. An agent reading reference text can still be influenced by it, because that's what reading is. Rejecting takes an item off the map, so it stops at your next update, and reading the same document again doesn't bring it back.
- **Secrets in unusual forms.** The scan finds common key formats in text, Word files and PDFs, and removes them before anything leaves. It will miss some. Images aren't scanned at all: a key in a screenshot goes to Anthropic if you shred with Claude, and can end up on the map.
- **Prices in ordinary text.** Prices go in a sealed field, and currency sentences are stripped from service pieces. A price written into some other document is just text in that document's gate.
- **Service names, to anyone with Money.** The Money gate lists every service's name and plan, including services in gates that password can't open. That's what makes the bill readable. File names are withheld.
- **Passwords in URLs.** The `/k/` form exists because Claude.ai connectors can't set headers. The host never logs paths and sends `Referrer-Policy: no-referrer`, but a URL can still end up in a proxy log or browser history. On Railway that includes the platform's HTTP logs, which record each request's path and can be read by the project's members. Prefer the `Authorization` header wherever the agent can send one.
- **Losing your owner key.** Nobody can recover it. That's the cost of a host that can't read your data.

## Running a public host

- On any public domain, run hosted mode (`--hosted`), even for a host that's yours alone (then with `--max-accounts 1`). Plain self-host mode has no account cap and no proof of work, and it takes 200 MB per map, so on a public domain anyone could claim names and fill the disk. [SELF-HOSTING.md](SELF-HOSTING.md) has the settings, including for Railway.
- Put it behind HTTPS and pass `--trust-proxy`. Passwords over plain HTTP are refused when the proxy reports them.
- Set `--proxy-hops` to the number of proxies you run in front (2 for Cloudflare and Caddy). Limits are per address, and only entries your own proxies added to `X-Forwarded-For` are believed. If this is wrong, one client can look like many.
- A remote read decrypts and may search a whole map, so each map is limited to 240 reads a minute in hosted mode. A large free account can still cost real CPU within that.
- Consider turning on Sign in with Google (below). In hosted mode it caps addresses per Google account, which stops a script better than the proof of work it replaces.
- **Free, encrypted hosting attracts abuse, and you can't inspect what's stored.** Hosted mode limits each account to 10 MB, which is about 3.7 MB of text because the owner's sealed copy doubles a map's size. It accepts only strictly valid bundles and serves them as JSON with `nosniff`, so it's a poor file host. Set `--abuse-contact`, and use `locus admin remove <name>` for takedowns. Take advice on your own legal position before opening a public instance.

## Signing in with Google

A host can offer **Sign in with Google**. It's off until you set it up, and it changes nothing about how a map is sealed.

**What it's for.** Who owns which address on a host, and nothing else. In hosted mode, with Google on, a new address needs a Google account, and each account can take a few (`--maps-per-account`, 3 unless you say otherwise). That replaces the proof of work, and it's a better limit: a script can do work cheaply, but not make Google accounts. On a new device, signing in lists the addresses your account took, so you only paste your recovery key.

**What it never touches.** Your map is still sealed on your device. The recovery key is still the only thing that decrypts the owner's copy, and the only thing that can publish changes to an address. A Google sign-in can do neither, and neither can Google. Updating an address you already have needs only its recovery key, signed in or not, so the CLI and your other devices work as they did. If you lose your Google account, you lose the list, not the map.

**What the host stores.** For each address claimed while signed in, a keyed hash of Google's id for that account: an HMAC-SHA-256 under the host's session secret, cut to 128 bits. Not your email and not your name. Without the secret nobody can link the hash to a Google account, and two hosts with different secrets get different hashes. Your name and email ride in your own browser's sign-in cookie, signed, so the page can show them back to you. The host never writes them down. `locus admin list` says whether an address was claimed with Google, and nothing more.

**What Google learns.** That you signed in to this host, and when, as with any site that uses Google sign-in. Not your address's name, your map or anything in it.

**What the host sees.** While you sign in, your name, email and Google's id pass through it in memory. It keeps only the hash.

**How it works.** Google's authorization code flow, with PKCE, a state and a nonce, all checked. The host exchanges the code with Google itself, over TLS, with its client secret, then checks the ID token's issuer, audience, expiry and nonce, and that the email is verified. The token comes straight from Google over that authenticated channel, so its signature isn't checked separately; Google's OpenID Connect documentation allows this. The session is a cookie that pages can't read (`HttpOnly`), that other sites can't send in the background (`SameSite=Lax`), sent only over HTTPS when the host is on HTTPS, signed with HMAC-SHA-256, and good for 30 days. Anything changed or out of date counts as signed out. Signing in works only at the host's own domain, never at an address on it, so a map's address never gets the cookie. Signing out needs a header a form can't send. Codes, tokens and cookies are never logged.

**The session secret.** It signs the cookies and keys the hashes. Set `LOCUS_SESSION_SECRET`, 32 characters or more, or let the host make one, once, and keep it in the data folder as `session-secret`, readable only by the host. Back it up with the maps. If it changes, everyone is signed out and the host forgets which Google account owns which address. The addresses still work, because recovery keys don't depend on it.

**Setting it up.**

1. In Google Cloud, under APIs & Services, set up the OAuth consent screen with the scopes `openid`, `email` and `profile`. Then, under Credentials, create an OAuth client of type **Web application**.
2. Add the authorised redirect URI `https://<domain>/api/auth/google/callback`: your domain itself, not an address on it. To try it locally, add `http://localhost:4747/api/auth/google/callback` too.
3. Give the host `LOCUS_GOOGLE_CLIENT_ID` and `LOCUS_GOOGLE_CLIENT_SECRET`. Set both or neither: one alone stops the host with the reason. Keep the secret in the environment rather than a flag, where anyone on the machine could see it in the process list.
4. Open `https://<domain>/api/info`. It should say `"google": true`, and in hosted mode `"signinToClaim": true`.

To see the whole flow without Google, `npm run preview:google` runs a local host with a stand-in Google that exists only in that script.

## Checking it yourself

```sh
locus verify https://yourco.domain              # what the host really holds
locus verify https://yourco.domain --key lcr_…  # what a password opens, and that tampering is refused
npm test                                         # the claims above, as tests
```

Look at the Studio's `Content-Security-Policy` response header: the page can reach its own host and `api.anthropic.com`, and nothing else.

## Reporting a problem

Open a private security advisory on the repository, at [https://github.com/supersonicsines/locus/security/advisories/new](https://github.com/supersonicsines/locus/security/advisories/new), rather than a public issue.
