# syntax=docker/dockerfile:1.7

# ---------- build base ----------
# Pin npm separately because the Node image's bundled npm can lag the project
# package-manager contract and silently ignore strict install-script policy.
FROM node:26.8.1-bookworm-slim@sha256:367679cf9792759492a486e4aa4b421764d71a9546a6dae8aab81a99eb797b3e AS build-base
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
FROM node:26.8.1-bookworm-slim@sha256:367679cf9792759492a486e4aa4b421764d71a9546a6dae8aab81a99eb797b3e AS runner
WORKDIR /app

# yt-dlp's official Unix zipimport executable is architecture-independent. Pin
# the immutable release asset and verify its published digest during the image
# build so the production container never downloads executable components at
# runtime. The official zipimport artifact also bundles the matching EJS
# challenge scripts; Node 24 in this base image is the JavaScript runtime.
ARG YT_DLP_VERSION=2026.07.04
ARG YT_DLP_SHA256=495be29ff4d9d4e9be7eabdfef225221e5d5282e77f2f505abc6dca80349f3fd
ARG BGUTIL_PROVIDER_VERSION=1.3.1
ARG BGUTIL_PROVIDER_PLUGIN_SHA256=b8ceec7f76143da172aaf5ebeec0c2d218e5680c063b931586bca48567069b38

# The built-in download engine shells out to par2 (repair + obfuscated-name
# restoration), unrar (RAR sets — Debian's 7zz ships without the RAR codec),
# and 7zz (zip/7z) during finalization. YouTube transfers use the pinned
# yt-dlp zipimport executable, Python, ffmpeg, and this image's Node runtime.
# All live in the image so no external download tooling is required at runtime.
# unrar comes from the non-free component.
RUN sed -i 's/Components: main/Components: main contrib non-free non-free-firmware/' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends par2 7zip unrar ca-certificates tini python3 ffmpeg \
  && python3 -c "import hashlib, pathlib, sys, urllib.request; version, expected = sys.argv[1:]; target = pathlib.Path('/usr/local/bin/yt-dlp'); data = urllib.request.urlopen(f'https://github.com/yt-dlp/yt-dlp/releases/download/{version}/yt-dlp', timeout=60).read(); actual = hashlib.sha256(data).hexdigest(); actual == expected or sys.exit(f'yt-dlp checksum mismatch: expected {expected}, got {actual}'); target.write_bytes(data); target.chmod(0o755)" "${YT_DLP_VERSION}" "${YT_DLP_SHA256}" \
  && test "$(/usr/local/bin/yt-dlp --version)" = "${YT_DLP_VERSION}" \
  && mkdir -p /usr/local/share/yt-dlp-plugins \
  && python3 -c "import hashlib, pathlib, sys, urllib.request; version, expected = sys.argv[1:]; target = pathlib.Path('/usr/local/share/yt-dlp-plugins/bgutil-ytdlp-pot-provider.zip'); data = urllib.request.urlopen(f'https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/{version}/bgutil-ytdlp-pot-provider.zip', timeout=60).read(); actual = hashlib.sha256(data).hexdigest(); actual == expected or sys.exit(f'bgutil provider plugin checksum mismatch: expected {expected}, got {actual}'); target.write_bytes(data)" "${BGUTIL_PROVIDER_VERSION}" "${BGUTIL_PROVIDER_PLUGIN_SHA256}" \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=42021 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/app/data/nooklet.db \
    DOWNLOAD_ENGINE_DIR=/app/data/downloads \
    YT_DLP_PATH=/usr/local/bin/yt-dlp \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    YOUTUBE_WORK_DIR=/app/data/youtube \
    YT_DLP_PLUGIN_DIR=/usr/local/share/yt-dlp-plugins \
    YOUTUBE_POT_PROVIDER_URL=http://youtube-pot-provider:4416

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
COPY --from=builder /app/LICENSE /app/THIRD_PARTY_NOTICES.md ./licenses/

# Persist data outside the image. The volume is mounted here in compose. The
# YouTube incomplete workspace therefore remains writable and restart-safe even
# when Compose runs the rest of the image read-only.
RUN mkdir -p /app/data/youtube/incomplete && chown -R node:node /app

USER node

EXPOSE 42021

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:42021/api/health').then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["tini", "-g", "--"]
CMD ["node", "scripts/container-supervisor.mjs"]
