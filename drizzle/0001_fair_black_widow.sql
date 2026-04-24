CREATE TABLE `preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`default_media_mode` text DEFAULT 'tv' NOT NULL,
	`default_result_count` integer DEFAULT 10 NOT NULL,
	`watch_history_only` integer DEFAULT false NOT NULL,
	`history_hide_existing` integer DEFAULT false NOT NULL,
	`history_hide_liked` integer DEFAULT false NOT NULL,
	`history_hide_disliked` integer DEFAULT false NOT NULL,
	`history_hide_hidden` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
