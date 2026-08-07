# Documentation Policy

> The goal is one reviewable source for each claim, with the README as an entry point and the Wiki as the operator/contributor handbook.

## Source-of-truth hierarchy

| Concern | Canonical source | Documentation role |
| --- | --- | --- |
| Observed runtime behavior | Code, schema, migrations, and tests | Wiki explains and links the owning implementation |
| Environment validation | `src/lib/env.ts` | `.env.example` mirrors every supported variable with operator guidance |
| Shipped container behavior | `Dockerfile` and `docker-compose.yml` | Installation/operations pages explain paths, persistence, and hardening |
| Public HTTP contracts | Route handlers and route tests | [HTTP API](HTTP-API) records the supported contract |
| Product acceptance | `docs/product/behavior-matrix.md` | Rows should identify implemented, partial, or planned status |
| Architecture decisions | `docs/adr/` | [Architecture Decisions](Architecture-Decisions) indexes and annotates current alignment |
| Current architecture narrative | [Architecture](Architecture) and engineering dossier | Must use implementation sources, not aspiration alone |
| Operator instructions | `docs/wiki/` | Published to GitHub Wiki without hand-edited divergence |
| Project entry point | `README.md` | Five-minute orientation and quick start; links to deeper Wiki pages |

When documents disagree, investigate the implementation rather than choosing the more convenient claim. Correct stale documents in the same change when scope allows.

## Repository and Wiki relationship

GitHub Wiki is a separate Git repository. The reviewable source should remain under `docs/wiki/` in the main Nooklet repository and be mirrored to `Nooklet.wiki.git`.

- Do not make the published Wiki the only copy.
- Use GitHub Wiki internal links such as `[Architecture](Architecture)` between pages.
- Use absolute repository URLs for code, tests, ADRs, and workflows.
- Keep `_Sidebar.md` and `_Footer.md` with the Wiki source.
- A publishing failure must not delete or rewrite the reviewed source.

## Page standard

Operator and engineering pages should include, as applicable:

1. Purpose and audience.
2. Current applicability or last source-review date.
3. Prerequisites.
4. Procedure or architecture explanation.
5. Verification criteria.
6. Failure/recovery guidance.
7. Known limitations and non-goals.
8. Direct links to owning source.
9. Links to related Wiki pages.

Use plain language first, then the exact configuration name, state, or type. Distinguish these labels consistently:

- **Required** - a capability cannot function without it.
- **Optional** - absence does not make the instance unhealthy.
- **Legacy** - supported for compatibility but not the preferred new path.
- **Advanced** - safe only when the operator understands the trust or recovery consequence.

## Technical claims

- Describe observed transitions, not every value present in an enum.
- State where a filesystem measurement is taken and which runtime can see a path.
- Attach units to timing, storage, and size values.
- Date repository counts and generated metrics; avoid undated numbers that will silently drift.
- Separate a successful unit/build/smoke check from production, scale, security, or accessibility certification.
- Mark inferences as inferences.
- Preserve honest limitations such as the single-container/single-instance topology, missing segment resume, or unsupported torrent transport.

## Diagrams

Prefer Mermaid for architecture, sequence, state, trust-boundary, and data-relationship diagrams so the source remains reviewable.

- Give every diagram a sentence explaining its scope.
- Keep state diagrams aligned with transitions executed by runtime code.
- Use separate diagrams for engine state and outer request/import state when they differ.
- Do not include secrets, account names, private endpoints, host drive letters, or actual media history.
- Link the implementation sources immediately before or after a diagram.

## Command examples

- Test commands before publication.
- Use `docker compose`, not the retired `docker-compose` spelling.
- Provide separate Bash and PowerShell examples when syntax differs.
- Use cryptographically secure secret generation. For PowerShell:

```powershell
[Convert]::ToBase64String(
  [Security.Cryptography.RandomNumberGenerator]::GetBytes(48)
)
```

- Never show `docker compose down -v` as routine stop, upgrade, or recovery guidance.
- Clearly mark destructive commands and the data they remove.
- Use generic paths such as `/downloads/nooklet-engine`, `/media/tv`, and `/media/movies`.

## Public-data policy

Never publish:

- `.env` or `.env.*` contents other than the sanitized template;
- authentication, bootstrap, encryption, provider, indexer, or Usenet secrets;
- signed-in screenshots containing accounts, media history, queue data, or private endpoints;
- local drive letters, usernames, NAS names, or home-network addresses;
- SQLite databases, WAL/SHM sidecars, backups, logs, certificates, or private keys;
- raw NZB payloads, protected download URLs, or upstream responses containing credentials.

The engineering dossier's [public-data policy](https://github.com/TannerMidd/Nooklet/blob/main/engineering-dossier/README.md) also applies to Wiki content.

## Change map

| Implementation change | Documentation to review |
| --- | --- |
| Environment variable | `.env.example`, README quick start if critical, Configuration Reference, troubleshooting |
| Compose/Dockerfile path or volume | Docker Installation, Storage and Path Mapping, backup/upgrade guidance |
| Service type or ownership | Service Connections, Getting Started, Security Model |
| Indexer/download behavior | Indexers, Downloads and Import, troubleshooting, ADR-0002 alignment |
| Schema/job timing | Data and Background Jobs, Architecture, health/API documentation |
| API route/status/error | HTTP API and repository `docs/api.md` |
| Authentication/authorization | First-Time Setup, Account Administration, HTTP API, Security Model |
| Backup/recovery behavior | Backup Restore and Upgrades, troubleshooting, README operations link |
| Architecture boundary | Architecture, project-structure note, ADR or ADR amendment |
| User-visible acceptance behavior | Behavior matrix and relevant task-oriented Wiki page |

## Review checklist

Before publishing documentation:

- [ ] Every current-behavior claim was checked against code or a verified run.
- [ ] Internal Wiki links resolve to the intended page slug.
- [ ] Repository links are absolute and point to the owning file, test, or workflow.
- [ ] Commands use the supported npm/Node/Docker tooling.
- [ ] Examples contain no local or sensitive data.
- [ ] Required, optional, legacy, and advanced behavior are clearly distinguished.
- [ ] Limitations and rollback/recovery consequences are explicit.
- [ ] Mermaid syntax renders and diagrams match runtime state.
- [ ] README duplication was avoided.
- [ ] A last-reviewed date or baseline is present for time-sensitive facts.

## Known documentation-system debt at this baseline

The current narrative sources were reconciled against implementation on 2026-08-06. Remaining drift-prevention work is mechanical:

- Repository metrics in the engineering dossier are copied values rather than generated or source-validated values.
- `.env.example`/environment-schema parity and public API examples are not contract-tested.
- Documentation validators check structure, safety, internal anchors, retired integration names, and current-main source-path existence, but do not prove runtime semantics or arbitrary external URL availability.
- Historical ADR bodies intentionally preserve superseded context; their status and amendment notes, not isolated old paragraphs, state current alignment.

Related: [Architecture Decisions](Architecture-Decisions) | [Development Guide](Development-Guide) | [Testing and CI](Testing-and-CI)
