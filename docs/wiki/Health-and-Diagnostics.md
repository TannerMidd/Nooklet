# Health and diagnostics

Nooklet exposes a small public readiness probe for automation and an authenticated health screen for operators. Use both with the container logs: the probe deliberately reports stable status fields and never returns raw database or worker error text.

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

| HTTP | `status` | Meaning | First action |
| --- | --- | --- | --- |
| `200` | `ok` | SQLite is ready and the worker has ticked recently without a recorded error. | No runtime recovery is required. Check the feature-specific screen if one operation still fails. |
| `200` | `degraded` | SQLite is ready and the worker is responsive, but its latest maintenance pass recorded an error. | Open `/health`, then inspect `docker compose logs --tail=200 app` for the private error detail. |
| `503` | `degraded` | SQLite is ready, but the worker has not started or its last tick is more than 60 seconds old. | Inspect logs for startup, event-loop, or database contention errors; then recreate the container if configuration changed. |
| `503` | `error` | Database initialization, migration, or readiness failed. | Do not delete the volume. Capture logs and make a verified backup before attempting repair. |

The response has `Cache-Control: no-store`. A recent worker error is represented only as `worker.hasError: true`; its text remains in the server logs.

## Probe contract

A healthy response resembles:

```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "backgroundWorker": "ok"
  },
  "worker": {
    "started": true,
    "runningMaintenance": false,
    "lastTickAt": "2026-07-15T17:00:00.000Z",
    "lastSuccessAt": "2026-07-15T17:00:00.000Z",
    "hasError": false
  },
  "timestamp": "2026-07-15T17:00:01.000Z"
}
```

The worker normally ticks every 15 seconds. Nooklet considers it unresponsive after 60 seconds without a tick. `lastSuccessAt` is the most recent pass in which all worker lanes succeeded; `runningMaintenance` identifies an active download/import maintenance pass.

## Docker health semantics

The image health check calls the probe every 30 seconds, waits up to 5 seconds, allows a 20-second startup period, and marks the container unhealthy after three consecutive non-200 responses.

This has two deliberate consequences:

1. `status: "degraded"` with HTTP 200 remains container-healthy because the process, database, and worker are responsive.
2. A stale worker or database failure returns 503 and can mark the container unhealthy.

`restart: unless-stopped` restarts a process that exits; Docker Compose does not automatically replace a merely unhealthy container. Diagnose the underlying condition rather than relying on restart loops.

## Reading the logs

```console
docker compose logs --since=15m app
docker compose logs -f app
```

Useful log prefixes include:

- `[health]` — database readiness or migration failure while serving the probe.
- `[background-worker]` — scheduled job, download import, reconciliation, or lease-heartbeat failure.
- Next.js startup output — invalid environment values, bind failures, or server startup failures.

Stop following logs with `Ctrl+C`; this does not stop the container.

Treat logs as confidential. Although the public health response suppresses raw errors, service libraries and upstream tools can still include hostnames, paths, or operational details in server logs.

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

The worker handles scheduled jobs, built-in download processing, completed-download imports, SABnzbd reconciliation, library scans, metadata refreshes, missing-content searches, watch-history syncs, and AI recommendation runs.

For a responsive but degraded worker:

1. Open `/health` to confirm the failure is current.
2. Inspect the latest `[background-worker]` entry.
3. Test the named integration from **Settings > Connections**, **Settings > Indexers**, or **Settings > Notifications**.
4. Check **Settings > Storage** if the error concerns downloads or imports.
5. Allow the next 15-second pass to retry transient import and integration failures.

Restart only after checking the error. A restart clears the in-memory health summary, but it does not correct an unreachable service, bad credential, full staging drive, or invalid path mapping.

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
