# ADR-0002: In-House Download Engine

## Status

Accepted and implemented; runtime placement amended by ADR-0004.

## Date

2026-07-11; current-alignment update 2026-08-06.

## Context

Nooklet's standalone product goal requires the application to own the path from
a protected Newznab result to an imported media file. Delegating transfer,
queue state, repair, extraction, and completion reporting to a second download
application created another credential boundary and required polling and
reconciliation against an external queue.

The required native capability includes NNTP article fetching, NZB parsing,
yEnc decoding, integrity verification and repair (PAR2), archive extraction,
durable queue state, restart recovery, cancellation, capacity admission, and
safe import.

Torrent support remains outside this decision.

## Decision

The built-in Usenet engine under `src/modules/download-engine/` is Nooklet's
only download client. New requests fetch and validate NZBs server-side, enqueue
durable engine rows, and expose caller-scoped queue state through
`/api/downloads/queue`. Completed output is imported through Nooklet-owned
request, media-file, and audit records.

The external compatibility client, its connection type, queue route, path
translation settings, polling, duplicate/missing reconciliation, and import
workflows have been removed. Historical database discriminator values may
remain readable only where an upgrade must safely reject or preserve old data;
they are not configurable or executable runtime paths.

### Module shape

```text
src/modules/download-engine/
  assembly/     output-name sanitization
  config/       verified Usenet-server resolution
  finalize/     PAR2, name restoration, guarded extraction, and final move
  nntp/         TLS NNTP connection, authentication, and article fetch
  nzb/          NZB XML parsing and normalization
  queries/      caller queue projection and engine health
  queue/        durable engine rows, public queue model, and actions
  runtime/      worker-owned drain loop, capacity recheck, and heartbeat
  scheduler/    segment scheduling, retry, and connection limits
  testing/      local TLS and yEnc test fixtures
  workflows/    enqueue and persisted queue-control intent
  yenc/         yEnc decoding and CRC32
```

Completed-download import remains in the `downloads` module because it owns the
outer request/import lifecycle and destination association. Rules follow
ADR-0001: pure phases stay separate from I/O, orchestrators are thin, private
repository/adapter folders are not imported across module boundaries, and
workflow wiring has focused tests.

### Configuration and ownership

The `usenet-server` service connection is instance-level infrastructure. It
stores the host, port, TLS policy, connection count, username, and encrypted
password. Shared configuration resolves through the persisted
`instance_configuration` owner so every administrator sees the same effective
server, indexers, and library paths.

`DOWNLOAD_ENGINE_WORK_DIR` contains incomplete articles, assembly, repair, and
extraction work. `DOWNLOAD_ENGINE_DIR` contains finalized staging output before
import. Both are revalidated by the worker; the lower effective capacity limits
admission.

### Queue ownership and runtime

- `download_requests` remains the user-facing request record.
- `engine_downloads` and active segment rows are the durable transfer source of
  truth.
- The authenticated queue API filters items through the caller's download
  associations.
- The separately supervised worker owns transfer, finalization, import, and
  cancellation. The web process never performs media-filesystem work.
- Process shutdown stops new passes and drains the active pass to a durable
  boundary. A supervisor watchdog recycles a worker whose persisted heartbeat
  stops advancing.
- Imports trigger a scan limited to the affected active library path IDs.

### Security

- Server passwords live in encrypted service secrets and are never returned in
  queue or health responses.
- NZB content, article bodies, archive names, and output paths are untrusted,
  size-bounded inputs.
- Extraction rejects absolute paths, traversal, and symlink escapes.
- NNTP connections use TLS with certificate verification and target only the
  explicitly configured server.
- Public health exposes component status only; detailed stages and errors are
  available to authenticated operators.

## Consequences

### Positive

- One application owns request, transfer, repair, extraction, queue, import,
  and audit state.
- Durable engine state eliminates external queue polling and reconciliation.
- Authorization can be enforced against Nooklet-owned request associations.
- Capacity, cancellation, and restart behavior are testable without another
  application's API.

### Costs and constraints

- Native PAR2 and archive tooling remain container/runtime dependencies.
- Transfer code requires strict streaming and disk-space discipline.
- The supported topology is one web process and one worker process against one
  SQLite database; this ADR does not claim horizontal scaling.
- Windows and Linux path semantics require dedicated containment tests.

## Related

- [`ADR-0001-architecture-principles.md`](ADR-0001-architecture-principles.md)
- [`ADR-0004-isolate-filesystem-work-from-web-runtime.md`](ADR-0004-isolate-filesystem-work-from-web-runtime.md)
- [`docs/product/behavior-matrix.md`](../product/behavior-matrix.md)
