import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/modules/indexers/workflows/search-indexers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/indexers/workflows/search-indexers")>();
  return {
    ...actual,
    searchIndexersWorkflow: vi.fn(),
  };
});

import { auth } from "@/auth";
import { searchIndexersWorkflow } from "@/modules/indexers/workflows/search-indexers";

import { initialIndexerSearchActionState, searchIndexersAction } from "./actions";

const authMock = vi.mocked(auth);
const searchMock = vi.mocked(searchIndexersWorkflow);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchIndexersAction", () => {
  function validForm() {
    const form = new FormData();
    form.set("mediaType", "movie");
    form.set("query", "Arrival");
    return form;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);

    const result = await searchIndexersAction(initialIndexerSearchActionState, validForm());

    expect(result.status).toBe("error");
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("validates the submitted media type", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const form = validForm();
    form.set("mediaType", "music");

    const result = await searchIndexersAction(initialIndexerSearchActionState, form);

    expect(result.status).toBe("error");
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("returns safe search result metadata", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    searchMock.mockResolvedValue({
      searchRun: { id: "run1", status: "succeeded" },
      results: [{
        id: "result1",
        title: "Arrival 2016 1080p",
        mediaType: "movie",
        qualityLabel: "HD",
        sizeBytes: 123,
        publishedAt: new Date("2024-01-02T03:04:05Z"),
        seeders: 10,
        leechers: 2,
        grabs: 4,
      }],
    } as never);

    const result = await searchIndexersAction(initialIndexerSearchActionState, validForm());

    expect(searchMock).toHaveBeenCalledWith("u1", { mediaType: "movie", query: "Arrival" });
    expect(result).toMatchObject({
      status: "success",
      searchRunId: "run1",
      results: [{ id: "result1", publishedAt: "2024-01-02T03:04:05.000Z" }],
    });
    expect(JSON.stringify(result)).not.toContain("downloadUrl");
  });

  it("maps failed search runs to an error state", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    searchMock.mockResolvedValue({
      searchRun: { id: "run1", status: "failed", errorMessage: "No enabled indexers." },
      results: [],
    } as never);

    const result = await searchIndexersAction(initialIndexerSearchActionState, validForm());

    expect(result).toMatchObject({ status: "error", message: "No enabled indexers.", searchRunId: "run1" });
  });
});
