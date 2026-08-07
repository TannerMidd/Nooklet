# Project Structure

This document describes how Nooklet is organized. Architectural rules
come from [ADR-0001](../adr/ADR-0001-architecture-principles.md). Product
behavior comes from the [behavior matrix](../product/behavior-matrix.md).

## Working rules

- Route handlers and server actions stay thin. They describe the task and
  delegate real work to domain modules.
- Domain modules own validation, commands, queries, repositories, adapters,
  types, and explicit workflows.
- UI routes stay separate for login, bootstrap, account, preferences,
  connections, admin, TV recommendations, movie recommendations, built-in
  library management, direct media search, active downloads, and history.
- Shared framework code belongs in `src/lib` or `src/components`, not inside
  a generic service layer.
- Product behavior is sourced from the behavior matrix, not from any one
  screen's component boundary.

## Top-level directory layout

```text
src/
  app/
    (auth)/
      bootstrap/
      login/
    (workspace)/
      admin/
      analytics/
      discover/
      health/
      history/
      home/
      in-progress/
      library/
      movies/
      recommendations/
      search/
      settings/
      setup/
      tv/
    api/
  components/
    discover/
    layout/
    library/
    media-library/
    recommendations/
    setup/
    storage/
    ui/
  config/
  lib/
  modules/
    admin/
    discover/
    download-engine/
    downloads/
    identity-access/
    indexers/
    instance-config/
    jobs/
    media-library/
    notifications/
    preferences/
    readiness/
    recommendations/
    service-connections/
    storage/
    users/
    watch-history/
```

## Module template

Each module under `src/modules/<module>/` keeps its internals local:

```text
src/modules/<module>/
  public.ts        # present when the module exposes a narrow facade
  adapters/
  commands/
  queries/
  repositories/
  schemas/
  types/
  workflows/
```

Folders are created only when real code lands. No placeholder folders.

Cross-module consumers use the target module's `public.ts` facade when one is
present. Those facades export the typed commands, queries, workflows, and
narrow capabilities that other domains need. Modules without a facade may
expose a workflow, query, or type directly, but their `repositories/` and
`adapters/` folders remain private to that module.

`npm run boundaries:check` scans production module sources and rejects direct
cross-module imports into another module's `repositories/` or `adapters/`
folders. This is a focused import-boundary invariant, not a claim that every
possible module cycle or database access pattern is statically proved.

## Workflow layout

Larger workflows generally live at `src/modules/<module>/workflows/<workflow>/`
with one file per phase plus an orchestrator and wiring tests:

```text
workflows/<workflow>/
  index.ts          # thin orchestrator, no business logic
  index.test.ts     # mocks each phase, asserts order and propagation
  types.ts          # shared input/output and context types
  <phase-1>.ts
  <phase-2>.ts
  ...
```

Smaller workflows may remain a single `.ts` file with a colocated test. Some
older, high-complexity workflows have not yet been decomposed to this target
shape; the current filesystem and imports are authoritative when this guide and
implementation differ.
