CREATE TABLE `youtube_downloads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`video_id` text NOT NULL,
	`source_id` text,
	`library_path_id` text NOT NULL,
	`quality_profile` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`control_intent` text,
	`progress_percent` real DEFAULT 0 NOT NULL,
	`downloaded_bytes` integer DEFAULT 0 NOT NULL,
	`total_bytes` integer,
	`bytes_per_second` integer,
	`eta_seconds` integer,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`failure_kind` text,
	`error_message` text,
	`staging_path` text,
	`final_path` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`video_id`) REFERENCES `youtube_videos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `youtube_sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`library_path_id`) REFERENCES `media_library_paths`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `youtube_downloads_user_video_path_quality_unique` ON `youtube_downloads` (`user_id`,`video_id`,`library_path_id`,`quality_profile`);--> statement-breakpoint
CREATE INDEX `youtube_downloads_status_attempt_idx` ON `youtube_downloads` (`status`,`next_attempt_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `youtube_downloads_user_created_idx` ON `youtube_downloads` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `youtube_downloads_source_idx` ON `youtube_downloads` (`source_id`);--> statement-breakpoint
CREATE TABLE `youtube_source_videos` (
	`source_id` text NOT NULL,
	`video_id` text NOT NULL,
	`remote_present` integer DEFAULT true NOT NULL,
	`first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`removed_at` integer,
	`auto_queued_at` integer,
	PRIMARY KEY(`source_id`, `video_id`),
	FOREIGN KEY (`source_id`) REFERENCES `youtube_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`video_id`) REFERENCES `youtube_videos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `youtube_source_videos_source_present_idx` ON `youtube_source_videos` (`source_id`,`remote_present`);--> statement-breakpoint
CREATE INDEX `youtube_source_videos_video_idx` ON `youtube_source_videos` (`video_id`);--> statement-breakpoint
CREATE TABLE `youtube_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_kind` text NOT NULL,
	`youtube_source_id` text NOT NULL,
	`canonical_url` text NOT NULL,
	`title` text NOT NULL,
	`channel_id` text,
	`channel_title` text,
	`thumbnail_url` text,
	`library_path_id` text NOT NULL,
	`quality_profile` text DEFAULT 'mp4-1080p' NOT NULL,
	`status` text DEFAULT 'initializing' NOT NULL,
	`baseline_completed_at` integer,
	`last_synced_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`library_path_id`) REFERENCES `media_library_paths`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `youtube_sources_user_kind_external_unique` ON `youtube_sources` (`user_id`,`source_kind`,`youtube_source_id`);--> statement-breakpoint
CREATE INDEX `youtube_sources_user_status_idx` ON `youtube_sources` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `youtube_sources_library_path_idx` ON `youtube_sources` (`library_path_id`);--> statement-breakpoint
CREATE TABLE `youtube_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`youtube_video_id` text NOT NULL,
	`channel_id` text,
	`channel_title` text,
	`title` text NOT NULL,
	`description` text,
	`published_at` integer,
	`duration_seconds` integer,
	`thumbnail_url` text,
	`webpage_url` text NOT NULL,
	`content_kind` text DEFAULT 'unknown' NOT NULL,
	`availability` text DEFAULT 'public' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `youtube_videos_user_video_unique` ON `youtube_videos` (`user_id`,`youtube_video_id`);--> statement-breakpoint
CREATE INDEX `youtube_videos_user_published_idx` ON `youtube_videos` (`user_id`,`published_at`);