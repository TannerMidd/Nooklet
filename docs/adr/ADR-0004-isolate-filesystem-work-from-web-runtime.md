# ADR-0004: Isolate Filesystem Work from the Web Runtime

## Status

Accepted

## Date

2026-07-20; current-alignment update 2026-08-06.

> Current alignment: the supervisors monitor the persisted worker heartbeat
> and report staleness after 120 seconds by default. Staleness degrades health
> and is logged once, but never terminates the worker. The supervisor restarts a
> worker only after it actually exits, while explicit application shutdown keeps
> a bounded force-kill ceiling.

## Context

Nooklet runs on Docker Desktop with operator-controlled Windows media folders
bind-mounted into its Linux container. A damaged drive or a stalled Docker
Desktop file-sharing bridge can leave Linux filesystem syscalls waiting inside
the kernel indefinitely. JavaScript timeouts and `AbortController` cannot
cancel those calls.

The original runtime served Next.js requests, ran scheduled jobs, downloaded
and imported media, and probed every storage mount in one Node.js process. Four
concurrent `statx`, `access`, or `statfs` calls could therefore occupy the
process-wide libuv filesystem pool. Database-only routes could remain fast
while page rendering, authentication, and static-asset reads queued forever.
The old health route compounded the problem by checking a cached database
handle and process-local worker timestamps rather than proving database and
worker progress.

Increasing the filesystem timeout is not a recovery mechanism: the underlying
kernel call remains blocked. Increasing the libuv pool only delays exhaustion.
Restarting the container restores service temporarily but does not create a
fault boundary or repair the host filesystem.

## Decision

Keep the supported one-container deployment, but supervise separate Node.js OS
processes for the web application and background worker.

### Runtime boundary

- A one-shot bootstrap process applies migrations before either long-lived
  child starts.
- The web child serves Next.js and performs database, authentication, and
  bounded remote-service work. It does not start the download runner or job
  worker.
- The worker child owns scheduled jobs, engine transfer/finalization, import,
  scanning, deletion, cancellation cleanup, and other media-filesystem work.
- Worker control intent and observable transfer telemetry are durable SQLite
  state, not process-local signals, so pause, resume, cancel, speed, and restart
  recovery continue to work across the process boundary.
- `tini` remains PID 1. A Node supervisor starts the children, forwards
  shutdown, restarts an ordinarily crashed worker with backoff, and preserves
  the web process when an uninterruptible worker cannot be reaped.

### Filesystem containment

- Home, Setup, and Storage Settings read persisted storage snapshots. They
  never call `stat`, `statfs`, or `access` on a media/download mount while
  rendering.
- Storage probes run in a disposable child process. The supervisor abandons
  and kills that process at a fixed deadline; the last successful capacity is
  retained and marked stale when no fresh result arrives.
- Long-running or destructive web actions enqueue durable worker jobs instead
  of scanning, importing, or deleting files inside the request process.
- Library-path canonicalization runs in a disposable validator child. The
  parent returns a stable timeout error without waiting for a child stuck in an
  uninterruptible filesystem call.
- Queue admission uses the latest valid persisted capacity snapshot. The
  worker revalidates operational filesystem state before doing physical work.

The stronger invariant is that failure of an optional media/download mount may
degrade storage and worker readiness, but it must not prevent ordinary login,
navigation, static assets, or SQLite-backed views from responding.

### Health and progress

- The public health route executes a real `SELECT 1` against SQLite.
- Worker health is written atomically beside SQLite on the Docker named volume
  and read by the web process without importing the worker graph.
- Worker passes are serialized. A later timer tick cannot mark success while
  an earlier maintenance pass is still unresolved.
- Successful lease heartbeats prove progress for legitimately long network/AI
  jobs. Filesystem lanes run serially and only completion advances worker
  progress, so another lane cannot mask a wedged mount. Missing, corrupt, or
  stale heartbeat state fails health closed without terminating the worker.
- Storage freshness and probe failures remain separate from the last known
  capacity so operators can distinguish stale telemetry from an empty drive.

## Alternatives considered

### Promise timeouts around filesystem calls

Rejected because a timeout stops awaiting the promise but does not release the
libuv thread or cancel a FUSE request already waiting in the kernel.

### Increase `UV_THREADPOOL_SIZE`

Rejected as a primary fix because a wedged mount can eventually consume any
finite pool, while synchronous calls can block the event loop directly.

### Restart the whole container when the worker stalls

Rejected as the default recovery because a persistent host-disk fault would
turn a contained worker failure into repeated user-visible web outages. A
stale worker remains visible in health until the operator repairs the mount or
recreates the container.

### Separate web and worker containers

Deferred. It is the strongest mount-visibility boundary, but it expands the
Compose topology, health model, and SQLite volume coordination. Separate OS
processes plus enforced request-path containment solve the observed outage
without changing the one-container installation contract.

## Consequences

### Positive

- A stuck media filesystem can no longer exhaust the web server's libuv pool.
- Storage pages remain useful through explicit fresh, stale, error, and
  unavailable snapshot states.
- Health can distinguish a live database/web process from a stale worker.
- Process-local engine controls no longer silently break when work is moved out
  of Next.js.
- Long work is restart-visible and user actions return promptly.

### Negative

- The image now contains an explicit worker bundle and a small supervisor.
- Some actions report that work was queued instead of waiting for final file
  counts in the HTTP response.
- SQLite has two long-lived clients, so startup ordering, WAL behavior, and
  short transactions require regression coverage.
- A kernel task in uninterruptible sleep may remain until Docker or the host
  filesystem recovers; containment prevents it from taking down the web UI but
  cannot repair the host drive.

### Risks to manage

- New request handlers must not import or invoke bind-mount filesystem work.
- New cross-process controls must be persisted before acknowledging the user
  and fenced again before final output is committed.
- Supervisor shutdown must be bounded even when a child cannot be reaped.
- A stale capacity snapshot must never be presented as a fresh admission fact.
- Release tests must exercise the production standalone bundle and distinct
  PIDs, not only in-process unit tests.

## Related

- [`ADR-0001-architecture-principles.md`](ADR-0001-architecture-principles.md)
- [`ADR-0002-in-house-download-engine.md`](ADR-0002-in-house-download-engine.md)
- [`ADR-0003-durable-season-fulfillment.md`](ADR-0003-durable-season-fulfillment.md)
- [`docs/wiki/Architecture.md`](../wiki/Architecture.md)
- [`docs/wiki/Health-and-Diagnostics.md`](../wiki/Health-and-Diagnostics.md)
- [`docs/wiki/Storage-and-Path-Mapping.md`](../wiki/Storage-and-Path-Mapping.md)
