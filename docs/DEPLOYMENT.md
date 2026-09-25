# Wedding Yantra — Deployment Guide

```
                ┌───────────────────── Hostinger VPS ─────────────────────────┐
 Browser ──▶ Vercel (apps/web)                                                 │
    │                                                                          │
    └──HTTPS──▶ :443  [ existing reverse proxy ]  ◀── owns 80/443 (unchanged)  │
                       │          │                                            │
               network: web-proxy (external, shared)                           │
                       │          │                                            │
              existing-app   wedding-yantra-api:4000   (expose only, no ports) │
                                  │                                            │
                     network: wedding-yantra-internal (internal: true)         │
                                  │                                            │
                          wedding-yantra-db:5432       (no route in or out)    │
                └──────────────────────────────────────────────────────────────┘
```

Wedding Yantra **never** binds 80, 443, 4000 or 5432 on the host. It only joins the
proxy's network and lets the proxy route `api.weddingyantra.com → wedding-yantra-api:4000`.

---

## 1. One-time VPS setup

```bash
# As root: a dedicated deploy user that can run docker
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /opt/wedding-yantra && chown deploy:deploy /opt/wedding-yantra

# As deploy: authorise the GitHub Actions key
su - deploy
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "ssh-ed25519 AAAA... github-actions-wedding-yantra" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Production env (never committed, never overwritten by deploys)
cd /opt/wedding-yantra
# copy .env.example from the repo, then fill in real values:
nano .env
chmod 600 .env
```

### Find out what the existing app uses

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
docker network ls
ss -tlnp | grep -E ':(80|443|5432|5433|4000)\b'
```

- A container like `nginx-proxy-manager`, `traefik` or `caddy` publishing `0.0.0.0:80/443` → **Option A**
- The existing app's own container publishing 80/443 → **Option B**
- Host-level `nginx` (systemd, not Docker) on 80/443 → **Option B2**

---

## 2. Option A — you already run NPM, Traefik or Caddy

### A.1 Shared network

If the proxy already sits on a user-defined network, set `PROXY_NETWORK=<that name>` in
`.env` and you're done. Otherwise create one and attach the proxy. `docker network connect`
is hot: **the proxy is not restarted**.

```bash
docker network create web-proxy
docker network connect web-proxy <proxy-container-name>
```

> To make that survive the proxy's own `docker compose up`, add `web-proxy` as an
> `external: true` network in **the proxy's** compose file the next time you touch it.

### A.2 Route the hostname

**Nginx Proxy Manager** (UI → Hosts → Proxy Hosts → Add):

| Field | Value |
|---|---|
| Domain Names | `api.weddingyantra.com` |
| Scheme | `http` |
| Forward Hostname / IP | `wedding-yantra-api` |
| Forward Port | `4000` |
| Block Common Exploits | on |
| SSL tab | Request a new Let's Encrypt certificate, Force SSL, HTTP/2 |

**Traefik / Coolify**: the `labels:` on `wedding-yantra-api` are already active. In `.env`,
set `API_HOST` and set `PROXY_NETWORK` to Traefik's network (`coolify` on a Coolify server).
The defaults (`http`/`https` entrypoints, `letsencrypt` resolver) match Coolify. Check yours with:

```bash
docker inspect coolify-proxy --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
docker inspect coolify-proxy --format '{{join .Config.Cmd "\n"}}' | grep -E 'entrypoints\.|certificatesresolvers\.[a-z]+\.acme\.httpchallenge=|exposedbydefault'
```

If the names differ, set `TRAEFIK_HTTPS_ENTRYPOINT`, `TRAEFIK_HTTP_ENTRYPOINT` or
`TRAEFIK_CERT_RESOLVER` in `.env`. Traefik picks the labels up live; neither Coolify nor
its proxy restarts. Coolify doesn't manage these containers, so they won't appear as
Coolify resources. That's expected.

**Caddy** (existing container): add this to its Caddyfile, then `docker exec <caddy> caddy reload --config /etc/caddy/Caddyfile`:

```caddy
api.weddingyantra.com {
	encode zstd gzip
	reverse_proxy wedding-yantra-api:4000
}
```

---

## 3. Option B — existing app binds 80/443 directly (no proxy yet)

Only one process can own :443. You have to put a small shared gateway in front of both
apps. The Wedding Yantra side needs no changes, but this is a **one-time, planned change to
the existing app** (downtime is a few seconds while ports move).

```bash
docker network create web-proxy
# 1. Attach the existing app to the shared network (hot, no restart)
docker network connect web-proxy <existing-app-container>

# 2. Stand up the gateway from its OWN directory
mkdir -p /opt/gateway && cp infra/gateway/{docker-compose.yml,Caddyfile} /opt/gateway/
#    edit /opt/gateway/Caddyfile: add the existing app's hostname -> container:port

# 3. Cut-over (the few-seconds window)
#    a) remove `ports: - 80:80 / 443:443` from the existing app's compose file,
#       add `web-proxy` as an external network there, and `docker compose up -d` it
#    b) cd /opt/gateway && docker compose up -d
```

Caddy issues certificates for both hostnames automatically. Test the existing app's
hostname first, then deploy Wedding Yantra.

### Option B2 — host-level nginx already on 80/443

Keep host nginx. Publish the API on **loopback only** with a local override that stays on
the server (`docker-compose.override.yml` is *not* picked up automatically because we
always pass `-f`; name it explicitly):

```yaml
# /opt/wedding-yantra/docker-compose.loopback.yml  (server-only, not in git)
services:
  wedding-yantra-api:
    ports:
      - "127.0.0.1:4001:4000"
```

```nginx
# /etc/nginx/sites-available/api.weddingyantra.com
server {
    server_name api.weddingyantra.com;
    location / {
        proxy_pass http://127.0.0.1:4001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
# then: ln -s ../sites-available/api.weddingyantra.com /etc/nginx/sites-enabled/
#       certbot --nginx -d api.weddingyantra.com && nginx -t && systemctl reload nginx
```

In `.github/workflows/deploy-vps.yml`, change `COMPOSE=` to add
`-f docker-compose.loopback.yml`. With B2 the `web-proxy` network is still required by the
compose file; `docker network create web-proxy` once and leave it empty.

---

## 4. No domain yet? Use sslip.io

The Vercel site is HTTPS, and browsers block it from calling a plain `http://<ip>` API
(mixed content), so the API needs an HTTPS hostname. [sslip.io](https://sslip.io) gives you
one with no sign-up: `api.203-0-113-10.sslip.io` resolves to `203.0.113.10`.

- Hostname: `api.<your-ip-with-dashes>.sslip.io`. Use it everywhere this guide says
  `api.weddingyantra.com` (proxy host, Let's Encrypt, Vercel env var), and skip the DNS record.
- GitHub → Settings → Secrets and variables → Actions → **Variables**:
  `API_PUBLIC_URL=https://api.<your-ip-with-dashes>.sslip.io`

When you buy a domain, you switch over without changing any code:

1. Add an `A api → <VPS IP>` record.
2. Add the new hostname to the proxy host (or create a new one) and request a certificate.
3. Update `NEXT_PUBLIC_API_URL` in Vercel and **Redeploy**.
4. Update `API_PUBLIC_URL` in GitHub.
5. Add the new web origins to `CORS_ORIGINS`.

sslip.io is a free third-party DNS service. It's fine for getting started, but use your own
domain for real customers.

## 5. DNS & Vercel

- DNS: `A api.weddingyantra.com → <VPS IP>` (keep the Cloudflare proxy **off** until the cert is issued).
- Vercel → New Project → import the repo → **Root Directory: `apps/web`**.
  `apps/web/vercel.json` already installs from the monorepo root and builds through Turbo.
- Vercel env var: `NEXT_PUBLIC_API_URL=https://api.weddingyantra.com` (Production and Preview).
- Add the production web origin(s) to `CORS_ORIGINS` in the VPS `.env`. Preview URLs are
  matched by `CORS_VERCEL_PREVIEW_PATTERN`; adjust the prefix to your Vercel project/team slug.

## 6. GitHub Actions secrets

| Name | Kind | Value |
|---|---|---|
| `VPS_HOST` | secret | VPS IP / hostname |
| `VPS_USER` | secret | `deploy` |
| `VPS_SSH_KEY` | secret | private key (`ssh-keygen -t ed25519 -f wy_deploy -N ""`) |
| `VPS_KNOWN_HOSTS` | secret | `ssh-keyscan -p 22 <VPS_HOST>` |
| `VPS_PORT` | variable | optional, default `22` |
| `VPS_APP_DIR` | variable | optional, default `/opt/wedding-yantra` |
| `API_PUBLIC_URL` | variable | public HTTPS base URL of the API, for the post-deploy smoke test |

Create a GitHub **Environment** named `production` if you want a manual approval gate.

---

## 7. Why the deploy can't disturb the other app

| Risk | Mitigation |
|---|---|
| Port clash | Prod compose publishes **no** host ports; CI fails if any `ports:` appear. |
| Touching other containers | Fixed project name `wedding-yantra`; `--remove-orphans` is project-scoped. |
| Network teardown | `web-proxy` is `external: true`, so compose never creates or deletes it. |
| DB exposure | `wedding-yantra-internal` is `internal: true`: no ingress, no egress. |
| Resource starvation | CPU/memory limits on both services; json-file log rotation. |
| Disk cleanup | Image prune is filtered by `label=com.weddingyantra.project=wedding-yantra`. **Never** run `docker system prune` on this host. |
| Files | rsync targets only `$VPS_APP_DIR`; `.env` and `backups/` are excluded from `--delete`. |

**About the API's own downtime:** the image is built while the old container keeps serving,
then `up -d` swaps it. That's typically a 2–5 s gap for the API only. The DB is left alone
unless its definition changed. If you later need true zero-downtime for the API, run two
replicas behind the proxy or move to blue/green. The builds also use VPS CPU; if that ever
bothers the other app, build in Actions, push to GHCR, and have the VPS `pull` instead.

## 8. Operations cheat-sheet

```bash
cd /opt/wedding-yantra
C="docker compose -p wedding-yantra -f docker-compose.prod.yml"

$C ps
$C logs -f --tail=200 wedding-yantra-api
$C exec wedding-yantra-db psql -U "$(grep ^POSTGRES_USER= .env | cut -d= -f2)" wedding_yantra

# Backup (to backups/, which deploys never delete)
mkdir -p backups
$C exec -T wedding-yantra-db pg_dump -U wedding_yantra wedding_yantra | gzip > backups/wy-$(date +%F).sql.gz

# Temporary DB access from your laptop via SSH tunnel (loopback 5433 only)
docker compose -p wedding-yantra -f docker-compose.prod.yml -f docker-compose.db-access.yml up -d
ssh -N -L 5433:127.0.0.1:5433 deploy@<VPS_HOST>
# ...when finished, run the normal `up -d` again to drop the port.

# Rollback to a previous image (tags are commit SHAs, kept for 7 days)
docker images wedding-yantra-api
APP_VERSION=<old-sha> $C up -d --no-build wedding-yantra-api
```
