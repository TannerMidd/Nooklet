CREATE TABLE `indexer_media_categories` (
	`indexer_id` text NOT NULL,
	`media_type` text NOT NULL,
	`category_id` text NOT NULL,
	`label` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`indexer_id`, `media_type`, `category_id`),
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `indexer_media_categories_media_idx` ON `indexer_media_categories` (`media_type`);--> statement-breakpoint
CREATE TABLE `indexer_search_result_secrets` (
	`result_id` text PRIMARY KEY NOT NULL,
	`encrypted_download_url` text NOT NULL,
	`masked_download_url` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`result_id`) REFERENCES `indexer_search_results`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `indexer_search_results` (
	`id` text PRIMARY KEY NOT NULL,
	`search_run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`indexer_id` text,
	`media_type` text NOT NULL,
	`title` text NOT NULL,
	`normalized_title` text NOT NULL,
	`indexer_guid` text NOT NULL,
	`quality_label` text,
	`release_group` text,
	`size_bytes` integer,
	`published_at` integer,
	`age_minutes` integer,
	`seeders` integer,
	`leechers` integer,
	`grabs` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`search_run_id`) REFERENCES `indexer_search_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `indexer_search_results_run_guid_unique` ON `indexer_search_results` (`search_run_id`,`indexer_guid`);--> statement-breakpoint
CREATE INDEX `indexer_search_results_user_media_created_idx` ON `indexer_search_results` (`user_id`,`media_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `indexer_search_results_indexer_guid_idx` ON `indexer_search_results` (`indexer_id`,`indexer_guid`);--> statement-breakpoint
CREATE TABLE `indexer_search_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`indexer_id` text,
	`media_type` text NOT NULL,
	`query` text NOT NULL,
	`normalized_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`result_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `indexer_search_runs_user_status_created_idx` ON `indexer_search_runs` (`user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `indexer_search_runs_user_expiry_idx` ON `indexer_search_runs` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `indexer_search_runs_indexer_created_idx` ON `indexer_search_runs` (`indexer_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `indexer_secrets` (
	`indexer_id` text PRIMARY KEY NOT NULL,
	`encrypted_api_key` text NOT NULL,
	`masked_api_key` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `indexers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`protocol` text NOT NULL,
	`base_url` text NOT NULL,
	`api_path` text DEFAULT '/api' NOT NULL,
	`status` text DEFAULT 'configured' NOT NULL,
	`status_message` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`last_tested_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `indexers_user_name_unique` ON `indexers` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX `indexers_user_enabled_priority_idx` ON `indexers` (`user_id`,`is_enabled`,`priority`);--> statement-breakpoint
CREATE INDEX `indexers_user_protocol_status_idx` ON `indexers` (`user_id`,`protocol`,`status`);