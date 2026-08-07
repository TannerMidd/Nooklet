# First-time setup

Setup Center evaluates the live request path. It does not mark setup complete merely because values were saved: required services must verify, library paths must be reachable, readable, and writable, capacity must be available, and the background worker must be healthy.

## 1. Create the first administrator

Before the first start, set an independent `BOOTSTRAP_TOKEN` in the runtime environment. Open Nooklet and enter:

- the exact one-time bootstrap token;
- a display name between 2 and 80 characters;
- a valid email address;
- a password between 12 and 128 characters containing uppercase, lowercase, and numeric characters.

The operation is transactional and only succeeds while no administrator exists. Successful bootstrap creates the administrator, records an audit event, and closes the first-admin path.

Afterward, remove `BOOTSTRAP_TOKEN` from `.env` and apply the environment change:

```bash
# Docker
docker compose up -d --force-recreate
```

For a native installation, restart the Node.js process.

## 2. Open Setup Center

After sign-in, open **Setup Center**. It presents the current state of:

- Discover metadata;
- movie and TV download paths;
- staging and library storage;
- the background worker;
- optional recommendations, watch history, and notifications.

Configuration saves are reflected automatically. Return to Setup Center after each major step to verify the complete path.

## 3. Verify TMDB

Go to **Settings -> Connections -> TMDB**.

1. Keep the default base URL unless TMDB documents a change.
2. Enter a TMDB API key or read token.
3. Select **Test & save**.
4. Confirm the status is **Verified**.

TMDB is required for reliable identity, browsing, artwork, genres, trailers, and discovery. TVDB is an optional additional TV metadata source; it does not replace the core TMDB readiness check.

## 4. Configure the built-in downloader

Configure **Usenet server** under **Settings -> Connections**:

1. Enter the news server hostname and port supplied by the provider.
2. Use the provider's TLS port (usually 563); connections are always encrypted.
3. Choose between 1 and 20 connections within the provider's account limit.
4. Enter the provider username and password when the server requires authentication; leave both blank only for an anonymous server.
5. Select **Test & save** and confirm **Verified**.

The built-in engine also requires a writable staging workspace with usable capacity. Confirm it under **Settings -> Storage**. See [Storage and path mapping](Storage-and-Path-Mapping).

## 5. Add a Newznab indexer

Go to **Settings -> Indexers** and add a provider:

1. Select a preset or **Other Newznab provider**.
2. Verify the HTTPS host and API path against the provider account page.
3. Enter the API key.
4. Select at least **Movies** or **TV series**.
5. Leave the indexer enabled.
6. Select **Test & add** and confirm it is **Verified**.

Nooklet's downloader supports Newznab. Torznab is not supported. Detailed ordering and category behavior is documented in [Indexers](Indexers).

## 6. Attach final library destinations

Go to **Settings -> Storage**.

1. Confirm the expected approved media roots appear.
2. Attach an existing movie and/or TV folder using its runtime-visible path.
3. Confirm the folder is reachable, readable, and writable.
4. Set a default destination for each media type you plan to request.

For Docker, enter the container path, not the host path. For example, a host binding of `D:/Media/Movies:/media/movies` is configured in Nooklet as `/media/movies`.

## 7. Confirm worker health

Open **Health & readiness**. The background worker must be responsive and not degraded. It performs scheduled work, advances downloads, and imports completed media.

For an external check:

```bash
curl http://localhost:42021/api/health
```

## Readiness rules

A media type is ready only when all conditions in its column pass:

| Check | Movies | TV |
| --- | --- | --- |
| TMDB verified | Required for setup completion | Required for setup completion |
| Downloader verified | Usenet server | Usenet server |
| Enabled, verified indexer | Must include a movie category | Must include a TV category |
| Final destination | Reachable, readable, and writable movie folder | Reachable, readable, and writable TV folder |
| Built-in staging | Reachable, writable, and positive usable capacity | Same |
| Background worker | Responsive and non-degraded | Responsive and non-degraded |

Setup is complete when TMDB and the worker are healthy and at least one complete movie or TV request path is ready. You can finish the other media type later.

## 8. Make a controlled first request

1. Open **Search** or **Discover**.
2. Choose a small, unambiguous title.
3. For TV, select the intended seasons or episodes.
4. Confirm the destination shown in the request flow.
5. Submit the request and open **Activity**.
6. Watch the item move through search, queue, download, processing, and import.
7. Confirm the final file appears in the intended library folder.

If Nooklet reports insufficient disk space while the media drive has space, inspect both engine locations in **Settings -> Storage**. The built-in engine checks `DOWNLOAD_ENGINE_WORK_DIR` and `DOWNLOAD_ENGINE_DIR`, and the more constrained filesystem limits admission; neither is the final movie or TV destination.

## Optional finishing steps

- Connect an AI provider for personalized recommendations.
- Import watch history from Plex, Tautulli, Trakt, or a manual list.
- Add Discord, Apprise, or webhook notifications.
- Add users and review shared-instance permissions.
- Configure a reverse proxy only after authentication and backups are in place.
- Create and test an off-host backup using [Backup, restore, and upgrades](Backup-Restore-and-Upgrades).

## Implementation references

- [Bootstrap input policy](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/identity-access/schemas/bootstrap.ts)
- [Transactional first-admin creation](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/identity-access/workflows/create-first-admin.ts)
- [Setup Center component](https://github.com/TannerMidd/Nooklet/blob/main/src/components/setup/setup-center.tsx)
- [Readiness rules](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/readiness/evaluate-readiness.ts)
