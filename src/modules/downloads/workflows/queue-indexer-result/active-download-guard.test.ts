import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  findActiveDownloadRequestForItem: vi.fn(),
}));

import { findActiveDownloadRequestForItem } from "@/modules/downloads/repositories/download-repository";

import { ensureNoActiveDownloadRequest } from "./active-download-guard";
import { QueueIndexerResultWorkflowError } from "./errors";

const findActiveMock = vi.mocked(findActiveDownloadRequestForItem);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureNoActiveDownloadRequest", () => {
  it("allows queueing search results that are not attached to a library item", async () => {
    await expect(ensureNoActiveDownloadRequest("u1", {
      resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9",
    })).resolves.toBeUndefined();

    expect(findActiveMock).not.toHaveBeenCalled();
  });

  it("blocks queueing when the library item already has an active download", async () => {
    findActiveMock.mockResolvedValue({ id: "request1" } as never);

    await expect(ensureNoActiveDownloadRequest("u1", {
      resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9",
      mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
      episodeId: "7f3f45c2-8ebd-40c5-9ce5-2f3283c20c08",
    })).rejects.toMatchObject({
      code: "active_download_exists",
      message: "This library item already has an active download in progress.",
    } satisfies Partial<QueueIndexerResultWorkflowError>);

    expect(findActiveMock).toHaveBeenCalledWith({
      userId: "u1",
      mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
      episodeId: "7f3f45c2-8ebd-40c5-9ce5-2f3283c20c08",
      seasonId: null,
    });
  });
});