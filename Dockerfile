# syntax=docker/dockerfile:1.7

# ---------- build base ----------
# Pin npm separately because the Node image's bundled npm can lag the project
# package-manager contract and silently ignore strict install-script policy.
FROM node:26.5.1-bookworm-slim@sha256:9e6f9357d371591e32ab6f2d8a26d63bdd0d17c29eee3f4f3e7e454d9634bf73 AS build-base
ARG NPM_VERSION=11.16.0
RUN npm install --global "npm@${NPM_VERSION}" \
  && test "$(npm --version)" = "${NPM_VERSION}"

# ---------- deps ----------
# Install dependencies with build tools available so better-sqlite3 can compile
# native bindings if no prebuilt binary matches the runtime platform.
FROM build-base AS deps
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --include=dev --strict-allow-scripts

# ---------- builder ----------
FROM build-base AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Next.js evaluates route modules during `next build` to collect page data, and
# our env schema validates AUTH_SECRET at import time. Provide a throwaway
# value here so the build can complete; the real secret is supplied at runtime
# via the runner stage's env_file. This dummy value is NOT baked into the
# output bundle (env is read with process.env at runtime).
ENV AUTH_SECRET=build-time-placeholder-not-used-at-runtime-xxxxxxxxxxxxx

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---------- runner ----------
FROM node:26.5.1-bookworm-slim@sha256:9e6f9357d371591e32ab6f2d8a26d63bdd0d17c29eee3f4f3e7e454d9634bf73 AS runner
WORKDIR /app

# The built-in download engine shells out to par2 (repair + obfuscated-name
# restoration), unrar (RAR sets — Debian's 7zz ships without the RAR codec),
# and 7zz (zip/7z) during finalization; all live in this image so no external
# download tooling is required. unrar comes from the non-free component.
RUN sed -i 's/Components: main/Components: main contrib non-free non-free-firmware/' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends par2 7zip unrar ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=42021 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/app/data/nooklet.db \
    DOWNLOAD_ENGINE_DIR=/app/data/downloads

# Standalone output bundles only the dependencies the server actually imports
# under .next/standalone. We still need the Drizzle migrations folder at
# runtime because ensureDatabaseReady() runs them on first DB access, and we
# need the better-sqlite3 native module which standalone tracing pulls in.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/worker/worker.cjs ./worker.cjs
COPY --from=builder /app/.next/worker/worker.cjs.map ./worker.cjs.map
COPY --from=builder /app/drizzle ./drizzle
# Keep the documented runtime backup command without reintroducing build-only
# tooling (such as the standalone sanitizer) into the final image.
COPY --from=builder /app/scripts/backup-database.mjs ./scripts/backup-database.mjs
COPY --from=builder /app/scripts/recover-account.mjs ./scripts/recover-account.mjs
COPY --from=builder /app/scripts/container-supervisor.mjs ./scripts/container-supervisor.mjs
COPY --from=builder /app/scripts/lib/storage-probe-coordinator.mjs ./scripts/lib/storage-probe-coordinator.mjs
COPY --from=builder /app/scripts/lib/worker-heartbeat-watchdog.mjs ./scripts/lib/worker-heartbeat-watchdog.mjs
COPY --from=builder /app/scripts/lib/structured-log.mjs ./scripts/lib/structured-log.mjs
COPY --from=builder /app/scripts/validate-media-directory.mjs ./scripts/validate-media-directory.mjs

# Persist data outside the image. The volume is mounted here in compose.
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 42021

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:42021/api/health').then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["tini", "-g", "--"]
CMD ["node", "scripts/container-supervisor.mjs"]
