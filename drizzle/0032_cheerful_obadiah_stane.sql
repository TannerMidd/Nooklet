CREATE TABLE `engine_downloads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'movies' NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`nzb_xml` text NOT NULL,
	`password` text,
	`total_bytes` integer DEFAULT 0 NOT NULL,
	`downloaded_bytes` integer DEFAULT 0 NOT NULL,
	`total_segments` integer DEFAULT 0 NOT NULL,
	`completed_segments` integer DEFAULT 0 NOT NULL,
	`failed_segments` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`output_path` text,
	`imported_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `engine_downloads_user_state_priority_idx` ON `engine_downloads` (`user_id`,`state`,`priority`);--> statement-breakpoint
CREATE INDEX `engine_downloads_state_updated_idx` ON `engine_downloads` (`state`,`updated_at`);