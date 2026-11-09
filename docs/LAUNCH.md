# Launching on Railway

One service, one volume, two domains. The host has no runtime dependencies and no database, so this is the whole deployment. Railway's rules below were checked against its docs on 5 November 2026; check them again on the day.

The order matters. The npm name is claimed before anything public points at it, and the host goes up in hosted mode, with limits, even if you only mean to keep your own map there.

## 0. Decide first

These block a public launch. Each is the operator's call.

| Decision | Why it blocks | Default in the code |
| --- | --- | --- |
| **The npm name** | Every reader's connect step runs `npx -y <package> mcp …` with the reader's password in its environment. Whoever owns that name on npm runs code with that password. `locus` is someone else's package. | `locus-harness`, set once as `PACKAGE` in `src/core/agent.ts`. The command it installs is `locus`. It was unclaimed on 5 November 2026. |
| **The domain** | Every address is `<name>.<domain>`, and the Studio lives at the domain itself. | None. `example.com` below. |
| **Open to the public, or yours alone** | Hosted mode hands out free encrypted storage to strangers. | Take legal advice before opening it ([SECURITY.md](SECURITY.md), "Running a public host"). For yours alone, use hosted mode with one account, below. Never run the plain self-host mode on a public domain: it has no account cap, no proof of work and takes 200 MB per map, so a stranger could fill the volume. |
| **Logos** | 111 logos come from companies' own sites with no licence. | Run `node --experimental-strip-types scripts/build-logos.mjs --strip-official` before going public, or clear them. |
| **The donation address** | The slot exists and shows nothing until it's set. | Empty. |

## 1. Claim the npm name

From a clean clone:

```sh
npm ci
npm run typecheck && npm test        # 173 tests
npm run build
node dist/cli.mjs serve --port 4747  # open http://localhost:4747, See an example
npm pack --dry-run                   # dist, README, LICENSE, NOTICE, licenses, SECURITY.md, and nothing else
npm whoami
npm publish --access public          # prepublishOnly builds first
npx -y locus-harness --help          # from a machine that has never seen it
```

The CLI reads any Locus address, so publishing it before the host exists does no harm, and it means the connect step the host will show already works. Until this is done, never deploy: the host and the Studio both tell readers to run `npx -y locus-harness`.

**Every release after the first** goes through `.github/workflows/release.yml`: bump `version` in `package.json` and move the changelog's Unreleased notes under it, merge, then publish a GitHub release tagged `v<version>`. The workflow runs the tests and waits for the owner's approval in the `npm` environment, then publishes with npm's trusted publishing, so no npm token is stored anywhere and the package carries provenance. For that, the package's settings on npmjs.com need a trusted publisher: GitHub Actions, `supersonicsines/locus`, workflow `release.yml`, environment `npm`.

## 2. The service

1. **Create the project.** From GitHub once the repo is there (Railway redeploys on every push to `main`), or from a clone today with `railway init` and `railway up`. Railway finds the `Dockerfile` and builds with it. `railway up` leaves out what `.gitignore` lists, so the 5 GB `qa/` folder never uploads; `.dockerignore` keeps it out of the image as well. CI builds and starts the same image on every push, so a build that fails there will fail here too.
2. **Attach a volume** to the service with the mount path `/data`. The image sets `LOCUS_DATA=/data`.
3. **Variables:**

   | Variable | Value | Why |
   | --- | --- | --- |
   | `RAILWAY_RUN_UID` | `0` | Railway mounts volumes as root, and the image runs as `node`, which couldn't write there otherwise |
   | `LOCUS_DOMAIN` | `example.com` | Addresses become `https://<name>.example.com` |
   | `LOCUS_TRUST_PROXY` | `1` | Railway's edge terminates HTTPS. Without this the host can't tell HTTPS from HTTP and refuses remote passwords |
   | `LOCUS_PROXY_HOPS` | `2` | Measured on 9 November 2026: Railway's edge throws away any `X-Forwarded-For` the client sends and passes `<client>, <its own hop>`, so the client is second from the right. With `1` every visitor would share the edge's address and one allowance. `3` if Cloudflare proxies in front (not recommended, below). Check again with a header-echo service if limits ever seem shared |
   | `LOCUS_HOSTED` | `1` | Always, on a public domain: it's what turns on the limits |
   | `LOCUS_MAX_ACCOUNTS` | `1` for yours alone, `500` for a public one | With `1`, your first publish claims the only name and nobody else can claim one. Public accounts are 10 MB each, so 500 needs a volume of at least 5 GB; Pro volumes start at 50 GB. Leftover `.tmp` files from an interrupted publish can double that at worst |
   | `LOCUS_POW_BITS` | `18` | The proof of work for a new address: about 2½ s in a laptop's browser. It slows a script down; the cap below is what stops one |
   | `LOCUS_CLAIMS_PER_HOUR` | `30` | New addresses the whole host gives out in an hour, however many connections ask. With 500 accounts, filling them takes at least 17 hours |
   | `LOCUS_ABUSE_CONTACT` | an inbox you read | Shown to anyone reporting a map. Required in practice for a public host |
   | `LOCUS_DONATE_URL` | when there is one | Optional |
   | `LOCUS_GOOGLE_CLIENT_ID` | from Google Cloud, optional | Turns on Sign in with Google. With `LOCUS_HOSTED=1`, a new address then needs a Google account, instead of a proof of work. Set both Google values or neither ([SECURITY.md](SECURITY.md), "Signing in with Google") |
   | `LOCUS_GOOGLE_CLIENT_SECRET` | from Google Cloud, with the ID | The other half. Set it here, never as a flag |
   | `LOCUS_MAPS_PER_ACCOUNT` | `3` | With Google on in hosted mode, how many addresses one Google account can take |
   | `LOCUS_SESSION_SECRET` | optional, 32 characters or more | Signs sign-in cookies and keys the account hashes. Unset, the host makes one in `/data`, which the volume keeps. Changing it signs everyone out and forgets which account owns which address |

   For Google, the OAuth client's authorised redirect URI is `https://example.com/api/auth/google/callback`. Signing in works only at `example.com` itself, so on the generated `*.up.railway.app` domain it's off, and with Google on, new addresses can only be claimed at your own domain.

   `PORT` is set by Railway, and the host reads it. A switch is off only for `0`, `false`, `no` or `off`; any other value is on, so a typo leaves the limits on. A number that isn't one stops the host with the reason, rather than quietly removing a limit.
4. **Settings:** healthcheck path `/api/info`, restart policy On failure, and serverless (sleeping) off, so the first agent request of the day isn't a cold start.
5. **Domains.** Start with the generated `*.up.railway.app` domain to check the deploy; the Studio works there, and maps are at `/s/<name>/`. Then add two custom domains:
   - `example.com`, for the Studio. Your DNS host needs CNAME flattening or ALIAS records; Cloudflare's DNS has them.
   - `*.example.com`, for every address. Railway gives two CNAMEs and a TXT record. The wildcard doesn't verify without the TXT, and its certificate isn't issued without the `_acme-challenge` CNAME.

   **Use DNS only, without Cloudflare's proxy.** A proxy terminates TLS, so it would see every password sent in a header or a `/k/` URL and every page a remote read returns. With DNS only, TLS ends at Railway's edge, and the host is the only one decrypting. If you proxy anyway, set SSL/TLS to Full (Full (Strict) doesn't work with Railway), leave `_acme-challenge` unproxied, and set `LOCUS_PROXY_HOPS=2`.

## 3. Check it, in this order

```sh
curl -s https://example.com/api/info
#  "mode": "hosted", "address": "https://{name}.example.com" — https here proves the proxy settings are right
curl -sI https://example.com/ | grep -i -E 'content-security-policy|referrer-policy'
```

Then, in a browser:

1. Open `https://example.com`, choose **See an example**, and check the map draws, zooms with the wheel and opens an item.
2. Start your own map, add one reader, go live under the name you'll keep, and save the recovery key. With `LOCUS_MAX_ACCOUNTS=1` this is the one account; for a public host, use a throwaway name such as `launch-check` and remove it at the end.
3. Open `https://<name>.example.com`, unlock it with the reader's password, and check it shows only that reader's areas.
4. From another machine: `npx -y locus-harness verify https://<name>.example.com --key lcr_…`. It should say the host holds only ciphertext and that a changed byte was refused.
5. Connect Claude Code with the command the reader's panel gives, and ask it something only that map knows. This is the first real test of an agent reading a hosted address over the internet.
6. Redeploy once from the dashboard and check the map is still there, which proves the volume.
7. For a public host, remove the throwaway: `railway ssh`, then `node dist/cli.mjs admin remove launch-check`.

## 4. Running it

- **Backups.** Turn on Railway's scheduled backups for the volume. A sealed map can't be recovered by anyone but its owner, but the files can still be lost.
- **Deploys cost a short outage.** Railway never lets two deployments mount one volume, so each redeploy drops requests for a few seconds to about a minute. Deploy at quiet times. A local `locus mcp` reader rides through: when the host is away it keeps answering from the last copy it read, and tries again on the next request. Remote readers see errors until it's back.
- **One replica.** Replicas can't share a volume. One small instance is plenty: an idle host is tens of MB, and in hosted mode each map is limited to 240 remote reads a minute.
- **Spend.** An idle host is tens of MB of memory and almost no CPU, and volume storage is $0.15 per GB a month. Bandwidth is what an abuser could run up, so `bundle.json` and the Studio's files have a per-client budget, unchanged bundles are answered with a 304, and text files are sent compressed. Set a hard usage limit in Railway's billing anyway: past it Railway stops the service rather than the bill growing.
- **Takedowns.** `railway ssh`, then `node dist/cli.mjs admin list` and `node dist/cli.mjs admin remove <name>`. Answer the abuse inbox.
- **Rolling back.** Redeploy an earlier deployment from Railway's list. The sealed format is `locus/1`. Maps sealed before the rename, as `vadere/1`, can't be read by this version; none were ever published.

## 5. What this doesn't cover

- A professional security audit. Two AI reviews have been done ([PRD-QA.md](PRD-QA.md), and the Locus pass's audit in [design/qa-rounds.md](design/qa-rounds.md)).
- Real users. Watch the first few set up a map without help before announcing widely.
- Railway itself sits in front of the host and terminates TLS. Remote reads already require trusting the host ([SECURITY.md](SECURITY.md)); on Railway, that host includes Railway.
