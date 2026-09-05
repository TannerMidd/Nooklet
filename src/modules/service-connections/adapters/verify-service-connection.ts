import { verifyAiProvider } from "./verify-ai-provider";
import { verifyPlex } from "./verify-plex";
import { verifyUsenetServer } from "./verify-usenet-server";
import { verifyTautulli } from "./verify-tautulli";
import { verifyTmdb } from "./verify-tmdb";
import { verifyTrakt } from "./verify-trakt";
import { verifyTvdb } from "./verify-tvdb";
import type {
    VerifyServiceConnectionInput,
    VerifyServiceConnectionResult,
} from "./verify-service-connection-types";
import {
    CredentialUrlError,
    assertCredentialFreeUrl,
    sanitizeExternalErrorMessage,
} from "@/lib/security/credential-url";

export type {
    VerifyServiceConnectionInput,
    VerifyServiceConnectionResult,
} from "./verify-service-connection-types";

export async function verifyServiceConnection(
    input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
    try {
        assertCredentialFreeUrl(input.baseUrl);

        let result: VerifyServiceConnectionResult;

        switch (input.serviceType) {
            case "ai-provider":
                result = await verifyAiProvider(input);
                break;
            case "tautulli":
                result = await verifyTautulli(input);
                break;
            case "plex":
                result = await verifyPlex(input);
                break;
            case "usenet-server":
                result = await verifyUsenetServer(input);
                break;
            case "tmdb":
                result = await verifyTmdb(input);
                break;
            case "tvdb":
                result = await verifyTvdb(input);
                break;
            case "trakt":
                result = await verifyTrakt(input);
                break;
            default:
                result = {
                    ok: false,
                    message: "Unsupported service type.",
                };
                break;
        }

        return {
            ...result,
            message: sanitizeExternalErrorMessage(
                result.message,
                "Connection verification failed.",
            ),
        };
    } catch (error) {
        return {
            ok: false,
            message:
                error instanceof CredentialUrlError
                    ? error.message
                    : sanitizeExternalErrorMessage(
                          error,
                          "Connection verification failed unexpectedly.",
                      ),
        };
    }
}
