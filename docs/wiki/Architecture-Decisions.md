# Architecture Decisions

> ADRs preserve decision history. They describe accepted direction and tradeoffs, but current runtime claims must still be verified against code and tests.

## Decision index

| ADR                                                                                                                                                                     | Status   | Decision                                                                                                       | Current implementation note                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ADR-0001: Architecture Principles](https://github.com/TannerMidd/Nooklet/blob/main/docs/adr/ADR-0001-architecture-principles.md)                                       | Accepted | Domain-oriented, workflow-oriented Next.js application with one-container deployment                           | Core dependency direction remains active; several inventory examples predate the current module tree and integrations                                |
| [ADR-0002: In-House Download Engine](https://github.com/TannerMidd/Nooklet/blob/main/docs/adr/ADR-0002-in-house-download-engine.md)                                     | Accepted | Native Usenet engine as Nooklet's sole movie/TV download client                                                | Native Usenet transfer, queue control, repair, extraction, import, and caller-scoped queue presentation are implemented; YouTube uses its own runner |
| [ADR-0003: Durable Season Fulfillment](https://github.com/TannerMidd/Nooklet/blob/main/docs/adr/ADR-0003-durable-season-fulfillment.md)                                 | Accepted | Persist season intent above physical pack/episode attempts, with classified recovery and restart-safe fallback | Implemented by fulfillment tables, worker maintenance, grouped Activity, and plan-scoped release exclusions                                          |
| [ADR-0004: Isolate Filesystem Work from the Web Runtime](https://github.com/TannerMidd/Nooklet/blob/main/docs/adr/ADR-0004-isolate-filesystem-work-from-web-runtime.md) | Accepted | Separate web and worker OS processes; serve pages from durable snapshots and queue mount work                  | Implemented by the container supervisor, standalone worker, disposable storage probe, persisted engine controls, and request-path containment tests  |

## ADR-0001 implementation alignment

Still reflected in current code:

- App Router pages and boundaries delegate to domain commands, queries, and workflows.
- UI code is not intended to call raw vendor adapters.
- Server writes are task-shaped rather than a generic settings mutation endpoint.
- SQLite, Drizzle, Auth.js, Zod, and a separately supervised persisted worker form the core runtime.
- Local login and explicit first-admin bootstrap are implemented.
- The shipped deployment has one supervised application container plus an internal YouTube proof-of-origin provider sidecar.

Historical inventory that should not be presented as current behavior:

- Jellyfin is mentioned, but current service/watch-history types are Plex, Tautulli, Trakt, and manual history where applicable.
- Auth.js currently exposes credentials login only. Trakt's OAuth token is stored connection data, not an Auth.js provider.
- `credential-vault` and `metadata` are conceptual ownership areas, not physical module directories.
- The current schema uses encrypted JWT cookies plus a narrow `auth_sessions` revocation registry. It does not use Auth.js database-session strategy or implement the ADR's illustrative OAuth-account and separate service-user-selection tables.
- The dependency list does not show shadcn/Radix packages; UI primitives are repository components styled with Tailwind.
- ADR-0001's illustrative project-structure inventory predates the current routes and 18 physical modules; the separate current [project-structure note](https://github.com/TannerMidd/Nooklet/blob/main/docs/architecture/project-structure.md) has been reconciled.

## ADR-0002 implementation alignment

Implemented:

- Pure NZB parsing and yEnc/CRC32 logic.
- NNTP client and per-download connection-pool scheduler.
- Persisted engine queue, progress, priority, pause/resume/remove/reorder controls.
- PAR2 verification/repair, name restoration, guarded RAR/7z/ZIP extraction.
- Worker-backed completion import.
- Caller-scoped built-in queue presentation at `/api/downloads/queue`.
- Conservative staging-capacity admission check.

Accepted current constraints:

- One Usenet service connection is resolved; multiple priority/block servers are not implemented.
- `importing` is not an engine state. It belongs to the outer download-request/import workflow.
- Assembly happens in place during `fetching`; there is no separate persisted `assembling` state.
- A restart requeues and starts the download from the stored NZB; segment-level resume is not implemented.
- The runner drains one engine download at a time, using concurrent NNTP connections within that transfer.

See [Downloads and Import](Downloads-and-Import) for the observed state model.

## ADR-0003 implementation alignment

Implemented:

- One open fulfillment per user, title, and season.
- Physical pack and episode requests attached as plan attempts.
- Up to three automatic pack release attempts with fulfillment-scoped exclusions.
- Immediate no-pack fallback and post-import incomplete-pack coverage checks.
- Independent missing, monitored, aired episode searches with bounded concurrency.
- Persisted transient, active-coverage, and unavailable-release retry times.
- Infrastructure/configuration blocking instead of episode fan-out.
- Worker restart recovery, grouped Activity presentation, and terminal-only lifecycle notification behavior.

The coordinator does not make transfer bytes resumable. Engine restart behavior remains the separate concern documented by ADR-0002.

## How to add an ADR

Create the next sequential file under `docs/adr/` using this structure:

```md
# ADR-NNNN: Decision title

## Status

Proposed | Accepted | Superseded | Rejected

## Date

YYYY-MM-DD

## Context

What problem and constraints require a durable decision?

## Decision

What is being chosen, including explicit scope and boundaries?

## Consequences

### Positive

### Negative

### Risks to manage
```

An ADR should:

- decide one durable architectural concern;
- name alternatives and constraints without becoming an implementation diary;
- distinguish requirements from delivery sequencing;
- link to related decisions;
- be amended or superseded when the decision changes;
- retain historical text while clearly labelling later implementation divergence.

## Review policy

- Review accepted ADRs when a change alters their named boundary, deployment model, state machine, security policy, or module ownership.
- Add a dated implementation note or a superseding ADR instead of silently editing historical rationale into a different decision.
- Do not cite an ADR as evidence that a feature is implemented. Link the workflow, schema, test, or deployment source as well.
- Keep [Architecture](Architecture) focused on observed current structure and this page focused on decision history.

Related: [Architecture](Architecture) | [Documentation Policy](Documentation-Policy) | [Development Guide](Development-Guide)
