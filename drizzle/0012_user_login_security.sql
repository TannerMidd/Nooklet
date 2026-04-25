ALTER TABLE `users` ADD `failed_login_attempts` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `locked_until` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD `password_changed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL;
