import path from "node:path";
import { lstat, readFile, readdir, stat } from "node:fs/promises";
import { type Dirent, type Stats } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { importDestinationClaimPath } from "@/modules/downloads/workflows/import-completed-downloads/import-journal";
import { type ActiveMediaLibraryPathRecord } from "@/modules/media-library/repositories/media-library-repository";

import { fetchLibrarySourceFiles } from "./source-fetch";

vi.mock("node:fs/promises", () => ({
    lstat: vi.fn(),
    readFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
}));
vi.mock("@/lib/security/filesystem-policy", () => ({
    resolveApprovedMediaDirectory: vi.fn((candidate: string) => candidate),
}));

const readdirMock = vi.mocked(readdir);
const lstatMock = vi.mocked(lstat);
const readFileMock = vi.mocked(readFile);
const statMock = vi.mocked(stat);

type ReaddirMock = {
    mockImplementation: (
        implementation: (target: Parameters<typeof readdir>[0]) => Promise<Dirent[]>,
    ) => void;
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
            isDownloadDefault: false,
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
    lstatMock.mockReset();
    lstatMock.mockRejectedValue(
        Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" }),
    );
    readFileMock.mockReset();
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
        expect(result.files[0]?.relativePath).toBe(
            "George Lopez/Season 03/George.Lopez.S03E11.1080p.WEB.h264-SKYFiRE.mkv",
        );
        expect(lstatMock).toHaveBeenCalledExactlyOnceWith(importDestinationClaimPath(episodePath));
        expect(readdirMock.mock.invocationCallOrder.at(-1)).toBeLessThan(
            lstatMock.mock.invocationCallOrder[0]!,
        );
        expect(lstatMock.mock.invocationCallOrder[0]).toBeLessThan(
            statMock.mock.invocationCallOrder[1]!,
        );
        expect(readFileMock).not.toHaveBeenCalled();
    });

    it("notices a claim appearing after enumeration and discards earlier files from that source", async () => {
        const rootPath = path.join("E:\\", "Plex Media", "TV Shows");
        const earlierEpisode = path.join(rootPath, "Earlier.mkv");
        const claimedEpisode = path.join(rootPath, "Importing.mkv");
        const claimPath = importDestinationClaimPath(claimedEpisode);
        const events: string[] = [];
        let claimExists = false;

        readdirWithFileTypesMock.mockImplementation(async () => {
            events.push("enumerated");

            return [dirent("Earlier.mkv", "file"), dirent("Importing.mkv", "file")];
        });
        statMock.mockImplementation(async (target) => {
            if (target === rootPath) {
                return directoryStats();
            }

            events.push(`stat:${String(target)}`);
            claimExists = true;

            return fileStats();
        });
        lstatMock.mockImplementation(async (target) => {
            events.push(`lstat:${String(target)}`);

            if (target === claimPath && claimExists) {
                return fileStats();
            }

            throw Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
        });

        const librarySource = source(rootPath);
        const result = await fetchLibrarySourceFiles({ request: {}, sources: [librarySource] });

        expect(events).toEqual([
            "enumerated",
            `lstat:${importDestinationClaimPath(earlierEpisode)}`,
            `stat:${earlierEpisode}`,
            `lstat:${claimPath}`,
        ]);
        expect(statMock).not.toHaveBeenCalledWith(claimedEpisode);
        expect(result.files).toEqual([]);
        expect(result.failedPaths).toEqual([
            {
                source: librarySource,
                errorMessage: `Library file has an outstanding import claim: ${claimedEpisode}`,
            },
        ]);
    });

    it.each([
        { name: "pending", kind: "file", contents: '{"state":"publishing"}' },
        { name: "malformed", kind: "file", contents: "not json" },
        { name: "committed but uncleaned", kind: "file", contents: '{"state":"db-committed"}' },
        { name: "unreadable", kind: "file", contents: null },
        { name: "symlink", kind: "symlink", contents: null },
        { name: "directory", kind: "directory", contents: null },
    ])(
        "fails the whole source for an existing $name claim without reading it",
        async ({ kind, contents }) => {
            const rootPath = path.join("E:\\", "Plex Media", "TV Shows");
            const episodePath = path.join(rootPath, "Importing.mkv");
            const librarySource = source(rootPath);

            statMock.mockResolvedValue(directoryStats());
            readdirWithFileTypesMock.mockImplementation(async () => [
                dirent("Importing.mkv", "file"),
            ]);
            lstatMock.mockResolvedValue({
                isFile: () => kind === "file",
                isDirectory: () => kind === "directory",
                isSymbolicLink: () => kind === "symlink",
            } as Stats);

            if (contents === null) {
                readFileMock.mockRejectedValue(
                    Object.assign(new Error("EACCES"), { code: "EACCES" }),
                );
            } else {
                readFileMock.mockResolvedValue(contents);
            }

            const result = await fetchLibrarySourceFiles({ request: {}, sources: [librarySource] });

            expect(lstatMock).toHaveBeenCalledExactlyOnceWith(
                importDestinationClaimPath(episodePath),
            );
            expect(readFileMock).not.toHaveBeenCalled();
            expect(statMock).toHaveBeenCalledExactlyOnceWith(rootPath);
            expect(result.files).toEqual([]);
            expect(result.failedPaths).toEqual([
                {
                    source: librarySource,
                    errorMessage: `Library file has an outstanding import claim: ${episodePath}`,
                },
            ]);
        },
    );

    it.each(["EACCES", "EIO", "ENOTDIR"])(
        "fails the source when claim lstat returns %s",
        async (code) => {
            const rootPath = path.join("E:\\", "Plex Media", "TV Shows");
            const librarySource = source(rootPath);

            statMock.mockResolvedValue(directoryStats());
            readdirWithFileTypesMock.mockImplementation(async () => [
                dirent("Importing.mkv", "file"),
            ]);
            lstatMock.mockRejectedValue(
                Object.assign(new Error(`Claim check failed: ${code}`), { code }),
            );

            const result = await fetchLibrarySourceFiles({ request: {}, sources: [librarySource] });

            expect(result.files).toEqual([]);
            expect(result.failedPaths).toEqual([
                { source: librarySource, errorMessage: `Claim check failed: ${code}` },
            ]);
            expect(statMock).toHaveBeenCalledExactlyOnceWith(rootPath);
        },
    );

    it("returns successful sources while keeping a claimed source in failedPaths", async () => {
        const claimedRoot = path.join("E:\\", "Plex Media", "Importing Shows");
        const successfulRoot = path.join("E:\\", "Plex Media", "Ready Shows");
        const claimedSource = source(claimedRoot);
        const successfulSource = source(successfulRoot);
        const readyEpisode = path.join(successfulRoot, "Ready.mkv");

        successfulSource.path.id = "path2";
        readdirWithFileTypesMock.mockImplementation(async (target) => [
            dirent(target === claimedRoot ? "Importing.mkv" : "Ready.mkv", "file"),
        ]);
        statMock.mockImplementation(async (target) =>
            target === readyEpisode ? fileStats() : directoryStats(),
        );
        lstatMock.mockResolvedValueOnce(fileStats());

        const result = await fetchLibrarySourceFiles({
            request: {},
            sources: [claimedSource, successfulSource],
        });

        expect(result.sources).toEqual([claimedSource, successfulSource]);
        expect(result.failedPaths).toEqual([
            {
                source: claimedSource,
                errorMessage: `Library file has an outstanding import claim: ${path.join(claimedRoot, "Importing.mkv")}`,
            },
        ]);
        expect(result.files).toEqual([
            {
                source: successfulSource,
                filePath: readyEpisode,
                relativePath: "Ready.mkv",
                sizeBytes: 42,
                modifiedAt: new Date("2026-05-06T13:00:00Z"),
            },
        ]);
    });

    it("fails the library path when a media file cannot be read", async () => {
        const rootPath = path.join("E:\\", "Plex Media", "TV Shows");
        const showPath = path.join(rootPath, "George Lopez");
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

        expect(result.files).toEqual([]);
        expect(result.failedPaths).toHaveLength(1);
        expect(result.failedPaths[0]?.source.path.path).toBe(rootPath);
        expect(result.failedPaths[0]?.errorMessage).toBe("UNKNOWN: unknown error");
    });

    it("fails the whole source when a nested directory is unreadable", async () => {
        const rootPath = path.join("E:\\", "Plex Media", "TV Shows");
        const showPath = path.join(rootPath, "George Lopez");

        statMock.mockResolvedValueOnce(directoryStats());
        readdirWithFileTypesMock.mockImplementation(async (target) => {
            if (target === rootPath) {
                return [dirent("George Lopez", "directory")];
            }

            if (target === showPath) {
                throw new Error("EACCES: permission denied");
            }

            return [];
        });

        const result = await fetchLibrarySourceFiles({ request: {}, sources: [source(rootPath)] });

        expect(result.files).toEqual([]);
        expect(result.failedPaths).toHaveLength(1);
        expect(result.failedPaths[0]?.errorMessage).toBe("EACCES: permission denied");
    });
});
