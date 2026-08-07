# Indexers

Nooklet searches Usenet release providers through Newznab. At least one indexer must be enabled, verified, and assigned a category for the media type you want to request.

> Nooklet's download path is Usenet-only. Torznab indexers are not supported.

## Supported presets

The interface provides presets for:

- NZBGeek — `https://api.nzbgeek.info/api`
- DrunkenSlug — `https://drunkenslug.com/api`
- NZB Finder — `https://nzbfinder.ws/api`
- Other Newznab provider — enter the host and API path documented by the provider

Presets are conveniences, not a substitute for the provider's account documentation. Review the generated URL before saving.

## Add an indexer

1. Open **Settings -> Indexers**.
2. Expand **Add an indexer**.
3. Select a provider preset.
4. Enter a display name.
5. Confirm the protocol is **Newznab (Usenet)**.
6. Confirm the base URL. HTTPS is recommended.
7. Enter the API key.
8. Choose a search order from 0 through 100; lower numbers are searched first.
9. Select **Movies**, **TV series**, or both.
10. Keep **Use this indexer in searches** enabled.
11. Select **Test & add**.

The standard Newznab categories are:

| Media type | Category ID |
| ---------- | ----------- |
| Movies     | `2000`      |
| TV series  | `5000`      |

If the provider requires more specific categories, add comma-separated category IDs under **Advanced provider settings**. The API path is normally `/api` and must begin with one slash.

## Test and save behavior

**Test & add** or **Test & save** validates the draft and sends a Newznab test request before committing it. If an edit test fails, the currently saved indexer remains unchanged.

**Save without testing** stores the configuration with a non-verified state. It is useful when staging configuration during an outage, but the indexer will not satisfy Setup Center until a later test succeeds.

The API key field may be left blank when editing to keep the saved key. Removing an indexer deletes its stored API key and categories; existing activity history remains.

## Search order and failure handling

Enabled indexers for the requested media type are sorted by ascending search-order number and then by name. Nooklet attempts them in that order. A provider failure is captured for that source and does not prevent later configured providers from being attempted.

Use lower numbers for preferred providers. Equal numbers are deterministically ordered by name in the current runtime.

## Readiness rules

An indexer satisfies a request path only when all of these are true:

- it is enabled;
- its latest status is **Verified**;
- it has at least one category mapped to the requested media type.

A movie-only indexer does not make TV downloads ready, and a TV-only indexer does not make movie downloads ready. One indexer can satisfy both when it has both media category mappings.

## Provider URL construction

Nooklet stores the base URL and API path separately, then builds Newznab requests with the configured key and categories. Use:

```text
Base URL: https://indexer.example.com
API path: /api
```

Do not paste query parameters or an API key into the base URL. Nooklet stores the key separately in encrypted form.

## Troubleshooting

### The indexer saves but Setup Center still reports it missing

Confirm all three readiness signals:

1. Status is **Verified**, not merely **Configured**.
2. **Use this indexer in searches** is enabled.
3. The requested media type has a category selected.

### Test returns unauthorized

- Recopy the API key from the provider account page.
- Confirm the account is active and API access is enabled.
- Keep the key out of the URL; enter it only in the API key field.

### Test returns not found or invalid XML

- Confirm the provider offers Newznab rather than Torznab.
- Verify the host and `/api` path against provider documentation.
- Remove duplicated path components, such as using both a base URL ending in `/api` and API path `/api`.

### Search returns no releases

- Confirm the provider supports the chosen category.
- Try the standard `2000` or `5000` category first.
- Check the provider's retention, limits, and account status.
- Add provider-specific subcategory IDs only when documented.
- Review the requested title, year, season, and episode for accuracy.

### One provider is unreliable

Add another Newznab indexer with a later search order. Nooklet retains a per-provider failure and continues through the remaining sources.

## Security notes

- Indexers are consumed across the instance and editable only by administrators. Every administrator reads and edits the same rows through the stable instance-configuration owner.
- API keys and stored download URLs are encrypted at rest.
- Outbound requests use the same private-host and redirect restrictions as other service connections.
- Prefer HTTPS and never post an API key in an issue, log excerpt, or screenshot.

## Implementation references

- [Indexer settings form](https://github.com/TannerMidd/Nooklet/blob/main/src/app/%28workspace%29/settings/indexers/indexer-settings-form.tsx)
- [Provider presets](https://github.com/TannerMidd/Nooklet/blob/main/src/app/%28workspace%29/settings/indexers/indexer-presets.ts)
- [Validated indexer inputs](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/indexers/schemas/indexer-input.ts)
- [Newznab adapter](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/indexers/adapters/newznab.ts)
- [Runtime source ordering](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/indexers/repositories/indexer-repository.ts)
- [Failure-tolerant execution](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/indexers/workflows/search-indexers/indexer-execution.ts)
