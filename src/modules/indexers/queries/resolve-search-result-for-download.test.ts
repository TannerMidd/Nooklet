import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/indexers/repositories/indexer-repository", () => ({
  findSearchResultById: vi.fn(),
  findSearchResultSecret: vi.fn(),
}));

import {
  findSearchResultById,
  findSearchResultSecret,
} from "@/modules/indexers/repositories/indexer-repository";

import { resolveSearchResultForDownload } from "./resolve-search-result-for-download";

const findResultMock = vi.mocked(findSearchResultById);
const findSecretMock = vi.mocked(findSearchResultSecret);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveSearchResultForDownload", () => {
  it("returns null when the result does not belong to the user", async () => {
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

  it("returns the result and encrypted download URL secret", async () => {
    findResultMock.mockResolvedValue({ id: "result1", title: "Arrival" } as never);
    findSecretMock.mockResolvedValue({ resultId: "result1", encryptedDownloadUrl: "encrypted" } as never);

    const result = await resolveSearchResultForDownload("user1", "result1");

    expect(result).toMatchObject({
      result: { id: "result1", title: "Arrival" },
      secret: { resultId: "result1", encryptedDownloadUrl: "encrypted" },
    });
  });
});
