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

export type LibrarySelectionPreferenceService = "sonarr" | "radarr";

export type LibrarySelectionPreferenceDefaults = {
  rootFolderPath: string | null;
  qualityProfileId: number | null;
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
  defaultTemperature: 0.9,
  defaultAiModel: null,
  defaultSonarrRootFolderPath: null,
  defaultSonarrQualityProfileId: null,
  defaultRadarrRootFolderPath: null,
  defaultRadarrQualityProfileId: null,
  watchHistoryOnly: false,
  watchHistorySourceTypes: [...watchHistorySourceTypes],
  historyHideExisting: false,
  historyHideLiked: false,
  historyHideDisliked: false,
  historyHideHidden: true,
};

function buildLibrarySelectionPreferencePatch(
  serviceType: LibrarySelectionPreferenceService,
  input: LibrarySelectionPreferenceDefaults,
) {
  return serviceType === "sonarr"
    ? {
        defaultSonarrRootFolderPath: input.rootFolderPath,
        defaultSonarrQualityProfileId: input.qualityProfileId,
      }
    : {
        defaultRadarrRootFolderPath: input.rootFolderPath,
        defaultRadarrQualityProfileId: input.qualityProfileId,
      };
}

export function getLibrarySelectionDefaults(
  preferences: PreferenceRecord,
  serviceType: LibrarySelectionPreferenceService,
): LibrarySelectionPreferenceDefaults {
  return serviceType === "sonarr"
    ? {
        rootFolderPath: preferences.defaultSonarrRootFolderPath,
        qualityProfileId: preferences.defaultSonarrQualityProfileId,
      }
    : {
        rootFolderPath: preferences.defaultRadarrRootFolderPath,
        qualityProfileId: preferences.defaultRadarrQualityProfileId,
      };
}

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
  defaultTemperature: number;
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
      defaultTemperature: input.defaultTemperature,
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
        defaultTemperature: input.defaultTemperature,
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

type RecommendationRequestDefaultsInput = {
  defaultResultCount: number;
  defaultTemperature: number;
  defaultAiModel?: string | null;
};

export async function updateRecommendationRequestDefaults(
  userId: string,
  input: RecommendationRequestDefaultsInput,
) {
  const database = ensureDatabaseReady();

  // Treat empty / whitespace-only model identifiers as "clear the saved
  // preference" so callers don't accidentally persist blank strings.
  const normalizedModel =
    typeof input.defaultAiModel === "string" && input.defaultAiModel.trim().length > 0
      ? input.defaultAiModel.trim()
      : input.defaultAiModel === undefined
        ? undefined
        : null;

  const baseValues = {
    defaultResultCount: input.defaultResultCount,
    defaultTemperature: input.defaultTemperature,
    updatedAt: new Date(),
  };

  const insertValues =
    normalizedModel === undefined
      ? { userId, ...baseValues }
      : { userId, ...baseValues, defaultAiModel: normalizedModel };

  const updateValues =
    normalizedModel === undefined
      ? baseValues
      : { ...baseValues, defaultAiModel: normalizedModel };

  database
    .insert(preferences)
    .values(insertValues)
    .onConflictDoUpdate({
      target: preferences.userId,
      set: updateValues,
    })
    .run();
}

export async function updateWatchHistoryOnly(userId: string, watchHistoryOnly: boolean) {
  const database = ensureDatabaseReady();

  database
    .insert(preferences)
    .values({
      userId,
      watchHistoryOnly,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: preferences.userId,
      set: {
        watchHistoryOnly,
        updatedAt: new Date(),
      },
    })
    .run();
}

export async function updateLibrarySelectionDefaults(
  userId: string,
  serviceType: LibrarySelectionPreferenceService,
  input: LibrarySelectionPreferenceDefaults,
) {
  const database = ensureDatabaseReady();
  const preferencePatch = buildLibrarySelectionPreferencePatch(serviceType, input);

  database
    .insert(preferences)
    .values({
      userId,
      ...preferencePatch,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: preferences.userId,
      set: {
        ...preferencePatch,
        updatedAt: new Date(),
      },
    })
    .run();
}
