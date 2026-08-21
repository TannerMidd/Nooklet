# ADR-0002: In-House Download Engine

## Status

Accepted and implemented; runtime placement amended by ADR-0004.

## Date

2026-07-11; current-alignment update 2026-08-07.

### 2026-08-07 implementation amendment

The implemented engine deliberately narrows three parts of the original
delivery design:

- One canonical, instance-wide Usenet server is supported. Its configured
  connection count provides parallelism within a transfer; priority and block
  servers are not part of the accepted current topology.
- Per-segment scheduling and byte-range coverage are process-local. SQLite
  persists aggregate byte and segment counters on `engine_downloads`, but
  there is no `engine_segments` table. After a restart, an interrupted transfer
  is safely parked as paused. Explicit Resume resets its progress counters,
  clears its incomplete directory, and fetches its stored NZB again from the
  beginning.
- yEnc parts are written directly into their final byte ranges while the row is
  `fetching`. There is no separate persisted `assembling` state. A compatibility
  migration maps any historical `assembling` row back to a resumable state.

This amendment treats restart recovery as durable queue recovery, not byte-level
resume. It avoids high-churn SQLite segment bookkeeping and a second assembly
copy at the cost of re-transferring partial work after a process restart. A
future decision may add resumable segments or multi-server failover if operating
experience justifies that complexity.

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
- `engine_downloads`, including its aggregate progress counters and encrypted
  NZB payload, is the durable transfer source of truth. Per-segment state exists
  only while the runner owns an active transfer.
- The authenticated queue API filters items through the caller's download
  associations.
- The separately supervised worker owns transfer, finalization, import, and
  cancellation. The web process never performs media-filesystem work.
- Process shutdown stops new passes and drains the active pass to a durable
  boundary, with a bounded force-kill ceiling. A stale persisted heartbeat is
  diagnostic-only and does not terminate running work; an actually exited
  worker is restarted.
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
- A worker restart parks the interrupted transfer. Explicit Resume discards
  partial transfer bytes and fetches the stored NZB again; byte-level resume is
  not implemented.
- One Usenet server is resolved, so primary/block-account failover is not
  implemented.
- Windows and Linux path semantics require dedicated containment tests.

## Related

- [`ADR-0001-architecture-principles.md`](ADR-0001-architecture-principles.md)
- [`ADR-0004-isolate-filesystem-work-from-web-runtime.md`](ADR-0004-isolate-filesystem-work-from-web-runtime.md)
- [`docs/product/behavior-matrix.md`](../product/behavior-matrix.md)
