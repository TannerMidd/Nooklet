import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/sabnzbd", () => ({
  addSabnzbdUrlToQueue: vi.fn(),
  removeSabnzbdQueueItem: vi.fn(),
}));
vi.mock("@/lib/security/safe-fetch", () => ({ safeFetch: vi.fn() }));
vi.mock("@/lib/security/secret-box", () => ({ decryptSecret: vi.fn((value: string) => value) }));
vi.mock("@/modules/download-engine/workflows/enqueue-nzb-download", async (importOriginal) => {
  const actual = await importOriginal<
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

import { addSabnzbdUrlToQueue, removeSabnzbdQueueItem } from "@/lib/integrations/sabnzbd";
import { safeFetch } from "@/lib/security/safe-fetch";
import {
  EnqueueNzbDownloadError,
  enqueueNzbDownloadWorkflow,
} from "@/modules/download-engine/workflows/enqueue-nzb-download";
import { findIndexerById } from "@/modules/indexers/repositories/indexer-repository";

import {
  compensateIndexerResultSubmission,
  submitIndexerResultToDownloadClient,
} from "./download-submission";

const addMock = vi.mocked(addSabnzbdUrlToQueue);
const removeMock = vi.mocked(removeSabnzbdQueueItem);
const fetchMock = vi.mocked(safeFetch);
const findIndexerMock = vi.mocked(findIndexerById);
const enqueueMock = vi.mocked(enqueueNzbDownloadWorkflow);

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
  it("rejects SABnzbd acknowledgements that contain no trackable queue id", async () => {
    addMock.mockResolvedValue({ queueIds: [] } as never);

    await expect(submitIndexerResultToDownloadClient(
      resolvedResult,
      {
        kind: "sabnzbd",
        client: { id: "client-1" },
        baseUrl: "http://sab",
        apiKey: "secret",
      } as never,
    )).rejects.toMatchObject({ code: "sabnzbd_enqueue_failed" });
  });

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

    await expect(submitIndexerResultToDownloadClient(
      hostileResult,
      { kind: "nooklet", client: { id: "client-1" } } as never,
    )).rejects.toThrow(/unapproved host/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches and enqueues a same-origin indexer NZB", async () => {
    findIndexerMock.mockResolvedValue({ baseUrl: "https://indexer.test/newznab" } as never);
    fetchMock.mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("<nzb />"),
    } as never);
    enqueueMock.mockResolvedValue({ id: "engine-1" } as never);

    await expect(submitIndexerResultToDownloadClient(
      resolvedResult,
      { kind: "nooklet", client: { id: "client-1" } } as never,
    )).resolves.toEqual({ queueIds: ["engine-1"], category: "movies" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://indexer.test/api?t=get&id=1",
      expect.objectContaining({ maxBytes: 50 * 1024 * 1024 }),
    );
  });

  it("classifies an invalid NZB as release-specific", async () => {
    findIndexerMock.mockResolvedValue({ baseUrl: "https://indexer.test" } as never);
    fetchMock.mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue("<broken />") } as never);
    enqueueMock.mockRejectedValue(new EnqueueNzbDownloadError("invalid_nzb", "Invalid NZB."));

    await expect(submitIndexerResultToDownloadClient(
      resolvedResult,
      { kind: "nooklet", client: { id: "client-1" } } as never,
    )).rejects.toMatchObject({ code: "release_unavailable" });
  });

  it("preserves structured disk-capacity details for release selection", async () => {
    findIndexerMock.mockResolvedValue({ baseUrl: "https://indexer.test" } as never);
    fetchMock.mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue("<nzb />") } as never);
    enqueueMock.mockRejectedValue(new EnqueueNzbDownloadError(
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
    ));

    await expect(submitIndexerResultToDownloadClient(
      resolvedResult,
      { kind: "nooklet", client: { id: "client-1" } } as never,
    )).rejects.toMatchObject({
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
    fetchMock.mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue("<nzb />") } as never);
    enqueueMock.mockRejectedValue(new EnqueueNzbDownloadError(
      "storage_unavailable",
      "The latest work storage check is stale.",
    ));

    await expect(submitIndexerResultToDownloadClient(
      resolvedResult,
      { kind: "nooklet", client: { id: "client-1" } } as never,
    )).rejects.toMatchObject({
      code: "download_capacity_exceeded",
      capacity: null,
      message: "The latest work storage check is stale.",
    });
  });

  it("removes SABnzbd jobs during persistence compensation", async () => {
    await compensateIndexerResultSubmission(
      "user-1",
      {
        kind: "sabnzbd",
        client: { id: "client-1" },
        baseUrl: "http://sab",
        apiKey: "secret",
      } as never,
      { queueIds: ["nzo-1", "nzo-2"], category: "movies" },
    );

    expect(removeMock).toHaveBeenCalledTimes(2);
    expect(removeMock).toHaveBeenNthCalledWith(1, {
      baseUrl: "http://sab",
      apiKey: "secret",
      itemId: "nzo-1",
    });
  });
});
