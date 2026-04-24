# Recommendarr Next

Recommendarr Next is a clean restart of Recommendarr built around explicit
workflow boundaries, domain-owned modules, and a single-container phase 1
deployment model.

## Source of truth

- `docs/adr/ADR-0001-rewrite-principles.md`
- `docs/product/behavior-matrix.md`
- `docs/architecture/project-structure.md`

## Initial stack

- Next.js App Router
- React with strict TypeScript
- Tailwind CSS
- TanStack Query
- Zod
- Drizzle ORM with SQLite
- Auth.js for local session management

The current app already includes local auth, first-admin bootstrap, encrypted
service connections, persisted recommendation runs, feedback and history, and
admin-owned user management.

## Running locally

1. Install dependencies:

```bash
npm install
```

2. Create a local env file:

```bash
APP_URL=http://localhost:3000
DATABASE_URL=./data/recommendarr.db
AUTH_SECRET=replace-this-with-a-long-random-string
```

3. Start the app:

```bash
npm run dev
```

4. Open `http://localhost:3000`.
	On a fresh database you will land on the bootstrap flow first, create the
	initial admin account there, then sign in and configure connections.

## Testing as we go

The fastest checks during normal work are:

## Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run db:generate
```

Recommended workflow while iterating:

1. Keep `npm run dev` running in one terminal.
2. After a backend or data-shape change, run `npm run typecheck`.
3. After UI or action changes, run `npm run typecheck` and `npm run lint`.
4. Before a commit or handoff, run `npm run build`.
5. Only run `npm run db:generate` when the Drizzle schema changes.

Manual happy-path checks in the browser:

1. Bootstrap the first admin on a fresh database.
2. Sign in at `/login`.
3. Configure and verify the AI provider and Sonarr or Radarr on `/settings/connections`.
4. Request recommendations on `/tv` or `/movies`.
5. Confirm saved results appear on the recommendation route and under `/history`.
6. Like, dislike, and hide or unhide history items.
7. If signed in as admin, create a second user and exercise role, disable, and reset-password flows on `/admin`.

## Project shape

- `src/app`: route entry points and layouts
- `src/components`: shared UI and layout primitives
- `src/config`: navigation, rewrite rules, and implementation order
- `src/lib`: framework-agnostic helpers and environment validation
- `src/modules`: domain module registry and future module implementations
- `docs`: carried-forward ADRs and product behavior references

## Next implementation slice

1. Add Sonarr and Radarr add-to-library workflows from recommendation items.
2. Implement watch-history sync and source-backed watch-history-only mode.
3. Add pagination and metadata enrichment to recommendation history.
4. Add audit browsing and broader admin operational visibility.
