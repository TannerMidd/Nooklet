# Behavior Matrix

## Purpose

This document captures the product behaviors Recommendarr is expected to
support. It serves as the acceptance baseline for new work and as a checklist
when verifying that a workflow, route, or screen meets its requirements.

It is intentionally product-oriented and stays independent of any specific
implementation shape. Each row maps to a primary domain module under
`src/modules/`.

## Product principles

- Express behavior through explicit workflows, not generic endpoints or
  cross-screen mutation.
- Keep credential ownership and policy decisions inside the modules that own
  them, never in UI code.
- Every behavior in this matrix maps to a module owner.
- Authorization, encryption, and masking are verified server-side, not by UI
  guards.

## Behavior matrix

| Area | Behavior | Acceptance criteria | Owning module |
| --- | --- | --- | --- |
| Authentication | Users can sign in locally and use a per-user session. | Local login exists, session state is persistent and scoped per user, unauthorized routes redirect or reject cleanly. | identity-access |
| Bootstrap | The first administrator is established without a default admin password. | Fresh install exposes an explicit bootstrap flow once, then disables it after first admin creation. | identity-access |
| Authorization | Admin-only capabilities remain restricted. | Admin routes and screens are guarded server-side and UI-side; non-admin users cannot mutate admin-owned resources. | identity-access |
| User management | Admins can manage user accounts and roles. | Admin UI supports listing users, creating users, updating roles, and disabling or resetting accounts subject to policy. | users |
| Account settings | A signed-in user can change their own password. | Account settings include password change flow with current-password verification and user-scoped success/error handling. | users |
| Service connections | Users can configure required external services through explicit setup flows. | Each supported service has connect/test/disconnect/status workflows with validated inputs and user-readable status. | service-connections |
| Credential ownership | Shared and user-scoped credentials are handled explicitly, not by hidden service-name branching. | Credential ownership is encoded in schema and policy; access and mutability are enforced consistently. | credential-vault |
| Credential secrecy | Secrets are never exposed as plain configuration state to the browser beyond what is necessary for setup UX. | Secret values are encrypted at rest, masked in UI summaries, and unavailable through generic read APIs. | credential-vault |
| Service user selection | Media/history providers that support remote users allow selecting the active remote identity. | User-selection workflows exist for Plex, Jellyfin, Tautulli, and similar services where applicable, and selections are persisted separately from raw secrets. | service-connections |
| Recommendation mode | Separate TV and movie recommendation flows. | TV and movie recommendation screens are separate route-based flows with shared workflow core and media-specific settings where needed. | recommendations |
| Recommendation request | Users can request a batch of recommendations using configured sources, filters, and preferences. | A recommendation run validates prerequisites, generates results, persists the run, and returns normalized recommendation items with run metadata. | recommendations |
| Recommendation prerequisites | Missing AI or media service configuration is surfaced clearly before a run starts. | The UI blocks invalid recommendation requests with actionable setup messaging; the server also validates prerequisites. | recommendations |
| Recommendation retries | Users can retry recommendation generation after failure or request additional recommendations. | Failed runs preserve status and error state; users can retry safely without corrupting prior runs; additional results attach to the same logical workflow or a documented successor run. | recommendations |
| Result normalization | Recommendation results are normalized into a consistent item shape regardless of provider output. | The recommendation module persists typed items with stable fields for title, media type, rationale, confidence or score data, and provider metadata where relevant. | recommendations |
| Duplicate suppression | Existing library items and already-seen or excluded titles are filtered deterministically. | Exclusion logic is centralized and applied consistently across initial results and retries. | recommendations |
| Feedback | Users can like or dislike recommendation items. | Feedback is stored per recommendation item or media key, queryable later, and available to future recommendation workflows. | recommendations |
| Add-to-library | Users can add recommended media to Sonarr or Radarr with required options. | TV and movie add flows support the necessary root-folder, quality-profile, and tag selection steps, with success and failure handling. | service-connections |
| Watch history ingest | Source watch history from Plex, Jellyfin, Tautulli, and Trakt where configured. | Each supported history source has an adapter-backed sync workflow with explicit sync state and persisted results. | watch-history |
| Watch history controls | Users can control history modes, limits, and source-specific settings. | History preferences are explicit fields in the preferences/source model, validated, and editable via route-based settings flows. | preferences, watch-history |
| Watch history only mode | Users can run recommendation flows based only on selected watch-history sources. | Recommendation request assembly can derive source context from watch-history-only mode without screen-local branches. | recommendations |
| History browsing | Users can browse previously recommended TV and movie items. | History screen supports TV, movie, and combined views backed by persisted recommendation/run records. | recommendations |
| History filtering | Users can filter history to hide existing, liked, disliked, or hidden items. | History filters are explicit, composable, and persist according to product preference rules. | recommendations, preferences |
| Hidden items | Users can hide and unhide history items without deleting the underlying recommendation record. | Hidden state is persisted separately from the recommendation item record and respected by history queries. | recommendations |
| History pagination | Large recommendation history remains navigable and responsive. | History queries are paginated or incrementally loaded; totals and filtered counts are visible and accurate. | recommendations |
| Metadata enrichment | Recommendation and history items can show external metadata and artwork where available. | Metadata lookup is optional, async-safe, and does not break core recommendation/history flows when unavailable. | recommendations |
| AI settings | Users or admins can configure AI provider endpoint, auth, and model selection. | AI connection setup is an explicit workflow with validation, test connection, model discovery where supported, and saved defaults. | service-connections |
| Multiple provider types | Support OpenAI-compatible APIs, including local providers. | The recommendation adapter contract supports hosted and local providers behind one typed capability interface. | recommendations, service-connections |
| Settings separation | Account, preferences, admin, and service setup are distinct concerns. | The app exposes separate route flows for account, onboarding/connections, recommendation preferences, history settings, and admin. | identity-access, preferences, admin |
| Auditability | Sensitive changes and operational workflows are traceable. | Audit events exist for login-sensitive actions, admin actions, credential changes, connection changes, sync runs, and recommendation runs. | admin |
| Single-container deployment | The product runs in one container. | The app, database file, and in-process background worker operate correctly within one containerized deployment. | (deployment) |

## Module ownership map

| Behavior area | Primary module |
| --- | --- |
| Login, sessions, first-admin bootstrap, policy checks | `identity-access` |
| User lifecycle and password changes | `users` |
| Connection setup, verification, remote-user selection | `service-connections` |
| Secret storage and ownership rules | `credential-vault` |
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
