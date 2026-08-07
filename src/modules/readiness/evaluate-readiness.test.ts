import { describe, expect, it } from "vitest";

import { evaluateReadiness, type ReadinessEvaluationInput } from "./evaluate-readiness";

function readyInput(): ReadinessEvaluationInput {
    return {
        services: [
            { serviceType: "tmdb", status: "verified" },
            { serviceType: "ai-provider", status: "verified" },
            { serviceType: "usenet-server", status: "verified" },
        ],
        indexers: [{ status: "verified", isEnabled: true, mediaTypes: ["movie", "tv"] }],
        destinations: [
            { mediaType: "movie", reachable: true, writable: true },
            { mediaType: "tv", reachable: true, writable: true },
        ],
        downloadWorkspace: {
            reachable: true,
            writable: true,
            availableForNewDownloadsBytes: 50 * 1024 ** 3,
        },
        worker: { responsive: true, degraded: false },
        watchHistory: { sourceCount: 1, itemCount: 42 },
        notifications: { configuredCount: 1, enabledCount: 1 },
    };
}

describe("evaluateReadiness", () => {
    it("marks the complete request path ready", () => {
        const result = evaluateReadiness(readyInput());

        expect(result.setupComplete).toBe(true);
        expect(result.readyForFirstRequest).toBe(true);
        expect(result.progressPercent).toBe(100);
        expect(result.capabilities.every((entry) => entry.status === "ready")).toBe(true);
    });

    it("identifies the exact missing pieces for one media type", () => {
        const input = readyInput();

        input.destinations = input.destinations.filter((entry) => entry.mediaType === "movie");

        const result = evaluateReadiness(input);
        const movie = result.capabilities.find((entry) => entry.id === "movie-downloads");
        const tv = result.capabilities.find((entry) => entry.id === "tv-downloads");

        expect(movie?.status).toBe("ready");
        expect(tv?.status).toBe("needs-attention");
        expect(tv?.details).toContain("Add a reachable, writable TV library destination.");
        expect(result.readyForFirstRequest).toBe(true);
    });

    it("keeps optional integrations from blocking first-run completion", () => {
        const input = readyInput();

        input.services = input.services.filter((service) => service.serviceType !== "ai-provider");
        input.watchHistory = { sourceCount: 0, itemCount: 0 };
        input.notifications = { configuredCount: 0, enabledCount: 0 };

        const result = evaluateReadiness(input);

        expect(result.setupComplete).toBe(true);
        expect(result.capabilities.find((entry) => entry.id === "recommendations")?.status).toBe(
            "optional",
        );
        expect(result.capabilities.find((entry) => entry.id === "watch-history")?.status).toBe(
            "optional",
        );
    });

    it("does not call a writable workspace ready when reservations consume its capacity", () => {
        const input = readyInput();

        input.downloadWorkspace.availableForNewDownloadsBytes = 0;

        const result = evaluateReadiness(input);

        expect(result.capabilities.find((entry) => entry.id === "storage")?.status).toBe(
            "needs-attention",
        );
        expect(
            result.capabilities.find((entry) => entry.id === "movie-downloads")?.details,
        ).toContain("Make the built-in download workspace writable and free enough space.");
    });
});
