# Project Structure

This repo starts from the rewrite ADR rather than from the old Vue and Express
implementation shape.

## Working rules

- Route flows stay thin. They describe the task and delegate real work to
  domain modules.
- Domain modules own validation, commands, queries, repositories, adapters,
  types, and explicit workflows.
- UI routes stay separate for login, bootstrap, account, preferences,
  connections, admin, TV recommendations, movie recommendations, and history.
- Shared framework code belongs in `src/lib` or `src/components`, not inside a
  generic service layer.
- Product behavior comes from the behavior matrix, not from copied component
  boundaries.

## Initial directory layout

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
  components/
    layout/
    ui/
  config/
  lib/
  modules/
```

## Module implementation template

As each module is implemented, keep its internals local to the module:

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

Do not create those folders just to hold placeholders. Add them when real code
lands for the module.

## Immediate next slice

1. Add Auth.js-backed local login and one-time bootstrap.
2. Introduce Drizzle schema foundations for users, sessions, audit events, and
   service secrets.
3. Define service-connection capability contracts before any provider-specific
   wiring.
4. Build watch-history sync as an explicit workflow with persisted run state.
5. Build recommendation workflows on top of the normalized schema and shared
   capability contracts.
