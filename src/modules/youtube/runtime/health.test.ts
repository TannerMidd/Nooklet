import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { YtDlpAdapter } from "@/modules/youtube/adapters/yt-dlp";

import { getYouTubeHealth, getYouTubeToolDiagnostics, writeYouTubeRunnerHeartbeat } from "./health";

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(
        directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

describe("YouTube health", () => {
    it("degrades only an active stale heartbeat", async () => {
        const workDirectory = await mkdtemp(path.join(tmpdir(), "nooklet-youtube-health-"));

        directories.push(workDirectory);
        const adapter = {
            version: async () => "2026.08.18",
            ffmpegVersion: async () => "ffmpeg version 8",
        } as unknown as YtDlpAdapter;
        const diagnostics = {
            inspectEjs: async () => ({
                available: true as const,
                detail: "Bundled yt-dlp EJS scripts detected.",
                error: null,
            }),
            inspectWorkDirectory: async () => ({
                writable: true as const,
                path: "[app]/data/youtube",
                error: null,
            }),
        };

        await writeYouTubeRunnerHeartbeat(true, workDirectory);
        const fresh = await getYouTubeHealth({
            adapter,
            workDirectory,
            ...diagnostics,
            now: new Date(),
            stallAfterMs: 60_000,
        });

        expect(fresh).toMatchObject({ ready: true, degraded: false, runnerStalled: false });
        const stale = await getYouTubeHealth({
            adapter,
            workDirectory,
            ...diagnostics,
            now: new Date(Date.now() + 61_000),
            stallAfterMs: 60_000,
        });

        expect(stale).toMatchObject({ ready: true, degraded: true, runnerStalled: true });
        await writeYouTubeRunnerHeartbeat(false, workDirectory);
        const idle = await getYouTubeHealth({
            adapter,
            workDirectory,
            ...diagnostics,
            now: new Date(Date.now() + 61_000),
            stallAfterMs: 60_000,
        });

        expect(idle.runnerStalled).toBe(false);
    });

    it("requires Node, bundled EJS, and a writable redacted work directory", async () => {
        const workDirectory = await mkdtemp(path.join(tmpdir(), "nooklet-youtube-tools-"));
        const ytDlpPath = path.join(workDirectory, "yt-dlp-fake");

        directories.push(workDirectory);
        await writeFile(ytDlpPath, "zip-entry:yt_dlp_ejs/yt/solver/core.min.js");
        const adapter = {
            version: async () => "2026.08.18",
            ffmpegVersion: async () => "ffmpeg version 8",
        } as unknown as YtDlpAdapter;
        const ready = await getYouTubeToolDiagnostics({
            adapter,
            ytDlpPath,
            workDirectory,
            nodeVersion: "24.7.0",
        });

        expect(ready).toMatchObject({
            ready: true,
            node: { available: true, version: "24.7.0" },
            ejs: { available: true },
            workDirectory: { writable: true },
        });
        expect(ready.workDirectory.path).not.toContain(workDirectory);

        await writeFile(ytDlpPath, "bundle without scripts");
        const notReady = await getYouTubeToolDiagnostics({
            adapter,
            ytDlpPath,
            workDirectory,
            nodeVersion: "18.20.0",
        });

        expect(notReady).toMatchObject({
            ready: false,
            node: { available: false },
            ejs: { available: false },
        });
    });
});
