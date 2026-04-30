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
  connections, admin, TV recommendations, movie recommendations, and history.
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
      history/
      movies/
      settings/
        account/
        connections/
        preferences/
      tv/
    api/
  components/
    layout/
    library/
    recommendations/
    ui/
  config/
  lib/
  modules/
```

## Module template

Each module under `src/modules/<module>/` keeps its internals local:

```text
src/modules/<module>/
  adapters/
  commands/
  queries/
  repositories/
  schemas/
  types/
  workflows/
```

Folders are created only when real code lands. No placeholder folders.

The public surface of a module is its `commands/`, `queries/`, and
`workflows/` exports. Repositories and adapters are internal — other modules
reach them via a query/command/workflow, never by direct import.

## Workflow layout

Workflows live at `src/modules/<module>/workflows/<workflow>/` with one file
per phase plus a thin orchestrator and a wiring test:

```text
workflows/<workflow>/
  index.ts          # thin orchestrator, no business logic
  index.test.ts     # mocks each phase, asserts order and propagation
  types.ts          # shared input/output and context types
  <phase-1>.ts
  <phase-2>.ts
  ...
```

Phase lists for the major workflows are fixed in the ADR.
