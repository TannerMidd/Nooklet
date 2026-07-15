import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
  mkdir: vi.fn(),
  statfs: vi.fn(),
}));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
  createEngineDownload: vi.fn(),
  getActiveEngineDownloadRemainingBytes: vi.fn(),
}));
vi.mock("@/modules/download-engine/runtime/engine-runner", () => ({
  ensureEngineRunnerStarted: vi.fn(),
}));

import { mkdir, statfs } from "node:fs/promises";

import { env } from "@/lib/env";
import {
  createEngineDownload,
  getActiveEngineDownloadRemainingBytes,
} from "@/modules/download-engine/queue/engine-repository";
import { ensureEngineRunnerStarted } from "@/modules/download-engine/runtime/engine-runner";

import { enqueueNzbDownloadWorkflow } from "./enqueue-nzb-download";

const nzbXml = [
  '<nzb xmlns="http://www.newzbin.com/DTD/2003/nzb">',
  '<file poster="tester" date="1" subject="movie.mkv">',
  "<groups><group>alt.binaries.test</group></groups>",
  '<segments><segment bytes="1000" number="1">part@test</segment></segments>',
  "</file></nzb>",
].join("");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveEngineDownloadRemainingBytes).mockResolvedValue(0);
  vi.mocked(createEngineDownload).mockResolvedValue({
    id: "engine-1",
    name: "Movie",
    totalBytes: 1000,
    totalSegments: 1,
  } as never);
});

describe("enqueueNzbDownloadWorkflow", () => {
  it("rejects a download when safe download/unpack headroom is unavailable", async () => {
    vi.mocked(statfs).mockResolvedValue({ bavail: 100, bsize: 1024 } as never);

    const enqueue = enqueueNzbDownloadWorkflow("user-1", {
      name: "Movie",
      category: "movies",
      nzbXml,
    });

    await expect(enqueue).rejects.toThrow(
      /not enough free disk space.*data[\\/]downloads.*available.*required/i,
    );
    expect(createEngineDownload).not.toHaveBeenCalled();
  });

  it("persists and starts a download when capacity is available", async () => {
    vi.mocked(statfs).mockResolvedValue({ bavail: 20 * 1024 * 1024, bsize: 1024 } as never);

    await expect(enqueueNzbDownloadWorkflow("user-1", {
      name: "Movie",
      category: "movies",
      nzbXml,
    })).resolves.toMatchObject({ id: "engine-1" });
    expect(mkdir).toHaveBeenCalledWith(env.DOWNLOAD_ENGINE_DIR, { recursive: true });
    expect(statfs).toHaveBeenCalledWith(env.DOWNLOAD_ENGINE_DIR);
    expect(createEngineDownload).toHaveBeenCalledWith(expect.objectContaining({
      totalBytes: 1000,
      totalSegments: 1,
    }));
    expect(ensureEngineRunnerStarted).toHaveBeenCalled();
  });

  it("includes active downloads in the exact safe-capacity threshold", async () => {
    const activeRemainingBytes = 2_000;
    const requiredBytes = (512 * 1024 * 1024) + (activeRemainingBytes * 2) + (1_000 * 2);
    vi.mocked(getActiveEngineDownloadRemainingBytes).mockResolvedValue(activeRemainingBytes);
    vi.mocked(statfs).mockResolvedValue({ bavail: requiredBytes - 1, bsize: 1 } as never);

    await expect(enqueueNzbDownloadWorkflow("user-1", {
      name: "Movie",
      category: "movies",
      nzbXml,
    })).rejects.toThrow(/not enough free disk space/i);
    expect(createEngineDownload).not.toHaveBeenCalled();

    vi.mocked(statfs).mockResolvedValue({ bavail: requiredBytes, bsize: 1 } as never);

    await expect(enqueueNzbDownloadWorkflow("user-1", {
      name: "Movie",
      category: "movies",
      nzbXml,
    })).resolves.toMatchObject({ id: "engine-1" });
  });
});
