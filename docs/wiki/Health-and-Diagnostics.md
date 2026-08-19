# Health and diagnostics

Nooklet exposes a small public readiness probe for automation and an authenticated health screen for operators. Use both with the container logs: the probe deliberately reports stable status fields and never returns raw database, worker, or download-engine error text.

- Probe: `GET /api/health`
- Operator screen: `/health`
- Setup readiness: `/setup`

See [Troubleshooting](Troubleshooting) for symptom-specific recovery and [Backup, restore, and upgrades](Backup-Restore-and-Upgrades) before changing persistent data.

## Five-minute triage

Run these commands from the directory containing `docker-compose.yml`:

```console
docker compose ps
docker compose logs --tail=200 app
```

Then query the probe. Replace `42021` if `APP_PORT` publishes a different host port.

**macOS or Linux**

```console
curl --fail-with-body http://127.0.0.1:42021/api/health
```

**Windows PowerShell**

```powershell
Invoke-RestMethod http://127.0.0.1:42021/api/health | ConvertTo-Json -Depth 5
```

Interpret the result before restarting anything:

| HTTP  | `status`   | Meaning                                                                                                                            | First action                                                                                                           |
| ----- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `200` | `ok`       | SQLite is ready, the worker has ticked recently without a recorded error, and the built-in engine is idle or healthy.              | No runtime recovery is required. Check the feature-specific screen if one operation still fails.                       |
| `200` | `degraded` | SQLite is ready and the worker is responsive, but a worker pass failed or the built-in download engine has a stalled/failed stage. | Open `/health`, then inspect `docker compose logs --tail=200 app` for the private error detail.                        |
| `503` | `degraded` | SQLite is ready, but the isolated worker has not started or has made no proven progress for more than 60 seconds.                  | The web UI should remain available. Inspect worker/storage logs and host-drive health before recreating the container. |
| `503` | `error`    | Database initialization, migration, or readiness failed.                                                                           | Do not delete the volume. Capture logs and make a verified backup before attempting repair.                            |

The response has `Cache-Control: no-store`. It exposes only the overall status and three component status values; timestamps, counts, stages, and error text remain on the authenticated operator screen and in server logs.

## Probe contract

A healthy response resembles:

```json
{
    "status": "ok",
    "checks": {
        "database": "ok",
        "backgroundWorker": "ok",
        "downloadEngine": "idle"
    }
}
```

The worker normally ticks every 15 seconds. Nooklet considers it unresponsive after 60 seconds without proven persisted progress. The authenticated `/health` view shows the latest tick/success timestamps and maintenance state; the public response intentionally exposes only the compact readiness projection.

`checks.downloadEngine` is `idle`, `ok`, or `degraded`. It is derived from durable engine rows and a small loop-error heartbeat stored beside SQLite. Fetching is considered stalled only after 15 minutes without persisted segment progress. Queue-only work uses a five-minute window, while assembly, repair, and extraction use much longer size-scaled windows. These thresholds are diagnostics: engine degradation remains HTTP 200 while the database and scheduler are responsive, and Nooklet does not kill or restart an active download because of this check.

## Docker health semantics

The image health check calls the probe every 30 seconds, waits up to 5 seconds, allows a 20-second startup period, and marks the container unhealthy after three consecutive non-200 responses.

This has two deliberate consequences:

1. `status: "degraded"` with HTTP 200 remains container-healthy because the process, database, and worker are responsive. This includes a stalled or failed built-in engine stage.
2. A stale worker or database failure returns 503 and can mark the container unhealthy. The web child is a separate process and can remain responsive while the worker is stale.

`restart: unless-stopped` restarts a process that exits; Docker Compose does not automatically replace a merely unhealthy container. Diagnose the underlying condition rather than relying on restart loops.

## Reading the logs

```console
docker compose logs --since=15m app
docker compose logs -f app
```

Useful structured event families include:

- `health_database_probe_failed` for database readiness or migration failure while serving the probe;
- `worker_pass_error`, `worker_heartbeat_persistence_failed`, and `worker_engine_import_failed` for scheduled/maintenance work;
- `download_engine_*` for runner and engine-heartbeat persistence failures;
- `supervisor_*` and `worker_supervisor_*` for child startup, recycling, and shutdown; and
- `[storage-probe]` or `[worker-watchdog]` helper output, plus Next.js startup output, for process-boundary failures that occur outside the application logger.

Stop following logs with `Ctrl+C`; this does not stop the container.

Treat logs as confidential. Although the public health response suppresses raw errors, service libraries and upstream tools can still include hostnames, paths, or operational details in server logs.

Core health, worker, engine, and queue events use structured JSON in production and redact fields whose names or values look like credentials, tokens, authorization headers, or secret-bearing URLs. Supervisor prefixes and third-party runtime output remain separate log sources.

## Database readiness

The first database access opens SQLite, enables WAL mode, sets a five-second busy timeout, enables foreign keys, and applies pending Drizzle migrations. Therefore a successful probe also confirms that the current release can initialize the database schema.

If the database check fails:

1. Save the full container logs.
2. Confirm the `nooklet-data` volume still exists with `docker volume ls`.
3. Confirm the container has not been pointed at an unintended database; Compose forces `DATABASE_URL=file:/app/data/nooklet.db` for the app service.
4. Do **not** run `docker compose down -v`, delete `*.db-wal` while the app is running, or replace the database before taking a verified off-host backup.
5. Follow [Backup, restore, and upgrades](Backup-Restore-and-Upgrades) if restoration is necessary.

To create a verified diagnostic backup while the app is responsive:

```console
docker compose exec app node scripts/backup-database.mjs /app/data/backups/nooklet-diagnostic-2026-07-15.db
docker compose cp app:/app/data/backups/nooklet-diagnostic-2026-07-15.db ./nooklet-diagnostic-2026-07-15.db
```

Use a new filename on every run; the backup tool refuses to overwrite an existing destination and runs SQLite `quick_check` on both source and copy.

## Worker diagnostics

The worker handles scheduled jobs, built-in download processing and imports, library scans, metadata refreshes, missing-content searches, watch-history syncs, AI recommendation runs, and operational-history retention.

For a responsive but degraded worker:

1. Open `/health` to confirm the failure is current.
2. Inspect the latest `worker_pass_error`, `worker_heartbeat_persistence_failed`, or related worker event.
3. Test the named integration from **Settings > Connections**, **Settings > Indexers**, or **Settings > Notifications**.
4. Check **Settings > Storage** if the error concerns downloads or imports.
5. Allow the next 15-second pass to retry transient import and integration failures.

Restart only after checking the error. A restart clears the in-memory health summary, but it does not correct an unreachable service, bad credential, full staging drive, or invalid path mapping.

The supervisors also watch the persisted worker heartbeat. If it has not advanced for 120 seconds (configurable with `NOOKLET_WORKER_STALE_AFTER_MS`, minimum 60 seconds), they terminate and restart only the worker child. Normal `SIGINT`/`SIGTERM` shutdown stops new passes and waits for the active pass to drain before the worker exits; a ten-second supervisor ceiling still prevents shutdown from hanging forever.

The **Built-in download engine** card distinguishes idle, active, and degraded operation. It shows the persisted stage and progress time, unresolved infrastructure failures, and any unexpected detached-loop failure. Bad individual releases classified as content failures remain in Activity rather than degrading the engine as a whole.

## YouTube diagnostics

The authenticated health experience reports the installed yt-dlp, Node, and ffmpeg versions, recent source-sync failures, durable YouTube queue state, and the YouTube runner heartbeat. These details are authenticated because tool errors and destination context can disclose operational information.

Missing or incompatible YouTube tools block only YouTube capability. They do not make movie/TV setup unavailable and do not by themselves turn the public readiness probe into HTTP 503. A transfer that is actively claimed but has stopped making progress degrades health, because the runner is expected to advance or persist a safe failure. An idle queue with a recorded source error remains a feature-level action in the authenticated screen.

When YouTube work fails:

1. Confirm `YT_DLP_PATH`, `FFMPEG_PATH`, and `YOUTUBE_WORK_DIR` in the authenticated diagnostics.
2. Check the reported tool versions; Docker should show the image-pinned yt-dlp and its Node 24 runtime.
3. Inspect the latest source-sync or transfer error and its next retry time.
4. Verify the selected YouTube destination in **Settings → Storage**.
5. Use **Retry** or **Sync now** only after correcting a terminal tool/path problem; transient network and rate-limit failures already use bounded retries.

See [YouTube monitoring and downloads](YouTube-Monitoring-and-Downloads) for the supported content scope and exact retry schedule.

## Frozen-mount containment

Docker Desktop presents Windows bind mounts through a filesystem bridge. A
damaged or disconnected host drive can leave `statx`, `access`, `statfs`, copy,
or directory calls waiting in the kernel, where application-level timeouts
cannot cancel them.

Nooklet contains that failure in three ways:

1. Next.js and the background worker run in different OS processes.
2. Home, Setup, and Storage Settings read SQLite snapshots instead of probing
   mounts while rendering.
3. Capacity probes run in a disposable process with a 30-second kill ceiling.

If the latest probe cannot complete, Storage shows its last capacity as stale
and worker health may become degraded or stale, but ordinary login and
SQLite-backed pages should continue loading. Repair the host drive or Docker
Desktop file-sharing path; repeatedly increasing timeouts cannot release a
kernel-blocked filesystem call.

On Windows, inspect the physical volume as well as Docker. A volume reporting
`HealthStatus: Warning` or `OperationalStatus: Full Repair Needed` requires
host-level attention even if recreating the container temporarily restores
access.

## Configuration changes and recreation

Changes to `.env`, port publishing, or volume bindings are container configuration changes. Apply them with recreation, not a simple restart:

```console
docker compose up -d --build --force-recreate
docker compose ps
```

Then query `/api/health` again. A plain `docker compose restart` reuses the old environment and mounts.

## Collecting a safe support bundle

Record:

- the output of `docker compose ps`;
- the JSON from `/api/health`;
- the relevant log window, not an unbounded log history;
- the current revision from `git rev-parse HEAD`;
- the symptom, time, and action that triggered it;
- whether the runtime is Docker or host-native;
- container-side paths shown by **Settings > Storage**.

Before sharing, remove API keys, passwords, bootstrap tokens, webhook URLs, NZB download URLs, public hostnames you consider private, and full local filesystem paths. Never publish `.env` or a database backup.

## Source references

- [Health route](https://github.com/TannerMidd/Nooklet/blob/main/src/app/api/health/route.ts)
- [Worker readiness policy](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/jobs/worker-readiness.ts)
- [Background worker](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/jobs/worker.ts)
- [Database initialization](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/database/client.ts)
- [Container health check](https://github.com/TannerMidd/Nooklet/blob/main/Dockerfile)
