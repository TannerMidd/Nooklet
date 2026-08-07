# HTTP API

> Applies to the current `main` implementation. Last source review: 2026-08-06.

Nooklet is primarily an interactive web application. Most product operations use Next.js server actions, which are framework-private and are not a stable external API. Only routes implemented under `src/app/api` are documented here.

## Base URL

Use the deployed Nooklet origin:

| Environment            | Default                         |
| ---------------------- | ------------------------------- |
| Native development     | `http://localhost:42021`        |
| Shipped Docker Compose | `http://localhost:42021`        |
| Deployment             | The configured `APP_URL` origin |

## Authentication

Protected routes use the Auth.js session cookie created by local credentials login. Same-origin browser clients can use ordinary `fetch` after sign-in. An external client must implement the Auth.js CSRF/cookie flow and retain cookies across requests.

Sessions use encrypted JWT cookies plus a server-side SQLite validity record, with an absolute 24-hour maximum age. Each record is tied to the user's monotonic `auth_generation`. Login issuance must still match the generation captured during credential verification; disabling an account or writing a password advances the generation and revokes existing records. This prevents a pending login from becoming valid after a disable/re-enable or password-change race.

Later authenticated requests require the active session record, matching generation, and a live user. Nooklet's UI sign-out action revokes the current record before clearing the browser cookie, so a late authenticated response cannot restore access. Direct `POST /api/auth/signout` is intentionally unavailable; use the application's **Sign out** control. Accounts with an administrator-issued or recovery password receive `403 password_change_required` from protected APIs until they replace that password.

## Route summary

| Route                     | Methods       | Authentication  | Purpose                                                                               |
| ------------------------- | ------------- | --------------- | ------------------------------------------------------------------------------------- |
| `/api/health`             | `GET`         | None            | Database, worker, and built-in engine readiness                                       |
| `/api/auth/[...nextauth]` | `GET`, `POST` | Auth.js-managed | Login, CSRF, providers, and session protocol; direct protocol sign-out is unavailable |
| `/api/downloads/queue`    | `GET`, `POST` | Required        | Caller-scoped built-in queue read/control                                             |

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

This public readiness probe applies migrations/database compatibility checks, evaluates worker recency, and reads durable built-in-engine progress. It does not expose internal exception messages.

Response statuses:

| HTTP | Meaning                                                  |
| ---: | -------------------------------------------------------- |
|  200 | Worker is responsive. Body status is `ok` or `degraded`. |
|  503 | Worker is stopped/stale, or database readiness failed.   |

Example responsive body:

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

`checks.downloadEngine` is `idle`, `ok`, or `degraded`. A stalled/failed engine changes the overall status to `degraded` but remains HTTP 200 while the scheduler is responsive; this diagnostic never terminates legitimate repair or extraction work. Docker intentionally treats that as responsive. Use the authenticated `/health` page for technical details.

```bash
curl --fail-with-body http://localhost:42021/api/health
```

Source: [health route](https://github.com/TannerMidd/Nooklet/blob/main/src/app/api/health/route.ts) and [worker readiness](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/jobs/worker-readiness.ts).

## `/api/auth/[...nextauth]`

Auth.js owns this catch-all route. The application currently configures one credentials provider named `Local login`.

Common endpoints include:

| Route                            | Method | Purpose                                          |
| -------------------------------- | ------ | ------------------------------------------------ |
| `/api/auth/providers`            | `GET`  | List configured sign-in providers                |
| `/api/auth/csrf`                 | `GET`  | Obtain the CSRF token used by Auth.js form posts |
| `/api/auth/session`              | `GET`  | Read the current caller session                  |
| `/api/auth/callback/credentials` | `POST` | Submit local email/password credentials          |

Login is disabled while first-admin bootstrap is still open. The direct Auth.js `POST /api/auth/signout` action is intentionally unavailable because the supported logout path must revoke durable session state before clearing the cookie. Use Nooklet's **Sign out** control. Prefer the Nooklet `/login` UI rather than binding an external integration directly to this protocol.

Source: [Auth.js configuration](https://github.com/TannerMidd/Nooklet/blob/main/src/auth.ts).

## `GET /api/downloads/queue`

Returns the signed-in user's built-in queue snapshot used by badges, Activity, and title progress. Queue rows are filtered through the caller's download associations.

Status codes:

| HTTP | Meaning                                                     |
| ---: | ----------------------------------------------------------- |
|  200 | Queue state returned, including an empty/disconnected state |
|  401 | No authenticated user session                               |
|  403 | The account must replace its temporary password first       |
|  503 | One or more queue sources could not be read                 |

The response shape is:

```ts
type ActiveDownloadQueueState = {
    connectionStatus: "disconnected" | "configured" | "verified" | "error";
    statusMessage: string;
    snapshot: DownloadQueueSnapshot | null;
    // Present on POST responses.
    action?: {
        status: "applied" | "pending";
        message: string;
    };
};
```

```ts
const response = await fetch("/api/downloads/queue", {
    cache: "no-store",
});
if (!response.ok) throw new Error("Queue unavailable");
const state = await response.json();
```

## `POST /api/downloads/queue`

Applies an action to the built-in queue and returns its refreshed state.

```ts
type QueueAction =
    | { type: "pauseQueue" }
    | { type: "resumeQueue" }
    | { type: "pause"; itemId: string }
    | { type: "resume"; itemId: string }
    | { type: "remove"; itemId: string }
    | { type: "move"; itemId: string; direction: "up" | "down" }
    | { type: "moveToIndex"; itemId: string; targetIndex: number };
```

Status codes:

| HTTP | Code                       | Meaning                                                                         |
| ---: | -------------------------- | ------------------------------------------------------------------------------- |
|  200 | n/a                        | Action succeeded; refreshed queue returned                                      |
|  400 | `invalid_json`             | Body was not valid JSON                                                         |
|  400 | `invalid_action`           | Action fields failed validation                                                 |
|  401 | n/a                        | No authenticated user session                                                   |
|  403 | `password_change_required` | The account must replace its temporary password first                           |
|  409 | `queue_action_conflict`    | The item changed state or the requested action conflicts with its current stage |
|  500 | `queue_action_failed`      | The built-in queue operation failed                                             |

Example:

```bash
curl -b cookies.txt \
  -X POST http://localhost:42021/api/downloads/queue \
  -H "Content-Type: application/json" \
  -d '{"type":"pauseQueue"}'
```

Sources: [route handler](https://github.com/TannerMidd/Nooklet/blob/main/src/app/api/downloads/queue/route.ts), [contract](https://github.com/TannerMidd/Nooklet/blob/main/src/app/api/downloads/queue/contract.ts), and [queue model](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/download-engine/queue/download-queue.ts).

## Compatibility policy

- Server actions are not public API contracts.
- Auth.js routes follow Auth.js behavior, not a Nooklet-specific JSON contract.
- Application-owned API changes should update the route tests, this Wiki page, and the repository API reference in the same change.
- Add auth behavior, validation, status codes, request/response examples, cache behavior, and source links for every new route.

Related: [Downloads and Import](Downloads-and-Import) | [Security Model](Security-Model) | [Documentation Policy](Documentation-Policy)
