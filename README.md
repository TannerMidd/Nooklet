# Recommendarr Next

A self-hosted, AI-powered recommendation companion for your Sonarr, Radarr, Plex, and
Tautulli library. Recommendarr Next pairs your existing watch history and library
metadata with an OpenAI-compatible LLM to surface personalized TV and movie picks,
then lets you queue them straight into Sonarr or Radarr with one click.

> **Disclaimer**
> This codebase was written with substantial AI assistance (GitHub Copilot / Claude).
> Every change was reviewed, tested, and committed by a human, but readers should
> still treat the code with the same scrutiny they would apply to any other
> third-party contribution. Please report suspected bugs or security issues via
> GitHub issues.

---

## Features

- **AI-driven recommendations** — Bring your own OpenAI-compatible endpoint
  (OpenAI, Azure OpenAI, OpenRouter, LM Studio, Ollama, vLLM, etc.) and tune
  model, temperature, and result count per request.
- **Library-aware suggestions** — Pulls a sample of your owned titles and
  optional watch history into the prompt so suggestions reflect your taste and
  avoid duplicates.
- **One-click add to library** — Submit recommendations directly to Sonarr or
  Radarr with quality-profile, root-folder, and tag selection. Defaults persist
  per-user across sessions.
- **Feedback & history** — Like, dislike, hide, or revisit any past
  recommendation. History pages support filtering by feedback state.
- **Watch-history sync** — Manual import, plus Plex and Tautulli adapters for
  pulling watched-title context.
- **Multi-user with admin tools** — First-admin bootstrap, role management,
  account disable/enable, password reset, and audit logging.
- **Self-hostable** — Single Next.js app, single SQLite file, no external
  services required beyond your AI provider and *arr stack.

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router) on Node.js 20+
- React 19 with strict TypeScript
- [Tailwind CSS v4](https://tailwindcss.com/) for styling
- [Drizzle ORM](https://orm.drizzle.team/) on top of better-sqlite3
- [Auth.js (NextAuth v5)](https://authjs.dev/) credentials provider
- [Zod v4](https://zod.dev/) for input validation
- [Vitest](https://vitest.dev/) for unit and workflow tests

## Getting started

### Prerequisites

- Node.js **20 or newer**
- An OpenAI-compatible chat-completions endpoint (and an API key)
- *Optional:* Sonarr, Radarr, Plex, and/or Tautulli reachable from where you
  run the app

### Install and run

```bash
git clone https://github.com/<your-org>/recommendarr-next.git
cd recommendarr-next
npm install
cp .env.example .env       # then edit values (see "Configuration")
npm run dev
```

Open <http://localhost:3000>. On a fresh database you'll land on the bootstrap
flow first — create the initial admin account, then sign in and configure your
service connections.

### Configuration

All settings come from environment variables. See [`.env.example`](.env.example)
for the canonical list.

| Variable | Required | Description |
| --- | --- | --- |
| `APP_URL` | yes | Public origin of the app, e.g. `https://recommendarr.example.com`. |
| `DATABASE_URL` | yes | SQLite path. Defaults to `file:./data/recommendarr.db`. |
| `AUTH_SECRET` | **yes** | NextAuth signing key. **Minimum 32 characters.** Generate with `openssl rand -base64 48`. The app refuses to start without it. |
| `SECRET_BOX_KEY` | no | Dedicated AES-GCM key for encrypting stored service-connection secrets. If unset, derived from `AUTH_SECRET`. Recommended in production so that JWT secret rotation doesn't force re-entry of every API key. |
| `ALLOW_PRIVATE_SERVICE_HOSTS` | no | Defaults to `true`. Set to `false` in cloud deployments to refuse outbound calls to private/RFC1918 addresses (mitigates SSRF when users can supply arbitrary URLs). |

### First-time setup

1. Sign in as the bootstrap admin you just created.
2. Visit **Settings → Connections** and configure:
   - **AI provider** — base URL + API key + model identifier.
   - **Sonarr** and/or **Radarr** — base URL + API key. Verify the connection
     to populate root folders and quality profiles.
   - **Plex** or **Tautulli** *(optional)* — for watch-history sync.
3. *(Optional)* Visit **Settings → History** to import watch history.
4. Visit **/tv** or **/movies** to request recommendations.
5. *(Optional, admin only)* Visit **/admin** to invite additional users.

## Development

### Common commands

```bash
npm run dev          # start the Next.js dev server
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # vitest run
npm run build        # production build
npm run db:generate  # generate a new Drizzle migration after schema changes
```

### Recommended workflow

1. Keep `npm run dev` running.
2. After a workflow or schema change, run `npm run typecheck` and `npm test`.
3. After UI or action changes, run `npm run typecheck` and `npm run lint`.
4. Before committing, run `npm run build` if you touched anything that affects
   route generation.
5. Only run `npm run db:generate` after editing `src/lib/database/schema.ts`.

### Project layout

```
src/
  app/                Next.js App Router routes, layouts, and server actions
  components/         Shared UI primitives and feature components
  lib/                Framework-agnostic helpers
    database/         Drizzle client, schema, and migration runner
    integrations/     Plex, Tautulli HTTP clients
    security/         safeFetch (SSRF guard), rate-limit, secret-box, audit-payload
  modules/            Domain modules (identity, recommendations, preferences, …)
    <domain>/
      schemas/        Zod input schemas
      repositories/   Drizzle data access
      workflows/      Use-cases composed from repositories + adapters
      adapters/       Outbound integrations
  types/              Ambient module augmentation (NextAuth, etc.)
drizzle/              Generated SQL migrations and snapshots
docs/                 ADRs and product behavior matrix
```

### Testing

Tests live alongside the code they cover (`*.test.ts`). They run against an
isolated temp-directory SQLite file (configured in `vitest.setup.ts`) so they
won't touch your dev database.

```bash
npm test
```

## Security

This project takes self-hosted security seriously. Implemented controls include:

- **Authentication** — scrypt password hashing with timing-safe comparison;
  account lockout after repeated failed logins; JWT sessions with 24-hour
  rolling refresh that are invalidated on password change or account disable.
- **Authorization** — every server action calls `auth()` and every database
  query is scoped to the requesting user's id.
- **SSRF protection** — all outbound calls to user-supplied URLs go through a
  `safeFetch` helper that resolves the hostname, blocks link-local / multicast
  / cloud-metadata addresses (and optionally private addresses), refuses to
  follow redirects, and caps response size.
- **Secret encryption** — service-connection API keys are stored encrypted with
  AES-256-GCM using an HKDF-derived key and a versioned envelope. A separate
  `SECRET_BOX_KEY` may be supplied to decouple from `AUTH_SECRET`.
- **Rate limiting** — DB-backed sliding-window limits on login, bootstrap,
  recommendation requests, and connection verification.
- **Transport headers** — strict CSP, HSTS, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive
  `Permissions-Policy` are applied to every response.
- **Audit logging** — every privileged action is recorded; a payload scrubber
  redacts any field whose key matches a sensitive pattern (`password`, `token`,
  `api_key`, etc.) as defense-in-depth.

If you discover a vulnerability, please open a private GitHub security advisory
rather than a public issue.

## Production deployment

The app is a single Next.js process plus a SQLite file. Behind a reverse proxy
that terminates TLS:

1. Build the app: `npm run build`
2. Set `NODE_ENV=production` and the env vars above (especially `AUTH_SECRET`
   and an `APP_URL` that matches your public origin).
3. Persist the directory containing your `DATABASE_URL` file (and back it up).
4. Run `npm start`.
5. Ensure `ALLOW_PRIVATE_SERVICE_HOSTS=false` if your deployment shouldn't be
   able to reach internal addresses.

A container image and compose example will land in a follow-up release.

## Contributing

Contributions are welcome. Please:

1. Open an issue first for non-trivial changes so we can align on scope.
2. Keep commits small and focused; include tests for new behavior.
3. Run `npm run typecheck`, `npm test`, and `npm run lint` before opening a PR.

See [`docs/adr/ADR-0001-rewrite-principles.md`](docs/adr/ADR-0001-rewrite-principles.md)
and [`docs/product/behavior-matrix.md`](docs/product/behavior-matrix.md) for
the architectural ground rules.

## License

TBD — see the repository's `LICENSE` file once published.

## Acknowledgements

- The original [Recommendarr](https://github.com/) project that inspired this
  rewrite.
- Sonarr, Radarr, Plex, and Tautulli for their open APIs.

