import { beforeEach, describe, expect, it, vi } from "vitest";

// Keep the real error classes: the point of these tests is that a transport
// failure is never mistaken for a verdict about the release.
vi.mock("@/lib/security/safe-fetch", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/security/safe-fetch")>();

    return { ...actual, safeFetch: vi.fn() };
});
vi.mock("@/lib/security/secret-box", () => ({ decryptSecret: vi.fn((value: string) => value) }));
vi.mock("@/modules/download-engine/workflows/enqueue-nzb-download", async (importOriginal) => {
    const actual =
        await importOriginal<
            typeof import("@/modules/download-engine/workflows/enqueue-nzb-download")
        >();

    return { ...actual, enqueueNzbDownloadWorkflow: vi.fn() };
});
vi.mock("@/modules/download-engine/workflows/apply-engine-queue-action", () => ({
    applyEngineQueueAction: vi.fn(),
}));
vi.mock("@/modules/indexers/repositories/indexer-repository", () => ({
    findIndexerById: vi.fn(),
}));

import { SafeFetchAbortError, SsrfBlockedError, safeFetch } from "@/lib/security/safe-fetch";
import {
    EnqueueNzbDownloadError,
    enqueueNzbDownloadWorkflow,
} from "@/modules/download-engine/workflows/enqueue-nzb-download";
import { findIndexerById } from "@/modules/indexers/repositories/indexer-repository";
import { applyEngineQueueAction } from "@/modules/download-engine/workflows/apply-engine-queue-action";

import {
    compensateIndexerResultSubmission,
    submitIndexerResultToDownloadClient,
} from "./download-submission";

const fetchMock = vi.mocked(safeFetch);
const findIndexerMock = vi.mocked(findIndexerById);
const enqueueMock = vi.mocked(enqueueNzbDownloadWorkflow);
const applyEngineActionMock = vi.mocked(applyEngineQueueAction);

const resolvedResult = {
    result: {
        id: "result-1",
        indexerId: "indexer-1",
        userId: "user-1",
        mediaType: "movie",
        title: "Arrival.2016.1080p",
    },
    secret: { encryptedDownloadUrl: "https://indexer.test/api?t=get&id=1" },
    indexerProtocol: "newznab",
} as never;

beforeEach(() => {
    vi.clearAllMocks();
});

describe("download submission", () => {
    it("does not fetch a built-in-engine NZB from a host other than the supplying indexer", async () => {
        findIndexerMock.mockResolvedValue({ baseUrl: "https://indexer.test" } as never);
        const hostileResult = {
            result: {
                id: "result-1",
                indexerId: "indexer-1",
                userId: "user-1",
                mediaType: "movie",
                title: "Arrival.2016.1080p",
            },
            secret: { encryptedDownloadUrl: "http://127.0.0.1:3000/internal" },
            indexerProtocol: "newznab",
        } as never;

        await expect(submitIndexerResultToDownloadClient(hostileResult)).rejects.toMatchObject({
            code: "indexer_unavailable",
            // Both origins are named so the activity list shows a configuration
            // fault instead of something indistinguishable from a dead release.
            message: expect.stringContaining("http://127.0.0.1:3000"),
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fetches and enqueues a same-origin indexer NZB", async () => {
        findIndexerMock.mockResolvedValue({ baseUrl: "https://indexer.test/newznab" } as never);
        fetchMock.mockResolvedValue({
            ok: true,
            text: vi.fn().mockResolvedValue("<nzb />"),
        } as never);
        enqueueMock.mockResolvedValue({ id: "engine-1" } as never);

        await expect(submitIndexerResultToDownloadClient(resolvedResult)).resolves.toEqual({
            queueIds: ["engine-1"],
            category: "movies",
        });
        expect(fetchMock).toHaveBeenCalledWith(
            "https://indexer.test/api?t=get&id=1",
            expect.objectContaining({ maxBytes: 50 * 1024 * 1024 }),
        );
    });

    it("classifies an invalid NZB as release-specific", async () => {
        findIndexerMock.mockResolvedValue({ baseUrl: "https://indexer.test" } as never);
        fetchMock.mockResolvedValue({
            ok: true,
            text: vi.fn().mockResolvedValue("<broken />"),
        } as never);
        enqueueMock.mockRejectedValue(new EnqueueNzbDownloadError("invalid_nzb", "Invalid NZB."));

        await expect(submitIndexerResultToDownloadClient(resolvedResult)).rejects.toMatchObject({
            code: "release_unavailable",
        });
    });

    // `release_unavailable` leaves a durable exclusion and spends a candidate
    // attempt; `indexer_unavailable` discards the reservation and costs nothing.
    // Nothing below reached a usable answer from the indexer, so none of it may
    // be recorded as a verdict about the release.
    describe.each([
        // undici collapses every socket/DNS/TLS error into this exact shape.
        ["a reset connection", new TypeError("fetch failed")],
        [
            "a request timeout",
            new SafeFetchAbortError("timeout", "The request timed out after 60s."),
        ],
        // NZB download URLs very commonly redirect, which safeFetch refuses.
        [
            "a refused redirect",
            new SsrfBlockedError("Refusing to follow redirect to https://cdn.test/x.nzb"),
        ],
    ])("when the NZB fetch fails with %s", (_label, failure) => {
        it("blames the indexer, not the release", async () => {
            findIndexerMock.mockResolvedValue({ baseUrl: "https://indexer.test" } as never);
            fetchMock.mockRejectedValue(failure);

            await expect(submitIndexerResultToDownloadClient(resolvedResult)).rejects.toMatchObject(
                { code: "indexer_unavailable" },
            );
            expect(enqueueMock).not.toHaveBeenCalled();
        });
    });

    it.each([
        [404, "release_unavailable"],
        [410, "release_unavailable"],
        [429, "indexer_unavailable"],
        [503, "indexer_unavailable"],
    ])("maps HTTP %i on the NZB download to %s", async (status, code) => {
        findIndexerMock.mockResolvedValue({ baseUrl: "https://indexer.test" } as never);
        fetchMock.mockResolvedValue({ ok: false, status } as never);

        await expect(submitIndexerResultToDownloadClient(resolvedResult)).rejects.toMatchObject({
            code,
        });
    });

    // Served as HTTP 200, so without detection these reach parseNzb, fail there,
    // and are recorded as `invalid_nzb` -> release_unavailable. A day spent at
    // the API cap would blocklist every candidate the user searched for.
    it.each([
        [
            "an exhausted grab quota",
            `<error code="910" description="Request limit reached"/>`,
            "910",
        ],
        [
            "rejected credentials",
            `<error code="100" description="Incorrect user credentials"/>`,
            "100",
        ],
        ["an HTML error page", `<!DOCTYPE html><html><body>Forbidden</body></html>`, "HTML"],
    ])("does not blame the release when the indexer returns %s", async (_label, body, expected) => {
        findIndexerMock.mockResolvedValue({ baseUrl: "https://indexer.test" } as never);
        fetchMock.mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue(body) } as never);

        await expect(submitIndexerResultToDownloadClient(resolvedResult)).rejects.toMatchObject({
            code: "indexer_unavailable",
            message: expect.stringContaining(expected),
        });
        expect(enqueueMock).not.toHaveBeenCalled();
    });

    it("preserves structured disk-capacity details for release selection", async () => {
        findIndexerMock.mockResolvedValue({ baseUrl: "https://indexer.test" } as never);
        fetchMock.mockResolvedValue({
            ok: true,
            text: vi.fn().mockResolvedValue("<nzb />"),
        } as never);
        enqueueMock.mockRejectedValue(
            new EnqueueNzbDownloadError(
                "insufficient_space",
                "There is not enough free disk space.",
                {
                    availableBytes: 10_000,
                    filesystemCapacityBytes: 100_000,
                    requiredBytes: 20_000,
                    activeReservationBytes: 12_000,
                    activeRemainingBytes: 5_000,
                    activeDownloadedBytes: 2_000,
                },
            ),
        );

        await expect(submitIndexerResultToDownloadClient(resolvedResult)).rejects.toMatchObject({
            code: "download_capacity_exceeded",
            capacity: {
                availableBytes: 10_000,
                filesystemCapacityBytes: 100_000,
                requiredBytes: 20_000,
                activeReservationBytes: 12_000,
                activeRemainingBytes: 5_000,
                activeDownloadedBytes: 2_000,
            },
        });
    });

    it("classifies stale or unavailable storage telemetry as retryable infrastructure", async () => {
        findIndexerMock.mockResolvedValue({ baseUrl: "https://indexer.test" } as never);
        fetchMock.mockResolvedValue({
            ok: true,
            text: vi.fn().mockResolvedValue("<nzb />"),
        } as never);
        enqueueMock.mockRejectedValue(
            new EnqueueNzbDownloadError(
                "storage_unavailable",
                "The latest work storage check is stale.",
            ),
        );

        await expect(submitIndexerResultToDownloadClient(resolvedResult)).rejects.toMatchObject({
            code: "download_capacity_exceeded",
            capacity: null,
            message: "The latest work storage check is stale.",
        });
    });

    it("removes native jobs during persistence compensation", async () => {
        await compensateIndexerResultSubmission("user-1", {
            queueIds: ["engine-1", "engine-2"],
            category: "movies",
        });

        expect(applyEngineActionMock).toHaveBeenCalledTimes(2);
        expect(applyEngineActionMock).toHaveBeenNthCalledWith(1, "user-1", {
            type: "remove",
            itemId: "engine-1",
        });
    });
});
