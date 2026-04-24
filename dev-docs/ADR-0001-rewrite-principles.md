# ADR-0001: Recommendarr Rewrite Principles

## Status

Accepted

## Date

2026-04-24

## Context

The current Recommendarr application delivers useful product behavior, but its
implementation shape is not a good foundation for continued evolution.

The current runtime centers large screen-level orchestrators and broad backend
surfaces:

- `src/components/RequestRecommendations.vue` owns end-to-end recommendation
  request orchestration, validation, service readiness checks, modal state,
  retry flow, and result handling.
- `src/components/History.vue` owns a separate history workflow with its own
  filters, display state, and service actions.
- `src/components/AISettings.vue` combines account settings, admin settings,
  connection management, and service-specific setup in one hub.
- `server/routes/credentialRoutes.js` and related helpers encode credential
  ownership and access behavior through service-specific policy branches.
- `server/utils/userDataManager.js` exposes a large user-data object that mixes
  recommendations, watch history, credentials-adjacent selections, UI settings,
  and workflow state.

The rewrite should preserve the product, not the current component tree, route
surface, or storage model.

## Decision

Recommendarr will be rewritten as a separate project using Next.js, React, and
TypeScript. The rewrite will be domain-oriented and workflow-oriented.

### Core stack

- Next.js App Router for UI and server runtime
- React with TypeScript strict mode
- Drizzle ORM
- SQLite in WAL mode for phase 1
- Auth.js for local login plus optional OAuth
- Zod for request, response, environment, and config validation
- TanStack Query for client-side server state
- Tailwind CSS plus shadcn/ui primitives

### Deployment model

Phase 1 remains a single-container deployment.

Background execution will use a persisted job table plus an in-process worker
loop. Domain logic must not depend on in-process assumptions so that the worker
can be split out later without changing workflows.

### Architecture shape

The new project will be organized by domain modules, not by frontend/backend
glue layers.

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

1. Do not port the current component tree into React.
2. Do not port the current API shape into Next route handlers.
3. Do not port the monolithic user-data JSON blob into the new schema.
4. Do not expose generic save-setting endpoints.
5. Do not expose a generic proxy endpoint.
6. Do not let the UI call raw service clients directly.
7. Do not hide credential ownership rules behind service-name branches in UI
   code.
8. Do not let a root component orchestrate half the application.
9. Model workflows explicitly: recommendation generation, watch-history sync,
   onboarding, connection verification, and admin actions.
10. Server-only adapters must expose typed capabilities rather than ad hoc
    service-specific methods consumed directly by screens.

### Workflow boundaries

Recommendation generation must be a dedicated workflow module with explicit
phases:

- request validation
- source preparation
- prompt construction
- model execution
- normalization
- persistence
- feedback capture
- retry handling

Watch-history sync must be a dedicated subsystem with explicit phases:

- source validation
- source fetch
- normalization
- merge/deduplication
- sync metadata persistence
- query surface for downstream consumers

### Authentication and authorization

- Local login remains a first-class feature.
- OAuth is optional in phase 1 and should be added only where it clearly fits
  the product, such as Trakt or account-provider support.
- First-admin bootstrap must be explicit.
- No default admin password behavior is allowed.

### Data design rules

The phase 1 schema will be normalized around workflows and records such as:

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

The schema should be SQLite-first but portable enough to move to PostgreSQL
later with minimal domain changes.

### Scope decisions

- Phase 1 targets near-full feature parity.
- This is a clean restart, not a migration.
- Single-container deployment is a hard requirement for phase 1.
- PWA and offline support stay out of scope unless they become critical.

## Behavior references from the current app

The old repo remains a behavior reference only. The highest-value reference
files are:

- `src/components/RequestRecommendations.vue`
- `src/components/History.vue`
- `src/components/AISettings.vue`
- `server/routes/credentialRoutes.js`
- `server/utils/userDataManager.js`

These files define what the product does today. They do not define how the new
system should be structured.

## Consequences

### Positive

- Clear workflow boundaries replace screen-level orchestration.
- Credential handling becomes explicit and testable.
- Watch-history sync and recommendation runs gain persisted state and audit
  visibility.
- The system becomes easier to test with module-level contract tests and
  end-to-end flows.
- Phase 1 can still ship in one container without forcing premature distributed
  infrastructure.

### Negative

- This is not an incremental refactor and cannot reuse most of the current UI
  or route structure.
- There is no automatic migration path from the current storage model.
- Initial delivery will take longer than a surface-level framework swap.

### Risks to manage

- Recreating behavior without copying implementation requires a strict behavior
  matrix and acceptance criteria.
- SQLite phase 1 decisions must avoid leaking SQLite-only assumptions into
  domain logic.
- Service adapter boundaries must be defined early or the rewrite will regress
  toward direct vendor coupling.

## Implementation order

1. Lock the behavior matrix and this ADR before scaffold work.
2. Scaffold the new project and CI baseline.
3. Implement schema, auth, bootstrap, and credential-vault foundations.
4. Implement service-connections and adapter capability contracts.
5. Implement watch-history sync.
6. Implement recommendation workflows.
7. Build UI flows on top of those modules.
8. Add hardening, contract tests, smoke tests, audit coverage, and security
   review.