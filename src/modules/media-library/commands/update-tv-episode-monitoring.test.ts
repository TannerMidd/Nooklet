import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { auditEvents, users } from "@/lib/database/schema";
import {
    createMediaLibrary,
    createTvEpisode,
    createTvSeason,
    upsertMediaTitle,
} from "@/modules/media-library/repositories/media-library-repository";

import {
    updateTvEpisodeMonitoringCommand,
    UpdateTvEpisodeMonitoringCommandError,
} from "./update-tv-episode-monitoring";

async function seedUser() {
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

    return userId;
}

beforeEach(() => {
    ensureDatabaseReady();
});

describe("updateTvEpisodeMonitoringCommand", () => {
    it("updates monitoring for a user-owned TV episode", async () => {
        const userId = await seedUser();
        const library = await createMediaLibrary({
            userId,
            mediaType: "tv",
            name: "TV Shows",
            isDefault: true,
        });
        const title = await upsertMediaTitle({
            userId,
            libraryId: library.id,
            mediaType: "tv",
            title: "Severance",
            sortTitle: "severance",
            normalizedKey: "severance::2022",
            year: 2022,
        });

        if (!title) {
            throw new Error("title missing");
        }

        const season = await createTvSeason({ titleId: title.id, seasonNumber: 1 });
        const episode = await createTvEpisode({
            titleId: title.id,
            seasonId: season.id,
            seasonNumber: 1,
            episodeNumber: 1,
            monitored: true,
        });

        const result = await updateTvEpisodeMonitoringCommand(userId, {
            episodeId: episode.id,
            monitored: false,
        });
        const auditEvent = ensureDatabaseReady()
            .select()
            .from(auditEvents)
            .where(eq(auditEvents.subjectId, episode.id))
            .get();

        expect(result.episode.monitored).toBe(false);
        expect(result.title.id).toBe(title.id);
        expect(auditEvent?.eventType).toBe("media-library.tv-episode.monitoring.updated");
    });

    it("rejects episodes that do not belong to the user", async () => {
        const userId = await seedUser();
        const otherUserId = await seedUser();
        const library = await createMediaLibrary({
            userId: otherUserId,
            mediaType: "tv",
            name: "TV Shows",
            isDefault: true,
        });
        const title = await upsertMediaTitle({
            userId: otherUserId,
            libraryId: library.id,
            mediaType: "tv",
            title: "Severance",
            sortTitle: "severance",
            normalizedKey: "severance::2022",
            year: 2022,
        });

        if (!title) {
            throw new Error("title missing");
        }

        const season = await createTvSeason({ titleId: title.id, seasonNumber: 1 });
        const episode = await createTvEpisode({
            titleId: title.id,
            seasonId: season.id,
            seasonNumber: 1,
            episodeNumber: 1,
        });

        await expect(
            updateTvEpisodeMonitoringCommand(userId, {
                episodeId: episode.id,
                monitored: true,
            }),
        ).rejects.toThrow(UpdateTvEpisodeMonitoringCommandError);
    });
});
