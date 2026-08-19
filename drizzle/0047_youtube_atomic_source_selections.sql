CREATE TABLE `youtube_source_selections` (
	`source_id` text NOT NULL,
	`youtube_video_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`source_id`, `youtube_video_id`),
	FOREIGN KEY (`source_id`) REFERENCES `youtube_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `youtube_source_selections_source_idx` ON `youtube_source_selections` (`source_id`);
