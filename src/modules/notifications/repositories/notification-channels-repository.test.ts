import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";

import {
  createNotificationChannel,
  deleteNotificationChannel,
  findNotificationChannelById,
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
    expect(new Set(list[0]?.events)).toEqual(
      new Set(["recommendation_run_succeeded", "recommendation_run_failed"]),
    );
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
