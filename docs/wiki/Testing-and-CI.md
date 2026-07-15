# Testing and CI

> Applies to the current `main` implementation. Last source review: 2026-07-15.

Nooklet uses TypeScript, ESLint, Vitest, a production Next.js build, and a hardened Docker smoke test as its current verification ladder.

## Local verification

| Check | Command | What it catches |
| --- | --- | --- |
| Type safety | `npm run typecheck` | Type errors across application and tests |
| Static analysis | `npm run lint` | ESLint and Next.js rule violations |
| Unit/integration tests | `npm test` | Domain, repository, adapter, route, and component-core behavior |
| Production build | `npm run build` | App Router compilation and standalone bundle generation |
| Wiki source | `npm run docs:wiki:check` | Required pages, headings, balanced fences, and internal Wiki link targets |
| Full repository check | `npm run check` | Wiki validation, typecheck, lint, tests, then production build |
| Container smoke | `docker build ...` plus health probe | Image construction, startup, migrations, worker readiness, hardening compatibility |

Source: [package scripts](https://github.com/TannerMidd/Nooklet/blob/main/package.json).

## Vitest environment

Tests are colocated with the code they cover using `*.test.ts` or `*.test.tsx`. [`vitest.setup.ts`](https://github.com/TannerMidd/Nooklet/blob/main/vitest.setup.ts) supplies a deterministic test-only `AUTH_SECRET` and creates a fresh SQLite database in an isolated temporary directory unless a database URL was explicitly provided.

[`vitest.config.ts`](https://github.com/TannerMidd/Nooklet/blob/main/vitest.config.ts) maps the `@` alias to `src` and excludes `.next` so a prior production build cannot be collected as a duplicate copy of the tests.

Tests that mutate process environment or singleton state must restore it. Filesystem tests should use isolated temporary roots and must never point at operator media or download folders.

## What to test by change type

| Change | Minimum focused evidence |
| --- | --- |
| Schema/repository | Migration plus read/write and ownership tests |
| Workflow | Happy path, typed failure path, authorization/ownership, phase ordering where applicable |
| Server action/API route | Unauthenticated behavior, validation failure, success, safe error mapping |
| External adapter | Request construction, response validation, timeouts, safe failure text, SSRF behavior where applicable |
| Filesystem/import | Containment, symlink/traversal rejection, collision behavior, platform separators |
| Background job | Claim eligibility, lease/run-token ownership, success/failure scheduling, retry semantics |
| Download engine | Parser/CRC fixtures, fake NNTP transport, progress, recovery, unsafe archive entries |
| UI behavior | Empty/loading/error/success states and accessible interaction semantics |
| Documentation | Links, commands, generic examples, source claims, no private data |

## GitHub Actions pipeline

The [CI workflow](https://github.com/TannerMidd/Nooklet/blob/main/.github/workflows/ci.yml) runs for pull requests and pushes to `main`.

```mermaid
flowchart LR
  Checkout["Checkout"] --> Install["npm ci on Node 24"]
  Install --> Docs["Validate Wiki source"]
  Docs --> Lint["Lint"]
  Lint --> Types["Typecheck"]
  Types --> Tests["Vitest"]
  Tests --> Build["Standalone build"]
  Build --> Image["Build Docker image"]
  Image --> Smoke["Hardened container health smoke"]
```

The Docker job runs only after the application verification job succeeds. It builds the production image, starts it with:

- all Linux capabilities dropped;
- `no-new-privileges` enabled;
- generated test-only secrets;
- loopback-only dynamic port publication;
- an approved temporary media root.

It polls `/api/health` for up to 120 seconds and prints container logs if startup fails.

## Documentation publication

The [engineering dossier workflow](https://github.com/TannerMidd/Nooklet/blob/main/.github/workflows/engineering-dossier-pages.yml) validates and deploys the static dossier when its source changes. It rejects symlinks and common sensitive file types before uploading the Pages artifact.

The [Wiki publishing workflow](https://github.com/TannerMidd/Nooklet/blob/main/.github/workflows/publish-wiki.yml) runs when Wiki source, its validator, or the workflow itself changes on `main`; it can also be started manually. The job:

1. Runs `node scripts/validate-wiki.mjs` against the reviewed source.
2. Clones the repository's separate `.wiki.git` repository.
3. Replaces its Markdown pages with the files under `docs/wiki`.
4. Commits and pushes only when the synchronized content changed.

The validator requires `Home.md`, `_Sidebar.md`, and `_Footer.md`; rejects empty pages, unbalanced code fences, pages without a level-one heading, repository-relative links that will break in the separate Wiki repository, and internal links without a matching page. It does not prove that external URLs respond or that Mermaid semantics render, so those remain review responsibilities.

GitHub Wiki content lives in a separate Git repository when published. The workflow keeps the reviewable source under `docs/wiki` on `main` and mirrors it rather than creating an unreviewed second authority. The repository Wiki must already be enabled and initialized for the clone step to succeed.

## What current CI proves

- Dependencies install under Node 24.
- TypeScript and ESLint pass.
- The Vitest suite passes against isolated SQLite state.
- The Next.js standalone bundle builds.
- The production Docker image starts with the declared hardening flags.
- Database initialization and worker readiness can satisfy the public health probe.

## What current CI does not prove

- A live request against real TMDB, AI, indexer, Usenet, Plex, Tautulli, Trakt, SABnzbd, or notification services.
- End-to-end browser behavior in an automated CI browser.
- Performance, sustained download throughput, or large-library scale.
- Backup restoration through an automated drill.
- Multi-platform native downloader tooling behavior on Windows and macOS.
- Horizontal multi-process safety.
- Formal security, accessibility, or compliance certification.
- SBOM generation, artifact signing, or image provenance attestation.

Do not convert the existence of a CI workflow into a claim that branch protection is enabled; repository policy is separate from workflow source.

## Failure triage

1. Reproduce the failing command locally with the same Node major version.
2. Read the first causal error rather than later cascading failures.
3. For test failures, verify no local `DATABASE_URL` or mutable singleton escaped isolation.
4. For build-only failures, inspect server-imported environment validation and standalone trace inputs.
5. For Docker failures, inspect container logs and `/api/health`; distinguish application failure from Docker engine failure.
6. Fix the root cause and rerun the failed check plus any downstream checks it gates.

Related: [Development Guide](Development-Guide) | [Data and Background Jobs](Data-and-Background-Jobs) | [Troubleshooting](Troubleshooting)
