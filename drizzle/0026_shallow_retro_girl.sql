ALTER TABLE `download_requests` ADD `submitted_at` integer;--> statement-breakpoint
ALTER TABLE `download_requests` ADD `missing_tick_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `download_requests` ADD `retry_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `download_requests` ADD `last_retried_at` integer;--> statement-breakpoint
ALTER TABLE `download_requests` ADD `dedup_key` text GENERATED ALWAYS AS (coalesce(episode_id, '__movie__')) VIRTUAL;--> statement-breakpoint
UPDATE `download_requests`
  SET `status` = 'cancelled',
      `status_message` = coalesce(`status_message`, 'cancelled by 0026 dedup migration'),
      `updated_at` = (unixepoch() * 1000)
  WHERE `media_title_id` is not null
    AND `status` in ('pending','queued','downloading','importing')
    AND `id` not in (
      SELECT `id` FROM (
        SELECT `id`,
               row_number() OVER (
                 PARTITION BY `user_id`, `media_title_id`, coalesce(`episode_id`, '__movie__')
                 ORDER BY `created_at` DESC, `id` DESC
               ) AS rn
          FROM `download_requests`
         WHERE `media_title_id` is not null
           AND `status` in ('pending','queued','downloading','importing')
      ) WHERE rn = 1
    );--> statement-breakpoint
CREATE UNIQUE INDEX `download_requests_active_dedup_unique` ON `download_requests` (`user_id`,`media_title_id`,`dedup_key`) WHERE media_title_id is not null and status in ('pending','queued','downloading','importing','requeuing');