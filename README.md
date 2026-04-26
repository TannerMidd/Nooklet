# Recommendarr Next

Recommendarr Next is a self-hosted AI recommendation app for TV and movies. It
uses your existing library metadata, optional watch history, and an
OpenAI-compatible chat model to suggest titles, then helps queue them in Sonarr
or Radarr.

This codebase was written with substantial AI assistance and human review. Treat
it with the same scrutiny as any other third-party code, and report suspected
bugs or security issues through GitHub.

## Features

- TV and movie recommendations from an OpenAI-compatible provider.
- Duplicate-aware prompts using existing library items and prior suggestions.
- Optional Plex or Tautulli watch-history context.
- One-click Sonarr and Radarr adds with saved per-user defaults.
- Recommendation history with feedback, hidden items, filters, and pagination.
- Local multi-user auth, first-admin bootstrap, admin tools, and audit logging.

## Stack

- Next.js 16, React 19, TypeScript, Tailwind CSS v4
- Drizzle ORM, SQLite, better-sqlite3
- Auth.js credentials auth, Zod validation
- Vitest for unit and workflow tests

## Requirements

- Node.js 20 or newer
- An OpenAI-compatible chat-completions endpoint and API key
- Optional Sonarr, Radarr, Plex, or Tautulli instances reachable from the app

## Quick Start

```bash
npm install
cp .env.example .env
# edit .env; AUTH_SECRET must be at least 32 characters
npm run dev
```

Open <http://localhost:3000>, create the first admin account, then configure
services under Settings -> Connections. Request recommendations from `/tv` or
`/movies`.

## Configuration

See [`.env.example`](.env.example) for the canonical environment list.

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_URL` | Yes | Public app origin, such as `https://recommendarr.example.com`. |
| `DATABASE_URL` | Yes | SQLite URL. Local default: `file:./data/recommendarr.db`. |
| `AUTH_SECRET` | Yes | Auth.js signing secret. Must be at least 32 characters. |
| `SECRET_BOX_KEY` | No | Separate encryption key for stored service secrets. Falls back to `AUTH_SECRET`. |
| `ALLOW_PRIVATE_SERVICE_HOSTS` | No | Defaults to `true`. Set `false` for cloud deployments that must block private-network service URLs. |

## Docker

```bash
cp .env.example .env
# set AUTH_SECRET and APP_URL
docker compose up -d --build
```

Docker Compose persists SQLite data in the `recommendarr-data` volume and forces
`DATABASE_URL=file:/app/data/recommendarr.db` inside the container. The app
exposes `/api/health`; put TLS in front of any internet-exposed deployment.

## Development

```bash
npm run dev          # start Next.js locally
npm run typecheck    # TypeScript checks
npm run lint         # ESLint
npm test             # Vitest
npm run build        # production build
npm run db:generate  # generate Drizzle migrations after schema changes
```

Tests live beside the code they cover as `*.test.ts` and use an isolated SQLite
database configured by `vitest.setup.ts`.

## Project Map

```text
src/app/          Next.js routes, layouts, and server actions
src/components/   shared UI and feature components
src/lib/          database, integrations, security, and framework helpers
src/modules/      domain workflows, repositories, schemas, and adapters
drizzle/          generated SQL migrations and snapshots
docs/             ADRs, architecture notes, and product behavior matrix
```

For architectural context, see
[docs/adr/ADR-0001-rewrite-principles.md](docs/adr/ADR-0001-rewrite-principles.md),
[docs/architecture/project-structure.md](docs/architecture/project-structure.md),
and [docs/product/behavior-matrix.md](docs/product/behavior-matrix.md).

## Security

The app includes encrypted service secrets, DB-backed rate limits, strict
security headers, audit logging, scoped authorization checks, and an SSRF guard
for outbound requests to user-configured services.

If you discover a vulnerability, open a private GitHub security advisory rather
than a public issue.

## License

TBD.

