# syntax=docker/dockerfile:1.7
#
# Multi-stage build for @wedding-yantra/api inside the Turborepo monorepo.
# The build context MUST be the repo root:
#   docker build -f apps/api/Dockerfile -t wedding-yantra-api .

ARG NODE_VERSION=22-alpine
ARG PNPM_VERSION=10.15.0
ARG TURBO_VERSION=2.11.4

# ---- base -------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
RUN apk add --no-cache libc6-compat \
 && npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app

# ---- prune: keep only the api and its workspace deps ------------------------
FROM base AS pruner
ARG TURBO_VERSION
RUN npm install -g turbo@${TURBO_VERSION}
COPY . .
RUN turbo prune @wedding-yantra/api --docker

# ---- build ------------------------------------------------------------------
FROM base AS builder
# 1) Manifests + pruned lockfile only: this layer stays cached until deps change
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=wy-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

# 2) Source, then build (turbo builds @wedding-yantra/types first via ^build)
COPY --from=pruner /app/out/full/ .
# `turbo prune` doesn't carry root-level tsconfig files; the packages extend it.
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
RUN pnpm turbo run build --filter=@wedding-yantra/api

# 3) Self-contained production bundle: api dist + prod node_modules.
#    Workspace deps such as @wedding-yantra/types are copied in, not symlinked.
RUN --mount=type=cache,id=wy-pnpm-store,target=/pnpm/store \
    pnpm --filter=@wedding-yantra/api deploy --prod --legacy --store-dir /pnpm/store /prod/api

# ---- runtime ----------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
ARG APP_VERSION=dev
LABEL com.weddingyantra.project="wedding-yantra" \
      com.weddingyantra.service="api"

ENV NODE_ENV=production \
    PORT=4000 \
    APP_VERSION=${APP_VERSION}

WORKDIR /app
COPY --from=builder --chown=node:node /prod/api ./
USER node

EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health >/dev/null || exit 1

CMD ["node", "dist/index.js"]
