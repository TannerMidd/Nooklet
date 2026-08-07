import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";

import {
    createDownloadRequest,
    discardPendingDownloadRequest,
    findDownloadRequestById,
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

describe("discardPendingDownloadRequest", () => {
    it("removes only a pre-submission reservation with no physical queue item", async () => {
        const userId = await seedUser();
        const disposable = await createDownloadRequest({
            userId,
            mediaType: "tv",
            requestedTitle: "Severance S01E01",
            status: "pending",
        });
        const submitted = await createDownloadRequest({
            userId,
            mediaType: "tv",
            requestedTitle: "Severance S01E02",
            status: "pending",
        });

        await recordDownloadQueueItem({
            userId,
            requestId: submitted.id,
            externalQueueId: "physical-job",
            status: "queued",
        });

        await expect(
            discardPendingDownloadRequest({
                userId,
                requestId: disposable.id,
            }),
        ).resolves.toBe(true);
        await expect(
            discardPendingDownloadRequest({
                userId,
                requestId: submitted.id,
            }),
        ).resolves.toBe(false);

        expect(await findDownloadRequestById(userId, disposable.id)).toBeNull();
        expect(await findDownloadRequestById(userId, submitted.id)).not.toBeNull();
    });
});
