# Running your own Locus

Locus is one small Node program with no runtime dependencies and no database. A map is a folder holding a sealed bundle and a hash. You can run it on your laptop, on any server with Docker, or on Railway.

Running your own is also the strongest way to use it: the page that decrypts your map in a reader's browser comes from your own server, so nobody else could change it ([SECURITY.md](SECURITY.md), "Who can read what").

## Pick one

| You want | Do this |
| --- | --- |
| To try it, or to keep a map on your own machine | [On your computer](#on-your-computer) |
| Your own host on a domain, on a server you control | [With Docker Compose and Caddy](#with-docker-compose-and-caddy) |
| Your own host on a domain, with nothing to maintain | [On Railway](#on-railway) |

Whichever you pick, read [Before it's public](#before-its-public).

## On your computer

You need Node 22 or later.

```sh
npx -y locus-harness serve
```

Open http://localhost:4747. Maps are stored in `~/.locus` (`--data` to change it). Every address works at `http://<name>.localhost:4747`, and at `http://localhost:4747/s/<name>/` for Safari, which doesn't resolve `*.localhost`.

From a clone instead: `npm ci && npm run build && npm start`.

## With Docker Compose and Caddy

For a Linux server with Docker, a domain, and ports 80 and 443 open.

1. **DNS.** Point both `example.com` and `*.example.com` at the server: an A record for each, or a CNAME for the wildcard.
2. **Settings.** In a clone of the repo:
   ```sh
   cp .env.example .env    # then set LOCUS_DOMAIN, and LOCUS_ABUSE_CONTACT if others will use it
   ```
3. **Start it.**
   ```sh
   docker compose --profile public up -d
   ```
   Caddy gets a certificate for `example.com` and for each address the first time someone visits it, so there's no wildcard certificate to manage and no DNS plugin. It asks Locus first (`/api/tls/ask`), and Locus says yes only for its own domain and for addresses someone has claimed.
4. **Check it.**
   ```sh
   curl -s https://example.com/api/info     # "mode": "hosted", and an address starting https://
   ```
   Then open `https://example.com`, make a map, go live, and open the address it gives you.

`docker compose up -d` without the profile runs Locus alone at `http://localhost:4747`, reachable only from that machine.

Behind a proxy of your own instead of Caddy, run the image with `LOCUS_TRUST_PROXY=1` and `LOCUS_PROXY_HOPS` set to the number of proxies in front of it, terminate HTTPS at the proxy, and send both the domain and its wildcard to port 4747.

## On Railway

Railway builds the repo's `Dockerfile` and runs it with a volume, so there's no server to maintain. One service, one volume, two domains.

1. **Create a project** from your fork of the repo (or `railway init` and `railway up` from a clone). Railway finds the `Dockerfile`.
2. **Attach a volume** with the mount path `/data`.
3. **Set the variables:**

   | Variable | Value |
   | --- | --- |
   | `RAILWAY_RUN_UID` | `0` (Railway mounts volumes as root) |
   | `LOCUS_DOMAIN` | `example.com` |
   | `LOCUS_HOSTED` | `1` |
   | `LOCUS_MAX_ACCOUNTS` | `1` for a host that's yours alone |
   | `LOCUS_TRUST_PROXY` | `1` |
   | `LOCUS_PROXY_HOPS` | `1` |
   | `LOCUS_ABUSE_CONTACT` | an inbox you read, if others will use it |

4. **Settings:** healthcheck path `/api/info`, restart On failure, and serverless off.
5. **Domains:** add `example.com` and `*.example.com` as custom domains, and create the DNS records Railway shows you (the wildcard needs its TXT record and the `_acme-challenge` CNAME). Use DNS only, not a CDN that decrypts.
6. **Check it:** `curl -s https://example.com/api/info` should say `"mode": "hosted"` and an address starting `https://`.

Each redeploy drops requests for a few seconds while the volume moves to the new deployment, so deploy at quiet times, and turn on Railway's volume backups.

## Before it's public

Every one of these matters on a host anyone on the internet can reach.

- **Hosted mode, always.** `LOCUS_HOSTED=1`. Plain self-host mode has no account cap and no proof of work, and it takes 200 MB per map, so on a public domain anyone could claim names and fill your disk. For a host that's yours alone, `LOCUS_MAX_ACCOUNTS=1`: your first "Go live" takes the only address. The Compose file sets both.
- **HTTPS, and the proxy settings to match.** `LOCUS_TRUST_PROXY=1` and the right `LOCUS_PROXY_HOPS` (1 for Caddy or Railway alone, 2 for Cloudflare in front of Caddy). Without them the host can't tell HTTPS from HTTP and refuses passwords sent to it; with the hops wrong, rate limits can be dodged or turned on the wrong people.
- **Don't proxy through a CDN that decrypts.** A CDN that terminates TLS, such as Cloudflare's orange cloud, sees every password sent in a header or a `/k/` URL. Use DNS only.
- **Back up the data folder** (`/data` in the image, `~/.locus` by default). It holds the sealed maps and `session-secret`, which signs sign-in cookies and decides which Google account owns which address. Lose it and everyone is signed out; addresses keep working by recovery key.
- **Keep it up to date.** Watch the repository's releases. Upgrading is pulling and rebuilding: `git pull && docker compose --profile public up -d --build`. The data folder carries over.
- **For a public host,** set `LOCUS_ABUSE_CONTACT`, read "Running a public host" in [SECURITY.md](SECURITY.md), and take advice on your own legal position. Free encrypted storage attracts abuse, and you can't see what's stored. Take a map down with `docker compose exec locus node dist/cli.mjs admin remove <name>`.

## Sign in with Google (optional)

With it on, someone signs in with Google to claim an address, each account can claim `LOCUS_MAPS_PER_ACCOUNT` addresses (3 by default), and on a new device they see their maps listed and only paste the recovery key. Proof of work isn't needed. The host stores a keyed hash of each Google account's id and nothing else about them; Google never sees a map or a recovery key. Details: [SECURITY.md](SECURITY.md), "Signing in with Google".

1. In the Google Cloud console, create a project, then **APIs & Services → OAuth consent screen**: an external app with your domain, and the scopes `openid`, `email` and `profile`.
2. **Credentials → Create credentials → OAuth client ID**, type **Web application**, with the authorised redirect URI `https://example.com/api/auth/google/callback`.
3. Set `LOCUS_GOOGLE_CLIENT_ID` and `LOCUS_GOOGLE_CLIENT_SECRET` (both, or neither) and restart.

Sign-in works only at the domain itself, never on an address. To try the flow without Google, `npm run preview:google` runs a host with a stand-in Google on port 4760.

## Without wildcard DNS

Every address also works at `https://example.com/s/<name>/`. Readers and agents can use that form, and the host needs only the one name and one certificate.

## Every setting

`locus serve --help` lists them. Each flag can also be an environment variable, `LOCUS_` and the flag's name in capitals: `--max-accounts` is `LOCUS_MAX_ACCOUNTS`. A switch is off only for `0`, `false`, `no` or `off`, so a typo leaves limits on, and a number that isn't one stops the host with the reason.
