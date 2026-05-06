CREATE TABLE `download_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`service_connection_id` text NOT NULL,
	`client_type` text NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'configured' NOT NULL,
	`status_message` text,
	`is_default` integer DEFAULT false NOT NULL,
	`last_synced_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_connection_id`) REFERENCES `service_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `download_clients_connection_unique` ON `download_clients` (`service_connection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `download_clients_user_type_name_unique` ON `download_clients` (`user_id`,`client_type`,`display_name`);--> statement-breakpoint
CREATE INDEX `download_clients_user_status_default_idx` ON `download_clients` (`user_id`,`status`,`is_default`);--> statement-breakpoint
CREATE TABLE `download_import_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`library_path_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`source_root_path` text NOT NULL,
	`destination_root_path` text,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`request_id`) REFERENCES `download_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`library_path_id`) REFERENCES `media_library_paths`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `download_import_runs_request_idx` ON `download_import_runs` (`request_id`);--> statement-breakpoint
CREATE INDEX `download_import_runs_user_status_created_idx` ON `download_import_runs` (`user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `download_import_runs_library_path_idx` ON `download_import_runs` (`library_path_id`);--> statement-breakpoint
CREATE TABLE `download_imported_files` (
	`id` text PRIMARY KEY NOT NULL,
	`import_run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`media_file_id` text,
	`source_path` text NOT NULL,
	`destination_path` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`import_run_id`) REFERENCES `download_import_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `download_imported_files_import_run_idx` ON `download_imported_files` (`import_run_id`);--> statement-breakpoint
CREATE INDEX `download_imported_files_media_file_idx` ON `download_imported_files` (`media_file_id`);--> statement-breakpoint
CREATE INDEX `download_imported_files_user_created_idx` ON `download_imported_files` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `download_queue_items` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text,
	`external_queue_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress_percent` real DEFAULT 0 NOT NULL,
	`size_bytes` integer,
	`remaining_bytes` integer,
	`eta_seconds` integer,
	`category` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`request_id`) REFERENCES `download_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `download_clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `download_queue_items_client_external_unique` ON `download_queue_items` (`client_id`,`external_queue_id`);--> statement-breakpoint
CREATE INDEX `download_queue_items_request_idx` ON `download_queue_items` (`request_id`);--> statement-breakpoint
CREATE INDEX `download_queue_items_user_status_updated_idx` ON `download_queue_items` (`user_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `download_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`media_title_id` text,
	`episode_id` text,
	`search_result_id` text,
	`client_id` text,
	`target_library_id` text,
	`target_library_path_id` text,
	`media_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_title` text NOT NULL,
	`release_title` text,
	`external_job_id` text,
	`status_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_title_id`) REFERENCES `media_titles`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`episode_id`) REFERENCES `tv_episodes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`search_result_id`) REFERENCES `indexer_search_results`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`client_id`) REFERENCES `download_clients`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_library_id`) REFERENCES `media_libraries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_library_path_id`) REFERENCES `media_library_paths`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `download_requests_user_status_created_idx` ON `download_requests` (`user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `download_requests_title_status_idx` ON `download_requests` (`media_title_id`,`status`);--> statement-breakpoint
CREATE INDEX `download_requests_episode_status_idx` ON `download_requests` (`episode_id`,`status`);--> statement-breakpoint
CREATE INDEX `download_requests_client_status_updated_idx` ON `download_requests` (`client_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `download_requests_search_result_idx` ON `download_requests` (`search_result_id`);--> statement-breakpoint
CREATE INDEX `download_requests_target_path_status_idx` ON `download_requests` (`target_library_path_id`,`status`);