import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import {
    createMediaLibrary,
    createTvSeason,
    upsertMediaTitle,
} from "@/modules/media-library/repositories/media-library-repository";
import {
    createOrGetOpenSeasonFulfillment,
    updateDownloadFulfillment,
} from "./season-fulfillment-repository";
import {
    checkpointDownloadRequestCancellationForTitleRetirement,
    createDownloadRequest,
    deferDownloadRequestCancellation,
    finalizeDownloadRequestCancellation,
    findDownloadRequestById,
    listDownloadRequestsBlockingTitleRemoval,
    listPendingDownloadRequestCancellations,
    recordDownloadQueueItem,
} from "./download-repository";

async function seedTvTitle() {
    const userId = randomUUID();

    ensureDatabaseReady()
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
        mediaType: "tv",
        name: `TV ${userId}`,
        isDefault: true,
    });
    const title = await upsertMediaTitle({
        userId,
        libraryId: library.id,
        mediaType: "tv",
        title: "Duplicate Show",
        sortTitle: "duplicate show",
        normalizedKey: `duplicate-show::${userId}`,
        year: 2020,
    });

    if (!title) {
        throw new Error("title missing");
    }

    const season = await createTvSeason({ titleId: title.id, seasonNumber: 2 });
    const fulfillment = await createOrGetOpenSeasonFulfillment({
        userId,
        mediaTitleId: title.id,
        seasonId: season.id,
        requestedTitle: "Duplicate Show S02",
    });

    return { userId, title, season, fulfillment };
}

describe("title-retirement download cancellation", () => {
    it("leaves an active request attached to its cancellable season plan", async () => {
        const { userId, title, season, fulfillment } = await seedTvTitle();
        const request = await createDownloadRequest({
            userId,
            mediaType: "tv",
            requestedTitle: "Duplicate Show S02",
            mediaTitleId: title.id,
            seasonId: season.id,
            fulfillmentId: fulfillment.id,
            status: "queued",
        });

        const checkpoint = await checkpointDownloadRequestCancellationForTitleRetirement({
            userId,
            requestId: request.id,
            mediaTitleId: title.id,
        });

        expect(checkpoint).toMatchObject({
            id: request.id,
            fulfillmentId: fulfillment.id,
            cancellationRequestedAt: null,
        });
    });

    it("adopts active downloader work stranded under terminal request and plan rows", async () => {
        const { userId, title, season, fulfillment } = await seedTvTitle();

        await updateDownloadFulfillment({
            userId,
            fulfillmentId: fulfillment.id,
            status: "cancelled",
            nextAttemptAt: null,
            completedAt: new Date(),
        });
        const request = await createDownloadRequest({
            userId,
            mediaType: "tv",
            requestedTitle: "Duplicate Show S02",
            mediaTitleId: title.id,
            seasonId: season.id,
            fulfillmentId: fulfillment.id,
            status: "succeeded",
        });

        await recordDownloadQueueItem({
            requestId: request.id,
            userId,
            externalQueueId: randomUUID(),
            status: "downloading",
        });
        const requestedAt = new Date("2026-07-20T20:00:00.000Z");

        const checkpoint = await checkpointDownloadRequestCancellationForTitleRetirement({
            userId,
            requestId: request.id,
            mediaTitleId: title.id,
            requestedAt,
        });

        expect(checkpoint).toMatchObject({
            id: request.id,
            fulfillmentId: null,
            cancellationRequestedAt: requestedAt,
            status: "succeeded",
        });
        expect(await listPendingDownloadRequestCancellations()).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: request.id })]),
        );
        expect(await listDownloadRequestsBlockingTitleRemoval(userId, title.id)).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: request.id })]),
        );
        await expect(
            deferDownloadRequestCancellation({
                userId,
                requestId: request.id,
                requestedAt,
                message: "Cleanup will retry.",
            }),
        ).resolves.toBe(true);
        await expect(
            finalizeDownloadRequestCancellation({
                userId,
                requestId: request.id,
                requestedAt,
            }),
        ).resolves.toMatchObject({
            id: request.id,
            status: "cancelled",
        });
    });

    it("cannot checkpoint another title's request", async () => {
        const { userId, title, season, fulfillment } = await seedTvTitle();
        const request = await createDownloadRequest({
            userId,
            mediaType: "tv",
            requestedTitle: "Duplicate Show S02",
            mediaTitleId: title.id,
            seasonId: season.id,
            fulfillmentId: fulfillment.id,
            status: "queued",
        });

        await expect(
            checkpointDownloadRequestCancellationForTitleRetirement({
                userId,
                requestId: request.id,
                mediaTitleId: randomUUID(),
            }),
        ).resolves.toBeNull();
        expect(await findDownloadRequestById(userId, request.id)).toMatchObject({
            fulfillmentId: fulfillment.id,
            cancellationRequestedAt: null,
        });
    });
});
