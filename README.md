# Recommendarr

> Self-hosted AI recommendations for your Sonarr and Radarr libraries.

Recommendarr connects your existing media stack to an OpenAI-compatible chat
model and turns your library and watch history into thoughtful, duplicate-aware
TV and movie recommendations — then helps you queue them in Sonarr or Radarr
with a single click.

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
> Recommendarr is a personal project maintained in my spare time. Issues, pull
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
- Browse your **Sonarr** library with real-time filtering and per-season
  monitoring controls.
- Browse your **Radarr** library and request new movies directly from the
  Radarr search.
- One-click "send to Sonarr/Radarr" from any recommendation card with saved
  per-user defaults (root folder, quality profile, monitored, etc.).
- **In-progress** view that tracks active SABnzbd downloads.

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

<!-- Add screenshots or a short demo GIF here -->

---

## Architecture

Recommendarr is a single Next.js 16 application using the App Router with
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
and [`docs/adr/ADR-0001-rewrite-principles.md`](docs/adr/ADR-0001-rewrite-principles.md).

---

## Quick start

**Requirements**

- Node.js **20** or newer
- An OpenAI-compatible chat-completions endpoint and API key
- Optional: Sonarr, Radarr, Plex, Tautulli, Trakt, or SABnzbd reachable from
  the host

**Run locally**

```bash
git clone https://github.com/<your-fork>/recommendarr-next.git
cd recommendarr-next
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

```bash
cp .env.example .env
# set AUTH_SECRET and APP_URL; optionally set APP_PORT
docker compose up -d --build
```

- SQLite is persisted in the `recommendarr-data` volume.
- The container forces `DATABASE_URL=file:/app/data/recommendarr.db`.
- The app is published on `APP_PORT` (default `42021`); keep `APP_URL`
  aligned with the URL users open.
- A `/api/health` endpoint is exposed for health checks.
- **Always** put TLS in front of any internet-exposed deployment.

---

## Configuration

The canonical environment list lives in [`.env.example`](.env.example).

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_URL` | ✅ | Public app origin, e.g. `https://recommendarr.example.com`. |
| `DATABASE_URL` | ✅ | SQLite URL. Local default: `file:./data/recommendarr.db`. |
| `AUTH_SECRET` | ✅ | Auth.js signing secret. Must be at least 32 characters. |
| `APP_PORT` | ⛔ | Docker host port to publish. Defaults to `42021`. |
| `SECRET_BOX_KEY` | ⛔ | Separate encryption key for stored service secrets. Falls back to `AUTH_SECRET`. |
| `ALLOW_PRIVATE_SERVICE_HOSTS` | ⛔ | Defaults to `true`. Set `false` for cloud deployments that must block private-network service URLs. |

---

## Integrations

All integrations are configured per-user under **Settings → Connections** and
verified through dedicated workflows before being saved. Secrets are stored
encrypted at rest.

| Service | Purpose |
| --- | --- |
| **OpenAI-compatible** | Chat model used to generate recommendations. |
| **Sonarr** | Library context, season monitoring, request new shows. |
| **Radarr** | Library context, search and request new movies. |
| **Plex** | Optional watch-history source. |
| **Tautulli** | Optional watch-history source with richer history detail. |
| **Trakt** | Optional watch-history source. |
| **SABnzbd** | In-progress download tracking. |

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

Domain modules under `src/modules/` include `recommendations`,
`service-connections`, `watch-history`, `identity-access`, `preferences`,
`users`, `admin`, and `jobs`.

---

## Security

Recommendarr ships with several hardening features by default:

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

- [`docs/adr/ADR-0001-rewrite-principles.md`](docs/adr/ADR-0001-rewrite-principles.md) — architectural rules
- [`docs/architecture/project-structure.md`](docs/architecture/project-structure.md) — module map
- [`docs/product/behavior-matrix.md`](docs/product/behavior-matrix.md) — product behavior matrix
- [`docs/api.md`](docs/api.md) — API surface

---

## License

Released under the [MIT License](LICENSE) — free for personal and commercial
use, modification, and distribution. Attribution required.
