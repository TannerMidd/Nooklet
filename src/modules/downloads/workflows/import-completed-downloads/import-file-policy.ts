import path from "node:path";

/**
 * Conservative completed-download import policy.
 *
 * - A video in a clearly named Samples or Extras directory is never primary.
 * - Filename-only sample/extra markers are trusted only when a larger sibling
 *   video exists, avoiding false positives for films whose title contains one
 *   of those words.
 * - Every remaining movie video is retained; organization decides how to give
 *   multi-part files unique names.
 * - Companion files are imported only when their basename reliably matches a
 *   planned video, or when they use a small set of conventional title-level
 *   names such as movie.nfo or poster.jpg.
 */

export const importVideoExtensions = new Set([
    ".avi",
    ".m4v",
    ".mkv",
    ".mov",
    ".mp4",
    ".mpeg",
    ".mpg",
    ".ts",
    ".wmv",
]);

const subtitleExtensions = new Set([".ass", ".idx", ".srt", ".ssa", ".sub", ".vtt"]);
const sidecarExtensions = new Set([".jpeg", ".jpg", ".nfo", ".png", ".webp"]);
const sampleDirectories = new Set(["sample", "samples"]);
const extraDirectories = new Set([
    "behind the scenes",
    "behind-the-scenes",
    "deleted scenes",
    "deleted-scenes",
    "extras",
    "featurettes",
    "interviews",
    "shorts",
    "trailers",
]);
const genericTitleSidecars = new Set([
    "banner.jpg",
    "banner.png",
    "clearlogo.png",
    "fanart.jpg",
    "fanart.png",
    "folder.jpg",
    "movie.nfo",
    "poster.jpg",
    "poster.png",
    "tvshow.nfo",
]);
const subtitleQualifier = /^(?:[._ -](?:[a-z]{2,3}|cc|forced|foreign|hi|sdh))+(?:[._ -]\d+)?$/i;

export type ImportFileKind = "video" | "subtitle" | "sidecar";
export type VideoImportRole = "primary" | "sample" | "extra";
export const noPrimaryMediaFilesFoundMessage =
    "The completed download contained only samples or extras, not a primary movie or episode file.";

export type ImportPolicyFile = {
    relativePath: string;
    sizeBytes: number;
};

function normalizedSegments(relativePath: string) {
    return relativePath
        .replaceAll("\\", "/")
        .split("/")
        .filter(Boolean)
        .map((segment) => segment.trim().toLowerCase().replace(/[._]+/g, " "));
}

function basenameStem(relativePath: string) {
    const basename = path.posix.basename(relativePath.replaceAll("\\", "/"));

    return basename.slice(0, Math.max(0, basename.length - path.extname(basename).length));
}

function hasToken(value: string, token: string) {
    return value
        .split(/[ ._()[\]-]+/)
        .some((candidate) => candidate.toLowerCase() === token.toLowerCase());
}

function hasLargerSibling(file: ImportPolicyFile, videos: ImportPolicyFile[]) {
    return videos.some(
        (candidate) =>
            candidate !== file &&
            candidate.sizeBytes > file.sizeBytes &&
            directoryVideoRole(candidate.relativePath) === null,
    );
}

function directoryVideoRole(relativePath: string): Exclude<VideoImportRole, "primary"> | null {
    const directories = normalizedSegments(relativePath).slice(0, -1);

    if (directories.some((segment) => sampleDirectories.has(segment))) {
        return "sample";
    }

    if (directories.some((segment) => extraDirectories.has(segment))) {
        return "extra";
    }

    return null;
}

export function importFileKind(relativePath: string): ImportFileKind | null {
    const extension = path.extname(relativePath).toLowerCase();

    if (importVideoExtensions.has(extension)) {
        return "video";
    }

    if (subtitleExtensions.has(extension)) {
        return "subtitle";
    }

    if (sidecarExtensions.has(extension)) {
        return "sidecar";
    }

    return null;
}

export function classifyVideoImportRole(
    file: ImportPolicyFile,
    videos: ImportPolicyFile[],
): VideoImportRole {
    const directoryRole = directoryVideoRole(file.relativePath);

    if (directoryRole) {
        return directoryRole;
    }

    const stem = basenameStem(file.relativePath);

    if (hasLargerSibling(file, videos)) {
        if (hasToken(stem, "sample")) {
            return "sample";
        }

        if (
            /^(?:behind[ ._-]+the[ ._-]+scenes?|deleted[ ._-]+scenes?|extras?|featurettes?|interviews?|trailers?)(?:$|[ ._-])/i.test(
                stem,
            )
        ) {
            return "extra";
        }
    }

    return "primary";
}

export function primaryVideoFiles<T extends ImportPolicyFile>(files: T[]) {
    const videos = files.filter((file) => importFileKind(file.relativePath) === "video");

    return videos.filter((file) => classifyVideoImportRole(file, videos) === "primary");
}

export function extraVideoFiles<T extends ImportPolicyFile>(files: T[]) {
    const videos = files.filter((file) => importFileKind(file.relativePath) === "video");

    return videos.filter((file) => classifyVideoImportRole(file, videos) === "extra");
}

export function moviePartNumber(relativePath: string): number | null {
    const stem = basenameStem(relativePath);
    const match = stem.match(
        /(?:^|[ ._()\[\]-])(?:cd|disc|disk|part|pt)[ ._-]?(\d{1,2})(?:$|[ ._()\[\]-])/i,
    );
    const parsed = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;

    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizedDirectory(relativePath: string) {
    return path.posix.dirname(relativePath.replaceAll("\\", "/")).toLowerCase();
}

function isSubtitleDirectory(directory: string) {
    const finalSegment = path.posix.basename(directory).replace(/[._-]+/g, " ");

    return finalSegment === "subs" || finalSegment === "subtitles";
}

/**
 * Returns the suffix to append to a planned video's destination stem, or null
 * when the companion cannot be matched confidently.
 */
export function matchedCompanionSuffix(
    companionRelativePath: string,
    videoRelativePath: string,
): string | null {
    const companionKind = importFileKind(companionRelativePath);

    if (companionKind !== "subtitle" && companionKind !== "sidecar") {
        return null;
    }

    const companionDirectory = normalizedDirectory(companionRelativePath);
    const videoDirectory = normalizedDirectory(videoRelativePath);

    if (companionDirectory !== videoDirectory && !isSubtitleDirectory(companionDirectory)) {
        return null;
    }

    const companionStem = basenameStem(companionRelativePath);
    const videoStem = basenameStem(videoRelativePath);

    if (companionStem.toLowerCase() === videoStem.toLowerCase()) {
        return "";
    }

    if (
        companionKind !== "subtitle" ||
        !companionStem.toLowerCase().startsWith(videoStem.toLowerCase())
    ) {
        return null;
    }

    const suffix = companionStem.slice(videoStem.length);

    if (!subtitleQualifier.test(suffix)) {
        return null;
    }

    const tokens = suffix.split(/[._ -]+/).filter(Boolean);

    return tokens.length > 0 ? `.${tokens.join(".")}` : "";
}

export function isGenericTitleSidecar(relativePath: string) {
    const normalizedPath = relativePath.replaceAll("\\", "/");

    return !normalizedPath.includes("/") && genericTitleSidecars.has(normalizedPath.toLowerCase());
}
