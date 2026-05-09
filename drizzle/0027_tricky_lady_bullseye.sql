DROP INDEX `download_requests_active_dedup_unique`;--> statement-breakpoint
ALTER TABLE `download_requests` DROP COLUMN `dedup_key`;--> statement-breakpoint
ALTER TABLE `download_requests` ADD `season_id` text REFERENCES tv_seasons(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `download_requests` ADD `dedup_key` text GENERATED ALWAYS AS (coalesce(episode_id, season_id, '__movie__')) VIRTUAL;--> statement-breakpoint
CREATE INDEX `download_requests_season_status_idx` ON `download_requests` (`season_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `download_requests_active_dedup_unique` ON `download_requests` (`user_id`,`media_title_id`,`dedup_key`) WHERE media_title_id is not null and status in ('pending','queued','downloading','importing','requeuing');