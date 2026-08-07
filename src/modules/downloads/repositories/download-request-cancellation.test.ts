import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { downloadQueueItems, serviceConnections, users } from "@/lib/database/schema";

import {
    checkpointDownloadRequestCancellation,
    createDownloadClient,
    createDownloadRequest,
    deferDownloadRequestCancellation,
    DOWNLOAD_REQUEST_CANCELLATION_RETRY_DELAY_MS,
    finalizeDownloadRequestCancellation,
    findDownloadRequestById,
    listActiveDownloadRequestsForImport,
    listPendingDownloadRequestCancellations,
    recordDownloadQueueItem,
} from "./download-repository";

async function seedUser() {
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

    return userId;
}

describe("download request cancellation persistence", () => {
    it("checkpoints before cleanup and finalizes request plus queue state with an exact CAS", async () => {
        const userId = await seedUser();
        const connectionId = randomUUID();

        ensureDatabaseReady()
            .insert(serviceConnections)
            .values({
                id: connectionId,
                serviceType: "usenet-server",
                ownerUserId: userId,
                displayName: "Usenet server",
                baseUrl: "news.example.test:563",
                status: "verified",
            })
            .run();
        const client = await createDownloadClient({
            userId,
            serviceConnectionId: connectionId,
            clientType: "nooklet",
            displayName: "Built-in downloader",
        });

        if (!client) {
            throw new Error("download client missing");
        }

        const request = await createDownloadRequest({
            userId,
            mediaType: "movie",
            requestedTitle: "Arrival",
            status: "queued",
            clientId: client?.id,
        });
        const queueItem = await recordDownloadQueueItem({
            requestId: request.id,
            userId,
            clientId: client?.id,
            externalQueueId: randomUUID(),
            status: "downloading",
        });
        const requestedAt = new Date("2026-07-16T18:00:00.000Z");

        const checkpoint = await checkpointDownloadRequestCancellation({
            userId,
            requestId: request.id,
            requestedAt,
        });

        expect(checkpoint).toMatchObject({
            id: request.id,
            status: "queued",
            cancellationRequestedAt: requestedAt,
            completedAt: null,
        });
        expect(await listPendingDownloadRequestCancellations()).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: request.id })]),
        );
        expect(await listActiveDownloadRequestsForImport(userId, client.id)).toEqual([]);

        await expect(
            deferDownloadRequestCancellation({
                userId,
                requestId: request.id,
                requestedAt,
                message: "The built-in downloader is temporarily unavailable.",
            }),
        ).resolves.toBe(true);
        const deferred = await findDownloadRequestById(userId, request.id);

        if (!deferred) {
            throw new Error("deferred request missing");
        }

        const retryDueAt = new Date(
            deferred.updatedAt.getTime() + DOWNLOAD_REQUEST_CANCELLATION_RETRY_DELAY_MS,
        );
        const freshRequest = await createDownloadRequest({
            userId,
            mediaType: "movie",
            requestedTitle: "Blade Runner",
            status: "queued",
            clientId: client.id,
        });

        await checkpointDownloadRequestCancellation({
            userId,
            requestId: freshRequest.id,
            requestedAt: deferred.updatedAt,
        });

        expect(
            await listPendingDownloadRequestCancellations(100, new Date(retryDueAt.getTime() - 1)),
        ).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: request.id })]));
        expect(await listPendingDownloadRequestCancellations(1, deferred.updatedAt)).toEqual([
            expect.objectContaining({ id: freshRequest.id }),
        ]);
        expect(await listPendingDownloadRequestCancellations(100, retryDueAt)).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: request.id })]),
        );

        await expect(
            finalizeDownloadRequestCancellation({
                userId,
                requestId: request.id,
                requestedAt: new Date(requestedAt.getTime() + 1),
            }),
        ).resolves.toBeNull();
        expect((await findDownloadRequestById(userId, request.id))?.status).toBe("queued");

        const finalized = await finalizeDownloadRequestCancellation({
            userId,
            requestId: request.id,
            requestedAt,
        });
        const storedQueueItem = ensureDatabaseReady()
            .select()
            .from(downloadQueueItems)
            .where(eq(downloadQueueItems.id, queueItem.id))
            .get();

        expect(finalized).toMatchObject({
            status: "cancelled",
            cancellationRequestedAt: requestedAt,
            statusMessage: "Removed from the download queue.",
        });
        expect(storedQueueItem?.status).toBe("failed");
        expect(storedQueueItem?.completedAt).toBeInstanceOf(Date);

        await expect(
            finalizeDownloadRequestCancellation({
                userId,
                requestId: freshRequest.id,
                requestedAt: deferred.updatedAt,
            }),
        ).resolves.not.toBeNull();
    });
});
