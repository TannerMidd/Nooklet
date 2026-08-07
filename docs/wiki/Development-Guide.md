# Development Guide

> Applies to the current `main` implementation. Last source review: 2026-08-06.

This guide describes the repository's current npm-based workflow and the architectural boundaries expected of contributions.

## Prerequisites

- Node.js 24.15.0 or newer; `.nvmrc` pins the reproducible local baseline.
- npm 11.16.0, using the committed `package-lock.json` and `packageManager` declaration.
- Git.
- Optional for native download-engine work: `par2`, `unrar`, and `7zz` on `PATH`.
- Docker with the Compose plugin for production-image and container testing.

## Local setup

```bash
git clone https://github.com/TannerMidd/Nooklet.git
cd Nooklet
npm ci
cp .env.example .env
```

PowerShell:

```powershell
git clone https://github.com/TannerMidd/Nooklet.git
Set-Location Nooklet
npm ci
Copy-Item .env.example .env
```

Set independent `AUTH_SECRET`, `BOOTSTRAP_TOKEN`, and `SECRET_BOX_KEY` values of at least 32 characters. Never commit `.env`, databases, local paths, queue payloads, or credentials.

Start the development server:

```bash
npm run dev
```

The default development URL is `http://localhost:42021`. This command keeps
Next.js hot reload in the web process, watches and rebuilds the isolated worker
bundle under ignored `.codex-tmp/`, and runs storage checks in disposable probe
children. A slow media mount therefore cannot consume the web process's
filesystem thread pool during development.

## Commands

| Command                                  | Purpose                                                                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                            | Start the hot-reloading web server, isolated worker, and disposable storage probes on port 42021                                   |
| `npm run typecheck`                      | Run TypeScript without emitting output                                                                                             |
| `npm run lint`                           | Run ESLint across the repository                                                                                                   |
| `npm test`                               | Run Vitest in the Node environment                                                                                                 |
| `npm run test:scripts`                   | Test migration/module validators plus storage-probe and worker-watchdog infrastructure                                             |
| `npm run test:e2e`                       | Run the Chromium first-admin/login/axe smoke                                                                                       |
| `npm run audit:dependencies`             | Reject high/critical production dependency advisories                                                                              |
| `npm run docs:wiki:check`                | Validate Wiki structure, internal links/anchors, and repository source targets                                                     |
| `npm run docs:dossier:check`             | Validate the engineering dossier and generated configurator commands                                                               |
| `npm run docs:links:check`               | Validate published README/docs/dossier source paths and reject retired external-downloader names                                   |
| `npm run migrations:check`               | Validate journal ordering, tags, timestamps, and SQL artifacts                                                                     |
| `npm run boundaries:check`               | Reject cross-module imports into repository/adapter internals                                                                      |
| `npm run build`                          | Build and sanitize the standalone production bundle                                                                                |
| `npm run start:web`                      | Start only the built Next.js web process; pair it with `start:worker`                                                              |
| `npm run start:worker`                   | Start the built worker plus its disposable storage-probe coordinator                                                               |
| `npm run check`                          | Validate docs/source links, migrations, module boundaries, types, lint, infrastructure/application tests, and the production build |
| `npm run db:generate`                    | Generate a Drizzle migration after a schema change                                                                                 |
| `npm run db:backup`                      | Create and verify a SQLite backup using `.env`                                                                                     |
| `npm run account:recover -- --email ...` | Recover a locked-out account locally                                                                                               |

Source: [package.json](https://github.com/TannerMidd/Nooklet/blob/main/package.json).

## Code organization

```text
src/app/          routes, layouts, server actions, and API boundaries
src/components/   shared and feature UI
src/config/       navigation and project-level presentation configuration
src/lib/          database, framework, security, and integration foundations
src/modules/      domain commands, queries, repositories, adapters, and workflows
drizzle/          generated SQL migrations and snapshots
docs/             ADRs, behavior requirements, architecture notes, and Wiki source
scripts/          backup, recovery, and standalone-build utilities
```

See [Architecture](Architecture) for current module ownership.

## Architectural rules

1. Keep route handlers and server actions thin: authenticate, parse, authorize, delegate, and shape a user-safe result.
2. Put multi-step behavior in the owning domain workflow rather than a screen component.
3. Do not call raw vendor adapters from UI code.
4. Prefer typed, task-shaped commands and queries over generic setting or proxy endpoints.
5. Keep credentials server-side, encrypted at rest, masked in summaries, and absent from audit payloads.
6. Validate environment, action, route, adapter input, and adapter output boundaries.
7. Preserve normalized persistence and add indexes for new query predicates.
8. Keep the supported one-container topology in mind; do not introduce an external runtime dependency without an explicit architecture decision.

The decision basis is [ADR-0001](https://github.com/TannerMidd/Nooklet/blob/main/docs/adr/ADR-0001-architecture-principles.md), but current implementation should be checked because some older examples in that ADR have drifted. See [Architecture Decisions](Architecture-Decisions).

## Workflow changes

For a new or materially changed workflow:

- Define validated input and explicit output/error types.
- Keep orchestration separate from adapter and persistence details when the flow has multiple phases.
- Authorize at the server boundary and enforce ownership again in repository/workflow queries.
- Add a wiring or behavior test that exercises phase ordering and failure propagation.
- Persist user-visible failure state when work continues asynchronously.
- Add audit or notification behavior for security-sensitive and operationally important outcomes.
- Update the behavior matrix and relevant Wiki pages when user-observable behavior changes.

Follow the closest existing module pattern rather than creating empty template directories.

## Database changes

1. Change [`src/lib/database/schema.ts`](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/database/schema.ts).
2. Generate one logical migration with `npm run db:generate`.
3. Inspect generated SQL and Drizzle metadata, then run `npm run migrations:check`.
4. Add repository/query tests that read and write the new shape.
5. Consider upgrade and rollback behavior for existing SQLite files.
6. Keep migration and consumer commits separately reviewable when practical.

Never edit an already-published migration to represent a new logical change.

## Security review prompts

Ask these questions for every boundary change:

- Can a user read or mutate another user's row?
- Can a URL reach loopback, private, link-local, metadata, or redirected targets?
- Can a supplied path escape an approved root through `..`, a symlink, or platform-specific syntax?
- Can an error, log, audit payload, or browser response reveal a secret or protected download URL?
- Is a high-risk operation rate-limited?
- Does a background failure remain visible and retry safely?

Use the existing helpers under [`src/lib/security`](https://github.com/TannerMidd/Nooklet/tree/main/src/lib/security) rather than implementing one-off checks.

## Before committing

```bash
git status --short
git diff --check
npm run typecheck
npm run lint
npm test
npm run build
```

Run `npm run boundaries:check` after module import changes, `npm run migrations:check` after any schema/journal change, `npm run audit:dependencies` after dependency changes, and `npm run test:e2e` when bootstrap, authentication, protected navigation, or shared form semantics change.

Run `npm run docs:wiki:check` and `npm run docs:links:check` after Wiki or published source-link changes; run `npm run docs:dossier:check` as well when the engineering dossier or configurator changes.

Run the smallest relevant validation during iteration and the full proportional suite before handoff. Review the complete diff for secrets, generated noise, debug output, dead code, stale names, and unrelated changes. Use focused Conventional Commit subjects such as `fix(downloads): ...` or `docs(wiki): ...`.

## Documentation responsibility

Implementation is not complete when operator behavior changes but the relevant documentation remains stale. Use [Documentation Policy](Documentation-Policy) to identify the canonical page and source links to update.

Related: [Testing and CI](Testing-and-CI) | [Architecture](Architecture) | [Security Model](Security-Model)
