CREATE TABLE `download_fulfillments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`media_title_id` text NOT NULL,
	`season_id` text NOT NULL,
	`target_library_path_id` text,
	`requested_title` text NOT NULL,
	`strategy` text DEFAULT 'season_pack' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`pack_attempt_count` integer DEFAULT 0 NOT NULL,
	`pack_attempt_limit` integer DEFAULT 3 NOT NULL,
	`next_attempt_at` integer,
	`status_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_title_id`) REFERENCES `media_titles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_id`) REFERENCES `tv_seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_library_path_id`) REFERENCES `media_library_paths`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `download_fulfillments_user_status_due_idx` ON `download_fulfillments` (`user_id`,`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `download_fulfillments_season_idx` ON `download_fulfillments` (`season_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `download_fulfillments_open_season_unique` ON `download_fulfillments` (`user_id`,`media_title_id`,`season_id`) WHERE status in ('active','retry_wait','partial');--> statement-breakpoint
CREATE TABLE `download_fulfillment_episodes` (
	`fulfillment_id` text NOT NULL,
	`episode_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`status_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`fulfillment_id`, `episode_id`),
	FOREIGN KEY (`fulfillment_id`) REFERENCES `download_fulfillments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`episode_id`) REFERENCES `tv_episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `download_fulfillment_episodes_status_due_idx` ON `download_fulfillment_episodes` (`fulfillment_id`,`status`,`next_attempt_at`);--> statement-breakpoint
ALTER TABLE `download_requests` ADD `fulfillment_id` text REFERENCES download_fulfillments(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `download_requests` ADD `attempt_strategy` text;--> statement-breakpoint
ALTER TABLE `download_requests` ADD `attempt_number` integer;--> statement-breakpoint
CREATE INDEX `download_requests_fulfillment_created_idx` ON `download_requests` (`fulfillment_id`,`created_at`);
