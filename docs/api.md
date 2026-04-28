# HTTP API Reference

This document describes the public HTTP routes implemented under `src/app/api`.
Most product workflows in this app use Next.js server actions instead of stable
HTTP endpoints; those actions are framework-private and are intentionally not
documented as API routes here.

## Base URL

Use the deployed app origin as the base URL.

| Environment | Base URL |
| --- | --- |
| Local Next dev | `http://localhost:3000` unless Next.js is started on another port |
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
| `/api/health` | `GET` | None | Readiness check for the app and database migrations. | `src/app/api/health/route.ts` |
| `/api/auth/[...nextauth]` | `GET`, `POST` | Auth.js-managed | Credentials login, logout, session, CSRF, and provider endpoints. | `src/app/api/auth/[...nextauth]/route.ts` |
| `/api/service-connections/sabnzbd/queue` | `GET`, `POST` | Required | Read and mutate the signed-in user's active SABnzbd queue. | `src/app/api/service-connections/sabnzbd/queue/route.ts` |

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

Lightweight liveness and readiness probe. It calls `ensureDatabaseReady()`, so a
successful response means SQLite is reachable and migrations have been applied.

Authentication: not required.

Success response:

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "status": "ok"
}
```

Failure response:

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json
```

```json
{
  "status": "error"
}
```

Example:

```bash
curl http://localhost:3000/api/health
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
- Successful app login redirects to `/tv`.

Direct client example with a cookie jar:

```bash
curl -c cookies.txt http://localhost:3000/api/auth/csrf
curl -b cookies.txt -c cookies.txt \
  -X POST http://localhost:3000/api/auth/callback/credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=<csrf-token-from-previous-response>" \
  --data-urlencode "email=admin@example.com" \
  --data-urlencode "password=your-password"
curl -b cookies.txt http://localhost:3000/api/auth/session
```

Auth.js may redirect or return different payloads depending on request headers
and query parameters. Treat this route as the Auth.js protocol surface rather
than an application-specific JSON API.

## `GET /api/service-connections/sabnzbd/queue`

Returns the signed-in user's active SABnzbd queue state. This endpoint never
exposes the saved SABnzbd API key.

Authentication: required.

Request body: none.

Status codes:

| Status | Body | Notes |
| --- | --- | --- |
| `200` | `ActiveSabnzbdQueueState` | Returned for authenticated callers, including disconnected or unverifiable SABnzbd states. |
| `401` | `ApiError` | Returned when no valid app session exists. |

Response type:

```ts
type ActiveSabnzbdQueueState = {
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

Example success response for a verified connection:

```json
{
  "connectionStatus": "verified",
  "statusMessage": "1 active SABnzbd request.",
  "snapshot": {
    "version": "4.4.1",
    "queueStatus": "Downloading",
    "paused": false,
    "speed": "12.3 MB/s",
    "kbPerSec": 12595.2,
    "timeLeft": "00:08:12",
    "activeQueueCount": 1,
    "totalQueueCount": 1,
    "items": [
      {
        "id": "SABnzbd_nzo_id",
        "title": "Example.Title.2026.1080p",
        "status": "Downloading",
        "progressPercent": 42.5,
        "timeLeft": "00:08:12",
        "category": "movies",
        "priority": "Normal",
        "labels": [],
        "sizeLabel": "5.0 GB",
        "sizeLeftLabel": "2.9 GB",
        "totalMb": 5120,
        "remainingMb": 2969.6
      }
    ]
  }
}
```

Example response when SABnzbd is not connected:

```json
{
  "connectionStatus": "disconnected",
  "statusMessage": "Connect SABnzbd to track active request progress.",
  "snapshot": null
}
```

Browser example:

```ts
const response = await fetch("/api/service-connections/sabnzbd/queue", {
  cache: "no-store",
});

if (!response.ok) {
  throw new Error("Unable to load the SABnzbd queue.");
}

const queueState = (await response.json()) as ActiveSabnzbdQueueState;
```

`curl` example using a previously authenticated cookie jar:

```bash
curl -b cookies.txt http://localhost:3000/api/service-connections/sabnzbd/queue
```

## `POST /api/service-connections/sabnzbd/queue`

Applies a queue action to the signed-in user's verified SABnzbd connection, then
returns the refreshed active queue state.

Authentication: required.

Content type: `application/json`.

Status codes:

| Status | Body | Notes |
| --- | --- | --- |
| `200` | `ActiveSabnzbdQueueState` | Action succeeded, or `moveToIndex` targeted the item's current position. |
| `400` | `ApiError` | Request body is invalid, SABnzbd is not connected or verified, the item cannot be moved, or SABnzbd rejects the action. |
| `401` | `ApiError` | Returned when no valid app session exists. |

Request body:

```ts
type SabnzbdQueueActionInput =
  | { type: "pauseQueue" }
  | { type: "resumeQueue" }
  | { type: "pause"; itemId: string }
  | { type: "resume"; itemId: string }
  | { type: "remove"; itemId: string }
  | { type: "move"; itemId: string; direction: "up" | "down" }
  | { type: "moveToIndex"; itemId: string; targetIndex: number };
```

Validation rules:

- `itemId` must be a non-empty string after trimming.
- `targetIndex` must be a non-negative integer and is zero based.
- `direction` must be `up` or `down`.
- `pauseQueue` and `resumeQueue` do not accept item fields.

Action behavior:

| Action | Effect |
| --- | --- |
| `pauseQueue` | Pauses all SABnzbd queue activity. |
| `resumeQueue` | Resumes all SABnzbd queue activity. |
| `pause` | Pauses one queue item. |
| `resume` | Resumes one queue item. |
| `remove` | Removes one queue item from SABnzbd. Already downloaded files are kept by SABnzbd. |
| `move` | Moves one queue item up or down by one position. |
| `moveToIndex` | Moves one queue item to a zero-based queue position. |

Example request:

```bash
curl -b cookies.txt \
  -X POST http://localhost:3000/api/service-connections/sabnzbd/queue \
  -H "Content-Type: application/json" \
  -d '{"type":"move","itemId":"SABnzbd_nzo_id","direction":"up"}'
```

Example invalid body response:

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
```

```json
{
  "message": "Invalid SABnzbd queue action."
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
