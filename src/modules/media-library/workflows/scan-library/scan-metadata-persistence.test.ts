import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { mediaLibraryPaths, mediaScanRuns, users } from "@/lib/database/schema";
import {
    addMediaLibraryPath,
    createMediaLibrary,
} from "@/modules/media-library/repositories/media-library-repository";

import { persistLibraryScanMetadata } from "./scan-metadata-persistence";

describe("persistLibraryScanMetadata", () => {
    it("records a successful zero-file scan and advances the path scan timestamp", async () => {
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
        const library = await createMediaLibrary({
            userId,
            mediaType: "movie",
            name: "Movies",
        });
        const libraryPath = await addMediaLibraryPath({
            userId,
            libraryId: library.id,
            path: `E:/Empty/${randomUUID()}`,
            label: "Empty",
        });
        const startedAt = Date.now();

        const result = await persistLibraryScanMetadata(userId, {
            sources: [{ library, path: libraryPath }],
            failedPaths: [],
            discoveredFileCount: 0,
            matchedTitleCount: 0,
            pathStats: [
                {
                    libraryId: library.id,
                    libraryPathId: libraryPath.id,
                    discoveredFileCount: 0,
                    matchedTitleCount: 0,
                },
            ],
        });

        expect(result.scanRunIds).toHaveLength(1);
        const storedPath = database
            .select()
            .from(mediaLibraryPaths)
            .where(eq(mediaLibraryPaths.id, libraryPath.id))
            .get();
        const scanRun = database
            .select()
            .from(mediaScanRuns)
            .where(eq(mediaScanRuns.id, result.scanRunIds[0]!))
            .get();

        expect(storedPath?.lastScannedAt?.getTime()).toBeGreaterThanOrEqual(startedAt);
        expect(scanRun).toMatchObject({
            status: "succeeded",
            discoveredFileCount: 0,
            matchedTitleCount: 0,
        });
    });
});
