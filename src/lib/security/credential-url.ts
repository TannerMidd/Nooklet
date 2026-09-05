const REDACTED_URL = "[REDACTED URL]";

/**
 * Query names which commonly carry an authentication identity or secret.
 *
 * URLSearchParams decodes percent escapes before these names are checked. The
 * normalizer below then treats punctuation and whitespace as separators, so
 * `api_key`, `api-key`, and `API%5FKEY` all have the same policy outcome.
 */
const CREDENTIAL_QUERY_NAMES = new Set([
    "access",
    "accesskey",
    "accesstoken",
    "api",
    "apikey",
    "apisecret",
    "apitoken",
    "auth",
    "authtoken",
    "authorization",
    "bearer",
    "clientid",
    "clientsecret",
    "clienttoken",
    "credential",
    "credentials",
    "key",
    "login",
    "pass",
    "passwd",
    "password",
    "passphrase",
    "privatekey",
    "secret",
    "secretkey",
    "sig",
    "signature",
    "token",
    "user",
    "username",
]);

export type CredentialUrlIssue = "invalid" | "userinfo" | "credential-query";

export class CredentialUrlError extends Error {
    constructor(public readonly code: CredentialUrlIssue) {
        super(
            code === "invalid"
                ? "Enter a valid base URL."
                : "Base URLs must not contain embedded credentials.",
        );
        this.name = "CredentialUrlError";
    }
}

export type CredentialUrlInspection = {
    valid: boolean;
    hasEmbeddedCredentials: boolean;
    redactedUrl: string;
    issue?: CredentialUrlIssue;
};

function normalizeQueryName(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isCredentialQueryName(name: string) {
    return CREDENTIAL_QUERY_NAMES.has(normalizeQueryName(name));
}

/**
 * URL parses empty userinfo (`https://@host`) as an empty username/password,
 * so inspect the raw authority as well as URL.username/URL.password.
 */
function hasUserinfo(value: string) {
    const schemeSeparator = value.indexOf("://");

    if (schemeSeparator < 0) {
        return false;
    }

    const authority = value.slice(schemeSeparator + 3).split(/[/?#]/, 1)[0] ?? "";

    return authority.includes("@");
}

function parseUrl(value: unknown) {
    const trimmed = typeof value === "string" ? value.trim() : "";

    try {
        return { value: trimmed, url: new URL(trimmed) };
    } catch {
        return null;
    }
}

function redactParsedUrl(url: URL) {
    url.username = "";
    url.password = "";

    for (const name of Array.from(url.searchParams.keys())) {
        if (isCredentialQueryName(name)) {
            url.searchParams.delete(name);
        }
    }

    return url.toString();
}

export function inspectCredentialBearingUrl(value: unknown): CredentialUrlInspection {
    const parsed = parseUrl(value);

    if (!parsed) {
        return {
            valid: false,
            hasEmbeddedCredentials: false,
            redactedUrl: REDACTED_URL,
            issue: "invalid",
        };
    }

    const userinfo =
        hasUserinfo(parsed.value) || Boolean(parsed.url.username) || Boolean(parsed.url.password);
    const credentialQuery = Array.from(parsed.url.searchParams.keys()).some(isCredentialQueryName);
    const issue = userinfo ? "userinfo" : credentialQuery ? "credential-query" : undefined;

    const hasEmbeddedCredentials = Boolean(issue);

    return {
        valid: true,
        hasEmbeddedCredentials,
        redactedUrl: hasEmbeddedCredentials
            ? redactParsedUrl(new URL(parsed.url.toString()))
            : parsed.value,
        ...(issue ? { issue } : {}),
    };
}

export function redactUrlForDisplay(value: unknown) {
    return inspectCredentialBearingUrl(value).redactedUrl;
}

/**
 * Validates a configured URL before credentials are resolved or a request is
 * constructed. The returned URL is safe to use as a base; request-specific
 * authentication parameters may be added afterwards by an adapter.
 */
export function assertCredentialFreeUrl(value: unknown) {
    const inspection = inspectCredentialBearingUrl(value);

    if (!inspection.valid || inspection.issue) {
        throw new CredentialUrlError(inspection.issue ?? "invalid");
    }

    return new URL(String(value).trim());
}

export function isCredentialFreeUrl(value: unknown) {
    const inspection = inspectCredentialBearingUrl(value);

    return inspection.valid && !inspection.issue;
}

const URL_LIKE_PATTERN = /\b(?:https?|nntp|nntps):\/\/[^\s"'<>]+/i;
const CREDENTIAL_LIKE_PATTERN =
    /(?:api[_-]?key|access[_-]?token|auth(?:orization)?|bearer|credential|password|passwd|passphrase|secret|token)\s*[=:]/i;

export const REDIRECT_ERROR_MESSAGE = "The service redirected; verify its base URL.";

/**
 * Provider and transport errors are useful when they contain only a status or
 * a stable explanation. Once an error contains a URL or credential-shaped
 * material, replace the whole message so it cannot become a persisted/shared
 * status field.
 */
export function sanitizeExternalErrorMessage(value: unknown, fallback: string) {
    const message = value instanceof Error ? value.message : typeof value === "string" ? value : "";

    if (!message.trim()) {
        return fallback;
    }

    if (/redirect/i.test(message)) {
        return REDIRECT_ERROR_MESSAGE;
    }

    if (URL_LIKE_PATTERN.test(message) || CREDENTIAL_LIKE_PATTERN.test(message)) {
        return fallback;
    }

    return message;
}

export const __testables__ = {
    CREDENTIAL_QUERY_NAMES,
    normalizeQueryName,
    hasUserinfo,
    isCredentialQueryName,
    sanitizeExternalErrorMessage,
};
