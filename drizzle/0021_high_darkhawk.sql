CREATE TABLE `media_files` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title_id` text NOT NULL,
	`library_path_id` text,
	`season_id` text,
	`episode_id` text,
	`media_type` text NOT NULL,
	`file_kind` text DEFAULT 'unknown' NOT NULL,
	`file_path` text NOT NULL,
	`relative_path` text NOT NULL,
	`size_bytes` integer,
	`modified_at` integer,
	`quality_label` text,
	`release_group` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`title_id`) REFERENCES `media_titles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`library_path_id`) REFERENCES `media_library_paths`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`season_id`) REFERENCES `tv_seasons`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`episode_id`) REFERENCES `tv_episodes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_files_user_path_unique` ON `media_files` (`user_id`,`file_path`);--> statement-breakpoint
CREATE INDEX `media_files_title_idx` ON `media_files` (`title_id`);--> statement-breakpoint
CREATE INDEX `media_files_library_path_idx` ON `media_files` (`library_path_id`);--> statement-breakpoint
CREATE INDEX `media_files_episode_idx` ON `media_files` (`episode_id`);--> statement-breakpoint
CREATE TABLE `media_libraries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`media_type` text NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_libraries_user_media_name_unique` ON `media_libraries` (`user_id`,`media_type`,`name`);--> statement-breakpoint
CREATE INDEX `media_libraries_user_media_idx` ON `media_libraries` (`user_id`,`media_type`);--> statement-breakpoint
CREATE TABLE `media_library_paths` (
	`id` text PRIMARY KEY NOT NULL,
	`library_id` text NOT NULL,
	`user_id` text NOT NULL,
	`path` text NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`free_space_bytes` integer,
	`total_space_bytes` integer,
	`last_scanned_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `media_libraries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_library_paths_user_path_unique` ON `media_library_paths` (`user_id`,`path`);--> statement-breakpoint
CREATE INDEX `media_library_paths_library_idx` ON `media_library_paths` (`library_id`);--> statement-breakpoint
CREATE INDEX `media_library_paths_user_status_idx` ON `media_library_paths` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `media_scan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`library_id` text,
	`library_path_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`discovered_file_count` integer DEFAULT 0 NOT NULL,
	`matched_title_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`library_id`) REFERENCES `media_libraries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`library_path_id`) REFERENCES `media_library_paths`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `media_scan_runs_user_status_started_idx` ON `media_scan_runs` (`user_id`,`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `media_scan_runs_path_started_idx` ON `media_scan_runs` (`library_path_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `media_title_external_ids` (
	`title_id` text NOT NULL,
	`source` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`title_id`, `source`),
	FOREIGN KEY (`title_id`) REFERENCES `media_titles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_title_external_ids_source_value_idx` ON `media_title_external_ids` (`source`,`value`);--> statement-breakpoint
CREATE TABLE `media_titles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`library_id` text,
	`media_type` text NOT NULL,
	`title` text NOT NULL,
	`sort_title` text NOT NULL,
	`year` integer,
	`normalized_key` text NOT NULL,
	`status` text DEFAULT 'missing' NOT NULL,
	`monitored` integer DEFAULT true NOT NULL,
	`overview` text,
	`poster_url` text,
	`backdrop_url` text,
	`runtime_minutes` integer,
	`original_language` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`library_id`) REFERENCES `media_libraries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_titles_user_media_key_unique` ON `media_titles` (`user_id`,`media_type`,`normalized_key`);--> statement-breakpoint
CREATE INDEX `media_titles_library_status_idx` ON `media_titles` (`library_id`,`status`);--> statement-breakpoint
CREATE INDEX `media_titles_user_media_status_idx` ON `media_titles` (`user_id`,`media_type`,`status`);--> statement-breakpoint
CREATE TABLE `tv_episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`title_id` text NOT NULL,
	`season_id` text NOT NULL,
	`season_number` integer NOT NULL,
	`episode_number` integer NOT NULL,
	`title` text,
	`air_date` text,
	`monitored` integer DEFAULT true NOT NULL,
	`has_file` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`title_id`) REFERENCES `media_titles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_id`) REFERENCES `tv_seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tv_episodes_title_season_episode_unique` ON `tv_episodes` (`title_id`,`season_number`,`episode_number`);--> statement-breakpoint
CREATE INDEX `tv_episodes_season_idx` ON `tv_episodes` (`season_id`);--> statement-breakpoint
CREATE INDEX `tv_episodes_title_file_idx` ON `tv_episodes` (`title_id`,`has_file`);--> statement-breakpoint
CREATE TABLE `tv_seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`title_id` text NOT NULL,
	`season_number` integer NOT NULL,
	`title` text,
	`monitored` integer DEFAULT true NOT NULL,
	`episode_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`title_id`) REFERENCES `media_titles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tv_seasons_title_number_unique` ON `tv_seasons` (`title_id`,`season_number`);--> statement-breakpoint
CREATE INDEX `tv_seasons_title_idx` ON `tv_seasons` (`title_id`);