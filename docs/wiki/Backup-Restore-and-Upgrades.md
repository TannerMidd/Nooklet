# Backup, restore, and upgrades

Nooklet stores application state in SQLite. In the standard Docker deployment, the database is `/app/data/nooklet.db` inside the `nooklet-data` volume. Treat a verified, off-host database copy as a required part of every upgrade or recovery plan.

> [!CAUTION]
> `docker compose down -v` deletes the named data volume. Ordinary updates never require `-v`.

## What must be protected

| Asset | Default Docker location | Included in a database backup? | Protection |
| --- | --- | --- | --- |
| Users, settings, requests, history, jobs, and audit events | `/app/data/nooklet.db` | Yes | Run the Nooklet backup tool and copy the result off the container host. |
| Authentication and encryption keys | `.env` on the host | No | Back up securely and separately; never commit it. |
| Built-in download workspace | `/app/data/downloads` by image default, or `DOWNLOAD_ENGINE_DIR` | No | Preserve only if resuming active downloads matters. A bind-mounted staging drive needs its own backup policy. |
| Final movie and TV files | Operator-defined bind mounts | No | Protect with the media storage system's backup or redundancy plan. |
| Compose overrides and reverse-proxy configuration | Host files | No | Store sanitized templates in version control; protect live secrets separately. |

Database backups contain password hashes, operational history, and encrypted integration credentials. Encryption of saved credentials does not make the backup public-safe: restrict access and encrypt off-host copies at rest.

## Create a verified Docker backup

Choose a unique timestamped filename. The backup command refuses to overwrite an existing file.

**macOS or Linux**

```console
mkdir -p backups
docker compose exec app node scripts/backup-database.mjs /app/data/backups/nooklet-2026-07-15T1700Z.db
docker compose cp app:/app/data/backups/nooklet-2026-07-15T1700Z.db ./backups/nooklet-2026-07-15T1700Z.db
sha256sum ./backups/nooklet-2026-07-15T1700Z.db
```

**Windows PowerShell**

```powershell
New-Item -ItemType Directory -Force .\backups | Out-Null
docker compose exec app node scripts/backup-database.mjs /app/data/backups/nooklet-2026-07-15T1700Z.db
docker compose cp app:/app/data/backups/nooklet-2026-07-15T1700Z.db .\backups\nooklet-2026-07-15T1700Z.db
Get-FileHash .\backups\nooklet-2026-07-15T1700Z.db -Algorithm SHA256
```

The script:

1. opens the source read-only;
2. runs SQLite `quick_check` on the source;
3. uses SQLite's online backup API;
4. runs `quick_check` on the completed copy;
5. restricts the file to mode `0600` where POSIX permissions are available; and
6. atomically renames the verified temporary copy into place.

The copy inside `/app/data/backups` remains on the same Docker volume as the live database. It is a convenient staging copy, **not** an off-host backup. Keep at least one tested copy on different storage.

## Host-native backup

For a host-native installation with dependencies installed and `.env` present:

```console
npm run db:backup -- backups/nooklet-2026-07-15T1700Z.db
```

Without an explicit destination, the script generates a unique file under `backups/`. The explicit filename is preferable in an operations log.

## Test the recovery chain

A backup policy is incomplete until restoration has been rehearsed on an isolated instance.

1. Record the Nooklet Git revision associated with the backup: `git rev-parse HEAD`.
2. Record the backup SHA-256 digest and creation time.
3. Restore into a separate Compose project with separate ports, secrets, and volume; see [Multi-instance deployments](Multi-Instance-Deployments).
4. Confirm `/api/health` returns HTTP 200.
5. Sign in, inspect users and settings, and confirm representative library/request history.
6. Delete the test instance only after the result is documented. Never point it at production download or writable media paths.

## Restore a Docker database

Restoration replaces users, configuration, history, jobs, and request state with the backup's point-in-time contents. It does not roll back media files or downloads. Reconcile any files created after the backup manually.

The repository provides a backup creator that runs SQLite `quick_check`, but it does **not** provide an automated restore tool, recovery orchestrator, or end-to-end restore-verification script. The commands below are a manual operator procedure. Rehearse them on an isolated instance and verify the recovered application yourself.

### Preflight

1. Identify the backup and its SHA-256 digest.
2. Note the current revision with `git rev-parse HEAD`.
3. If the live database is still readable, create a new verified backup before replacing it.
4. Put the selected backup in a local `backups` directory beneath the Compose project.
5. Stop the application cleanly:

```console
docker compose stop app
docker compose rm -f app
```

Removing the stopped service container avoids a custom-name collision during the one-off restore. It does not remove the named data volume because `-v` is not used.

### Replace the database manually

Replace the example filename below. The one-off container mounts the same named data volume as the app and mounts the host backup directory read-only.

```console
docker compose run --rm --no-deps -v "./backups:/restore:ro" --entrypoint sh app -c 'cp /restore/nooklet-2026-07-15T1700Z.db /app/data/nooklet.restore.db && mv /app/data/nooklet.restore.db /app/data/nooklet.db && rm -f /app/data/nooklet.db-wal /app/data/nooklet.db-shm'
```

The temporary filename keeps the replacement atomic within `/app/data`. Removing WAL/SHM sidecars is safe only because the app is stopped and the restored database is a complete, verified SQLite backup.

### Start and verify

```console
docker compose up -d app
docker compose ps
docker compose logs --tail=200 app
```

Then query `http://127.0.0.1:42021/api/health` (or the configured host port) and sign in. Pending migrations are applied automatically on first database access.

If startup fails, preserve the restored file and logs. Do not repeatedly downgrade and upgrade the same database. Restore the known backup again into a clean, isolated volume while matching the intended application revision.

## Safe upgrade runbook

Use this sequence for routine source-based Docker deployments:

1. Review the release/change scope and verify the current instance is healthy.
2. Record the current revision:

   ```console
   git rev-parse HEAD
   ```

3. Create and copy off-host a verified database backup.
4. Fetch the update without rewriting local history:

   ```console
   git pull --ff-only
   ```

5. Rebuild and recreate the service:

   ```console
   docker compose up -d --build
   ```

6. Follow startup and migration output:

   ```console
   docker compose logs --tail=200 app
   docker compose ps
   ```

7. Verify `/api/health`, sign in, and exercise one representative workflow.
8. Record the new revision and backup identifier in the operations log.

Nooklet applies Drizzle migrations automatically. Do not add an undocumented manual migration command to the upgrade procedure.

## Configuration-only changes

Edits to `.env`, `docker-compose.override.yml`, published ports, or mounts require container recreation:

```console
docker compose up -d --build --force-recreate
```

`docker compose restart` preserves the old environment and mount specification.

## Rollback strategy

Application rollback and database rollback are a pair. A newer release may have applied forward-only schema migrations, so checking out older code against the upgraded database is not a safe general rollback.

Use one of these strategies:

- **Fix forward:** keep the upgraded database, deploy a corrected newer revision, and verify health.
- **Point-in-time rollback:** stop the app, restore the pre-upgrade database backup, return the source to its recorded pre-upgrade revision, rebuild, and verify. Media changes made after the backup still require reconciliation.

For a source rollback, prefer a deliberate checkout of the recorded release in a clean deployment directory. Do not use `git reset --hard` in a working directory that might contain operator changes.

## Recovery after volume deletion

If the named volume was deleted:

1. Stop all attempts to bootstrap a replacement instance.
2. Confirm an off-host verified database backup exists.
3. Run `docker compose up -d --build` once to recreate the empty volume, then stop the app.
4. Restore the backup using the Docker procedure above.
5. Restore the matching `.env`, mounts, media roots, download roots, and proxy configuration.
6. Start and verify health before enabling downloads.

Without an off-host database backup, Docker volume deletion is not recoverable from Nooklet itself.

## Retention guidance

A practical minimum for a home deployment is:

- one backup before every upgrade or key rotation;
- daily backups while configuration or request activity is frequent;
- multiple generations so corruption discovered late does not replace every good copy;
- at least one encrypted copy on another device or storage provider; and
- periodic isolated restore tests.

Retention is an operator responsibility; the repository does not install a scheduler or upload backups automatically.

## Source references

- [Database backup implementation](https://github.com/TannerMidd/Nooklet/blob/main/scripts/backup-database.mjs)
- [Database initialization and automatic migrations](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/database/client.ts)
- [Docker Compose storage](https://github.com/TannerMidd/Nooklet/blob/main/docker-compose.yml)
- [Docker runtime](https://github.com/TannerMidd/Nooklet/blob/main/Dockerfile)
