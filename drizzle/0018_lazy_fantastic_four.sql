CREATE TABLE `notification_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel_type` text NOT NULL,
	`display_name` text NOT NULL,
	`target_url` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`event_mask_json` text DEFAULT '["recommendation_run_succeeded","recommendation_run_failed"]' NOT NULL,
	`last_dispatch_at` integer,
	`last_dispatch_status` text,
	`last_dispatch_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_channels_user_name_unique` ON `notification_channels` (`user_id`,`display_name`);