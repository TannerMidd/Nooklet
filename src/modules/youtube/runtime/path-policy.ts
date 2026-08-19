import path from "node:path";
import { lstat, mkdir, realpath } from "node:fs/promises";
import { lstatSync, realpathSync } from "node:fs";

import type { YoutubeQualityProfile, YoutubeSourceKind } from "@/lib/database/schema";
import type { YouTubeVideoDTO } from "@/modules/youtube/types";

const unsafeWindowsCharacters = /[\u0000-\u001f<>:"/\\|?*\u007f]/g;
const reservedWindowsNames = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function sanitizeYouTubePathSegment(
    rawValue: string | null | undefined,
    fallback: string,
    maximumLength = 120,
) {
    let value = (rawValue ?? "")
        .normalize("NFKC")
        .replace(unsafeWindowsCharacters, "_")
        .replace(/\s+/g, " ")
        .replace(/[. ]+$/g, "")
        .replace(/^[. ]+/g, "")
        .trim();

    if (!value || value === "." || value === "..") {
        value = fallback;
    }

    if (reservedWindowsNames.test(value)) {
        value = `_${value}`;
    }

    if (value.length > maximumLength) {
        value = value.slice(0, maximumLength).replace(/[. ]+$/g, "");
    }

    return value || fallback;
}

export function normalizeYouTubeExtension(value: string) {
    const extension = value.replace(/^\./, "").toLowerCase();

    if (!/^[a-z0-9]{1,10}$/.test(extension)) {
        throw new Error("Downloaded video has an unsafe extension.");
    }

    return extension;
}

export function buildYouTubeRelativePath(
    video: Pick<YouTubeVideoDTO, "youtubeVideoId" | "channelTitle" | "title" | "publishedAt">,
    extension: string,
    source: { sourceKind: YoutubeSourceKind; title: string } | null = null,
    fallbackDate = new Date(),
) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(video.youtubeVideoId)) {
        throw new Error("Invalid YouTube video ID.");
    }

    const publishedAt = video.publishedAt ?? fallbackDate;
    const isoDate = publishedAt.toISOString().slice(0, 10);
    const channel = sanitizeYouTubePathSegment(video.channelTitle, "Unknown channel", 100);
    const collection = sanitizeYouTubePathSegment(
        source?.sourceKind === "playlist" ? source.title : "Videos",
        "Videos",
        120,
    );
    const title = sanitizeYouTubePathSegment(
        video.title,
        `YouTube video ${video.youtubeVideoId}`,
        140,
    );
    const filename = `${isoDate} - ${title} [${video.youtubeVideoId}].${normalizeYouTubeExtension(extension)}`;

    return path.join(channel, collection, filename);
}

/** Deterministic fallback when another quality already owns the canonical filename. */
export function buildYouTubeProfileCollisionPath(
    canonicalRelativePath: string,
    qualityProfile: YoutubeQualityProfile,
) {
    const extension = path.extname(canonicalRelativePath);
    const baseName = path.basename(canonicalRelativePath, extension);
    const profile = sanitizeYouTubePathSegment(qualityProfile, "alternate-quality", 40);

    return path.join(path.dirname(canonicalRelativePath), `${baseName} [${profile}]${extension}`);
}

export function isPathWithin(rootPath: string, candidatePath: string) {
    const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));

    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function sameCanonicalPath(left: string, right: string) {
    const normalizedLeft = path.resolve(left);
    const normalizedRight = path.resolve(right);

    return process.platform === "win32"
        ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
        : normalizedLeft === normalizedRight;
}

/** Re-check every destination component at the exact synchronous publish point. */
export function revalidatePreparedDestinationSync(input: {
    canonicalRoot: string;
    canonicalParent: string;
    finalPath: string;
}) {
    const rootInfo = lstatSync(input.canonicalRoot);

    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
        throw new Error("YouTube destination root changed before publish.");
    }

    const relativeParent = path.relative(input.canonicalRoot, input.canonicalParent);

    if (relativeParent.startsWith("..") || path.isAbsolute(relativeParent)) {
        throw new Error("YouTube destination parent escaped its root.");
    }

    let current = input.canonicalRoot;

    for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        const info = lstatSync(current);

        if (info.isSymbolicLink() || !info.isDirectory()) {
            throw new Error("YouTube destination contains a link at publish time.");
        }
    }

    const resolvedRoot = realpathSync(input.canonicalRoot);
    const resolvedParent = realpathSync(input.canonicalParent);

    if (
        !sameCanonicalPath(resolvedRoot, input.canonicalRoot) ||
        !sameCanonicalPath(resolvedParent, input.canonicalParent) ||
        !isPathWithin(resolvedRoot, resolvedParent) ||
        !sameCanonicalPath(path.dirname(input.finalPath), resolvedParent)
    ) {
        throw new Error("YouTube destination changed before publish.");
    }
}

async function assertNotLink(targetPath: string) {
    const info = await lstat(targetPath);

    if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error("YouTube destination contains a link or non-directory component.");
    }
}

export async function prepareContainedDestination(
    rootPath: string,
    relativeFilePath: string,
    expectedCanonicalRoot?: string,
) {
    if (
        path.isAbsolute(relativeFilePath) ||
        relativeFilePath.split(/[\\/]/).some((part) => part === "..")
    ) {
        throw new Error("YouTube destination escaped its selected root.");
    }

    const suppliedRootInfo = await lstat(rootPath);

    if (suppliedRootInfo.isSymbolicLink() || !suppliedRootInfo.isDirectory()) {
        throw new Error("YouTube destination root is a link or is not a directory.");
    }

    const canonicalRoot = await realpath(rootPath);

    if (expectedCanonicalRoot && !sameCanonicalPath(canonicalRoot, expectedCanonicalRoot)) {
        throw new Error("YouTube destination root changed after approval.");
    }

    await assertNotLink(canonicalRoot);
    const relativeDirectory = path.dirname(relativeFilePath);
    let current = canonicalRoot;

    for (const part of relativeDirectory
        .split(path.sep)
        .filter((entry) => entry && entry !== ".")) {
        current = path.join(current, part);

        if (!isPathWithin(canonicalRoot, current)) {
            throw new Error("YouTube destination escaped its selected root.");
        }

        await mkdir(current, { recursive: false }).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "EEXIST") {
                throw error;
            }
        });
        await assertNotLink(current);
    }

    const canonicalParent = await realpath(current);

    if (!isPathWithin(canonicalRoot, canonicalParent)) {
        throw new Error("YouTube destination resolved outside its selected root.");
    }

    const finalPath = path.join(canonicalParent, path.basename(relativeFilePath));

    if (!isPathWithin(canonicalRoot, finalPath)) {
        throw new Error("YouTube destination escaped its selected root.");
    }

    return { canonicalRoot, canonicalParent, finalPath };
}
