# Improvement verification

This records verification of the improvement pass against baseline `bdbe90b`. The original audit observations and evidence remain intact; publication preparation made documentation links portable and pinned original source references to the baseline. Final integration results are recorded in the [improvement ledger](improvement-pass.md).

## Isolation

The manual browser server used `http://127.0.0.1:42132` and a new SQLite database under `.codex-tmp/improvement-2026-09-04`. Download output, work, YouTube work, and approved library roots were redirected into that disposable directory. No background download worker or provider connection was started. The preview administrator, TV series, episodes, video records, and rejected credential values were synthetic. The original installation database, saved credentials, media, and provider accounts were not test targets.

The existing E2E runner used its own newly allocated port and disposable database, with media paths also redirected under the improvement fixture directory. Its process cleanup completed. The manual preview server stopped at the turn boundary; no listener remained on port 42132 when checked.

## Browser walkthrough

The Codex in-app browser was used for these checks. Screenshots were captured from the actual changed application. A missing worker and missing service configuration were intentional fixture conditions.

| Journey                         | Observed result                                                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bootstrap → Setup Center        | Created the fixture administrator and reached the capability checklist.                                                                                                                                                              |
| Setup → TMDB configuration      | The exact editor opened with a return link preserving the selected capability. Fixed-service addresses and YouTube session instructions are disclosed on demand.                                                                     |
| Search without TMDB             | “Arrival” remained in the form; a configuration error and recovery link appeared; “No title matches found” did not appear.                                                                                                           |
| Search → configuration → return | Returned to `/search?type=movie&q=Arrival` with the query and media type retained.                                                                                                                                                   |
| Credential URL validation       | Saving a draft URL with a synthetic `api_key` query parameter was rejected. The URL field received `aria-invalid=true` and the explicit embedded-credentials error. The service remained disconnected. No provider request was made. |
| Monitoring failure              | A temporary SQLite trigger rejected the synthetic season update. The UI announced “Nooklet could not update that season.” with an alert role and retained “Monitor season.” Reading the row confirmed `monitored=0`.                 |
| Monitoring retry                | After removing the trigger, the same action showed “Season 1 monitored.” and “Unmonitor season”; persisted `monitored=1`.                                                                                                            |
| Episode availability            | Two aired episodes, one future episode, and one unknown-date episode produced 2 missing / 1 unaired / 1 unknown. “Missing only” retained only the two aired episodes without files.                                                  |
| Mobile episode table            | At 390×844, titles and status labels remained readable. Document width was 390px; the inspected dialog had no child extending beyond the viewport.                                                                                   |
| Keyboard tabs                   | ArrowRight from Episodes selected Settings, moved focus to its tab, and associated the displayed panel with that tab via `aria-labelledby`.                                                                                          |
| YouTube-only setup              | Showed destination, worker, and tool checks without requiring metadata, Usenet, or an indexer. Untested tools were labeled “Not checked.”                                                                                            |
| Storage                         | Showed “Waiting for worker,” a worker-health link, and no claim that a probe was running. YouTube destination intent and setup return link survived navigation. Capacity calculation details were collapsed.                         |
| Ordinary login                  | A sign-out followed by login without an explicit callback landed on `/home`.                                                                                                                                                         |
| Empty Activity                  | The missing-Usenet instruction appeared once; no “Run import now” action appeared.                                                                                                                                                   |
| YouTube pagination              | 101 fixture videos rendered as pages of 50, 50, and 1. Counts and Previous/Next links matched; page 3 had no Next link.                                                                                                              |

The browser's captured error/warning log was empty at the final check. These observations are bounded to the exercised fixture routes, not a claim that every screen or live integration is error-free.

After the final navigation correction, a second isolated browser check followed storage → worker health → Back to your search. Both receiving pages retained `/search?type=movie&q=Arrival%20%26%20Contact`; the final form displayed `Arrival & Contact` with Movies selected. Login again landed on Home. The reused browser initially had a cookie encrypted with the earlier fixture secret, producing the expected invalid-session diagnostic until login; Health also reported the intentionally missing local `yt-dlp` executable. No hydration error or broken page was observed. The temporary tab and preview server were closed after this check.

The final mobile check injected an update failure for one synthetic episode. The original bulk bar measured about 438px in a 390px viewport and clipped Clear selection. After correction, both Retry monitor and Retry unmonitor fit inside a 322px bar at 390px and a 252px bar at 320px. At 320px, a separate season-header overflow was also corrected; the document remained 320px wide and the inspected dialog panel had no non-truncated content overflow. Failure feedback stayed visible beside the controls. After dropping the fixture trigger, Retry unmonitor succeeded, cleared the selection, and exposed a status announcement. A separate reviewer confirmed both retry layouts in Chromium against the final UI source.

The Library overview check exposed an unassigned-title counting discrepancy. After its correction, both the TV card and TV destination listed one synthetic series; Movies correctly showed zero. The fixture trigger was removed, the viewport restored, and the disposable tab/server closed. No listener remained on port 42132.

## Screenshots

- [Desktop capability checklist](improvement-screenshots/setup-desktop.jpg)
- [Recoverable search error](improvement-screenshots/search-error.jpg)
- [Mobile episodes and truthful failed save](improvement-screenshots/episodes-mobile.jpg)
- [Storage waiting for worker](improvement-screenshots/storage-waiting.jpg)
- [Last page of 101 YouTube videos](improvement-screenshots/youtube-pagination.jpg)

## Existing automated browser test

The final UI rerun of `npm run test:e2e` passed: **1 Chromium test, 6.4 seconds**. This exercised first-administrator bootstrap, login, sign-out, revoked-cookie rejection at API and page boundaries, and workspace access. Its axe checks found no serious/critical violations on bootstrap, login, and Home. It does not provide that accessibility claim for every changed screen.

## Real database finalization recovery

An additional parent-run fixture used the real finalizer, startup recovery, and SQLite repositories against a new database and disposable work/output directories. Three synthetic 8-byte media-shaped files represented finalized output already published, finalized output still in staging, and legacy output without a manifest. No provider or background worker ran.

Recovery persisted `completed` plus the output path for both manifested cases; their bytes remained intact and both were awaiting import. The markerless case became paused with no output path and its file was preserved in quarantine. The fixture exited successfully. This exercises the persisted crash-window state rather than forcibly killing a live process.

- [Fixture source](evidence/improvement-recovery-fixture.ts.txt)
- [Observed output](evidence/improvement-recovery-output.txt)

## Import journal and transaction proof

Additional disposable fixtures exercised the real import workflow, scanner, finalizer, and SQLite database. A second lease-renewal failure after publication retained library bytes, source bytes, and a durable journal with no import rows. A separate Node process then recovered and cancelled the engine item: the engine row/source were cleaned while the final library file and orphan journal remained. Scanning failed the claimed source; Health still reported retained output, and another user's health query did not reveal its paths.

A separate fixture generated and independently decoded a one-second, 32×32 MPEG-4 AVI using local FFmpeg. An exact filesystem shim forced unsupported hard links before creation, exercising the real exclusive streaming fallback. A successful import removed its claims and became a scan candidate. A real SQLite insertion trigger aborted another import after publication: committed import/file rows remained absent, while final media, source, claim, and journal were retained and scanning refused that source.

Before each successful source removal, a separate SQLite connection had to observe the matching successful attempt and imported file/request rows; the fixture also required that attempt's durable committed marker. An injected cleanup permission failure preserved database success. A fresh Node process replayed the terminal cleanup without duplicate rows, another transfer, or changed library bytes. The unrelated failed attempt remained retained.

These are real filesystem/database boundary checks with deterministic faults. They do not simulate a power failure, demonstrate automatic retry of every uncertain artifact, or establish safety against hostile concurrent changes to trusted roots. Existing regression tests separately cover target replacement, ancestor redirection, partial copy retention, post-link metadata failure, pre-existing private sentinels, and scanner claim races.

## Required file-sync retries

A nine-phase fixture ran each phase in a separate Node process against a new database and synthetic AVI. Its exact journal filesystem seam wrote real valid JSON, then injected an `EIO` from the required file sync. Three phases each exercised the initial failure, another process with the same continuing fault, and a process after clearing the fault.

All nine phases passed. An unsynced plan could not create a destination claim or publish media; successful resync reused the original attempt. An unsynced receipt blocked persistence readiness while preserving the destination identity, bytes, and claim hash; recovery needed no second transfer. An unsynced committed marker preserved database success while keeping the source and claim unconsumed. After successful marker sync, the full workflow cleaned the source and claim without duplicate rows or changed media bytes. Source removal was not mocked.

This proves required-sync retry behavior across process reloads. It does not assert hardware durability or simulate power loss. Both heartbeat overrides and all mutable roots are explicitly scoped to disposable fixture paths in the final runners.

## Recovery with accumulated history

A real-filesystem, real-SQLite fixture created **899 journals**: 620 committed attempts with cleanup complete, 270 early planned attempts, five deliberately malformed plans, two late published pending attempts, and two late committed attempts awaiting claim cleanup. The late attempts belonged to two separate synthetic users. All source media was generated locally and decoded before use; no provider or worker ran.

The final v5 execution passed every phase in a fresh disposable root with complete provenance from the initial seed. Download-specific reuse and source-consumption checks reached the late attempts despite unrelated malformed entries and the history volume. Recovery excluded the 620 completed entries, leaving 279 active entries. Two separate processes each inspected 256 entries, preserved the cursor across startup reconciliation, and together visited every original active entry. Both late cleanups completed, leaving 277 unresolved entries. All 899 sources and all published library files retained their bytes, five malformed plans retained their evidence, and the 622 correlated committed rows remained unchanged.

Health remained read-only, including every catalogue column and the recovery cursor. Each late user saw only their own valid unresolved paths plus opaque malformed diagnostics. Global output revealed no private paths and reported exact overflow counts: 23 before cleanup and 21 afterward.

An earlier v4 seed omitted synthetic engine/queue provenance, and normal startup correctly rejected its 277 active requests. A separately reviewed fixture-only correction inserted the missing engine and queue rows into that exact disposable database. It preserved existing table hashes, journal/media bytes, assertions, and original failure logs. The real startup guard had to fail before correction and pass afterward; it was never bypassed. The final v5 run used the corrected normal runner and required no repair.

This verifies fair bounded recovery work across orderly process restarts. Full startup discovery remains proportional to namespace size. It does not measure operating-system memory limits, simulate sudden termination or power loss, or establish a production workload benchmark.

## Catalogue repair during worker operation

Thirteen additional regressions exercised recovery after successful initialization, without restarting the process or explicitly forcing repair. Ordinary recovery and new journal creation each recovered from a missing catalogue, corrupt database bytes, preserved SQLite sidecars, a missing table, and incomplete discovery status. Tests used real temporary files and SQLite; they verified that existing plan, source, final-media, claim, and rejected catalogue bytes survived.

Concurrent ordinary and explicit callers shared one rebuild. A narrowly injected `EACCES` at exclusive creation of the replacement catalogue prevented new plans, claims, and publication. Clearing the fault allowed ordinary retry to repair the catalogue and publish. The final parent engine run passed all 372 tests, including these 13 cases. No extra application migration or public API change was needed.

## Remaining external verification boundaries

No real metadata search, paid provider request, NNTP transfer, live YouTube enumeration/download, or production media import was performed. Deterministic fault-injection tests cover the changed persistence boundaries. Full process-kill/container restart testing, representative workload benchmarks, and actual assistive-technology sessions remain separate release validation. Shared history-profile permissions and worker stall termination policy were not changed without a product decision.

## Retained acceptance evidence

The final source is pinned by SHA256 against baseline `bdbe90b`: 175 changed source files are covered by the five review scopes and the three-file Library total correction. Review manifests capture file contents, including untracked new source; they do not imply a commit was created. The following outputs are copied into the audit directory so the report retains evidence independently of the ignored disposable data:

- [Application suite: 288 files / 1,863 tests](evidence/improvement-full-tests-output.txt)
- [Focused engine suite: 40 files / 372 tests](evidence/improvement-engine-tests-output.txt)
- [Production build and standalone sanitization](evidence/improvement-build-output.txt)
- [Interruption, restart, cancellation, and retained-output proof](evidence/improvement-journal-restart-output.txt)
- [Import transaction, fallback, and cleanup replay proof](evidence/improvement-import-transaction-output.txt)
- [Nine required-file-sync process phases](evidence/improvement-journal-sync-output.txt)
- [Fresh 899-journal scale/restart output](evidence/improvement-journal-scale-output.txt) and [final preservation/count assertions](evidence/improvement-journal-scale-result.json.txt)
- [Final independent review record](evidence/improvement-final-review.txt)
- [Source coverage and manifest hashes](evidence/improvement-source-pin-verification.json.txt)
- Exact scope manifests: [engine](evidence/improvement-engine-manifest.json.txt), [security](evidence/improvement-security-manifest.json.txt), [YouTube](evidence/improvement-youtube-manifest.json.txt), [integration](evidence/improvement-integration-manifest.json.txt), and [UI](evidence/improvement-ui-manifest.json.txt).

The remaining detailed fixture runners, generated synthetic media, isolated databases, intermediate failure logs, and process-level JSON evidence remain under `.codex-tmp/improvement-2026-09-04`. These fixtures are local acceptance tools; they are not application runtime code or production migration scripts.

Publication note: evidence records preserve the observed results. Git normalizes text line endings, and trailing blank lines were removed from three text artifacts. Manifest checksums in the acceptance record describe the original local files; the per-source-file hashes remain the verification identities for the accepted implementation.
