# Docker installation

Docker Compose is the recommended way to run Nooklet. The image contains the supported Node.js runtime, SQLite support, the web app and background worker, the built-in downloader, repair and extraction tools, Python, ffmpeg, and a pinned yt-dlp toolchain.

## Choose one installation route

### Guided setup — recommended

Use the [Docker setup builder](https://tannermidd.github.io/Nooklet/guide/#docker-configurator) if this is a new installation. You choose the operating system and existing folders; it generates one private command that:

1. checks Docker, Docker Compose, Git, and the selected host folders;
2. clones the official repository;
3. generates three independent secrets;
4. creates `.env` and `docker-compose.override.yml`;
5. builds the app and checks that the container can write to every mount;
6. starts Nooklet and waits for it to become healthy; and
7. prints the address and one-time bootstrap token.

The builder runs locally in the browser. Folder paths and generated secrets are not sent anywhere. Keep the generated command private because the secrets are embedded in it.

### Manual setup

Use the numbered steps below if you want to inspect and enter every value yourself. The guided and manual routes create the same deployment; do not combine their setup steps.

Every command in this guide uses the standard `docker-compose.yml`. Run it without `-f`. The tracked `docker-compose.alpha.yml` contains machine-specific development overrides and is not an alternative installation file.

## Before you begin

You need these items to install and open Nooklet:

- Docker Desktop, or Docker Engine with Docker Compose v2;
- Git;
- at least one existing final library folder for Movies, TV, or YouTube; and
- a separate existing folder for completed-download staging (Usenet output).

Keep the completed-download folder outside the media library so staged files are never scanned as finished media. Nooklet uses two capacity locations by default:

- `/app/data/engine-work` in Docker's `nooklet-data` volume holds in-flight downloads, repair, and extraction work.
- `/downloads/nooklet-engine` in the host folder you map to `/downloads` holds completed output until import.

Both locations must have usable capacity. Each must pass the same conservative admission check: roughly twice a release's declared size, plus a 512 MiB safety reserve and space reserved by active downloads. On Docker Desktop, make sure its virtual disk also has enough free space; enlarging only the host folder mapped to `/downloads` does not enlarge `/app/data`.

You need these credentials later, inside **Setup Center**, before the first movie or TV request:

| Item              | What it does                                               |
| ----------------- | ---------------------------------------------------------- |
| TMDB credential   | Identifies titles and supplies metadata and artwork        |
| Newznab API key   | Searches an indexer for movie or TV releases               |
| Usenet credential | Lets Nooklet's built-in downloader retrieve those releases |

These credentials are for Movie/TV requests only. YouTube archiving is optional and independent: it needs an approved YouTube destination and the YouTube toolchain, not TMDB, Newznab, or Usenet.

### Confirm Docker is ready

On Windows or macOS, open Docker Desktop and wait for its Linux engine to start. Windows users must use **Linux containers**, not Windows containers. On Linux, start Docker Engine and make sure your user can access it.

Run:

```console
docker info
docker compose version
git --version
```

Do not continue if any command reports that Docker is unavailable or its daemon/engine is not running. Fix that first, then rerun all three commands.

## 1. Clone Nooklet

Run these commands from the parent folder where you want the `Nooklet` folder to be created:

```console
git clone https://github.com/TannerMidd/Nooklet.git
cd Nooklet
```

The included Compose file builds from the checked-out source, so later steps use `docker compose up -d --build`.

## 2. Create `.env` and generate secrets

Copy the environment template.

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
```

**Linux or macOS**

```console
cp .env.example .env
```

Generate three different random values. Never reuse one value for multiple settings.

**Windows PowerShell**

```powershell
function New-NookletSecret {
    $bytes = New-Object byte[] 48
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    } finally {
        $generator.Dispose()
    }
    [Convert]::ToBase64String($bytes)
}

"AUTH_SECRET=$(New-NookletSecret)"
"BOOTSTRAP_TOKEN=$(New-NookletSecret)"
"SECRET_BOX_KEY=$(New-NookletSecret)"
```

**Linux or macOS with OpenSSL**

```console
printf 'AUTH_SECRET=%s\n' "$(openssl rand -base64 48)"
printf 'BOOTSTRAP_TOKEN=%s\n' "$(openssl rand -base64 48)"
printf 'SECRET_BOX_KEY=%s\n' "$(openssl rand -base64 48)"
```

Open `.env` in a text editor. Copy each complete generated line over its matching line in the file. `SECRET_BOX_KEY` is commented out in the template, so replace `# SECRET_BOX_KEY=` with the generated uncommented line.

For a local-only installation, leave these values unchanged:

```dotenv
APP_URL=http://localhost:42021
APP_BIND_ADDRESS=127.0.0.1
APP_PORT=42021
```

Before continuing, confirm that:

- `AUTH_SECRET`, `BOOTSTRAP_TOKEN`, and `SECRET_BOX_KEY` are all present;
- every value contains a different random string;
- none of the three values is blank or a placeholder; and
- `.env` has not been committed to Git. The repository ignores it by default.

Use this `.env` as the single source for Docker port and address values. Do not also export `APP_PORT` or `APP_BIND_ADDRESS` in the shell that runs Compose: shell variables override the published address without changing `APP_URL` inside the container, producing an address mismatch. When the browser address changes, edit `APP_URL` in `.env` to match it.

## 3. Map the host folders into Docker

Create `docker-compose.override.yml` beside `docker-compose.yml`. This machine-specific file is ignored by Git.

Choose the example for the operating system that runs Docker. Keep only the library entries you actually use, optionally add a YouTube entry, replace every left-side source path, and leave the right-side target paths unchanged.

**Windows example**

```yaml
services:
    app:
        volumes:
            - type: bind
              source: "D:/Media/Movies"
              target: /media/movies
              bind:
                  create_host_path: false
            - type: bind
              source: "D:/Media/TV"
              target: /media/tv
              bind:
                  create_host_path: false
            - type: bind
              source: "F:/Nooklet/Downloads"
              target: /downloads
              bind:
                  create_host_path: false
```

Use drive letters, forward slashes, and quotes on Windows. Docker Desktop may ask you to share these drives or folders.

**Linux example**

```yaml
services:
    app:
        volumes:
            - type: bind
              source: /srv/media/movies
              target: /media/movies
              bind:
                  create_host_path: false
            - type: bind
              source: /srv/media/tv
              target: /media/tv
              bind:
                  create_host_path: false
            - type: bind
              source: /srv/nooklet-downloads
              target: /downloads
              bind:
                  create_host_path: false
```

**macOS example**

```yaml
services:
    app:
        volumes:
            - type: bind
              source: /Users/your-name/Media/Movies
              target: /media/movies
              bind:
                  create_host_path: false
            - type: bind
              source: /Users/your-name/Media/TV
              target: /media/tv
              bind:
                  create_host_path: false
            - type: bind
              source: /Users/your-name/Nooklet/Downloads
              target: /downloads
              bind:
                  create_host_path: false
```

YouTube is optional and independent of Movie/TV setup. If you want a separate YouTube archive, add one more bind with the same structure—for example, map the host's YouTube folder to `/media/youtube`. Later, select `/media/youtube` as the final destination in Nooklet. Do not use `/app/data/youtube` as the final library; that path is temporary download work inside the Nooklet data volume.

The source is the real folder on the Docker host. The target is the path inside the container and is the only form you enter in Nooklet:

```text
host folder                         container path used by Nooklet
D:/Media/Movies              ->     /media/movies
/srv/media/youtube           ->     /media/youtube
/srv/nooklet-downloads       ->     /downloads
```

Set these values in `.env`:

```dotenv
APPROVED_MEDIA_ROOTS=/media
DOWNLOAD_ENGINE_WORK_DIR=/app/data/engine-work
DOWNLOAD_ENGINE_DIR=/downloads/nooklet-engine
YOUTUBE_WORK_DIR=/app/data/youtube
```

Do not put Windows drive letters or other host paths in these Docker environment values. Nooklet runs inside the container and sees only `/app/data`, `/downloads`, and `/media/...`. `/app/data/youtube` is temporary YouTube work storage, never a final library.

## 4. Validate, build, and start

Run these commands from the Nooklet repository folder:

```console
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

`docker compose config --quiet` produces no output when the Compose files are valid. The first build can take several minutes because Docker downloads and builds the complete runtime.

In `docker compose ps`, the `nooklet` app may show `starting` while migrations run and the worker begins ticking. Wait 30–60 seconds and run `docker compose ps` again. Continue only when the app shows `healthy`.

If the app row is missing, shows `unhealthy`, or exits, run:

```console
docker compose ps -a
docker compose logs --tail=200 app
docker compose logs --tail=200 youtube-pot-provider
```

The app waits for `youtube-pot-provider` to become healthy, so app logs can be empty when that dependency fails first. Keep both log outputs private until you have checked them for hostnames, paths, or other sensitive information. See [Installation recovery](#installation-recovery) before changing anything.

## 5. Verify application health

Query the health endpoint after the container becomes healthy.

**Windows PowerShell**

```powershell
Invoke-RestMethod http://127.0.0.1:42021/api/health | ConvertTo-Json -Depth 5
```

**Linux or macOS**

```console
curl --fail-with-body http://127.0.0.1:42021/api/health
```

The expected response is:

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

Do not continue to first-time setup if the request fails, returns HTTP 503, or reports `degraded`. Use the logs and [Health and diagnostics](Health-and-Diagnostics) to identify the failed boundary first.

## 6. Create the first administrator

1. Open [http://localhost:42021](http://localhost:42021) on the Docker host.
2. Nooklet redirects the empty instance to the first-administrator form.
3. Enter the exact `BOOTSTRAP_TOKEN` value from `.env`.
4. Create the administrator's display name, email address, and password.
5. Confirm you can sign in.

Immediately disable the one-time bootstrap route:

1. Delete the entire `BOOTSTRAP_TOKEN=...` line from `.env`.
2. Save the file.
3. Recreate the container:

    ```console
    docker compose up -d --force-recreate
    ```

4. Recheck `docker compose ps` and `/api/health`.

Deleting this environment line does not delete the administrator. It only removes the temporary server-side credential that allowed the first account to be created.

For Movie/TV requests, continue with [First-time setup](First-Time-Setup) to connect TMDB, Newznab, and Usenet and attach `/media/movies` or `/media/tv` as a final destination. YouTube is optional and independent; attach `/media/youtube` as its final destination when you want a YouTube archive.

## Installation recovery

Use the matching symptom; do not delete the database or Docker volume.

| Symptom                                                    | What to do                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker` command is missing                                | Install or update Docker Desktop/Engine, start it, then rerun the readiness commands.                                                                                                                                                                                                                            |
| Docker daemon or engine is unavailable                     | Start or restart Docker Desktop/Engine and wait for it to finish initializing.                                                                                                                                                                                                                                   |
| Windows reports the wrong container type                   | Switch Docker Desktop to Linux containers.                                                                                                                                                                                                                                                                       |
| A bind source does not exist                               | Correct the `source` path or create/reconnect that exact host folder. Do not change `create_host_path` to hide the problem.                                                                                                                                                                                      |
| A mapped folder is not writable                            | Grant the Docker service/container user read/write access to that specific folder. On Docker Desktop, confirm the folder or drive is shared.                                                                                                                                                                     |
| `.env` is missing but a Nooklet container or volume exists | Stop. Do not rerun setup with new secrets, and do not delete the container or volume. Restore the matching `.env` from its secure backup. If it cannot be recovered, preserve the volume and database before asking for recovery help; see [Backup, restore, and upgrades](Backup-Restore-and-Upgrades).         |
| Configuration or startup reports a secret error            | Before creating the first admin, confirm all three secrets are present, nonblank, and different. After an admin exists, `BOOTSTRAP_TOKEN` must remain absent; confirm only `AUTH_SECRET` and `SECRET_BOX_KEY`, then recheck YAML indentation. Never post expanded Compose output because it can contain secrets. |
| App is missing, exited, or unhealthy                       | Inspect `docker compose ps -a` and both service logs. If app logs are empty, fix the provider's earliest error first, then run `docker compose up -d --build` again.                                                                                                                                             |
| Port `42021` is already in use                             | Choose a free `APP_PORT`, update `APP_URL` to the address users will open, and recreate the container.                                                                                                                                                                                                           |
| Browser opens on the host but not another device           | The safe default is loopback-only. Finish setup first, then follow [Reverse proxy and LAN access](Reverse-Proxy-and-LAN-Access).                                                                                                                                                                                 |
| An `.env` or mount edit has no effect                      | Run `docker compose up -d --force-recreate`; `docker compose restart` does not apply new environment values or mounts.                                                                                                                                                                                           |

For other failures, use [Troubleshooting](Troubleshooting). When asking for help, never share `.env`, the generated setup command, API keys, passwords, database files, or unredacted logs.

## How the deployment stores data

- The database is always `/app/data/nooklet.db` in the Compose volume whose logical key is `nooklet-data`. With the default project name, Docker normally displays the actual volume as `nooklet_nooklet-data`.
- In-flight download work stays under `/app/data/engine-work` by default.
- Completed Usenet output waits under `/downloads/nooklet-engine` when you use the recommended bind mount; this staging path is Usenet-only.
- Final movie and TV files go to the library folder selected in **Settings → Storage**.
- Final YouTube files go to the selected YouTube library, typically `/media/youtube`; `/app/data/youtube` remains temporary work storage.
- The container root filesystem is read-only; persistent data lives in the named volume and your explicit bind mounts.
- Database migrations run automatically during startup. A normal install or upgrade has no separate migration command.

`docker compose down` keeps the named volume. `docker compose down -v` deletes it and must never be used unless you intentionally want to erase the instance.

To locate the volume without exposing environment values, run `docker volume ls --filter label=com.docker.compose.project=nooklet`. Always identify the exact volume through the current Compose project before inspecting it.

## Applying later configuration changes

After changing `.env` or `docker-compose.override.yml`, run:

```console
docker compose up -d --force-recreate
docker compose ps
```

A plain `docker compose restart` keeps the old environment and mount configuration.

For LAN access or a reverse proxy, follow [Reverse proxy and LAN access](Reverse-Proxy-and-LAN-Access). For backups and upgrades, follow [Backup, restore, and upgrades](Backup-Restore-and-Upgrades) before changing the deployed revision.

## Implementation references

- [Docker Compose configuration](https://github.com/TannerMidd/Nooklet/blob/main/docker-compose.yml)
- [Docker image stages and runtime tools](https://github.com/TannerMidd/Nooklet/blob/main/Dockerfile)
- [Environment template](https://github.com/TannerMidd/Nooklet/blob/main/.env.example)
- [Health route](https://github.com/TannerMidd/Nooklet/blob/main/src/app/api/health/route.ts)
- [Automatic runtime initialization](https://github.com/TannerMidd/Nooklet/blob/main/src/instrumentation.ts)
