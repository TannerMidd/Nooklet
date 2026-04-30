import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  type NotificationChannelType,
  type NotificationEventType,
  notificationChannelEvents,
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

function loadEventsForChannelIds(channelIds: string[]): Map<string, NotificationEventType[]> {
  const events = new Map<string, NotificationEventType[]>();

  if (channelIds.length === 0) {
    return events;
  }

  const database = ensureDatabaseReady();
  const rows = database
    .select()
    .from(notificationChannelEvents)
    .where(inArray(notificationChannelEvents.channelId, channelIds))
    .all();

  for (const row of rows) {
    const list = events.get(row.channelId) ?? [];
    list.push(row.eventType);
    events.set(row.channelId, list);
  }

  return events;
}

function toView(channel: StoredNotificationChannel, events: NotificationEventType[]): NotificationChannelView {
  return {
    id: channel.id,
    userId: channel.userId,
    channelType: channel.channelType,
    displayName: channel.displayName,
    targetUrl: channel.targetUrl,
    isEnabled: channel.isEnabled,
    events,
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

  const events = loadEventsForChannelIds(rows.map((row) => row.id));

  return rows.map((row) => toView(row, events.get(row.id) ?? []));
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

  if (!row) {
    return null;
  }

  const events = loadEventsForChannelIds([row.id]);
  return toView(row, events.get(row.id) ?? []);
}

export async function listEnabledNotificationChannelsForEvent(
  userId: string,
  eventType: NotificationEventType,
): Promise<NotificationChannelView[]> {
  const database = ensureDatabaseReady();

  const rows = database
    .select({
      channel: notificationChannels,
    })
    .from(notificationChannels)
    .innerJoin(notificationChannelEvents, eq(notificationChannelEvents.channelId, notificationChannels.id))
    .where(
      and(
        eq(notificationChannels.userId, userId),
        eq(notificationChannels.isEnabled, true),
        eq(notificationChannelEvents.eventType, eventType),
      ),
    )
    .orderBy(asc(notificationChannels.displayName))
    .all();

  const channels = rows.map((row) => row.channel);
  const events = loadEventsForChannelIds(channels.map((channel) => channel.id));

  return channels.map((channel) => toView(channel, events.get(channel.id) ?? []));
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

  database.transaction((tx) => {
    tx
      .insert(notificationChannels)
      .values({
        id,
        userId: input.userId,
        channelType: input.channelType,
        displayName: input.displayName,
        targetUrl: input.targetUrl,
        isEnabled: input.isEnabled,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const unique = Array.from(new Set(input.events));
    if (unique.length > 0) {
      tx
        .insert(notificationChannelEvents)
        .values(unique.map((eventType) => ({ channelId: id, eventType })))
        .run();
    }
  });

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

  database.transaction((tx) => {
    tx
      .update(notificationChannels)
      .set(updates)
      .where(and(eq(notificationChannels.userId, input.userId), eq(notificationChannels.id, input.id)))
      .run();

    if (input.events !== undefined) {
      tx
        .delete(notificationChannelEvents)
        .where(eq(notificationChannelEvents.channelId, input.id))
        .run();

      const unique = Array.from(new Set(input.events));
      if (unique.length > 0) {
        tx
          .insert(notificationChannelEvents)
          .values(unique.map((eventType) => ({ channelId: input.id, eventType })))
          .run();
      }
    }
  });

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
