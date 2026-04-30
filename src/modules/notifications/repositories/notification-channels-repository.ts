import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  type NotificationChannelType,
  type NotificationDispatchStatus,
  type NotificationEventType,
  notificationChannelEvents,
  notificationChannels,
  notificationDispatchAudit,
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
  lastDispatchStatus: NotificationDispatchStatus | null;
  lastDispatchMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LatestDispatchRow = {
  channelId: string;
  dispatchedAt: Date;
  status: NotificationDispatchStatus;
  message: string | null;
};

function loadLatestDispatchByChannelIds(channelIds: string[]): Map<string, LatestDispatchRow> {
  const result = new Map<string, LatestDispatchRow>();

  if (channelIds.length === 0) {
    return result;
  }

  const database = ensureDatabaseReady();
  const rows = database
    .select()
    .from(notificationDispatchAudit)
    .where(inArray(notificationDispatchAudit.channelId, channelIds))
    .orderBy(desc(notificationDispatchAudit.dispatchedAt))
    .all();

  for (const row of rows) {
    if (result.has(row.channelId)) {
      continue;
    }

    result.set(row.channelId, {
      channelId: row.channelId,
      dispatchedAt: row.dispatchedAt,
      status: row.status,
      message: row.message,
    });
  }

  return result;
}

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

function toView(
  channel: StoredNotificationChannel,
  events: NotificationEventType[],
  latestDispatch: LatestDispatchRow | undefined,
): NotificationChannelView {
  return {
    id: channel.id,
    userId: channel.userId,
    channelType: channel.channelType,
    displayName: channel.displayName,
    targetUrl: channel.targetUrl,
    isEnabled: channel.isEnabled,
    events,
    lastDispatchAt: latestDispatch?.dispatchedAt ?? null,
    lastDispatchStatus: latestDispatch?.status ?? null,
    lastDispatchMessage: latestDispatch?.message ?? null,
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
  const dispatches = loadLatestDispatchByChannelIds(rows.map((row) => row.id));

  return rows.map((row) => toView(row, events.get(row.id) ?? [], dispatches.get(row.id)));
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
  const dispatches = loadLatestDispatchByChannelIds([row.id]);
  return toView(row, events.get(row.id) ?? [], dispatches.get(row.id));
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
  const dispatches = loadLatestDispatchByChannelIds(channels.map((channel) => channel.id));

  return channels.map((channel) => toView(channel, events.get(channel.id) ?? [], dispatches.get(channel.id)));
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
  status: NotificationDispatchStatus;
  message: string | null;
}): Promise<void> {
  const database = ensureDatabaseReady();
  const now = new Date();

  database.transaction((tx) => {
    tx
      .insert(notificationDispatchAudit)
      .values({
        id: randomUUID(),
        channelId: input.channelId,
        dispatchedAt: now,
        status: input.status,
        message: input.message,
      })
      .run();

    tx
      .update(notificationChannels)
      .set({ updatedAt: now })
      .where(eq(notificationChannels.id, input.channelId))
      .run();
  });
}

export async function deleteNotificationChannel(userId: string, id: string): Promise<boolean> {
  const database = ensureDatabaseReady();

  const result = database
    .delete(notificationChannels)
    .where(and(eq(notificationChannels.userId, userId), eq(notificationChannels.id, id)))
    .run();

  return result.changes > 0;
}
