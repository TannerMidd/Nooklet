CREATE TABLE `watch_history_items` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`user_id` text NOT NULL,
	`media_type` text NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`normalized_key` text NOT NULL,
	`watched_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `watch_history_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watch_history_items_user_media_key_unique` ON `watch_history_items` (`user_id`,`media_type`,`normalized_key`);--> statement-breakpoint
CREATE TABLE `watch_history_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_type` text DEFAULT 'manual' NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watch_history_sources_user_type_unique` ON `watch_history_sources` (`user_id`,`source_type`);--> statement-breakpoint
CREATE TABLE `watch_history_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`user_id` text NOT NULL,
	`media_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`source_id`) REFERENCES `watch_history_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
