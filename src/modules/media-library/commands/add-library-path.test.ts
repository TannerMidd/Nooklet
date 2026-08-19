import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { auditEvents, mediaLibraries, users } from "@/lib/database/schema";
import { getYouTubeRequestOptions } from "@/modules/youtube/public";

import { addLibraryPathCommand, LibraryPathCommandError } from "./add-library-path";

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

describe("addLibraryPathCommand", () => {
    it("creates a library, path, and audit event", async () => {
        const userId = await seedUser();
        const libraryFolder = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-library-"));

        const libraryPath = await addLibraryPathCommand(userId, {
            mediaType: "movie",
            libraryName: "Movies",
            path: libraryFolder,
            label: "Movie root",
        });

        const storedLibrary = ensureDatabaseReady()
            .select()
            .from(mediaLibraries)
            .where(eq(mediaLibraries.id, libraryPath.libraryId))
            .get();
        const auditEvent = ensureDatabaseReady()
            .select()
            .from(auditEvents)
            .where(eq(auditEvents.subjectId, libraryPath.id))
            .get();

        expect(storedLibrary?.mediaType).toBe("movie");
        expect(storedLibrary?.name).toBe("Movies");
        expect(libraryPath.label).toBe("Movie root");
        expect(auditEvent?.eventType).toBe("media-library.path.created");
    });

    it("exposes a newly attached YouTube folder as a YouTube download destination", async () => {
        const userId = await seedUser();
        const libraryFolder = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-youtube-"));

        const libraryPath = await addLibraryPathCommand(userId, {
            mediaType: "youtube",
            libraryName: "YouTube",
            path: libraryFolder,
            label: "YouTube root",
        });

        const requestOptions = await getYouTubeRequestOptions(userId);
        const storedLibrary = ensureDatabaseReady()
            .select()
            .from(mediaLibraries)
            .where(eq(mediaLibraries.id, libraryPath.libraryId))
            .get();

        expect(storedLibrary?.mediaType).toBe("youtube");
        expect(requestOptions.destinations).toEqual([
            expect.objectContaining({
                id: libraryPath.id,
                label: "YouTube root",
                path: libraryPath.path,
            }),
        ]);
    });

    it("rejects a folder that does not exist", async () => {
        const userId = await seedUser();

        await expect(
            addLibraryPathCommand(userId, {
                mediaType: "tv",
                libraryName: "TV Shows",
                path: path.join(os.tmpdir(), `missing-${randomUUID()}`),
                label: "TV root",
            }),
        ).rejects.toThrow(LibraryPathCommandError);
    });

    it("rejects a folder that is already attached", async () => {
        const userId = await seedUser();
        const libraryFolder = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-library-"));

        await addLibraryPathCommand(userId, {
            mediaType: "movie",
            libraryName: "Movies",
            path: libraryFolder,
            label: "Movie root",
        });

        await expect(
            addLibraryPathCommand(userId, {
                mediaType: "movie",
                libraryName: "Movies",
                path: libraryFolder,
                label: "Movie root",
            }),
        ).rejects.toMatchObject({ code: "path_already_exists" });
    });
});
