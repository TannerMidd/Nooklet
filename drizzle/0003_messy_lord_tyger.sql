CREATE TABLE `recommendation_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`feedback` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `recommendation_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recommendation_feedback_user_item_unique` ON `recommendation_feedback` (`user_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `recommendation_item_states` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`is_hidden` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `recommendation_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recommendation_item_states_user_item_unique` ON `recommendation_item_states` (`user_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `recommendation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`media_type` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`rationale` text NOT NULL,
	`confidence_label` text,
	`provider_metadata_json` text,
	`existing_in_library` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `recommendation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recommendation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`media_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`request_prompt` text NOT NULL,
	`requested_count` integer NOT NULL,
	`ai_model` text,
	`watch_history_only` integer DEFAULT false NOT NULL,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
