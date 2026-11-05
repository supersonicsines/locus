# Launching on Railway

One service, one volume, two domains. The host has no runtime dependencies and no database, so this is the whole deployment. Railway facts below were checked against its docs on 5 November 2026; check them again on the day.

## 0. Decide first

These block a public launch. Each is the operator's call.

| Decision | Why it blocks | Default in the code |
| --- | --- | --- |
| **The npm name** | Every reader's connect step runs `npx -y <package> mcp …`. `locus` on npm is someone else's package, so commands must never say `npx locus`. | `locus-harness`, set once as `PACKAGE` in `src/core/agent.ts`. The command it installs is `locus`. |
| **The domain** | Every address is `<name>.<domain>`, and the Studio lives at the domain itself. | None. `example.com` below. |
| **Hosted or self-host only** | Hosted mode hands out free encrypted storage to strangers. | Take legal advice first ([SECURITY.md](SECURITY.md), "Running a public host"). Launching self-host only, with your own map on your own host, needs none of section 4's limits. |
| **Logos** | 111 logos come from companies' own sites with no licence. | Run `node --experimental-strip-types scripts/build-logos.mjs --strip-official` before going public, or clear them. |
| **The donation address** | The slot exists and shows nothing until it's set. | Empty. |

## 1. Before deploying

From a clean clone:

```sh
npm ci
npm run typecheck && npm test        # 140 tests
npm run build
node dist/cli.mjs serve --port 4747  # open http://localhost:4747, See an example
npm pack --dry-run                   # dist, README, LICENSE, NOTICE, licenses, SECURITY.md, and nothing else
```

The Docker image has never been built locally (see [STATUS.md](STATUS.md)). Railway's first build is its first real build, so read that build's log.

## 2. The service

1. **Create the project.** From GitHub once the repo is there (Railway redeploys on every push to `main`), or from a clone today with `railway init` and `railway up`. Railway finds the `Dockerfile` and builds with it. `qa/` is in `.dockerignore`, so the 5 GB harness never uploads.
2. **Attach a volume** to the service with the mount path `/data`. The image already sets `LOCUS_DATA=/data`.
3. **Variables:**

   | Variable | Value | Why |
   | --- | --- | --- |
   | `RAILWAY_RUN_UID` | `0` | Railway mounts volumes as root, and the image runs as `node`, which couldn't write there otherwise |
   | `LOCUS_DOMAIN` | `example.com` | Addresses become `https://<name>.example.com` |
   | `LOCUS_TRUST_PROXY` | `1` | Railway's edge terminates HTTPS. Without this the host can't tell HTTPS from HTTP and refuses remote passwords |
   | `LOCUS_PROXY_HOPS` | `1` | Railway's edge only. `2` if Cloudflare proxies in front (not recommended, below) |
   | `LOCUS_HOSTED` | `1` | Only for the free hosted mode |
   | `LOCUS_MAX_ACCOUNTS` | `400` | Hosted accounts are 10 MB each and a Hobby volume is 5 GB, so 500 would fill it to the byte. Raise it with the volume on Pro |
   | `LOCUS_ABUSE_CONTACT` | an inbox you read | Shown to anyone reporting a map. Required in practice for hosted mode |
   | `LOCUS_DONATE_URL` | when there is one | Optional |

   `PORT` is set by Railway, and the host reads it. On/off variables take `1`, `true`, `yes` or `on`; anything else is off.
4. **Settings:** healthcheck path `/api/info`, restart policy On failure, and serverless (sleeping) off, so the first agent request of the day isn't a cold start.
5. **Domains.** Start with the generated `*.up.railway.app` domain to check the deploy; the Studio works there, and maps are at `/s/<name>/`. Then add two custom domains, which is exactly what Hobby allows per service:
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
2. Start a small map of your own, add one reader, go live as `launch-check`, and copy the recovery key.
3. Open `https://launch-check.example.com`, unlock it with the reader's password, and check it shows only that reader's areas.
4. From another machine: `node dist/cli.mjs verify https://launch-check.example.com --key lcr_…` (or `npx -y locus-harness verify …` once it's on npm). It should say the host holds only ciphertext and that tampering is refused.
5. Connect Claude Code with the command the reader's panel gives, and ask it something only that map knows. This is the first real test of an agent reading a hosted address over the internet.
6. Redeploy once from the dashboard and check `launch-check` is still there, which proves the volume.
7. Remove it: `railway ssh`, then `node dist/cli.mjs admin remove launch-check`.

## 4. Publish the package

After the checks pass:

```sh
npm whoami
npm publish --access public   # prepublishOnly builds first
npx -y locus-harness --help   # from a machine that has never seen it
```

Until this is done, the default connect step in the Studio fails for everyone who isn't running from a clone.

## 5. Running it

- **Backups.** Turn on Railway's scheduled backups for the volume. A sealed map can't be recovered by anyone but its owner, but the files can still be lost.
- **Deploys cost a short outage.** Railway never lets two deployments mount one volume, so each redeploy drops requests for a few seconds to about a minute. Deploy at quiet times. A local `locus mcp` reader rides through, because it rereads at most once a minute.
- **One replica.** Replicas can't share a volume. One small instance is plenty: an idle host is tens of MB, and in hosted mode each map is limited to 240 remote reads a minute.
- **Spend.** Hobby is $5 a month, usage included up to $5; volume storage is $0.15 per GB a month. Set a usage limit in Railway's billing so a busy month can't surprise you.
- **Takedowns.** `railway ssh`, then `node dist/cli.mjs admin list` and `node dist/cli.mjs admin remove <name>`. Answer the abuse inbox.
- **Rolling back.** Redeploy an earlier deployment from Railway's list. The sealed format is `locus/1`, and every version so far reads it.

## 6. What this doesn't cover

- A professional security audit. One AI review has been done ([PRD-QA.md](PRD-QA.md)).
- Real users. Watch the first few set up a map without help before announcing widely.
- Railway itself sits in front of the host and terminates TLS. Remote reads already require trusting the host ([SECURITY.md](SECURITY.md)); on Railway, that host includes Railway.
