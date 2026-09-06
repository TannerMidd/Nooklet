import { describe, expect, it } from "vitest";

import {
    assertCredentialFreeUrl,
    CredentialUrlError,
    inspectCredentialBearingUrl,
    isCredentialFreeUrl,
    redactUrlForDisplay,
} from "./credential-url";

describe("credential URL policy", () => {
    it.each([
        "https://user:password@example.test",
        "https://user@example.test",
        "https://:password@example.test",
        "https://@example.test",
        "https://:@example.test",
    ])("rejects URL userinfo, including empty userinfo: %s", (value) => {
        const inspection = inspectCredentialBearingUrl(value);

        expect(inspection.valid).toBe(true);
        expect(inspection.hasEmbeddedCredentials).toBe(true);
        expect(inspection.issue).toBe("userinfo");
        expect(redactUrlForDisplay(value)).toBe("https://example.test/");
        expect(() => assertCredentialFreeUrl(value)).toThrow(CredentialUrlError);
    });

    it.each([
        "apikey=secret",
        "api_key=secret",
        "api-key=secret",
        "API%5FKEY=",
        "access%2Dtoken=",
        "A%20P%20I%20K%20E%20Y=secret",
        "password=secret",
        "token=",
        "X-Plex-Token=secret",
        "x_PLEX_token=secret",
        "X%2DPlex%2DToken=secret",
        "X-Plex-Token=",
        "X-Plex-Token=first&x-plex-token=second",
    ])("rejects decoded, case/separator-insensitive credential query names: %s", (query) => {
        const value = `https://example.test/path?connections=8&${query}&page=2`;
        const inspection = inspectCredentialBearingUrl(value);

        expect(inspection.issue).toBe("credential-query");
        expect(isCredentialFreeUrl(value)).toBe(false);
        expect(redactUrlForDisplay(value)).toBe("https://example.test/path?connections=8&page=2");
        expect(inspection.hasEmbeddedCredentials).toBe(true);
        expect(inspection.redactedUrl).toContain("connections=8");
        expect(inspection.redactedUrl).toContain("page=2");
        expect(inspection.redactedUrl).not.toMatch(/apikey|api_key|api-key|token|password/i);
        expect(() => assertCredentialFreeUrl(value)).toThrow(
            "Base URLs must not contain embedded credentials.",
        );
    });

    it("preserves ordinary NNTP connection options", () => {
        const value = "nntps://news.example.test:563?connections=8&page=2";

        expect(isCredentialFreeUrl(value)).toBe(true);
        expect(redactUrlForDisplay(value)).toBe(value);
        expect(assertCredentialFreeUrl(value).searchParams.get("connections")).toBe("8");
    });

    it("preserves non-credential Plex options", () => {
        const value = "https://plex.example.test/?X-Plex-Product=Nooklet&X-Plex-Version=1";

        expect(isCredentialFreeUrl(value)).toBe(true);
        expect(redactUrlForDisplay(value)).toBe(value);
    });

    it("uses a fixed placeholder for malformed legacy values", () => {
        expect(inspectCredentialBearingUrl("not a URL")).toEqual({
            valid: false,
            hasEmbeddedCredentials: false,
            redactedUrl: "[REDACTED URL]",
            issue: "invalid",
        });
        expect(redactUrlForDisplay("not a URL")).toBe("[REDACTED URL]");
    });
});
