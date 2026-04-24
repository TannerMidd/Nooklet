import { eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  preferences,
  type PreferenceMediaMode,
  type WatchHistorySourceType,
  watchHistorySourceTypes,
} from "@/lib/database/schema";

type StoredPreferenceRecord = typeof preferences.$inferSelect;

export type PreferenceRecord = Omit<StoredPreferenceRecord, "watchHistorySourceTypesJson"> & {
  watchHistorySourceTypes: WatchHistorySourceType[];
};

function parseWatchHistorySourceTypes(metadataJson: string | null | undefined) {
  if (!metadataJson) {
    return [...watchHistorySourceTypes];
  }

  try {
    const parsed = JSON.parse(metadataJson) as unknown;

    if (!Array.isArray(parsed)) {
      return [...watchHistorySourceTypes];
    }

    const allowedTypes = new Set<string>(watchHistorySourceTypes);
    const normalizedTypes = parsed.filter(
      (entry): entry is WatchHistorySourceType =>
        typeof entry === "string" && allowedTypes.has(entry),
    );

    return normalizedTypes.length > 0
      ? Array.from(new Set(normalizedTypes))
      : [...watchHistorySourceTypes];
  } catch {
    return [...watchHistorySourceTypes];
  }
}

function serializeWatchHistorySourceTypes(sourceTypes: WatchHistorySourceType[]) {
  return JSON.stringify(Array.from(new Set(sourceTypes)));
}

function mapPreferenceRecord(record: StoredPreferenceRecord): PreferenceRecord {
  const { watchHistorySourceTypesJson, ...rest } = record;

  return {
    ...rest,
    watchHistorySourceTypes: parseWatchHistorySourceTypes(watchHistorySourceTypesJson),
  };
}

export const defaultPreferenceValues: Omit<PreferenceRecord, "userId" | "updatedAt"> = {
  defaultMediaMode: "tv",
  defaultResultCount: 10,
  watchHistoryOnly: false,
  watchHistorySourceTypes: [...watchHistorySourceTypes],
  historyHideExisting: false,
  historyHideLiked: false,
  historyHideDisliked: false,
  historyHideHidden: true,
};

export async function getPreferencesByUserId(userId: string) {
  const database = ensureDatabaseReady();

  const record =
    database.select().from(preferences).where(eq(preferences.userId, userId)).get() ?? null;

  if (record) {
    return mapPreferenceRecord(record);
  }

  return {
    userId,
    ...defaultPreferenceValues,
    updatedAt: new Date(0),
  } satisfies PreferenceRecord;
}

type UpsertPreferencesInput = {
  userId: string;
  defaultMediaMode: PreferenceMediaMode;
  defaultResultCount: number;
  watchHistoryOnly: boolean;
  watchHistorySourceTypes: WatchHistorySourceType[];
  historyHideExisting: boolean;
  historyHideLiked: boolean;
  historyHideDisliked: boolean;
  historyHideHidden: boolean;
};

export async function upsertPreferences(input: UpsertPreferencesInput) {
  const database = ensureDatabaseReady();

  database
    .insert(preferences)
    .values({
      userId: input.userId,
      defaultMediaMode: input.defaultMediaMode,
      defaultResultCount: input.defaultResultCount,
      watchHistoryOnly: input.watchHistoryOnly,
      watchHistorySourceTypesJson: serializeWatchHistorySourceTypes(input.watchHistorySourceTypes),
      historyHideExisting: input.historyHideExisting,
      historyHideLiked: input.historyHideLiked,
      historyHideDisliked: input.historyHideDisliked,
      historyHideHidden: input.historyHideHidden,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: preferences.userId,
      set: {
        defaultMediaMode: input.defaultMediaMode,
        defaultResultCount: input.defaultResultCount,
        watchHistoryOnly: input.watchHistoryOnly,
        watchHistorySourceTypesJson: serializeWatchHistorySourceTypes(input.watchHistorySourceTypes),
        historyHideExisting: input.historyHideExisting,
        historyHideLiked: input.historyHideLiked,
        historyHideDisliked: input.historyHideDisliked,
        historyHideHidden: input.historyHideHidden,
        updatedAt: new Date(),
      },
    })
    .run();

  return getPreferencesByUserId(input.userId);
}
