# HTTP API Reference

This document describes the public HTTP routes implemented under `src/app/api`.
Most product workflows in this app use Next.js server actions instead of stable
HTTP endpoints; those actions are framework-private and are intentionally not
documented as API routes here.

## Base URL

Use the deployed app origin as the base URL.

| Environment          | Base URL                                 |
| -------------------- | ---------------------------------------- |
| Local Next dev       | `http://localhost:42021` (`npm run dev`) |
| Local Docker Compose | `http://localhost:42021` by default      |
| Deployment           | The configured `APP_URL` origin          |

All documented application-owned routes return JSON. Auth.js routes may return
JSON, redirects, or HTML depending on the action and request headers.

## Authentication

Protected API routes use the Auth.js session cookie created by the local
credentials login flow. Same-origin browser calls can use ordinary `fetch`
requests after the user signs in. External clients need to preserve Auth.js
cookies between requests.

The app uses encrypted JWT session cookies with an absolute 24 hour maximum
age. Each login also creates an `auth_sessions` validity record tied to the
user's monotonic `auth_generation` in SQLite. Session issuance rechecks the
generation captured during credential verification, and account disablement or
any password write advances it while revoking existing records. A pending login
therefore cannot become valid after a disable/re-enable or password-change
race.

Every authenticated request checks the validity record, generation, and live
user. The supported UI sign-out action revokes the current record before it
clears the browser cookie, so an older authenticated response cannot restore
access by writing that cookie back later. Direct `POST /api/auth/signout` is
intentionally unavailable; use Nooklet's **Sign out** control. An authenticated
account that must replace an administrator-issued or recovery password receives
`403 password_change_required` from protected API routes until that password is
changed.

## Route Summary

| Route                     | Methods       | Auth            | Purpose                                                                                            | Source                                    |
| ------------------------- | ------------- | --------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `/api/health`             | `GET`         | None            | Readiness check for database migrations, the background worker, and built-in engine progress.      | `src/app/api/health/route.ts`             |
| `/api/auth/[...nextauth]` | `GET`, `POST` | Auth.js-managed | Credentials login, session, CSRF, and provider endpoints; direct protocol sign-out is unavailable. | `src/app/api/auth/[...nextauth]/route.ts` |
| `/api/downloads/queue`    | `GET`, `POST` | Required        | Read and control the caller's built-in download queue.                                             | `src/app/api/downloads/queue/route.ts`    |

## Common Error Shape

Application-owned endpoints use this shape for most client-visible errors:

```ts
type ApiError = {
    code?: string;
    message: string;
};
```

Auth.js errors follow Auth.js behavior and should be treated separately from the
application-owned endpoints below.

## `GET /api/health`

Readiness probe for SQLite migrations, the isolated background worker, and
durable built-in download-engine progress. A
`200` response means the database is ready and the worker has ticked in the
last 60 seconds. If an individual workload failed, the response stays `200`
but reports `status: "degraded"`; this keeps
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
        "backgroundWorker": "ok",
        "downloadEngine": "idle"
    }
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
        "backgroundWorker": "error",
        "downloadEngine": "idle"
    }
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

| Route                            | Method | Purpose                                            |
| -------------------------------- | ------ | -------------------------------------------------- |
| `/api/auth/providers`            | `GET`  | List configured auth providers.                    |
| `/api/auth/csrf`                 | `GET`  | Get the CSRF token required by Auth.js form posts. |
| `/api/auth/session`              | `GET`  | Read the current session for the caller's cookies. |
| `/api/auth/callback/credentials` | `POST` | Submit credentials login data.                     |

The direct Auth.js `POST /api/auth/signout` action is intentionally unavailable.
Nooklet signs out through its UI server action, which durably revokes the
current SQLite validity record before clearing the browser cookie. External
clients must not treat the raw Auth.js sign-out protocol as a supported logout
surface.

Credentials login validation:

```ts
type CredentialsLoginInput = {
    email: string; // valid email, max 320 chars
    password: string; // required
};
```

Additional login behavior:

- With a trusted client address, login uses a 30-attempt per-source bucket and
  a 10-attempt per-source-plus-normalized-email bucket, both over five minutes.
  Without a trustworthy source address, Nooklet avoids a globally abusable
  account lock and instead uses a high global circuit breaker plus bounded
  candidate shards.
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

## `GET /api/downloads/queue`

Returns the signed-in user's built-in downloader queue. The response is scoped
to the caller's request associations, never exposes the configured Usenet
credential, and does not mutate queue state while reading it.

Authentication: required.

Request body: none.

Status codes:

| Status | Body                       | Notes                                                                        |
| ------ | -------------------------- | ---------------------------------------------------------------------------- |
| `200`  | `ActiveDownloadQueueState` | Returned for authenticated callers, including disconnected sources.          |
| `401`  | `ApiError`                 | Returned when no valid app session exists.                                   |
| `403`  | `ApiError`                 | The account must replace its temporary password before using protected APIs. |
| `503`  | `ApiError`                 | Queue sources could not be read.                                             |

Response type:

```ts
type ActiveDownloadQueueState = {
    connectionStatus: "disconnected" | "configured" | "verified" | "error";
    statusMessage: string;
    snapshot: DownloadQueueSnapshot | null;
    // POST responses may include this outcome.
    action?: {
        status: "applied" | "pending";
        message: string;
    };
};

type DownloadQueueSnapshot = {
    version: string;
    queueStatus: string | null;
    paused: boolean;
    speed: string | null;
    kbPerSec: number | null;
    timeLeft: string | null;
    activeQueueCount: number;
    totalQueueCount: number;
    items: DownloadQueueItem[];
};

type DownloadQueueItem = {
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
    "statusMessage": "No active downloads right now.",
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
```

Example response when no downloader is configured:

```json
{
    "connectionStatus": "disconnected",
    "statusMessage": "Add a Usenet server under Settings → Connections to download releases.",
    "snapshot": null
}
```

Browser example:

```ts
const response = await fetch("/api/downloads/queue", {
    cache: "no-store",
});

if (!response.ok) {
    throw new Error("Unable to load the download queue.");
}

const queueState = (await response.json()) as ActiveDownloadQueueState;
```

`curl` example using a previously authenticated cookie jar:

```bash
curl -b cookies.txt http://localhost:42021/api/downloads/queue
```

## `POST /api/downloads/queue`

Applies an action to the built-in queue, then returns the refreshed queue
state.

Authentication: required.

Content type: `application/json`.

The response is the refreshed `ActiveDownloadQueueState`. A built-in-engine
action may add `action: { status: "applied" | "pending", message: string }`;
pending outcomes also expose the message as the top-level `statusMessage`.

Status codes:

| Status | Body                       | Notes                                                                        |
| ------ | -------------------------- | ---------------------------------------------------------------------------- |
| `200`  | `ActiveDownloadQueueState` | Action succeeded.                                                            |
| `400`  | `ApiError`                 | JSON or action fields are invalid.                                           |
| `401`  | `ApiError`                 | Returned when no valid app session exists.                                   |
| `403`  | `ApiError`                 | The account must replace its temporary password before using protected APIs. |
| `409`  | `ApiError`                 | A built-in-engine action conflicts with the item's current stage or state.   |
| `500`  | `ApiError`                 | The built-in downloader rejected or failed the action.                       |

Request body:

```ts
type DownloadQueueActionInput =
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

| Action        | Effect                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `pauseQueue`  | Pauses queue activity.                                                                                 |
| `resumeQueue` | Resumes queue activity.                                                                                |
| `pause`       | Pauses one queue item.                                                                                 |
| `resume`      | Resumes one queue item.                                                                                |
| `remove`      | Cancels one item and removes its built-in-engine working/completed files after the action is verified. |
| `move`        | Moves one queue item up or down by one position.                                                       |
| `moveToIndex` | Moves one queue item to a zero-based queue position.                                                   |

Example request:

```bash
curl -b cookies.txt \
  -X POST http://localhost:42021/api/downloads/queue \
  -H "Content-Type: application/json" \
  -d '{"type":"move","itemId":"engine-download-id","direction":"up"}'
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
    "code": "queue_action_conflict",
    "message": "That download is no longer in the queue."
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
