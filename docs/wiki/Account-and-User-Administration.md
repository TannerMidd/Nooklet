# Account and user administration

Nooklet uses local email-and-password accounts. Administrators manage account access from `/admin` and configure capabilities consumed across the instance; every signed-in user manages their own password from `/settings/account`.

## Roles and boundaries

| Capability                                                           | User | Administrator |
| -------------------------------------------------------------------- | :--: | :-----------: |
| Browse, discover, search, and request media                          | Yes  |      Yes      |
| Manage personal preferences and watch history                        | Yes  |      Yes      |
| Change own password                                                  | Yes  |      Yes      |
| Change shared storage, integrations, indexers, and instance settings |  No  |      Yes      |
| Create, disable, re-enable, or reset another account                 |  No  |      Yes      |
| Grant or remove administrator role                                   |  No  |      Yes      |

Shared download, storage, indexer, and service configuration affects every user. Grant administrator access only to people trusted with the host, media paths, integration credentials, and all accounts.

## Create the first administrator

The web bootstrap is available only when:

1. no administrator exists in the database; and
2. `BOOTSTRAP_TOKEN` is configured in the runtime environment.

Open `/bootstrap`, enter the one-time token, and create the first account. Passwords must be 12–128 characters and contain at least one lowercase letter, uppercase letter, and number.

After bootstrap:

1. Remove `BOOTSTRAP_TOKEN` from `.env`.
2. Recreate the container so the token leaves the runtime environment:

    ```console
    docker compose up -d --force-recreate
    ```

3. Confirm normal sign-in and `/api/health`.

Do not reuse `AUTH_SECRET`, `SECRET_BOX_KEY`, an account password, or an API key as the bootstrap token.

## Create a managed account

1. Sign in as an administrator.
2. Open `/admin`.
3. Under **Create account**, enter the display name, normalized email, role, and a temporary password.
4. Convey the temporary password through a private channel.

The new user is forced to replace the temporary password on first sign-in. Until that change is complete, authenticated navigation redirects the account to `/settings/account`.

Nooklet does not send an email invitation or password-reset message. The administrator is responsible for delivering the temporary credential securely and confirming that it was replaced.

## Change access safely

From `/admin`, an administrator can:

- promote a user to administrator;
- demote an administrator to user;
- disable or re-enable another account; and
- set a temporary password for another account.

Server-side guards prevent an administrator from changing their own role or status through the management screen and prevent removal or disabling of the last active administrator. Use a second active administrator for planned role transitions.

Prefer disabling an account to deleting history. The current UI preserves the account and its audit/request history while preventing sign-in.

### Session invalidation

Sessions use encrypted JWT cookies with an absolute 24-hour maximum age. Each login creates a matching `auth_sessions` record tied to the user's monotonic `auth_generation` in SQLite. Session issuance rechecks the generation captured during credential verification. Disabling an account or writing a password advances the generation and revokes existing records, so a pending login cannot survive an invalidation race. On every subsequent authenticated request, Nooklet requires the active record, matching generation, and live user:

- explicitly signed-out sessions lose access, even if a late response tries to refresh the old cookie;
- disabled accounts lose access;
- deleted/missing accounts lose access; and
- a password changed after the token was issued invalidates that token.

Use Nooklet's **Sign out** control to end the current session. It revokes the SQLite record before clearing the browser cookie; direct `POST /api/auth/signout` is intentionally unavailable.

Tokens created before the server-side session and generation claims existed fail closed once and require a fresh sign-in after this upgrade.

An administrator password reset sets a temporary password and forces the target user to choose a private replacement at the next sign-in.

## Change your own password

Open `/settings/account` and provide the current password plus a different replacement password. The same 12–128 character complexity policy applies.

Changing the password invalidates older sessions. Sign in again on other devices as needed.

## Recover an administrator account locally

Use local CLI recovery when no active administrator can sign in. This procedure writes directly to the SQLite database, emits an audit event, clears recorded login failures, and prints a one-time temporary password to the terminal.

Password recovery does **not** re-enable a disabled account or change its role. A different active administrator must re-enable that account from `/admin`. If every administrator is disabled, the password-recovery command alone cannot restore access; preserve and back up the database before pursuing explicit database-level recovery or restoring a known-good backup.

> [!IMPORTANT]
> Anyone who can run this command against the Nooklet data volume has administrative recovery capability. Protect Docker/host access and terminal logs accordingly.

### Docker recovery

First create an off-host [verified backup](Backup-Restore-and-Upgrades). Then run:

```console
docker compose exec app node scripts/recover-account.mjs --email admin@example.com
```

If exactly one active administrator exists, `--email` may be omitted:

```console
docker compose exec app node scripts/recover-account.mjs
```

When multiple active administrators exist, the script requires an explicit email. It refuses unknown accounts and an in-memory database.

After recovery:

1. Copy the temporary password from the private terminal session.
2. Sign in once.
3. Nooklet redirects to `/settings/account` and requires a replacement password.
4. Remove the temporary password from shell transcripts, tickets, and password-manager notes that no longer need it.
5. Review recent account changes and audit history.

### Host-native recovery

With `.env` present and dependencies installed:

```console
npm run account:recover -- --email admin@example.com
```

## Sign-in abuse controls

Nooklet applies SQLite-backed, fixed-window rate limits to credential attempts. When `TRUST_PROXY_HEADERS=true`, the proxy-derived client IP can be used for per-source limits; otherwise Nooklet avoids trusting spoofable forwarding headers.

Operational implications:

- A burst of rejected attempts can require waiting for the five-minute window to clear.
- Ordinary password failures are recorded for audit/diagnostics but do not create an attacker-controlled permanent account lockout.
- Enabling trusted proxy headers without a proxy that overwrites them weakens source attribution. See [Reverse proxy and LAN access](Reverse-Proxy-and-LAN-Access).

## Administrator handoff checklist

Nooklet persists one stable instance-configuration owner and resolves shared connections, indexers, libraries, and paths through it. Every administrator edits that same configuration, and disabling or demoting the backing account does not silently select a different administrator's rows.

1. Create or promote the replacement administrator.
2. Have them sign in, replace any temporary password, and verify `/admin` access.
3. From the replacement account, verify shared connections, indexers, storage, Setup Center, and one representative regular-user request path.
4. Demote or disable the old administrator.
5. Rotate shared credentials if the old administrator should no longer know them.
6. Preserve the audit record and a verified database backup.

The migration that introduced the stable owner consolidates non-conflicting shared rows under it and preserves conflicting legacy rows rather than overwriting secrets or paths. A follow-up migration keeps one deterministic instance-wide library scan, missing-content search, and metadata-refresh schedule under that owner; duplicate legacy schedules are disabled without deleting their last-run history. After upgrading a multi-admin installation, review the effective shared configuration before removing old accounts.

## Account incident response

If an account may be compromised:

1. Sign in as a different administrator and disable it.
2. Reset its password only when access should be restored.
3. Rotate integration credentials the account could view or replace.
4. Review shared configuration, notification channels, storage paths, requests, and audit events.
5. Rotate `AUTH_SECRET` only if the session-encryption key may be exposed; this signs out existing sessions and requires a container recreate.
6. Follow [Security model](Security-Model) if encryption keys or backups may be exposed.

## Source references

- [Administration screen](https://github.com/TannerMidd/Nooklet/blob/main/src/app/%28workspace%29/admin/page.tsx)
- [Managed-user schemas](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/users/schemas/admin-user.ts)
- [Account recovery tool](https://github.com/TannerMidd/Nooklet/blob/main/scripts/recover-account.mjs)
- [Authentication and session policy](https://github.com/TannerMidd/Nooklet/blob/main/src/auth.ts)
- [Server-side session validity repository](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/identity-access/repositories/auth-session-repository.ts)
- [First-admin workflow](https://github.com/TannerMidd/Nooklet/blob/main/src/modules/identity-access/workflows/create-first-admin.ts)
