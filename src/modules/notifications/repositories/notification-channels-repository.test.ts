import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { notificationChannels, users } from "@/lib/database/schema";
import { decryptSecret } from "@/lib/security/secret-box";
import { eq } from "drizzle-orm";

import {
    createNotificationChannel,
    deleteNotificationChannel,
    findNotificationChannelById,
    findNotificationChannelForDispatch,
    listEnabledNotificationChannelsForEvent,
    listNotificationChannelsForUser,
    recordNotificationDispatchResult,
    updateNotificationChannel,
} from "./notification-channels-repository";

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

describe("notification-channels-repository", () => {
    it("creates a channel with deduplicated events and lists it back through the join", async () => {
        const userId = await seedUser();

        const created = await createNotificationChannel({
            userId,
            channelType: "webhook",
            displayName: "Ops",
            targetUrl: "https://example.com/hook",
            isEnabled: true,
            events: [
                "recommendation_run_succeeded",
                "recommendation_run_failed",
                "recommendation_run_succeeded",
            ],
        });

        expect(new Set(created.events)).toEqual(
            new Set(["recommendation_run_succeeded", "recommendation_run_failed"]),
        );

        const list = await listNotificationChannelsForUser(userId);

        expect(list).toHaveLength(1);
        expect(list[0]?.maskedTargetUrl).toBe("https://[hidden]");
        expect(list[0]).not.toHaveProperty("targetUrl");
        expect(new Set(list[0]?.events)).toEqual(
            new Set(["recommendation_run_succeeded", "recommendation_run_failed"]),
        );

        const stored = ensureDatabaseReady()
            .select({ targetUrl: notificationChannels.targetUrl })
            .from(notificationChannels)
            .where(eq(notificationChannels.id, created.id))
            .get();

        expect(stored?.targetUrl).not.toBe("https://example.com/hook");
        expect(decryptSecret(stored!.targetUrl)).toBe("https://example.com/hook");
    });

    it("lazily encrypts a legacy plaintext target URL", async () => {
        const userId = await seedUser();
        const id = randomUUID();
        const database = ensureDatabaseReady();

        database
            .insert(notificationChannels)
            .values({
                id,
                userId,
                channelType: "webhook",
                displayName: "Legacy",
                targetUrl: "https://example.com/legacy-token",
            })
            .run();

        const channel = await findNotificationChannelById(userId, id);

        expect(channel?.maskedTargetUrl).toBe("https://[hidden]");
        expect(channel).not.toHaveProperty("targetUrl");

        const stored = database
            .select({ targetUrl: notificationChannels.targetUrl })
            .from(notificationChannels)
            .where(eq(notificationChannels.id, id))
            .get();

        expect(stored?.targetUrl).toMatch(/^v1:/);
        expect(decryptSecret(stored!.targetUrl)).toBe("https://example.com/legacy-token");

        const dispatchChannel = await findNotificationChannelForDispatch(userId, id);

        expect(dispatchChannel?.targetUrl).toBe("https://example.com/legacy-token");
    });

    it("filters enabled channels by event subscription via the events join", async () => {
        const userId = await seedUser();

        const onlySuccess = await createNotificationChannel({
            userId,
            channelType: "webhook",
            displayName: "OnlySuccess",
            targetUrl: "https://example.com/a",
            isEnabled: true,
            events: ["recommendation_run_succeeded"],
        });

        const disabled = await createNotificationChannel({
            userId,
            channelType: "webhook",
            displayName: "Disabled",
            targetUrl: "https://example.com/b",
            isEnabled: false,
            events: ["recommendation_run_succeeded"],
        });

        const both = await createNotificationChannel({
            userId,
            channelType: "webhook",
            displayName: "Both",
            targetUrl: "https://example.com/c",
            isEnabled: true,
            events: ["recommendation_run_succeeded", "recommendation_run_failed"],
        });

        const successSubscribers = await listEnabledNotificationChannelsForEvent(
            userId,
            "recommendation_run_succeeded",
        );
        const successIds = successSubscribers.map((row) => row.id).sort();

        expect(successIds).toEqual([onlySuccess.id, both.id].sort());
        expect(successIds).not.toContain(disabled.id);

        const failureSubscribers = await listEnabledNotificationChannelsForEvent(
            userId,
            "recommendation_run_failed",
        );

        expect(failureSubscribers.map((row) => row.id)).toEqual([both.id]);
    });

    it("replaces the event subscription set on update", async () => {
        const userId = await seedUser();

        const created = await createNotificationChannel({
            userId,
            channelType: "webhook",
            displayName: "Ops",
            targetUrl: "https://example.com/hook",
            isEnabled: true,
            events: ["recommendation_run_succeeded"],
        });

        await updateNotificationChannel({
            userId,
            id: created.id,
            events: ["recommendation_run_failed", "library_add_failed"],
        });

        const reloaded = await findNotificationChannelById(userId, created.id);

        expect(reloaded).not.toBeNull();
        expect(new Set(reloaded?.events)).toEqual(
            new Set(["recommendation_run_failed", "library_add_failed"]),
        );
    });

    it("does not replace another user's event subscriptions when given their channel id", async () => {
        const ownerUserId = await seedUser();
        const attackerUserId = await seedUser();
        const victim = await createNotificationChannel({
            userId: ownerUserId,
            channelType: "webhook",
            displayName: "Owner alerts",
            targetUrl: "https://example.com/owner-hook",
            isEnabled: true,
            events: ["recommendation_run_succeeded", "library_add_failed"],
        });

        const result = await updateNotificationChannel({
            userId: attackerUserId,
            id: victim.id,
            events: ["recommendation_run_failed"],
        });

        expect(result).toBeNull();
        const reloaded = await findNotificationChannelById(ownerUserId, victim.id);

        expect(new Set(reloaded?.events)).toEqual(
            new Set(["recommendation_run_succeeded", "library_add_failed"]),
        );
    });

    it("records dispatch outcomes into the audit table and returns the latest as the view's lastDispatch fields", async () => {
        const userId = await seedUser();

        const created = await createNotificationChannel({
            userId,
            channelType: "webhook",
            displayName: "Ops",
            targetUrl: "https://example.com/hook",
            isEnabled: true,
            events: ["recommendation_run_succeeded"],
        });

        await recordNotificationDispatchResult({
            channelId: created.id,
            status: "error",
            message: "old failure",
        });

        // Ensure strict ordering even on coarse clocks.
        await new Promise((resolve) => setTimeout(resolve, 5));

        await recordNotificationDispatchResult({
            channelId: created.id,
            status: "success",
            message: "delivered",
        });

        const reloaded = await findNotificationChannelById(userId, created.id);

        expect(reloaded?.lastDispatchStatus).toBe("success");
        expect(reloaded?.lastDispatchMessage).toBe("delivered");
        expect(reloaded?.lastDispatchAt).toBeInstanceOf(Date);
    });

    it("cascades the channel deletion to event and audit child rows", async () => {
        const userId = await seedUser();

        const created = await createNotificationChannel({
            userId,
            channelType: "webhook",
            displayName: "Ops",
            targetUrl: "https://example.com/hook",
            isEnabled: true,
            events: ["recommendation_run_succeeded"],
        });

        await recordNotificationDispatchResult({
            channelId: created.id,
            status: "success",
            message: null,
        });

        const removed = await deleteNotificationChannel(userId, created.id);

        expect(removed).toBe(true);

        const reloaded = await findNotificationChannelById(userId, created.id);

        expect(reloaded).toBeNull();

        // The join used by the listing endpoint must not surface ghost rows.
        const enabled = await listEnabledNotificationChannelsForEvent(
            userId,
            "recommendation_run_succeeded",
        );

        expect(enabled.find((row) => row.id === created.id)).toBeUndefined();
    });
});
