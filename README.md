# Wedding Yantra

One app for every wedding business in India (makeup, decor, photography, catering, DJ,
planning, gifting and more) to run enquiries, bookings, bills, payments and their team.

- **Product plan:** [docs/PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md): what we are building, in which order, and why.
- **Deployment:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## How the code is organised

The API is the product. The web app is one screen on top of it, and the future Android /
iPhone app (Expo) will be another. Everything that is not a screen lives in a shared
package that both apps import.

| Path | What | Runs on |
|---|---|---|
| `apps/api` | Fastify 5 + PostgreSQL. All business rules and permissions. Routes under `/api/v1`. | Hostinger VPS (Docker Compose) |
| `apps/web` | Next.js 16 web app, installable on phones (PWA). Screens only. | Vercel |
| `packages/types` | Zod schemas for every request and response | API, web, mobile |
| `packages/core` | Pure helpers: phone numbers, ₹ formatting, dates, role permissions | API, web, mobile |
| `packages/api-client` | Typed API client + TanStack Query hooks, no browser-only code | web, mobile |
| `packages/design-tokens` | Marigold & Ivory colours, radii, type scale | web (Tailwind), mobile |

Rules that keep the mobile app easy later:

1. No business logic in `apps/web`. If a number is calculated, the API calculates it.
2. Sign-in uses a bearer token (`Authorization: Bearer …`), never cookies, so any app can call the API.
3. Colours only come from `packages/design-tokens`. Tailwind's default palette is switched off.
4. Every table holding a business's data has `workspace_id`; every workspace route calls `requireMember` first.

## Local development

```bash
corepack enable            # or: npm i -g pnpm@10
pnpm install
pnpm db:up                 # Postgres on 127.0.0.1:5433 (docker-compose.dev.yml)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm dev                   # web :3000, api :4000
```

Open http://localhost:3000 and sign in with any mobile number. Locally the 6-digit code is
shown on screen (`AUTH_OTP_DEV_ECHO=true`) because no SMS/WhatsApp provider is connected yet.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm build
pnpm --filter @wedding-yantra/core test
TEST_DATABASE_URL=postgres://…/throwaway_db pnpm --filter @wedding-yantra/api test   # wipes that database
DATABASE_URL=postgres://…/throwaway_db bash scripts/api-smoke.sh
```

## Deployment

- **CI** (`.github/workflows/ci.yml`): lint, typecheck and build; unit tests; API integration
  tests and the smoke test against a real Postgres; API Docker image and compose checks.
- **Backend** (`.github/workflows/deploy-vps.yml`): on push to `main` touching the API or its
  packages, deploys to the VPS with a backup first and **automatic rollback** if unhealthy.
- **Frontend**: Vercel Git integration, Root Directory `apps/web`.

Database changes go in `apps/api/migrations`
(`pnpm --filter @wedding-yantra/api migration:new <name>`; read
[apps/api/migrations/README.md](apps/api/migrations/README.md) first).
