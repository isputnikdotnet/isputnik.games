# ── Stage 1: install all deps (with native-module build tools) ────
# better-sqlite3 compiles from source where no prebuilt binary matches the
# image's Node; without these the deps stage fails at `npm ci` (node-gyp).
FROM node:26-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
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
RUN npm ci --omit=dev --workspace apps/server --workspace packages/engine     && mkdir -p apps/server/node_modules
# (mkdir: npm nests a package under apps/server/node_modules when the root holds
# another version of it — nanoid 6 for the server beside nanoid 3 for vite — and
# the final stage copies that folder too. When nothing is nested npm never
# creates it, and COPY --from of a missing path fails the whole build; an empty
# folder copies as nothing. v0.1.0 shipped without this copy and the container
# died at startup: "Cannot find package 'nanoid'".)

# ── Stage 4: production image ─────────────────────────────────────
FROM node:26-slim
WORKDIR /app

# Unraid draws the container's icon from this label when its saved template
# has none, so a template edit or an update cannot leave the tile blank.
LABEL net.unraid.docker.icon="https://raw.githubusercontent.com/isputnikdotnet/isputnik.games/main/Assets/icon.png"

# gosu drops the entrypoint from root to the runtime user (scripts/docker-entrypoint.sh).
RUN apt-get update && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps /build/node_modules ./node_modules
COPY --from=prod-deps /build/apps/server/node_modules ./apps/server/node_modules
# The engine is a workspace package: npm links it from node_modules to this path.
COPY --from=build /build/packages/engine/package.json ./packages/engine/
COPY --from=build /build/packages/engine/dist ./packages/engine/dist
# The server's own package.json carries "type": "module"; without it Node reads
# dist/*.js as CommonJS first and warns on every start.
COPY --from=build /build/apps/server/package.json ./apps/server/
COPY --from=build /build/apps/server/dist ./apps/server/dist
COPY --from=build /build/apps/web/dist ./web
# Read by config.ts for the version.
COPY package.json ./

# Import smoke test: every production dependency of the server must load from
# this tree, so a missing package fails THIS build instead of the container at
# startup. Runs from apps/server so resolution matches the server code's own
# view (nested packages live in apps/server/node_modules).
RUN cd apps/server && node -e 'const deps=Object.keys(require("./package.json").dependencies);(async()=>{for(const d of deps){try{await import(d)}catch(e){  console.error("runtime dep failed to load:",d,"-",e.message);process.exit(1)}}console.log(deps.length+" runtime deps load OK")})()'

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
