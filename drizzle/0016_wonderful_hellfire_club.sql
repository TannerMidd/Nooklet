CREATE TABLE `recommendation_item_timeline_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`event_type` text NOT NULL,
	`status` text DEFAULT 'info' NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`metadata_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `recommendation_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recommendation_run_metrics` (
	`run_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`generation_attempt_count` integer DEFAULT 0 NOT NULL,
	`excluded_existing_item_count` integer DEFAULT 0 NOT NULL,
	`excluded_language_item_count` integer DEFAULT 0 NOT NULL,
	`generated_item_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `recommendation_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`default_media_mode` text DEFAULT 'tv' NOT NULL,
	`default_result_count` integer DEFAULT 10 NOT NULL,
	`default_temperature` real DEFAULT 0.9 NOT NULL,
	`default_ai_model` text,
	`language_preference` text DEFAULT 'any' NOT NULL,
	`default_sonarr_root_folder_path` text,
	`default_sonarr_quality_profile_id` integer,
	`default_radarr_root_folder_path` text,
	`default_radarr_quality_profile_id` integer,
	`watch_history_only` integer DEFAULT false NOT NULL,
	`watch_history_source_types_json` text DEFAULT '["manual","tautulli","plex","trakt"]' NOT NULL,
	`history_hide_existing` integer DEFAULT false NOT NULL,
	`history_hide_liked` integer DEFAULT false NOT NULL,
	`history_hide_disliked` integer DEFAULT false NOT NULL,
	`history_hide_hidden` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_preferences`("user_id", "default_media_mode", "default_result_count", "default_temperature", "default_ai_model", "language_preference", "default_sonarr_root_folder_path", "default_sonarr_quality_profile_id", "default_radarr_root_folder_path", "default_radarr_quality_profile_id", "watch_history_only", "watch_history_source_types_json", "history_hide_existing", "history_hide_liked", "history_hide_disliked", "history_hide_hidden", "updated_at") SELECT "user_id", "default_media_mode", "default_result_count", "default_temperature", "default_ai_model", "language_preference", "default_sonarr_root_folder_path", "default_sonarr_quality_profile_id", "default_radarr_root_folder_path", "default_radarr_quality_profile_id", "watch_history_only", "watch_history_source_types_json", "history_hide_existing", "history_hide_liked", "history_hide_disliked", "history_hide_hidden", "updated_at" FROM `preferences`;--> statement-breakpoint
DROP TABLE `preferences`;--> statement-breakpoint
ALTER TABLE `__new_preferences` RENAME TO `preferences`;--> statement-breakpoint
PRAGMA foreign_keys=ON;