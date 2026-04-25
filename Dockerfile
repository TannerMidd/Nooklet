# syntax=docker/dockerfile:1.7

# ---------- deps ----------
# Install dependencies with build tools available so better-sqlite3 can compile
# native bindings if no prebuilt binary matches the runtime platform.
FROM node:20-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --include=dev

# ---------- builder ----------
FROM node:20-bookworm-slim AS builder
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
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/app/data/recommendarr.db

# Standalone output bundles only the dependencies the server actually imports
# under .next/standalone. We still need the Drizzle migrations folder at
# runtime because ensureDatabaseReady() runs them on first DB access, and we
# need the better-sqlite3 native module which standalone tracing pulls in.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/drizzle ./drizzle

# Persist data outside the image. The volume is mounted here in compose.
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
