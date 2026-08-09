import { describe, expect, it } from "vitest";

import { isTerminalInfrastructureFailure } from "./download-failure-classification";

describe("isTerminalInfrastructureFailure", () => {
    it("treats missing indexers and credential failures as terminal", () => {
        expect(
            isTerminalInfrastructureFailure(
                "No enabled Newznab indexers were available for this media type.",
            ),
        ).toBe(true);
        expect(isTerminalInfrastructureFailure("Indexer returned 401 Unauthorized.")).toBe(true);
    });

    it.each([
        "Indexer rate limited the request with 429.",
        "Indexer request timed out.",
        "Indexer returned 503 Service Unavailable.",
        null,
    ])("keeps transient search failures retryable: %s", (message) => {
        expect(isTerminalInfrastructureFailure(message)).toBe(false);
    });
});
