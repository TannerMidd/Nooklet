# Automation and notifications

Nooklet persists recurring work in SQLite and executes it through the in-process worker. Notifications are optional, user-scoped fan-out channels triggered by selected product events.

## Scheduled job types

| Job type | Purpose |
| --- | --- |
| `watch-history-sync` | Refresh external watch activity. |
| `recommendation-run` | Generate a recommendation batch. |
| `media-library-scan` | Reconcile a configured library destination. |
| `missing-content-search` | Search for monitored missing content. |
| `metadata-refresh` | Refresh stored title metadata. |

Schedules, last outcomes, and next runs survive an application restart. Use **Run now** for an intentional one-off execution; do not shorten every schedule to diagnose one failure.

## Notification channels

Supported channel types are generic webhook, Discord webhook, and Apprise. A channel can subscribe to one or more events:

- recommendation run succeeded or failed;
- library add failed;
- watch-history sync failed;
- download import succeeded;
- download failed;
- download import failed.

Test a channel before enabling it. Dispatch outcomes are audited per channel so a delivery failure does not silently masquerade as success.

> **Network boundary:** notification destinations reject private and loopback addresses even when `ALLOW_PRIVATE_SERVICE_HOSTS=true`. This stricter rule protects webhook delivery from becoming a path into the local network. A locally hosted Apprise endpoint is therefore not a supported target unless the application policy changes.

## Diagnose automation

1. Open the authenticated **Health** page and confirm the worker is responsive.
2. Inspect the job's last result and next-run time.
3. Run the job once manually.
4. Check `docker compose logs --tail=200 app` for the matching timestamp.
5. Fix the underlying connection, path, or credentials before retrying.

An HTTP 200 from `/api/health` can still contain `"status":"degraded"` when the worker is responsive but its last maintenance pass failed. Always inspect the JSON body.

## Source references

- [Worker implementation](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/jobs/worker.ts)
- [Jobs module](https://github.com/TannerMidd/Nooklet/tree/main/src/modules/jobs)
- [Notifications module](https://github.com/TannerMidd/Nooklet/tree/main/src/modules/notifications)
- [Job and notification schema](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/database/schema.ts)

---

Last reviewed: **July 15, 2026**.
