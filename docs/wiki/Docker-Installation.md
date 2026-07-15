# Docker installation

Docker Compose is the recommended way to run Nooklet. It provides the supported Node.js runtime, native media-processing tools, a persistent SQLite volume, a health check, and conservative container security defaults.

## Prerequisites

- Docker Desktop, or Docker Engine with Compose v2
- Git
- Existing host folders for the media libraries you want Nooklet to manage
- A host folder for download staging when using the built-in downloader

Confirm that Compose is available:

```bash
docker compose version
```

## 1. Clone the repository

```bash
git clone https://github.com/TannerMidd/Nooklet.git
cd Nooklet
```

Nooklet currently builds a local image from source. The supported start command is therefore `docker compose up -d --build` rather than pulling a prebuilt registry image.

## 2. Create the environment file

macOS or Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Generate three independent random values. Do not reuse one value across fields.

macOS or Linux with OpenSSL:

```bash
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 48
```

Windows PowerShell:

```powershell
function New-NookletSecret {
    $bytes = New-Object byte[] 48
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    [Convert]::ToBase64String($bytes)
}

1..3 | ForEach-Object { New-NookletSecret }
```

Place the values in `.env`:

```dotenv
AUTH_SECRET=<first-independent-value>
BOOTSTRAP_TOKEN=<second-independent-value>
SECRET_BOX_KEY=<third-independent-value>
```

`AUTH_SECRET` is always required. `BOOTSTRAP_TOKEN` enables the one-time web flow that creates the first administrator. `SECRET_BOX_KEY` is strongly recommended so stored service credentials have a dedicated encryption key.

Keep these defaults for a local-only installation:

```dotenv
APP_URL=http://localhost:42021
APP_BIND_ADDRESS=127.0.0.1
APP_PORT=42021
```

## 3. Bind the host folders

Create `docker-compose.override.yml` beside the main Compose file. It is ignored by Git, so machine-specific mount paths stay out of commits and survive normal source updates.

Create every host folder before starting Compose. Otherwise Docker may silently create an empty bind source, which can hide an offline external disk or NAS mount.

Linux example:

```yaml
services:
  app:
    volumes:
      - "/srv/media/movies:/media/movies"
      - "/srv/media/tv:/media/tv"
      - "/srv/nooklet-downloads:/downloads"
```

Windows example:

```yaml
services:
  app:
    volumes:
      - "D:/Media/Movies:/media/movies"
      - "D:/Media/TV:/media/tv"
      - "F:/Nooklet/Downloads:/downloads"
```

Use quoted forward-slash paths on Windows. The value on the right of each colon is the container path and is the path Nooklet sees.

For these examples, set:

```dotenv
APPROVED_MEDIA_ROOTS=/media
APPROVED_DOWNLOAD_ROOTS=/downloads
DOWNLOAD_ENGINE_DIR=/downloads/nooklet-engine
```

If you use only SABnzbd, `DOWNLOAD_ENGINE_DIR` is not part of SAB's download execution, but leaving a valid local value is harmless. SAB imports may additionally need `SABNZBD_PATH_MAPPINGS`; see [Storage and path mapping](Storage-and-Path-Mapping).

## 4. Build and start

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

The first command validates the assembled Compose structure. Runtime secret validation happens when the application starts, so inspect the container logs if it exits.

The Compose deployment:

- publishes `127.0.0.1:42021` by default;
- stores the database under `/app/data` in the `nooklet-data` named volume;
- starts as the non-root `node` user;
- drops all Linux capabilities;
- enables `no-new-privileges`;
- restarts unless explicitly stopped.

Database migrations run automatically during application startup. There is no separate migration command for a normal installation or upgrade.

## 5. Verify health

macOS or Linux:

```bash
curl http://localhost:42021/api/health
```

Windows PowerShell:

```powershell
Invoke-RestMethod http://localhost:42021/api/health
```

If the health request fails, inspect the container before continuing:

```bash
docker compose ps
docker compose logs --tail=200 app
```

## 6. Create the administrator

Open [http://localhost:42021](http://localhost:42021). Nooklet redirects an uninitialized instance to the first-administrator form. Enter the `BOOTSTRAP_TOKEN` value from `.env`, then choose the administrator's display name, email address, and password.

After the administrator exists, remove or clear `BOOTSTRAP_TOKEN` in `.env` and recreate the container so the runtime receives the change:

```bash
docker compose up -d --force-recreate
```

Continue with [First-time setup](First-Time-Setup).

## Remote access and reverse proxies

The default loopback binding deliberately keeps an unfinished instance off the LAN. For direct LAN exposure, set `APP_BIND_ADDRESS=0.0.0.0` only after authentication is configured and you understand the network boundary.

For a reverse proxy:

1. Keep Nooklet bound to loopback when the proxy runs on the same host.
2. Set `APP_URL` to the exact externally visible HTTPS origin.
3. Forward traffic to `http://127.0.0.1:42021`.
4. Enable `TRUST_PROXY_HEADERS=true` only when the proxy overwrites forwarding headers from clients.

See [Configuration reference](Configuration-Reference) and [Security model](Security-Model) before exposing the application beyond a trusted network.

## Applying configuration changes

Compose reads environment values and mounts when it creates a container. After changing `.env` or `docker-compose.override.yml`, recreate it:

```bash
docker compose up -d --force-recreate
```

A simple `docker compose restart` does not apply new environment values or volume bindings.

## Data safety

The named volume `nooklet-data` contains the SQLite database and the image-default built-in download directory. `docker compose down` keeps the volume. `docker compose down -v` deletes it and should be used only when intentionally erasing the instance.

Before upgrades, follow [Backup, restore, and upgrades](Backup-Restore-and-Upgrades) and copy a verified backup off the container host or data volume.

## Implementation references

- [Docker Compose configuration](https://github.com/TannerMidd/Nooklet/blob/main/docker-compose.yml)
- [Docker image stages and runtime tools](https://github.com/TannerMidd/Nooklet/blob/main/Dockerfile)
- [Environment template](https://github.com/TannerMidd/Nooklet/blob/main/.env.example)
- [Automatic runtime initialization](https://github.com/TannerMidd/Nooklet/blob/main/src/instrumentation.ts)
