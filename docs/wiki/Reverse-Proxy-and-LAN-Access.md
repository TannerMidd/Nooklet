# Reverse proxy and LAN access

Nooklet publishes to `127.0.0.1:42021` by default. That loopback-only default is appropriate for first setup and for a reverse proxy running on the same host. Deliberately choose one ingress pattern before exposing the app beyond the host.

| Pattern | Recommended use | `APP_BIND_ADDRESS` | TLS |
| --- | --- | --- | --- |
| Same-host reverse proxy | Preferred for a stable hostname and any remote access | `127.0.0.1` | Terminate at the proxy |
| Direct trusted-LAN access | Small isolated LAN where direct IP/port access is acceptable | Specific LAN address if practical, otherwise `0.0.0.0` | Not built in; HTTPS still recommended |
| VPN plus loopback/proxy | Remote access without public app ingress | Usually `127.0.0.1`, topology-dependent | Provided by proxy/VPN design |
| Direct public port forwarding | Not recommended | — | Nooklet is not an internet-edge TLS server |

## Canonical URL and published port

The relevant `.env` values are:

```dotenv
APP_URL=https://nooklet.example.com
APP_BIND_ADDRESS=127.0.0.1
APP_PORT=42021
TRUST_PROXY_HEADERS=true
```

- `APP_URL` is the browser-facing origin, including `https://` and any non-default external port.
- `APP_BIND_ADDRESS` and `APP_PORT` control Docker's host-side port publishing.
- The container always listens on port `42021`.
- `TRUST_PROXY_HEADERS` affects client-address attribution for abuse controls; it does not make a proxy trusted for authorization.

Use a dedicated origin such as `https://nooklet.example.com`, not an unconfigured path prefix such as `https://example.com/nooklet`.

After changing any value, recreate the container:

```console
docker compose up -d --build --force-recreate
```

## Same-host reverse proxy

Keep Nooklet bound to loopback and make the proxy the only network-facing listener. The proxy should:

1. terminate TLS with a valid certificate;
2. accept only the intended hostname;
3. forward the original `Host` and scheme;
4. overwrite client-address headers rather than trusting client-supplied values; and
5. forward to `127.0.0.1:42021`.

### Caddy example

```caddyfile
nooklet.example.com {
    reverse_proxy 127.0.0.1:42021 {
        header_up Host {host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-For {remote_host}
        header_up X-Real-IP {remote_host}
    }
}
```

### Nginx example

```nginx
server {
    listen 443 ssl;
    server_name nooklet.example.com;

    # Configure ssl_certificate and ssl_certificate_key for this host.

    location / {
        proxy_pass http://127.0.0.1:42021;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

These are minimal upstream examples, not complete proxy hardening. Apply your proxy's maintained TLS, logging, request-size, timeout, and access-control policy.

## Proxy running in another container

`127.0.0.1` inside the proxy container refers to the proxy container itself. Choose one controlled topology:

- place proxy and Nooklet on an explicitly managed Docker network and proxy to the Nooklet service name; or
- publish Nooklet on a host address reachable only by the proxy and firewall it from other clients.

Do not use `network_mode: host` or publish broadly merely to avoid defining the network. If adding Nooklet to another Docker network, keep the data and media mounts unchanged and ensure the upstream name is exact and stable.

## Trusted proxy headers

Leave `TRUST_PROXY_HEADERS=false` for direct connections. Set it to `true` only if all of the following are true:

- every request reaches Nooklet through the trusted proxy;
- direct access to the published app port is blocked or loopback-only; and
- the proxy overwrites `X-Forwarded-For` and/or `X-Real-IP` with a validated client address.

Nooklet uses only a syntactically valid IP from the trusted headers. If a client can connect directly or inject the first forwarded address, source-based login/bootstrap controls can be misattributed.

For a multi-proxy chain, normalize the client address at the last trusted hop. Do not copy arbitrary incoming `X-Forwarded-For` unchanged.

## Direct LAN access

For intentional direct access from the local network:

```dotenv
APP_URL=http://192.168.1.50:42021
APP_BIND_ADDRESS=0.0.0.0
APP_PORT=42021
TRUST_PROXY_HEADERS=false
```

Then recreate and verify:

```console
docker compose up -d --build --force-recreate
docker compose ps
docker compose port app 42021
```

From a second device, open `http://192.168.1.50:42021/api/health`, then the application.

Security requirements for direct LAN publishing:

- reserve a stable address or DNS name for the host;
- limit the host firewall rule to trusted private subnets;
- do not forward the port on the router;
- do not set `TRUST_PROXY_HEADERS=true` without an actual proxy;
- prefer HTTPS even on a LAN when credentials cross shared Wi-Fi or untrusted switches; and
- keep the first-admin bootstrap closed before widening the bind address.

`0.0.0.0` publishes on every host interface. A specific host IP is narrower when Docker and the operating system support it.

## Inbound access versus outbound LAN services

These settings solve different problems:

| Setting | Direction | Purpose |
| --- | --- | --- |
| `APP_BIND_ADDRESS` / `APP_PORT` | Inbound | Where browsers and proxies can reach Nooklet on the Docker host. |
| `APP_URL` | Browser-facing identity | Canonical origin used by authentication and generated navigation. |
| `TRUST_PROXY_HEADERS` | Inbound metadata | Whether a proxy-supplied client IP can be used for abuse controls. |
| `PRIVATE_SERVICE_HOST_ALLOWLIST` | Outbound | Exact private hosts Nooklet may contact for integrations. |
| `ALLOW_PRIVATE_SERVICE_HOSTS` | Outbound | Broad private-host permission for a tightly trusted LAN. |

A reverse proxy does not automatically authorize Nooklet to contact SABnzbd, Plex, Tautulli, an AI server, or a private indexer.

For an exact outbound allowlist:

```dotenv
PRIVATE_SERVICE_HOST_ALLOWLIST=sabnzbd;plex.local;192.168.1.25
ALLOW_PRIVATE_SERVICE_HOSTS=false
```

Entries are hostnames/IPs only—no scheme, port, path, CIDR, or wildcard. Recreate Nooklet after changes. Use the same exact hostname in the connection URL.

## Verification

After proxy or LAN changes:

1. `docker compose ps` shows the expected host publish address.
2. `http://127.0.0.1:42021/api/health` works from the Docker host for a same-host proxy deployment.
3. The external URL redirects unauthenticated users to `/login` on the same expected origin.
4. Browser developer tools show HTTPS with no mixed-content errors.
5. Response headers include `Content-Security-Policy`, `Strict-Transport-Security`, and `X-Content-Type-Options`.
6. Login succeeds and sign-out returns to the expected origin.
7. A private integration test succeeds only for explicitly authorized hosts.

## Common failures

| Symptom | Likely cause | Resolution |
| --- | --- | --- |
| Proxy returns `502 Bad Gateway` | Wrong upstream address or Nooklet is not healthy. | Query the loopback probe on the Nooklet host and inspect `docker compose ps`; a containerized proxy cannot use its own loopback for Nooklet. |
| Redirect or sign-in uses `localhost` | `APP_URL` is still the local default or the container was not recreated. | Set the external origin and force-recreate. |
| Browser cannot connect from LAN | App is still loopback-bound or a host firewall blocks it. | Inspect `docker compose port app 42021`, adjust the deliberate bind/firewall policy, and recreate. |
| Login attempts appear to share one source | Proxy headers are not trusted or the proxy reports only its own address. | Configure the proxy to overwrite client headers, then enable `TRUST_PROXY_HEADERS`. |
| Client can spoof source IP | Nooklet is directly reachable while proxy headers are trusted, or the proxy forwards incoming headers unchanged. | Close direct ingress and overwrite headers at the last trusted proxy. |
| Private integration says host is blocked | Inbound publishing was confused with outbound authorization. | Add the exact integration hostname/IP to `PRIVATE_SERVICE_HOST_ALLOWLIST` and recreate. |
| Connection test rejects a redirect | Outbound redirects are intentionally refused. | Configure the final direct HTTP(S) endpoint rather than a URL that redirects. |

See [Troubleshooting](Troubleshooting) for container, storage, and database failures.

## Source references

- [Compose publish defaults](https://github.com/TannerMidd/Nooklet/blob/main/docker-compose.yml)
- [Environment validation](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/env.ts)
- [Authentication host/proxy behavior](https://github.com/TannerMidd/Nooklet/blob/main/src/auth.ts)
- [Trusted client-address policy](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/security/rate-limit-key.ts)
- [Outbound private-host policy](https://github.com/TannerMidd/Nooklet/blob/main/src/lib/security/safe-fetch.ts)
