# Discover and recommendations

Discovery works with TMDB alone. AI recommendations are a separate, optional capability and are not required to request media.

## Capability map

| Experience                                                    | Required                                                   | Optional                                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Search, trending, details, artwork, cast, trailers, providers | Verified TMDB connection                                   | None                                                                                                     |
| Generate personalized recommendations                         | A verified OpenAI-compatible connection and healthy worker | TMDB enrichment (required for strict original-language filtering), watch history, and preference context |
| Request a discovered or recommended title                     | A ready request path for that media type                   | Notifications                                                                                            |

## Configure discovery

1. Open **Settings → Connections**.
2. Add TMDB and enter an API token.
3. Test the connection before saving it.
4. Return to **Setup Center** and confirm TMDB is reported as verified.
5. Open **Discover** and search for a known title.

If artwork or results do not load, retest TMDB and inspect [Health and diagnostics](Health-and-Diagnostics) before changing unrelated services.

## Configure AI recommendations

1. Add an **OpenAI-compatible** connection.
2. Enter the provider base URL, model, and credentials expected by that provider.
3. Test and save the connection.
4. Open **Recommendations**, choose movie or TV, and start a run.

Recommendation work is persisted and executed by the background worker. A slow local or reasoning model can legitimately take several minutes; `AI_RECOMMENDATIONS_TIMEOUT_MS` controls the upper bound and defaults to 30 minutes. See [Configuration reference](Configuration-Reference).

Nooklet records the run, candidate items, feedback, and timeline state. A request started from a recommendation enters the same download and import workflow as a request started elsewhere.

Past Picks filtering, total/filtered counts, and page boundaries execute in SQLite so large histories are not materialized in application memory. The operational-retention job may prune old recommendation timeline events, but it does not delete recommendation runs or items.

## Privacy and provider boundaries

The selected AI provider receives the prompt and the context assembled for the run. Treat its base URL and credentials as sensitive configuration, and review the provider's retention policy. Watch history remains optional; disable or remove a source if it should not influence future runs.

## Common failures

| Symptom                                           | Check                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Discover is empty                                 | Verify TMDB and outbound internet access.                                                                     |
| Recommendation remains pending                    | Confirm the worker is responsive on `/health` and inspect recent logs.                                        |
| Provider times out                                | Verify the base URL from inside Docker, model name, provider health, and timeout.                             |
| Recommendation is visible but cannot be requested | Setup Center must show a ready movie or TV request path.                                                      |
| A private provider address is rejected            | Add its exact host or IP to `PRIVATE_SERVICE_HOST_ALLOWLIST`; see [Service connections](Service-Connections). |

## Source references

- [Discover module](https://github.com/TannerMidd/Nooklet/tree/main/src/modules/discover)
- [Recommendations module](https://github.com/TannerMidd/Nooklet/tree/main/src/modules/recommendations)
- [Recommendation schema](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/database/schema.ts)
- [Background worker](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/jobs/worker.ts)

---

Last reviewed: **August 6, 2026**.
