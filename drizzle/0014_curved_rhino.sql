CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `preferences` ADD `default_ai_model` text;--> statement-breakpoint
ALTER TABLE `preferences` ADD `default_sonarr_root_folder_path` text;--> statement-breakpoint
ALTER TABLE `preferences` ADD `default_sonarr_quality_profile_id` integer;--> statement-breakpoint
ALTER TABLE `preferences` ADD `default_radarr_root_folder_path` text;--> statement-breakpoint
ALTER TABLE `preferences` ADD `default_radarr_quality_profile_id` integer;--> statement-breakpoint
ALTER TABLE `recommendation_runs` ADD `selected_genres_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `failed_login_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `locked_until` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `password_changed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL;