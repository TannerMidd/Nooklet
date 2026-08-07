import { type MediaQualityProfile } from "@/lib/database/schema";

import { releaseMatchesQualityProfile } from "./quality";
import { releaseMatchesSelectionTarget, type ReleaseSelectionTarget } from "./target-matching";

export type ReleaseCandidate = {
    id: string;
    title: string;
    normalizedTitle: string;
    indexerGuid: string;
    qualityLabel: string | null;
    sizeBytes: number | null;
    publishedAt: Date | null;
    seeders: number | null;
    grabs: number | null;
};

export type ReleaseSelectionOptions = {
    qualityProfile: MediaQualityProfile;
    target?: ReleaseSelectionTarget | null;
    expectedTitle?: string;
    expectedYear?: number | null;
    mediaType?: "movie" | "tv";
    excludedResultIds?: string[];
    excludedReleaseKeys?: string[];
};

export function releaseExclusionKeys(
    result: Pick<ReleaseCandidate, "indexerGuid" | "normalizedTitle">,
) {
    return [`guid:${result.indexerGuid}`, `title:${result.normalizedTitle}`];
}

function resultTime(value: Date | null) {
    return value?.getTime() ?? 0;
}

function normalizeIdentityText(value: string) {
    return value
        .normalize("NFKC")
        .toLocaleLowerCase("und")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

/**
 * Same normalization with separators removed entirely.
 *
 * Scene names drop punctuation rather than replacing it, so "It's Always
 * Sunny" becomes "Its.Always.Sunny" — which reads as `its always sunny` on the
 * word-separated form and never matches `it s always sunny`. Every candidate
 * for such a title was filtered out, so it could never download at all.
 */
function collapseIdentityText(value: string) {
    return value
        .normalize("NFKC")
        .toLocaleLowerCase("und")
        .replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Resolution and dimension tokens read as years: `1920x1080` matches a
 * `19\d\d` scan, so a release carrying a resolution but no year looked like it
 * declared 1920 and was rejected against the real one.
 */
function stripResolutionTokens(title: string) {
    return title.replace(/\d{3,4}\s*[x×]\s*\d{3,4}/gi, " ").replace(/\b\d{3,4}[ip]\b/gi, " ");
}

function releaseMatchesExpectedIdentity(
    result: ReleaseCandidate,
    options: Pick<ReleaseSelectionOptions, "expectedTitle" | "expectedYear" | "mediaType">,
) {
    if (!options.expectedTitle) {
        return true;
    }

    const expectedTitle = normalizeIdentityText(options.expectedTitle);
    const releaseTitle = normalizeIdentityText(result.title);

    if (!expectedTitle) {
        return false;
    }

    const matchesSeparated =
        releaseTitle === expectedTitle || releaseTitle.startsWith(`${expectedTitle} `);
    // The collapsed comparison only ever accepts more than the separated one, so
    // it cannot reject a title that matches today.
    const matchesCollapsed = collapseIdentityText(result.title).startsWith(
        collapseIdentityText(options.expectedTitle),
    );

    if (!matchesSeparated && !matchesCollapsed) {
        return false;
    }

    if (options.expectedYear) {
        const declaredYears = Array.from(
            stripResolutionTokens(result.title).matchAll(/(?:^|\D)((?:19|20)\d{2})(?!\d)/g),
        ).map((match) => Number(match[1]));

        if (declaredYears.length > 0 && !declaredYears.includes(options.expectedYear)) {
            return false;
        }
    }

    if (
        options.mediaType === "movie" &&
        /\bs\d{1,3}e\d{1,4}\b|\b\d{1,3}x\d{1,4}\b/i.test(result.title)
    ) {
        return false;
    }

    return true;
}

export function selectReleaseCandidates<T extends ReleaseCandidate>(
    results: T[],
    options: ReleaseSelectionOptions,
): T[] {
    const excludedResultIds = new Set(options.excludedResultIds ?? []);
    const excludedReleaseKeys = new Set(options.excludedReleaseKeys ?? []);
    const target = options.target ?? null;

    return results
        .filter(
            (result) =>
                releaseMatchesQualityProfile(options.qualityProfile, result) &&
                releaseMatchesExpectedIdentity(result, options) &&
                releaseMatchesSelectionTarget(result, target) &&
                !excludedResultIds.has(result.id) &&
                releaseExclusionKeys(result).every((key) => !excludedReleaseKeys.has(key)),
        )
        .sort((left, right) => {
            const seeders = (right.seeders ?? -1) - (left.seeders ?? -1);

            if (seeders !== 0) {
                return seeders;
            }

            const grabs = (right.grabs ?? 0) - (left.grabs ?? 0);

            if (grabs !== 0) {
                return grabs;
            }

            const publishedAt = resultTime(right.publishedAt) - resultTime(left.publishedAt);

            if (publishedAt !== 0) {
                return publishedAt;
            }

            return (right.sizeBytes ?? 0) - (left.sizeBytes ?? 0);
        });
}
