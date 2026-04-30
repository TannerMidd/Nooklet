import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  type NotificationChannelType,
  type NotificationEventType,
  notificationChannels,
} from "@/lib/database/schema";

export type StoredNotificationChannel = typeof notificationChannels.$inferSelect;

export type NotificationChannelView = {
  id: string;
  userId: string;
  channelType: NotificationChannelType;
  displayName: string;
  targetUrl: string;
  isEnabled: boolean;
  events: NotificationEventType[];
  lastDispatchAt: Date | null;
  lastDispatchStatus: string | null;
  lastDispatchMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const supportedEventTypes = new Set<NotificationEventType>([
  "recommendation_run_succeeded",
  "recommendation_run_failed",
  "library_add_failed",
  "watch_history_sync_failed",
]);

export function parseEventMaskJson(json: string | null | undefined): NotificationEventType[] {
  if (!json) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(json);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const events: NotificationEventType[] = [];
    const seen = new Set<NotificationEventType>();

    for (const entry of parsed) {
      if (typeof entry !== "string") {
        continue;
      }

      if (supportedEventTypes.has(entry as NotificationEventType) && !seen.has(entry as NotificationEventType)) {
        const event = entry as NotificationEventType;
        events.push(event);
        seen.add(event);
      }
    }

    return events;
  } catch {
    return [];
  }
}

function toView(channel: StoredNotificationChannel): NotificationChannelView {
  return {
    id: channel.id,
    userId: channel.userId,
    channelType: channel.channelType,
    displayName: channel.displayName,
    targetUrl: channel.targetUrl,
    isEnabled: channel.isEnabled,
    events: parseEventMaskJson(channel.eventMaskJson),
    lastDispatchAt: channel.lastDispatchAt,
    lastDispatchStatus: channel.lastDispatchStatus,
    lastDispatchMessage: channel.lastDispatchMessage,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
  };
}

export async function listNotificationChannelsForUser(userId: string): Promise<NotificationChannelView[]> {
  const database = ensureDatabaseReady();

  const rows = database
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.userId, userId))
    .orderBy(asc(notificationChannels.displayName))
    .all();

  return rows.map(toView);
}

export async function findNotificationChannelById(
  userId: string,
  id: string,
): Promise<NotificationChannelView | null> {
  const database = ensureDatabaseReady();

  const row =
    database
      .select()
      .from(notificationChannels)
      .where(and(eq(notificationChannels.userId, userId), eq(notificationChannels.id, id)))
      .get() ?? null;

  return row ? toView(row) : null;
}

export async function listEnabledNotificationChannelsForEvent(
  userId: string,
  eventType: NotificationEventType,
): Promise<NotificationChannelView[]> {
  const channels = await listNotificationChannelsForUser(userId);

  return channels.filter(
    (channel) => channel.isEnabled && channel.events.includes(eventType),
  );
}

type CreateNotificationChannelInput = {
  userId: string;
  channelType: NotificationChannelType;
  displayName: string;
  targetUrl: string;
  isEnabled: boolean;
  events: NotificationEventType[];
};

export async function createNotificationChannel(
  input: CreateNotificationChannelInput,
): Promise<NotificationChannelView> {
  const database = ensureDatabaseReady();
  const id = randomUUID();
  const now = new Date();

  database
    .insert(notificationChannels)
    .values({
      id,
      userId: input.userId,
      channelType: input.channelType,
      displayName: input.displayName,
      targetUrl: input.targetUrl,
      isEnabled: input.isEnabled,
      eventMaskJson: JSON.stringify(input.events),
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const created = await findNotificationChannelById(input.userId, id);

  if (!created) {
    throw new Error("Failed to load the notification channel after creation.");
  }

  return created;
}

type UpdateNotificationChannelInput = {
  userId: string;
  id: string;
  displayName?: string;
  targetUrl?: string;
  isEnabled?: boolean;
  events?: NotificationEventType[];
};

export async function updateNotificationChannel(
  input: UpdateNotificationChannelInput,
): Promise<NotificationChannelView | null> {
  const database = ensureDatabaseReady();

  const updates: Partial<typeof notificationChannels.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.displayName !== undefined) {
    updates.displayName = input.displayName;
  }

  if (input.targetUrl !== undefined) {
    updates.targetUrl = input.targetUrl;
  }

  if (input.isEnabled !== undefined) {
    updates.isEnabled = input.isEnabled;
  }

  if (input.events !== undefined) {
    updates.eventMaskJson = JSON.stringify(input.events);
  }

  database
    .update(notificationChannels)
    .set(updates)
    .where(and(eq(notificationChannels.userId, input.userId), eq(notificationChannels.id, input.id)))
    .run();

  return findNotificationChannelById(input.userId, input.id);
}

export async function recordNotificationDispatchResult(input: {
  channelId: string;
  status: "success" | "error";
  message: string | null;
}): Promise<void> {
  const database = ensureDatabaseReady();

  database
    .update(notificationChannels)
    .set({
      lastDispatchAt: new Date(),
      lastDispatchStatus: input.status,
      lastDispatchMessage: input.message,
      updatedAt: new Date(),
    })
    .where(eq(notificationChannels.id, input.channelId))
    .run();
}

export async function deleteNotificationChannel(userId: string, id: string): Promise<boolean> {
  const database = ensureDatabaseReady();

  const result = database
    .delete(notificationChannels)
    .where(and(eq(notificationChannels.userId, userId), eq(notificationChannels.id, id)))
    .run();

  return result.changes > 0;
}
