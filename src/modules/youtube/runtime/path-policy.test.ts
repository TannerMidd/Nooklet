import { mkdtemp, mkdir, rename, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
    buildYouTubeProfileCollisionPath,
    buildYouTubeRelativePath,
    prepareContainedDestination,
    revalidatePreparedDestinationSync,
    sanitizeYouTubePathSegment,
} from "./path-policy";

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(
        temporaryDirectories
            .splice(0)
            .map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

describe("YouTube path policy", () => {
    it("sanitizes Windows-incompatible and reserved path segments", () => {
        expect(sanitizeYouTubePathSegment('  CON.<>:"/\\|?*  ', "fallback")).toBe("_CON._________");
        expect(sanitizeYouTubePathSegment("...", "fallback")).toBe("fallback");
        expect(sanitizeYouTubePathSegment("NUL", "fallback")).toBe("_NUL");
    });

    it("builds playlist-aware paths and falls back to the channel Videos collection", () => {
        const relative = buildYouTubeRelativePath(
            {
                youtubeVideoId: "dQw4w9WgXcQ",
                channelTitle: "Nooklet: Channel",
                title: "A / Video?",
                publishedAt: new Date("2026-08-18T20:00:00.000Z"),
            },
            ".mp4",
            { sourceKind: "playlist", title: "Biology / Genetics?" },
        );

        expect(relative).toBe(
            path.join(
                "Nooklet_ Channel",
                "Biology _ Genetics_",
                "2026-08-18 - A _ Video_ [dQw4w9WgXcQ].mp4",
            ),
        );
        expect(buildYouTubeProfileCollisionPath(relative, "mp4-1080p")).toBe(
            path.join(
                "Nooklet_ Channel",
                "Biology _ Genetics_",
                "2026-08-18 - A _ Video_ [dQw4w9WgXcQ] [mp4-1080p].mp4",
            ),
        );

        expect(
            buildYouTubeRelativePath(
                {
                    youtubeVideoId: "dQw4w9WgXcQ",
                    channelTitle: "Nooklet: Channel",
                    title: "A / Video?",
                    publishedAt: new Date("2026-08-18T20:00:00.000Z"),
                },
                ".mp4",
            ),
        ).toBe(
            path.join("Nooklet_ Channel", "Videos", "2026-08-18 - A _ Video_ [dQw4w9WgXcQ].mp4"),
        );
    });

    it("rejects an ancestor swapped to a junction immediately before publish", async () => {
        const base = await mkdtemp(path.join(tmpdir(), "nooklet-youtube-path-"));

        temporaryDirectories.push(base);
        const root = path.join(base, "root");
        const outside = path.join(base, "outside");

        await mkdir(root);
        await mkdir(outside);
        const prepared = await prepareContainedDestination(
            root,
            path.join("Channel", "2026", "video.mp4"),
        );
        const channelPath = path.join(root, "Channel");

        await rename(channelPath, path.join(root, "Channel-original"));
        await symlink(outside, channelPath, process.platform === "win32" ? "junction" : "dir");

        expect(() => revalidatePreparedDestinationSync(prepared)).toThrow(/link|changed/i);
    });
});
