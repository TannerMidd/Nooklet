CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_type` text NOT NULL,
	`target_type` text NOT NULL,
	`target_key` text NOT NULL,
	`schedule_minutes` integer NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`next_run_at` integer,
	`last_started_at` integer,
	`last_completed_at` integer,
	`last_status` text DEFAULT 'idle' NOT NULL,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_user_type_target_unique` ON `jobs` (`user_id`,`job_type`,`target_type`,`target_key`);