# Downloads and Import

> Applies to the current `main` implementation. Last source review: 2026-07-15.

Nooklet can fetch Usenet releases directly through its built-in downloader or submit them to legacy SABnzbd. Both paths converge on Nooklet-owned request, queue, import, media-file, and audit records.

## End-to-end flow

```mermaid
sequenceDiagram
  actor User
  participant UI as Search or request UI
  participant Request as Request workflow
  participant Indexer as Newznab indexer
  participant Capacity as Staging capacity gate
  participant Engine as Built-in engine queue
  participant NNTP as Usenet server
  participant Finalize as PAR2 and extraction
  participant Worker as 15-second maintenance pass
  participant Library as Final library path

  User->>UI: Request movie, season, or episode
  UI->>Request: Authorized typed request
  Request->>Indexer: Search configured categories
  Indexer-->>Request: Protected release candidates
  Request->>Capacity: Check DOWNLOAD_ENGINE_DIR filesystem
  Capacity-->>Request: Accept or explain required space
  Request->>Engine: Persist NZB and queue record
  Engine->>NNTP: Fetch and decode article segments
  NNTP-->>Engine: yEnc payloads
  Engine->>Finalize: Repair, restore names, extract
  Finalize-->>Engine: Completed output path
  Worker->>Engine: Find unimported completion
  Worker->>Library: Organize into approved destination
  Worker->>Request: Mark imported outcome and audit
```

Primary sources: [request and queue workflows](https://github.com/TannerMidd/Nooklet/tree/main/src/modules/downloads/workflows), [engine runtime](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/download-engine/runtime/engine-runner.ts), and [finalization](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/download-engine/finalize/finalize-download.ts).

## Prerequisites

A complete built-in download path requires:

1. A verified Usenet server connection.
2. A verified Newznab indexer with categories for the requested media type.
3. A reachable and writable `DOWNLOAD_ENGINE_DIR`.
4. A reachable and writable final movie or TV library destination.
5. A responsive background worker.

TMDB is required by the current setup-readiness path for reliable discovery and title identity. AI is optional and is not required to search for or request a known title.

Torznab indexers can currently be configured and searched, but queue submission rejects torrent results. Use Newznab for a functional download path. Torrent transport is not implemented.

## Staging capacity policy

The capacity gate measures the filesystem containing `DOWNLOAD_ENGINE_DIR`. Free space on a final TV or movie drive does not substitute for staging space.

For a new NZB, the request-time requirement is:

```text
required bytes = 512 MiB
               + 2 x remaining bytes of all active engine downloads
               + 2 x declared bytes of the new NZB
```

The factor of two reserves room for downloaded/assembled data and an unpacked copy. The 512 MiB term is a fixed safety reserve. This is a conservative admission estimate, not a guarantee that every archive will expand within the estimate.

Use **Settings > Storage** to see the configured path, effective path, underlying filesystem capacity, active reservation, and maximum estimated new download size. See [Storage and Path Mapping](Storage-and-Path-Mapping).

Source: [enqueue capacity check](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/download-engine/workflows/enqueue-nzb-download.ts) and [storage overview](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/storage/queries/get-storage-overview.ts).

## Built-in engine state

```mermaid
stateDiagram-v2
  [*] --> queued: NZB accepted
  queued --> fetching: runner claims next priority
  queued --> paused: pause
  fetching --> paused: pause between segments
  paused --> queued: resume
  fetching --> extracting: transfer intact
  fetching --> repairing: missing or damaged segments
  extracting --> completed: finalization succeeds
  repairing --> completed: repair/finalization succeeds
  fetching --> failed: no usable articles or runtime error
  extracting --> failed: extraction error
  repairing --> failed: unrecoverable set
  completed --> [*]: import pass marks importedAt
  failed --> [*]: failure pass closes linked request
```

The schema also contains an `assembling` enum value for design compatibility, but the current runner does not persist that state. There is no engine-level `importing` state; importing is represented by the outer `download_requests` workflow and the engine row's `importedAt` timestamp.

On process startup, rows stranded in `fetching`, `assembling`, `repairing`, or `extracting` are returned to `queued`. The runner then removes the old incomplete directory and starts the transfer again from the encrypted stored NZB. Per-segment restart resume is not implemented.

## Queue behavior

- The global engine runner claims one queued download at a time across users.
- Priority and creation time determine claim order.
- The active transfer uses up to the configured NNTP connection count, currently limited to 20.
- Pause is observed between segment operations; an active fetch is not terminated in the middle of a filesystem write.
- Resume returns the item to `queued` and starts the runner.
- Remove deletes engine staging/completion data and marks linked request state cancelled/failed.
- Items in repair or extraction cannot be removed until post-processing finishes.
- Queue-wide pause/resume and item reorder operations are source-local.

The browser queue API combines built-in and SABnzbd snapshots for display while preserving `source: "engine" | "sabnzbd"` for correct controls. See [HTTP API](HTTP-API).

## Repair and extraction

The Docker image includes:

| Tool | Use | Missing-tool behavior on a native install |
| --- | --- | --- |
| `par2` | Verify, repair, and restore obfuscated names | Finalization continues with a warning and skips PAR2 verification/repair |
| `unrar` | Inspect and extract RAR sets | RAR extraction fails |
| `7zz` | Inspect and extract ZIP/7z sets | ZIP/7z extraction fails |

Extraction validates archive entry paths, rejects traversal and unsafe links, and keeps output within the engine workspace. Operators running Nooklet directly on a host must provide these exact executable names on `PATH`.

## Import behavior

The worker checks for completed built-in downloads on each 15-second maintenance pass. The import workflow:

1. Resolves the linked request and selected destination.
2. Confirms the source is an engine completion and the destination is an approved media path.
3. Inspects regular media files and rejects unsafe paths.
4. Organizes files without unsafe traversal or silent overwrite.
5. Persists media-file and import records.
6. Triggers library state refresh and notification/audit behavior.
7. Marks the engine row imported and clears retained NZB/password material.

Built-in imports run before legacy SABnzbd reconciliation, so a SAB failure cannot prevent a completed engine item from being imported.

## Legacy SABnzbd path

SABnzbd remains an optional downloader. Nooklet submits a server-resolved NZB, polls queue/history, maps SAB-reported completion paths when needed, imports matching files, removes duplicates, and retries genuinely missing queue entries.

Use `SABNZBD_PATH_MAPPINGS` only when the path SAB reports cannot be resolved by the Nooklet process. In Docker, both sides of the mapping are container-visible paths. `APPROVED_DOWNLOAD_ROOTS` is the fallback boundary for SAB files when mappings are not used.

| Capability | Built-in engine | SABnzbd |
| --- | --- | --- |
| Queue source of truth | Nooklet SQLite | SAB API snapshot/history |
| Transfer transport | Direct NNTP | SAB-managed |
| Repair/extraction | Nooklet container tools | SAB-managed |
| Completion import | Nooklet worker | Nooklet worker |
| Missing/duplicate reconciliation | Not required | Required |
| Path translation | Engine workspace is known | Sometimes requires `SABNZBD_PATH_MAPPINGS` |

## Failure and recovery guide

| Symptom | Likely boundary | Recovery |
| --- | --- | --- |
| "Not enough disk space" despite free media drives | Staging filesystem | Inspect `DOWNLOAD_ENGINE_DIR` in Settings > Storage; move it to a spacious bind mount and recreate the container |
| Download restarts after app restart | Current engine recovery semantics | Expected: per-segment resume is not implemented |
| RAR/7z extraction fails on native install | Missing executable | Install `unrar` or `7zz` with the exact command name on `PATH` |
| Import cannot reach destination | Bind mount, approved root, or permissions | Verify the container path, `APPROVED_MEDIA_ROOTS`, and write access |
| SAB completion is never found | Reported path differs from Nooklet-visible path | Configure and verify `SABNZBD_PATH_MAPPINGS` |
| Queue control returns conflict | Item entered post-processing or changed state | Refresh the queue and wait for repair/extraction to complete |
| Verified Torznab result cannot queue | Torrent transport unsupported | Configure a Newznab indexer |

## Current limitations

- One Usenet service connection is resolved; primary/block-account failover is not implemented.
- The engine processes one download at a time, although segment fetching within it is concurrent.
- Per-segment restart resume is not implemented.
- Torrent downloads are not implemented.
- The staging formula uses NZB-declared size and a two-copy estimate; unusually expansive archives may need more room.
- Post-processing is not safely cancellable once repair or extraction begins.

Related: [Storage and Path Mapping](Storage-and-Path-Mapping) | [Health and Diagnostics](Health-and-Diagnostics) | [Troubleshooting](Troubleshooting)
