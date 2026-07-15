# Nooklet

> A self-hosted home for discovering, recommending, requesting, downloading, and organizing movies and TV.

[![CI](https://github.com/TannerMidd/Nooklet/actions/workflows/ci.yml/badge.svg)](https://github.com/TannerMidd/Nooklet/actions/workflows/ci.yml)
[![Engineering dossier](https://github.com/TannerMidd/Nooklet/actions/workflows/engineering-dossier-pages.yml/badge.svg)](https://tannermidd.github.io/Nooklet/)
![Node.js 24](https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Nooklet combines media discovery, optional AI recommendations, direct Newznab search, a built-in Usenet downloader, and library organization in one hardened container. Plex, Tautulli, Trakt, SABnzbd, and notifications are optional integrations rather than required media managers.

[Quick start](#quick-start) | [Wiki](https://github.com/TannerMidd/Nooklet/wiki) | [Technical architecture](https://tannermidd.github.io/Nooklet/) | [Report an issue](https://github.com/TannerMidd/Nooklet/issues)

## What Nooklet does

| Area | What you get |
| --- | --- |
| Discover | TMDB-powered search, trending rails, artwork, cast, trailers, and watch-provider context. |
| Recommend | Personalized movie and TV suggestions from an OpenAI-compatible provider, with duplicate suppression and feedback. |
| Request | One request flow from search or recommendations, including season and episode selection for TV. |
| Download | Direct Newznab search and a native NNTP engine with PAR2 repair, archive extraction, queue controls, and an optional SABnzbd fallback. |
| Organize | File-aware imports into configured movie and TV destinations, followed by library discovery and visible workflow status. |
| Operate | Guided readiness checks, health reporting, audit history, encrypted secrets, verified backups, and recovery tooling. |

### What do I need?

| Goal | Required configuration |
| --- | --- |
| Browse and identify titles | TMDB |
| Request and import media | TMDB, one verified Newznab indexer, Usenet or SABnzbd, and a writable library destination |
| Generate personal recommendations | The above request path plus an OpenAI-compatible provider; watch history is optional |
| Receive external updates | An optional Discord, Apprise, or webhook notification channel |

## Screenshots

<p align="center">
  <img width="100%" alt="Nooklet movie and TV workspace" src="https://github.com/user-attachments/assets/33e127d1-6744-44ce-9f44-dea8953baed9">
</p>

<details>
<summary>View more screens</summary>

<p align="center">
  <img width="49%" alt="Nooklet recommendations" src="https://github.com/user-attachments/assets/e94382ed-2c58-4164-bd2c-8e8e4962ba12">
  <img width="49%" alt="Nooklet media detail" src="https://github.com/user-attachments/assets/ecfbcff5-342c-4c2b-82dd-57b61e03355c">
</p>
<p align="center">
  <img width="49%" alt="Nooklet library" src="https://github.com/user-attachments/assets/0ae21d72-835f-4d43-b815-ecfd8885f298">
  <img width="49%" alt="Nooklet settings" src="https://github.com/user-attachments/assets/b9ad74b3-d845-4413-b612-27bfb229cac7">
</p>

</details>

## Quick start

Docker Compose is the recommended installation path. It includes Node.js, SQLite, PAR2, UnRAR, 7-Zip, the background worker, and the native downloader.

### 1. Install the prerequisites

- Docker Desktop, or Docker Engine with Compose v2
- Git
- Host folders for your movie/TV libraries and download staging
- Credentials for the services you intend to use

Create every host media and download directory before starting Nooklet. Compose can otherwise create a missing bind source as an empty directory, which is especially confusing when an external disk or NAS is offline.

### 2. Clone Nooklet

```bash
git clone https://github.com/TannerMidd/Nooklet.git
cd Nooklet
```

### 3. Create the environment file

macOS or Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Generate three independent random values and place them in `.env` as `AUTH_SECRET`, `BOOTSTRAP_TOKEN`, and `SECRET_BOX_KEY`.

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

Your edited values should look like this:

```dotenv
AUTH_SECRET=<first-generated-value>
BOOTSTRAP_TOKEN=<second-generated-value>
SECRET_BOX_KEY=<third-generated-value>
```

Keep the default `APP_URL=http://localhost:42021` for a local-only install. Change it to the exact HTTPS URL users will open when deploying behind a reverse proxy.

### 4. Mount media and download storage

Create the host folders first, then add `docker-compose.override.yml`. This file is ignored by Git, so upgrades will not overwrite your machine-specific paths.

```yaml
services:
  app:
    volumes:
      - "/srv/media/tv:/media/tv"
      - "/srv/media/movies:/media/movies"
      - "/srv/nooklet-downloads:/downloads"
```

On Windows, use quoted forward-slash paths:

```yaml
services:
  app:
    volumes:
      - "D:/Media/TV:/media/tv"
      - "D:/Media/Movies:/media/movies"
      - "F:/Nooklet/Downloads:/downloads"
```

For the built-in downloader, also set this in `.env`:

```dotenv
DOWNLOAD_ENGINE_DIR=/downloads/nooklet-engine
APPROVED_MEDIA_ROOTS=/media
APPROVED_DOWNLOAD_ROOTS=/downloads
```

### 5. Build and start

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app
```

`docker compose config --quiet` validates Compose structure. Application secret validation happens when the container starts, so inspect the logs if it exits.

Verify readiness:

```bash
curl http://localhost:42021/api/health
```

Or with PowerShell:

```powershell
Invoke-RestMethod http://localhost:42021/api/health
```

Inspect the response body: the database and background worker checks should be `ok`. A responsive worker can return HTTP 200 with an overall `degraded` status after a failed maintenance pass.

Open [http://localhost:42021](http://localhost:42021), enter the one-time bootstrap token, and create the first administrator. Nooklet signs you in and opens **Setup Center**, which measures the real request path rather than relying on a static checklist.

After the administrator exists, remove `BOOTSTRAP_TOKEN` from `.env` and recreate the container:

```bash
docker compose up -d --force-recreate
```

## First-request checklist

Setup Center marks a request path ready when these checks pass:

1. **TMDB** is verified.
2. **A downloader** is verified: the built-in Usenet connection or SABnzbd.
3. **An indexer** is enabled, verified, and assigned movie or TV categories.
4. **A destination** for that media type is reachable and writable.
5. **Download staging** is writable and has usable capacity when using the built-in engine.
6. **The background worker** is healthy.

AI recommendations, watch history, and notifications are optional. You can request media without configuring them.

## Storage paths: the important rule

Nooklet runs inside the container. Configure the path on the **right-hand side** of each bind mount in the UI.

| Host folder | Container path | Enter in Nooklet |
| --- | --- | --- |
| `D:/Media/TV` | `/media/tv` | `/media/tv` |
| `D:/Media/Movies` | `/media/movies` | `/media/movies` |
| `F:/Nooklet/Downloads` | `/downloads` | Set `DOWNLOAD_ENGINE_DIR=/downloads/nooklet-engine` in `.env` |

> [!IMPORTANT]
> The built-in downloader checks free space on `DOWNLOAD_ENGINE_DIR`, not on the final media drive. Its request-time threshold is 512 MiB plus twice the remaining active-download bytes plus twice the new release's declared bytes. If a request reports insufficient space, confirm the configured staging path under **Settings -> Storage**.

Changing an environment value or bind mount requires container recreation; a simple restart is not enough:

```bash
docker compose up -d --force-recreate
```

See [Storage and path mapping](https://github.com/TannerMidd/Nooklet/wiki/Storage-and-Path-Mapping) for NAS examples, SAB path translation, permissions, and capacity troubleshooting.

## Everyday operations

| Task | Command |
| --- | --- |
| Show status | `docker compose ps` |
| Follow logs | `docker compose logs -f app` |
| Show recent logs | `docker compose logs --tail=200 app` |
| Recreate after env/mount edits | `docker compose up -d --force-recreate` |
| Stop without deleting data | `docker compose down` |
| Start again | `docker compose up -d` |

### Update safely

Create and copy an off-host backup first, then:

```bash
git pull --ff-only
docker compose up -d --build
docker compose ps
```

Database migrations run automatically during startup. Do not run `docker compose down -v` unless you intentionally want to delete the persistent database volume.

Detailed procedures:

- [Backup, restore, and upgrades](https://github.com/TannerMidd/Nooklet/wiki/Backup-Restore-and-Upgrades)
- [Health and diagnostics](https://github.com/TannerMidd/Nooklet/wiki/Health-and-Diagnostics)
- [Troubleshooting](https://github.com/TannerMidd/Nooklet/wiki/Troubleshooting)

## Configuration

The annotated template at [`.env.example`](.env.example) is the canonical starting point. The full explanation, including reverse proxies, private LAN services, key rotation, SAB mappings, and AI timeouts, is in the [configuration reference](https://github.com/TannerMidd/Nooklet/wiki/Configuration-Reference).

| Variable | When needed | Default or guidance |
| --- | --- | --- |
| `AUTH_SECRET` | Always | Required, independent random value, 32-512 characters |
| `BOOTSTRAP_TOKEN` | First administrator only | Independent one-time value, 32-512 characters |
| `SECRET_BOX_KEY` | Strongly recommended | Independent key for encrypted connection secrets |
| `APP_URL` | Always | `http://localhost:42021`; use the exact public HTTPS origin behind a proxy |
| `APP_BIND_ADDRESS` | Docker exposure | `127.0.0.1`; change deliberately, never by accident |
| `APP_PORT` | Docker exposure | `42021` |
| `DOWNLOAD_ENGINE_DIR` | Built-in downloader | `/app/data/downloads` in the image; use `/downloads/nooklet-engine` for a bind-mounted staging drive |
| `APPROVED_MEDIA_ROOTS` | Library scans/imports | Semicolon/newline-separated container roots; empty fails closed |
| `APPROVED_DOWNLOAD_ROOTS` | SAB imports | Semicolon/newline-separated container roots; empty fails closed |

## Integrations

Connections can be tested in the UI, and saved secrets are encrypted at rest.

- **TMDB** for metadata and discovery
- **OpenAI-compatible providers** for optional AI recommendations
- **Newznab indexers** for release search
- **Usenet/NNTP** for the built-in downloader
- **SABnzbd** as an optional legacy downloader
- **Plex, Tautulli, and Trakt** for optional watch-history context
- **Discord, Apprise, and generic webhooks** for notifications

## Local development

Requirements:

- Node.js `>=24.11.0`
- npm
- Native `par2`, `unrar`, and `7zz` executables on `PATH` for full host-side download finalization

```bash
npm ci
cp .env.example .env
# Set AUTH_SECRET and, for web bootstrap, BOOTSTRAP_TOKEN.
npm run dev
```

`npm run dev` listens on port `42021`. For a bare-metal production start, build first and set `PORT=42021` before running `npm start`.

Quality commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run docs:wiki:check
```

Tests are colocated as `*.test.ts` and use isolated SQLite state. Generate a migration with `npm run db:generate` only after intentionally changing the Drizzle schema.

## Architecture and security

Nooklet is an intentionally single-instance modular monolith:

```text
App Router page or component
  -> authenticated server action / route handler
  -> named domain workflow
  -> repository or typed adapter
  -> SQLite, approved filesystem, or explicit external service
```

The runtime uses SQLite in WAL mode, an in-process persisted job worker, a native NNTP engine, canonical filesystem boundaries, SSRF-aware outbound requests, AES-256-GCM secret envelopes, non-root container execution, dropped Linux capabilities, and `no-new-privileges`.

- [Interactive engineering dossier](https://tannermidd.github.io/Nooklet/)
- [Current architecture](https://github.com/TannerMidd/Nooklet/wiki/Architecture)
- [Architecture decision history](https://github.com/TannerMidd/Nooklet/wiki/Architecture-Decisions)
- [Security model](https://github.com/TannerMidd/Nooklet/wiki/Security-Model)

For vulnerabilities, use a [private GitHub security advisory](https://github.com/TannerMidd/Nooklet/security/advisories/new) rather than a public issue.

## Documentation

| Resource | Purpose |
| --- | --- |
| [Wiki](https://github.com/TannerMidd/Nooklet/wiki) | Installation, setup, configuration, operation, troubleshooting, and development guides |
| [Engineering dossier](https://tannermidd.github.io/Nooklet/) | Source-backed architecture diagrams, charts, trust boundaries, and release evidence |
| [HTTP API](https://github.com/TannerMidd/Nooklet/wiki/HTTP-API) | Current public route contracts, status semantics, and authentication boundaries |
| [Documentation map](https://github.com/TannerMidd/Nooklet/wiki/Documentation-Map) | Source-of-truth hierarchy and task-oriented guide index |

## License

Nooklet is released under the [MIT License](LICENSE).
