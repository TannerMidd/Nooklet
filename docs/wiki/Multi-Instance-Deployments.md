# Multi-instance deployments

Most households should run one Nooklet instance and create separate user accounts. Run multiple instances only when you need hard separation—for example, independent households, test and production environments, or different trust boundaries.

> [!WARNING]
> Multi-instance means multiple **independent** deployments. Nooklet is not a clustered application. Do not scale multiple app containers against the same SQLite database or `nooklet-data` volume.

## Isolation requirements

Every instance needs its own:

- Compose project name;
- container name;
- image tag, especially when instances may run different revisions;
- host port and canonical `APP_URL`;
- `.env` and independently generated secrets;
- named data volume/database;
- download workspace;
- backup namespace and retention record; and
- writable media destinations, unless shared-write behavior has been deliberately designed outside Nooklet.

The base Compose file declares both `name: nooklet` and `container_name: nooklet`. Starting two unmodified copies will therefore collide even if they live in different directories.

## Recommended directory model

Keep a complete deployment directory per instance so the fixed `.env` and `docker-compose.override.yml` references remain unambiguous:

```text
nooklet-instances/
├── alpha/
│   ├── .env
│   ├── docker-compose.yml
│   └── docker-compose.override.yml
└── beta/
    ├── .env
    ├── docker-compose.yml
    └── docker-compose.override.yml
```

Separate Git clones are straightforward and let each instance record its own deployed revision. Avoid switching a shared working tree while another instance is being rebuilt.

## Configure instance Alpha

Add these Compose/operator values to Alpha's `.env` alongside its Nooklet settings:

```dotenv
COMPOSE_PROJECT_NAME=nooklet-alpha
APP_URL=http://127.0.0.1:42021
APP_BIND_ADDRESS=127.0.0.1
APP_PORT=42021

# Generate unique values; do not copy them from another instance.
AUTH_SECRET=
SECRET_BOX_KEY=
BOOTSTRAP_TOKEN=

APPROVED_MEDIA_ROOTS=/media/movies;/media/tv
DOWNLOAD_ENGINE_WORK_DIR=/app/data/engine-work
DOWNLOAD_ENGINE_DIR=/downloads/engine
```

Create Alpha's gitignored `docker-compose.override.yml`:

```yaml
services:
    app:
        image: nooklet-alpha:local
        container_name: nooklet-alpha
        volumes:
            - /srv/nooklet-alpha/downloads:/downloads
            - /srv/nooklet-alpha/media/movies:/media/movies
            - /srv/nooklet-alpha/media/tv:/media/tv
```

Use host paths appropriate to the machine. On Docker Desktop for Windows, quote paths and use forward slashes, for example `"F:/NookletAlpha/Downloads:/downloads"`.

Start and verify:

```console
docker compose config --services
docker compose config --volumes
docker compose up -d --build
docker compose ps
```

## Configure instance Beta

Use a different project, port, image, container, secrets, and host directories:

```dotenv
COMPOSE_PROJECT_NAME=nooklet-beta
APP_URL=http://127.0.0.1:42022
APP_BIND_ADDRESS=127.0.0.1
APP_PORT=42022
AUTH_SECRET=
SECRET_BOX_KEY=
BOOTSTRAP_TOKEN=
APPROVED_MEDIA_ROOTS=/media/movies;/media/tv
DOWNLOAD_ENGINE_WORK_DIR=/app/data/engine-work
DOWNLOAD_ENGINE_DIR=/downloads/engine
```

```yaml
services:
    app:
        image: nooklet-beta:local
        container_name: nooklet-beta
        volumes:
            - /srv/nooklet-beta/downloads:/downloads
            - /srv/nooklet-beta/media/movies:/media/movies
            - /srv/nooklet-beta/media/tv:/media/tv
```

When both are running:

```console
docker ps --filter name=nooklet-alpha --filter name=nooklet-beta
```

Query each probe independently:

```console
curl --fail-with-body http://127.0.0.1:42021/api/health
curl --fail-with-body http://127.0.0.1:42022/api/health
```

## Using `-p` instead of `COMPOSE_PROJECT_NAME`

You may select the project on every command:

```console
docker compose -p nooklet-alpha up -d --build
docker compose -p nooklet-alpha ps
docker compose -p nooklet-alpha logs --tail=200 app
```

Do not mix project naming methods casually. Omitting `-p` later can address a different project because the base file's default name is `nooklet`. A per-directory `COMPOSE_PROJECT_NAME` reduces that operator-error risk.

## Data-volume verification

After starting both instances, confirm their physical volume names differ:

```console
docker volume ls --filter name=nooklet-alpha
docker volume ls --filter name=nooklet-beta
docker inspect nooklet-alpha --format '{{json .Mounts}}'
docker inspect nooklet-beta --format '{{json .Mounts}}'
```

Each container's `/app/data` mount must point to a different named volume. Stop immediately if both reference the same volume.

## Media and download separation

The same container paths may be reused across instances because they resolve inside different containers. The **host** sources behind those paths determine whether data is actually isolated.

- Give every built-in engine separate `DOWNLOAD_ENGINE_WORK_DIR` and `DOWNLOAD_ENGINE_DIR` locations. Sharing either can mix incomplete work, repairs, completed output, or imports.
- Prefer separate writable movie/TV roots. Two instances importing or deleting within one library can race or produce inconsistent database state.
- If a common media collection must be visible to a test instance, mount it read-only and do not configure download/import operations against it.
- Keep `APPROVED_MEDIA_ROOTS` minimal in each instance.
- Never share `DOWNLOAD_ENGINE_WORK_DIR` or `DOWNLOAD_ENGINE_DIR` between instances.

## Reverse proxy routing

Give each instance a distinct origin:

```text
https://alpha.nooklet.example
https://beta.nooklet.example
```

Proxy each hostname to its own loopback port and set the matching `APP_URL`. Do not route two independent instances under path prefixes on one origin. Follow [Reverse proxy and LAN access](Reverse-Proxy-and-LAN-Access) for header and TLS rules.

## Backup and upgrade discipline

Label every artifact with the instance and time:

```text
nooklet-alpha-2026-07-15T1700Z.db
nooklet-beta-2026-07-15T1710Z.db
```

For each instance independently:

1. query its health endpoint;
2. record its Git revision;
3. create and export its own verified backup;
4. upgrade only that deployment directory;
5. verify sign-in and one workflow; and
6. proceed to the next instance only after the first is stable.

Never restore Alpha's backup into Beta unless the goal is an intentional clone and Beta's old identity, users, credentials, and history are meant to be replaced. If cloning intentionally, rotate all runtime secrets and review every saved integration before enabling network access.

## Test-instance safety

A restored test instance contains real users, password hashes, encrypted credentials, notification targets, schedules, and jobs. Before starting it:

- use isolated `AUTH_SECRET`/`SECRET_BOX_KEY` only if saved credentials are intentionally unavailable, or retain required old key material solely inside the controlled test;
- block outbound network access or disconnect integrations;
- use separate read-only media mounts;
- use a separate download workspace;
- disable notification channels and scheduled jobs as soon as you can sign in; and
- keep the test bind address on loopback.

Restoring production data into a network-enabled test instance without these controls can send notifications, contact live services, or process jobs.

## Common failures

| Symptom                                                     | Cause                                                  | Resolution                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `Conflict. The container name "/nooklet" is already in use` | The override did not assign a unique `container_name`. | Add a unique container name to each override and recreate.                                                  |
| Starting Beta changes Alpha                                 | Both commands resolved to the same Compose project.    | Set a unique `COMPOSE_PROJECT_NAME` per directory or consistently pass `-p`; inspect before changing state. |
| Both instances show the same users/settings                 | They share the same `nooklet-data` volume.             | Stop both, preserve/backup the volume, then restore each instance into a distinct project volume.           |
| Rebuilding one instance changes the other's code            | Both use the shared `nooklet:local` image tag.         | Assign a unique image tag in each override and rebuild both deliberately.                                   |
| Port already allocated                                      | Both publish the same `APP_PORT`/address.              | Assign a unique host port and matching `APP_URL`.                                                           |
| Downloads appear in the wrong instance                      | Built-in work or completed-output roots overlap.       | Separate both engine paths, then review active requests before resuming.                                    |

## Why not horizontal scaling?

The supplied deployment couples separately supervised Next.js web and background-worker processes to one local SQLite/WAL database and local or mounted download processing. Job leases protect scheduled work from stale claims, but they are not a statement of clustered deployment support. Run exactly one app container for each database and data volume.

## Source references

- [Base Compose identity and volume](https://github.com/TannerMidd/Nooklet/blob/main/docker-compose.yml)
- [SQLite initialization](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/database/client.ts)
- [Background worker](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/jobs/worker.ts)
- [Job lease repository](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/jobs/repositories/job-repository.ts)
