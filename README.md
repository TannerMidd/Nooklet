# Nooklet

> A cozy corner for what's next.

Nooklet connects your existing media stack to an OpenAI-compatible chat
model and turns your library and watch history into thoughtful, duplicate-aware
TV and movie recommendations — then helps you queue them through its built-in
library manager with a single click.

<p align="center">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?logo=react">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript">
  <img alt="Tailwind CSS v4" src="https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-Drizzle-003b57?logo=sqlite">
  <img alt="Auth.js" src="https://img.shields.io/badge/Auth.js-credentials-7e3ff2">
</p>

> **Note**
> This codebase was developed with substantial AI assistance and human review.
> Treat it with the same scrutiny as any other third-party code, and report
> suspected bugs or security issues through GitHub.

> **Disclaimer**
> Nooklet is a personal project maintained in my spare time. Issues, pull
> requests, and feature ideas are welcome, but responses, fixes, and new
> features are **not guaranteed** and may land on no particular schedule.

---

## Table of contents

- [Highlights](#highlights)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Docker](#docker)
- [Configuration](#configuration)
- [Integrations](#integrations)
- [Development](#development)
- [Project layout](#project-layout)
- [Security](#security)
- [Documentation](#documentation)
- [License](#license)

---

## Highlights

### Recommendations
- TV and movie suggestions from any OpenAI-compatible chat-completions
  endpoint (OpenAI, OpenRouter, Ollama, LM Studio, vLLM, etc.).
- Duplicate-aware prompts that incorporate your current library and prior
  suggestions so the model rarely repeats itself.
- Optional watch-history grounding from Plex, Tautulli, or Trakt for
  taste-aware results.
- Per-recommendation feedback (👍 / 👎 / hide) feeds future prompts.
- Pagination, filters, and a full history view across every prior run.

### Library management
- Browse your TV and movie library with real-time filtering and per-season
  monitoring controls — backed by Nooklet's own normalized media database.
- Request new movies and shows directly from search, with episode-level
  selection and de-duplication against what you already monitor.
- One-click "request" from any recommendation card with saved per-user
  defaults (root folder, quality profile, monitored, etc.).
- **In-progress** view that tracks active SABnzbd downloads.

### Discover & rich title overviews
- **Discover** rails (trending, popular, top-rated for TV and movies)
  powered by TMDB.
- Rich title overview dialogs with TMDB artwork, genres, runtime, cast,
  trailers, watch providers, and similar titles.
- Add directly to your library from any Discover or recommendation overview.

### Notifications
- Per-user notification channels (**Discord**, **Apprise**, generic
  **webhook**) with event-level subscriptions.
- SSRF-guarded, secret-redacting dispatcher with a built-in test action and
  dispatch audit history.

### Insights & operations
- **Analytics** dashboard for recommendation quality, AI token usage, and
  feedback-derived taste signals.
- **Health** view showing service connection status, background sync jobs,
  and queued work.
- **Audit log** of administrative and security-sensitive actions.

### Identity & access
- Local credentials auth backed by Auth.js with secure session cookies.
- First-admin bootstrap flow for new installs.
- Multi-user support with per-user preferences, defaults, and history.
- Admin console for user and role management.

---

## Screenshots

<img width="3822" height="1826" alt="image" src="https://github.com/user-attachments/assets/33e127d1-6744-44ce-9f44-dea8953baed9" />
<br>
<img width="3806" height="1826" alt="image" src="https://github.com/user-attachments/assets/e94382ed-2c58-4164-bd2c-8e8e4962ba12" />
<br>
<img width="3818" height="1816" alt="image" src="https://github.com/user-attachments/assets/ecfbcff5-342c-4c2b-82dd-57b61e03355c" />
<br>
<img width="3828" height="1820" alt="image" src="https://github.com/user-attachments/assets/0ae21d72-835f-4d43-b815-ecfd8885f298" />
<br>
<img width="3818" height="1824" alt="image" src="https://github.com/user-attachments/assets/b9ad74b3-d845-4413-b612-27bfb229cac7" />

---

## Architecture

Nooklet is a single Next.js 16 application using the App Router with
React Server Components and server actions throughout. Domain logic lives in
explicit workflows under `src/modules/`, route handlers stay thin, and vendor
clients are never called directly from UI code.

| Layer | Stack |
| --- | --- |
| Framework | Next.js 16, React 19, TypeScript 6 |
| UI | Tailwind CSS v4, Lucide icons, TanStack Query |
| Data | Drizzle ORM, SQLite (`better-sqlite3`) |
| Auth | Auth.js v5 (credentials provider), Zod validation |
| Tests | Vitest (Node environment) |

For a deeper tour, see
[`docs/architecture/project-structure.md`](docs/architecture/project-structure.md)
and [`docs/adr/ADR-0001-architecture-principles.md`](docs/adr/ADR-0001-architecture-principles.md).

---

## Quick start

**Requirements**

- Node.js **20** or newer
- An OpenAI-compatible chat-completions endpoint and API key
- Optional: Plex, Tautulli, Trakt, or SABnzbd reachable from the host

**Run locally**

```bash
git clone https://github.com/<your-fork>/nooklet.git
cd nooklet
npm install
cp .env.example .env
# edit .env — AUTH_SECRET must be at least 32 characters
npm run dev
```

Open <http://localhost:42021>, complete the first-admin bootstrap, then
configure your services under **Settings → Connections**. Request your first
recommendations from `/tv` or `/movies`.

---

## Docker

The fastest path from a clean checkout to a running instance:

1. **Copy the env template.**
   ```bash
   cp .env.example .env       # macOS / Linux
   ```
   ```powershell
   Copy-Item .env.example .env  # Windows / PowerShell
   ```
2. **Set the three required values** in `.env`:
   - `APP_URL` — the URL users will open, e.g. `http://localhost:42021`.
   - `APP_PORT` — host port to publish (default `42021`). Must match `APP_URL`.
   - `AUTH_SECRET` — at least 32 characters. Generate one with
     `openssl rand -base64 48` (any OS with OpenSSL) or
     `[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))`
     in PowerShell.
3. **(Optional) Add bind mounts** for your media library and SAB completed
   folder — see [Mounting media and downloads](#mounting-media-and-downloads)
   below. Skip this step if you only want to poke around the UI.
4. **Build and start.**
   ```bash
   docker compose up -d --build
   ```
5. **Open `APP_URL`** and create the first admin account. The bootstrap flow
   self-disables after the first user signs up.

To pick up changes later (env edits, new mounts, new image), re-run
`docker compose up -d --build`. To stop without losing data, `docker compose
down` — the SQLite database lives in the named `nooklet-data` volume and
survives container rebuilds.

What the shipped compose file does for you:

- Persists SQLite in the named `nooklet-data` volume.
- Forces `DATABASE_URL=file:/app/data/nooklet.db` inside the container so a
  host-style `DATABASE_URL` in `.env` can't accidentally write outside the
  volume.
- Publishes the app on `APP_PORT` (default `42021`).
- Exposes `/api/health` for container health checks.

**Always** put TLS in front of any internet-exposed deployment.

### Mounting media and downloads

Nooklet runs entirely inside the container, so any folders that live on the
host (or on a NAS/SMB share mounted on the host) must be exposed to the
container as **bind mounts**. Edit the `volumes:` section of
`docker-compose.yml` (the file ships with commented examples):

```yaml
services:
  app:
    volumes:
      - nooklet-data:/app/data
      # Media library roots. Format is "<host path>:<container path>".
      - "D:\\Media\\TV:/media/tv"
      - "D:\\Media\\Movies:/media/movies"
      # SABnzbd's completed-downloads folder.
      - "F:\\Usenet\\Downloads:/downloads"
```

Two rules to remember:

- **Always enter the container-side path in Settings → Library** (`/media/tv`,
  `/media/movies` in the example above). Nooklet stores library paths in the
  database verbatim and resolves them from inside the container; the host
  path on the left side of the bind mount is invisible to the app.
- **Quote any Windows path that contains a space, a colon, or backslashes**
  in YAML, and double the backslashes (`"D:\\Plex Media:/media/plex"`). A
  bare drive root like `G:\` becomes `"G:\\:/media/g"`.

After editing the file, run `docker compose up -d` to recreate the container
with the new mounts. Restarting the container is not enough — bind mounts are
fixed at create time.

### SAB path translation

When SAB finishes a download it tells Nooklet where the files landed. If
Nooklet's container can read that exact same path (because you bind-mounted
SAB's completed folder at the same path SAB itself uses), nothing else is
needed — leave `SABNZBD_PATH_MAPPINGS` empty.

Set `SABNZBD_PATH_MAPPINGS` only when the path SAB reports does **not**
resolve inside Nooklet's container. Format is
`<path SAB reports>=<path Nooklet should read>`, separated by `;` or new
lines. Both sides must be paths that exist somewhere — usually you map
SAB's container path to Nooklet's container path:

```env
# SAB reports /sab-downloads/..., Nooklet sees the same files at /downloads/...
SABNZBD_PATH_MAPPINGS=/sab-downloads=/downloads
```

If you run Nooklet directly on the host (no container) while SAB is
containerized, the right side becomes a host path:

```env
SABNZBD_PATH_MAPPINGS=/downloads=F:\Usenet\Downloads
```

### Permissions

The container runs as a non-root user (`node`). Mounted host folders need to
be readable by that user. They also need to be **writable** if you plan to
use Nooklet's delete-with-cleanup option that removes files from disk. On
Docker Desktop (Windows / macOS) bind mounts are usually world-accessible by
default; on a Linux host you may need `chmod` / `chown` or a `user:` override
in compose.

### Running multiple instances

To run a second instance side-by-side (e.g. a dev branch alongside a stable
release) without disturbing the first:

- Use a separate compose file (`docker-compose.alpha.yml`) with its own
  `name:`, `container_name`, image tag, host port, and named data volume.
- Use a separate `.env` file (`env_file: - .env.alpha`) with a different
  `AUTH_SECRET` so session cookies don't collide.
- Manage it with `docker compose -f docker-compose.alpha.yml up -d --build`
  / `down`. Plain `docker compose` commands continue to operate on the
  default file only.

---

## Configuration

The canonical environment list lives in [`.env.example`](.env.example).

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_URL` | ✅ | Public app origin, e.g. `https://nooklet.example.com`. |
| `DATABASE_URL` | ✅ | SQLite URL. Local default: `file:./data/nooklet.db`. |
| `AUTH_SECRET` | ✅ | Auth.js signing secret. Must be at least 32 characters. |
| `APP_PORT` | ⛔ | Docker host port to publish. Defaults to `42021`. |
| `SECRET_BOX_KEY` | ⛔ | Separate encryption key for stored service secrets. Falls back to `AUTH_SECRET`. |
| `ALLOW_PRIVATE_SERVICE_HOSTS` | ⛔ | Defaults to `true`. Set `false` for cloud deployments that must block private-network service URLs. |
| `SABNZBD_PATH_MAPPINGS` | ⛔ | Translate SAB-reported paths when they don't resolve inside Nooklet's container. Format `<sab-path>=<nooklet-path>`, multiple entries separated by `;`. Leave empty if your SAB completed folder is bind-mounted at the same path SAB itself reports. See the [Docker](#docker) section for examples. |

---

## Integrations

All integrations are configured per-user under **Settings → Connections** and
verified through dedicated workflows before being saved. Secrets are stored
encrypted at rest.

| Service | Purpose |
| --- | --- |
| **OpenAI-compatible** | Chat model used to generate recommendations. |
| **TMDB** | Title overviews, artwork, genres, cast, trailers, watch providers, and the Discover rails. |
| **Plex** | Optional watch-history source. |
| **Tautulli** | Optional watch-history source with richer history detail. |
| **Trakt** | Optional watch-history source. |
| **SABnzbd** | In-progress download tracking. |
| **Notifications** | Outbound-only channels: Discord, Apprise, or generic webhook. |

---

## Development

```bash
npm run dev          # start Next.js locally
npm run typecheck    # TypeScript checks
npm run lint         # ESLint
npm test             # Vitest
npm run build        # production build
npm run db:generate  # generate Drizzle migrations after schema changes
```

Tests live beside the code they cover as `*.test.ts` and use an isolated
SQLite database configured by [`vitest.setup.ts`](vitest.setup.ts).

---

## Project layout

```text
src/app/          Next.js routes, layouts, and server actions
src/components/   shared UI and feature components
src/config/       navigation and project-wide configuration
src/lib/          database, integrations, security, and framework helpers
src/modules/      domain workflows, repositories, schemas, and adapters
drizzle/          generated SQL migrations and snapshots
docs/             ADRs, architecture notes, and product behavior matrix
```

Domain modules under `src/modules/` include `recommendations`, `discover`,
`service-connections`, `watch-history`, `notifications`, `identity-access`,
`preferences`, `users`, `admin`, and `jobs`.

---

## Security

Nooklet ships with several hardening features by default:

- 🔐 Encrypted-at-rest service secrets using a dedicated `SECRET_BOX_KEY`.
- 🚦 Database-backed rate limits on auth and high-risk endpoints.
- 🛡️ Strict security headers and CSRF-aware server actions.
- 🧾 Audit logging for administrative and security-sensitive actions.
- 👤 Scoped authorization checks on every workflow and route.
- 🌐 SSRF guard for outbound requests to user-configured services
  (`ALLOW_PRIVATE_SERVICE_HOSTS=false` for cloud deployments).

If you discover a vulnerability, please open a **private GitHub security
advisory** rather than a public issue.

---

## Documentation

- [`docs/adr/ADR-0001-architecture-principles.md`](docs/adr/ADR-0001-architecture-principles.md) — architectural rules
- [`docs/architecture/project-structure.md`](docs/architecture/project-structure.md) — module map
- [`docs/product/behavior-matrix.md`](docs/product/behavior-matrix.md) — product behavior matrix
- [`docs/api.md`](docs/api.md) — API surface

---

## License

Released under the [MIT License](LICENSE) — free for personal and commercial
use, modification, and distribution. Attribution required.
