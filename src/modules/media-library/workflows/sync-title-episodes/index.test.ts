import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/service-connections/queries/get-tmdb-tv-seasons", () => ({
    getTmdbTvSeasonsForUser: vi.fn(),
    getTmdbTvSeasonEpisodesForUser: vi.fn(),
}));

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import {
    createMediaLibrary,
    createTvEpisode,
    createTvSeason,
    listTvEpisodesForTitle,
    listTvSeasonsForTitle,
    upsertMediaTitle,
} from "@/modules/media-library/repositories/media-library-repository";
import {
    getTmdbTvSeasonEpisodesForUser,
    getTmdbTvSeasonsForUser,
} from "@/modules/service-connections/queries/get-tmdb-tv-seasons";

import { syncTitleEpisodesWorkflow } from "./index";

const seasonsMock = vi.mocked(getTmdbTvSeasonsForUser);
const episodesMock = vi.mocked(getTmdbTvSeasonEpisodesForUser);

async function seedTitle() {
    const database = ensureDatabaseReady();
    const userId = randomUUID();

    database
        .insert(users)
        .values({
            id: userId,
            email: `${userId}@test.local`,
            displayName: "test",
            passwordHash: "x",
            role: "user",
        })
        .run();

    const library = await createMediaLibrary({ userId, mediaType: "tv", name: "TV" });
    const title = await upsertMediaTitle({
        userId,
        libraryId: library.id,
        mediaType: "tv",
        title: "Severance",
        sortTitle: "severance",
        normalizedKey: "severance::2022",
        status: "requested",
    });

    if (!title) {
        throw new Error("title missing");
    }

    return { userId, title };
}

function tmdbSeason(seasonNumber: number, episodeCount: number, name?: string) {
    return {
        seasonNumber,
        name: name ?? `Season ${seasonNumber}`,
        overview: null,
        episodeCount,
        airDate: null,
        posterUrl: null,
    };
}

function tmdbEpisode(
    seasonNumber: number,
    episodeNumber: number,
    name: string,
    airDate: string | null,
) {
    return {
        seasonNumber,
        episodeNumber,
        name,
        overview: null,
        airDate,
        runtimeMinutes: null,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("syncTitleEpisodesWorkflow", () => {
    it("persists the full structure with metadata for an entire-series request", async () => {
        const { userId, title } = await seedTitle();

        seasonsMock.mockResolvedValue({
            ok: true,
            seasons: [tmdbSeason(0, 1, "Specials"), tmdbSeason(1, 2)],
        });
        episodesMock.mockImplementation(async (_userId, input) => ({
            ok: true,
            seasonNumber: input.seasonNumber,
            episodes:
                input.seasonNumber === 0
                    ? [tmdbEpisode(0, 1, "Special", null)]
                    : [
                          tmdbEpisode(1, 1, "Good News About Hell", "2022-02-18"),
                          tmdbEpisode(1, 2, "Half Loop", "2022-02-18"),
                      ],
        }));

        const result = await syncTitleEpisodesWorkflow(userId, {
            titleId: title.id,
            tmdbId: 95396,
            scope: "all",
            policy: { kind: "selections", selections: { mode: "all" } },
        });

        expect(result.ok).toBe(true);

        if (!result.ok) {
            throw new Error("sync failed");
        }

        expect(result.newEpisodeCount).toBe(3);

        const seasons = await listTvSeasonsForTitle(title.id);

        expect(
            seasons.map((season) => ({
                seasonNumber: season.seasonNumber,
                title: season.title,
                episodeCount: season.episodeCount,
                monitored: season.monitored,
            })),
        ).toEqual([
            { seasonNumber: 0, title: "Specials", episodeCount: 1, monitored: false },
            { seasonNumber: 1, title: "Season 1", episodeCount: 2, monitored: true },
        ]);

        const episodes = await listTvEpisodesForTitle(title.id);

        expect(episodes).toHaveLength(3);
        expect(episodes[1]).toMatchObject({
            seasonNumber: 1,
            episodeNumber: 1,
            title: "Good News About Hell",
            airDate: "2022-02-18",
            monitored: true,
            hasFile: false,
        });
    });

    it("only fetches episodes for scoped seasons but persists every season row", async () => {
        const { userId, title } = await seedTitle();

        seasonsMock.mockResolvedValue({
            ok: true,
            seasons: [tmdbSeason(1, 1), tmdbSeason(2, 1)],
        });
        episodesMock.mockResolvedValue({
            ok: true,
            seasonNumber: 2,
            episodes: [tmdbEpisode(2, 1, "Premiere", "2024-01-01")],
        });

        const result = await syncTitleEpisodesWorkflow(userId, {
            titleId: title.id,
            tmdbId: 95396,
            scope: { seasons: [2] },
            policy: { kind: "selections", selections: { mode: "seasons", seasons: [2] } },
        });

        expect(result.ok).toBe(true);
        expect(episodesMock).toHaveBeenCalledTimes(1);
        expect(episodesMock).toHaveBeenCalledWith(userId, { tmdbId: 95396, seasonNumber: 2 });

        const seasons = await listTvSeasonsForTitle(title.id);

        expect(
            seasons.map((season) => ({
                seasonNumber: season.seasonNumber,
                monitored: season.monitored,
            })),
        ).toEqual([
            { seasonNumber: 1, monitored: false },
            { seasonNumber: 2, monitored: true },
        ]);
    });

    it("preserves existing monitoring choices on refresh while inserting new rows", async () => {
        const { userId, title } = await seedTitle();
        const season = await createTvSeason({
            titleId: title.id,
            seasonNumber: 1,
            monitored: false,
        });

        await createTvEpisode({
            titleId: title.id,
            seasonId: season.id,
            seasonNumber: 1,
            episodeNumber: 1,
            monitored: false,
            hasFile: true,
        });

        seasonsMock.mockResolvedValue({ ok: true, seasons: [tmdbSeason(1, 2)] });
        episodesMock.mockResolvedValue({
            ok: true,
            seasonNumber: 1,
            episodes: [
                tmdbEpisode(1, 1, "Pilot", "2024-01-01"),
                tmdbEpisode(1, 2, "New Episode", "2024-01-08"),
            ],
        });

        const result = await syncTitleEpisodesWorkflow(userId, {
            titleId: title.id,
            tmdbId: 95396,
            scope: "all",
            policy: { kind: "refresh", titleMonitored: true },
        });

        expect(result.ok).toBe(true);

        if (!result.ok) {
            throw new Error("sync failed");
        }

        expect(result.newEpisodeCount).toBe(1);

        const seasons = await listTvSeasonsForTitle(title.id);

        expect(seasons[0]?.monitored).toBe(false);

        const episodes = await listTvEpisodesForTitle(title.id);

        expect(
            episodes.map((episode) => ({
                episodeNumber: episode.episodeNumber,
                monitored: episode.monitored,
                hasFile: episode.hasFile,
                title: episode.title,
            })),
        ).toEqual([
            { episodeNumber: 1, monitored: false, hasFile: true, title: "Pilot" },
            { episodeNumber: 2, monitored: true, hasFile: false, title: "New Episode" },
        ]);
    });

    it("returns the TMDB failure without touching the library", async () => {
        const { userId, title } = await seedTitle();

        seasonsMock.mockResolvedValue({
            ok: false,
            reason: "tmdb-not-configured",
            message: "Verify a TMDB connection.",
        });

        const result = await syncTitleEpisodesWorkflow(userId, {
            titleId: title.id,
            tmdbId: 95396,
            scope: "all",
            policy: { kind: "selections", selections: { mode: "all" } },
        });

        expect(result).toMatchObject({ ok: false, reason: "tmdb-not-configured" });
        expect(await listTvSeasonsForTitle(title.id)).toHaveLength(0);
    });
});
