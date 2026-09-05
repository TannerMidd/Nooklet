import { fetchWithTimeout, trimTrailingSlash } from "@/lib/integrations/http-helpers";
import { assertCredentialFreeUrl } from "@/lib/security/credential-url";
import { readString } from "@/modules/service-connections/adapters/arr-response-helpers";

type TvdbConnectionInput = {
    baseUrl: string;
    secret: string;
    metadata?: Record<string, unknown> | null;
    timeoutMs?: number;
};

type TvdbLoginPayload = {
    status?: unknown;
    message?: unknown;
    data?: unknown;
};

function getTvdbLoginToken(payload: TvdbLoginPayload) {
    if (typeof payload.data !== "object" || payload.data === null) {
        return null;
    }

    return readString((payload.data as { token?: unknown }).token);
}

function getTvdbFailureMessage(payload: TvdbLoginPayload) {
    return readString(payload.message) ?? "TVDB returned an unexpected login payload.";
}

export async function verifyTvdbConnection(input: TvdbConnectionInput) {
    assertCredentialFreeUrl(input.baseUrl);
    const endpoint = `${trimTrailingSlash(input.baseUrl)}/login`;

    assertCredentialFreeUrl(endpoint);

    const response = await fetchWithTimeout(
        endpoint,
        {
            method: "POST",
            cache: "no-store",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ apikey: input.secret.trim() }),
        },
        input.timeoutMs,
    );

    if (!response.ok) {
        return {
            ok: false,
            message: `TVDB verification failed with status ${response.status}.`,
            metadata: input.metadata ?? null,
        };
    }

    const payload = (await response.json()) as TvdbLoginPayload;
    const token = getTvdbLoginToken(payload);

    if (!token) {
        return {
            ok: false,
            message: getTvdbFailureMessage(payload),
            metadata: input.metadata ?? null,
        };
    }

    return {
        ok: true,
        message: "TVDB API key verified.",
        metadata: {
            ...(input.metadata ?? {}),
            tvdbApiVersion: "v4",
        },
    };
}
