# HTTP API

> Applies to the current `main` implementation. Last source review: 2026-07-15.

Nooklet is primarily an interactive web application. Most product operations use Next.js server actions, which are framework-private and are not a stable external API. Only routes implemented under `src/app/api` are documented here.

## Base URL

Use the deployed Nooklet origin:

| Environment | Default |
| --- | --- |
| Native development | `http://localhost:42021` |
| Shipped Docker Compose | `http://localhost:42021` |
| Deployment | The configured `APP_URL` origin |

## Authentication

Protected routes use the Auth.js session cookie created by local credentials login. Same-origin browser clients can use ordinary `fetch` after sign-in. An external client must implement the Auth.js CSRF/cookie flow and retain cookies across requests.

Sessions use JWT strategy with a 24-hour maximum age. Disabled accounts and password changes are checked against the live user record on later authenticated requests.

## Route summary

| Route | Methods | Authentication | Purpose |
| --- | --- | --- | --- |
| `/api/health` | `GET` | None | Database and worker readiness |
| `/api/auth/[...nextauth]` | `GET`, `POST` | Auth.js-managed | Login, logout, CSRF, providers, and session protocol |
| `/api/service-connections/sabnzbd/queue` | `GET`, `POST` | Required | Source-aware built-in and legacy queue read/control |

Source: [`src/app/api`](https://github.com/TannerMidd/Nooklet/tree/main/src/app/api).

## Error shape

Application-owned queue endpoints use:

```ts
type ApiError = {
  code?: string;
  message: string;
};
```

Do not depend on internal exception text. Auth.js endpoints use Auth.js protocol responses and may return redirects, HTML, or JSON depending on the endpoint and request headers.

## `GET /api/health`

This public readiness probe applies migrations/database compatibility checks and evaluates worker recency. It does not expose internal exception messages.

Response statuses:

| HTTP | Meaning |
| ---: | --- |
| 200 | Worker is responsive. Body status is `ok` or `degraded`. |
| 503 | Worker is stopped/stale, or database readiness failed. |

Example responsive body:

```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "backgroundWorker": "ok"
  },
  "worker": {
    "started": true,
    "runningMaintenance": false,
    "lastTickAt": "2026-07-15T18:30:00.000Z",
    "lastSuccessAt": "2026-07-15T18:30:00.000Z",
    "hasError": false
  },
  "timestamp": "2026-07-15T18:30:01.000Z"
}
```

`status: "degraded"` with HTTP 200 means the worker has ticked recently but its latest pass recorded an error. Docker intentionally treats that as responsive. Use the authenticated `/health` page for capability remediation and technical job details.

```bash
curl --fail-with-body http://localhost:42021/api/health
```

Source: [health route](https://github.com/TannerMidd/Nooklet/blob/main/src/app/api/health/route.ts) and [worker readiness](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/jobs/worker-readiness.ts).

## `/api/auth/[...nextauth]`

Auth.js owns this catch-all route. The application currently configures one credentials provider named `Local login`.

Common endpoints include:

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/auth/providers` | `GET` | List configured sign-in providers |
| `/api/auth/csrf` | `GET` | Obtain the CSRF token used by Auth.js form posts |
| `/api/auth/session` | `GET` | Read the current caller session |
| `/api/auth/callback/credentials` | `POST` | Submit local email/password credentials |
| `/api/auth/signout` | `POST` | End the current session |

Login is disabled while first-admin bootstrap is still open. Prefer the Nooklet `/login` UI or Auth.js client helpers rather than binding an external integration directly to this protocol.

Source: [Auth.js configuration](https://github.com/TannerMidd/Nooklet/blob/main/src/auth.ts).

## `GET /api/service-connections/sabnzbd/queue`

Returns built-in and legacy queue sources plus an aggregate snapshot used by badges and title progress. The historical route name is retained for compatibility even though it now represents both sources.

Status codes:

| HTTP | Meaning |
| ---: | --- |
| 200 | Queue state returned, including an empty/disconnected state |
| 401 | No authenticated user session |
| 503 | One or more queue sources could not be read |

The response shape is:

```ts
type ActiveDownloadQueueState = {
  connectionStatus: "disconnected" | "configured" | "verified" | "error";
  statusMessage: string;
  snapshot: QueueSnapshot | null;
  sources: Array<{
    source: "engine" | "sabnzbd";
    label: string;
    connectionStatus: "disconnected" | "configured" | "verified" | "error";
    statusMessage: string;
    snapshot: QueueSnapshot | null;
  }>;
};
```

The aggregate queue sums counts and measured speeds. It exposes an ETA only when exactly one non-empty source exists because independent downloaders run concurrently.

```ts
const response = await fetch("/api/service-connections/sabnzbd/queue", {
  cache: "no-store",
});
if (!response.ok) throw new Error("Queue unavailable");
const state = await response.json();
```

## `POST /api/service-connections/sabnzbd/queue`

Applies an action to one explicit queue source and returns the refreshed aggregate state.

```ts
type QueueAction = {
  source: "engine" | "sabnzbd";
} & (
  | { type: "pauseQueue" }
  | { type: "resumeQueue" }
  | { type: "pause"; itemId: string }
  | { type: "resume"; itemId: string }
  | { type: "remove"; itemId: string }
  | { type: "move"; itemId: string; direction: "up" | "down" }
  | { type: "moveToIndex"; itemId: string; targetIndex: number }
);
```

Status codes:

| HTTP | Code | Meaning |
| ---: | --- | --- |
| 200 | n/a | Action succeeded; refreshed queue returned |
| 400 | `invalid_json` | Body was not valid JSON |
| 400 | `invalid_action` | Source or action fields failed validation |
| 401 | n/a | No authenticated user session |
| 409 | `queue_action_conflict` | Built-in item changed state or entered non-cancellable post-processing |
| 500 | `queue_action_failed` | Selected queue rejected or failed the action |

Example:

```bash
curl -b cookies.txt \
  -X POST http://localhost:42021/api/service-connections/sabnzbd/queue \
  -H "Content-Type: application/json" \
  -d '{"source":"engine","type":"pauseQueue"}'
```

Ordering and queue-wide pause controls are local to the selected source. An item cannot be moved between the built-in engine and SABnzbd.

Sources: [route handler](https://github.com/TannerMidd/Nooklet/blob/main/src/app/api/service-connections/sabnzbd/queue/route.ts), [contract](https://github.com/TannerMidd/Nooklet/blob/main/src/app/api/service-connections/sabnzbd/queue/contract.ts), and [queue view](https://github.com/TannerMidd/Nooklet/blob/main/src/app/api/service-connections/sabnzbd/queue/queue-view.ts).

## Compatibility policy

- Server actions are not public API contracts.
- Auth.js routes follow Auth.js behavior, not a Nooklet-specific JSON contract.
- Application-owned API changes should update the route tests, this Wiki page, and the repository API reference in the same change.
- Add auth behavior, validation, status codes, request/response examples, cache behavior, and source links for every new route.

Related: [Downloads and Import](Downloads-and-Import) | [Security Model](Security-Model) | [Documentation Policy](Documentation-Policy)
