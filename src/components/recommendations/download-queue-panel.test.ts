import { describe, expect, it } from "vitest";

import { buildUsenetConnectionsHref } from "./download-queue-panel";

describe("download queue recovery navigation", () => {
    it("returns to Activity after Usenet setup", () => {
        const url = new URL(buildUsenetConnectionsHref(), "http://nooklet.test");

        expect(url.pathname).toBe("/settings/connections");
        expect(url.searchParams.get("configure")).toBe("usenet-server");
        expect(url.searchParams.get("returnTo")).toBe("/in-progress");
    });

    it("round-trips an encoded workspace route when a caller supplies one", () => {
        const returnTo = "/search?type=tv&q=Only%20Murders%20%26%20More";
        const url = new URL(buildUsenetConnectionsHref(returnTo), "http://nooklet.test");

        expect(url.searchParams.get("returnTo")).toBe(returnTo);
    });
});
