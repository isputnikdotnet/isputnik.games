# ── Stage 1: install all deps ─────────────────────────────────────
FROM node:26-slim AS deps
WORKDIR /build
COPY package.json package-lock.json ./
COPY packages/engine/package.json ./packages/engine/
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/
RUN npm ci

# ── Stage 2: build the engine, the web app and the server ─────────
FROM deps AS build
COPY packages/engine ./packages/engine
COPY apps/web ./apps/web
COPY apps/server ./apps/server
RUN npm run build --workspace packages/engine \
    && npm run build --workspace apps/web \
    && npm run build --workspace apps/server

# ── Stage 3: runtime-only node_modules ────────────────────────────
FROM deps AS prod-deps
COPY packages/engine/package.json ./packages/engine/
RUN npm ci --omit=dev --workspace apps/server --workspace packages/engine

# ── Stage 4: production image ─────────────────────────────────────
FROM node:26-slim
WORKDIR /app

# gosu drops the entrypoint from root to the runtime user (scripts/docker-entrypoint.sh).
RUN apt-get update && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps /build/node_modules ./node_modules
# The engine is a workspace package: npm links it from node_modules to this path.
COPY --from=build /build/packages/engine/package.json ./packages/engine/
COPY --from=build /build/packages/engine/dist ./packages/engine/dist
COPY --from=build /build/apps/server/dist ./apps/server/dist
COPY --from=build /build/apps/web/dist ./web
# Read by config.ts for the version.
COPY package.json ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4200
ENV STATIC_PATH=/app/web
# The online matches live here — mount /config as a volume.
ENV DB_PATH=/config/games.sqlite
# GATEWAY_SECRET must be set at run time; the server refuses to start without it.
# Who the server runs as; the entrypoint takes ownership of /config for them.
ENV PUID=1000
ENV PGID=1000

EXPOSE 4200

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4200)+'/games/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

CMD ["node", "apps/server/dist/index.js"]
