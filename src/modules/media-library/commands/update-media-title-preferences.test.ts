import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { auditEvents, users } from "@/lib/database/schema";
import {
    createMediaLibrary,
    upsertMediaTitle,
} from "@/modules/media-library/repositories/media-library-repository";

import {
    updateMediaTitlePreferencesCommand,
    UpdateMediaTitlePreferencesCommandError,
} from "./update-media-title-preferences";

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

describe("updateMediaTitlePreferencesCommand", () => {
    it("updates monitored and quality profile for a user title", async () => {
        const userId = await seedUser();
        const library = await createMediaLibrary({
            userId,
            mediaType: "movie",
            name: "Movies",
            isDefault: true,
        });
        const title = await upsertMediaTitle({
            userId,
            libraryId: library.id,
            mediaType: "movie",
            title: "Arrival",
            sortTitle: "arrival",
            normalizedKey: "arrival::2016",
            year: 2016,
            monitored: true,
            qualityProfile: "hd-1080p",
        });

        const updatedTitle = await updateMediaTitlePreferencesCommand(userId, {
            titleId: title!.id,
            monitored: false,
            qualityProfile: "uhd-2160p",
        });
        const auditEvent = ensureDatabaseReady()
            .select()
            .from(auditEvents)
            .where(eq(auditEvents.subjectId, updatedTitle.id))
            .get();

        expect(updatedTitle.monitored).toBe(false);
        expect(updatedTitle.qualityProfile).toBe("uhd-2160p");
        expect(auditEvent?.eventType).toBe("media-library.title.preferences.updated");
    });

    it("rejects titles that do not belong to the user", async () => {
        const userId = await seedUser();
        const otherUserId = await seedUser();
        const library = await createMediaLibrary({
            userId: otherUserId,
            mediaType: "movie",
            name: "Movies",
            isDefault: true,
        });
        const title = await upsertMediaTitle({
            userId: otherUserId,
            libraryId: library.id,
            mediaType: "movie",
            title: "Arrival",
            sortTitle: "arrival",
            normalizedKey: "arrival::2016",
            year: 2016,
        });

        await expect(
            updateMediaTitlePreferencesCommand(userId, {
                titleId: title!.id,
                monitored: true,
                qualityProfile: "hd-1080p",
            }),
        ).rejects.toThrow(UpdateMediaTitlePreferencesCommandError);
    });
});
