import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn(() => "saved-key"),
}));
vi.mock("@/modules/indexers/adapters/newznab", () => ({
  searchNewznabIndexer: vi.fn(),
}));
vi.mock("@/modules/indexers/commands/add-indexer", () => ({ addIndexerCommand: vi.fn() }));
vi.mock("@/modules/indexers/commands/update-indexer", () => ({ updateIndexerCommand: vi.fn() }));
vi.mock("@/modules/indexers/repositories/indexer-repository", () => ({
  findIndexerById: vi.fn(),
  findIndexerSecret: vi.fn(),
  updateIndexerConnectionStatus: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({ createAuditEvent: vi.fn() }));

import { searchNewznabIndexer } from "@/modules/indexers/adapters/newznab";
import { updateIndexerCommand } from "@/modules/indexers/commands/update-indexer";
import {
  findIndexerById,
  findIndexerSecret,
  updateIndexerConnectionStatus,
} from "@/modules/indexers/repositories/indexer-repository";

import { testAndSaveIndexer } from "./test-and-save-indexer";

const searchMock = vi.mocked(searchNewznabIndexer);
const updateMock = vi.mocked(updateIndexerCommand);
const findMock = vi.mocked(findIndexerById);
const secretMock = vi.mocked(findIndexerSecret);
const statusMock = vi.mocked(updateIndexerConnectionStatus);

const updateInput = {
  id: "indexer-1",
  name: "NZBGeek",
  protocol: "newznab" as const,
  baseUrl: "https://api.example.test",
  apiPath: "/api",
  apiKey: undefined,
  isEnabled: true,
  priority: 0,
  categories: [{ mediaType: "movie" as const, categoryId: "2000", label: "Movies" }],
};

describe("testAndSaveIndexer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMock.mockResolvedValue({ id: "indexer-1" } as never);
    secretMock.mockResolvedValue({ encryptedApiKey: "encrypted-key" } as never);
  });

  it("preserves the saved indexer when draft search fails", async () => {
    searchMock.mockRejectedValue(new Error("HTTP 401"));

    const result = await testAndSaveIndexer("user-1", updateInput);

    expect(result).toEqual({
      ok: false,
      message: "HTTP 401 Your saved indexer was not changed.",
      resultCount: 0,
    });
    expect(updateMock).not.toHaveBeenCalled();
    expect(statusMock).not.toHaveBeenCalled();
  });

  it("tests draft values before saving and marks the indexer verified", async () => {
    searchMock.mockResolvedValue([]);
    updateMock.mockResolvedValue({ id: "indexer-1" } as never);

    const result = await testAndSaveIndexer("user-1", updateInput);

    expect(searchMock).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "saved-key" }));
    expect(updateMock).toHaveBeenCalledWith("user-1", updateInput);
    expect(statusMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "indexer-1",
      status: "verified",
    }));
    expect(result).toEqual({ ok: true, message: "NZBGeek tested and saved.", resultCount: 0 });
  });
});
