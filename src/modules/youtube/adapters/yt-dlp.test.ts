import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { YtDlpAdapterError } from "@/modules/youtube/errors";

import {
    buildWindowsProcessTreeKillArguments,
    buildYtDlpCommonExtractionArguments,
    buildYouTubeFormatSelector,
    classifyYouTubeUrl,
    classifyYtDlpProcessFailure,
    createYtDlpAdapter,
    executeYtDlpProcess,
    parseYtDlpProgressLine,
    type YtDlpProcessExecutor,
} from "./yt-dlp";

describe("yt-dlp adapter", () => {
    it("leases cookies per extraction and releases them after success or failure", async () => {
        const release = vi.fn().mockResolvedValue(undefined);
        const cookieLeaseProvider = vi.fn().mockResolvedValue({
            path: "/tmp/private-youtube-cookies.txt",
            release,
        });
        const executor = vi
            .fn()
            .mockResolvedValueOnce({
                exitCode: 0,
                stdout: JSON.stringify({
                    id: "aqz-KE-bpKQ",
                    title: "Big Buck Bunny",
                    availability: "public",
                }),
                stderr: "",
            })
            .mockRejectedValueOnce(new Error("extractor failed"));
        const adapter = createYtDlpAdapter({ executor, cookieLeaseProvider });

        await expect(
            adapter.probe("https://www.youtube.com/watch?v=aqz-KE-bpKQ"),
        ).resolves.toMatchObject({ youtubeVideoId: "aqz-KE-bpKQ" });
        expect(executor.mock.calls[0]?.[1]).toEqual(
            expect.arrayContaining(["--cookies", "/tmp/private-youtube-cookies.txt"]),
        );
        await expect(adapter.probe("https://www.youtube.com/watch?v=aqz-KE-bpKQ")).rejects.toThrow(
            "extractor failed",
        );
        expect(cookieLeaseProvider).toHaveBeenCalledTimes(2);
        expect(release).toHaveBeenCalledTimes(2);
    });

    it("adds only explicitly configured pinned plugin-provider arguments", () => {
        expect(buildYtDlpCommonExtractionArguments()).toEqual([
            "--no-update",
            "--js-runtimes",
            "node",
            "--sleep-requests",
            "1",
        ]);
        expect(
            buildYtDlpCommonExtractionArguments({
                pluginDirectory: "/usr/local/share/yt-dlp-plugins",
                potProviderUrl: "http://youtube-pot-provider:4416",
            }),
        ).toEqual([
            "--no-update",
            "--js-runtimes",
            "node",
            "--sleep-requests",
            "1",
            "--plugin-dirs",
            "/usr/local/share/yt-dlp-plugins",
            "--extractor-args",
            "youtube:player_client=mweb",
            "--extractor-args",
            "youtubepot-bgutilhttp:base_url=http://youtube-pot-provider:4416",
        ]);
    });

    it("classifies a media CDN HTTP 403 as retryable network failure", () => {
        expect(
            classifyYtDlpProcessFailure(
                "ERROR: unable to download video data: HTTP Error 403: Forbidden",
                1,
            ),
        ).toMatchObject({
            kind: "network",
            exitCode: 1,
            message: "YouTube temporarily refused the media transfer.",
        });
    });

    it("classifies YouTube's guest anti-bot challenge as requiring authentication", () => {
        expect(
            classifyYtDlpProcessFailure(
                "ERROR: Sign in to confirm you’re not a bot. Use --cookies for authentication.",
                1,
            ),
        ).toMatchObject({
            kind: "authentication_required",
            exitCode: 1,
            message:
                "YouTube requires a signed-in session for this server. An administrator must verify YouTube access in Settings → Connections.",
        });
        expect(classifyYtDlpProcessFailure("ERROR: This is a private video", 1)).toMatchObject({
            kind: "private",
        });
    });

    it("constructs Windows descendant termination without a shell", () => {
        expect(buildWindowsProcessTreeKillArguments(4242)).toEqual(["/PID", "4242", "/T", "/F"]);
        expect(() => buildWindowsProcessTreeKillArguments(-1)).toThrow(/process ID/i);
    });

    it("strictly classifies and canonicalizes supported YouTube URLs", () => {
        expect(classifyYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({
            kind: "video",
            videoId: "dQw4w9WgXcQ",
            canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        });
        expect(classifyYouTubeUrl("https://www.youtube.com/playlist?list=PL1234567890abc")).toEqual(
            {
                kind: "playlist",
                sourceId: "PL1234567890abc",
                canonicalUrl: "https://www.youtube.com/playlist?list=PL1234567890abc",
            },
        );
        expect(classifyYouTubeUrl("https://youtube.com/@nooklet/featured")).toEqual({
            kind: "channel_videos",
            sourceId: "@nooklet",
            canonicalUrl: "https://www.youtube.com/@nooklet/videos",
        });
        expect(classifyYouTubeUrl("https://youtube.com/shorts/dQw4w9WgXcQ")).toEqual({
            kind: "video",
            videoId: "dQw4w9WgXcQ",
            canonicalUrl: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        });

        for (const invalid of [
            "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
            "https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com:8443/watch?v=dQw4w9WgXcQ",
            "file:///watch?v=dQw4w9WgXcQ",
            "https://youtube.com/watch?v=../../etc",
        ]) {
            expect(() => classifyYouTubeUrl(invalid)).toThrow(YtDlpAdapterError);
        }
    });

    it("uses bounded flat enumeration with Node EJS and runtime updates disabled", async () => {
        const executor = vi.fn<YtDlpProcessExecutor>().mockResolvedValue({
            exitCode: 0,
            stderr: "",
            stdout: JSON.stringify({
                id: "UC1234567890123456789012",
                title: "Nooklet",
                channel_id: "UC1234567890123456789012",
                entries: [
                    {
                        id: "dQw4w9WgXcQ",
                        title: "Regular upload",
                        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                        availability: "public",
                    },
                    {
                        id: "aqz-KE-bpKQ",
                        title: "Confirmed short",
                        url: "https://www.youtube.com/shorts/aqz-KE-bpKQ",
                        availability: "public",
                    },
                ],
            }),
        });
        const adapter = createYtDlpAdapter({ executor, ytDlpPath: "fake-yt-dlp" });
        const enumeration = await adapter.enumerate("https://youtube.com/@nooklet");
        const args = executor.mock.calls[0]?.[1] ?? [];

        expect(args).toContain("--no-update");
        expect(
            args.slice(args.indexOf("--js-runtimes"), args.indexOf("--js-runtimes") + 2),
        ).toEqual(["--js-runtimes", "node"]);
        expect(args).toContain("--flat-playlist");
        expect(args.at(-1)).toBe("https://www.youtube.com/@nooklet/videos");
        expect(args).not.toContain("--remote-components");
        expect(enumeration.complete).toBe(true);
        expect(enumeration.videos.map((video) => [video.contentKind, video.eligible])).toEqual([
            ["regular", true],
            ["short", false],
        ]);
    });

    it("lists bounded, deduplicated public playlists for a channel", async () => {
        const executor = vi.fn<YtDlpProcessExecutor>().mockResolvedValue({
            exitCode: 0,
            stderr: "",
            stdout: JSON.stringify({
                title: "Nooklet playlists",
                entries: [
                    {
                        _type: "url",
                        id: "PL1234567890abc",
                        title: "Release notes",
                        url: "https://www.youtube.com/playlist?list=PL1234567890abc",
                        availability: "public",
                    },
                    {
                        _type: "playlist",
                        id: "PL1234567890abc",
                        title: "Duplicate",
                        webpage_url: "https://youtube.com/playlist?list=PL1234567890abc",
                    },
                    {
                        id: "PLprivate123456",
                        title: "Private playlist",
                        url: "https://youtube.com/playlist?list=PLprivate123456",
                        availability: "private",
                    },
                    {
                        id: "PLunlisted12345",
                        title: "Unlisted playlist",
                        url: "https://youtube.com/playlist?list=PLunlisted12345",
                        availability: "unlisted",
                    },
                    {
                        id: "dQw4w9WgXcQ",
                        title: "Not a playlist",
                        url: "https://youtube.com/watch?v=dQw4w9WgXcQ",
                    },
                    {
                        id: "PLunsupported123",
                        title: "Unsupported host",
                        url: "https://example.com/playlist?list=PLunsupported123",
                    },
                ],
            }),
        });
        const adapter = createYtDlpAdapter({ executor, ytDlpPath: "fake-yt-dlp" });
        const playlists = await adapter.listChannelPlaylists(
            "https://youtube.com/@nooklet/videos",
            250,
        );
        const args = executor.mock.calls[0]?.[1] ?? [];

        expect(args).toContain("--no-update");
        expect(
            args.slice(args.indexOf("--js-runtimes"), args.indexOf("--js-runtimes") + 2),
        ).toEqual(["--js-runtimes", "node"]);
        expect(args).toContain("--flat-playlist");
        expect(
            args.slice(args.indexOf("--playlist-end"), args.indexOf("--playlist-end") + 2),
        ).toEqual(["--playlist-end", "100"]);
        expect(args.at(-1)).toBe("https://www.youtube.com/@nooklet/playlists");
        expect(args).not.toContain("--remote-components");
        expect(playlists).toEqual([
            expect.objectContaining({
                kind: "playlist",
                youtubeSourceId: "PL1234567890abc",
                title: "Release notes",
                canonicalUrl: "https://www.youtube.com/playlist?list=PL1234567890abc",
            }),
        ]);
    });

    it.each([
        "https://youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/playlist?list=PL1234567890abc",
    ])("rejects non-channel playlist discovery input %s", async (candidate) => {
        const executor = vi.fn<YtDlpProcessExecutor>();
        const adapter = createYtDlpAdapter({ executor });

        await expect(adapter.listChannelPlaylists(candidate)).rejects.toMatchObject({
            kind: "invalid_url",
        });
        expect(executor).not.toHaveBeenCalled();
    });

    it("rejects a malformed entry rather than treating a partial listing as complete", async () => {
        const executor: YtDlpProcessExecutor = async () => ({
            exitCode: 0,
            stderr: "",
            stdout: JSON.stringify({ title: "Playlist", entries: [{ title: "missing id" }] }),
        });
        const adapter = createYtDlpAdapter({ executor });

        await expect(
            adapter.enumerate("https://youtube.com/playlist?list=PL1234567890abc"),
        ).rejects.toMatchObject({ kind: "malformed_output" });
    });

    it.each([null, "invalid shelf", 42])(
        "fails closed when a complete source listing contains %p",
        async (invalidEntry) => {
            const executor: YtDlpProcessExecutor = async () => ({
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({
                    title: "Playlist",
                    entries: [
                        {
                            id: "dQw4w9WgXcQ",
                            title: "Valid upload",
                            availability: "public",
                        },
                        invalidEntry,
                    ],
                }),
            });

            await expect(
                createYtDlpAdapter({ executor }).enumerate(
                    "https://youtube.com/playlist?list=PL1234567890abc",
                ),
            ).rejects.toMatchObject({ kind: "malformed_output" });
        },
    );

    it("caps child output and enforces inactivity deadlines", async () => {
        await expect(
            executeYtDlpProcess(
                process.execPath,
                ["-e", "process.stdout.write('x'.repeat(4096))"],
                {
                    deadlineMs: 5_000,
                    inactivityDeadlineMs: 2_000,
                    maxStdoutBytes: 128,
                    maxStderrBytes: 128,
                },
            ),
        ).rejects.toMatchObject({ kind: "output_too_large" });

        await expect(
            executeYtDlpProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
                deadlineMs: 5_000,
                inactivityDeadlineMs: 30,
                maxStdoutBytes: 128,
                maxStderrBytes: 128,
            }),
        ).rejects.toMatchObject({ kind: "timeout" });
    });

    it("propagates an anti-bot process failure as an authentication requirement", async () => {
        await expect(
            executeYtDlpProcess(
                process.execPath,
                [
                    "-e",
                    'process.stderr.write("ERROR: Sign in to confirm you’re not a bot."); process.exit(1)',
                ],
                {
                    deadlineMs: 5_000,
                    inactivityDeadlineMs: 2_000,
                    maxStdoutBytes: 128,
                    maxStderrBytes: 256,
                },
            ),
        ).rejects.toMatchObject({ kind: "authentication_required" });
    });

    it("builds ceiling selectors and parses structured progress safely", () => {
        expect(buildYouTubeFormatSelector("mp4-1080p")).toContain("height<=1080");
        expect(buildYouTubeFormatSelector("best")).toBe("bv*+ba/b");
        expect(
            parseYtDlpProgressLine(
                "nooklet-progress:downloading| 52.5%|1048576|2097152|NA|65536|16",
            ),
        ).toEqual({
            status: "downloading",
            progressPercent: 52.5,
            downloadedBytes: 1_048_576,
            totalBytes: 2_097_152,
            bytesPerSecond: 65_536,
            etaSeconds: 16,
        });
        expect(
            parseYtDlpProgressLine("nooklet-progress:downloading| 25%|524288|NA|2097152|32768|48"),
        ).toMatchObject({ totalBytes: 2_097_152 });
        expect(parseYtDlpProgressLine("noise")).toBeNull();
    });

    it("uses explicit Shorts metadata without duration guessing", async () => {
        const executor: YtDlpProcessExecutor = async () => ({
            exitCode: 0,
            stderr: "",
            stdout: JSON.stringify({
                id: "aqz-KE-bpKQ",
                title: "Explicit short",
                media_type: "short",
                duration: 1_200,
                availability: "public",
            }),
        });
        const item = await createYtDlpAdapter({ executor }).probe(
            "https://youtube.com/watch?v=aqz-KE-bpKQ",
        );

        expect(item).toMatchObject({ contentKind: "short", eligible: false });
    });

    it("terminally rejects an explicit Shorts URL without losing its positive identity", async () => {
        const executor = vi.fn<YtDlpProcessExecutor>();

        await expect(
            createYtDlpAdapter({ executor }).download({
                videoUrl: "https://youtube.com/shorts/dQw4w9WgXcQ",
                profile: "best",
                stagingDirectory: "C:/staging",
            }),
        ).rejects.toMatchObject({ kind: "short" });
        expect(executor).not.toHaveBeenCalled();
    });

    it("re-probes the exact video with the cancellation signal immediately before transfer", async () => {
        const controller = new AbortController();
        const executor = vi.fn<YtDlpProcessExecutor>();
        const onProgress = vi.fn();

        executor.mockImplementation(async (_executable, args, options) => {
            if (args.includes("--dump-single-json")) {
                return {
                    exitCode: 0,
                    stderr: "",
                    stdout: JSON.stringify({
                        id: "dQw4w9WgXcQ",
                        title: "Regular upload",
                        availability: "public",
                    }),
                };
            }

            // --print implies quiet mode in yt-dlp. Model that behavior so this
            // test fails if the adapter stops explicitly restoring progress.
            if (args.includes("--progress")) {
                options.onStdoutLine?.(
                    "nooklet-progress:downloading|50%|1048576|2097152|NA|65536|16",
                );
            }

            options.onStdoutLine?.("nooklet-file:C:/staging/dQw4w9WgXcQ.mp4");

            return { exitCode: 0, stderr: "", stdout: "" };
        });
        const result = await createYtDlpAdapter({ executor }).download({
            videoUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ",
            profile: "mp4-1080p",
            stagingDirectory: "C:/staging",
            signal: controller.signal,
            onProgress,
        });

        expect(executor).toHaveBeenCalledTimes(2);
        expect(executor.mock.calls[0]?.[1]).toContain("--dump-single-json");
        expect(executor.mock.calls[0]?.[1]).toContain("--no-update");
        expect(executor.mock.calls[0]?.[1]).toContain("--js-runtimes");
        expect(executor.mock.calls[0]?.[2].signal).toBe(controller.signal);
        expect(executor.mock.calls[1]?.[1]).toContain("--output");
        expect(executor.mock.calls[1]?.[1]).toContain("--no-update");
        expect(executor.mock.calls[1]?.[1]).toContain("--js-runtimes");
        expect(executor.mock.calls[1]?.[1]).toEqual(
            expect.arrayContaining(["--progress", "--progress-delta", "1"]),
        );
        expect(
            executor.mock.calls[1]?.[1].slice(
                executor.mock.calls[1]?.[1].indexOf("--sleep-interval"),
                executor.mock.calls[1]?.[1].indexOf("--sleep-interval") + 2,
            ),
        ).toEqual(["--sleep-interval", "5"]);
        expect(executor.mock.calls[1]?.[2].signal).toBe(controller.signal);
        expect(onProgress).toHaveBeenCalledWith({
            status: "downloading",
            progressPercent: 50,
            downloadedBytes: 1_048_576,
            totalBytes: 2_097_152,
            bytesPerSecond: 65_536,
            etaSeconds: 16,
        });
        expect(result.artifactPath).toBe("C:/staging/dQw4w9WgXcQ.mp4");
    });

    it.each([
        ["private", { availability: "private" }, "private"],
        ["removed", { title: "[Deleted video]" }, "removed"],
        ["active live", { live_status: "is_live" }, "live"],
        ["upcoming live", { live_status: "is_upcoming" }, "live"],
        ["completed live", { live_status: "was_live" }, "live"],
        ["confirmed short", { media_type: "short" }, "short"],
    ])(
        "terminally rejects %s content after the immediate probe",
        async (_label, metadata, kind) => {
            const executor = vi.fn<YtDlpProcessExecutor>().mockResolvedValue({
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({
                    id: "dQw4w9WgXcQ",
                    title: "Video",
                    availability: "public",
                    ...metadata,
                }),
            });

            await expect(
                createYtDlpAdapter({ executor }).download({
                    videoUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ",
                    profile: "best",
                    stagingDirectory: "C:/staging",
                }),
            ).rejects.toMatchObject({ kind });
            expect(executor).toHaveBeenCalledTimes(1);
        },
    );
});
