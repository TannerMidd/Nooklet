# Copilot Instructions — nooklet

Nooklet is a self-hosted Next.js app that turns a media stack plus an OpenAI-compatible model into TV/movie recommendations. For observed behavior, current code, schema, migrations, tests, and the [Architecture Wiki](../docs/wiki/Architecture.md) are authoritative. The [ADRs](../docs/adr/), [behavior matrix](../docs/product/behavior-matrix.md), and [project structure](../docs/architecture/project-structure.md) define decisions, acceptance status, and target conventions; read their historical/current-alignment notes rather than treating old inventories as runtime fact.

## Stack

Next.js (App Router) + React 19 + TypeScript strict, Drizzle ORM on SQLite (WAL), Auth.js, Zod, Tailwind CSS, and Vitest. Node ≥ 24.15.0. One application container with separately supervised web and worker processes is the supported deployment.

## Architecture direction and guardrails

These began in ADR-0001 and remain the direction for new work. Existing code has documented boundary debt, so do not assume every item is already enforced:

1. UI does **not** own multi-workflow orchestration. Screens stay route-scoped and delegate behavior to module workflows.
2. The HTTP and server-action surface is **workflow-shaped, not CRUD-shaped**. Routes describe a task and delegate to a module entry point.
3. Persistence is **normalized** around workflows and records. **No** JSON columns that aggregate unrelated concerns.
4. **No** generic save-setting endpoints (`{key, value}` write APIs). Settings writes go through a typed, purpose-specific command.
5. **No** generic proxy endpoint (forwarding arbitrary URLs/paths to upstream services).
6. UI must **never** call raw service clients or adapters. UI → server action / route → module command/query/workflow → adapter.
7. Credential ownership rules live in `service-connections`, `indexers`, and shared security helpers. Never branch on `service === 'plex'` etc. in UI code to decide policy.
8. No root component or layout orchestrating multiple workflows.
9. Recommendation generation, watch-history sync, onboarding, connection verification, and admin actions must be **explicit workflows with separate phase files**. Do not collapse phases into one function.
10. Server-only adapters expose **typed capabilities**, not ad hoc service-specific methods. No screen imports an adapter.

Auth: local login is first-class, OAuth optional. First-admin bootstrap is explicit and self-disables. **No default admin password — ever.**

## Module template

Domain modules live at `src/modules/<module>/`:

```
adapters/    commands/    queries/    repositories/
schemas/     types/       workflows/
```

Create folders only when real code lands. No placeholder folders.

The cross-module public surface is the target module's `public.ts` facade. Repositories and adapters are internal to their owning module; `npm run boundaries:check` rejects production cross-module imports that bypass the facade. Commands, queries, and workflows remain the task-shaped implementation entry points exported by those facades.

Route handlers in `src/app/api/**` and server actions in `src/app/(workspace)/**` stay thin: parse + authorize + delegate to a module entry point + shape response. No business logic.

## Workflow phases

For a multi-phase workflow, prefer one file per meaningful phase under `src/modules/<module>/workflows/<workflow>/`:

- **Recommendation generation:** request-validation → source-preparation → prompt-construction → model-execution → normalization → persistence → feedback-capture → retry-handling.
- **Watch-history sync:** source-validation → source-fetch → normalization → merge-deduplication → sync-metadata-persistence → query-surface.

Keep `index.ts` focused on orchestration and add a wiring test that asserts phase order and propagation. A small cohesive workflow may remain one file; split by responsibility when complexity warrants it.

## Validation, types, errors

- Zod at every boundary (route input, server action input, adapter input/output, env, config). Infer types with `z.infer`.
- TypeScript strict. No `any`. Prefer `unknown` + narrowing.
- Throw typed domain errors from modules. Map them at the route boundary. Never leak adapter internals or credential values in error messages.

## Data layer

- Schema is normalized around workflows and records (see ADR §"Data design rules"). No JSON columns that aggregate unrelated concerns.
- One Drizzle migration = one logical change. Migration first, consumer code second (separate commits).
- Run `npm run migrations:check`; journal indexes/tags are contiguous, SQL artifacts are append-only, and new timestamps must be monotonic. Do not rewrite the two explicit historical timestamp exceptions.
- Add an index whenever you add a `where` / `orderBy` / `join` predicate over a column without one.
- Treat synchronous SQLite/WAL as an explicit current deployment constraint. Keep new database-specific details behind repositories; do not claim a PostgreSQL swap is mechanical without migration evidence.

## Security

- Secrets are encrypted at rest, masked in UI summaries, and unreachable through generic read APIs.
- Authorization is enforced server-side. UI guards are UX, not security.
- Never log secret values, tokens, or full upstream response bodies that contain them.

## Testing

- `vitest run --environment node` is the test command. Co-locate tests with the code they cover (`*.test.ts`).
- `npm run test:e2e` runs the Playwright first-admin/login/accessibility smoke; install the Chromium runtime before the first local run.
- `npm run audit:dependencies` rejects high/critical production dependency advisories.
- Add a wiring test for every new or materially changed multi-phase workflow orchestrator.
- Add auth-failure and happy-path coverage for every new or materially changed route handler/server action. Existing boundary coverage is incomplete; do not infer coverage from this instruction.
- Schema changes ship with a repository or query test that reads/writes the new column(s).

## Commit-as-you-go (mandatory)

Small, focused commits. Giant commits are unacceptable.

For implementation tasks in this repository, these instructions are explicit authorization to create small focused commits after validation unless the user explicitly says not to commit. If the user says not to commit, leave changes unstaged and report that status clearly before ending.

- One coherent slice per commit. Commit promptly; do not accumulate mixed changes.
- Order: refactor / mechanical → schema migration → server-side behavior → client-side behavior → docs.
- **Never** mix a refactor with a behavior change in the same commit.
- **Never** mix a schema migration with its consumer code unless the migration is unsafe without it. Default: migration commit first, consumer commit second.
- Conventional Commits style for subjects: `feat(recommendations): ...`, `fix(auth): ...`, `refactor(service-connections): ...`, `chore(drizzle): ...`, `test(...): ...`, `docs(...): ...`.
- One Drizzle migration per commit.
- If a slice exceeds ~10 files or ~300 lines and isn't a generated migration, split it.
- Do **not** use `--no-verify`, `--force`, `git reset --hard`, or amend pushed commits.
- Before every commit, run `git status` + `git diff`, confirm the scope is one coherent slice, and stage only the intended paths. Never `git add .` blindly.

## Pre-commit review (mandatory)

Before validating and committing a slice, analyze the diff like a maintainer. Do not commit until this review is clean.

1. Run `git status --short`, `git diff --stat`, `git diff --check`, and inspect the full diff for the files being committed.
2. Confirm the slice is coherent and contains no unrelated generated files, formatting churn, debug output, temporary notes, or local-only artifacts.
3. Check for old dead code left behind by the change: unused imports, unreachable branches, obsolete helpers, stale exports, duplicate components, unused CSS classes/tokens, dead tests, and stale docs. Remove dead code in the same slice when removal is part of the change; otherwise split it into a separate cleanup commit.
4. Search for replaced names, old patterns, and duplicate implementations when the change renames, moves, replaces, or supersedes existing code. Use the `Code Auditor` agent for broad dead-code or boundary-risk reviews.
5. Double-check local patterns and ADR rules before commit: module boundaries, workflow phase structure, route/server-action thinness, typed commands/queries, normalized persistence, UI-to-module boundaries, and credential ownership. Do not commit if the implementation violates the surrounding pattern.
6. If the review finds mixed concerns, split the work before validation and commit. Use the `Commit Slicer` agent when the split is not obvious.

For every code-changing task, follow this mechanical loop:

1. Run `git status --short` before editing.
2. Inspect relevant files and local patterns before changing them.
3. Make the smallest coherent slice of changes.
4. Perform the mandatory pre-commit review above, including dead-code and pattern checks.
5. Run the relevant validation for that slice.
6. Check ADR compliance before committing. Use the `ADR Compliance Checker` agent for code or architecture-adjacent diffs; for docs-only or instruction-only changes, explicitly mark ADR as not applicable.
7. Stage only the files for that slice.
8. Commit immediately with a Conventional Commits subject.
9. Repeat for the next slice.

If the working tree already contains mixed changes, do not pile onto them. Inspect ownership, commit any completed assistant-owned slice first, and use the `Commit Slicer` agent when the split is not obvious.

The `Commit Slicer` agent (`.github/agents/commit-slicer.agent.md`) can plan slices when a working tree is mixed.

## Working preferences

- Implement rather than only suggest. Make the minimal change asked for; don't refactor adjacent code, add comments to untouched code, or invent abstractions for one-time use.
- Read files before editing them. Read large ranges over many small reads.
- Prefer editing existing files over creating new ones. Don't create markdown summaries of changes unless asked.
- Use the npm lockfile and scripts: run `npm run typecheck` and the relevant Vitest files after non-trivial edits. Fix what you broke before moving on.
- When unsure between two designs, pick the one that matches an existing module in this repo.

## Specialized agents available

Delegate when the task fits:

- **Code Auditor** — dead/outdated/redundant code and boundary violations.
- **ADR Compliance Checker** — judges a diff against ADR-0001 rules; pre-commit gate.
- **Behavior Matrix Verifier** — maps code to behavior-matrix rows.
- **Schema Drift Inspector** — Drizzle schema vs. migrations vs. repositories.
- **Workflow Scaffolder** — creates a new workflow with phase files + wiring test.
- **Commit Slicer** — splits a mixed working tree into ordered commits.
- **Explore** — fast read-only codebase Q&A; prefer over chained searches.

## Definition of done for any change

Before the final response after file changes, verify and report:

1. `git status --short` result.
2. Typecheck result (`tsc --noEmit`, via `npm run typecheck`).
3. Lint result (`eslint .`, via `npm run lint`), including warnings.
4. Relevant test result (`vitest run --environment node`, via `npm test`).
5. Pre-commit review result: scope reviewed, dead-code/stale-pattern check complete, and any cleanup either included or deliberately split.
6. ADR result: checked by the `ADR Compliance Checker`, manually judged not applicable, or blocked with a reason.
7. Commit result: small ordered commit hash(es), or an explicit reason commits were not created.

If any validation step cannot be run, explain why before ending. Do not present a task as complete while required validation, ADR review, or commit status is unknown.
