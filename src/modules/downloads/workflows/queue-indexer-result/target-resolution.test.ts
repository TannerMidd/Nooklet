import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/media-library/queries/list-media-library-path-options", () => ({
  resolveMediaLibraryDownloadTarget: vi.fn(),
}));

import { resolveMediaLibraryDownloadTarget } from "@/modules/media-library/queries/list-media-library-path-options";

import { QueueIndexerResultWorkflowError } from "./errors";
import { resolveQueueIndexerResultTarget } from "./target-resolution";

const resolveTargetMock = vi.mocked(resolveMediaLibraryDownloadTarget);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveQueueIndexerResultTarget", () => {
  it("skips target resolution when no path was selected", async () => {
    const target = await resolveQueueIndexerResultTarget(
      "u1",
      { resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9" },
      { result: { mediaType: "movie" } } as never,
    );

    expect(target).toBeNull();
    expect(resolveTargetMock).not.toHaveBeenCalled();
  });

  it("resolves the selected path for the result media type", async () => {
    const resolvedTarget = { path: { id: "path1" }, library: { id: "library1" } };
    resolveTargetMock.mockResolvedValue(resolvedTarget as never);

    const target = await resolveQueueIndexerResultTarget(
      "u1",
      {
        resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9",
        targetLibraryId: "library1",
        targetLibraryPathId: "0ca60f81-387b-47d0-a9d2-571e8dd7a44d",
      },
      { result: { mediaType: "movie" } } as never,
    );

    expect(resolveTargetMock).toHaveBeenCalledWith("u1", {
      pathId: "0ca60f81-387b-47d0-a9d2-571e8dd7a44d",
      mediaType: "movie",
      libraryId: "library1",
    });
    expect(target).toBe(resolvedTarget);
  });

  it("throws a typed workflow error when the selected path is invalid", async () => {
    resolveTargetMock.mockResolvedValue(null);

    await expect(resolveQueueIndexerResultTarget(
      "u1",
      {
        resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9",
        targetLibraryPathId: "0ca60f81-387b-47d0-a9d2-571e8dd7a44d",
      },
      { result: { mediaType: "tv" } } as never,
    )).rejects.toMatchObject({
      code: "target_path_not_found",
    } satisfies Partial<QueueIndexerResultWorkflowError>);
  });
});
