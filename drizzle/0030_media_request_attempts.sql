CREATE TABLE `media_request_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_request_attempts_user_key_unique` ON `media_request_attempts` (`user_id`,`request_key`);--> statement-breakpoint
CREATE INDEX `media_request_attempts_expires_idx` ON `media_request_attempts` (`expires_at`);