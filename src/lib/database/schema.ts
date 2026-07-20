import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const userRoles = ["admin", "user"] as const;

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: userRoles }).notNull().default("user"),
    isDisabled: integer("is_disabled", { mode: "boolean" }).notNull().default(false),
    mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    passwordChangedAt: integer("password_changed_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id"),
  payloadJson: text("payload_json"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const storageSnapshotKinds = ["download-workspace", "library-destination"] as const;

/**
 * Last completed storage probe results. Filesystem probes run outside the web
 * request process; pages consume these durable rows so an unhealthy bind mount
 * cannot consume the web server's libuv worker pool.
 */
export const storageSnapshots = sqliteTable(
  "storage_snapshots",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: storageSnapshotKinds }).notNull(),
    path: text("path").notNull(),
    exists: integer("exists", { mode: "boolean" }).notNull().default(false),
    reachable: integer("reachable", { mode: "boolean" }).notNull().default(false),
    readable: integer("readable", { mode: "boolean" }).notNull().default(false),
    writable: integer("writable", { mode: "boolean" }).notNull().default(false),
    freeSpaceBytes: integer("free_space_bytes"),
    totalSpaceBytes: integer("total_space_bytes"),
    errorMessage: text("error_message"),
    checkedAt: integer("checked_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("storage_snapshots_kind_idx").on(table.kind)],
);

export const preferenceMediaModes = ["tv", "movies", "both"] as const;
export const preferenceLanguageCodes = [
  "any",
  "ar",
  "da",
  "de",
  "en",
  "es",
  "fr",
  "hi",
  "it",
  "ja",
  "ko",
  "nl",
  "no",
  "pl",
  "pt",
  "sv",
  "tr",
  "zh",
] as const;

export const preferences = sqliteTable("preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  defaultMediaMode: text("default_media_mode", { enum: preferenceMediaModes })
    .notNull()
    .default("tv"),
  defaultResultCount: integer("default_result_count").notNull().default(10),
  libraryTasteSampleSize: integer("library_taste_sample_size").notNull().default(150),
  defaultTemperature: real("default_temperature").notNull().default(0.9),
  defaultAiModel: text("default_ai_model"),
  languagePreference: text("language_preference", { enum: preferenceLanguageCodes })
    .notNull()
    .default("any"),
  watchHistoryOnly: integer("watch_history_only", { mode: "boolean" })
    .notNull()
    .default(false),
  watchHistorySourceTypesJson: text("watch_history_source_types_json")
    .notNull()
    .default('["manual","tautulli","plex","trakt"]'),
  historyHideExisting: integer("history_hide_existing", { mode: "boolean" })
    .notNull()
    .default(false),
  historyHideLiked: integer("history_hide_liked", { mode: "boolean" })
    .notNull()
    .default(false),
  historyHideDisliked: integer("history_hide_disliked", { mode: "boolean" })
    .notNull()
    .default(false),
  historyHideHidden: integer("history_hide_hidden", { mode: "boolean" })
    .notNull()
    .default(true),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const serviceConnectionTypes = ["ai-provider", "tautulli", "plex", "sabnzbd", "usenet-server", "tmdb", "tvdb", "trakt"] as const;
export const serviceConnectionScopes = ["user", "shared"] as const;
export const serviceConnectionStatuses = ["configured", "verified", "error"] as const;

export const serviceConnections = sqliteTable(
  "service_connections",
  {
    id: text("id").primaryKey(),
    serviceType: text("service_type", { enum: serviceConnectionTypes }).notNull(),
    ownershipScope: text("ownership_scope", { enum: serviceConnectionScopes })
      .notNull()
      .default("user"),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    baseUrl: text("base_url"),
    status: text("status", { enum: serviceConnectionStatuses })
      .notNull()
      .default("configured"),
    statusMessage: text("status_message"),
    metadataJson: text("metadata_json"),
    lastVerifiedAt: integer("last_verified_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("service_connections_owner_service_unique").on(
      table.ownerUserId,
      table.serviceType,
    ),
  ],
);

export const serviceSecrets = sqliteTable("service_secrets", {
  connectionId: text("connection_id")
    .primaryKey()
    .references(() => serviceConnections.id, { onDelete: "cascade" }),
  encryptedValue: text("encrypted_value").notNull(),
  maskedValue: text("masked_value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const recommendationMediaTypes = ["tv", "movie"] as const;

export const mediaLibraryPathStatuses = ["active", "disabled"] as const;
export const mediaTitleStatuses = ["requested", "available", "missing"] as const;
export const mediaTitleExternalIdSources = ["tmdb", "tvdb", "imdb"] as const;
export const mediaQualityProfiles = ["any", "hd-720p", "hd-1080p", "uhd-2160p"] as const;
export const mediaFileKinds = ["movie", "episode", "extra", "unknown"] as const;
export const mediaScanRunStatuses = ["pending", "running", "succeeded", "failed"] as const;
export const indexerProtocols = ["newznab", "torznab"] as const;
export const indexerConnectionStatuses = ["configured", "verified", "error", "disabled"] as const;
export const indexerSearchRunStatuses = ["pending", "running", "succeeded", "failed"] as const;
export const downloadClientTypes = ["sabnzbd", "nooklet"] as const;
export const downloadClientStatuses = ["configured", "verified", "error", "disabled"] as const;
export const downloadFulfillmentStrategies = ["season_pack", "episodes"] as const;
export const downloadFulfillmentStatuses = [
  "active",
  "retry_wait",
  "partial",
  "succeeded",
  "blocked",
  "failed",
  "cancelled",
] as const;
export const downloadFulfillmentEpisodeStatuses = [
  "pending",
  "active",
  "retry_wait",
  "succeeded",
  "unavailable",
  "blocked",
  "deferred",
] as const;
export const downloadAttemptStrategies = ["season_pack", "episode"] as const;
export const downloadRequestStatuses = [
  "pending",
  "queued",
  "downloading",
  "importing",
  "requeuing",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export const activeDownloadRequestStatuses = [
  "pending",
  "queued",
  "downloading",
  "importing",
  "requeuing",
] as const;
export const downloadQueueItemStatuses = ["queued", "downloading", "paused", "completed", "failed"] as const;
export const downloadImportRunStatuses = ["pending", "running", "succeeded", "failed", "skipped"] as const;
export const engineDownloadStates = [
  "queued",
  "fetching",
  "assembling",
  "repairing",
  "extracting",
  "completed",
  "failed",
  "paused",
] as const;
export const engineDownloadControlIntents = ["pause", "cancel"] as const;
export const engineDownloadCategories = ["tv", "movies"] as const;
export const engineDownloadFailureKinds = ["content", "infrastructure", "cancelled", "unknown"] as const;

export const mediaLibraries = sqliteTable(
  "media_libraries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaType: text("media_type", { enum: recommendationMediaTypes }).notNull(),
    name: text("name").notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("media_libraries_user_media_name_unique").on(
      table.userId,
      table.mediaType,
      table.name,
    ),
    index("media_libraries_user_media_idx").on(table.userId, table.mediaType),
  ],
);

export const mediaLibraryPaths = sqliteTable(
  "media_library_paths",
  {
    id: text("id").primaryKey(),
    libraryId: text("library_id")
      .notNull()
      .references(() => mediaLibraries.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    label: text("label").notNull(),
    status: text("status", { enum: mediaLibraryPathStatuses })
      .notNull()
      .default("active"),
    isDownloadDefault: integer("is_download_default", { mode: "boolean" })
      .notNull()
      .default(false),
    freeSpaceBytes: integer("free_space_bytes"),
    totalSpaceBytes: integer("total_space_bytes"),
    lastScannedAt: integer("last_scanned_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("media_library_paths_user_path_unique").on(table.userId, table.path),
    index("media_library_paths_library_idx").on(table.libraryId),
    index("media_library_paths_user_status_idx").on(table.userId, table.status),
  ],
);

export const mediaTitles = sqliteTable(
  "media_titles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    libraryId: text("library_id").references(() => mediaLibraries.id, { onDelete: "set null" }),
    mediaType: text("media_type", { enum: recommendationMediaTypes }).notNull(),
    title: text("title").notNull(),
    sortTitle: text("sort_title").notNull(),
    year: integer("year"),
    normalizedKey: text("normalized_key").notNull(),
    status: text("status", { enum: mediaTitleStatuses })
      .notNull()
      .default("missing"),
    monitored: integer("monitored", { mode: "boolean" }).notNull().default(true),
    qualityProfile: text("quality_profile", { enum: mediaQualityProfiles })
      .notNull()
      .default("hd-1080p"),
    overview: text("overview"),
    posterUrl: text("poster_url"),
    backdropUrl: text("backdrop_url"),
    runtimeMinutes: integer("runtime_minutes"),
    originalLanguage: text("original_language"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("media_titles_user_media_key_unique").on(
      table.userId,
      table.mediaType,
      table.normalizedKey,
    ),
    index("media_titles_library_status_idx").on(table.libraryId, table.status),
    index("media_titles_user_media_status_idx").on(table.userId, table.mediaType, table.status),
    index("media_titles_user_media_sort_idx").on(table.userId, table.mediaType, table.sortTitle, table.id),
  ],
);

export const mediaTitleExternalIds = sqliteTable(
  "media_title_external_ids",
  {
    titleId: text("title_id")
      .notNull()
      .references(() => mediaTitles.id, { onDelete: "cascade" }),
    source: text("source", { enum: mediaTitleExternalIdSources }).notNull(),
    value: text("value").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    primaryKey({ columns: [table.titleId, table.source] }),
    index("media_title_external_ids_source_value_idx").on(table.source, table.value),
  ],
);

export const tvSeasons = sqliteTable(
  "tv_seasons",
  {
    id: text("id").primaryKey(),
    titleId: text("title_id")
      .notNull()
      .references(() => mediaTitles.id, { onDelete: "cascade" }),
    seasonNumber: integer("season_number").notNull(),
    title: text("title"),
    monitored: integer("monitored", { mode: "boolean" }).notNull().default(true),
    episodeCount: integer("episode_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("tv_seasons_title_number_unique").on(table.titleId, table.seasonNumber),
    index("tv_seasons_title_idx").on(table.titleId),
  ],
);

export const tvEpisodes = sqliteTable(
  "tv_episodes",
  {
    id: text("id").primaryKey(),
    titleId: text("title_id")
      .notNull()
      .references(() => mediaTitles.id, { onDelete: "cascade" }),
    seasonId: text("season_id")
      .notNull()
      .references(() => tvSeasons.id, { onDelete: "cascade" }),
    seasonNumber: integer("season_number").notNull(),
    episodeNumber: integer("episode_number").notNull(),
    title: text("title"),
    airDate: text("air_date"),
    monitored: integer("monitored", { mode: "boolean" }).notNull().default(true),
    hasFile: integer("has_file", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("tv_episodes_title_season_episode_unique").on(
      table.titleId,
      table.seasonNumber,
      table.episodeNumber,
    ),
    index("tv_episodes_season_idx").on(table.seasonId),
    index("tv_episodes_title_file_idx").on(table.titleId, table.hasFile),
  ],
);

export const mediaFiles = sqliteTable(
  "media_files",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: text("title_id")
      .notNull()
      .references(() => mediaTitles.id, { onDelete: "cascade" }),
    libraryPathId: text("library_path_id").references(() => mediaLibraryPaths.id, { onDelete: "set null" }),
    seasonId: text("season_id").references(() => tvSeasons.id, { onDelete: "set null" }),
    episodeId: text("episode_id").references(() => tvEpisodes.id, { onDelete: "set null" }),
    mediaType: text("media_type", { enum: recommendationMediaTypes }).notNull(),
    fileKind: text("file_kind", { enum: mediaFileKinds }).notNull().default("unknown"),
    filePath: text("file_path").notNull(),
    relativePath: text("relative_path").notNull(),
    sizeBytes: integer("size_bytes"),
    modifiedAt: integer("modified_at", { mode: "timestamp_ms" }),
    qualityLabel: text("quality_label"),
    releaseGroup: text("release_group"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("media_files_user_path_unique").on(table.userId, table.filePath),
    index("media_files_title_idx").on(table.titleId),
    index("media_files_user_media_title_idx").on(table.userId, table.mediaType, table.titleId),
    index("media_files_library_path_idx").on(table.libraryPathId),
    index("media_files_episode_idx").on(table.episodeId),
  ],
);

export const mediaScanRuns = sqliteTable(
  "media_scan_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    libraryId: text("library_id").references(() => mediaLibraries.id, { onDelete: "set null" }),
    libraryPathId: text("library_path_id").references(() => mediaLibraryPaths.id, { onDelete: "set null" }),
    status: text("status", { enum: mediaScanRunStatuses }).notNull().default("pending"),
    discoveredFileCount: integer("discovered_file_count").notNull().default(0),
    matchedTitleCount: integer("matched_title_count").notNull().default(0),
    errorMessage: text("error_message"),
    startedAt: integer("started_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("media_scan_runs_user_status_started_idx").on(
      table.userId,
      table.status,
      table.startedAt,
    ),
    index("media_scan_runs_path_started_idx").on(table.libraryPathId, table.startedAt),
  ],
);

export const indexers = sqliteTable(
  "indexers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    protocol: text("protocol", { enum: indexerProtocols }).notNull(),
    baseUrl: text("base_url").notNull(),
    apiPath: text("api_path").notNull().default("/api"),
    status: text("status", { enum: indexerConnectionStatuses })
      .notNull()
      .default("configured"),
    statusMessage: text("status_message"),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
    priority: integer("priority").notNull().default(0),
    lastTestedAt: integer("last_tested_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("indexers_user_name_unique").on(table.userId, table.name),
    index("indexers_user_enabled_priority_idx").on(
      table.userId,
      table.isEnabled,
      table.priority,
    ),
    index("indexers_user_protocol_status_idx").on(table.userId, table.protocol, table.status),
  ],
);

export const indexerMediaCategories = sqliteTable(
  "indexer_media_categories",
  {
    indexerId: text("indexer_id")
      .notNull()
      .references(() => indexers.id, { onDelete: "cascade" }),
    mediaType: text("media_type", { enum: recommendationMediaTypes }).notNull(),
    categoryId: text("category_id").notNull(),
    label: text("label"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    primaryKey({ columns: [table.indexerId, table.mediaType, table.categoryId] }),
    index("indexer_media_categories_media_idx").on(table.mediaType),
  ],
);

export const indexerSecrets = sqliteTable("indexer_secrets", {
  indexerId: text("indexer_id")
    .primaryKey()
    .references(() => indexers.id, { onDelete: "cascade" }),
  encryptedApiKey: text("encrypted_api_key").notNull(),
  maskedApiKey: text("masked_api_key").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const indexerSearchRuns = sqliteTable(
  "indexer_search_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    indexerId: text("indexer_id").references(() => indexers.id, { onDelete: "set null" }),
    mediaType: text("media_type", { enum: recommendationMediaTypes }).notNull(),
    query: text("query").notNull(),
    normalizedKey: text("normalized_key"),
    status: text("status", { enum: indexerSearchRunStatuses })
      .notNull()
      .default("pending"),
    resultCount: integer("result_count").notNull().default(0),
    errorMessage: text("error_message"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("indexer_search_runs_user_status_created_idx").on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    index("indexer_search_runs_user_expiry_idx").on(table.userId, table.expiresAt),
    index("indexer_search_runs_indexer_created_idx").on(table.indexerId, table.createdAt),
  ],
);

export const indexerSearchResults = sqliteTable(
  "indexer_search_results",
  {
    id: text("id").primaryKey(),
    searchRunId: text("search_run_id")
      .notNull()
      .references(() => indexerSearchRuns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    indexerId: text("indexer_id").references(() => indexers.id, { onDelete: "set null" }),
    mediaType: text("media_type", { enum: recommendationMediaTypes }).notNull(),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    indexerGuid: text("indexer_guid").notNull(),
    qualityLabel: text("quality_label"),
    releaseGroup: text("release_group"),
    sizeBytes: integer("size_bytes"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    ageMinutes: integer("age_minutes"),
    seeders: integer("seeders"),
    leechers: integer("leechers"),
    grabs: integer("grabs"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("indexer_search_results_run_guid_unique").on(table.searchRunId, table.indexerGuid),
    index("indexer_search_results_user_media_created_idx").on(
      table.userId,
      table.mediaType,
      table.createdAt,
    ),
    index("indexer_search_results_indexer_guid_idx").on(table.indexerId, table.indexerGuid),
  ],
);

export const indexerSearchResultSecrets = sqliteTable("indexer_search_result_secrets", {
  resultId: text("result_id")
    .primaryKey()
    .references(() => indexerSearchResults.id, { onDelete: "cascade" }),
  encryptedDownloadUrl: text("encrypted_download_url").notNull(),
  maskedDownloadUrl: text("masked_download_url").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const downloadClients = sqliteTable(
  "download_clients",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serviceConnectionId: text("service_connection_id")
      .notNull()
      .references(() => serviceConnections.id, { onDelete: "cascade" }),
    clientType: text("client_type", { enum: downloadClientTypes }).notNull(),
    displayName: text("display_name").notNull(),
    status: text("status", { enum: downloadClientStatuses })
      .notNull()
      .default("configured"),
    statusMessage: text("status_message"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("download_clients_connection_unique").on(table.serviceConnectionId),
    uniqueIndex("download_clients_user_type_name_unique").on(
      table.userId,
      table.clientType,
      table.displayName,
    ),
    index("download_clients_user_status_default_idx").on(
      table.userId,
      table.status,
      table.isDefault,
    ),
  ],
);

/**
 * A season fulfillment is the durable user intent behind one or more physical
 * download attempts. It survives failed pack releases, process restarts, and
 * the transition from a season pack to per-episode downloads.
 */
export const downloadFulfillments = sqliteTable(
  "download_fulfillments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaTitleId: text("media_title_id")
      .notNull()
      .references(() => mediaTitles.id, { onDelete: "cascade" }),
    seasonId: text("season_id")
      .notNull()
      .references(() => tvSeasons.id, { onDelete: "cascade" }),
    targetLibraryPathId: text("target_library_path_id").references(
      () => mediaLibraryPaths.id,
      { onDelete: "set null" },
    ),
    requestedTitle: text("requested_title").notNull(),
    strategy: text("strategy", { enum: downloadFulfillmentStrategies })
      .notNull()
      .default("season_pack"),
    status: text("status", { enum: downloadFulfillmentStatuses })
      .notNull()
      .default("active"),
    packAttemptCount: integer("pack_attempt_count").notNull().default(0),
    packAttemptLimit: integer("pack_attempt_limit").notNull().default(3),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
    cancellationRequestedAt: integer("cancellation_requested_at", { mode: "timestamp_ms" }),
    statusMessage: text("status_message"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("download_fulfillments_user_status_due_idx").on(
      table.userId,
      table.status,
      table.nextAttemptAt,
    ),
    index("download_fulfillments_season_idx").on(table.seasonId),
    uniqueIndex("download_fulfillments_open_season_unique")
      .on(table.userId, table.mediaTitleId, table.seasonId)
      .where(sql`status in ('active','retry_wait','partial')`),
  ],
);

export const downloadFulfillmentEpisodes = sqliteTable(
  "download_fulfillment_episodes",
  {
    fulfillmentId: text("fulfillment_id")
      .notNull()
      .references(() => downloadFulfillments.id, { onDelete: "cascade" }),
    episodeId: text("episode_id")
      .notNull()
      .references(() => tvEpisodes.id, { onDelete: "cascade" }),
    status: text("status", { enum: downloadFulfillmentEpisodeStatuses })
      .notNull()
      .default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
    statusMessage: text("status_message"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    primaryKey({ columns: [table.fulfillmentId, table.episodeId] }),
    index("download_fulfillment_episodes_status_due_idx").on(
      table.fulfillmentId,
      table.status,
      table.nextAttemptAt,
    ),
  ],
);

export const downloadRequests = sqliteTable(
  "download_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaTitleId: text("media_title_id").references(() => mediaTitles.id, {
      onDelete: "set null",
    }),
    episodeId: text("episode_id").references(() => tvEpisodes.id, { onDelete: "set null" }),
    seasonId: text("season_id").references(() => tvSeasons.id, { onDelete: "set null" }),
    fulfillmentId: text("fulfillment_id").references(() => downloadFulfillments.id, {
      onDelete: "set null",
    }),
    attemptStrategy: text("attempt_strategy", { enum: downloadAttemptStrategies }),
    attemptNumber: integer("attempt_number"),
    searchResultId: text("search_result_id").references(() => indexerSearchResults.id, {
      onDelete: "set null",
    }),
    clientId: text("client_id").references(() => downloadClients.id, { onDelete: "set null" }),
    targetLibraryId: text("target_library_id").references(() => mediaLibraries.id, {
      onDelete: "set null",
    }),
    targetLibraryPathId: text("target_library_path_id").references(() => mediaLibraryPaths.id, {
      onDelete: "set null",
    }),
    mediaType: text("media_type", { enum: recommendationMediaTypes }).notNull(),
    status: text("status", { enum: downloadRequestStatuses }).notNull().default("pending"),
    requestedTitle: text("requested_title").notNull(),
    releaseTitle: text("release_title"),
    externalJobId: text("external_job_id"),
    statusMessage: text("status_message"),
    cancellationRequestedAt: integer("cancellation_requested_at", { mode: "timestamp_ms" }),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
    missingTickCount: integer("missing_tick_count").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    lastRetriedAt: integer("last_retried_at", { mode: "timestamp_ms" }),
    dedupKey: text("dedup_key").generatedAlwaysAs(
      sql`coalesce(episode_id, season_id, '__movie__')`,
    ),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("download_requests_user_status_created_idx").on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    index("download_requests_title_status_idx").on(table.mediaTitleId, table.status),
    index("download_requests_episode_status_idx").on(table.episodeId, table.status),
    index("download_requests_season_status_idx").on(table.seasonId, table.status),
    index("download_requests_fulfillment_created_idx").on(table.fulfillmentId, table.createdAt),
    index("download_requests_client_status_updated_idx").on(
      table.clientId,
      table.status,
      table.updatedAt,
    ),
    index("download_requests_search_result_idx").on(table.searchResultId),
    index("download_requests_target_path_status_idx").on(table.targetLibraryPathId, table.status),
    index("download_requests_cancellation_pending_idx").on(
      table.userId,
      table.cancellationRequestedAt,
    ).where(sql`cancellation_requested_at is not null`),
    uniqueIndex("download_requests_active_dedup_unique")
      .on(table.userId, table.mediaTitleId, table.dedupKey)
      .where(
        sql`media_title_id is not null and status in ('pending','queued','downloading','importing','requeuing')`,
      ),
  ],
);

export const downloadQueueItems = sqliteTable(
  "download_queue_items",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => downloadRequests.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: text("client_id").references(() => downloadClients.id, { onDelete: "set null" }),
    externalQueueId: text("external_queue_id").notNull(),
    status: text("status", { enum: downloadQueueItemStatuses }).notNull().default("queued"),
    progressPercent: real("progress_percent").notNull().default(0),
    sizeBytes: integer("size_bytes"),
    remainingBytes: integer("remaining_bytes"),
    etaSeconds: integer("eta_seconds"),
    category: text("category"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("download_queue_items_client_external_unique").on(
      table.clientId,
      table.externalQueueId,
    ),
    index("download_queue_items_request_idx").on(table.requestId),
    index("download_queue_items_user_status_updated_idx").on(
      table.userId,
      table.status,
      table.updatedAt,
    ),
  ],
);

export const downloadImportRuns = sqliteTable(
  "download_import_runs",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => downloadRequests.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    libraryPathId: text("library_path_id").references(() => mediaLibraryPaths.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: downloadImportRunStatuses }).notNull().default("pending"),
    sourceRootPath: text("source_root_path").notNull(),
    destinationRootPath: text("destination_root_path"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("download_import_runs_request_idx").on(table.requestId),
    index("download_import_runs_user_status_created_idx").on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    index("download_import_runs_library_path_idx").on(table.libraryPathId),
  ],
);

export const downloadImportedFiles = sqliteTable(
  "download_imported_files",
  {
    id: text("id").primaryKey(),
    importRunId: text("import_run_id")
      .notNull()
      .references(() => downloadImportRuns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaFileId: text("media_file_id").references(() => mediaFiles.id, {
      onDelete: "set null",
    }),
    sourcePath: text("source_path").notNull(),
    destinationPath: text("destination_path").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("download_imported_files_import_run_idx").on(table.importRunId),
    index("download_imported_files_media_file_idx").on(table.mediaFileId),
    index("download_imported_files_user_created_idx").on(table.userId, table.createdAt),
  ],
);

/**
 * Built-in usenet download engine state (ADR-0002). One row per accepted NZB.
 * The engine owns this state directly — no external queue to reconcile.
 * Per-segment progress is held in memory while a download is active; a
 * restart mid-fetch restarts that download from its NZB.
 */
export const engineDownloads = sqliteTable(
  "engine_downloads",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category", { enum: engineDownloadCategories }).notNull().default("movies"),
    state: text("state", { enum: engineDownloadStates }).notNull().default("queued"),
    controlIntent: text("control_intent", { enum: engineDownloadControlIntents }),
    priority: integer("priority").notNull().default(0),
    nzbXml: text("nzb_xml").notNull(),
    password: text("password"),
    totalBytes: integer("total_bytes").notNull().default(0),
    downloadedBytes: integer("downloaded_bytes").notNull().default(0),
    bytesPerSecond: integer("bytes_per_second"),
    totalSegments: integer("total_segments").notNull().default(0),
    completedSegments: integer("completed_segments").notNull().default(0),
    failedSegments: integer("failed_segments").notNull().default(0),
    failureKind: text("failure_kind", { enum: engineDownloadFailureKinds }),
    errorMessage: text("error_message"),
    outputPath: text("output_path"),
    importedAt: integer("imported_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("engine_downloads_user_state_priority_idx").on(
      table.userId,
      table.state,
      table.priority,
    ),
    index("engine_downloads_state_updated_idx").on(table.state, table.updatedAt),
  ],
);

export const watchHistorySourceTypes = ["manual", "tautulli", "plex", "trakt"] as const;
export const watchHistorySyncStatuses = ["pending", "succeeded", "failed"] as const;
export const jobTypes = [
  "watch-history-sync",
  "recommendation-run",
  "media-library-scan",
  "missing-content-search",
  "metadata-refresh",
  "download-import",
  "media-title-delete",
] as const;
export const jobStatuses = ["idle", "running", "succeeded", "failed"] as const;

export const watchHistorySources = sqliteTable(
  "watch_history_sources",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceType: text("source_type", { enum: watchHistorySourceTypes })
      .notNull()
      .default("manual"),
    displayName: text("display_name").notNull(),
    metadataJson: text("metadata_json"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [uniqueIndex("watch_history_sources_user_type_unique").on(table.userId, table.sourceType)],
);

export const watchHistorySyncRuns = sqliteTable("watch_history_sync_runs", {
  id: text("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => watchHistorySources.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  mediaType: text("media_type", { enum: recommendationMediaTypes }).notNull(),
  status: text("status", { enum: watchHistorySyncStatuses })
    .notNull()
    .default("pending"),
  itemCount: integer("item_count").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export const watchHistoryItems = sqliteTable(
  "watch_history_items",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => watchHistorySources.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaType: text("media_type", { enum: recommendationMediaTypes }).notNull(),
    title: text("title").notNull(),
    year: integer("year"),
    normalizedKey: text("normalized_key").notNull(),
    watchedAt: integer("watched_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("watch_history_items_source_media_key_unique").on(
      table.sourceId,
      table.mediaType,
      table.normalizedKey,
    ),
  ],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobType: text("job_type", { enum: jobTypes }).notNull(),
    targetType: text("target_type").notNull(),
    targetKey: text("target_key").notNull(),
    scheduleMinutes: integer("schedule_minutes").notNull(),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
    nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }),
    lastStartedAt: integer("last_started_at", { mode: "timestamp_ms" }),
    lastCompletedAt: integer("last_completed_at", { mode: "timestamp_ms" }),
    lastStatus: text("last_status", { enum: jobStatuses }).notNull().default("idle"),
    lastError: text("last_error"),
    runToken: text("run_token"),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    lastHeartbeatAt: integer("last_heartbeat_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("jobs_user_type_target_unique").on(
      table.userId,
      table.jobType,
      table.targetType,
      table.targetKey,
    ),
    index("jobs_due_lease_idx").on(table.jobType, table.isEnabled, table.nextRunAt, table.lockedUntil),
  ],
);
export const recommendationRunStatuses = ["pending", "succeeded", "failed"] as const;
export const recommendationFeedbackValues = ["like", "dislike"] as const;
export const recommendationTimelineEventTypes = [
  "generated",
  "feedback",
  "hidden",
  "unhidden",
  "library-add",
  "episode-selection",
] as const;
export const recommendationTimelineStatuses = ["info", "pending", "succeeded", "failed"] as const;

export const recommendationRuns = sqliteTable("recommendation_runs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  mediaType: text("media_type", { enum: recommendationMediaTypes }).notNull(),
  status: text("status", { enum: recommendationRunStatuses })
    .notNull()
    .default("pending"),
  requestPrompt: text("request_prompt").notNull(),
  selectedGenresJson: text("selected_genres_json").notNull().default("[]"),
  requestedCount: integer("requested_count").notNull(),
  aiModel: text("ai_model"),
  aiTemperature: real("ai_temperature").notNull().default(0.9),
  watchHistoryOnly: integer("watch_history_only", { mode: "boolean" })
    .notNull()
    .default(false),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const recommendationItems = sqliteTable("recommendation_items", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => recommendationRuns.id, { onDelete: "cascade" }),
  mediaType: text("media_type", { enum: recommendationMediaTypes }).notNull(),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  year: integer("year"),
  rationale: text("rationale").notNull(),
  confidenceLabel: text("confidence_label"),
  providerMetadataJson: text("provider_metadata_json"),
  existingInLibrary: integer("existing_in_library", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const recommendationRunMetrics = sqliteTable("recommendation_run_metrics", {
  runId: text("run_id")
    .primaryKey()
    .references(() => recommendationRuns.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  generationAttemptCount: integer("generation_attempt_count").notNull().default(0),
  excludedExistingItemCount: integer("excluded_existing_item_count").notNull().default(0),
  excludedLanguageItemCount: integer("excluded_language_item_count").notNull().default(0),
  generatedItemCount: integer("generated_item_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const recommendationItemTimelineEvents = sqliteTable("recommendation_item_timeline_events", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  itemId: text("item_id")
    .notNull()
    .references(() => recommendationItems.id, { onDelete: "cascade" }),
  eventType: text("event_type", { enum: recommendationTimelineEventTypes }).notNull(),
  status: text("status", { enum: recommendationTimelineStatuses }).notNull().default("info"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  metadataJson: text("metadata_json"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const recommendationFeedback = sqliteTable(
  "recommendation_feedback",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => recommendationItems.id, { onDelete: "cascade" }),
    feedback: text("feedback", { enum: recommendationFeedbackValues }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("recommendation_feedback_user_item_unique").on(
      table.userId,
      table.itemId,
    ),
  ],
);

export const recommendationItemStates = sqliteTable(
  "recommendation_item_states",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => recommendationItems.id, { onDelete: "cascade" }),
    isHidden: integer("is_hidden", { mode: "boolean" }).notNull().default(true),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("recommendation_item_states_user_item_unique").on(
      table.userId,
      table.itemId,
    ),
  ],
);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStartedAt: integer("window_started_at", { mode: "number" }).notNull(),
  attempts: integer("attempts").notNull().default(0),
});

export const mediaRequestAttempts = sqliteTable(
  "media_request_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestKey: text("request_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("media_request_attempts_user_key_unique").on(table.userId, table.requestKey),
    index("media_request_attempts_expires_idx").on(table.expiresAt),
  ],
);

export const notificationChannelTypes = ["webhook", "discord", "apprise"] as const;
export const notificationEventTypes = [
  "recommendation_run_succeeded",
  "recommendation_run_failed",
  "library_add_failed",
  "watch_history_sync_failed",
  "download_import_succeeded",
  "download_failed",
  "download_import_failed",
] as const;

export const notificationDispatchStatuses = ["success", "error"] as const;
export type NotificationDispatchStatus = (typeof notificationDispatchStatuses)[number];

export const notificationChannels = sqliteTable(
  "notification_channels",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channelType: text("channel_type", { enum: notificationChannelTypes }).notNull(),
    displayName: text("display_name").notNull(),
    targetUrl: text("target_url").notNull(),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [uniqueIndex("notification_channels_user_name_unique").on(table.userId, table.displayName)],
);

export const notificationChannelEvents = sqliteTable(
  "notification_channel_events",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => notificationChannels.id, { onDelete: "cascade" }),
    eventType: text("event_type", { enum: notificationEventTypes }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.eventType] })],
);

export const notificationDispatchAudit = sqliteTable(
  "notification_dispatch_audit",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => notificationChannels.id, { onDelete: "cascade" }),
    dispatchedAt: integer("dispatched_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    status: text("status", { enum: notificationDispatchStatuses }).notNull(),
    message: text("message"),
  },
  (table) => [
    index("notification_dispatch_audit_channel_dispatched_idx").on(
      table.channelId,
      table.dispatchedAt,
    ),
  ],
);

export type UserRole = (typeof userRoles)[number];
export type PreferenceMediaMode = (typeof preferenceMediaModes)[number];
export type PreferenceLanguageCode = (typeof preferenceLanguageCodes)[number];
export type ServiceConnectionType = (typeof serviceConnectionTypes)[number];
export type ServiceConnectionStatus = (typeof serviceConnectionStatuses)[number];
export type MediaLibraryPathStatus = (typeof mediaLibraryPathStatuses)[number];
export type MediaTitleStatus = (typeof mediaTitleStatuses)[number];
export type MediaTitleExternalIdSource = (typeof mediaTitleExternalIdSources)[number];
export type MediaQualityProfile = (typeof mediaQualityProfiles)[number];
export type MediaFileKind = (typeof mediaFileKinds)[number];
export type MediaScanRunStatus = (typeof mediaScanRunStatuses)[number];
export type IndexerProtocol = (typeof indexerProtocols)[number];
export type IndexerConnectionStatus = (typeof indexerConnectionStatuses)[number];
export type IndexerSearchRunStatus = (typeof indexerSearchRunStatuses)[number];
export type DownloadClientType = (typeof downloadClientTypes)[number];
export type DownloadClientStatus = (typeof downloadClientStatuses)[number];
export type DownloadFulfillmentStrategy = (typeof downloadFulfillmentStrategies)[number];
export type DownloadFulfillmentStatus = (typeof downloadFulfillmentStatuses)[number];
export type DownloadFulfillmentEpisodeStatus = (typeof downloadFulfillmentEpisodeStatuses)[number];
export type DownloadAttemptStrategy = (typeof downloadAttemptStrategies)[number];
export type DownloadRequestStatus = (typeof downloadRequestStatuses)[number];
export type DownloadQueueItemStatus = (typeof downloadQueueItemStatuses)[number];
export type EngineDownloadState = (typeof engineDownloadStates)[number];
export type EngineDownloadControlIntent = (typeof engineDownloadControlIntents)[number];
export type EngineDownloadCategory = (typeof engineDownloadCategories)[number];
export type EngineDownloadFailureKind = (typeof engineDownloadFailureKinds)[number];
export type DownloadImportRunStatus = (typeof downloadImportRunStatuses)[number];
export type WatchHistorySourceType = (typeof watchHistorySourceTypes)[number];
export type WatchHistorySyncStatus = (typeof watchHistorySyncStatuses)[number];
export type JobType = (typeof jobTypes)[number];
export type JobStatus = (typeof jobStatuses)[number];
export type RecommendationMediaType = (typeof recommendationMediaTypes)[number];
export type RecommendationRunStatus = (typeof recommendationRunStatuses)[number];
export type RecommendationFeedbackValue = (typeof recommendationFeedbackValues)[number];
export type RecommendationTimelineEventType = (typeof recommendationTimelineEventTypes)[number];
export type RecommendationTimelineStatus = (typeof recommendationTimelineStatuses)[number];
export type NotificationChannelType = (typeof notificationChannelTypes)[number];
export type NotificationEventType = (typeof notificationEventTypes)[number];
