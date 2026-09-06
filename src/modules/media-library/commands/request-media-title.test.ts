import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { auditEvents, mediaTitleExternalIds, mediaTitles, users } from "@/lib/database/schema";
import {
    addMediaLibraryPath,
    createMediaLibrary,
} from "@/modules/media-library/repositories/media-library-repository";

import { requestMediaTitleCommand, RequestMediaTitleCommandError } from "./request-media-title";

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

describe("requestMediaTitleCommand", () => {
    it("adds a title with monitoring, quality profile, metadata, and TMDB external id", async () => {
        const userId = await seedUser();
        const library = await createMediaLibrary({
            userId,
            mediaType: "movie",
            name: "Movies",
            isDefault: true,
        });
        const libraryPath = await addMediaLibraryPath({
            libraryId: library.id,
            userId,
            path: "F:/Media/Movies",
            label: "Movie drive",
        });

        const title = await requestMediaTitleCommand(userId, {
            mediaType: "movie",
            libraryId: library.id,
            targetLibraryPathId: libraryPath.id,
            tmdbId: 329865,
            title: "Arrival",
            year: 2016,
            monitored: true,
            qualityProfile: "uhd-2160p",
            overview: "A linguist works with aliens.",
            posterUrl: "https://images.example/arrival.jpg",
            backdropUrl: "https://images.example/arrival-backdrop.jpg",
            runtimeMinutes: 116,
            originalLanguage: "en",
        });
        const externalIds = ensureDatabaseReady()
            .select()
            .from(mediaTitleExternalIds)
            .where(eq(mediaTitleExternalIds.titleId, title.id))
            .all();
        const auditEvent = ensureDatabaseReady()
            .select()
            .from(auditEvents)
            .where(eq(auditEvents.subjectId, title.id))
            .get();

        expect(title).toMatchObject({
            libraryId: library.id,
            title: "Arrival",
            mediaType: "movie",
            year: 2016,
            status: "requested",
            monitored: true,
            qualityProfile: "uhd-2160p",
            overview: "A linguist works with aliens.",
            posterUrl: "https://images.example/arrival.jpg",
            runtimeMinutes: 116,
            originalLanguage: "en",
        });
        expect(externalIds).toEqual([expect.objectContaining({ source: "tmdb", value: "329865" })]);
        expect(auditEvent?.eventType).toBe("media-library.title.requested");
        expect(JSON.parse(auditEvent?.payloadJson ?? "{}")).toMatchObject({
            targetLibraryPathId: libraryPath.id,
        });
    });

    it("preserves existing external ids when a rerequest omits TMDB", async () => {
        const userId = await seedUser();
        const library = await createMediaLibrary({
            userId,
            mediaType: "movie",
            name: "Movies",
            isDefault: true,
        });

        const initialTitle = await requestMediaTitleCommand(userId, {
            mediaType: "movie",
            libraryId: library.id,
            tmdbId: 329865,
            title: "Arrival",
            year: 2016,
            monitored: true,
            qualityProfile: "hd-1080p",
        });

        await requestMediaTitleCommand(userId, {
            mediaType: "movie",
            libraryId: library.id,
            title: "Arrival",
            year: 2016,
            monitored: true,
            qualityProfile: "hd-1080p",
        });

        const externalIds = ensureDatabaseReady()
            .select()
            .from(mediaTitleExternalIds)
            .where(eq(mediaTitleExternalIds.titleId, initialTitle.id))
            .all();

        expect(externalIds).toEqual([expect.objectContaining({ source: "tmdb", value: "329865" })]);
    });

    it("uses the selected target path library when no library is submitted", async () => {
        const userId = await seedUser();
        const library = await createMediaLibrary({
            userId,
            mediaType: "movie",
            name: "Movies",
            isDefault: true,
        });
        const libraryPath = await addMediaLibraryPath({
            libraryId: library.id,
            userId,
            path: "F:/Media/Movies",
            label: "Movie drive",
        });

        const title = await requestMediaTitleCommand(userId, {
            mediaType: "movie",
            targetLibraryPathId: libraryPath.id,
            title: "Arrival",
            year: 2016,
            monitored: true,
            qualityProfile: "hd-1080p",
        });

        expect(title.libraryId).toBe(library.id);
    });

    it("returns the committed title when the post-commit audit is unavailable", async () => {
        const userId = await seedUser();
        const library = await createMediaLibrary({
            userId,
            mediaType: "movie",
            name: "Movies",
            isDefault: true,
        });
        const database = ensureDatabaseReady();

        database.run(sql`
            create trigger request_media_title_audit_failure
            before insert on audit_events
            when new.event_type = 'media-library.title.requested'
            begin
                select raise(abort, 'synthetic audit failure');
            end
        `);

        try {
            const title = await requestMediaTitleCommand(userId, {
                mediaType: "movie",
                libraryId: library.id,
                title: "Audit failure title",
                year: 2026,
                monitored: true,
                qualityProfile: "hd-1080p",
            });

            expect(title).toMatchObject({
                userId,
                libraryId: library.id,
                title: "Audit failure title",
            });
        } finally {
            database.run(sql`drop trigger request_media_title_audit_failure`);
        }

        expect(
            database.select().from(mediaTitles).where(eq(mediaTitles.userId, userId)).all(),
        ).toHaveLength(1);
    });

    it("rejects libraries that do not belong to the user or media type", async () => {
        const userId = await seedUser();
        const otherUserId = await seedUser();
        const library = await createMediaLibrary({
            userId: otherUserId,
            mediaType: "tv",
            name: "TV",
            isDefault: true,
        });

        await expect(
            requestMediaTitleCommand(userId, {
                mediaType: "movie",
                libraryId: library.id,
                title: "Arrival",
                year: 2016,
                monitored: true,
                qualityProfile: "hd-1080p",
            }),
        ).rejects.toThrow(RequestMediaTitleCommandError);
    });

    it("rejects target paths that do not match the requested media type", async () => {
        const userId = await seedUser();
        const tvLibrary = await createMediaLibrary({
            userId,
            mediaType: "tv",
            name: "TV",
            isDefault: true,
        });
        const tvPath = await addMediaLibraryPath({
            libraryId: tvLibrary.id,
            userId,
            path: "G:/Media/TV",
            label: "TV drive",
        });

        await expect(
            requestMediaTitleCommand(userId, {
                mediaType: "movie",
                targetLibraryPathId: tvPath.id,
                title: "Arrival",
                year: 2016,
                monitored: true,
                qualityProfile: "hd-1080p",
            }),
        ).rejects.toThrow(RequestMediaTitleCommandError);
    });
});
