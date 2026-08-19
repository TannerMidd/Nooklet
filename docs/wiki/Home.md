# Nooklet documentation

Nooklet is a self-hosted workspace for discovering, recommending, requesting, downloading, and organizing movies and TV. This Wiki is the operator and contributor handbook; the [README](https://github.com/TannerMidd/Nooklet#readme) remains the five-minute introduction.

> **New installation?** Follow [Getting started](Getting-Started), then complete [First-time setup](First-Time-Setup). Docker Compose is the recommended deployment.

Prefer a visual introduction? Start with the public [Feature guide](https://tannermidd.github.io/Nooklet/features/). For a clean, curated route through setup, daily use, and common recovery, open the [User guide](https://tannermidd.github.io/Nooklet/guide/). This Wiki remains the canonical source for detailed operator runbooks.

## Choose your path

| I want to…                                         | Start here                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Understand what Nooklet can do                     | [Feature guide](https://tannermidd.github.io/Nooklet/features/)                                   |
| Follow the clean path from setup through daily use | [User guide](https://tannermidd.github.io/Nooklet/guide/)                                         |
| Install Nooklet with Docker                        | [Docker installation](Docker-Installation)                                                        |
| Reach the first successful request                 | [First-time setup](First-Time-Setup)                                                              |
| Fix an “insufficient disk space” message           | [Storage and path mapping](Storage-and-Path-Mapping#download-capacity-policy)                     |
| Connect TMDB, Usenet, Plex, or another service     | [Service connections](Service-Connections)                                                        |
| Archive a public YouTube channel or video          | [YouTube monitoring and downloads](YouTube-Monitoring-and-Downloads)                              |
| Back up or upgrade safely                          | [Backup, restore, and upgrades](Backup-Restore-and-Upgrades)                                      |
| Diagnose an unhealthy container or failed request  | [Troubleshooting](Troubleshooting)                                                                |
| Understand the system design                       | [Architecture](Architecture) and the [engineering dossier](https://tannermidd.github.io/Nooklet/) |
| Develop or contribute                              | [Development guide](Development-Guide)                                                            |

## The shortest path to a request

1. Install with [Docker Compose](Docker-Installation).
2. Create the first administrator and remove the one-time bootstrap token.
3. Verify TMDB and a Usenet server for the built-in downloader.
4. Verify a Newznab indexer with the right movie or TV categories.
5. Attach a writable media destination and confirm storage capacity in **Settings → Storage**.

Setup Center reports whether the movie and TV request paths are actually ready. AI recommendations, watch history, and notifications are optional.

> **Storage rule:** engine scratch work, completed-output staging, and the final media library are distinct locations. The built-in downloader checks both `DOWNLOAD_ENGINE_WORK_DIR` and `DOWNLOAD_ENGINE_DIR`; the more constrained filesystem limits admission. Docker users must enter container-side paths such as `/downloads` and `/media/movies`, never host paths such as `F:/Downloads`.

## Documentation map

### Start and configure

- [Getting started](Getting-Started)
- [Docker installation](Docker-Installation)
- [Native installation](Native-Installation)
- [First-time setup](First-Time-Setup)
- [Configuration reference](Configuration-Reference)
- [Storage and path mapping](Storage-and-Path-Mapping)
- [Service connections](Service-Connections)
- [Indexers](Indexers)
- [Reverse proxy and LAN access](Reverse-Proxy-and-LAN-Access)

### Use and operate

- [Discover and recommendations](Discover-and-Recommendations)
- [Library and requests](Library-and-Requests)
- [YouTube monitoring and downloads](YouTube-Monitoring-and-Downloads)
- [Downloads and import](Downloads-and-Import)
- [Watch history](Watch-History)
- [Automation and notifications](Automation-and-Notifications)
- [Health and diagnostics](Health-and-Diagnostics)
- [Backup, restore, and upgrades](Backup-Restore-and-Upgrades)
- [Account and user administration](Account-and-User-Administration)
- [Troubleshooting](Troubleshooting)
- [Multi-instance deployments](Multi-Instance-Deployments)

### Engineering

- [Architecture](Architecture)
- [Data and background jobs](Data-and-Background-Jobs)
- [Security model](Security-Model)
- [HTTP API](HTTP-API)
- [Architecture decisions](Architecture-Decisions)
- [Development guide](Development-Guide)
- [Testing and CI](Testing-and-CI)
- [Documentation policy](Documentation-Policy)

## Support and project status

Nooklet is an actively developed, single-instance application built around separately supervised Next.js web and background-worker processes coordinated through SQLite. It is not designed for horizontal replicas or a shared network database. Review the [known operational boundaries](Multi-Instance-Deployments) before advanced deployments.

- Report reproducible bugs through [GitHub Issues](https://github.com/TannerMidd/Nooklet/issues).
- Report vulnerabilities through a [private security advisory](https://github.com/TannerMidd/Nooklet/security/advisories/new).
- Inspect build status in [GitHub Actions](https://github.com/TannerMidd/Nooklet/actions).
- Explore source-backed diagrams and quality evidence in the [engineering dossier](https://tannermidd.github.io/Nooklet/).

---

Documentation last reviewed against `main`: **August 6, 2026**.
