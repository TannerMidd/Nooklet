ALTER TABLE `users` ADD `failed_login_attempts` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `locked_until` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD `password_changed_at` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `password_changed_at` = (unixepoch() * 1000) WHERE `password_changed_at` = 0;
