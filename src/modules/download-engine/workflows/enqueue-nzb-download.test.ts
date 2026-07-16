import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
  mkdir: vi.fn(),
  statfs: vi.fn(),
}));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
  createEngineDownloadWithCapacityReservation: vi.fn(),
}));
vi.mock("@/modules/download-engine/runtime/engine-runner", () => ({
  ensureEngineRunnerStarted: vi.fn(),
}));

import { mkdir, statfs } from "node:fs/promises";

import { env } from "@/lib/env";
import {
  createEngineDownloadWithCapacityReservation,
} from "@/modules/download-engine/queue/engine-repository";
import { ensureEngineRunnerStarted } from "@/modules/download-engine/runtime/engine-runner";

import {
  EnqueueNzbDownloadError,
  enqueueNzbDownloadWorkflow,
} from "./enqueue-nzb-download";

const nzbXml = [
  '<nzb xmlns="http://www.newzbin.com/DTD/2003/nzb">',
  '<file poster="tester" date="1" subject="movie.mkv">',
  "<groups><group>alt.binaries.test</group></groups>",
  '<segments><segment bytes="1000" number="1">part@test</segment></segments>',
  "</file></nzb>",
].join("");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createEngineDownloadWithCapacityReservation).mockResolvedValue({
    created: true,
    record: {
      id: "engine-1",
      name: "Movie",
      totalBytes: 1000,
      totalSegments: 1,
    },
    activeRemainingBytes: 0,
    activeWorkspaceBytes: 0,
    requiredBytes: (512 * 1024 * 1024) + 2_000,
  } as never);
});

describe("enqueueNzbDownloadWorkflow", () => {
  it("rejects a download when safe download/unpack headroom is unavailable", async () => {
    vi.mocked(statfs).mockResolvedValue({
      bavail: 100,
      bsize: 1024,
      blocks: 2 * 1024 * 1024,
    } as never);
    vi.mocked(createEngineDownloadWithCapacityReservation).mockResolvedValue({
      created: false,
      activeRemainingBytes: 0,
      activeWorkspaceBytes: 0,
      requiredBytes: (512 * 1024 * 1024) + 2_000,
    });

    const enqueue = enqueueNzbDownloadWorkflow("user-1", {
      name: "Movie",
      category: "movies",
      nzbXml,
    });

    await expect(enqueue).rejects.toMatchObject({
      code: "insufficient_space",
      message: expect.stringMatching(
        /not enough free disk space.*data[\\/]downloads.*available.*required/i,
      ),
      capacity: {
        availableBytes: 100 * 1024,
        filesystemCapacityBytes: 2 * 1024 * 1024 * 1024,
        requiredBytes: (512 * 1024 * 1024) + 2_000,
        activeReservationBytes: 0,
        activeRemainingBytes: 0,
        activeDownloadedBytes: 0,
      },
    } satisfies Partial<EnqueueNzbDownloadError>);
    expect(ensureEngineRunnerStarted).not.toHaveBeenCalled();
  });

  it("persists and starts a download when capacity is available", async () => {
    vi.mocked(statfs).mockResolvedValue({
      bavail: 20 * 1024 * 1024,
      bsize: 1024,
      blocks: 30 * 1024 * 1024,
    } as never);

    await expect(enqueueNzbDownloadWorkflow("user-1", {
      name: "Movie",
      category: "movies",
      nzbXml,
    })).resolves.toMatchObject({ id: "engine-1" });
    expect(mkdir).toHaveBeenCalledWith(env.DOWNLOAD_ENGINE_DIR, { recursive: true });
    expect(statfs).toHaveBeenCalledWith(env.DOWNLOAD_ENGINE_DIR);
    expect(createEngineDownloadWithCapacityReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        totalBytes: 1000,
        totalSegments: 1,
      }),
      {
        availableBytes: 20 * 1024 * 1024 * 1024,
        minimumFreeSpaceReserveBytes: 512 * 1024 * 1024,
        workspaceMultiplier: 2,
      },
    );
    expect(ensureEngineRunnerStarted).toHaveBeenCalled();
  });

  it("reports the exact transaction-time capacity requirement", async () => {
    const activeRemainingBytes = 2_000;
    const activeWorkspaceBytes = 6_000;
    const requiredBytes = (512 * 1024 * 1024) + activeWorkspaceBytes + (1_000 * 2);
    vi.mocked(statfs).mockResolvedValue({
      bavail: requiredBytes - 1,
      bsize: 1,
      blocks: requiredBytes * 2,
    } as never);
    vi.mocked(createEngineDownloadWithCapacityReservation).mockResolvedValueOnce({
      created: false,
      activeRemainingBytes,
      activeWorkspaceBytes,
      requiredBytes,
    });

    await expect(enqueueNzbDownloadWorkflow("user-1", {
      name: "Movie",
      category: "movies",
      nzbXml,
    })).rejects.toMatchObject({
      code: "insufficient_space",
      capacity: {
        availableBytes: requiredBytes - 1,
        filesystemCapacityBytes: requiredBytes * 2,
        requiredBytes,
        activeReservationBytes: activeWorkspaceBytes,
        activeRemainingBytes,
        activeDownloadedBytes: activeWorkspaceBytes - (activeRemainingBytes * 2),
      },
    });

    vi.mocked(statfs).mockResolvedValue({
      bavail: requiredBytes,
      bsize: 1,
      blocks: requiredBytes * 2,
    } as never);
    vi.mocked(createEngineDownloadWithCapacityReservation).mockResolvedValueOnce({
      created: true,
      record: {
        id: "engine-1",
        name: "Movie",
        totalBytes: 1000,
        totalSegments: 1,
      },
      activeRemainingBytes,
      activeWorkspaceBytes,
      requiredBytes,
    } as never);

    await expect(enqueueNzbDownloadWorkflow("user-1", {
      name: "Movie",
      category: "movies",
      nzbXml,
    })).resolves.toMatchObject({ id: "engine-1" });
  });
});
