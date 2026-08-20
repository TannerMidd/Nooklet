# Documentation map

Use this page to find the right level of detail and to understand which artifact wins when documentation and implementation disagree.

## Start with the task, not the subsystem

| Task                                    | Primary guide                                                                           | Follow-up                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| See what Nooklet does                   | [Feature guide](https://tannermidd.github.io/Nooklet/features/)                         | [Engineering dossier](https://tannermidd.github.io/Nooklet/) |
| Follow a curated setup and usage path   | [User guide](https://tannermidd.github.io/Nooklet/guide/)                               | [Getting started](Getting-Started)                           |
| New guided Docker installation          | [Docker setup builder](https://tannermidd.github.io/Nooklet/guide/#docker-configurator) | [First-time setup](First-Time-Setup)                         |
| New manual Docker installation          | [Docker installation](Docker-Installation)                                              | [First-time setup](First-Time-Setup)                         |
| Fix storage or path errors              | [Storage and path mapping](Storage-and-Path-Mapping)                                    | [Troubleshooting](Troubleshooting)                           |
| Add or verify integrations              | [Service connections](Service-Connections)                                              | [Indexers](Indexers)                                         |
| Understand a request end to end         | [Downloads and import](Downloads-and-Import)                                            | [Data and background jobs](Data-and-Background-Jobs)         |
| Monitor or archive public YouTube media | [YouTube monitoring and downloads](YouTube-Monitoring-and-Downloads)                    | [Storage and path mapping](Storage-and-Path-Mapping)         |
| Upgrade or recover                      | [Backup, restore, and upgrades](Backup-Restore-and-Upgrades)                            | [Health and diagnostics](Health-and-Diagnostics)             |
| Change the code                         | [Development guide](Development-Guide)                                                  | [Testing and CI](Testing-and-CI)                             |
| Review design and risk                  | [Architecture](Architecture)                                                            | [Security model](Security-Model)                             |

## Documentation authority

When two documents conflict, use this order:

1. Executable code, database schema, tests, and workflows define observed behavior.
2. [`src/lib/env.ts`](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/env.ts) defines application environment variables.
3. [`.env.example`](https://github.com/TannerMidd/Nooklet/blob/main/.env.example) is the operator template and should mirror the environment schema.
4. [`docker-compose.yml`](https://github.com/TannerMidd/Nooklet/blob/main/docker-compose.yml) and the [`Dockerfile`](https://github.com/TannerMidd/Nooklet/blob/main/Dockerfile) define the shipped container deployment.
5. Architecture decision records explain intent and trade-offs; their delivery notes may age.
6. The Wiki translates current behavior into operator and contributor procedures.
7. The README is a concise entry point, not a complete reference.

The public Pages site adds a visual [Feature guide](https://tannermidd.github.io/Nooklet/features/), a curated [User guide](https://tannermidd.github.io/Nooklet/guide/), and a source-backed [engineering dossier](https://tannermidd.github.io/Nooklet/). These entry points do not replace the Wiki’s detailed operational runbooks.

## Maintenance standard

Every operational change should update the code, tests, `.env.example` when relevant, the affected Wiki source in [`docs/wiki`](https://github.com/TannerMidd/Nooklet/tree/main/docs/wiki), and the README only when the five-minute path changes. See [Documentation policy](Documentation-Policy).

---

Installation paths last reviewed: **August 19, 2026**.
