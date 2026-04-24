import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const preferenceMediaModes = ["tv", "movies", "both"] as const;

export const preferences = sqliteTable("preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  defaultMediaMode: text("default_media_mode", { enum: preferenceMediaModes })
    .notNull()
    .default("tv"),
  defaultResultCount: integer("default_result_count").notNull().default(10),
  watchHistoryOnly: integer("watch_history_only", { mode: "boolean" })
    .notNull()
    .default(false),
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

export const serviceConnectionTypes = ["ai-provider", "sonarr", "radarr"] as const;
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

export type UserRole = (typeof userRoles)[number];
export type PreferenceMediaMode = (typeof preferenceMediaModes)[number];
export type ServiceConnectionType = (typeof serviceConnectionTypes)[number];
export type ServiceConnectionStatus = (typeof serviceConnectionStatuses)[number];
