-- 0030 was journaled with a timestamp lower than 0029, so databases that had
-- already applied 0029 skipped it. Recreate the already-modeled objects using
-- idempotent DDL at a monotonic migration timestamp.
CREATE TABLE IF NOT EXISTS `media_request_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `media_request_attempts_user_key_unique` ON `media_request_attempts` (`user_id`,`request_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_request_attempts_expires_idx` ON `media_request_attempts` (`expires_at`);
