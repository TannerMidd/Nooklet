# Screenshot evidence index

Captured September 4, 2026 in the Codex in-app browser against an isolated Nooklet audit database. All images are actual viewport captures. The browser returned JPEG bytes, saved here with `.jpg` extensions. No image content was edited. Initial stitched full-page captures were replaced and are not included.

The dimensions below describe the saved image pixels. Some browser captures are slightly scaled relative to the requested viewport. Desktop testing used the existing viewport or 1440×900; mobile testing explicitly used 390×844. Image 09 was captured at a narrower initial browser size and is not the basis of the 390px episode-table finding.

Missing services, worker readings, and yt-dlp reflect the intentionally incomplete audit environment. Images 03 and 16–22 contain synthetic catalog records. The Next development badge is not product UI. The source-account setup form contains no real saved credentials.

| #   | Flow and state                                                              | Saved dimensions | Evidence                                                                   |
| --- | --------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------- |
| 01  | Fresh first-administrator bootstrap form                                    | 1270×714         | [Bootstrap](screenshots/01-bootstrap.jpg)                                  |
| 02  | Ordinary sign-in lands on TV picks with missing prerequisites               | 1280×720         | [First login](screenshots/02-first-login-tv.jpg)                           |
| 03  | Home overview and setup guidance; two synthetic titles                      | 1430×894         | [Home](screenshots/03-home.jpg)                                            |
| 04  | Setup Center with shared Movie/TV prerequisites                             | 1430×894         | [Setup](screenshots/04-setup.jpg)                                          |
| 05  | Connections overview and service hierarchy                                  | 1430×894         | [Connections](screenshots/05-connections.jpg)                              |
| 06  | Expanded metadata connection form                                           | 1270×714         | [Connection form](screenshots/06-connection-form.jpg)                      |
| 07  | Discover without configured metadata                                        | 1280×720         | [Discover](screenshots/07-discover.jpg)                                    |
| 08  | Failed search simultaneously claims no matches                              | 1280×720         | [Search failure — B04](screenshots/08-search-failure.jpg)                  |
| 09  | Initial Library empty state at a narrow browser size                        | 309×882          | [Library empty](screenshots/09-library-empty.jpg)                          |
| 10  | Mobile YouTube entry/search interface                                       | 390×844          | [YouTube](screenshots/10-youtube-mobile.jpg)                               |
| 11  | Mobile navigation drawer; Escape/focus restoration also checked             | 390×844          | [Navigation](screenshots/11-mobile-navigation.jpg)                         |
| 12  | Mobile Activity repeats the unavailable-provider instruction                | 380×822          | [Activity](screenshots/12-activity-mobile.jpg)                             |
| 13  | Settings hub                                                                | 1430×894         | [Settings](screenshots/13-settings.jpg)                                    |
| 14  | Storage waiting for its first worker reading                                | 1430×894         | [Storage](screenshots/14-storage.jpg)                                      |
| 15  | Health in the workerless development environment                            | 1430×894         | [Health](screenshots/15-health.jpg)                                        |
| 16  | TV Library with a synthetic long title                                      | 1440×900         | [TV Library](screenshots/16-tv-library.jpg)                                |
| 17  | Desktop title details and episodes                                          | 1440×900         | [Series details](screenshots/17-series-details.jpg)                        |
| 18  | Monitoring save rejected by a synthetic DB trigger, UI reports success      | 1440×900         | [False success — B03](screenshots/18-monitoring-false-success.jpg)         |
| 19  | Mobile episode detail/table layout                                          | 390×844          | [Mobile series](screenshots/19-series-mobile.jpg)                          |
| 20  | Mobile “Missing only” enabled                                               | 390×844          | [Missing filter](screenshots/20-missing-filter-mobile.jpg)                 |
| 21  | Unaired S01E03 retained by missing filter; overlapping header/title columns | 390×844          | [Availability and layout — B05/B06](screenshots/21-unaired-in-missing.jpg) |
| 22  | Mobile bulk-selection action area                                           | 390×844          | [Bulk actions](screenshots/22-mobile-bulk-actions.jpg)                     |

See the [main report](report.md) for findings and the [verification notes](verification.md) for reproduction steps and limits. A screenshot establishes visible state; source traces, database reads, and interaction checks establish the behavior behind the relevant findings.
