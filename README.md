<div align="center">

# Nooklet

**Discover, request, download, and organize movies, TV, and permitted public YouTube videos from one self-hosted app.**

Native Usenet downloading, intelligent recommendations, and clear operational status—without requiring a separate media manager.

[![CI](https://github.com/TannerMidd/Nooklet/actions/workflows/ci.yml/badge.svg)](https://github.com/TannerMidd/Nooklet/actions/workflows/ci.yml)
[![Product and engineering site](https://github.com/TannerMidd/Nooklet/actions/workflows/engineering-dossier-pages.yml/badge.svg)](https://tannermidd.github.io/Nooklet/)
![Node.js 24](https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-4d7c6a.svg)](LICENSE)

[Explore features](https://tannermidd.github.io/Nooklet/features/) · [Open the user guide](https://tannermidd.github.io/Nooklet/guide/) · [Read the Wiki](https://github.com/TannerMidd/Nooklet/wiki) · [Explore the architecture](https://tannermidd.github.io/Nooklet/) · [Report an issue](https://github.com/TannerMidd/Nooklet/issues)

<img src="docs/assets/readme/showcase.webp" alt="Nooklet Discover and Library showcase" width="100%">

</div>

## One app, the whole journey

| Discover confidently                                                                             | Request in one flow                                                                               | Operate without guesswork                                                                                       |
| :----------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------- |
| Search TMDB, explore current releases, and use optional AI recommendations shaped by your taste. | Choose a movie, season, or episode and follow it from release search through download and import. | See storage readiness, downloader health, queue state, and the right recovery action when work needs attention. |

Nooklet brings the full media workflow into one coherent interface. Plex, Tautulli, Trakt, Discord, Apprise, and webhooks are optional integrations—the download path itself is built in.

## See Nooklet in action

|                                                            Discovery                                                             |                                                           Library                                                            |
| :------------------------------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------------------: |
| <img src="docs/assets/readme/discover.webp" alt="Current Nooklet Discover screen with filters and trending movies" width="100%"> | <img src="docs/assets/readme/library.webp" alt="Current Nooklet Library overview with movie and TV statistics" width="100%"> |
|                  Browse personalized ideas, public catalog trends, and title search from one focused workspace.                  |                  Understand the state of every library, title, media file, and monitored item at a glance.                   |

## What is included

| Product experience                                                                | Media engine                                                                                                       |
| :-------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| TMDB discovery, search, artwork, cast, trailers, and watch-provider context       | Direct Newznab search with movie, season, and episode request flows                                                |
| Optional recommendations from any OpenAI-compatible provider                      | Native NNTP downloading with persisted queue state, pause/resume, verified cancellation, and restart-safe recovery |
| Movie and TV library views with scanning, monitoring, and file awareness          | PAR2 verification and repair, archive extraction, and organized imports                                            |
| Public YouTube video/channel search plus channel or playlist monitoring           | Restart-safe yt-dlp downloads with bounded quality profiles and organized YouTube imports                          |
| Guided setup, storage preflight, diagnostics, audit history, and recovery actions | One built-in downloader plus optional Plex, Tautulli, and Trakt context                                            |

## Install Nooklet

Docker Compose is the recommended installation path. It packages the web app, background worker, SQLite database, downloader, repair and extraction tools, Python, ffmpeg, and yt-dlp into one deployment.

### What you need

- Docker Desktop, or Docker Engine with Docker Compose v2
- Git
- At least one existing final library folder: Movies, TV, or YouTube
- A separate existing folder for completed-download staging (Usenet output)
- Enough free space in Docker's data storage for in-flight work, repair, and extraction

On Windows or macOS, start Docker Desktop and wait until its Linux engine is running. On Linux, start Docker Engine. A first movie or TV request also needs TMDB credentials, a Newznab indexer, and a Usenet provider; you add those inside Nooklet after installation. YouTube archiving is optional and independent of those Movie/TV prerequisites.

### Easiest route: use the setup builder

Open the **[Docker setup builder](https://tannermidd.github.io/Nooklet/guide/#docker-configurator)**. It runs entirely in your browser and does not send your folders or generated secrets anywhere.

1. Choose the operating system that runs Docker.
2. Enter at least one existing final library folder (Movies, TV, or YouTube), then enter the separate completed-download staging folder.
3. Open PowerShell on Windows or Terminal on Linux/macOS in the parent folder where Nooklet should be installed.
4. Paste the generated private command once.
5. Wait for the command to report `Nooklet is healthy` and print the one-time bootstrap token.

The command checks Docker and Git, clones Nooklet, creates the private environment and mount files, verifies that the container can write to every selected folder, builds the images, starts the services, and waits for application health. Keep the generated command private because it contains installation secrets.

Prefer to inspect and enter every value yourself? Follow the **[manual Docker installation guide](https://github.com/TannerMidd/Nooklet/wiki/Docker-Installation)**. It includes separate Windows, Linux, and macOS commands, exact storage mappings, success checks, and recovery steps.

### Finish the first login

1. Open [http://localhost:42021](http://localhost:42021).
2. Enter the printed one-time `BOOTSTRAP_TOKEN` and create the first administrator. Nooklet automatically closes `/bootstrap` as soon as an administrator exists and refuses later bootstrap attempts.
3. Continue with **[First-time setup](https://github.com/TannerMidd/Nooklet/wiki/First-Time-Setup)** in **Setup Center** to connect TMDB, Newznab, and Usenet for Movie/TV requests; attach the final library folders; and make a small test request. Attach an optional YouTube destination separately, typically at `/media/youtube`.

If the setup command does not report a healthy app, do not delete data or volumes. Use the **[Docker installation recovery steps](https://github.com/TannerMidd/Nooklet/wiki/Docker-Installation#installation-recovery)** or the **[symptom-based troubleshooting guide](https://github.com/TannerMidd/Nooklet/wiki/Troubleshooting)**.

## Storage paths, without surprises

> [!IMPORTANT]
> Nooklet runs inside Docker, so the app uses container paths—not Windows drive letters or host paths. If `F:/Nooklet/Downloads` is mounted as `/downloads`, configure Nooklet with `/downloads`. The built-in engine checks both its in-flight workspace (`DOWNLOAD_ENGINE_WORK_DIR`) and completed-output staging (`DOWNLOAD_ENGINE_DIR`); the filesystem with less usable capacity limits admission. Neither is a final library destination. For YouTube, bind the host archive folder to `/media/youtube`; `/app/data/youtube` is temporary work storage, not the final library.

If a request reports insufficient space, open **Settings → Storage** and inspect both effective engine paths. Environment or bind-mount changes require `docker compose up -d --force-recreate`.

See [Storage and path mapping](https://github.com/TannerMidd/Nooklet/wiki/Storage-and-Path-Mapping) for capacity rules, NAS examples, engine staging, and permissions.

## YouTube archiving scope

Library's YouTube area can search public channels/videos, accept supported YouTube URLs, download selected videos, and monitor a channel's regular Videos feed or a public playlist. Existing backlog selection is explicit; successful later syncs queue newly discovered eligible regular videos. YouTube is an optional final library type: map its host folder to `/media/youtube`; completed-download staging remains separate Usenet output, and `/app/data/youtube` is temporary work storage. YouTube does not require TMDB, Newznab, or Usenet. See [YouTube monitoring and downloads](https://github.com/TannerMidd/Nooklet/wiki/YouTube-Monitoring-and-Downloads) for setup, profiles, retry behavior, and current exclusions.

Nooklet does not use a YouTube API key or Google OAuth. When YouTube blocks a server's guest traffic, an administrator may explicitly upload a dedicated YouTube-only cookie export under Settings → Connections; Nooklet validates it live, encrypts it at rest, and exposes it to yt-dlp only through short-lived private temporary files. Docker keeps those leases on `/tmp` tmpfs; native installs use the operating system's private temporary directory. Download or archive content only when you have permission; you are responsible for complying with the content owner's terms and applicable law.

## Documentation and architecture

- **[Feature guide](https://tannermidd.github.io/Nooklet/features/)** — a visual tour of discovery, requests, resilient seasons, native downloads, Library, and operations.
- **[User guide](https://tannermidd.github.io/Nooklet/guide/)** — the clean path from installation to a first request, daily use, and symptom-first recovery.
- **[Wiki](https://github.com/TannerMidd/Nooklet/wiki)** — task-oriented installation, setup, operation, backup, upgrade, and troubleshooting guides.
- **[Engineering dossier](https://tannermidd.github.io/Nooklet/)** — source-backed architecture diagrams, capacity charts, trust boundaries, and release evidence.
- **[Architecture](https://github.com/TannerMidd/Nooklet/wiki/Architecture)** — runtime structure, domain boundaries, persistence, jobs, and integrations.
- **[Security model](https://github.com/TannerMidd/Nooklet/wiki/Security-Model)** — authentication, encrypted secrets, filesystem boundaries, and outbound-request controls.

## Development

Nooklet requires Node.js `>=24.15.0` and npm for local development.

```bash
npm ci
npm run dev
npm test
```

Use `npm run check` for the complete documentation, migration-history, module-boundary, type, lint, test, and production-build gate. `npm run test:e2e` exercises first-admin bootstrap, login, and a serious/critical accessibility smoke in Chromium. Contributor conventions and migration guidance live in the [development guide](https://github.com/TannerMidd/Nooklet/wiki/Development-Guide).

## Security and license

Report vulnerabilities through a [private GitHub security advisory](https://github.com/TannerMidd/Nooklet/security/advisories/new), not a public issue. Nooklet is released under the [MIT License](LICENSE); bundled runtime components retain their own [third-party notices](THIRD_PARTY_NOTICES.md).
