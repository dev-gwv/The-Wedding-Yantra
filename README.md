# Wedding Yantra

pnpm + Turborepo monorepo.

| Path | What | Deploys to |
|---|---|---|
| `apps/web` | Next.js 15 dashboard (App Router, Tailwind v4) | Vercel |
| `apps/api` | Fastify 5 + PostgreSQL API | Hostinger VPS (Docker Compose) |
| `packages/types` | `@wedding-yantra/types`, the shared API contracts | — |

## Local development

```bash
corepack enable            # or: npm i -g pnpm@10
pnpm install
pnpm db:up                 # Postgres on 127.0.0.1:5433 (docker-compose.dev.yml)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm dev                   # web :3000, api :4000
```

`pnpm lint`, `pnpm typecheck` and `pnpm build` run across the whole workspace via Turbo.

## Deployment

- **CI** (`.github/workflows/ci.yml`): lint, typecheck and build on every PR. It also builds the API
  Docker image and checks that `docker-compose.prod.yml` publishes no host ports.
- **Backend** (`.github/workflows/deploy-vps.yml`): on push to `main` touching the API, it rsyncs to
  `/opt/wedding-yantra`, runs `docker compose up -d --build` scoped to the `wedding-yantra` project,
  and waits for the health check to pass.
- **Frontend**: Vercel Git integration, Root Directory `apps/web`.

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for VPS setup and reverse-proxy options
(NPM / Traefik / Caddy / host nginx).
