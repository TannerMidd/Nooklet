# YouTube monitoring and downloads

Nooklet can archive public YouTube videos into an operator-approved library. Users can search for a channel or video, paste a supported YouTube video, playlist, or channel URL, download selected videos, and monitor a channel's regular **Videos** feed or a public playlist for future additions.

> [!IMPORTANT]
> Download or archive a video only when you have permission to do so. Nooklet does not bypass DRM, authentication, account restrictions, or access controls. You are responsible for complying with the content owner's terms and applicable law.

## Supported scope

Version one supports:

- public regular videos;
- channel `/videos` feeds and public playlists;
- individual video downloads;
- `mp4-720p`, `mp4-1080p`, `mp4-2160p`, and `best` quality profiles; and
- per-user monitors and download history stored in Nooklet.

It supports an optional shared, administrator-managed YouTube cookie session when YouTube blocks the server's guest traffic. It does not support Google OAuth, private or age-gated media, a Shorts library, live recordings, subtitles, comments, audio-only downloads, SponsorBlock, or importing files that were downloaded outside Nooklet. Active, upcoming, and completed live content is skipped. Playlist items are excluded as Shorts only when yt-dlp positively identifies them; Nooklet does not guess from duration.

Text search is best-effort because it depends on YouTube behavior exposed through yt-dlp. Pasting a supported URL is the reliable fallback.

YouTube is an optional, independent library path. It does not require TMDB, Newznab, or Usenet. In Docker, bind the host archive folder to `/media/youtube` and use that as the final destination; completed-download staging is Usenet-only, while `/app/data/youtube` is temporary YouTube work storage.

## Prerequisites

1. An administrator attaches at least one writable YouTube destination in **Settings → Storage**. In Docker, `/media/youtube` is the recommended final target when its host folder is bind-mounted there. The path must remain within `APPROVED_MEDIA_ROOTS`; do not select `/app/data/youtube` as a final library.
2. The background worker is responsive.
3. yt-dlp, Python, Node.js, and ffmpeg are available to the worker. The production Docker image includes them; native installations must provide them.
4. `YOUTUBE_WORK_DIR` is writable and has enough space for incomplete transfers and merging.

The official yt-dlp Unix zipimport distribution bundles its matching EJS challenge scripts. Nooklet runs those scripts with the existing Node 24 runtime and does not enable yt-dlp remote component downloads. See the official [yt-dlp EJS runtime guide](https://github.com/yt-dlp/yt-dlp/wiki/EJS).

## Download one video

1. Open **Library → YouTube → Search**.
2. Search by text or paste a supported video URL.
3. Select the video.
4. Choose a YouTube destination and quality profile.
5. Confirm the download.

An individual video download does not create a monitor. Its progress, cancellation, retry, failure, and completed import appear in **Activity** beside other Nooklet work.

## Monitor a channel or playlist

1. Search for a channel or paste a supported channel or playlist URL.
2. Choose the channel's regular **Videos** feed or one of its public playlists.
3. Select any existing videos you want to download now.
4. Choose the destination and quality profile.
5. Enable future monitoring and save.

Monitor creation first saves an **Initializing** source and performs a complete flat baseline enumeration. Only the existing videos you selected are queued during that baseline. The source becomes **Active** only after the baseline succeeds, so an old channel or playlist backlog is never mistaken for new uploads.

After initialization, each successful sync atomically records current membership and queues newly discovered eligible videos once. A partial or failed enumeration never marks older members removed. A later complete enumeration may record a missing member as remotely removed, but remote removal and source removal never delete an imported file.

The shared schedule defaults to every six hours. Administrators can set it between 15 minutes and one week or choose **Run now** in **Settings → Automation**. Users can also choose **Sync now** for their own source.

## Source controls

The **Monitored Sources** view supports:

- **Pause** or **Resume** future syncing;
- editing the destination or quality used by future downloads;
- **Sync now**;
- retrying a failed initialization; and
- removing the monitor without deleting downloaded files.

Changing a source's destination or quality affects future queue entries. A durable download already identified by user, video, destination, and profile retains its original target.

## Transfer and import behavior

Nooklet runs one YouTube transfer at a time. It may coexist with the built-in Usenet engine, and both contribute to storage capacity checks. Incomplete work lives under:

Completed-download staging at `/downloads/nooklet-engine` is Usenet-only and separate from YouTube final storage.

```text
<YOUTUBE_WORK_DIR>/incomplete/<download-id>
```

Valid `.part` files are retained for restart resume. A completed file is safely published beneath the selected root as:

```text
<root>/<channel>/<playlist>/<date> - <title> [<video-id>].<ext>
```

Playlist downloads use the public playlist title. Channel-feed and individual-video downloads use a `Videos` collection. Names use Windows-compatible sanitization. Nooklet revalidates the final path beneath the selected destination and rejects traversal or symlink escape before publish.

Plex's default grid for an **Other Videos** library is flat even when the files are nested. Select Plex's **Folders** view to browse the on-disk channel → playlist → videos hierarchy.

The first completed profile keeps the canonical filename. If the same user later downloads the
same video to the same root with another quality profile and the bytes differ, Nooklet preserves
both files by adding a deterministic `[quality-profile]` suffix to the later import. It never
silently treats a different-quality file as the requested artifact or overwrites it.

The MP4 profiles prefer mergeable MP4 video and audio at or below the selected height without CPU-heavy transcoding. `best` accepts the extractor's best mergeable formats. ffmpeg is used where separate streams need merging.

Transient network and rate-limit failures retry after approximately 15 minutes, 1 hour, 6 hours, and 24 hours before becoming terminal. Private, removed, live, or positively identified Short content fails without repeated retries. Cancellation intent and manual retry are durable across worker restarts.

## Privacy and YouTube API policy

Nooklet does not request a YouTube API key or create a Google service connection. Discovery and extraction use the server-only yt-dlp adapter. This is intentional: the official [YouTube API Developer Policies](https://developers.google.com/youtube/terms/developer-policies) prohibit API clients from downloading or storing audiovisual content without prior written approval.

Nooklet accepts only recognized YouTube video, playlist, and channel URL forms. It invokes yt-dlp and ffmpeg with argument arrays, enforces bounded output and deadlines, and redacts sensitive URL or tool-error context before presenting it where appropriate.

### Authenticated extraction when guest access is challenged

YouTube may reject all anonymous requests from a server IP with **Sign in to confirm you're not a bot**. The bundled proof-of-origin provider cannot clear a login requirement by itself. An administrator can open **Settings → Connections → YouTube access** and upload a YouTube-only Netscape `cookies.txt` export.

Use a dedicated, low-value YouTube account. In one private/incognito window, sign in to YouTube, open `https://www.youtube.com/robots.txt` in the same tab, export only `youtube.com` cookies, and close the private window without reopening that session. This follows the official [yt-dlp YouTube cookie guidance](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies). YouTube rotates cookies used by open browser tabs, so an ordinary active browser-session export is less durable. yt-dlp also warns that automated account use can cause temporary or permanent account restrictions.

Nooklet validates the file structure and domain scope, proves the session with a live metadata probe, then encrypts it with the existing AES-256-GCM secret box in SQLite. Each yt-dlp process receives a separate mode-`0600` temporary cookie file; Docker keeps it on `/tmp` tmpfs, while a native install uses the operating system temporary directory. Nooklet removes that lease on success, failure, timeout, or cancellation. Raw cookies are never returned by settings queries or written to application logs. Replacing a session is atomic: a failed probe leaves the previously verified credential unchanged.

Google OAuth is not offered because [yt-dlp documents that YouTube OAuth login no longer works](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#logging-in-with-oauth). Nooklet never asks for a Google password and never reads a host browser profile.

## Diagnose a failure

| Symptom                                                                | Check                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search fails but a known URL works                                     | Text search is best-effort. Continue with the supported URL and inspect authenticated health diagnostics for repeated adapter failures.                                                                                                                                               |
| Source remains **Initializing**                                        | Use **Retry initialization** after checking yt-dlp readiness, outbound connectivity, and the source's public visibility. The old backlog will not auto-queue.                                                                                                                         |
| New upload was not queued                                              | Confirm the source is **Active**, not paused, and that the item is a regular public non-live video. Run a complete sync and inspect its result.                                                                                                                                       |
| Transfer repeatedly retries                                            | Inspect **Activity** for the safe error and next attempt. Rate limits and network errors use the bounded retry schedule.                                                                                                                                                              |
| Transfer cannot merge formats                                          | Verify `FFMPEG_PATH` and run `ffmpeg -version` as the service account.                                                                                                                                                                                                                |
| YouTube readiness is blocked                                           | Verify `YT_DLP_PATH`, `FFMPEG_PATH`, Python, and Node. Missing YouTube tools block only YouTube capability, not movie/TV readiness.                                                                                                                                                   |
| Health is degraded during an active transfer                           | Check the authenticated runner heartbeat and progress. An actively stalled transfer degrades health; an idle YouTube capability blocker does not make the whole app unavailable.                                                                                                      |
| Import reports an unsafe path                                          | Confirm the destination is an active YouTube path beneath `APPROVED_MEDIA_ROOTS` and that no path component was replaced by a symlink.                                                                                                                                                |
| Several public videos fail together with a temporary YouTube challenge | YouTube has challenged the server's guest session. Configure and verify **Settings → Connections → YouTube access**, then use **Run all now** in Activity. Without a verified session, Nooklet backs off the whole YouTube queue together instead of burning an attempt on every row. |

For Docker, these commands confirm the bundled toolchain without modifying the container:

```console
docker compose exec app yt-dlp --version
docker compose exec app node --version
docker compose exec app ffmpeg -version
```

The image is read-only compatible because `/app/data` is the persistent writable volume and the default `YOUTUBE_WORK_DIR` is `/app/data/youtube`. That path is temporary work storage only. Final YouTube files publish beneath the selected destination, typically `/media/youtube`; `/app/data/youtube` is never the final library.

Current YouTube playback enforcement can require a per-video proof-of-origin token for sustained
media requests even when public metadata and a short test chunk succeed. Docker Compose therefore
runs a pinned, source-checksum-verified BgUtils provider on its private network and bakes its
checksum-verified yt-dlp plugin into the Nooklet image. The provider includes the upstream
session-binding correction needed for YouTube's July 2026 WebPO rollout and has no published host
port. Native installations may set `YT_DLP_PLUGIN_DIR` and `YOUTUBE_POT_PROVIDER_URL` when the same
support is required.

The provider improves proof-of-origin handling but cannot guarantee bypassing every YouTube bot or
account challenge. When YouTube explicitly returns `LOGIN_REQUIRED`, a currently valid cookie
session is required. Nooklet surfaces that state instead of representing repeated guest retries as
an authentication solution.

## Implementation references

- [YouTube module](https://github.com/TannerMidd/Nooklet/tree/main/src/modules/youtube)
- [Runtime image](https://github.com/TannerMidd/Nooklet/blob/main/Dockerfile)
- [Environment validation](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/env.ts)
- [Product behavior matrix](https://github.com/TannerMidd/Nooklet/blob/main/docs/product/behavior-matrix.md)

---

Last reviewed: **August 19, 2026**.
