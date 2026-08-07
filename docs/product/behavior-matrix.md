# Behavior Matrix

## Purpose

This document captures the product behaviors Nooklet is expected to
support. It serves as the acceptance baseline for new work and as a checklist
when verifying that a workflow, route, or screen meets its requirements.

It is intentionally product-oriented and stays independent of any specific
implementation shape. Each row maps to its current primary owner, which may be
one or more domain modules, shared security/runtime code, or deployment source.
Status means:

- **Implemented** - the current code satisfies the stated acceptance behavior.
- **Partial** - a usable implementation exists, but a known gap prevents the
  acceptance statement from being fully true.
- **Planned** - the behavior is accepted product direction but is not shipped.

## Product principles

- Express behavior through explicit workflows, not generic endpoints or
  cross-screen mutation.
- Keep credential ownership and policy decisions inside the modules that own
  them, never in UI code.
- Every behavior in this matrix maps to a module owner.
- Authorization, encryption, and masking are verified server-side, not by UI
  guards.

## Behavior matrix

| Area | Behavior | Acceptance criteria | Owning implementation | Status |
| --- | --- | --- | --- | --- |
| Authentication | Users can sign in locally and use a per-user session. | Local login exists, session state is persistent and scoped per user, unauthorized routes redirect or reject cleanly. | identity-access | Implemented |
| Bootstrap | The first administrator is established without a default admin password. | Fresh install exposes an explicit bootstrap flow once, then disables it after first admin creation. | identity-access | Implemented |
| Authorization | Admin-only capabilities remain restricted. | Admin routes and screens are guarded server-side and UI-side; non-admin users cannot mutate admin-owned resources or another user's notification rows. Temporary-password accounts must replace that password before using protected actions or APIs. | identity-access and owning workflows | Implemented |
| User management | Admins can manage user accounts and roles. | Admin UI supports listing users, creating users, updating roles, and disabling or resetting accounts subject to policy. | users | Implemented |
| Account settings | A signed-in user can change their own password. | Account settings include password change flow with current-password verification and user-scoped success/error handling. | users | Implemented |
| Service connections | Users can configure required external services through explicit setup flows. | Each supported service has connect/test/disconnect/status workflows with validated inputs and user-readable status; administrators share one stable instance configuration. | service-connections, instance-config | Implemented |
| Credential ownership | Shared and user-scoped credentials are handled explicitly, not by hidden service-name branching. | Credential ownership is encoded in schema and policy; shared records resolve through a persisted stable instance owner and access/mutability are enforced consistently. | service-connections, indexers, instance-config, `src/lib/security` | Implemented |
| Credential secrecy | Secrets are never exposed as plain configuration state to the browser beyond what is necessary for setup UX. | Secret values are encrypted at rest, masked in UI summaries, and unavailable through generic read APIs. | service-connections, indexers, `src/lib/security` | Implemented |
| Service user selection | Media/history providers that support remote users allow selecting the active remote identity. | User-selection workflows exist for Plex and Tautulli where applicable, and selections are persisted separately from raw secrets. | service-connections | Implemented |
| Recommendation mode | Separate TV and movie recommendation flows. | TV and movie recommendation screens are separate route-based flows with shared workflow core and media-specific settings where needed. | recommendations | Implemented |
| Recommendation request | Users can request a batch of recommendations using configured sources, filters, and preferences. | A recommendation run validates prerequisites, generates results, persists the run, and returns normalized recommendation items with run metadata. | recommendations | Implemented |
| Recommendation prerequisites | Missing AI or media service configuration is surfaced clearly before a run starts. | The UI blocks invalid recommendation requests with actionable setup messaging; the server also validates prerequisites. | recommendations, readiness | Implemented |
| Recommendation retries | Users can retry recommendation generation after failure or request additional recommendations. | Failed runs preserve status and error state; users can retry safely without corrupting prior runs; additional results attach to the same logical workflow or a documented successor run. | recommendations | Implemented |
| Result normalization | Recommendation results are normalized into a consistent item shape regardless of provider output. | The recommendation module persists typed items with stable fields for title, media type, rationale, confidence or score data, and provider metadata where relevant. | recommendations | Implemented |
| Duplicate suppression | Existing library items and already-seen or excluded titles are filtered deterministically. | Exclusion logic is centralized and applied consistently across initial results and retries. | recommendations | Implemented |
| Feedback | Users can like or dislike recommendation items. | Feedback is stored per recommendation item or media key, queryable later, and available to future recommendation workflows. | recommendations | Implemented |
| Built-in library management | Users can configure TV and movie libraries, root paths, and default request behavior in Nooklet. | Library and path writes use typed workflows with server-side authorization, path validation, audit events, and normalized persistence; no generic settings endpoint owns library state. | media-library | Implemented |
| Library scanning | Users can scan configured library paths and automatically discover existing media files. | Scan workflows validate configured paths, discover supported media files, match metadata through TVDB/TMDB where possible, persist normalized titles/seasons/episodes/files, record scan status, and expose queryable results. Import-triggered scans are limited to the affected active path IDs. | media-library, service-connections | Implemented |
| Add-to-library | Users can add recommended or discovered media to Nooklet's built-in library manager. | TV and movie add flows create or update local media records, capture monitoring/request intent, support season selection where applicable, and return clear pending/search/download states. | media-library, service-connections | Implemented |
| Indexer management | Users can configure, test, and remove direct indexers without leaving Nooklet. | Each operation is a typed workflow gated by user authorization; indexer credentials and auth-bearing fields are encrypted or masked, field values are not persisted in audit payloads, and no generic proxy endpoint is exposed. | indexers, `src/lib/security` | Implemented |
| Indexer search | Users can search configured indexers for requested media. | Search workflows validate filters, resolve credentials server-side, normalize results into safe metadata, persist result ownership and expiry, rate-limit requests, and never return raw download URLs or API keys to the browser. | indexers | Implemented |
| Download enqueue and import | Users can enqueue selected releases to the built-in download engine and organize completed downloads into configured library paths. | Enqueue workflows obtain a protected release URL, fetch and validate NZBs server-side, persist caller-owned request/queue status, track progress, organize completed files under configured library paths without unsafe traversal or overwrite, and audit outcomes. | downloads, download-engine, media-library, service-connections | Implemented |
| Watch history ingest | Source watch history from manual imports, Plex, Tautulli, and Trakt where configured. | Each supported history source has an adapter-backed or validated manual workflow with explicit sync state and persisted results. | watch-history | Implemented |
| Watch history controls | Users can control history modes, limits, and source-specific settings. | History preferences are explicit fields in the preferences/source model, validated, and editable via route-based settings flows. | preferences, watch-history | Implemented |
| Watch history only mode | Users can run recommendation flows based only on selected watch-history sources. | Recommendation request assembly can derive source context from watch-history-only mode without screen-local branches. | recommendations | Implemented |
| History browsing | Users can browse previously recommended TV and movie items. | History screen supports TV, movie, and combined views backed by persisted recommendation/run records. | recommendations | Implemented |
| History filtering | Users can filter history to hide existing, liked, disliked, or hidden items. | History filters are explicit, composable, and persist according to product preference rules. | recommendations, preferences | Implemented |
| Hidden items | Users can hide and unhide history items without deleting the underlying recommendation record. | Hidden state is persisted separately from the recommendation item record and respected by history queries. | recommendations | Implemented |
| History pagination | Large recommendation history remains navigable and responsive. | History filters, totals, and page boundaries execute in SQLite rather than materializing the full matching history in the application. | recommendations | Implemented |
| Metadata enrichment | Recommendation and history items can show external metadata and artwork where available. | Metadata lookup is optional, async-safe, and does not break core recommendation/history flows when unavailable. | recommendations, service-connections | Implemented |
| AI settings | Users or admins can configure AI provider endpoint, auth, and model selection. | AI connection setup is an explicit workflow with validation, test connection, model discovery where supported, and saved defaults. | service-connections | Implemented |
| Multiple provider types | Support OpenAI-compatible APIs, including local providers. | The recommendation adapter contract supports hosted and local providers behind one typed capability interface. | recommendations, service-connections | Implemented |
| Settings separation | Account, preferences, admin, and service setup are distinct concerns. | The app exposes separate route flows for account, onboarding/connections, recommendation preferences, history settings, and admin. | identity-access, preferences, admin | Implemented |
| Auditability | Sensitive changes and operational workflows are traceable. | Audit events exist for login-sensitive actions, admin actions, credential changes, connection changes, sync runs, and recommendation runs. | admin and owning workflows | Partial - coverage is broad but not enforced for every privileged mutation. |
| Single-container deployment | The product runs in one container. | Separately supervised web and background-worker processes coordinate through the database and operate correctly within one containerized deployment. | Dockerfile, supervisor, database | Implemented |

## Module ownership map

| Behavior area | Primary module |
| --- | --- |
| Login, sessions, first-admin bootstrap, policy checks | `identity-access` |
| User lifecycle and password changes | `users` |
| Connection setup, verification, remote-user selection | `service-connections` |
| Secret storage and ownership rules | `service-connections`, `indexers`, `src/lib/security` |
| External title metadata lookup and normalization | `service-connections` adapters plus consuming media/recommendation modules |
| Built-in library paths, scans, media records, and request state | `media-library` |
| Direct indexer setup, testing, and search | `indexers` |
| Download enqueue, queue state, and completed-download import | `downloads`, `download-engine` |
| Source sync, merge rules, history-source configuration | `watch-history` |
| Run creation, prompt assembly, normalization, feedback, retry | `recommendations` |
| User-facing defaults and filters | `preferences` |
| Admin screens, audit views, operational controls | `admin` |

## Explicit non-goals

- No generic proxy endpoint.
- No generic save-setting endpoint.
- No monolithic user-data blob.
- No direct UI calls into vendor clients.
- No PWA or offline scope unless it becomes critical.

## Related documents

- [`docs/adr/ADR-0001-architecture-principles.md`](../adr/ADR-0001-architecture-principles.md)
- [`docs/architecture/project-structure.md`](../architecture/project-structure.md)
