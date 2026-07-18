import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rename: vi.fn(),
  copyFile: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  mocks.rename.mockImplementation(actual.rename);
  mocks.copyFile.mockImplementation(actual.copyFile);
  return {
    ...actual,
    rename: mocks.rename,
    copyFile: mocks.copyFile,
  };
});

import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

import { moveDownloadToOutput } from "./finalize-download";

function crossDeviceError() {
  const error = new Error("EXDEV: cross-device link not permitted") as NodeJS.ErrnoException;
  error.code = "EXDEV";
  return error;
}

let root: string;
let workDir: string;
let outputDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  mocks.rename.mockImplementation(actual.rename);
  mocks.copyFile.mockImplementation(actual.copyFile);
  root = await mkdtemp(path.join(os.tmpdir(), "nooklet-finalize-move-"));
  workDir = path.join(root, "work");
  outputDir = path.join(root, "complete", "download-1");
  await mkdir(path.join(workDir, "Sample"), { recursive: true });
  await writeFile(path.join(workDir, "movie.mkv"), "video-bytes");
  await writeFile(path.join(workDir, "Sample", "sample.mkv"), "sample-bytes");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("moveDownloadToOutput", () => {
  it("renames within the same filesystem without copying", async () => {
    await moveDownloadToOutput(workDir, outputDir);

    await expect(readFile(path.join(outputDir, "movie.mkv"), "utf8")).resolves.toBe("video-bytes");
    await expect(access(workDir)).rejects.toMatchObject({ code: "ENOENT" });
    expect(mocks.copyFile).not.toHaveBeenCalled();
  });

  it("copies the tree and removes the work directory when rename crosses filesystems", async () => {
    mocks.rename.mockRejectedValue(crossDeviceError());

    await moveDownloadToOutput(workDir, outputDir);

    await expect(readFile(path.join(outputDir, "movie.mkv"), "utf8")).resolves.toBe("video-bytes");
    await expect(readFile(path.join(outputDir, "Sample", "sample.mkv"), "utf8")).resolves.toBe("sample-bytes");
    await expect(access(workDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes the partial output tree and keeps the work directory when the copy fails", async () => {
    mocks.rename.mockRejectedValue(crossDeviceError());
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    // First file copies, then the filesystem "fills up".
    mocks.copyFile
      .mockImplementationOnce(actual.copyFile)
      .mockRejectedValue(Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" }));

    await expect(moveDownloadToOutput(workDir, outputDir)).rejects.toMatchObject({ code: "ENOSPC" });

    await expect(readFile(path.join(workDir, "movie.mkv"), "utf8")).resolves.toBe("video-bytes");
    await expect(readFile(path.join(workDir, "Sample", "sample.mkv"), "utf8")).resolves.toBe("sample-bytes");
    await expect(access(outputDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rethrows non-EXDEV rename failures without copying", async () => {
    mocks.rename.mockRejectedValue(
      Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }),
    );

    await expect(moveDownloadToOutput(workDir, outputDir)).rejects.toMatchObject({ code: "EACCES" });
    await expect(readFile(path.join(workDir, "movie.mkv"), "utf8")).resolves.toBe("video-bytes");
    await expect(access(outputDir)).rejects.toMatchObject({ code: "ENOENT" });
    expect(mocks.copyFile).not.toHaveBeenCalled();
  });
});
