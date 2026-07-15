ALTER TABLE `jobs` ADD `run_token` text;
--> statement-breakpoint
ALTER TABLE `jobs` ADD `locked_until` integer;
--> statement-breakpoint
ALTER TABLE `jobs` ADD `last_heartbeat_at` integer;
--> statement-breakpoint
CREATE INDEX `jobs_due_lease_idx` ON `jobs` (`job_type`,`is_enabled`,`next_run_at`,`locked_until`);
