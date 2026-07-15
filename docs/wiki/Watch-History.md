# Watch history

Watch history is optional, user-scoped context for recommendations. It does not control whether movies or TV can be requested.

## Supported sources

| Source | Use |
| --- | --- |
| Manual | Maintain context without an external history service. |
| Plex | Import watched activity from a Plex server. |
| Tautulli | Import history exposed by Tautulli. |
| Trakt | Import history using the configured Trakt token. |

Each user owns their history sources and sync status. Shared instance connections do not automatically select an external profile for every user.

## Add and verify a source

1. Configure and test the relevant service under **Settings → Connections**.
2. Open the watch-history settings for the signed-in user.
3. Add the source and choose the external identity when the connector requires one.
4. Run a sync.
5. Confirm the most recent sync succeeded and inspect imported titles.

Scheduled `watch-history-sync` jobs run through the persisted background worker. A failed sync is recorded without making the main request path unavailable.

## Docker networking

`localhost` inside Nooklet means the Nooklet container, not the Docker host. On Docker Desktop, a host service is commonly reachable as `host.docker.internal`. Private service addresses also require the exact hostname or IP in `PRIVATE_SERVICE_HOST_ALLOWLIST`. See [Reverse proxy and LAN access](Reverse-Proxy-and-LAN-Access).

## Common failures

| Symptom | Check |
| --- | --- |
| Connection test fails | Base URL, credentials, Docker reachability, TLS, and private-host allowlist. |
| External users cannot be listed | The token may lack permission, or the configured endpoint may not be the expected service. |
| Sync job fails repeatedly | Inspect job details and logs; test the connection again before rescheduling. |
| Recommendations ignore recent activity | Confirm the latest sync succeeded for the current user and regenerate the recommendation run. |

## Source references

- [Watch-history module](https://github.com/TannerMidd/Nooklet/tree/main/src/modules/watch-history)
- [Plex integration](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/integrations/plex.ts)
- [Tautulli integration](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/integrations/tautulli.ts)
- [Trakt integration](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/integrations/trakt.ts)

---

Last reviewed: **July 15, 2026**.
