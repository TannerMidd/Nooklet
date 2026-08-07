import { describe, expect, it } from "vitest";

import { selectReleaseCandidates, type ReleaseCandidate } from "./candidate-selection";

function result(overrides: {
    id: string;
    title: string;
    qualityLabel?: string | null;
    seeders?: number | null;
    grabs?: number | null;
    publishedAt?: Date | null;
    sizeBytes?: number | null;
    indexerGuid?: string;
}): ReleaseCandidate {
    return {
        id: overrides.id,
        title: overrides.title,
        normalizedTitle: overrides.title.toLowerCase(),
        indexerGuid: overrides.indexerGuid ?? `indexer1:${overrides.id}`,
        qualityLabel: overrides.qualityLabel ?? null,
        sizeBytes: overrides.sizeBytes ?? null,
        publishedAt: overrides.publishedAt ?? null,
        seeders: overrides.seeders ?? null,
        grabs: overrides.grabs ?? null,
    };
}

describe("selectReleaseCandidates", () => {
    it("keeps releases matching the quality profile and sorts by health", () => {
        const candidates = selectReleaseCandidates(
            [
                result({ id: "2160", title: "Arrival 2016 2160p", seeders: 50 }),
                result({ id: "1080-low", title: "Arrival 2016 1080p", seeders: 2 }),
                result({ id: "1080-high", title: "Arrival 2016 1080p", seeders: 20 }),
                result({ id: "720", title: "Arrival 2016 720p", seeders: 100 }),
            ],
            { qualityProfile: "hd-1080p" },
        );

        expect(candidates.map((candidate) => candidate.id)).toEqual(["1080-high", "1080-low"]);
    });

    it("uses broad HD indexer categories as 1080p fallback candidates", () => {
        const candidates = selectReleaseCandidates(
            [
                result({
                    id: "explicit-720",
                    title: "Arrival 2016 720p WEB-DL",
                    qualityLabel: "Movies HD",
                    seeders: 20,
                }),
                result({
                    id: "category-hd",
                    title: "Arrival 2016 BluRay",
                    qualityLabel: "Movies HD",
                    seeders: 10,
                }),
            ],
            { qualityProfile: "hd-1080p" },
        );

        expect(candidates.map((candidate) => candidate.id)).toEqual(["category-hd"]);
    });

    it("filters out single-episode releases when the target is a season", () => {
        const candidates = selectReleaseCandidates(
            [
                result({ id: "s01e01", title: "Eureka.S01E01.1080p.WEB-DL", seeders: 50 }),
                result({ id: "s01e02", title: "Eureka.S01E02.1080p.WEB-DL", seeders: 40 }),
                result({ id: "s01-pack", title: "Eureka.S01.Complete.1080p.WEB-DL", seeders: 10 }),
                result({ id: "s02-pack", title: "Eureka Season 2 1080p", seeders: 5 }),
            ],
            { qualityProfile: "hd-1080p", target: { kind: "season", season: 1 } },
        );

        expect(candidates.map((candidate) => candidate.id)).toEqual(["s01-pack"]);
    });

    it("requires the matching SxxExx token when the target is a single episode", () => {
        const candidates = selectReleaseCandidates(
            [
                result({ id: "s01e01", title: "Eureka.S01E01.1080p", seeders: 30 }),
                result({ id: "s01e03", title: "Eureka.S01E03.1080p", seeders: 10 }),
                result({ id: "s01-pack", title: "Eureka.S01.Complete.1080p", seeders: 50 }),
            ],
            { qualityProfile: "hd-1080p", target: { kind: "episode", season: 1, episode: 3 } },
        );

        expect(candidates.map((candidate) => candidate.id)).toEqual(["s01e03"]);
    });

    it("excludes previously attempted result ids and stable release identities", () => {
        const candidates = selectReleaseCandidates(
            [
                result({
                    id: "excluded-by-id",
                    title: "Severance S01E02 1080p PROPER",
                    seeders: 30,
                }),
                result({
                    id: "new-row-for-bad-release",
                    title: "Severance S01E02 1080p",
                    seeders: 20,
                }),
                result({
                    id: "different-release",
                    title: "Severance S01E02 1080p REPACK",
                    seeders: 10,
                }),
            ],
            {
                qualityProfile: "hd-1080p",
                excludedResultIds: ["excluded-by-id"],
                excludedReleaseKeys: ["title:severance s01e02 1080p"],
            },
        );

        expect(candidates.map((candidate) => candidate.id)).toEqual(["different-release"]);
    });

    it("rejects releases for a different title or conflicting movie year", () => {
        const candidates = selectReleaseCandidates(
            [
                result({ id: "correct", title: "Arrival 2016 1080p WEB-DL", seeders: 10 }),
                result({ id: "wrong-title", title: "The Arrival 2016 1080p WEB-DL", seeders: 100 }),
                result({ id: "wrong-year", title: "Arrival 1996 1080p WEB-DL", seeders: 100 }),
                result({ id: "episode", title: "Arrival S01E01 2016 1080p", seeders: 100 }),
            ],
            {
                qualityProfile: "hd-1080p",
                expectedTitle: "Arrival",
                expectedYear: 2016,
                mediaType: "movie",
            },
        );

        expect(candidates.map((candidate) => candidate.id)).toEqual(["correct"]);
    });

    // Scene names drop punctuation rather than replacing it, so the
    // word-separated form of the expected title never lined up and *every*
    // candidate for such a title was filtered out.
    it.each([
        ["It's Always Sunny in Philadelphia", "Its.Always.Sunny.in.Philadelphia.S01E01.1080p"],
        ["Marvel's Agents of S.H.I.E.L.D.", "Marvels.Agents.of.SHIELD.S01E01.1080p"],
        ["Bob's Burgers", "Bobs.Burgers.S01E01.1080p"],
    ])("matches %s against its punctuation-stripped release name", (expectedTitle, title) => {
        const candidates = selectReleaseCandidates([result({ id: "match", title })], {
            qualityProfile: "hd-1080p",
            expectedTitle,
            mediaType: "tv",
            target: { kind: "episode", season: 1, episode: 1 },
        });

        expect(candidates.map((candidate) => candidate.id)).toEqual(["match"]);
    });

    it("still rejects a different title that merely shares a prefix word", () => {
        const candidates = selectReleaseCandidates(
            [result({ id: "other", title: "The.Bobs.Burgers.Movie.2022.1080p" })],
            {
                qualityProfile: "hd-1080p",
                expectedTitle: "Bob's Burgers",
                mediaType: "movie",
            },
        );

        expect(candidates).toEqual([]);
    });

    // `1920x1080` matched the year scan, so a release carrying a resolution but
    // no year looked like it declared 1920.
    it("does not read a resolution token as a declared year", () => {
        const candidates = selectReleaseCandidates(
            [
                result({ id: "resolution-only", title: "Arrival 1920x1080 BluRay x264" }),
                result({ id: "wrong-year", title: "Arrival 1996 1920x1080 BluRay" }),
            ],
            {
                qualityProfile: "hd-1080p",
                expectedTitle: "Arrival",
                expectedYear: 2016,
                mediaType: "movie",
            },
        );

        expect(candidates.map((candidate) => candidate.id)).toEqual(["resolution-only"]);
    });

    it("uses bounded TV tokens and requires an explicit complete-series release for all-TV requests", () => {
        const episodeCandidates = selectReleaseCandidates(
            [
                result({ id: "exact", title: "Eureka S01E01 1080p" }),
                result({ id: "prefix", title: "Eureka S01E010 1080p" }),
            ],
            {
                qualityProfile: "hd-1080p",
                expectedTitle: "Eureka",
                mediaType: "tv",
                target: { kind: "episode", season: 1, episode: 1 },
            },
        );
        const seriesCandidates = selectReleaseCandidates(
            [
                result({ id: "single", title: "Eureka S01E01 1080p" }),
                result({ id: "season", title: "Eureka S01 Complete 1080p" }),
                result({ id: "series", title: "Eureka Complete Series 1080p" }),
            ],
            {
                qualityProfile: "hd-1080p",
                expectedTitle: "Eureka",
                mediaType: "tv",
                target: { kind: "all", mediaType: "tv" },
            },
        );

        expect(episodeCandidates.map((candidate) => candidate.id)).toEqual(["exact"]);
        expect(seriesCandidates.map((candidate) => candidate.id)).toEqual(["series"]);
    });
});
