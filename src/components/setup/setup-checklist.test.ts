import { describe, expect, it } from "vitest";
import { buildSetupChecklist, parseSetupCapability, setupReturnHref } from "./setup-checklist";

function readiness() {
    return {
        services: [
            { serviceType: "tmdb", status: "verified" },
            { serviceType: "usenet-server", status: "verified" },
        ],
        indexers: [
            {
                protocol: "newznab",
                status: "verified",
                isEnabled: true,
                categories: [{ mediaType: "movie" }, { mediaType: "tv" }],
            },
        ],
        storage: {
            downloadWorkspace: {
                reachable: true,
                writable: true,
                availableForNewDownloadsBytes: 1024,
            },
            libraryDestinations: [
                { mediaType: "movie", live: true, readable: true, writable: true },
                { mediaType: "youtube", live: true, readable: true, writable: true },
            ],
        },
        worker: { responsive: true, degraded: false },
    };
}

describe("capability setup", () => {
    it("counts shared verified connections once and selects the right destination", () => {
        const movie = buildSetupChecklist(readiness() as never, "movies");
        const tv = buildSetupChecklist(readiness() as never, "tv");

        expect(movie.every((step) => step.ready)).toBe(true);
        expect(new Set(movie.map((step) => step.id)).size).toBe(movie.length);
        expect(tv.find((step) => step.id === "metadata")?.ready).toBe(true);
        expect(tv.find((step) => step.id === "destination")?.ready).toBe(false);
        const link = new URL(
            tv.find((step) => step.id === "downloader")!.href,
            "http://nooklet.test",
        );

        expect(link.searchParams.get("configure")).toBe("usenet-server");
        expect(link.searchParams.get("returnTo")).toBe("/setup?capability=tv");
    });

    it("never treats Torznab-only configuration as request-ready", () => {
        const input = readiness();

        input.indexers[0].protocol = "torznab";
        expect(
            buildSetupChecklist(input as never, "movies").find((step) => step.id === "indexer")
                ?.ready,
        ).toBe(false);
    });

    it("does not require metadata or Usenet for YouTube and never assumes untested tools are ready", () => {
        const input = readiness();

        input.services = [];
        input.indexers = [];
        const pending = buildSetupChecklist(input as never, "youtube");

        expect(pending.map((step) => step.id)).toEqual(["destination", "worker", "youtube-tools"]);
        expect(pending.find((step) => step.id === "youtube-tools")?.ready).toBeNull();
        expect(
            buildSetupChecklist(input as never, "youtube", true).every((step) => step.ready),
        ).toBe(true);
    });

    it("limits return navigation to the checklist and known capability choices", () => {
        expect(setupReturnHref("//evil.test/setup")).toBe("/setup");
        expect(setupReturnHref("/login")).toBe("/setup");
        expect(setupReturnHref("/setup?capability=youtube&other=ignored")).toBe(
            "/setup?capability=youtube",
        );
        expect(parseSetupCapability("not-a-capability")).toBe("movies");
    });
});
