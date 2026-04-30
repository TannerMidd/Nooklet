# ADR-0001: Architecture Principles

## Status

Accepted

## Date

2026-04-24 (last reviewed 2026-04-30)

## Context

Nooklet is a self-hosted application that connects an OpenAI-compatible
chat model to a media stack (Sonarr, Radarr, Plex, Jellyfin, Tautulli, Trakt,
SABnzbd) and produces TV and movie recommendations grounded in the user's
library and watch history.

The product spans several non-trivial workflows — recommendation generation,
watch-history sync, service connection setup, credential ownership, admin
operations — and exposes them through a Next.js App Router UI with a
server-side domain layer.

This ADR fixes the architectural shape of the application so future work has
a single, durable source of truth.

## Decision

Nooklet is built as a domain-oriented, workflow-oriented Next.js
application.

### Core stack

- Next.js App Router for UI and server runtime
- React with TypeScript strict mode
- Drizzle ORM
- SQLite in WAL mode
- Auth.js for local login plus optional OAuth
- Zod for request, response, environment, and config validation
- TanStack Query for client-side server state
- Tailwind CSS plus shadcn/ui primitives

### Deployment model

The application is a single-container deployment.

Background execution uses a persisted job table plus an in-process worker
loop. Domain logic must not depend on in-process assumptions so that the
worker can be split out later without changing workflows.

### Architecture shape

The codebase is organized by domain modules, not by frontend/backend glue
layers.

Required core modules:

- identity-access
- users
- service-connections
- credential-vault
- watch-history
- recommendations
- preferences
- admin

Each module owns:

- validation schemas
- types
- command handlers
- query handlers
- repository layer
- integration adapters
- explicit workflows

### Architectural rules

1. UI does not own multi-workflow orchestration. Screens stay route-scoped and
   delegate behavior to module workflows.
2. The HTTP and server-action surface is workflow-shaped, not CRUD-shaped.
   Routes describe a task and delegate to a module entry point.
3. Persistence is normalized around workflows and records. No JSON columns
   that aggregate unrelated concerns.
4. No generic save-setting endpoints. Settings writes go through a typed,
   purpose-specific command.
5. No generic proxy endpoint. The server never forwards arbitrary URLs or
   paths to upstream services.
6. UI must never call raw service clients or adapters. The path is
   UI → server action / route → module command/query/workflow → adapter.
7. Credential ownership rules live in `service-connections` /
   `credential-vault`. Never branch on a service name (`service === 'plex'`
   etc.) in UI code to decide policy.
8. No root component or layout orchestrates multiple workflows.
9. Recommendation generation, watch-history sync, onboarding, connection
   verification, and admin actions are explicit workflows with separate phase
   files. Phases are not collapsed into one function.
10. Server-only adapters expose typed capabilities, not ad hoc
    service-specific methods consumed directly by screens.

### Workflow boundaries

Recommendation generation is a dedicated workflow module with explicit
phases:

- request validation
- source preparation
- prompt construction
- model execution
- normalization
- persistence
- feedback capture
- retry handling

Watch-history sync is a dedicated subsystem with explicit phases:

- source validation
- source fetch
- normalization
- merge/deduplication
- sync metadata persistence
- query surface for downstream consumers

Each workflow has a thin orchestrator (`index.ts`) that calls phases in order
and a wiring test that mocks each phase and asserts order plus propagation.

### Authentication and authorization

- Local login is a first-class feature.
- OAuth is optional and only added where it clearly fits the product, such as
  Trakt or account-provider support.
- First-admin bootstrap is explicit and self-disables after the first admin
  is created.
- No default admin password is allowed, ever.
- Authorization is enforced server-side. UI guards are UX, not security.

### Data design rules

The schema is normalized around workflows and records such as:

- users
- sessions
- oauth_accounts
- service_connections
- service_secrets
- service_user_selections
- watch_history_sources
- watch_history_items
- sync_runs
- recommendation_runs
- recommendation_items
- recommendation_feedback
- preferences
- audit_events
- jobs

The schema is SQLite-first but portable enough to move to PostgreSQL later
with minimal domain changes. SQLite-only assumptions must not leak into
domain logic.

One Drizzle migration equals one logical change. Migrations land before
consumer code.

### Security

- Secrets are encrypted at rest, masked in UI summaries, and unreachable
  through generic read APIs.
- Outbound requests to user-configured services are guarded against SSRF.
- Tokens, secret values, and full upstream response bodies that contain them
  are never logged.

### Scope rules

- Single-container deployment is a hard requirement.
- PWA and offline support are out of scope unless they become critical.

## Consequences

### Positive

- Clear workflow boundaries replace screen-level orchestration.
- Credential handling is explicit and testable.
- Watch-history sync and recommendation runs have persisted state and audit
  visibility.
- Module-level contract tests and end-to-end flows are straightforward.
- The product ships in one container without forcing premature distributed
  infrastructure.

### Negative

- More files per workflow than a screen-driven shape would produce.
- Adding a new service requires touching the capability contract before any
  provider-specific code.

### Risks to manage

- Schema decisions must avoid leaking SQLite-only assumptions into domain
  logic.
- Service adapter boundaries must be respected to prevent regressions toward
  direct vendor coupling.
