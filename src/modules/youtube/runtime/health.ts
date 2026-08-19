import "server-only";

import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, open, readFile, realpath, rename, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { env } from "@/lib/env";
import type { YtDlpAdapter } from "@/modules/youtube/adapters/yt-dlp";
import { createConfiguredYtDlpAdapter } from "@/modules/youtube/configured-adapter";
import { getYouTubeOperationalCounts } from "@/modules/youtube/repositories/youtube-repository";
import type { YouTubeToolDiagnosticsDTO } from "@/modules/youtube/types";

type PersistedRunnerHeartbeat = {
    version: 1;
    at: string;
    active: boolean;
};

function heartbeatPath(workDirectory = env.YOUTUBE_WORK_DIR) {
    return path.join(workDirectory, "runner-heartbeat.json");
}

export async function writeYouTubeRunnerHeartbeat(
    active: boolean,
    workDirectory = env.YOUTUBE_WORK_DIR,
) {
    await mkdir(workDirectory, { recursive: true });
    const target = heartbeatPath(workDirectory);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;

    await writeFile(
        temporary,
        JSON.stringify({
            version: 1,
            at: new Date().toISOString(),
            active,
        } satisfies PersistedRunnerHeartbeat),
        { encoding: "utf8", mode: 0o600 },
    );
    await rename(temporary, target);
}

export async function readYouTubeRunnerHeartbeat(workDirectory = env.YOUTUBE_WORK_DIR) {
    try {
        const parsed = JSON.parse(
            await readFile(heartbeatPath(workDirectory), "utf8"),
        ) as Partial<PersistedRunnerHeartbeat>;

        if (
            parsed.version !== 1 ||
            typeof parsed.at !== "string" ||
            typeof parsed.active !== "boolean"
        ) {
            return null;
        }

        const at = new Date(parsed.at);

        return Number.isNaN(at.getTime()) ? null : { at, active: parsed.active };
    } catch {
        return null;
    }
}

function safeDiagnosticError(error: unknown) {
    const message = error instanceof Error ? error.message : "Tool check failed.";

    return message.replace(/https?:\/\/\S+/gi, "[REDACTED_URL]").slice(0, 240);
}

function sameOrChildPath(parent: string, candidate: string) {
    const relative = path.relative(path.resolve(parent), path.resolve(candidate));

    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function redactYouTubeDiagnosticPath(candidate: string) {
    const resolved = path.resolve(candidate);
    const appRoot = path.resolve(/* turbopackIgnore: true */ process.cwd());
    const userHome = path.resolve(homedir());

    if (sameOrChildPath(appRoot, resolved)) {
        return path.join("[app]", path.relative(appRoot, resolved));
    }

    if (sameOrChildPath(userHome, resolved)) {
        return path.join("[home]", path.relative(userHome, resolved));
    }

    return path.join(path.parse(resolved).root, "…", path.basename(resolved));
}

async function resolveExecutablePath(candidate: string) {
    const hasDirectory = path.isAbsolute(candidate) || /[\\/]/.test(candidate);
    const extensions =
        process.platform === "win32"
            ? ["", ...(process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")]
            : [""];
    const directories = hasDirectory
        ? [""]
        : (process.env.PATH ?? "")
              .split(path.delimiter)
              .map((entry) => entry.trim())
              .filter(Boolean);

    for (const directory of directories) {
        for (const extension of extensions) {
            const executable = hasDirectory
                ? `${candidate}${extension}`
                : path.join(directory, `${candidate}${extension}`);

            try {
                await access(executable);

                return realpath(executable);
            } catch {
                // Continue through the bounded PATH candidates.
            }
        }
    }

    throw new Error("The configured yt-dlp executable could not be inspected.");
}

export async function inspectBundledYtDlpEjs(ytDlpPath = env.YT_DLP_PATH) {
    const executablePath = await resolveExecutablePath(ytDlpPath);
    const markers = [
        "yt_dlp/ejs/",
        "yt_dlp\\ejs\\",
        "yt_dlp.ejs.",
        "yt_dlp_ejs/",
        "yt_dlp_ejs\\",
        "yt_dlp_ejs.",
    ];
    let carry = "";

    for await (const chunk of createReadStream(/* turbopackIgnore: true */ executablePath, {
        highWaterMark: 64 * 1024,
    })) {
        const text = `${carry}${(chunk as Buffer).toString("latin1")}`.toLowerCase();

        if (markers.some((marker) => text.includes(marker))) {
            return {
                available: true,
                detail: "Bundled yt-dlp EJS scripts detected.",
                error: null,
            };
        }

        carry = text.slice(-64);
    }

    return {
        available: false,
        detail: null,
        error: "The configured yt-dlp distribution does not expose its bundled EJS scripts.",
    };
}

export async function inspectYouTubeWorkDirectory(workDirectory = env.YOUTUBE_WORK_DIR) {
    const safePath = redactYouTubeDiagnosticPath(workDirectory);
    const probePath = path.join(workDirectory, `.nooklet-write-probe-${randomUUID()}`);

    try {
        await mkdir(workDirectory, { recursive: true });
        const canonical = await realpath(workDirectory);
        const file = await open(probePath, "wx", 0o600);

        await file.close();
        await rm(probePath, { force: true });

        return { writable: true, path: redactYouTubeDiagnosticPath(canonical), error: null };
    } catch {
        await rm(probePath, { force: true }).catch(() => undefined);

        return {
            writable: false,
            path: safePath,
            error: "The YouTube work directory is not writable.",
        };
    }
}

type EjsDiagnostic = Awaited<ReturnType<typeof inspectBundledYtDlpEjs>>;
type WorkDirectoryDiagnostic = Awaited<ReturnType<typeof inspectYouTubeWorkDirectory>>;

export async function getYouTubeToolDiagnostics(
    options: {
        adapter?: YtDlpAdapter;
        ytDlpPath?: string;
        workDirectory?: string;
        nodeVersion?: string;
        inspectEjs?: (ytDlpPath: string) => Promise<EjsDiagnostic>;
        inspectWorkDirectory?: (workDirectory: string) => Promise<WorkDirectoryDiagnostic>;
    } = {},
): Promise<YouTubeToolDiagnosticsDTO> {
    const adapter = options.adapter ?? createConfiguredYtDlpAdapter();
    const nodeVersion = options.nodeVersion ?? process.versions.node;
    const nodeMajor = Number.parseInt(nodeVersion.split(".")[0] ?? "", 10);
    const node =
        Number.isFinite(nodeMajor) && nodeMajor >= 24
            ? { available: true, version: nodeVersion, error: null }
            : {
                  available: false,
                  version: nodeVersion || null,
                  error: "Node.js 24 or newer is required for YouTube JavaScript challenges.",
              };
    const [ytDlp, ffmpeg, ejs, workDirectory] = await Promise.all([
        adapter.version().then(
            (version) => ({ available: true, version, error: null }),
            (error) => ({ available: false, version: null, error: safeDiagnosticError(error) }),
        ),
        adapter.ffmpegVersion().then(
            (version) => ({ available: true, version, error: null }),
            (error) => ({ available: false, version: null, error: safeDiagnosticError(error) }),
        ),
        (options.inspectEjs ?? inspectBundledYtDlpEjs)(options.ytDlpPath ?? env.YT_DLP_PATH).catch(
            () => ({
                available: false,
                detail: null,
                error: "The configured yt-dlp distribution could not be inspected for EJS scripts.",
            }),
        ),
        (options.inspectWorkDirectory ?? inspectYouTubeWorkDirectory)(
            options.workDirectory ?? env.YOUTUBE_WORK_DIR,
        ),
    ]);

    return {
        ready:
            ytDlp.available &&
            ffmpeg.available &&
            node.available &&
            ejs.available &&
            workDirectory.writable,
        ytDlp,
        ffmpeg,
        node,
        ejs,
        workDirectory,
    };
}

export async function getYouTubeHealth(
    options: {
        adapter?: YtDlpAdapter;
        workDirectory?: string;
        now?: Date;
        stallAfterMs?: number;
        ytDlpPath?: string;
        nodeVersion?: string;
        inspectEjs?: (ytDlpPath: string) => Promise<EjsDiagnostic>;
        inspectWorkDirectory?: (workDirectory: string) => Promise<WorkDirectoryDiagnostic>;
    } = {},
) {
    const [tools, counts, heartbeat] = await Promise.all([
        getYouTubeToolDiagnostics({
            adapter: options.adapter,
            workDirectory: options.workDirectory,
            ytDlpPath: options.ytDlpPath,
            nodeVersion: options.nodeVersion,
            inspectEjs: options.inspectEjs,
            inspectWorkDirectory: options.inspectWorkDirectory,
        }),
        getYouTubeOperationalCounts(),
        readYouTubeRunnerHeartbeat(options.workDirectory),
    ]);
    const now = options.now ?? new Date();
    const stalled = Boolean(
        heartbeat?.active &&
        now.getTime() - heartbeat.at.getTime() > (options.stallAfterMs ?? 10 * 60_000),
    );

    return {
        ready: tools.ready,
        degraded: stalled,
        tools,
        sourcesWithErrors: counts.sourceErrors,
        queuedDownloads: counts.queued,
        activeDownloads: counts.active,
        retryingDownloads: counts.retrying,
        lastRunnerHeartbeatAt: heartbeat?.at ?? null,
        runnerStalled: stalled,
    };
}
