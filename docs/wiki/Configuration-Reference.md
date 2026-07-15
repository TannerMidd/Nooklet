# Configuration reference

Start from the annotated [`.env.example`](https://github.com/TannerMidd/Nooklet/blob/main/.env.example). Nooklet validates runtime configuration during startup and rejects missing required values, malformed URLs, weak secrets, known placeholders, invalid allowlist entries, and non-positive AI timeouts.

## Core application settings

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `APP_URL` | Recommended | `http://localhost:42021` | The canonical origin users open. Set the exact external HTTPS origin behind a reverse proxy. |
| `DATABASE_URL` | No | `file:./data/nooklet.db` | SQLite database URL. Compose overrides it to `file:/app/data/nooklet.db` so the database remains in the named volume. |
| `AUTH_SECRET` | Yes | None | Authentication signing secret, 32 characters minimum. Generate a unique random value for every installation. |
| `NODE_ENV` | No | `development` | Runtime mode: `development`, `test`, or `production`. The Docker image sets `production`. |

`APP_URL` does not itself choose the TCP listener. Docker publication uses `APP_BIND_ADDRESS` and `APP_PORT`; native production can pass a port to `next start`.

## Docker publication settings

These variables are interpolated by `docker-compose.yml`. They are not part of the application environment schema.

| Variable | Default | Guidance |
| --- | --- | --- |
| `APP_BIND_ADDRESS` | `127.0.0.1` | Keeps Nooklet local to the host. Use `0.0.0.0` only for deliberate LAN or external exposure. |
| `APP_PORT` | `42021` | Host port published to container port `42021`. Keep `APP_URL` aligned with the user-visible origin. |

The image sets its internal `PORT=42021` and `HOSTNAME=0.0.0.0`. Normally these do not need operator overrides.

## Bootstrap and secret encryption

| Variable | Required | Rules and lifecycle |
| --- | --- | --- |
| `BOOTSTRAP_TOKEN` | For web first-admin setup | Independent random value, 32-512 characters. Remove it after creating the administrator. |
| `SECRET_BOX_KEY` | Strongly recommended | Independent 32-512 character key used to encrypt stored connection credentials. When absent, Nooklet falls back to `AUTH_SECRET` for backward compatibility. |
| `SECRET_BOX_PREVIOUS_KEYS` | During rotation only | Superseded encryption keys separated by semicolons or new lines. Valid values are 32-512 characters each. |

Generate `AUTH_SECRET`, `BOOTSTRAP_TOKEN`, and `SECRET_BOX_KEY` independently. Never commit `.env` or paste these values into support logs.

### Rotate the credential-encryption key

1. Move the current `SECRET_BOX_KEY` into `SECRET_BOX_PREVIOUS_KEYS`.
2. Generate a new independent `SECRET_BOX_KEY`.
3. Restart or recreate the application.
4. Allow normal service and indexer reads to lazily decrypt with an old key and re-encrypt with the active key.
5. Remove a previous key only after all stored credentials that depend on it have been read and rotated.

Keep a verified database backup before key rotation. Losing both the active and required previous keys makes the affected encrypted credentials unrecoverable; they must then be entered again.

## Filesystem boundaries

| Variable | Default | Purpose |
| --- | --- | --- |
| `APPROVED_MEDIA_ROOTS` | Empty in the application; `/media` in the example | Semicolon- or newline-separated directories Nooklet may use for library scanning and file operations. Empty fails closed outside tests. |
| `APPROVED_DOWNLOAD_ROOTS` | Empty in the application; `/downloads` in the example | Semicolon- or newline-separated completed-download roots trusted for SAB imports when no explicit mapping is configured. Empty fails closed. |
| `DOWNLOAD_ENGINE_DIR` | `./data/downloads`; image default `/app/data/downloads` | Working root for incomplete, completed, repair, and extraction activity in the built-in downloader. |
| `SABNZBD_PATH_MAPPINGS` | Empty | Maps paths reported by SABnzbd to paths Nooklet can read. Format: `<reported-prefix>=<nooklet-visible-prefix>`. Separate mappings by semicolons or new lines. |

Docker configuration must use container paths. A spacious host staging disk mounted as `/downloads` should normally use:

```dotenv
APPROVED_MEDIA_ROOTS=/media
APPROVED_DOWNLOAD_ROOTS=/downloads
DOWNLOAD_ENGINE_DIR=/downloads/nooklet-engine
```

See [Storage and path mapping](Storage-and-Path-Mapping) before changing these values.

## Outbound network safety

| Variable | Default | Purpose |
| --- | --- | --- |
| `PRIVATE_SERVICE_HOST_ALLOWLIST` | Empty | Exact semicolon- or newline-separated hostnames or IP addresses that Nooklet may contact on private networks. |
| `ALLOW_PRIVATE_SERVICE_HOSTS` | `false` | Broadly permits private/RFC1918 service targets. Reserve for trusted, single-user LAN deployments. |
| `TRUST_PROXY_HEADERS` | `false` | Trusts client IP forwarding headers for rate-limit identity. Enable only behind a proxy that overwrites those headers. |

Allowlist entries are hostnames or IP addresses only. Do not include a scheme, port, path, CIDR, or wildcard.

```dotenv
PRIVATE_SERVICE_HOST_ALLOWLIST=host.docker.internal;plex.home.arpa;192.168.1.25
```

Prefer the exact allowlist to the broad private-network override. Nooklet resolves outbound targets and enforces this policy to reduce server-side request forgery risk.

Boolean environment variables accept `true`/`false`, `1`/`0`, `yes`/`no`, and `on`/`off`, case-insensitively.

## Recommendation timeout

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_RECOMMENDATIONS_TIMEOUT_MS` | `1800000` | Maximum time, in positive integer milliseconds, for one background AI recommendation request. |

The 30-minute default accommodates slower local and reasoning models. Lower it only when the configured provider should fail faster. Connection verification uses its own shorter operational timeout.

## SABnzbd path translation examples

SAB and Nooklet may mount the same host folder at different container paths:

```dotenv
# SAB reports /sab-downloads/complete/Title
# Nooklet sees that host directory at /downloads/complete/Title
SABNZBD_PATH_MAPPINGS=/sab-downloads=/downloads
```

Windows SAB reporting a Windows path to a Dockerized Nooklet:

```dotenv
SABNZBD_PATH_MAPPINGS=D:\SAB\Complete=/downloads
```

When any mapping is configured, each SAB-reported completed path must match a mapping and remain inside the mapped target root after canonical resolution. Without mappings, the completed path must remain inside `APPROVED_DOWNLOAD_ROOTS`.

## Applying changes

Docker environment and mount changes require recreation:

```bash
docker compose up -d --force-recreate
```

`docker compose restart` keeps the old container environment. Native installations must restart the Node.js process.

After every configuration change:

1. Check `GET /api/health`.
2. Open **Settings -> Storage** for filesystem changes.
3. Re-test affected connections or indexers.
4. Return to **Setup Center** to verify the complete request path.

## Example Docker environment

```dotenv
APP_URL=http://localhost:42021
APP_BIND_ADDRESS=127.0.0.1
APP_PORT=42021

AUTH_SECRET=<unique-random-value>
BOOTSTRAP_TOKEN=<unique-one-time-value>
SECRET_BOX_KEY=<unique-random-encryption-key>

APPROVED_MEDIA_ROOTS=/media
APPROVED_DOWNLOAD_ROOTS=/downloads
DOWNLOAD_ENGINE_DIR=/downloads/nooklet-engine

TRUST_PROXY_HEADERS=false
PRIVATE_SERVICE_HOST_ALLOWLIST=
ALLOW_PRIVATE_SERVICE_HOSTS=false

AI_RECOMMENDATIONS_TIMEOUT_MS=1800000
```

Remove `BOOTSTRAP_TOKEN` and recreate the container after the first administrator is created.

## Implementation references

- [Canonical environment template](https://github.com/TannerMidd/Nooklet/blob/main/.env.example)
- [Runtime environment schema](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/env.ts)
- [Private-host allowlist parser](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/security/private-service-hosts.ts)
- [Outbound request policy](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/security/safe-fetch.ts)
- [Secret encryption and rotation](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/security/secret-box.ts)
