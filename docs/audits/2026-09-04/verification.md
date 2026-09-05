# Audit verification and reproduction notes

Date: September 4, 2026. Baseline: `bdbe90b`.

## Scope discipline

Application source was reviewed without fixes. The browser server used a new SQLite database at `.codex-tmp/audit-2026-09-04/nooklet.db`. Build verification used a separate `build.db` in the same audit area. Download, engine-work, and YouTube paths were redirected into that area. No background download worker was started.

The audit account and title/episode records are synthetic. No saved user credentials, real media files, paid service connections, download requests, or existing account preferences were modified. Synthetic mutations were used only to verify the UI's response to success and failure.

## Baseline command results

```text
npm test -- --maxWorkers=4
Test Files  263 passed (263)
Tests       1660 passed (1660)
Duration    77.92s
Exit        0
```

```text
npm run typecheck                 Passed
npm run lint                      Passed
npm run migrations:check          Passed, 48 entries
npm run boundaries:check          Passed
npm run test:scripts              Passed, 6 Vitest + 2 Node tests
npm run docs:dossier:check        Passed, dossier + setup command generator
npm run docs:wiki:check           Passed, 32 Markdown files
npm run docs:links:check          Passed, 49 files / 238 current-main links
npm run format:check             Baseline passed before audit Markdown was added
```

```text
npm audit --omit=dev --audit-level=high --json
info: 0; low: 0; moderate: 0; high: 0; critical: 0; total: 0
Exit 0
```

```text
npm run build
Next.js 16.3.0 (Turbopack)
Compiled successfully in 5.2s
TypeScript finished in 8.0s
Static page generation succeeded
Worker bundle: 2.8 MB; source map: 5.4 MB
Standalone artifact sanitized and verified (1 path removed)
Exit 0
```

These are this run's results, not a historical CI result. A passing dependency audit is limited to the registry advisory data available at that time. Development/build timings are not production performance measurements.

After the report was added, its three Markdown files and saved JSON evidence were formatted with the repository's Prettier. The documentation link check passed again for 52 files and 238 current-main links. A separate local evidence check resolved all 113 file/image links across the audit documents and verified that cited source line numbers are in range. All 22 saved screenshots were visually inspected. Git status contained only the new `docs/audits/` artifacts; application source remained unchanged. The temporary development server was stopped after the browser pass.

## Browser observations

The Codex in-app browser was used throughout. Current screenshots and accessibility snapshots grounded the audit; old README screenshots were not used as evidence. Full-page screenshots showing stitching artifacts were rejected and replaced with standard viewport captures.

1. Fresh database `/` redirected to `/bootstrap` and rendered the first-administrator form.
2. After seeding an audit administrator, ordinary `/login` successfully signed in and landed at `/tv`.
3. Home, Setup Center, Connections, Discover, Search, Library, YouTube, Activity, Settings, Storage, Health, and the seeded TV details rendered.
4. At 390×844, mobile navigation opened with focus on its close control; Escape closed it and restored focus to “Open navigation.”
5. Mobile Activity measured `innerWidth = 390`, `documentElement.scrollWidth = 390`, with no main-content element extending past the viewport in that check.
6. The mobile episode rows measured a 346px viewport and 420px horizontal scroll width. Header text overlapped while row titles collapsed. The page itself remained 390px wide; the problem was within the table/dialog, not page-level overflow.
7. Health reported missing local yt-dlp and an unavailable worker, consistent with the intentionally incomplete audit runtime. Its console error reflected that environment. These conditions were not counted as product defects.

The existing Playwright first-run/auth smoke test and axe helper were inspected but not executed here. The in-app browser pass is not a replacement claim for that automated suite or a complete accessibility evaluation.

## B01: recovery removes finalized output with no persisted output path

The actual `recoverInterruptedEngineDownloads` implementation was bundled using the repository's worker-build configuration, with the entry point replaced by a small audit harness. It ran once against a fresh SQLite database and output/work directories under `.codex-tmp/audit-2026-09-04/recovery-proof`. The harness asserts these paths are inside that disposable directory and that the database does not already exist.

The fixture contains one synthetic user, one `extracting` download with no control intent or output path, and a text file under `complete/<download-id>/`. No worker, NNTP request, real media file, or final library directory was involved. The observed output was:

```text
{"phase":"before","state":"extracting","outputPath":null,"artifactExists":true}
[download_engine_artifact_sweep_completed] { removedIncomplete: 0, removedComplete: 1 }
{"phase":"after","state":"paused","outputPath":null,"artifactExists":false,"payloadRetained":true}
```

This establishes how real startup recovery treats the persisted crash-window state. It does not independently simulate a process dying during a real finalization operation or validate the contents of a finished media file.

Saved evidence: [fixture source](evidence/recovery-fixture.ts.txt), [execution output](evidence/recovery-output.txt).

## B03: failed monitoring save still reports success

Synthetic fixture:

```text
user: audit-admin
title: 11111111-1111-4111-8111-111111111111
season: 33333333-3333-4333-8333-333333333333
```

Steps:

1. Open the synthetic TV title from Library and select Episodes.
2. Successfully unmonitor Season 1; verify the button becomes “Monitor season.”
3. Add the following temporary trigger to the disposable audit database only:

```sql
CREATE TRIGGER audit_reject_monitor
BEFORE UPDATE ON tv_seasons
WHEN OLD.id = '33333333-3333-4333-8333-333333333333'
BEGIN
    SELECT RAISE(ABORT, 'Synthetic audit failure');
END;
```

4. Click “Monitor season.”
5. Observe UI text “Season 1 monitored.” while the button still says “Monitor season.”
6. Read back the synthetic season:

```json
{
    "afterFailedMonitor": [
        {
            "id": "33333333-3333-4333-8333-333333333333",
            "monitored": 0
        }
    ]
}
```

7. Remove the temporary trigger with `DROP TRIGGER audit_reject_monitor`.

The database failure was injected deliberately to exercise the action's returned-error path. The report does not claim spontaneous database failure was observed. A normal successful toggle was also checked and behaved correctly.

Evidence: [false-success screenshot](screenshots/18-monitoring-false-success.jpg).

## B04: failed title search is presented as empty results

With no TMDB connection, enter “Arrival” in Search with Movies selected. The page navigates to `/search?type=movie&q=Arrival`. It shows both:

```text
Verify a TMDB connection in Settings -> Connections before searching titles.
No title matches found.
```

The first is the actual blocked condition. No successful metadata search occurred, so the second is misleading. The query remained in the form.

Evidence: [search failure](screenshots/08-search-failure.jpg).

## B05/B06: availability filter and mobile episode layout

Synthetic Season 1 contained three episodes, none with a file. The first two air dates were in January 2024; the third was January 3, 2030.

After loading Episodes, the UI reported `3 episodes · 0 available · 2 missing · 1 unaired`. Enabling “Missing only” kept S01E03 visible and labeled “Unaired.” At 390px the Title header painted into Quality and episode names were truncated into a collapsed column.

Evidence: [filter and layout screenshot](screenshots/21-unaired-in-missing.jpg).

## B13: distinct non-Latin watch-history titles are deduplicated

The actual `normalization.ts` module was transpiled with the installed TypeScript compiler and its exported functions invoked directly. This pure-function check required no database or network. An initial direct Node TypeScript import could not resolve the repository alias, so that invocation was discarded; the transpiled invocation completed successfully.

Input: `千と千尋の神隠し` and `天空の城ラピュタ`, both movies with unknown years. Both generated the key `movie::::unknown`. `parseManualWatchHistoryEntries` returned only the first title. This verifies the parser/key collision; provider sync and recommendation effects were traced in source rather than exercised remotely.

Saved evidence: [input, keys, and parser result](evidence/unicode-output.json).

## Source-only findings

Credential-bearing URL propagation, redirect status propagation, sticky episode-fetch errors, missing async status roles, custom-select invalid-state handling, and the integration findings B12/B14–B21 were traced through the actual source. They were not tested against real accounts or upstream services. Their report entries identify the trigger conditions and proposed regression checks. In particular, the additional persistence-failure and scale cases are source findings, not claims that each fault was injected or each performance impact benchmarked during this audit.

## Follow-up verification boundaries

The next implementation pass should run the existing E2E and container smoke suites, add deterministic populated/failure UI journeys, and verify real download/import/restart flows in a disposable environment with explicit test service configuration. It should separately validate accessibility with actual assistive technology and performance with representative data volumes.
