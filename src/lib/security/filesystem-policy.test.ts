import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    FilesystemPolicyError,
    parseApprovedMediaRoots,
    resolveApprovedMediaDirectory,
    resolveApprovedMediaFile,
} from "@/lib/security/filesystem-policy";

describe("filesystem media-root policy", () => {
    let sandbox: string;
    let approvedRoot: string;
    let libraryRoot: string;

    beforeEach(() => {
        sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-media-policy-"));
        approvedRoot = path.join(sandbox, "media");
        libraryRoot = path.join(approvedRoot, "tv");
        fs.mkdirSync(libraryRoot, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(sandbox, { recursive: true, force: true });
    });

    it("parses semicolon and newline separated approved roots", () => {
        expect(parseApprovedMediaRoots(" /media/tv ; /media/movies\r\n/mnt/archive ")).toEqual([
            "/media/tv",
            "/media/movies",
            "/mnt/archive",
        ]);
    });

    it("accepts only directories contained by an approved root", () => {
        expect(resolveApprovedMediaDirectory(libraryRoot, [approvedRoot])).toBe(
            fs.realpathSync.native(libraryRoot),
        );

        const outside = path.join(sandbox, "outside");

        fs.mkdirSync(outside);
        expect(() => resolveApprovedMediaDirectory(outside, [approvedRoot])).toThrow(
            FilesystemPolicyError,
        );
    });

    it("does not allow the filesystem root as the configured trust boundary", () => {
        expect(() =>
            resolveApprovedMediaDirectory(libraryRoot, [path.parse(libraryRoot).root]),
        ).toThrow(/filesystem root/i);
    });

    it("allows regular files inside their registered library and rejects escaped paths", () => {
        const mediaFile = path.join(libraryRoot, "episode.mkv");

        fs.writeFileSync(mediaFile, "media");
        expect(resolveApprovedMediaFile(mediaFile, libraryRoot)).toBe(
            fs.realpathSync.native(mediaFile),
        );

        const outsideFile = path.join(sandbox, "outside.mkv");

        fs.writeFileSync(outsideFile, "outside");
        expect(() => resolveApprovedMediaFile(outsideFile, libraryRoot)).toThrow(/escaped/i);
    });

    it("rejects directories and missing files from deletion", () => {
        expect(() => resolveApprovedMediaFile(libraryRoot, libraryRoot)).toThrow(
            /regular media files/i,
        );
        expect(() =>
            resolveApprovedMediaFile(path.join(libraryRoot, "missing.mkv"), libraryRoot),
        ).toThrow(/no longer exists/i);
    });
});
