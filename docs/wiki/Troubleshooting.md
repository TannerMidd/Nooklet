# Troubleshooting

Start with evidence, protect persistent data, and change one variable at a time. Most Nooklet failures fall into one of five boundaries: container configuration, database/worker health, container-visible storage, outbound service policy, or account access.

> [!CAUTION]
> Do not run `docker compose down -v`, delete the SQLite database, remove WAL/SHM files while Nooklet is running, or reset the Git working tree as a troubleshooting shortcut.

## Universal triage

From the deployment directory:

```console
docker compose config --quiet
docker compose ps
docker compose logs --tail=200 app
```

Then query the host-published probe (change `42021` if needed):

```console
curl --fail-with-body http://127.0.0.1:42021/api/health
```

On Windows PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:42021/api/health | ConvertTo-Json -Depth 5
```

Use [Health and diagnostics](Health-and-Diagnostics) to interpret `ok`, HTTP-200 `degraded`, and HTTP-503 results.

## Symptom index

| Symptom | Most likely boundary | Start here |
| --- | --- | --- |
| Container exits immediately | Invalid/missing environment value or startup error | Validate Compose quietly, then inspect the first startup error in logs. |
| Container is `unhealthy` | Database failed or worker stopped/stale | Query `/api/health`; preserve the volume and inspect `[health]`/`[background-worker]` logs. |
| Probe is `200` but `degraded` | Recent worker workload failure | Read `/health` and logs; test the named integration/storage path. |
| Browser cannot connect | Wrong bind address/port, stopped container, or firewall | Compare `.env`, `docker compose ps`, and `docker compose port app 42021`. |
| Proxy returns `502` | Wrong upstream or Nooklet is unavailable | Query the probe directly from the proxy host/network. |
| Sign-in redirects to `localhost` | Incorrect `APP_URL` or stale container environment | Set the canonical browser origin and force-recreate. |
| “Not enough free disk space” despite a spacious media drive | Built-in staging workspace is on another filesystem | Inspect **Settings > Storage** and move/bind `DOWNLOAD_ENGINE_DIR` to the spacious staging drive. |
| Host path such as `F:\Movies` is not found | A Docker install needs container-side paths | Bind the host folder, then configure the right-hand container path such as `/media/movies`. |
| Library path is outside approved roots | Path and `APPROVED_MEDIA_ROOTS` disagree | Approve the container root, recreate, then register a contained directory. |
| Storage is reachable but read-only | Host permissions or mount mode deny the unprivileged container user | Correct host permissions/mount flags; do not make the container privileged. |
| Private service host is blocked | SSRF policy denied a LAN/loopback target | Add the exact hostname/IP to `PRIVATE_SERVICE_HOST_ALLOWLIST` and recreate. |
| Service test rejects a redirect | Outbound redirects are intentionally refused | Configure the final direct endpoint URL. |
| SAB download finishes but will not import | SAB path is not visible/mapped inside Nooklet | Bind the completed folder and configure `SABNZBD_PATH_MAPPINGS` or approved roots. |
| Environment/mount edit has no effect | Container was restarted, not recreated | Run `docker compose up -d --build --force-recreate`. |
| “Container name is already in use” | Another Nooklet project uses the base fixed name | Assign unique project/container/image names; see [Multi-instance deployments](Multi-Instance-Deployments). |
| Docker reports `OCI runtime exec failed`, `setns`, or a defunct container | Stale Docker runtime/container namespace rather than an application error | Preserve the mount inventory, remove only the identified service container without `-v`, restart the Docker engine if required, and recreate. |
| Sign-in is temporarily rejected after repeated attempts | Five-minute rate-limit window or a recorded temporary lock | Stop retrying and allow the window/lock to expire; inspect logs and account state if it persists. |
| Account is disabled | Administrative access state, not a timeout | A different active administrator must re-enable it. Waiting and password recovery do not re-enable disabled accounts. |
| Administrator forgot the password | Lost credential on an otherwise active account | Use the local recovery script against a verified, backed-up database. |
| Upgrade starts but health fails | Migration/runtime error or mismatched configuration | Preserve logs and the pre-upgrade backup; fix forward or restore code+database as a pair. |

## Container will not start

### 1. Validate without printing the expanded configuration

```console
docker compose config --quiet
```

Avoid posting the full output of `docker compose config`; it can contain expanded secrets from `.env`.

### 2. Read the earliest useful error

```console
docker compose logs --tail=300 app
```

Common environment failures include:

- missing `AUTH_SECRET`;
- a secret shorter than 32 characters;
- a known placeholder such as `change-me`;
- malformed `APP_URL`;
- invalid private-host allowlist entries containing a scheme, port, path, CIDR, or wildcard; and
- a non-positive/non-integer AI timeout.

Correct `.env`, then recreate:

```console
docker compose up -d --build --force-recreate
```

### 3. Check port and name collisions

```console
docker compose ps
docker ps -a --filter name=nooklet
```

If the host port is allocated, choose another `APP_PORT` and update `APP_URL`. If another independent Nooklet uses the container/project name, follow [Multi-instance deployments](Multi-Instance-Deployments); do not delete an unidentified container or volume.

## Container is unhealthy or the probe returns 503

The response body distinguishes the primary boundary:

- `checks.database: "error"` means SQLite initialization/migration/readiness failed.
- `checks.database: "ok"` with `checks.backgroundWorker: "error"` means the worker has not ticked within 60 seconds.

For database failure:

1. preserve logs;
2. confirm the data volume exists;
3. ensure only one app process uses the database;
4. avoid manual SQLite changes; and
5. create a backup if the database remains readable, or restore the last verified backup.

For a stale worker:

1. inspect `[background-worker]` messages;
2. look for a blocked event loop, repeated database contention, or startup failure;
3. confirm the container has adequate CPU/memory; and
4. recreate only after correcting configuration or resource pressure.

An HTTP-200 `degraded` response is different: the worker is responsive and Docker intentionally treats it as healthy. Fix the recorded workload failure instead of forcing restarts.

## “Not enough free disk space”

The built-in downloader checks the filesystem containing `DOWNLOAD_ENGINE_DIR`, not the final movie/TV library drive. It keeps headroom for active data, assembly/unpacking, and a safety reserve.

For a new NZB, required free space is:

```text
512 MiB + (2 × remaining bytes in active built-in downloads) + (2 × the NZB's declared bytes)
```

That means a 10 GiB release with no active downloads needs about 20.5 GiB free in the staging workspace even when the final media destination has much more space.

### Diagnose

1. Open **Settings > Storage**.
2. Read the download workspace's **effective path**, free space, active reservation, and maximum new download size.
3. Remember that Docker displays paths inside the container.
4. Compare the workspace mount with `docker compose.yml` and your override.

### Move staging to a spacious host drive

In `.env`:

```dotenv
DOWNLOAD_ENGINE_DIR=/downloads/nooklet-engine
```

In the gitignored `docker-compose.override.yml` on Windows:

```yaml
services:
  app:
    volumes:
      - "F:/Nooklet/Downloads:/downloads"
```

On macOS/Linux:

```yaml
services:
  app:
    volumes:
      - /mnt/fast-downloads/nooklet:/downloads
```

Then recreate and re-check **Settings > Storage**:

```console
docker compose up -d --build --force-recreate
```

Deleting the 512 MiB reserve or pointing staging directly at the final library is not the fix; the workspace needs room for incomplete, assembled, repaired, and unpacked data.

## Container paths, approved roots, and permissions

Docker has two names for every bind mount:

```text
host path                         container path used by Nooklet
F:/Media/Movies            ->     /media/movies
/mnt/storage/downloads     ->     /downloads
```

Only the right-hand path belongs in Nooklet settings and `DOWNLOAD_ENGINE_DIR`.

### Media root checklist

1. Bind-mount the host folder into the app service.
2. Add a containing container path to `APPROVED_MEDIA_ROOTS`, for example `/media`.
3. Recreate the container.
4. Register `/media/movies` or `/media/tv` in **Settings > Storage**.
5. Confirm the UI reports reachable, readable, and writable.

Inspect what the unprivileged runtime sees:

```console
docker compose exec app sh -lc 'id; ls -ld /app/data /downloads /media /media/movies /media/tv'
```

It is normal for an unused example path to be absent. Correct ownership, ACLs, Docker Desktop file-sharing permissions, or a `:ro` mount on the host side. Do not switch the container to root as a general permission workaround.

Nooklet rejects filesystem roots, direct Windows network/device path forms, out-of-bound paths, and symlinked files for destructive media operations. Mount a remote share on the Docker host first, then bind only its intended subdirectory into the container.

## Private integration cannot connect

Nooklet blocks private/loopback outbound destinations by default.

1. Use the final direct HTTP(S) URL; redirects are refused.
2. Put only its exact hostname or IP in `.env`:

   ```dotenv
   PRIVATE_SERVICE_HOST_ALLOWLIST=sabnzbd;plex.local;192.168.1.25
   ALLOW_PRIVATE_SERVICE_HOSTS=false
   ```

3. Recreate the container.
4. Use the same host spelling in **Settings > Connections**.
5. Test the connection in the UI and inspect logs.

If a hostname resolves to both public and disallowed addresses, validation fails. Link-local/metadata-like, CGNAT, multicast, documentation, and other special-purpose ranges remain blocked even when broad private-host access is enabled.

For Docker Desktop services on the host, an exact `host.docker.internal` allowlist may be appropriate if that is the hostname used in the URL. On Linux, define an explicit Docker network or controlled host-gateway mapping instead of assuming that hostname exists.

## SABnzbd completes but Nooklet cannot import

SAB reports a path from SAB's own filesystem namespace. Nooklet must be able to resolve the same files inside its container.

Example:

```text
SAB reports:       /sab-downloads/complete/Movie.Name
Nooklet sees:      /downloads/complete/Movie.Name
```

Bind the host completed-download folder at `/downloads`, then configure:

```dotenv
SABNZBD_PATH_MAPPINGS=/sab-downloads=/downloads
```

With mappings configured, every reported path must match a configured source prefix and remain within its mapped local target. Without mappings, set a non-root `APPROVED_DOWNLOAD_ROOTS` such as `/downloads`; empty configuration fails closed.

After an environment/mount change, recreate. Confirm the completed directory exists from Nooklet's perspective before retrying the request.

## Cannot sign in

1. Confirm the email spelling; Nooklet normalizes account emails to lowercase.
2. If attempts were rejected in a burst, stop retrying and wait for the five-minute rate-limit window to clear. A time-bounded login lock/rate limit expires; it does not require an account status change.
3. Ask another administrator to inspect `/admin`. A **disabled** account never becomes active by waiting and must be explicitly re-enabled.
4. If an active administrator forgot the password, create a verified backup and follow [Account and user administration](Account-and-User-Administration#recover-an-administrator-account-locally).

The local recovery script changes the password, forces a first-sign-in replacement, and clears recorded login failures/`locked_until`; it does **not** clear `is_disabled`. If every administrator is disabled, recovery of a password alone is insufficient. Preserve the database and restore a known-good backup or obtain an explicit, audited database-level recovery procedure.

If sign-in redirects to `/settings/account?reason=temporary-password`, this is expected: replace the administrator-issued or recovery password before using the rest of the app.

If `/bootstrap` is unavailable, an administrator may already exist. If no administrator exists but `BOOTSTRAP_TOKEN` was removed, restore a newly generated token to `.env`, recreate, complete bootstrap, then remove it and recreate again.

## OCI `setns` or defunct-container recovery

Errors such as `OCI runtime exec failed`, `setns`, “container is not running,” or an unresponsive `docker exec` can come from stale Docker Desktop/containerd namespace state. They do not, by themselves, indicate that the Nooklet database volume is corrupt.

### Preserve identity and mounts first

```console
docker compose ps -a
docker compose ps -q app
docker volume ls --filter name=nooklet
```

If `docker inspect` still works, record the identified app container's state and mounts before removal:

```console
docker inspect <app-container-id-or-name> --format '{{json .State}}'
docker inspect <app-container-id-or-name> --format '{{json .Mounts}}'
```

Confirm that `/app/data` uses the expected named volume. Do not remove any volume and do not add `-v` to the commands below.

### Replace only the broken service container

Try the Compose-scoped removal first:

```console
docker compose rm -s -f app
```

If Docker cannot stop/remove it because the daemon/runtime namespace itself is stale:

1. Restart Docker Desktop from its UI, or restart the Docker daemon on Linux during an approved maintenance window. This affects other containers on the host.
2. Return to the same deployment directory.
3. Remove only the confirmed Nooklet app container, still without a volume flag:

   ```console
   docker compose rm -f app
   ```

4. If Compose no longer tracks the defunct container, use the exact ID/name captured above:

   ```console
   docker rm -f <confirmed-app-container-id-or-name>
   ```

`docker rm -f` without `-v` removes the container object, not the named `nooklet-data` volume or host bind-mounted media.

### Recreate and verify

```console
docker compose up -d --build --force-recreate
docker compose ps
docker compose logs --tail=200 app
```

Then query `/api/health`, sign in, and inspect **Settings > Storage**. If the recreated container still fails, continue from the new startup logs; do not repeatedly remove containers or escalate to volume deletion.

## Environment or mount changes do not apply

`docker compose restart` restarts the old container configuration. Apply `.env`, port, image, and volume changes with:

```console
docker compose up -d --build --force-recreate
```

Verify the actual state with `docker compose ps`, the storage UI, and the health probe. Avoid sharing full `docker compose config` output because it can expand secrets.

## Database busy, schema, or migration errors

SQLite is configured for WAL, foreign keys, and a five-second busy timeout. Persistent `SQLITE_BUSY` usually indicates another process or instance sharing the same database, a stalled filesystem, or unusually long host I/O.

- Run one Nooklet app container/process per database volume.
- Do not place the SQLite database on an unreliable network filesystem.
- Preserve the exact logs and deployed revision.
- Back up before any repair.
- Let Nooklet apply migrations automatically; do not improvise manual schema changes.
- If a verified pre-failure backup exists, restore code and database together using [Backup, restore, and upgrades](Backup-Restore-and-Upgrades).

If the backup tool reports that source `quick_check` failed, preserve the database, WAL/SHM sidecars, and logs before doing anything else. Restore a known-good backup for service recovery; perform forensic SQLite salvage only on copies.

## Upgrade failure

1. Stop repeated restart/rebuild attempts.
2. Record the current revision and logs.
3. Confirm whether the database migrated successfully.
4. Prefer a corrected forward release when the database is healthy.
5. For rollback, restore the pre-upgrade database **and** its matching code revision.

Checking out older code against a forward-migrated database is not a safe general rollback. See [Backup, restore, and upgrades](Backup-Restore-and-Upgrades#rollback-strategy).

## AI recommendation takes too long or times out

Recommendation work runs on the background worker. The default request ceiling is 30 minutes to accommodate local and reasoning models. Configure a positive integer in milliseconds only when the provider should fail faster or needs more time:

```dotenv
AI_RECOMMENDATIONS_TIMEOUT_MS=1800000
```

Recreate after editing. A timeout may leave the worker temporarily degraded; inspect the recommendation timeline and logs, then retry after confirming the provider is responsive.

## Escalation checklist

Before opening an issue, collect and sanitize:

- Nooklet revision (`git rev-parse HEAD`);
- Docker/host-native runtime and operating system;
- `docker compose ps` output;
- `/api/health` JSON;
- a bounded relevant log excerpt;
- container-side storage paths and their status, without unrelated host paths;
- exact reproduction steps and time; and
- whether the problem began after an upgrade, mount change, key rotation, or service change.

Never attach `.env`, a database/backup, API keys, webhook URLs, credentials, NZB content, or unredacted full Compose configuration.

## Source references

- [Environment schema](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/env.ts)
- [Built-in download capacity check](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/download-engine/workflows/enqueue-nzb-download.ts)
- [Storage overview](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/storage/queries/get-storage-overview.ts)
- [Completed-download path policy](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/downloads/workflows/import-completed-downloads/source-path-mapping.ts)
- [Health route](https://github.com/TannerMidd/Nooklet/blob/main/src/app/api/health/route.ts)
