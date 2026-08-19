import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

import { env } from "@/lib/env";
import type { YoutubeQualityProfile } from "@/lib/database/schema";
import { YtDlpAdapterError } from "@/modules/youtube/errors";
import type {
    YouTubeClassifiedUrl,
    YouTubeDownloadProgress,
    YouTubeEnumerationDTO,
    YouTubeSearchResultDTO,
    YouTubeSourceSummaryDTO,
    YouTubeVideoDTO,
} from "@/modules/youtube/types";

const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const sourceIdPattern = /^[A-Za-z0-9_@.-]{2,160}$/;
const playlistIdPattern = /^[A-Za-z0-9_-]{10,160}$/;
const defaultDiscoveryDeadlineMs = 45_000;
const defaultInactivityDeadlineMs = 20_000;
const discoveryOutputLimit = 8 * 1024 * 1024;
const stderrOutputLimit = 512 * 1024;

export function buildYtDlpCommonExtractionArguments(
    options: {
        pluginDirectory?: string;
        potProviderUrl?: string;
    } = {},
) {
    return [
        "--no-update",
        "--js-runtimes",
        "node",
        "--sleep-requests",
        "1",
        ...(options.pluginDirectory ? ["--plugin-dirs", options.pluginDirectory] : []),
        ...(options.potProviderUrl
            ? [
                  "--extractor-args",
                  "youtube:player_client=mweb",
                  "--extractor-args",
                  `youtubepot-bgutilhttp:base_url=${options.potProviderUrl}`,
              ]
            : []),
    ] as const;
}

const commonExtractionArguments = buildYtDlpCommonExtractionArguments({
    pluginDirectory: env.YT_DLP_PLUGIN_DIR,
    potProviderUrl: env.YOUTUBE_POT_PROVIDER_URL,
});

export type ProcessRunOptions = {
    deadlineMs: number;
    inactivityDeadlineMs: number;
    maxStdoutBytes: number;
    maxStderrBytes: number;
    signal?: AbortSignal;
    onStdoutLine?: (line: string) => void;
};

export type ProcessRunResult = {
    exitCode: number;
    stdout: string;
    stderr: string;
};

export type YtDlpProcessExecutor = (
    executable: string,
    args: readonly string[],
    options: ProcessRunOptions,
) => Promise<ProcessRunResult>;

export type YtDlpCookieLease = {
    path: string;
    release: () => Promise<void>;
};

function shortSafeText(value: string, maximumLength = 360) {
    return value
        .replace(/https?:\/\/[^\s"'<>]+/gi, "[REDACTED_URL]")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maximumLength);
}

export function classifyYtDlpProcessFailure(stderr: string, exitCode: number | null) {
    const value = stderr.toLowerCase();

    if (
        /sign in to confirm (?:you(?:'|’)?re|that you(?:'|’)?re) not a bot|automated traffic|unusual traffic/.test(
            value,
        )
    ) {
        return new YtDlpAdapterError(
            "YouTube requires a signed-in session for this server. An administrator must verify YouTube access in Settings → Connections.",
            "authentication_required",
            exitCode,
        );
    }

    if (/private video|members-only|sign in to confirm your age|login required/.test(value)) {
        return new YtDlpAdapterError("That video is not publicly available.", "private", exitCode);
    }

    if (/video unavailable|has been removed|deleted video|not available/.test(value)) {
        return new YtDlpAdapterError(
            "That YouTube item is no longer available.",
            "removed",
            exitCode,
        );
    }

    if (/too many requests|http error 429|rate.?limit/.test(value)) {
        return new YtDlpAdapterError(
            "YouTube temporarily rate-limited this request.",
            "rate_limited",
            exitCode,
        );
    }

    if (/http error 403|403 forbidden/.test(value)) {
        return new YtDlpAdapterError(
            "YouTube temporarily refused the media transfer.",
            "network",
            exitCode,
        );
    }

    if (/timed? out|temporary failure|connection|network|http error 5\d\d/.test(value)) {
        return new YtDlpAdapterError(
            "YouTube could not be reached right now.",
            "network",
            exitCode,
        );
    }

    return new YtDlpAdapterError(
        shortSafeText(stderr) || "yt-dlp could not complete the request.",
        "tool_failure",
        exitCode,
    );
}

export function buildWindowsProcessTreeKillArguments(pid: number) {
    if (!Number.isSafeInteger(pid) || pid <= 0) {
        throw new Error("A valid process ID is required.");
    }

    return ["/PID", String(pid), "/T", "/F"] as const;
}

function killChildProcessTree(child: ChildProcess) {
    const pid = child.pid;

    if (!pid) {
        child.kill("SIGKILL");

        return;
    }

    if (process.platform === "win32") {
        const killer = spawn("taskkill.exe", [...buildWindowsProcessTreeKillArguments(pid)], {
            shell: false,
            windowsHide: true,
            stdio: "ignore",
        });

        killer.once("error", () => child.kill("SIGKILL"));
        killer.unref();

        return;
    }

    try {
        // yt-dlp starts ffmpeg as a descendant. A detached POSIX group lets one
        // cancellation signal stop the extractor and every merger it created.
        process.kill(-pid, "SIGKILL");
    } catch {
        child.kill("SIGKILL");
    }
}

export const executeYtDlpProcess: YtDlpProcessExecutor = (executable, args, options) =>
    new Promise((resolve, reject) => {
        const child = spawn(executable, [...args], {
            detached: process.platform !== "win32",
            shell: false,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
        });
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let lineRemainder = "";
        let settled = false;
        let inactivityTimer: NodeJS.Timeout;

        const cleanUp = () => {
            clearTimeout(deadlineTimer);
            clearTimeout(inactivityTimer);
            options.signal?.removeEventListener("abort", abort);
        };

        const fail = (error: Error) => {
            if (settled) {
                return;
            }

            settled = true;
            cleanUp();
            killChildProcessTree(child);
            reject(error);
        };

        const resetInactivity = () => {
            clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(
                () => fail(new YtDlpAdapterError("yt-dlp stopped responding.", "timeout")),
                options.inactivityDeadlineMs,
            );
        };

        const abort = () => fail(new YtDlpAdapterError("YouTube download cancelled.", "cancelled"));
        const deadlineTimer = setTimeout(
            () => fail(new YtDlpAdapterError("The YouTube request timed out.", "timeout")),
            options.deadlineMs,
        );

        resetInactivity();
        options.signal?.addEventListener("abort", abort, { once: true });

        if (options.signal?.aborted) {
            abort();
        }

        child.once("error", (error: NodeJS.ErrnoException) => {
            fail(
                error.code === "ENOENT"
                    ? new YtDlpAdapterError("yt-dlp is not installed.", "tool_missing")
                    : new YtDlpAdapterError("yt-dlp could not be started.", "tool_failure"),
            );
        });
        child.stdout.on("data", (chunk: Buffer) => {
            resetInactivity();
            stdoutBytes += chunk.length;

            if (stdoutBytes > options.maxStdoutBytes) {
                fail(new YtDlpAdapterError("yt-dlp returned too much data.", "output_too_large"));

                return;
            }

            stdoutChunks.push(chunk);

            if (options.onStdoutLine) {
                const combined = lineRemainder + chunk.toString("utf8");
                const lines = combined.split(/\r?\n/);

                lineRemainder = lines.pop() ?? "";

                for (const line of lines) {
                    options.onStdoutLine(line);
                }
            }
        });
        child.stderr.on("data", (chunk: Buffer) => {
            resetInactivity();
            stderrBytes += chunk.length;

            if (stderrBytes > options.maxStderrBytes) {
                fail(
                    new YtDlpAdapterError(
                        "yt-dlp returned too much error data.",
                        "output_too_large",
                    ),
                );

                return;
            }

            stderrChunks.push(chunk);
        });
        child.once("close", (exitCode) => {
            if (settled) {
                return;
            }

            settled = true;
            cleanUp();

            if (lineRemainder && options.onStdoutLine) {
                options.onStdoutLine(lineRemainder);
            }

            const stdout = Buffer.concat(stdoutChunks).toString("utf8");
            const stderr = Buffer.concat(stderrChunks).toString("utf8");

            if (exitCode !== 0) {
                reject(classifyYtDlpProcessFailure(stderr, exitCode));

                return;
            }

            resolve({ exitCode: exitCode ?? 0, stdout, stderr });
        });
    });

function safeYoutubeUrl(candidate: string) {
    let url: URL;

    try {
        url = new URL(candidate.trim());
    } catch {
        throw new YtDlpAdapterError("Enter a valid YouTube URL.", "invalid_url");
    }

    if (
        !new Set(["http:", "https:"]).has(url.protocol) ||
        url.username ||
        url.password ||
        url.port ||
        url.hash
    ) {
        throw new YtDlpAdapterError("That YouTube URL form is not supported.", "invalid_url");
    }

    const host = url.hostname.toLowerCase().replace(/\.$/, "");

    if (host !== "youtu.be" && !youtubeHosts.has(host)) {
        throw new YtDlpAdapterError(
            "Only public youtube.com and youtu.be URLs are supported.",
            "invalid_url",
        );
    }

    return { url, host };
}

export function classifyYouTubeUrl(candidate: string): YouTubeClassifiedUrl {
    const { url, host } = safeYoutubeUrl(candidate);
    const segments = url.pathname.split("/").filter(Boolean);

    if (host === "youtu.be") {
        const videoId = segments[0] ?? "";

        if (segments.length !== 1 || !videoIdPattern.test(videoId)) {
            throw new YtDlpAdapterError(
                "That shortened YouTube video URL is invalid.",
                "invalid_url",
            );
        }

        return {
            kind: "video",
            videoId,
            canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        };
    }

    const videoId =
        url.pathname === "/watch"
            ? url.searchParams.get("v")
            : new Set(["shorts", "embed", "live"]).has(segments[0] ?? "")
              ? segments[1]
              : null;

    if (videoId) {
        if (!videoIdPattern.test(videoId)) {
            throw new YtDlpAdapterError("That YouTube video ID is invalid.", "invalid_url");
        }

        const explicitShort = segments[0] === "shorts";

        return {
            kind: "video",
            videoId,
            canonicalUrl: explicitShort
                ? `https://www.youtube.com/shorts/${videoId}`
                : `https://www.youtube.com/watch?v=${videoId}`,
        };
    }

    const playlistId = url.pathname === "/playlist" ? url.searchParams.get("list") : null;

    if (playlistId) {
        if (!playlistIdPattern.test(playlistId)) {
            throw new YtDlpAdapterError("That YouTube playlist ID is invalid.", "invalid_url");
        }

        return {
            kind: "playlist",
            sourceId: playlistId,
            canonicalUrl: `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`,
        };
    }

    const first = segments[0] ?? "";
    const channelForm = first.startsWith("@")
        ? { id: first, base: `/${first}` }
        : new Set(["channel", "user", "c"]).has(first) && segments[1]
          ? { id: segments[1], base: `/${first}/${segments[1]}` }
          : null;

    if (!channelForm || !sourceIdPattern.test(channelForm.id)) {
        throw new YtDlpAdapterError(
            "That YouTube channel URL form is not supported.",
            "invalid_url",
        );
    }

    if (segments.length > (first.startsWith("@") ? 2 : 3)) {
        throw new YtDlpAdapterError(
            "That YouTube channel URL form is not supported.",
            "invalid_url",
        );
    }

    return {
        kind: "channel_videos",
        sourceId: channelForm.id,
        canonicalUrl: `https://www.youtube.com${channelForm.base}/videos`,
    };
}

type RawYtDlpRecord = Record<string, unknown>;

function stringValue(record: RawYtDlpRecord, ...keys: string[]) {
    for (const key of keys) {
        const value = record[key];

        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }

    return null;
}

function numberValue(record: RawYtDlpRecord, ...keys: string[]) {
    for (const key of keys) {
        const value = record[key];

        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
    }

    return null;
}

function parsePublishedAt(record: RawYtDlpRecord) {
    const timestamp = numberValue(record, "timestamp", "release_timestamp");

    if (timestamp !== null) {
        return new Date(timestamp * 1000);
    }

    const uploadDate = stringValue(record, "upload_date", "release_date");

    if (uploadDate && /^\d{8}$/.test(uploadDate)) {
        return new Date(
            `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6)}T00:00:00.000Z`,
        );
    }

    return null;
}

function thumbnail(record: RawYtDlpRecord) {
    const direct = stringValue(record, "thumbnail");

    if (direct) {
        return direct;
    }

    const thumbnails = record.thumbnails;

    if (!Array.isArray(thumbnails)) {
        return null;
    }

    for (let index = thumbnails.length - 1; index >= 0; index -= 1) {
        const item = thumbnails[index];

        if (item && typeof item === "object") {
            const url = stringValue(item as RawYtDlpRecord, "url");

            if (url) {
                return url;
            }
        }
    }

    return null;
}

function inferAvailability(record: RawYtDlpRecord) {
    const availability = stringValue(record, "availability")?.toLowerCase() ?? "";
    const title = stringValue(record, "title")?.toLowerCase() ?? "";

    if (availability.includes("private") || title.includes("private video")) {
        return "private" as const;
    }

    if (title.includes("deleted video") || title.includes("removed video")) {
        return "removed" as const;
    }

    if (availability && !new Set(["public", "unlisted"]).has(availability)) {
        return "unavailable" as const;
    }

    return "public" as const;
}

function inferContentKind(record: RawYtDlpRecord) {
    const liveStatus = stringValue(record, "live_status")?.toLowerCase() ?? "";

    if (
        record.is_live === true ||
        record.was_live === true ||
        new Set(["is_live", "is_upcoming", "post_live", "was_live"]).has(liveStatus)
    ) {
        return "live" as const;
    }

    const mediaType = stringValue(record, "media_type")?.toLowerCase();

    if (mediaType === "short" || mediaType === "shorts") {
        return "short" as const;
    }

    const possibleUrls = [
        stringValue(record, "webpage_url"),
        stringValue(record, "original_url"),
        stringValue(record, "url"),
    ].filter((value): value is string => Boolean(value));

    if (possibleUrls.some((value) => /youtube\.com\/shorts\//i.test(value))) {
        return "short" as const;
    }

    return "regular" as const;
}

function rawVideoId(record: RawYtDlpRecord) {
    const id = stringValue(record, "id");

    if (id && videoIdPattern.test(id)) {
        return id;
    }

    const url = stringValue(record, "webpage_url", "original_url", "url");

    if (!url) {
        return null;
    }

    try {
        const classified = classifyYouTubeUrl(url);

        return classified.kind === "video" ? classified.videoId : null;
    } catch {
        return null;
    }
}

export function mapYtDlpVideo(record: RawYtDlpRecord): YouTubeVideoDTO | null {
    const youtubeVideoId = rawVideoId(record);

    if (!youtubeVideoId) {
        return null;
    }

    const contentKind = inferContentKind(record);
    const availability = inferAvailability(record);

    return {
        youtubeVideoId,
        title: stringValue(record, "title", "fulltitle") ?? `YouTube video ${youtubeVideoId}`,
        channelId: stringValue(record, "channel_id", "uploader_id"),
        channelTitle: stringValue(record, "channel", "uploader"),
        description: stringValue(record, "description"),
        publishedAt: parsePublishedAt(record),
        durationSeconds: numberValue(record, "duration"),
        thumbnailUrl: thumbnail(record),
        webpageUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
        contentKind,
        availability,
        eligible: contentKind === "regular" && availability === "public",
    };
}

function parseJsonObject(stdout: string): RawYtDlpRecord {
    try {
        const value = JSON.parse(stdout) as unknown;

        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("object expected");
        }

        return value as RawYtDlpRecord;
    } catch {
        throw new YtDlpAdapterError("yt-dlp returned malformed metadata.", "malformed_output");
    }
}

function entries(record: RawYtDlpRecord) {
    return Array.isArray(record.entries)
        ? record.entries.filter(
              (item): item is RawYtDlpRecord => Boolean(item) && typeof item === "object",
          )
        : [];
}

function completeSourceEntries(record: RawYtDlpRecord) {
    if (!Array.isArray(record.entries)) {
        throw new YtDlpAdapterError(
            "yt-dlp returned an incomplete source listing.",
            "malformed_output",
        );
    }

    if (record.entries.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
        throw new YtDlpAdapterError(
            "yt-dlp returned an incomplete source listing.",
            "malformed_output",
        );
    }

    return record.entries as RawYtDlpRecord[];
}

function sourceFromRecord(
    record: RawYtDlpRecord,
    classified: Extract<YouTubeClassifiedUrl, { kind: "channel_videos" | "playlist" }>,
): YouTubeSourceSummaryDTO {
    const discoveredChannelId = stringValue(record, "channel_id");
    const discoveredPlaylistId = stringValue(record, "id");

    return {
        kind: classified.kind,
        youtubeSourceId:
            classified.kind === "playlist"
                ? (discoveredPlaylistId ?? classified.sourceId)
                : (discoveredChannelId ?? classified.sourceId),
        canonicalUrl: classified.canonicalUrl,
        title: stringValue(record, "title", "playlist_title", "channel") ?? "YouTube source",
        channelId: discoveredChannelId,
        channelTitle: stringValue(record, "channel", "uploader"),
        thumbnailUrl: thumbnail(record),
    };
}

export function buildYouTubeFormatSelector(profile: YoutubeQualityProfile) {
    if (profile === "best") {
        return "bv*+ba/b";
    }

    const height = profile === "mp4-720p" ? 720 : profile === "mp4-1080p" ? 1080 : 2160;

    return `bv*[ext=mp4][height<=${height}]+ba[ext=m4a]/b[ext=mp4][height<=${height}]/bv*[height<=${height}]+ba/b[height<=${height}]`;
}

function optionalProgressNumber(value: string) {
    const trimmed = value.trim().replace(/%$/, "");

    if (!trimmed || trimmed === "NA" || trimmed === "None") {
        return null;
    }

    const number = Number(trimmed);

    return Number.isFinite(number) ? number : null;
}

export function parseYtDlpProgressLine(line: string): YouTubeDownloadProgress | null {
    if (!line.startsWith("nooklet-progress:")) {
        return null;
    }

    const [
        status = "unknown",
        percent = "",
        downloaded = "",
        total = "",
        estimatedTotal = "",
        speed = "",
        eta = "",
    ] = line.slice("nooklet-progress:".length).split("|");

    return {
        status,
        progressPercent: optionalProgressNumber(percent),
        downloadedBytes: optionalProgressNumber(downloaded),
        totalBytes: optionalProgressNumber(total) ?? optionalProgressNumber(estimatedTotal),
        bytesPerSecond: optionalProgressNumber(speed),
        etaSeconds: optionalProgressNumber(eta),
    };
}

export type YtDlpAdapter = ReturnType<typeof createYtDlpAdapter>;

export function createYtDlpAdapter(
    input: {
        executor?: YtDlpProcessExecutor;
        cookieLeaseProvider?: () => Promise<YtDlpCookieLease | null>;
        ytDlpPath?: string;
        ffmpegPath?: string;
        discoveryDeadlineMs?: number;
        inactivityDeadlineMs?: number;
    } = {},
) {
    const executor = input.executor ?? executeYtDlpProcess;
    const ytDlpPath = input.ytDlpPath ?? env.YT_DLP_PATH;
    const ffmpegPath = input.ffmpegPath ?? env.FFMPEG_PATH;
    const discoveryDeadlineMs = input.discoveryDeadlineMs ?? defaultDiscoveryDeadlineMs;
    const inactivityDeadlineMs = input.inactivityDeadlineMs ?? defaultInactivityDeadlineMs;

    const runExtraction = async (args: readonly string[], options: ProcessRunOptions) => {
        const cookieLease = (await input.cookieLeaseProvider?.()) ?? null;

        try {
            return await executor(
                ytDlpPath,
                [
                    ...commonExtractionArguments,
                    ...(cookieLease ? ["--cookies", cookieLease.path] : []),
                    ...args,
                ],
                options,
            );
        } finally {
            await cookieLease?.release();
        }
    };

    const runDiscovery = (args: readonly string[]) =>
        runExtraction(args, {
            deadlineMs: discoveryDeadlineMs,
            inactivityDeadlineMs,
            maxStdoutBytes: discoveryOutputLimit,
            maxStderrBytes: stderrOutputLimit,
        });

    const probeClassifiedVideo = async (
        classified: Extract<YouTubeClassifiedUrl, { kind: "video" }>,
        signal?: AbortSignal,
    ) => {
        const result = await runExtraction(
            [
                "--dump-single-json",
                "--skip-download",
                "--no-warnings",
                "--no-playlist",
                classified.canonicalUrl,
            ],
            {
                deadlineMs: discoveryDeadlineMs,
                inactivityDeadlineMs,
                maxStdoutBytes: discoveryOutputLimit,
                maxStderrBytes: stderrOutputLimit,
                signal,
            },
        );
        const video = mapYtDlpVideo(parseJsonObject(result.stdout));

        if (!video || video.youtubeVideoId !== classified.videoId) {
            throw new YtDlpAdapterError(
                "yt-dlp did not identify the requested video.",
                "malformed_output",
            );
        }

        return video;
    };

    return {
        async search(query: string, limit = 20): Promise<YouTubeSearchResultDTO[]> {
            const normalizedQuery = query.trim();

            if (!normalizedQuery || normalizedQuery.length > 200) {
                throw new YtDlpAdapterError(
                    "Search text must be between 1 and 200 characters.",
                    "invalid_url",
                );
            }

            const boundedLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
            const result = await runDiscovery([
                "--dump-single-json",
                "--flat-playlist",
                "--skip-download",
                "--no-warnings",
                `ytsearch${boundedLimit}:${normalizedQuery}`,
            ]);
            const root = parseJsonObject(result.stdout);

            return entries(root).flatMap((record): YouTubeSearchResultDTO[] => {
                const type = stringValue(record, "_type");

                if (type === "playlist" || type === "channel") {
                    const rawUrl = stringValue(record, "webpage_url", "url");

                    if (!rawUrl) {
                        return [];
                    }

                    try {
                        const classified = classifyYouTubeUrl(rawUrl);

                        if (classified.kind === "video") {
                            return [];
                        }

                        return [{ kind: "source", source: sourceFromRecord(record, classified) }];
                    } catch {
                        return [];
                    }
                }

                const video = mapYtDlpVideo(record);

                return video ? [{ kind: "video", video }] : [];
            });
        },

        async enumerate(candidate: string): Promise<YouTubeEnumerationDTO> {
            const classified = classifyYouTubeUrl(candidate);

            if (classified.kind === "video") {
                throw new YtDlpAdapterError(
                    "A video cannot be monitored as a source.",
                    "invalid_url",
                );
            }

            const result = await runDiscovery([
                "--dump-single-json",
                "--flat-playlist",
                "--skip-download",
                "--no-warnings",
                classified.canonicalUrl,
            ]);
            const root = parseJsonObject(result.stdout);
            const rawEntries = completeSourceEntries(root);
            const videos = rawEntries.map(mapYtDlpVideo);

            if (videos.some((video) => video === null)) {
                throw new YtDlpAdapterError(
                    "yt-dlp returned an incomplete source listing.",
                    "malformed_output",
                );
            }

            return {
                complete: true,
                source: sourceFromRecord(root, classified),
                videos: videos as YouTubeVideoDTO[],
            };
        },

        async listChannelPlaylists(
            candidate: string,
            limit = 50,
        ): Promise<YouTubeSourceSummaryDTO[]> {
            const classified = classifyYouTubeUrl(candidate);

            if (classified.kind !== "channel_videos") {
                throw new YtDlpAdapterError(
                    "Enter a YouTube channel URL to list its public playlists.",
                    "invalid_url",
                );
            }

            const normalizedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 50;
            const boundedLimit = Math.max(1, Math.min(100, normalizedLimit));
            const playlistsUrl = classified.canonicalUrl.replace(/\/videos$/, "/playlists");
            const result = await runDiscovery([
                "--dump-single-json",
                "--flat-playlist",
                "--skip-download",
                "--no-warnings",
                "--playlist-end",
                String(boundedLimit),
                playlistsUrl,
            ]);
            const root = parseJsonObject(result.stdout);
            const playlists = new Map<string, YouTubeSourceSummaryDTO>();

            for (const record of entries(root)) {
                const explicitAvailability = stringValue(record, "availability")?.toLowerCase();

                if (
                    (explicitAvailability && explicitAvailability !== "public") ||
                    inferAvailability(record) !== "public"
                ) {
                    continue;
                }

                const rawUrl = stringValue(record, "webpage_url", "original_url", "url");

                if (!rawUrl) {
                    continue;
                }

                try {
                    const playlist = classifyYouTubeUrl(rawUrl);

                    if (playlist.kind !== "playlist" || playlists.has(playlist.sourceId)) {
                        continue;
                    }

                    playlists.set(playlist.sourceId, {
                        ...sourceFromRecord(record, playlist),
                        youtubeSourceId: playlist.sourceId,
                    });
                } catch {
                    // A channel tab can contain system shelves and unavailable rows. Only
                    // normalized public playlist URLs cross the adapter boundary.
                }
            }

            return [...playlists.values()].slice(0, boundedLimit);
        },

        async probe(
            candidate: string,
            options: { signal?: AbortSignal } = {},
        ): Promise<YouTubeVideoDTO> {
            const classified = classifyYouTubeUrl(candidate);

            if (classified.kind !== "video") {
                throw new YtDlpAdapterError("Enter a YouTube video URL.", "invalid_url");
            }

            if (/\/shorts\//i.test(classified.canonicalUrl)) {
                throw new YtDlpAdapterError("YouTube Shorts are not supported.", "short");
            }

            return probeClassifiedVideo(classified, options.signal);
        },

        async download(options: {
            videoUrl: string;
            profile: YoutubeQualityProfile;
            stagingDirectory: string;
            signal?: AbortSignal;
            onProgress?: (progress: YouTubeDownloadProgress) => void;
        }) {
            const classified = classifyYouTubeUrl(options.videoUrl);

            if (classified.kind !== "video") {
                throw new YtDlpAdapterError("Enter a YouTube video URL.", "invalid_url");
            }

            if (/\/shorts\//i.test(classified.canonicalUrl)) {
                throw new YtDlpAdapterError("YouTube Shorts are not supported.", "short");
            }

            // Availability may change after discovery or while a queued row is
            // waiting. Re-probe the exact ID immediately before transfer and
            // pass the same cancellation signal through that network call.
            const currentVideo = await probeClassifiedVideo(classified, options.signal);

            if (currentVideo.availability === "private") {
                throw new YtDlpAdapterError("That video is not publicly available.", "private");
            }

            if (currentVideo.availability === "removed") {
                throw new YtDlpAdapterError("That video has been removed.", "removed");
            }

            if (currentVideo.availability !== "public") {
                throw new YtDlpAdapterError("That video is unavailable.", "unavailable");
            }

            if (currentVideo.contentKind === "live") {
                throw new YtDlpAdapterError("Live content is not supported.", "live");
            }

            if (currentVideo.contentKind === "short") {
                throw new YtDlpAdapterError("YouTube Shorts are not supported.", "short");
            }

            if (currentVideo.contentKind !== "regular") {
                throw new YtDlpAdapterError("That video type is unavailable.", "unavailable");
            }

            let artifactPath: string | null = null;
            const outputTemplate = path.join(options.stagingDirectory, "%(id)s.%(ext)s");
            const args = [
                "--no-playlist",
                "--continue",
                "--no-overwrites",
                "--sleep-interval",
                "5",
                "--newline",
                // --print enables yt-dlp's quiet mode. Explicitly restore progress
                // so the structured progress template reaches the runner.
                "--progress",
                "--progress-delta",
                "1",
                "--ffmpeg-location",
                ffmpegPath,
                "--format",
                buildYouTubeFormatSelector(options.profile),
                "--output",
                outputTemplate,
                "--progress-template",
                "download:nooklet-progress:%(progress.status)s|%(progress._percent_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s",
                "--print",
                "after_move:nooklet-file:%(filepath)s",
            ];

            if (options.profile !== "best") {
                args.push("--merge-output-format", "mp4");
            }

            args.push(classified.canonicalUrl);
            await runExtraction(args, {
                deadlineMs: 24 * 60 * 60_000,
                inactivityDeadlineMs: 90_000,
                maxStdoutBytes: 4 * 1024 * 1024,
                maxStderrBytes: stderrOutputLimit,
                signal: options.signal,
                onStdoutLine(line) {
                    if (line.startsWith("nooklet-file:")) {
                        artifactPath = line.slice("nooklet-file:".length).trim();
                    }

                    const progress = parseYtDlpProgressLine(line);

                    if (progress) {
                        options.onProgress?.(progress);
                    }
                },
            });

            return { artifactPath };
        },

        async version() {
            const result = await executor(ytDlpPath, ["--version"], {
                deadlineMs: 10_000,
                inactivityDeadlineMs: 5_000,
                maxStdoutBytes: 64 * 1024,
                maxStderrBytes: 64 * 1024,
            });

            return shortSafeText(result.stdout, 80) || null;
        },

        async ffmpegVersion() {
            const result = await executor(ffmpegPath, ["-version"], {
                deadlineMs: 10_000,
                inactivityDeadlineMs: 5_000,
                maxStdoutBytes: 64 * 1024,
                maxStderrBytes: 64 * 1024,
            });

            return shortSafeText(result.stdout.split(/\r?\n/)[0] ?? "", 120) || null;
        },
    };
}
