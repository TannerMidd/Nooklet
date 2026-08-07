# Service connections

Service connections live under **Settings -> Connections**. Configure only the integrations needed for the features you plan to use. Regular users cannot change or verify instance connections. Every administrator reads and edits the same shared rows through the stable instance-configuration owner. Trakt is the exception: users may connect their own account for personal watch history.

## Connection catalog

| Connection | Role | Default base URL or endpoint | Credential |
| --- | --- | --- | --- |
| TMDB | Required for core discovery and setup completion | `https://api.themoviedb.org/3` | API key or read token |
| TVDB | Optional TV identity and episode metadata | `https://api4.thetvdb.com/v4` | API key |
| Usenet server | Built-in download transport | Provider-specific NNTP host, always TLS (usually port 563) | Username and password, when required |
| AI provider | Optional recommendations | `https://api.openai.com/v1` | API key when required, plus model ID |
| Plex | Optional direct watch-history import | `http://localhost:32400` placeholder | X-Plex-Token |
| Tautulli | Optional watch-history import and Plex-user selection | `http://localhost:8181` placeholder | API key |
| Trakt | Optional personal watch-history import | `https://api.trakt.tv` | Client ID and OAuth access token |

Default private-service URLs are examples. From Docker, `localhost` means the Nooklet container, not the host running Plex or Tautulli.

## Connection states

| State | Meaning |
| --- | --- |
| **Disconnected** | No saved usable configuration exists. |
| **Configured** | Values were saved without a successful current verification. Features that require verification remain not ready. |
| **Verified** | Nooklet successfully tested the saved connection. |
| **Error** | The latest test failed; the card displays a safe status message. |

Use **Test & save** for initial setup. Nooklet tests the draft values before replacing the saved connection; if the test fails, the previously saved connection remains active. **Save without testing** is available for staged or temporarily unreachable services, but it does not satisfy readiness.

Saved service credentials and indexer API keys are encrypted at rest with `SECRET_BOX_KEY`, falling back to `AUTH_SECRET` only for backward compatibility.

## TMDB

TMDB is the metadata connection required for setup completion. It powers title identity, search, discovery rails, posters, cast, trailers, genres, and original-language checks. A complete request path also needs the Usenet server connection described below.

1. Open **TMDB -> Configure**.
2. Keep the standard base URL unless TMDB has instructed otherwise.
3. Enter the API key or read token.
4. Select **Test & save**.
5. Confirm **Verified**.

TVDB may add TV metadata but does not replace the TMDB readiness requirement.

## Built-in Usenet server

The built-in downloader connects directly to the news provider. The form accepts:

- server hostname;
- port from 1 through 65535 (use the provider's TLS port, usually 563);
- 1 through 20 connections;
- username and password.

Every connection uses TLS with certificate verification; plaintext NNTP is not supported, so article data and credentials are never readable on the network. Verification performs a TLS connection, authenticates when credentials are present, and issues an NNTP `DATE` round trip. Keep the connection count at or below the provider's account limit.

The built-in engine also needs [download staging storage](Storage-and-Path-Mapping) and a verified [Newznab indexer](Indexers).

## AI provider

AI recommendations are optional. Configure:

- an OpenAI-compatible base URL;
- an API key when the provider requires one;
- a default model identifier.

Verification requests the provider's model-list endpoint and saves the returned model IDs. Nooklet recognizes the normal OpenAI-compatible `{ data: [...] }` response and LM Studio's native model-list shape. Recommendation generation uses an OpenAI-compatible chat-completions request; local providers must expose compatible behavior.

The recommendation request timeout is controlled by `AI_RECOMMENDATIONS_TIMEOUT_MS`, whose default is 30 minutes. This does not extend the shorter connection-verification timeout.

## Plex, Tautulli, and Trakt

These integrations add watch-history context and are not required for media requests.

- **Plex** imports watches directly using an X-Plex-Token.
- **Tautulli** imports recent Plex watches and lets the operator choose the Plex user discovered during verification.
- **Trakt** uses a client ID and OAuth access token and is scoped to the connecting user's personal history.

Choose the source you already operate; connecting all three is unnecessary.

## Docker and LAN addressing

Use one of these addressing patterns:

| Service location | Base URL pattern |
| --- | --- |
| Another service in the same Compose network | `http://<compose-service-name>:<port>` |
| Service running on the Docker host | `http://host.docker.internal:<port>` where supported |
| Service elsewhere on the LAN | `http://<exact-hostname-or-IP>:<port>` |

Private and loopback targets are protected by the outbound request policy. Add only the exact hostname or IP to `PRIVATE_SERVICE_HOST_ALLOWLIST`, then recreate/restart Nooklet:

```dotenv
PRIVATE_SERVICE_HOST_ALLOWLIST=host.docker.internal;plex.home.arpa;192.168.1.25
```

Do not include schemes, ports, paths, CIDR ranges, or wildcards. `ALLOW_PRIVATE_SERVICE_HOSTS=true` is a broader alternative intended only for a trusted, single-user LAN.

## Troubleshooting connection tests

1. Confirm the URL is reachable from the Nooklet runtime, not merely from your desktop browser.
2. For Docker, replace `localhost` with a Compose service name, `host.docker.internal`, or a LAN address.
3. Add the exact private hostname/IP to `PRIVATE_SERVICE_HOST_ALLOWLIST` and recreate the container.
4. Confirm TLS scheme and port match the provider.
5. Re-enter the credential if it was rotated; a blank credential while editing keeps the saved value.
6. Inspect `docker compose logs --tail=200 app` for transport-level context without sharing secrets publicly.
7. Retry **Test & save**, then return to Setup Center.

## Implementation references

- [Connection definitions](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/service-connections/service-definitions.ts)
- [Connection form and lifecycle](https://github.com/TannerMidd/Nooklet/blob/main/src/app/%28workspace%29/settings/connections/connection-card.tsx)
- [Connection input schemas](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/service-connections/schemas/service-connection.ts)
- [Usenet verification](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/service-connections/adapters/verify-usenet-server.ts)
- [AI provider endpoint handling](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/service-connections/ai-provider-endpoints.ts)
