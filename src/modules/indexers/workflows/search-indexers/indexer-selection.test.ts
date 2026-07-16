import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/indexers/repositories/indexer-repository", () => ({
  listEnabledIndexersForMedia: vi.fn(),
  listIndexerMediaCategories: vi.fn(),
}));

import {
  listEnabledIndexersForMedia,
  listIndexerMediaCategories,
} from "@/modules/indexers/repositories/indexer-repository";

import { selectIndexerSearchSources } from "./indexer-selection";

const listIndexersMock = vi.mocked(listEnabledIndexersForMedia);
const listCategoriesMock = vi.mocked(listIndexerMediaCategories);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("selectIndexerSearchSources", () => {
  it("excludes Torznab sources because Nooklet can only submit Usenet releases", async () => {
    listIndexersMock.mockResolvedValue([
      { id: "torrent-1", protocol: "torznab" },
      { id: "usenet-1", protocol: "newznab" },
    ] as never);
    listCategoriesMock.mockResolvedValue([
      { categoryId: "5000" },
    ] as never);

    const sources = await selectIndexerSearchSources("user-1", {
      mediaType: "tv",
      query: "Severance",
      normalizedKey: "severance",
    });

    expect(sources).toEqual([
      expect.objectContaining({
        indexer: expect.objectContaining({ id: "usenet-1", protocol: "newznab" }),
        categories: ["5000"],
      }),
    ]);
    expect(listCategoriesMock).toHaveBeenCalledTimes(1);
    expect(listCategoriesMock).toHaveBeenCalledWith("usenet-1", "tv");
  });
});
