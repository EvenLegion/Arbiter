# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app

FROM base AS deps
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
ENV HUSKY=0
COPY package.json pnpm-lock.yaml ./
COPY .npmrc ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS migrate
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm db:generate

FROM deps AS build
COPY tsconfig.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src ./src
RUN pnpm db:generate
RUN pnpm build
RUN pnpm prune --prod

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./package.json

RUN mkdir -p /app/logs && chown -R node:node /app/logs

USER node
CMD ["node", "dist/index.js"]
