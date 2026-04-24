DROP INDEX `watch_history_items_user_media_key_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `watch_history_items_source_media_key_unique` ON `watch_history_items` (`source_id`,`media_type`,`normalized_key`);--> statement-breakpoint
ALTER TABLE `watch_history_sources` ADD `metadata_json` text;