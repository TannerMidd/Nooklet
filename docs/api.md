# HTTP API Reference

This document describes the public HTTP routes implemented under `src/app/api`.
Most product workflows in this app use Next.js server actions instead of stable
HTTP endpoints; those actions are framework-private and are intentionally not
documented as API routes here.

## Base URL

Use the deployed app origin as the base URL.

| Environment | Base URL |
| --- | --- |
| Local Next dev | `http://localhost:42021` (`npm run dev`) |
| Local Docker Compose | `http://localhost:42021` by default |
| Deployment | The configured `APP_URL` origin |

All documented application-owned routes return JSON. Auth.js routes may return
JSON, redirects, or HTML depending on the action and request headers.

## Authentication

Protected API routes use the Auth.js session cookie created by the local
credentials login flow. Same-origin browser calls can use ordinary `fetch`
requests after the user signs in. External clients need to preserve Auth.js
cookies between requests.

The app uses JWT sessions with a 24 hour maximum age. Disabled accounts and
password changes invalidate existing sessions on subsequent authenticated
requests.

## Route Summary

| Route | Methods | Auth | Purpose | Source |
| --- | --- | --- | --- | --- |
| `/api/health` | `GET` | None | Readiness check for database migrations and the background worker. | `src/app/api/health/route.ts` |
| `/api/auth/[...nextauth]` | `GET`, `POST` | Auth.js-managed | Credentials login, logout, session, CSRF, and provider endpoints. | `src/app/api/auth/[...nextauth]/route.ts` |
| `/api/service-connections/sabnzbd/queue` | `GET`, `POST` | Required | Read and mutate source-aware built-in and legacy SABnzbd queues. | `src/app/api/service-connections/sabnzbd/queue/route.ts` |

## Common Error Shape

Application-owned endpoints use this shape for most client-visible errors:

```ts
type ApiError = {
  message: string;
};
```

Auth.js errors follow Auth.js behavior and should be treated separately from the
application-owned endpoints below.

## `GET /api/health`

Readiness probe for SQLite migrations and the in-process background worker. A
`200` response means the database is ready and the worker has ticked in the
last 60 seconds. If an individual workload failed, the response stays `200`
but reports `status: "degraded"` and `backgroundWorker: "degraded"`; this keeps
a bad optional integration from taking the whole container out of service. A
stopped or stale worker, or a database failure, returns `503`. The public probe
never exposes internal error messages; authenticated operators can see those
on `/health`.

Authentication: not required.

Success response:

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

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
    "lastTickAt": "2026-07-14T18:30:00.000Z",
    "lastSuccessAt": "2026-07-14T18:30:00.000Z",
    "hasError": false
  },
  "timestamp": "2026-07-14T18:30:01.000Z"
}
```

Stopped/stale worker response:

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json
```

```json
{
  "status": "degraded",
  "checks": {
    "database": "ok",
    "backgroundWorker": "error"
  },
  "worker": {
    "started": true,
    "runningMaintenance": false,
    "lastTickAt": "2026-07-14T18:20:00.000Z",
    "lastSuccessAt": "2026-07-14T18:19:59.000Z",
    "hasError": true
  },
  "timestamp": "2026-07-14T18:30:01.000Z"
}
```

Example:

```bash
curl http://localhost:42021/api/health
```

## `/api/auth/[...nextauth]`

Auth.js owns this catch-all route. The application configures a single
credentials provider named `Local login` with `email` and `password` fields.
Prefer using the app login page at `/login` or the Auth.js client/server helpers
when calling this flow from app code.

Common Auth.js endpoints exposed through this route include:

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/auth/providers` | `GET` | List configured auth providers. |
| `/api/auth/csrf` | `GET` | Get the CSRF token required by Auth.js form posts. |
| `/api/auth/session` | `GET` | Read the current session for the caller's cookies. |
| `/api/auth/callback/credentials` | `POST` | Submit credentials login data. |
| `/api/auth/signout` | `POST` | Sign out the current session. |

Credentials login validation:

```ts
type CredentialsLoginInput = {
  email: string; // valid email, max 320 chars
  password: string; // required
};
```

Additional login behavior:

- Login attempts are rate limited to 10 attempts per normalized email in a five
  minute window.
- Credentials login is disabled while first-admin bootstrap is still open.
- Successful app login returns to the same-origin protected URL supplied in
  `callbackUrl`; invalid, external, login, and bootstrap targets fall back to
  `/tv`.

Direct client example with a cookie jar:

```bash
curl -c cookies.txt http://localhost:42021/api/auth/csrf
curl -b cookies.txt -c cookies.txt \
  -X POST http://localhost:42021/api/auth/callback/credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=<csrf-token-from-previous-response>" \
  --data-urlencode "email=admin@example.com" \
  --data-urlencode "password=your-password"
curl -b cookies.txt http://localhost:42021/api/auth/session
```

Auth.js may redirect or return different payloads depending on request headers
and query parameters. Treat this route as the Auth.js protocol surface rather
than an application-specific JSON API.

## `GET /api/service-connections/sabnzbd/queue`

Returns the signed-in user's built-in downloader and legacy SABnzbd queues as
separate sources plus an aggregate snapshot used by badges and title progress.
This endpoint never exposes saved connection secrets and does not mutate queue
state while reading it.

Authentication: required.

Request body: none.

Status codes:

| Status | Body | Notes |
| --- | --- | --- |
| `200` | `ActiveDownloadQueueState` | Returned for authenticated callers, including disconnected sources. |
| `401` | `ApiError` | Returned when no valid app session exists. |
| `503` | `ApiError` | Queue sources could not be read. |

Response type:

```ts
type ActiveDownloadQueueState = {
  connectionStatus: "disconnected" | "configured" | "verified" | "error";
  statusMessage: string;
  snapshot: SabnzbdQueueSnapshot | null;
  sources: DownloadQueueSourceState[];
};

type DownloadQueueSourceState = {
  source: "engine" | "sabnzbd";
  label: string;
  connectionStatus: "disconnected" | "configured" | "verified" | "error";
  statusMessage: string;
  snapshot: SabnzbdQueueSnapshot | null;
};

type SabnzbdQueueSnapshot = {
  version: string | null;
  queueStatus: string | null;
  paused: boolean;
  speed: string | null;
  kbPerSec: number | null;
  timeLeft: string | null;
  activeQueueCount: number;
  totalQueueCount: number;
  items: SabnzbdQueueItem[];
};

type SabnzbdQueueItem = {
  id: string;
  title: string;
  status: string;
  progressPercent: number;
  timeLeft: string | null;
  category: string | null;
  priority: string | null;
  labels: string[];
  sizeLabel: string | null;
  sizeLeftLabel: string | null;
  totalMb: number | null;
  remainingMb: number | null;
};
```

Example success response with an idle built-in downloader:

```json
{
  "connectionStatus": "verified",
  "statusMessage": "Built-in downloader: No active built-in downloads right now.",
  "snapshot": {
    "version": null,
    "queueStatus": "Idle",
    "paused": false,
    "speed": null,
    "kbPerSec": null,
    "timeLeft": null,
    "activeQueueCount": 0,
    "totalQueueCount": 0,
    "items": []
  },
  "sources": [
    {
      "source": "engine",
      "label": "Built-in downloader",
      "connectionStatus": "verified",
      "statusMessage": "No active built-in downloads right now.",
      "snapshot": {
        "version": "nooklet-engine",
        "queueStatus": "Idle",
        "paused": false,
        "speed": null,
        "kbPerSec": null,
        "timeLeft": null,
        "activeQueueCount": 0,
        "totalQueueCount": 0,
        "items": []
      }
    }
  ]
}
```

Example response when no downloader is configured:

```json
{
  "connectionStatus": "disconnected",
  "statusMessage": "Add a usenet server under Settings → Connections to download releases with the built-in downloader.",
  "snapshot": null,
  "sources": []
}
```

Browser example:

```ts
const response = await fetch("/api/service-connections/sabnzbd/queue", {
  cache: "no-store",
});

if (!response.ok) {
  throw new Error("Unable to load the download queues.");
}

const queueState = (await response.json()) as ActiveDownloadQueueState;
```

`curl` example using a previously authenticated cookie jar:

```bash
curl -b cookies.txt http://localhost:42021/api/service-connections/sabnzbd/queue
```

## `POST /api/service-connections/sabnzbd/queue`

Applies a queue action to one explicitly selected source, then returns the
refreshed source-aware queue state. Ordering and queue-wide pause controls are
local to that source; items cannot be moved between downloaders.

Authentication: required.

Content type: `application/json`.

Status codes:

| Status | Body | Notes |
| --- | --- | --- |
| `200` | `ActiveDownloadQueueState` | Action succeeded. |
| `400` | `ApiError` | JSON, source, or action fields are invalid. |
| `401` | `ApiError` | Returned when no valid app session exists. |
| `500` | `ApiError` | The selected downloader rejected or failed the action. |

Request body:

```ts
type DownloadQueueActionInput = {
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

Validation rules:

- `itemId` must be a non-empty string after trimming.
- `targetIndex` must be a non-negative integer and is zero based.
- `direction` must be `up` or `down`.
- `pauseQueue` and `resumeQueue` do not accept item fields.

Action behavior:

| Action | Effect |
| --- | --- |
| `pauseQueue` | Pauses the selected source's queue activity. |
| `resumeQueue` | Resumes the selected source's queue activity. |
| `pause` | Pauses one queue item. |
| `resume` | Resumes one queue item. |
| `remove` | Cancels one item in the selected source. Built-in-engine working/completed files are deleted; SABnzbd already-completed files are retained. |
| `move` | Moves one queue item up or down by one position. |
| `moveToIndex` | Moves one queue item to a zero-based queue position. |

Example request:

```bash
curl -b cookies.txt \
  -X POST http://localhost:42021/api/service-connections/sabnzbd/queue \
  -H "Content-Type: application/json" \
  -d '{"source":"sabnzbd","type":"move","itemId":"SABnzbd_nzo_id","direction":"up"}'
```

Example invalid body response:

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
```

```json
{
  "code": "invalid_action",
  "message": "Invalid download queue action."
}
```

Example action failure response:

```json
{
  "message": "That SABnzbd queue item is already at the top."
}
```

## Maintaining This Reference

When adding or changing API routes:

1. Add or update the route entry in the summary table.
2. Document auth, request body, query parameters, response shape, status codes,
   and one working example.
3. Keep source route handlers thin and put reusable validation in module schemas
   or workflows.
4. Do not document server actions here unless they become stable HTTP API
  routes under `src/app/api`.
