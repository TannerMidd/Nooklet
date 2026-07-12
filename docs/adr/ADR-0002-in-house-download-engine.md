# ADR-0002: In-House Download Engine

## Status

Accepted

## Date

2026-07-11

## Context

Nooklet's product goal is to replace the Sonarr + Radarr + SABnzbd stack with a
single application. Indexer management, library management, monitoring, release
selection, and import are already native. The one remaining external organ is
the downloader: `download_clients` supports exactly one `clientType`
(`"sabnzbd"`), and the download pipeline is shaped around polling an external
queue (`externalJobId`, queue refresh, missing/duplicate reconciliation
workflows).

Replacing SABnzbd requires a native usenet download engine: NNTP article
fetching, NZB parsing, yEnc decoding, integrity verification and repair (PAR2),
archive extraction (RAR/7z/zip), and a queue the app owns directly instead of
reconciling against someone else's.

Torrent support is explicitly out of scope for the first engine. The
`download_clients` abstraction leaves room for a future torrent engine or a
qBittorrent adapter if that need materializes.

## Decision

Build a native usenet download engine as a new domain module,
`src/modules/download-engine/`, developed in verifiable slices behind the
existing `download_clients` abstraction. SABnzbd remains a supported client
type during the transition and becomes optional once the engine reaches
parity.

### Module shape

```
src/modules/download-engine/
  nzb/          NZB XML parsing + normalization (pure)
  yenc/         yEnc decoding + CRC32 (pure)
  nntp/         NNTP client: connect, auth, TLS, BODY/ARTICLE, pipelining
  scheduler/    segment scheduler: connection pool, retries, per-server limits
  assembly/     article → segment file → assembled output file on disk
  repair/       PAR2 verify/repair (slice 4)
  extract/      RAR/7z/zip extraction (slice 4)
  queue/        engine queue state machine + persistence
  workflows/    enqueue-nzb, process-queue-item, finalize-download
```

Rules follow ADR-0001: pure phases in separate files, thin orchestrators,
wiring tests per workflow, no UI access to the engine except through
module workflows.

### Configuration

Usenet servers are instance-level infrastructure, configured as a new
service-connection type `usenet-server` (host, port, TLS, max connections,
username; password in `service_secrets`, encrypted). Multiple servers with
priorities (primary + block accounts) are supported by the scheduler from the
start; the settings UI may expose a single server first.

### Queue ownership

The engine owns download state directly:

- `download_requests` keeps its role as the user-facing request record.
- A new `engine_downloads` table (one per accepted NZB) tracks: source NZB
  blob/path, state (`queued → fetching → assembling → repairing → extracting →
  importing → completed | failed`), byte counters for progress/speed, priority,
  and error detail. Segments are tracked in `engine_segments` only while a
  download is active; completed segment rows are pruned.
- `downloadClientTypes` gains `"nooklet"`. `queue-indexer-result` resolves to
  the built-in client when a usenet server is configured; SABnzbd submission
  stays as the fallback path until parity.
- The SABnzbd-emulation workflows (missing/duplicate queue reconciliation,
  queue polling) do not apply to the built-in client — engine state is the
  source of truth, so the In Progress screen reads it directly instead of a
  polled snapshot.

### Runtime model

The in-process worker keeps its 15s tick for orchestration (claiming queued
downloads, retrying failures, kicking imports), but active transfers run in a
long-lived engine loop owned by a process-wide singleton (same pattern as the
current worker global). The engine holds NNTP connections open across ticks,
writes segments to a working directory under the app data path
(`data/downloads/incomplete/<downloadId>/`), and moves finished output to
`data/downloads/complete/<downloadId>/` where the existing
`import-completed-downloads` workflow picks it up (its history-fetch phase
gains an engine-backed source alongside the SABnzbd one).

Single-container deployment is unchanged; the engine is in-process and its
state is recoverable from SQLite + the working directory on restart.

### Delivery slices

1. **Pure core (this ADR's first commit):** `nzb/` parsing + `yenc/` decoding
   with unit tests. No I/O, no schema changes.
2. **Transport:** `nntp/` client + `scheduler/` + `assembly/`; verified against
   a scripted fake NNTP server in tests.
3. **Queue + wiring:** schema migration (`usenet-server` connection type,
   `engine_downloads`, `"nooklet"` client type), enqueue/process/finalize
   workflows, worker loop, In Progress UI reads engine state.
4. **Integrity:** PAR2 verify/repair and archive extraction, with quarantine on
   unrecoverable damage.
5. **Parity flip:** built-in engine becomes the default download client;
   SABnzbd demoted to optional legacy integration.

### Security

- Server passwords live in `service_secrets`, encrypted at rest, never logged.
- NZB content and article bodies are treated as untrusted input: parsers are
  pure and size-bounded, extraction runs with path-traversal guards
  (no absolute paths, no `..`, symlinks skipped), and assembled files only
  land inside the engine working directory.
- Outbound NNTP connections go only to explicitly configured servers — the
  SSRF guard model from `safe-fetch` applies to host resolution.

## Consequences

### Positive

- Removes the last external dependency between "user clicks request" and
  "file lands in the library," completing the standalone product goal.
- Engine-owned state kills the polling/reconciliation complexity
  (`missingTickCount`, duplicate-queue workflows) for built-in downloads.
- Pure-core-first slicing keeps every step unit-testable without a usenet
  account.

### Negative

- PAR2 repair and RAR extraction are substantial native-format work; until
  slice 4, damaged posts fail instead of self-repairing, which is below
  SABnzbd parity.
- The in-process engine adds long-lived state to the Next.js server process;
  restart-safety must be exercised deliberately in tests.

### Risks to manage

- Memory discipline: decode and write segments as streams; never buffer a
  whole file.
- Disk-space guards must check the working directory volume before accepting
  an NZB (reuse the drive-overview readings).
- Windows/Linux path semantics differ across dev (Windows) and deploy
  (Linux container); assembly and extraction tests must cover both separators.

## Related

- [`ADR-0001-architecture-principles.md`](ADR-0001-architecture-principles.md)
- [`docs/product/behavior-matrix.md`](../product/behavior-matrix.md) — the
  "Download enqueue and import" row is superseded by engine-owned wording once
  slice 5 lands.
