import { describe, expect, it } from "vitest";

import { isInfrastructureIndexerSearchFailure } from "./download-failure-classification";

describe("isInfrastructureIndexerSearchFailure", () => {
    it("treats a missing compatible Newznab source as a configuration failure", () => {
        expect(
            isInfrastructureIndexerSearchFailure(
                "No enabled Newznab indexers were available for this media type.",
            ),
        ).toBe(true);
    });
});
