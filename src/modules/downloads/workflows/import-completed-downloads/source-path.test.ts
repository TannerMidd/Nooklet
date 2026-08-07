import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { env } from "@/lib/env";

import { resolveCompletedDownloadSourcePath } from "./source-path";

const cleanupPaths: string[] = [];

afterEach(async () => {
    await Promise.all(
        cleanupPaths.splice(0).map((target) => rm(target, { recursive: true, force: true })),
    );
});

describe("resolveCompletedDownloadSourcePath", () => {
    it("accepts canonical files inside the built-in engine completed directory", async () => {
        const completedRoot = path.resolve(env.DOWNLOAD_ENGINE_DIR, "complete");
        const fixtureDirectory = path.join(completedRoot, `source-path-${randomUUID()}`);
        const fixtureFile = path.join(fixtureDirectory, "movie.mkv");

        cleanupPaths.push(fixtureDirectory);
        await mkdir(fixtureDirectory, { recursive: true });
        await writeFile(fixtureFile, "fixture");

        await expect(resolveCompletedDownloadSourcePath(fixtureFile)).resolves.toBe(
            await realpath(fixtureFile),
        );
    });

    it("rejects canonical files outside the built-in engine completed directory", async () => {
        const engineRoot = path.resolve(env.DOWNLOAD_ENGINE_DIR);
        const fixtureDirectory = path.join(
            path.dirname(engineRoot),
            `outside-engine-${randomUUID()}`,
        );
        const fixtureFile = path.join(fixtureDirectory, "movie.mkv");

        cleanupPaths.push(fixtureDirectory);
        await mkdir(path.resolve(engineRoot, "complete"), { recursive: true });
        await mkdir(fixtureDirectory, { recursive: true });
        await writeFile(fixtureFile, "fixture");

        await expect(resolveCompletedDownloadSourcePath(fixtureFile)).rejects.toThrow(
            "escaped the configured engine directory",
        );
    });
});
