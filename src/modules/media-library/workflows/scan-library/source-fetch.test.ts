import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { type Dirent, type Stats } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { type ActiveMediaLibraryPathRecord } from "@/modules/media-library/repositories/media-library-repository";

import { fetchLibrarySourceFiles } from "./source-fetch";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
}));

const readdirMock = vi.mocked(readdir);
const statMock = vi.mocked(stat);

type ReaddirMock = {
  mockImplementation: (implementation: (target: Parameters<typeof readdir>[0]) => Promise<Dirent[]>) => void;
};

const readdirWithFileTypesMock = readdirMock as unknown as ReaddirMock;

function dirent(name: string, kind: "directory" | "file") {
  return {
    name,
    isDirectory: () => kind === "directory",
    isFile: () => kind === "file",
  } as Dirent;
}

function directoryStats() {
  return { isDirectory: () => true } as Stats;
}

function fileStats() {
  return {
    size: 42,
    mtime: new Date("2026-05-06T13:00:00Z"),
  } as Stats;
}

function source(rootPath: string): ActiveMediaLibraryPathRecord {
  return {
    library: {
      id: "library1",
      userId: "user1",
      mediaType: "tv",
      name: "TV Shows",
      isDefault: true,
      createdAt: new Date("2026-05-06T12:00:00Z"),
      updatedAt: new Date("2026-05-06T12:00:00Z"),
    },
    path: {
      id: "path1",
      libraryId: "library1",
      userId: "user1",
      path: rootPath,
      label: "TV",
      status: "active",
      freeSpaceBytes: null,
      totalSpaceBytes: null,
      lastScannedAt: null,
      createdAt: new Date("2026-05-06T12:00:00Z"),
      updatedAt: new Date("2026-05-06T12:00:00Z"),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchLibrarySourceFiles", () => {
  it("walks library paths containing spaces", async () => {
    const rootPath = path.join("E:\\", "Plex Media", "TV Shows");
    const showPath = path.join(rootPath, "George Lopez");
    const seasonPath = path.join(showPath, "Season 03");
    const episodePath = path.join(seasonPath, "George.Lopez.S03E11.1080p.WEB.h264-SKYFiRE.mkv");

    statMock.mockResolvedValue(fileStats());
    statMock.mockResolvedValueOnce(directoryStats());
    readdirWithFileTypesMock.mockImplementation(async (target) => {
      if (target === rootPath) {
        return [dirent("George Lopez", "directory")];
      }

      if (target === showPath) {
        return [dirent("Season 03", "directory")];
      }

      if (target === seasonPath) {
        return [dirent("George.Lopez.S03E11.1080p.WEB.h264-SKYFiRE.mkv", "file")];
      }

      return [];
    });

    const result = await fetchLibrarySourceFiles({ request: {}, sources: [source(rootPath)] });

    expect(result.failedPaths).toEqual([]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.filePath).toBe(episodePath);
    expect(result.files[0]?.relativePath).toBe("George Lopez/Season 03/George.Lopez.S03E11.1080p.WEB.h264-SKYFiRE.mkv");
  });

  it("skips unreadable media files without failing the whole library path", async () => {
    const rootPath = path.join("E:\\", "Plex Media", "TV Shows");
    const showPath = path.join(rootPath, "George Lopez");
    const goodEpisode = path.join(showPath, "George.Lopez.S03E11.1080p.WEB.h264-SKYFiRE.mkv");
    const badEpisode = path.join(showPath, "George.Lopez.S03E10.1080p.WEB.h264-SKYFiRE.mkv");

    statMock.mockImplementation(async (target) => {
      if (target === rootPath) {
        return directoryStats();
      }

      if (target === badEpisode) {
        throw new Error("UNKNOWN: unknown error");
      }

      return fileStats();
    });
    readdirWithFileTypesMock.mockImplementation(async (target) => {
      if (target === rootPath) {
        return [dirent("George Lopez", "directory")];
      }

      if (target === showPath) {
        return [
          dirent("George.Lopez.S03E10.1080p.WEB.h264-SKYFiRE.mkv", "file"),
          dirent("George.Lopez.S03E11.1080p.WEB.h264-SKYFiRE.mkv", "file"),
        ];
      }

      return [];
    });

    const result = await fetchLibrarySourceFiles({ request: {}, sources: [source(rootPath)] });

    expect(result.failedPaths).toEqual([]);
    expect(result.files.map((file) => file.filePath)).toEqual([goodEpisode]);
  });
});
