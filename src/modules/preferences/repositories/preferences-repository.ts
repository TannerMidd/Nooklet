import { eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  preferences,
  type PreferenceMediaMode,
} from "@/lib/database/schema";

export type PreferenceRecord = typeof preferences.$inferSelect;

export const defaultPreferenceValues: Omit<PreferenceRecord, "userId" | "updatedAt"> = {
  defaultMediaMode: "tv",
  defaultResultCount: 10,
  watchHistoryOnly: false,
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
    return record;
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
      ...input,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: preferences.userId,
      set: {
        defaultMediaMode: input.defaultMediaMode,
        defaultResultCount: input.defaultResultCount,
        watchHistoryOnly: input.watchHistoryOnly,
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
