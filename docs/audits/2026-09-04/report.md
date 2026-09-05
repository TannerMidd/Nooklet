# Nooklet codebase and product experience audit

Date: September 4, 2026

Reviewed revision: `bdbe90b` — clean working tree at the start of the audit

Purpose: prepare a deep improvement pass, with reproducible defects separated from design opportunities and unverified risks.

This is the original point-in-time audit. Source links are pinned to the reviewed revision; finding disposition and final validation appear in the [improvement ledger](improvement-pass.md). Publication preparation updated links only, preserving the original observations.

## Assessment

Nooklet has a strong foundation: clear domain boundaries, extensive automated checks, explicit download state transitions, server-side session revocation, encrypted credential storage, and a consistent visual system. All 1,660 application tests passed, and the production build succeeded. A broad rewrite would discard useful work.

The next pass should first improve the trustworthiness of state and recovery. The most consequential findings concern restart recovery around completed download artifacts, credentials accidentally placed in shared connection URLs, non-Latin title identity, and inconsistent success/failure reporting. Search and episode views also disagree with their own error, availability, and filtering states. The report identifies 21 prioritized findings, seven UX opportunities, and explicit follow-up decisions; several findings are related failure modes that should be repaired together.

The interface is visually coherent on desktop and generally adapts well to mobile. Its larger weaknesses are task guidance, repeated or ambiguous operational messages, inconsistent recovery actions, and a dense episode table that breaks down on narrow screens. Preserve the warm palette, restrained navigation, reusable controls, and existing modal focus behavior while improving these interactions.

## Scope, method, and limits

The repository contains 578 non-test TypeScript/TSX files, 263 application test files, 28 page components, three route handlers, and 18 domain modules. Review was divided into authentication/security, downloading/storage/jobs, integration workflows, frontend behavior, and a parent-led browser audit. This is a broad sampled audit, not a claim that every line or external integration was exercised.

The live app used Next.js **16.3.0**, matching the installed lockfile, with React **19.2.8**, Node **24.18.0**, and npm **11.16.0** on Windows. It ran at loopback against a new database under `.codex-tmp/audit-2026-09-04`. The background worker was deliberately not started. Download and YouTube work directories were redirected into that disposable audit area.

Browser coverage included bootstrap rendering, ordinary sign-in, Home, Setup Center, Connections, Discover, failed title search, Library, YouTube search entry, Activity, Settings, Storage, Health, and synthetic TV title details. Desktop captures use the existing browser viewport or 1440×900; mobile checks use 390×844. A narrower initial Library capture is identified separately in the evidence index.

Two clearly labeled synthetic titles and three synthetic episodes were added to the audit database. No real media was downloaded, imported, deleted, or requested. No production credentials or existing library records were modified. Application source files were not changed.

Evidence labels used below:

- **Runtime confirmed:** observed in this audit's browser or isolated execution, with source inspection supporting the cause.
- **Source confirmed:** a concrete path is established in code, but the relevant full external workflow was not run.
- **Opportunity:** a design recommendation rather than a demonstrated functional defect.
- **Needs validation/decision:** a material question that should not yet be presented as a proven bug.

Not covered end to end: live TMDB/TVDB/AI/Plex/Tautulli/Trakt responses; real Newznab/NNTP acquisition; yt-dlp downloads; NAS disconnects; large populated production libraries; Linux container execution; real assistive technology; browser/device diversity; load testing. Missing worker/tools/services in audit screenshots are expected environment conditions, not evidence that those integrations are broken.

## Verification baseline

| Check                                            | Observed result                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `npm test -- --maxWorkers=4`                     | 263 files, 1,660 tests passed; 77.92 seconds                                                      |
| `npm run typecheck`                              | Passed                                                                                            |
| `npm run lint`                                   | Passed                                                                                            |
| `npm run test:scripts`                           | Six Vitest script tests and two Node-native tests passed                                          |
| `npm run migrations:check`                       | Passed for 48 migration entries                                                                   |
| `npm run boundaries:check`                       | Passed                                                                                            |
| `npm run docs:dossier:check`                     | Engineering dossier and Docker setup generator checks passed                                      |
| `npm run docs:wiki:check`                        | Passed for 32 Markdown files                                                                      |
| `npm run docs:links:check`                       | Passed for 49 files and 238 current-main source links                                             |
| `npm run format:check`                           | Baseline passed before this report was added                                                      |
| `npm audit --omit=dev --audit-level=high --json` | Registry reported zero production dependency vulnerabilities at audit time                        |
| `npm run build`                                  | Next production build, worker bundle, and standalone sanitization passed                          |
| Browser checks                                   | Core pages rendered; sign-in and navigation worked; mobile drawer Escape dismissal restored focus |

The existing Playwright suite was inspected but not run during this audit. Its single first-run/authentication scenario includes serious/critical axe checks on bootstrap, login, and Home. The browser work above is a separate manual automation pass, not a passing result for that suite. The observed Health console error was the expected missing local yt-dlp executable; no broad claim of an error-free browser session is made.

## Prioritized findings

P1 means address before broader redesign or release expansion. P2 means include in the next improvement pass. P3 means polish or a lower-impact completeness issue. Priority reflects impact and trigger conditions, not a claim about how often a problem occurs in production.

| ID  | Priority | Finding                                                                        | Evidence                                                                        |
| --- | -------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| B01 | P1       | Restart recovery can discard finalized but uncommitted download output         | Runtime confirmed in a disposable recovery fixture                              |
| B02 | P2       | Secrets embedded in connection/indexer URLs bypass secret-field protection     | Source confirmed; requires an administrator to save a credential-bearing URL    |
| B03 | P2       | Failed monitoring saves are reported as successful                             | Runtime confirmed with a controlled database failure                            |
| B04 | P2       | Search errors are also rendered as “No title matches found”                    | Runtime confirmed                                                               |
| B05 | P2       | “Missing only” includes unaired episodes                                       | Runtime confirmed                                                               |
| B06 | P2       | Mobile episode columns overlap and title content collapses                     | Runtime confirmed at 390px                                                      |
| B07 | P2       | Episode-fetch errors remain cached without an in-place retry                   | Source confirmed                                                                |
| B08 | P3       | Ordinary login defaults to TV picks instead of the Home overview               | Runtime confirmed; destination choice is a product decision                     |
| B09 | P2       | Some async scan/save results lack an announcement mechanism                    | Source confirmed; screen-reader impact requires assistive-technology validation |
| B10 | P2       | Invalid custom-select state is not exposed on its closed trigger               | Source confirmed                                                                |
| B11 | P3       | Redirect verification errors can expose raw upstream URLs                      | Source confirmed; sensitive content depends on the upstream redirect            |
| B12 | P2       | Readiness counts verified Torznab indexers that search cannot use              | Source confirmed; legacy/existing Torznab configuration                         |
| B13 | P2       | Distinct non-Latin watch-history titles collapse to the same identity          | Runtime confirmed in the actual normalization/parser functions                  |
| B14 | P2       | Watch-history overview can display an older run or claim a source never synced | Source confirmed                                                                |
| B15 | P2       | Post-completion audit failures can change successful runs to failed            | Source confirmed; recommendation and watch-history workflows                    |
| B16 | P2       | Recommendation run creation can leave pending runs without executable jobs     | Source confirmed; persistence failure between independent writes                |
| B17 | P2       | Indexer result persistence can strand a running search with partial results    | Source confirmed; failure during sequential result writes                       |
| B18 | P2       | YouTube monitor bootstrap failures bypass source error recording               | Source confirmed; later recurring sync may recover if a job exists              |
| B19 | P2       | YouTube bulk queueing can partially commit while returning one generic error   | Source confirmed                                                                |
| B20 | P2       | YouTube video listing loads all rows and performs per-video queries            | Source confirmed; production performance impact not benchmarked                 |
| B21 | P2       | One thrown TMDB rail request can discard the whole Discover overview           | Source confirmed; structured HTTP failures already degrade more gracefully      |

### B01 — Recover finalized output before treating it as an orphan

**Trigger:** the worker stops after filesystem finalization succeeds but before the database records `completed` and `outputPath`.

The runner calls `finalizeDownload` and only afterward records the completed state. Startup recovery first turns interrupted `fetching`/`repairing`/`extracting` rows into `paused`. The subsequent artifact sweep retains completed directories for completed rows or queued/paused rows with a non-null output path. In the crash window, the row is paused with a null output path, so the finalized directory becomes eligible for recursive removal.

Source: [finalization and completion write](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/download-engine/runtime/engine-runner.ts#L506), [recovery before sweep](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/download-engine/runtime/engine-runner.ts#L652), [completed-artifact ownership predicate](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/download-engine/runtime/engine-runner.ts#L748), [interrupted state downgrade](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/download-engine/queue/engine-repository.ts#L756).

**Observed:** invoking the actual startup recovery against a fresh database with an `extracting` row, null output path, and a synthetic file in its completed-artifact directory changed the row to `paused` and deleted that directory (`removedComplete: 1`). The NZB payload remained. This confirms the cleanup behavior for the persisted crash-window state; it is not a live process-kill or real download test. See the saved fixture and output in the verification notes.

**Impact:** a completed staging artifact is discarded and the user must fetch the release again. This is not evidence of deletion of an already imported final library file. A repeat fetch can also fail if the upstream post is no longer available. Current recovery deliberately restarts interrupted transfers from the beginning; preserving fully finalized output needs an explicit recovery contract beyond that behavior.

**Recommendation:** persist a durable finalization marker/manifest and reconcile it before cleanup. Validate ownership and completeness before promotion or import; do not blindly import any directory found under `complete`. Keep uncertain output quarantined long enough to inspect or recover it.

**Acceptance:** a fixture with a persisted extracting row, null output path, and valid finalized output survives restart and becomes recoverable/importable. Also test invalid output, cancellation, already imported rows, missing rows, and crashes before/after the finalization marker. Cleanup must still reclaim genuinely orphaned artifacts.

### B02 — Reject or safely separate credentials in URLs

The dedicated API-key field is encrypted and masked. The adjacent Base URL field accepts URL userinfo and arbitrary query strings, and can be saved without a connectivity test. Raw URLs are stored and projected into shared connection summaries; the service save workflow also includes the raw URL in its audit payload. Regular authenticated users can receive the shared summaries. The same pattern exists for shared indexer Base URLs.

**Example trigger:** an administrator pastes a provider URL containing `https://user:password@example.test/` or a query credential such as `?apikey=...`, then saves it. The secret is now in a normal configuration/display field rather than the encrypted secret field. This is a conditional disclosure path, not a finding that correctly entered API keys are exposed.

Source: [connection URL schemas](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/service-connections/schemas/service-connection.ts#L22), [raw URL persistence and audit](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/service-connections/workflows/save-service-connection.ts#L48), [summary projection](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/service-connections/workflows/list-connection-summaries.ts#L70), [authenticated Connections page](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/settings/connections/page.tsx#L53), [indexer input schema](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/indexers/schemas/indexer-input.ts#L3), [indexer settings projection](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/indexers/queries/list-indexer-settings.ts#L70).

**Recommendation:** validate URLs at the save boundary, rejecting userinfo and credential-bearing query keys or moving explicitly supported credentials into encrypted storage. Redact defensive display/log/audit projections. Preserve legitimate non-secret query options, including documented Usenet connection options, instead of rejecting all query strings. Review already stored URLs and audit entries through a safe migration/recovery plan.

**Acceptance:** service and indexer actions reject credential-bearing URLs, including “Save without testing”; normal non-secret path/query configurations still work; an ordinary-user projection and recorded audit payload contain no test credential marker.

### B03 — Only report monitoring success after a successful result

`toggleSeasonMonitoring` awaits the action but ignores its return state and always writes a success message. The bulk episode path also ignores individual return states, updates the local cache for every selected episode, clears the selection, and reports that all rows succeeded.

Source: [bulk episode monitoring](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/library/tv-episode-table.tsx#L175), [season monitoring](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/library/tv-episode-table.tsx#L221), [server action error states](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/library/actions.ts#L728).

**Reproduction:** a synthetic season was successfully unmonitored. A temporary database trigger then rejected only updates to that synthetic season. Clicking “Monitor season” produced “Season 1 monitored.” The database still held `monitored = 0`, and the button still said “Monitor season.” The trigger was removed after the check. A normal successful toggle did update correctly; the defect is the failed-result path.

![The UI reports success while the unchanged button still offers to monitor the season](screenshots/18-monitoring-false-success.jpg)

**Impact:** users believe automation preferences were saved when they were not. Bulk operations can also conceal partial failure and discard the user's selection.

**Recommendation:** inspect every action result. Commit local state only for confirmed successes; retain failed selections and show a success/failure count with a retry action. Consider one bounded bulk command with explicit per-item results to avoid sequential request overhead.

**Acceptance:** returned validation/auth/database errors never produce success copy. Mixed-result batches correctly identify failed episodes. Successful saves retain the existing revalidation behavior. This needs a behavioral component/integration test, not just a mocked “action was called” assertion.

### B04 — Separate failed search from a successful empty result

With no verified TMDB connection, searching for “Arrival” shows a setup error and “No title matches found.” The latter falsely implies a completed catalog search. The error names Settings → Connections but supplies no direct link, although Discover already provides a “Configure metadata” action for the same prerequisite.

Source: [error result construction](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/search/page.tsx#L54), [unconditional empty-results rendering](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/search/title-search-form.tsx#L358).

![A configuration error and an empty-result claim appear together](screenshots/08-search-failure.jpg)

**Recommendation:** model not-started, blocked, loading, failed, empty, and populated results separately. Give an administrator a direct configuration action; give a regular user an appropriate explanation. Retain the query so retry is easy.

**Acceptance:** missing configuration and remote failures render one honest error state; only a successful zero-result response renders “No title matches found.” Query/type survive recovery.

### B05 — Apply the same definition of “missing” to filters and counts

The episode view correctly distinguishes missing episodes from unaired episodes in its count and quality label. Its “Missing only” filter uses only absence of a file, so unaired episodes remain visible.

Source: [file-only predicate](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/library/tv-episode-table.tsx#L40), [filter and separate aired counts](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/library/tv-episode-table.tsx#L159).

**Reproduction:** two synthetic episodes aired in 2024; a third was dated January 3, 2030. The header reported “2 missing · 1 unaired,” but enabling “Missing only” continued to display all three, including “Unaired.”

**Recommendation:** share the aired-and-file-missing predicate between filtering, counts, empty states, and bulk selection. Decide explicitly how unknown air dates should behave.

**Acceptance:** future episodes disappear from “Missing only”; aired episodes without files remain; unknown dates follow one documented rule. Use a fixed test clock and include timezone/date-boundary cases.

### B06 — Redesign the narrow episode table, including its scroll behavior

At 390px, the fixed tracks, gaps, and padding consume the available width before the flexible Title column receives useful space. The title header paints into Quality; row titles truncate almost entirely. The rows scroll horizontally, while the header is outside that scrolling region. The observed row viewport was 346px with 420px of scrollable content.

Source: [grid tracks](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/library/tv-episode-table.tsx#L26), [header outside rows' scroll area](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/library/tv-episode-table.tsx#L333), [truncated title](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/library/tv-episode-table.tsx#L421).

![Mobile episode view: overlapping headings, collapsed titles, and an unaired episode under Missing only](screenshots/21-unaired-in-missing.jpg)

**Recommendation:** prefer mobile rows/cards with episode code, readable title, status, and an explicit action menu. If retaining a table, give it a meaningful minimum width and a shared header/body horizontal scroll container. Reduce the secondary information visible at once.

**Acceptance:** verify 320, 390, 768, and 1440px, long titles, bulk selection, keyboard access, and zoom. Every displayed header remains distinct, aligns with its column after scrolling, and the episode title remains discoverable.

### B07 — Let the user retry transient episode-loading errors

The per-season cache stores an error entry after a failed episode fetch. The effect returns as soon as a cache entry exists, including an error entry. Rendering supplies error text but no retry action. Switching away and back within the mounted table does not resolve that cached error.

Source: [fetch/cache behavior](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/library/tv-episode-table.tsx#L106), [effect skips cached errors](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/library/tv-episode-table.tsx#L135), [error-only rendering](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/library/tv-episode-table.tsx#L357).

**Recommendation:** expose an in-place retry for the affected season, with bounded automatic recovery if appropriate. Retain cached successful seasons. Review the separate TV request picker for the same pattern.

**Acceptance:** simulate one failed load followed by success; the user can recover without reloading the page or closing the dialog. Repeated failures remain bounded and understandable.

### B08 — Establish one deliberate post-login destination

Ordinary sign-in without a callback lands on `/tv`. That page emphasizes an optional AI feature and, in a new installation, a disabled “Find picks” action and “No saved configuration.” `/home` already contains setup progress and next actions. The sidebar highlights Discover for `/tv`, which can be a valid hierarchy, but no local hierarchy is shown on the TV page.

Source: [default callback](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28auth%29/login/safe-callback-url.ts#L1), [navigation grouping](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/config/navigation.ts#L31).

**Recommendation:** make `/home` the default, or explicitly define a preference-based landing rule. Preserve safe, intended callbacks. Show a breadcrumb or local navigation when arriving directly in a grouped subflow.

**Acceptance:** ordinary login, callback login, first bootstrap, and reauthentication each land at an intentional destination with consistent navigation context. The first-login screen below is ordinary sign-in to a seeded test account, not proof of the bootstrap redirect behavior.

![Ordinary sign-in lands on TV recommendations in an unconfigured installation](screenshots/02-first-login-tv.jpg)

### B09 — Reuse accessible async status feedback consistently

Some scan and title-preference results appear in plain paragraphs with no status/alert role or focus movement. The repository already has `InlineAlert`, which maps errors to `role="alert"` and other results to `role="status"`, but these paths bypass it.

Source: [scan status](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/library/library-scan-button.tsx#L14), [title-preference result](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/library/media-title-preferences-form.tsx#L77), [existing accessible alert](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/components/ui/inline-alert.tsx#L19).

**Impact:** assistive-technology users may not receive useful notice that work completed or failed. Source inspection establishes the missing mechanism; this audit did not perform a screen-reader session.

**Recommendation:** use one shared result component with deliberate announcement priority and persistent recovery actions. Keep visual and announced copy identical. Avoid announcing frequent passive polling updates unnecessarily.

**Acceptance:** keyboard and screen-reader checks confirm that scan/save success and error are announced once, without moving focus unexpectedly; automated tests assert meaningful status behavior.

### B10 — Expose invalid state on the control the user actually focuses

`SearchableSelect` receives an invalid-state prop, but its closed trigger maps this only to `data-invalid`. The `aria-invalid` attribute appears on the transient popup search input instead. The visible trigger can therefore be marked invalid for styling without exposing the same state to assistive technology. Several recommendation and preferences error paragraphs also lack stable IDs and explicit error descriptions on their controls.

Source: [closed custom-select trigger](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/components/ui/searchable-select.tsx#L171), [popup-only invalid state](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/components/ui/searchable-select.tsx#L210), [recommendation field errors](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/components/recommendations/recommendation-request-form.tsx#L352), [preference validation markup](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/settings/preferences/preferences-form.tsx#L83).

**Recommendation:** put the appropriate invalid state on the focusable selection control and associate each error with a stable ID. Reuse the same form-field contract across custom and native controls, preserving help text as well as errors.

**Acceptance:** an invalid closed model selector exposes its invalid state and associated error. Keyboard/screen-reader users can locate and understand each invalid field without opening a popup or visually searching the page.

### B11 — Do not persist raw redirect targets as shared status messages

The safe-fetch layer correctly rejects redirects, but includes the full `Location` header in its error. The generic service verifier returns arbitrary `Error.message`; verification persists that message and shared connection summaries expose it. If an upstream redirects to a URL containing a credential or sensitive internal path, that data can become shared UI status.

Source: [raw redirect error](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/lib/security/safe-fetch.ts#L539), [verifier error forwarding](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/service-connections/adapters/verify-service-connection.ts#L43), [status persistence](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/service-connections/workflows/verify-configured-service-connection.ts#L64).

**Recommendation:** use a typed, generic user-facing error such as “The service redirected; verify its base URL.” Keep only sanitized diagnostics, with role-appropriate access. Address this alongside B02 so URL redaction is consistent.

**Acceptance:** a mocked redirect with a synthetic credential marker does not place that marker into the result, stored status, or ordinary-user summary. Redirects remain blocked.

## Integration and data consistency findings

The following findings extend the browser-visible issues into integration and persistence behavior. Except for B13's pure-function reproduction, they are source-confirmed paths rather than observed real-service failures. Their acceptance cases should become focused fault-injection tests during implementation.

### B12 — Readiness must count only usable indexer protocols

Readiness accepts any enabled, verified indexer with the required category. Release search selects only Newznab indexers, and the queue protocol guard rejects non-Newznab results. A verified Torznab-only configuration can therefore appear ready for its first request despite having no searchable source.

The settings UI already warns that Torznab is unsupported; this limits the issue's scope. Existing or legacy Torznab rows can nevertheless be tested and verified. The readiness evaluator must uphold the same restriction even when configuration predates the current UI.

Source: [readiness indexer predicate](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/readiness/evaluate-readiness.ts#L91), [Newznab-only selection](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/indexers/workflows/search-indexers/indexer-selection.ts#L17), [queue protocol guard](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/downloads/workflows/queue-indexer-result/protocol-guard.ts#L4), [existing Torznab verification](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/indexers/workflows/test-and-save-indexer.ts#L64), [UI warning](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/settings/indexers/indexer-settings-form.tsx#L218).

**Recommendation and acceptance:** share a supported-capability predicate between setup, readiness, search, and queueing. A Torznab-only fixture must remain blocked; a verified supported source with matching category must pass. Do not imply torrent download support unless it exists end to end.

### B13 — Preserve non-Latin title identity

Watch-history normalization removes everything outside ASCII letters and digits. Distinct titles written entirely in Japanese, Chinese, Arabic, Hindi, or another non-Latin script can normalize to an empty string. When their media type and year match, or both years are unknown, their keys collide and deduplication silently drops all but one.

**Observed:** invoking the actual parser with `千と千尋の神隠し` and `天空の城ラピュタ`, both without a year, produced `movie::::unknown` for both and returned only the first entry. Ordinary distinct Latin titles do not collide merely because their years are unknown.

Source: [normalization and key construction](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/watch-history/normalization.ts#L11), [manual deduplication](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/watch-history/normalization.ts#L60), [provider item deduplication](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/watch-history/workflows/watch-history-sync-helpers.ts#L13). Saved output is linked in the verification notes.

**Impact:** incomplete imported history and incorrect matching/exclusions for affected titles. The immediate loss is from an import's normalized representation, not deletion of the remote provider's history.

**Recommendation:** define Unicode-aware title normalization and a nonempty stable identity fallback, preferring provider IDs where available. Plan compatibility for existing persisted keys; changing the function alone can break matching against old keys.

**Acceptance:** distinct non-Latin titles with equal or unknown years remain distinct; repeated copies of the same title still deduplicate. Include mixed scripts, accents, punctuation, and existing-key migration/reimport behavior.

### B14 — Select the actual latest watch-history run per source

The overview fetches eight runs across the entire user, ordered newest first, then constructs a `Map` keyed by source ID. Later entries overwrite earlier entries, so multiple runs from one source leave the oldest run in the fetched batch as its supposed latest run. Separately, eight newer runs from other sources can evict a source entirely, causing “No watch-history sync has been run yet” despite existing history.

Source: [global limit and map construction](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/watch-history/queries/get-watch-history-overview.ts#L13), [descending run query](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/watch-history/repositories/watch-history-repository.ts#L208).

**Impact:** users can see obsolete success/failure status, counts, and timestamps, or a false never-synced state. This can conceal a recent failure or encourage an unnecessary repeat sync.

**Recommendation and acceptance:** query the newest run for each source with deterministic tie-breaking; keep any separate recent-activity limit independent. Test alternating successful/failed runs for one source and more than eight newer runs from another. Every source must retain its true latest state.

### B15 — Keep a committed successful run successful when audit recording fails

Recommendation generation commits items and marks its run completed before writing follow-up metrics/audit data. A later exception enters a catch that marks the same run failed. Watch-history workflows similarly replace items and complete a sync before writing a success audit; failure in that audit enters the failure transition.

Source: [recommendation completion and follow-up effects](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/recommendations/workflows/create-recommendation-run.ts#L317), [recommendation failure transition](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/recommendations/workflows/create-recommendation-run.ts#L99), [Plex completion/audit/catch](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/watch-history/workflows/sync-plex-watch-history.ts#L100), [Tautulli equivalent](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/watch-history/workflows/sync-tautulli-watch-history.ts#L102), [Trakt equivalent](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/watch-history/workflows/sync-trakt-watch-history.ts#L103), [manual equivalent](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/watch-history/workflows/sync-manual-watch-history.ts#L72).

**Trigger:** a post-completion metrics/audit write throws while a later failure-state write succeeds. A persistent database outage may prevent both writes; the specific defect is the successful-to-failed transition when the latter write is possible.

**Impact:** useful data exists while status says the operation failed, and users or workers may repeat work. Recommendation failure handling can also overwrite the previously recorded generated-item count with zero. This is a state-consistency issue, not evidence that completed imported data is rolled back.

**Recommendation:** define the durable success boundary, guard terminal transitions, and deliver follow-up audit/notification work through a recoverable mechanism. If audit recording must be atomic for policy reasons, transact it with the success state rather than retroactively changing a committed result.

**Acceptance:** inject audit/metrics failure after completion. Persisted data, generated-item counts, and successful terminal state remain consistent, and audit delivery is separately visible/retryable. Failures before completion must still produce a genuine failed run.

### B16 — Couple recommendation runs to their execution records

Queued recommendation creation inserts a pending run, then writes an audit, then creates the executable job. These writes are independent. If audit or job creation fails after the run insert, the call rejects but the pending run has no guaranteed execution record or terminal failure. Synchronous creation likewise inserts a run before its initial audit and execution.

Source: [queued creation ordering](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/recommendations/workflows/create-recommendation-run.ts#L423), [synchronous creation ordering](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/recommendations/workflows/create-recommendation-run.ts#L400).

**Recommendation and acceptance:** atomically create the run and required job, or record a compensating terminal state and expose a retry that preserves identity. Inject failure at each write boundary. A request must leave either a runnable job or an honest terminal result, never an unexplained pending run.

### B17 — Finish or roll back search-result persistence on failure

Indexer persistence creates a `running` search run, inserts results one at a time, and only then sets its final status. An exception encrypting or inserting a later result skips completion while leaving the run and earlier rows persisted. The caller does not finalize this failure. The 24-hour result expiry does not itself make the run terminal.

Source: [sequential result persistence](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/indexers/workflows/search-indexers/persistence.ts#L23), [workflow caller](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/indexers/workflows/search-indexers/index.ts#L12).

**Recommendation and acceptance:** choose explicit all-or-none persistence or an honest failed/partial terminal state. Inject a failure on the second result and assert both run status and result visibility. A search must not remain `running` after its synchronous execution has exited.

### B18 — Record YouTube monitor bootstrap failures on the source

Creating a monitor persists an `initializing` source before bootstrapping its shared recurring job. The bootstrap call occurs outside the error-recording `try` block. If that call fails, the action returns an error but leaves an initializing source without the corresponding recorded cause; on a first monitor, the recurring job may also be absent.

Source: [creation and unguarded bootstrap](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/youtube/workflows/source-sync.ts#L86), [job bootstrap](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/youtube/workflows/automation.ts#L27), [scheduler includes initializing sources](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/youtube/repositories/youtube-repository.ts#L224).

**Limit:** initializing sources are eligible for later recurring sync, so an existing healthy job can recover them. It is inaccurate to call every affected source permanently stuck.

**Recommendation and acceptance:** include setup in the guarded lifecycle or make creation/job setup atomic. Inject bootstrap failure with and without an existing job. The source must expose a useful error/retry state or be rolled back; it must not silently imply ongoing initialization.

### B19 — Report partial YouTube bulk queue outcomes accurately

The bulk queue function awaits an independent transaction for each selected video. A failure midway leaves earlier videos queued, but the action returns one generic error and skips the normal view revalidation. The result does not tell the user which selections succeeded.

Source: [sequential batch](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/youtube/public.ts#L251), [per-video transaction and destination check](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/youtube/repositories/youtube-repository.ts#L441), [single action result](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/library/youtube/actions.ts#L198).

**Recommendation and acceptance:** choose an atomic batch or explicit per-video outcomes, refreshing the committed portion even after a partial failure. Inject a second-item destination/write failure in a three-item request. The UI must accurately describe each item and offer retry only where appropriate. Existing duplicate protection is useful; do not assume a retry necessarily creates duplicate downloads.

### B20 — Bound YouTube library reads before large libraries accumulate

`listYouTubeVideos` loads every video for the user. It then runs a latest-download query for each returned video; with a source filter it first performs a membership query for every video in the user's entire collection. Filtering is thus partly in application memory and the response has no page limit.

The Videos page amplifies this by loading the base collection and then calling the same function once per monitored source to reconstruct memberships. Query work therefore grows with both the video count and the source count, even when the intended output is one consolidated list.

Source: [unbounded list and per-video queries](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/youtube/repositories/youtube-repository.ts#L621), [public wrapper](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/youtube/public.ts#L215), [page's per-source repeats](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/library/youtube/page.tsx#L159).

**Impact:** query count, synchronous SQLite work, response size, and rendering cost grow with collection size. This is a concrete scaling hazard; this audit did not measure a production latency threshold or observe an outage.

**Recommendation and acceptance:** paginate/filter in SQL and fetch latest download state through a join/windowed query or bounded batch. With increasing total library size, a fixed-size page should retain bounded query count and payload size. Benchmark realistic channel histories before selecting defaults.

### B21 — Isolate thrown Discover rail failures

The overview already tolerates a rail returning `{ ok: false }`, but awaits all rails with `Promise.all` and no per-rail exception boundary. TMDB transport/retry exhaustion and JSON parsing can throw. One such rejection prevents the overview from returning the other successful rails and propagates into the Discover page render.

Source: [rail aggregation](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/discover/queries/get-discover-overview.ts#L82), [throwing transport/JSON boundary](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/service-connections/adapters/tmdb.ts#L223), [page aggregation](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/app/%28workspace%29/discover/page.tsx#L133).

**Recommendation and acceptance:** convert per-rail exceptions into bounded diagnostics while retaining successful content. Inject one timeout and one malformed JSON result among successful rails. The successful rails should render with an honest partial-failure/retry message; if every rail fails, show a recoverable page-level error.

## UX/UI review in flow order

### 1. Enter, sign in, and orient

Bootstrap is visually focused, uses explicit labels and password guidance, and has one clear primary action. The ordinary login screen is similarly restrained. Keep this simplicity. The larger issue is what follows sign-in: B08 sends the user to a specialized optional feature instead of the overview.

Home's setup banner and action cards give the best starting point. Its information hierarchy is useful, but “Needs attention” means both capability configuration problems and failed activity in different sections. A new user can see several capabilities needing attention while the activity summary reports zero. Those counts have different meanings; label them “Setup blockers” and “Requests needing attention,” or otherwise make the distinction explicit.

![Home provides a strong starting point; two library titles shown here are synthetic audit records](screenshots/03-home.jpg)

### 2. Set up the capabilities the user actually wants

Setup Center correctly separates optional personalization/history from required download infrastructure and derives progress from configuration. It also repeats shared dependencies across Movie downloads and TV downloads, with large cards that push later tasks below the fold. “Connect a downloader” leads to the general Connections page, whose top section is TMDB, even when the user needs the Usenet section.

**Opportunity U01:** offer a capability choice such as movies, TV, and YouTube archiving, then show one ordered checklist with shared prerequisites deduplicated. Each action should deep-link to the precise form and return to the checklist with progress retained. Keep an overview for experienced administrators. YouTube's independent prerequisites deserve an explicit setup path so a YouTube-only user is not left interpreting Movie/TV readiness as their completion target.

![Setup is clear but repeats shared Movie/TV prerequisites](screenshots/04-setup.jpg)

### 3. Configure services and storage

Connections groups services by purpose and marks required versus optional integrations, which is useful. The long page nevertheless requires substantial scanning. Form expansion keeps context but can leave the close action below the viewport. Test/save, save without testing, retest, and disconnect should have consistent placement and visibly distinct availability.

**Opportunity U02:** deep-link setup actions to a specific expanded connection; summarize configured services compactly; progressively disclose advanced URL/model options and lengthy optional YouTube cookie instructions. Explain “saved” versus “verified” next to the action result.

Storage usefully distinguishes temporary staging from final destinations. In the deliberately workerless audit, it says “Checking,” “Workspace capacity is unavailable,” and “Awaiting the first background check.” The “Checking” label implies active progress when there may be no worker capable of completing it.

**Opportunity U03:** show “Waiting for worker” or “No reading yet” when no probe is running, connect that state to worker health, and offer a direct diagnostic action. Surface the effective path, usable space, and blocking reason first; place mount internals and capacity calculation detail behind a disclosure. Preserve the cached-probe architecture.

![Storage exposes useful detail but its waiting state can imply progress that is not occurring](screenshots/14-storage.jpg)

### 4. Discover and request

Discover has useful local navigation, a direct Search titles action, and a good configuration empty state. Search's simpler focused form is appropriate, but B04 makes its failure path less honest and less recoverable. Readiness is enforced and explained differently across Discover, Search, recommendation forms, and title-detail search controls.

**Opportunity U04:** adopt one prerequisite presentation across request entry points. Keep users' intent visible, explain what is missing, and direct the right role to the next action. For requests, show a concise review of title, movie/season/episode scope, quality, destination, and whether the action only adds a catalog entry or also downloads it. Put the distinction in the action labels and result, so a paragraph of instruction is not the only safeguard.

Live remote search results, title matching, request review, and successful queueing remain follow-up coverage requirements; no positive claim about those complete journeys is made here.

### 5. Browse and manage the library

The Library overview separates catalog browsing from storage administration and has a useful storage empty state. The movie/TV list views provide filters, sorting, and list/grid choice. Synthetic long-title testing showed adequate desktop wrapping and a readable dialog heading.

The episode detail screen needs the focused work in B03, B05, B06, and B07 before visual polish. Its missing/unaired distinction is helpful but is not consistently applied. Search icons can remain secondary on desktop, but mobile needs readable title content and a more obvious action affordance.

**Opportunity U05:** distinguish catalog-only/requested titles, downloaded files, future episodes, unmonitored episodes, and failed requests in shared status vocabulary. Ensure summary counts, filters, bulk selection, and recovery actions use the same definitions. Avoid using “Missing” as a universal substitute for “No file.”

### 6. Monitor activity and recover

Activity's Active / Needs attention / Completed grouping is appropriate. Its empty queue repeats the same missing-Usenet instruction in both description and alert, while “Run import now” remains visually prominent in a fresh environment. On mobile, operational copy and controls occupy much of the initial screen before a request would become visible.

**Opportunity U06:** show one prerequisite banner; make primary actions reflect current usable capability; distinguish an idle queue, unavailable provider, stale data, and failed request. In populated views, prioritize title, current stage, progress, last change, and the recovery action. Keep technical diagnostics available without making them the first explanation.

![Mobile Activity repeats the missing-provider instruction before request content](screenshots/12-activity-mobile.jpg)

### 7. Navigate and use assistive technology

Confirmed strengths include a skip link, named navigation regions, visible focus treatment, roughly 44px primary controls, modal background isolation, and mobile Escape dismissal that restores focus to the navigation trigger. The mobile Activity page had no document-level horizontal overflow at 390px. These are useful foundations, not a full accessibility certification.

**Opportunity U07:** standardize actual tabs with tablist/tab/tabpanel semantics where appropriate. The detail tabs currently use pressed buttons through `DialogPill`; the accessibility view exposes their pressed state, but does not communicate a tab relationship. Preserve valid toggle-button semantics for genuine toggles. Validate keyboard selection, focus order, focus restoration, form errors, announcements, zoom, and actual screen-reader output across populated and failed states.

![The mobile navigation drawer has a focused close action and restores focus after Escape](screenshots/11-mobile-navigation.jpg)

## Engineering improvement strategy

### Preserve what works

Keep the domain module boundaries and their validator; separate web and worker processes; explicit state transitions; cancellation fences and import recovery protections; database/session checks; encrypted secret fields; path containment and outbound-request defenses; and the existing visual tokens/components. The passing baseline is a useful safety net.

### Refactor along behavioral boundaries

Several modules concentrate a great deal of stateful logic: season fulfillment, download persistence, media-library persistence, YouTube persistence, library server actions, TMDB integration, and finalization. File length alone is not a defect. Split these only when a change needs clearer ownership, a smaller state transition, or a testable boundary. Avoid a mechanical folder reshuffle ahead of fixing observed behavior.

Useful targets are a shared action-result contract, common readiness/precondition presentation, a single episode-availability model, and a durable finalization/recovery protocol. Keep authentication, filesystem authorization, remote URL validation, and transactional persistence boundaries explicit during any extraction.

### Improve the test distribution

The test count is substantial, but the observed failures sit between individually tested actions and rendered UI, or between filesystem state and persisted state after interruption. Add tests that cross those boundaries:

| Area                    | High-value coverage                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| Mutation feedback       | Success, returned error, thrown failure, partial bulk success, session expiry                     |
| Search                  | Missing prerequisite, network failure, genuine zero results, retry with query preserved           |
| Episodes                | Aired/unaired/unknown dates, missing filter, cache error retry, mobile layout                     |
| Download lifecycle      | Kill/restart at each finalization/persistence boundary; recovery before cleanup                   |
| Shared configuration    | Credential-bearing URL rejection and ordinary-user projection checks                              |
| Integration lifecycle   | Post-completion audit failure; run/job creation failure; partial search and YouTube batch writes  |
| History identity/status | Non-Latin keys, old-key compatibility, newest run per source, quiet-source retention              |
| YouTube scale           | Bounded page payload and query count as both videos and sources increase                          |
| Browser journeys        | Setup → search → request → activity → imported library detail with deterministic providers        |
| Accessibility           | Representative settings, populated dialogs/tables, async results, keyboard and screen-reader pass |

Use deterministic provider fixtures and bounded local files for the expanded journey suite. Keep a smaller separately configured real-service smoke suite for integration drift. Do not make every UI test depend on paid credentials or an active Usenet subscription.

### Measure before optimizing

No production latency or capacity benchmark was run. Development compilation timing and a two-title fixture cannot establish scalability. Before a performance pass, measure page/query timings and serialized payloads at representative library sizes, concurrent users, slow storage, and active downloads. Track worker heartbeat freshness, queue age, recovery duration, and import outcomes separately from web responsiveness.

## Proposed improvement sequence

| Phase                                        | Scope                                                                                                       | Exit condition                                                                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Data, state, and recovery                | B01, B02, B03, B11, B13, B15–B19; focused regression fixtures                                               | Finalized output survives recoverable crashes; URL secrets stay protected; title identities remain distinct; persistence and visible status agree |
| 2 — Search, history, and episode correctness | B04, B05, B07, B12, B14, B21                                                                                | Honest error/empty states, consistent episode availability, usable readiness, recoverable partial failures, correct sync status                   |
| 3 — Mobile and accessibility                 | B06, B08–B10, U07; shared navigation and result components                                                  | Narrow tables/dialogs usable; login destination deliberate; validation and results accessible                                                     |
| 4 — Setup and operational clarity            | U01–U06                                                                                                     | Capability-specific setup, precise deep links, deduplicated blockers, truthful idle/waiting states                                                |
| 5 — Scale and broader evidence               | B20; deterministic browser journeys, assistive technology, real-service/container smoke, workload profiling | Bounded YouTube list work and a repeatable release gate beyond unit tests                                                                         |

Implement small coherent changes with focused regression tests, then run the existing full checks at integration points. Avoid combining a state-machine repair, credential migration, and visual redesign into one difficult-to-review patch.

## Decisions and validation still needed

- **Shared history identity:** Plex/Tautulli connections expose selectable remote profiles. Decide whether every Nooklet user is intentionally allowed to import any available profile, or whether an administrator should map/allowlist remote identities per account. User-scoped storage alone does not answer that policy question.
- **Worker stall policy:** supervisors intentionally avoid killing stalled work solely on heartbeat loss. Preserve the reasoning around slow repair/extraction and blocked filesystems, but define recovery for a truly wedged idle worker and validate it in a controlled container test.
- **Catalog ownership model:** make the difference between shared infrastructure, user-scoped requests/taste, and final shared media explicit in UI and documentation.
- **Default landing:** choose Home, setup-aware Home, or an explicit user preference; keep it consistent with safe callbacks and first-run behavior.
- **Unknown episode air dates:** define whether these belong in Missing, Upcoming/Unknown, or a separate filter, and apply the decision across search/automation/UI.
- **Catalog-added versus download outcome:** recommendation add flows can persist a catalog entry but leave `existingInLibrary` false for partial/failed queue outcomes. Future generation already excludes prior recommendation items, so this is not a confirmed repeat-recommendation bug. Decide whether the history badge, “hide existing” filter, and add form should follow `catalogAdded` independently of download success. Trace: [add outcome handling](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/recommendations/workflows/add-recommendation-to-library.ts#L94), [prior-item exclusion](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/recommendations/repositories/recommendation-repository.ts#L361).
- **Cancellation after file organization:** validate the ordinary movie/episode import window between moving files and acquiring the persistence lease. A concurrent cancel may cause persistence to reject after destination files have moved. The review identified a possible untracked-file outcome, but did not execute this race or rule out every compensating path. Inject a pause after organization, cancel, then assert destination files and request state reconcile. Trace: [organization before persistence](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/downloads/workflows/import-completed-engine-downloads.ts#L238), [file organization](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/downloads/workflows/import-completed-downloads/file-organization.ts#L467), [persistence validation](https://github.com/TannerMidd/Nooklet/blob/bdbe90bbdcd739cc72113bbedc0e8c5da307b2ca/src/modules/downloads/workflows/import-completed-downloads/persistence-validation.ts#L149). Keep this as a validation candidate until reproduced.

## Evidence notes

Screenshots were captured during this audit and inspected. Some initial full-page captures contained browser stitching artifacts; those were rejected and replaced with ordinary viewport captures. The visible Next.js badge is a development tool, not Nooklet product UI. Placeholder artwork and the two title names marked “audit fixture” come from synthetic metadata and should not be interpreted as broken production artwork.

The audit-specific reproduction notes and command results are in [verification.md](verification.md). The complete screenshot index is in [screenshots.md](screenshots.md).
