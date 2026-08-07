import { describe, expect, it } from "vitest";

import { summarizeRequestSubmission } from "./outcome-summary";

function result(reason: "queued" | "no_matching_release" | "search_failed" | "queue_failed") {
    const queued = reason === "queued";

    return {
        selections: [],
        queuedDownload: queued
            ? {
                  queued: true,
                  reason: "queued",
                  message: null,
                  selectedResultId: "result-1",
                  rejectedResultIds: [],
                  download: {},
              }
            : {
                  queued: false,
                  reason,
                  message: reason === "queue_failed" ? "Download workspace is full." : null,
                  selectedResultId: null,
                  rejectedResultIds: [],
                  download: null,
              },
    } as never;
}

describe("summarizeRequestSubmission", () => {
    it("separates a catalog-only add from a queued download", () => {
        expect(
            summarizeRequestSubmission({
                title: "Arrival",
                downloadNow: false,
                qualityProfile: "hd-1080p",
                result: result("no_matching_release"),
            }),
        ).toEqual(
            expect.objectContaining({
                outcome: "catalog_added",
                status: "success",
                message: "Arrival was added to your catalog. No download was requested.",
            }),
        );
    });

    it("reports a genuinely queued download", () => {
        expect(
            summarizeRequestSubmission({
                title: "Arrival",
                downloadNow: true,
                qualityProfile: "hd-1080p",
                result: result("queued"),
            }),
        ).toEqual(expect.objectContaining({ outcome: "queued", status: "success" }));
    });

    it.each([
        ["no_matching_release", "no_match"],
        ["search_failed", "search_failed"],
        ["queue_failed", "queue_failed"],
    ] as const)("maps %s without claiming success", (reason, outcome) => {
        expect(
            summarizeRequestSubmission({
                title: "Arrival",
                downloadNow: true,
                qualityProfile: "hd-1080p",
                result: result(reason),
            }),
        ).toEqual(expect.objectContaining({ outcome, status: "warning", queuedCount: 0 }));
    });

    it("reports mixed season-pack and episode-fallback outcomes accurately", () => {
        const queuedPack = {
            target: { kind: "season", season: 1 },
            releaseSearch: { searched: true },
            queuedDownload: {
                queued: true,
                reason: "queued",
                message: null,
                selectedResultId: "pack-1",
                rejectedResultIds: [],
                download: {},
            },
            seasonFallback: null,
        };
        const episodeFallback = {
            target: { kind: "season", season: 2 },
            releaseSearch: { searched: true },
            queuedDownload: {
                queued: false,
                reason: "no_matching_release",
                message: null,
                selectedResultId: null,
                rejectedResultIds: [],
                download: null,
            },
            seasonFallback: {
                queuedCount: 2,
                activeCount: 1,
                ownedCount: 7,
                unavailableCount: 0,
                completed: false,
            },
        };

        const summary = summarizeRequestSubmission({
            title: "Severance",
            downloadNow: true,
            qualityProfile: "hd-1080p",
            result: {
                selections: [queuedPack, episodeFallback],
                queuedDownload: queuedPack.queuedDownload,
            } as never,
        });

        expect(summary).toEqual(
            expect.objectContaining({
                outcome: "queued",
                status: "success",
                queuedCount: 2,
                selectionCount: 2,
            }),
        );
        expect(summary.message).toContain("1 season pack was queued.");
        expect(summary.message).toContain("1 season switched automatically to individual episodes");
        expect(summary.message).toContain("2 queued now");
        expect(summary.message).toContain("7 already in the library");
        expect(summary.message).not.toContain("No usable season pack was available");
    });
});
