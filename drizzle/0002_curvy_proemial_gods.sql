CREATE TABLE `service_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`service_type` text NOT NULL,
	`ownership_scope` text DEFAULT 'user' NOT NULL,
	`owner_user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`base_url` text,
	`status` text DEFAULT 'configured' NOT NULL,
	`status_message` text,
	`metadata_json` text,
	`last_verified_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_connections_owner_service_unique` ON `service_connections` (`owner_user_id`,`service_type`);--> statement-breakpoint
CREATE TABLE `service_secrets` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`encrypted_value` text NOT NULL,
	`masked_value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `service_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
