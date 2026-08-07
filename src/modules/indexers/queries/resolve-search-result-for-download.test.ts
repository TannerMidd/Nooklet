import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/indexers/repositories/indexer-repository", () => ({
    findIndexerById: vi.fn(),
    findUnexpiredSearchResultById: vi.fn(),
    findSearchResultSecret: vi.fn(),
}));

import {
    findIndexerById,
    findUnexpiredSearchResultById,
    findSearchResultSecret,
} from "@/modules/indexers/repositories/indexer-repository";

import { resolveSearchResultForDownload } from "./resolve-search-result-for-download";

const findResultMock = vi.mocked(findUnexpiredSearchResultById);
const findSecretMock = vi.mocked(findSearchResultSecret);
const findIndexerMock = vi.mocked(findIndexerById);

beforeEach(() => {
    vi.clearAllMocks();
});

describe("resolveSearchResultForDownload", () => {
    it("returns null when the result does not belong to the user or has expired", async () => {
        findResultMock.mockResolvedValue(null);

        const result = await resolveSearchResultForDownload("user1", "result1");

        expect(result).toBeNull();
        expect(findSecretMock).not.toHaveBeenCalled();
    });

    it("returns null when the encrypted download URL is unavailable", async () => {
        findResultMock.mockResolvedValue({ id: "result1" } as never);
        findSecretMock.mockResolvedValue(null);

        const result = await resolveSearchResultForDownload("user1", "result1");

        expect(result).toBeNull();
        expect(findSecretMock).toHaveBeenCalledWith("result1");
    });

    it("returns null when the indexer no longer exists", async () => {
        findResultMock.mockResolvedValue({ id: "result1", indexerId: "indexer1" } as never);
        findSecretMock.mockResolvedValue({
            resultId: "result1",
            encryptedDownloadUrl: "encrypted",
        } as never);
        findIndexerMock.mockResolvedValue(null);

        const result = await resolveSearchResultForDownload("user1", "result1");

        expect(result).toBeNull();
        expect(findIndexerMock).toHaveBeenCalledWith("user1", "indexer1");
    });

    it("returns the result, encrypted download URL secret, and indexer protocol", async () => {
        findResultMock.mockResolvedValue({
            id: "result1",
            title: "Arrival",
            indexerId: "indexer1",
        } as never);
        findSecretMock.mockResolvedValue({
            resultId: "result1",
            encryptedDownloadUrl: "encrypted",
        } as never);
        findIndexerMock.mockResolvedValue({ id: "indexer1", protocol: "newznab" } as never);

        const result = await resolveSearchResultForDownload("user1", "result1");

        expect(result).toMatchObject({
            result: { id: "result1", title: "Arrival" },
            secret: { resultId: "result1", encryptedDownloadUrl: "encrypted" },
            indexerProtocol: "newznab",
        });
    });
});
