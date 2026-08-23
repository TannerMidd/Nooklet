import { describe, expect, it, vi } from "vitest";

import { FinalizeDownloadError } from "@/modules/download-engine/finalize/finalize-download";
import { NntpError } from "@/modules/download-engine/nntp/nntp-client";

import { classifyEngineNntpFailureKinds, classifyEngineRuntimeError } from "./engine-runner";

describe("engine failure classification", () => {
    it.each([
        "connect-failed",
        "auth-failed",
        "protocol-error",
        "timeout",
        "connection-closed",
    ] as const)("classifies %s as infrastructure", (kind) => {
        expect(classifyEngineNntpFailureKinds([kind])).toBe("infrastructure");
        expect(classifyEngineRuntimeError(new NntpError(kind, "NNTP failed."))).toBe(
            "infrastructure",
        );
    });

    it.each(["article-not-found", "article-unusable"] as const)(
        "classifies %s as release content",
        (kind) => {
            expect(classifyEngineNntpFailureKinds([kind])).toBe("content");
            expect(classifyEngineRuntimeError(new NntpError(kind, "Article failed."))).toBe(
                "content",
            );
        },
    );

    it("recognizes server-unavailable when supplied by the NNTP slice", () => {
        expect(classifyEngineNntpFailureKinds(["server-unavailable"])).toBe("infrastructure");

        const error = Object.assign(new NntpError("timeout", "NNTP failed."), {
            kind: "server-unavailable",
        });

        expect(classifyEngineRuntimeError(error)).toBe("infrastructure");
    });

    // Regression: articles that arrive intact but will not decode into the file
    // the NZB filed them under must never be reported as a downloader problem.
    // That verdict tells the retry pipeline the connection is broken, and it
    // stops trying other releases for the item entirely.
    it("never reads a storm of undecodable articles as a downloader problem", () => {
        expect(classifyEngineNntpFailureKinds(Array(80).fill("article-unusable"))).toBe("content");
    });

    it("retains infrastructure classification through a failed partial-transfer finalize", () => {
        expect(
            classifyEngineRuntimeError(new FinalizeDownloadError("Repair failed."), ["timeout"]),
        ).toBe("infrastructure");
    });

    it("classifies disk exhaustion as infrastructure", () => {
        expect(
            classifyEngineRuntimeError(
                Object.assign(new Error("Disk full."), {
                    code: "ENOSPC",
                }),
            ),
        ).toBe("infrastructure");
    });
});

describe("fetching stage budget", () => {
    it.each([
        ["zero payload", 0, 30 * 60_000],
        ["negative payload", -1, 30 * 60_000],
        ["invalid payload", Number.NaN, 30 * 60_000],
        ["one gigabyte", 1024 * 1024 * 1024, 30 * 60_000 + 2_048_000],
    ] as const)("calculates the expected budget for %s", async (_label, totalBytes, expected) => {
        const { fetchingStageBudgetMs } = await import("./engine-runner");

        expect(fetchingStageBudgetMs(totalBytes)).toBe(expected);
    });

    it("honors DOWNLOAD_STAGE_BUDGET_MS as a hard replacement", async () => {
        vi.resetModules();
        vi.stubEnv("DOWNLOAD_STAGE_BUDGET_MS", "45000");

        try {
            const { fetchingStageBudgetMs } = await import("./engine-runner");

            expect(fetchingStageBudgetMs(10_000_000_000)).toBe(45_000);
        } finally {
            vi.unstubAllEnvs();
            vi.resetModules();
        }
    });
});
