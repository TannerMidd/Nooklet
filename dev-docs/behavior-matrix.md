# Recommendarr Rewrite Behavior Matrix

## Purpose

This document captures the behaviors the rewrite must preserve, independent of
the current implementation.

It is intentionally product-oriented. It should be used as the acceptance
baseline for the new repo.

## Product principles

- Preserve user-visible behavior where it matters.
- Do not preserve current component boundaries, route shapes, or storage shape.
- Prefer explicit workflows over generic endpoints and cross-screen mutation.
- Every behavior in this matrix should map to a module owner in the new system.

## Behavior sources in the current repo

- `src/components/RequestRecommendations.vue`
- `src/components/History.vue`
- `src/components/AISettings.vue`
- `server/routes/credentialRoutes.js`
- `server/utils/userDataManager.js`

## Behavior matrix

| Area | Behavior to preserve | Rewrite acceptance criteria | Current reference |
| --- | --- | --- | --- |
| Authentication | Users can sign in locally and use a per-user session. | Local login exists, session state is persistent and scoped per user, unauthorized routes redirect or reject cleanly. | `src/components/AISettings.vue` |
| Bootstrap | The first administrator can be established without relying on a default admin password. | Fresh install exposes an explicit bootstrap flow once, then disables it after first admin creation. | Product requirement, current auth/account flows |
| Authorization | Admin-only capabilities remain restricted. | Admin routes and screens are guarded server-side and UI-side; non-admin users cannot mutate admin-owned resources. | `src/components/AISettings.vue` |
| User management | Admins can manage user accounts and roles. | Admin UI supports listing users, creating users, updating roles, and disabling or resetting accounts subject to policy. | `src/components/AISettings.vue` |
| Account settings | A signed-in user can change their own password. | Account settings include password change flow with current-password verification and user-scoped success/error handling. | `src/components/AISettings.vue` |
| Service connections | Users can configure required external services through explicit setup flows. | Each supported service has connect/test/disconnect/status workflows with validated inputs and user-readable status. | `src/components/AISettings.vue` |
| Credential ownership | Shared vs user-scoped credentials are handled intentionally, not by hidden service-name branching. | Credential ownership is explicit in schema and policy; access and mutability are enforced consistently. | `server/routes/credentialRoutes.js` |
| Credential secrecy | Secrets are never exposed as plain configuration state to the browser beyond what is necessary for setup UX. | Secret values are encrypted at rest, masked in UI summaries, and unavailable through generic read APIs. | `server/routes/credentialRoutes.js` |
| Service user selection | Media/history providers that support remote users allow selecting the active remote identity. | User-selection workflows exist for Plex, Jellyfin, Tautulli, and similar services where applicable, and selections are persisted separately from raw secrets. | `server/utils/userDataManager.js` |
| Recommendation mode | The app supports separate TV and movie recommendation flows. | TV and movie recommendation screens are separate route-based flows with shared workflow core and media-specific settings where needed. | `src/components/RequestRecommendations.vue` |
| Recommendation request | Users can request a batch of recommendations using configured sources, filters, and preferences. | A recommendation run validates prerequisites, generates results, persists the run, and returns normalized recommendation items with run metadata. | `src/components/RequestRecommendations.vue` |
| Recommendation prerequisites | Missing AI or media service configuration is surfaced clearly before a run starts. | The UI blocks invalid recommendation requests with actionable setup messaging; the server also validates prerequisites. | `src/components/RequestRecommendations.vue` |
| Recommendation retries | Users can retry recommendation generation after failure or request additional recommendations. | Failed runs preserve status and error state; users can retry safely without corrupting prior runs; additional results attach to the same logical workflow or a documented successor run. | `src/components/RequestRecommendations.vue` |
| Result normalization | Recommendation results are normalized into a consistent item shape regardless of provider output. | The recommendation module persists typed items with stable fields for title, media type, rationale, confidence or score data, and provider metadata where relevant. | `src/components/RequestRecommendations.vue` |
| Duplicate suppression | Existing library items and already-seen or excluded titles are filtered deterministically. | Exclusion logic is centralized and applied consistently across initial results and retries. | `src/components/RequestRecommendations.vue` |
| Feedback | Users can like or dislike recommendation items. | Feedback is stored per recommendation item or media key, queryable later, and available to future recommendation workflows. | `src/components/RequestRecommendations.vue`, `server/utils/userDataManager.js` |
| Add-to-library | Users can add recommended media to Sonarr or Radarr with required options. | TV and movie add flows support the necessary root-folder, quality-profile, and tag selection steps, with success and failure handling. | `src/components/RequestRecommendations.vue` |
| Watch history ingest | The app can source watch history from Plex, Jellyfin, Tautulli, and Trakt where configured. | Each supported history source has an adapter-backed sync workflow with explicit sync state and persisted results. | `src/components/RequestRecommendations.vue`, `server/utils/userDataManager.js` |
| Watch history controls | Users can control history modes, limits, and source-specific settings. | History preferences are explicit fields in the preferences/source model, validated, and editable via route-based settings flows. | `src/components/RequestRecommendations.vue`, `server/utils/userDataManager.js` |
| Watch history only mode | Users can choose recommendation flows based only on selected watch-history sources. | Recommendation request assembly can derive source context from watch-history-only mode without relying on screen-local branches. | `src/components/RequestRecommendations.vue` |
| History browsing | Users can browse previously recommended TV and movie items. | History screen supports TV, movie, and combined views backed by persisted recommendation/run records instead of a generic blob. | `src/components/History.vue` |
| History filtering | Users can filter history to hide existing, liked, disliked, or hidden items. | History filters are explicit, composable, and persist according to product preference rules. | `src/components/History.vue` |
| Hidden items | Users can hide and unhide history items without deleting the underlying recommendation record. | Hidden state is persisted separately from the recommendation item record and respected by history queries. | `src/components/History.vue` |
| History pagination | Large recommendation history remains navigable and responsive. | History queries are paginated or incrementally loaded; totals and filtered counts are visible and accurate. | `src/components/History.vue` |
| Metadata enrichment | Recommendation and history items can show external metadata and artwork where available. | Metadata lookup is optional, async-safe, and does not break core recommendation/history flows when unavailable. | `src/components/History.vue`, `src/components/RequestRecommendations.vue` |
| AI settings | Users or admins can configure AI provider endpoint, auth, and model selection. | AI connection setup is an explicit workflow with validation, test connection, model discovery where supported, and saved defaults. | `src/components/AISettings.vue` |
| Multiple provider types | The app supports OpenAI-compatible APIs, including local providers. | The recommendation adapter contract supports hosted and local providers behind one typed capability interface. | `src/components/AISettings.vue` |
| Settings separation | Account, preferences, admin, and service setup should remain distinct concerns in the rewrite. | The rewrite exposes separate route flows for account, onboarding or connections, recommendation preferences, history settings, and admin. | `src/components/AISettings.vue` |
| Auditability | Sensitive changes and operational workflows should be traceable. | Audit events exist for login-sensitive actions, admin actions, credential changes, connection changes, sync runs, and recommendation runs. | Rewrite requirement informed by current gaps |
| Single-container deployment | The product must run in one container in phase 1. | The app, database file, and in-process background worker operate correctly within one containerized deployment. | Rewrite requirement |

## Module ownership map for the rewrite

| Behavior area | Primary rewrite module |
| --- | --- |
| Login, sessions, first-admin bootstrap, policy checks | `identity-access` |
| User lifecycle and password changes | `users` |
| Connection setup, verification, remote-user selection | `service-connections` |
| Secret storage and ownership rules | `credential-vault` |
| Source sync, merge rules, history-source configuration | `watch-history` |
| Run creation, prompt assembly, normalization, feedback, retry | `recommendations` |
| User-facing defaults and filters | `preferences` |
| Admin screens, audit views, operational controls | `admin` |

## Explicit non-goals for the rewrite

- No generic proxy endpoint.
- No generic save-setting endpoint.
- No monolithic `userData` replacement blob.
- No direct UI calls into vendor clients.
- No requirement to preserve current Vue screen or component boundaries.
- No requirement to preserve current Express route shapes.
- No phase 1 data migration from the existing app.
- No phase 1 PWA or offline scope unless it becomes critical.

## Suggested next artifacts for the new repo

When the new repo is created, carry this matrix forward into:

- `docs/adr/ADR-0001-rewrite-principles.md`
- `docs/product/behavior-matrix.md`
- domain-specific acceptance checklists per module
- end-to-end test plans derived from the acceptance criteria above