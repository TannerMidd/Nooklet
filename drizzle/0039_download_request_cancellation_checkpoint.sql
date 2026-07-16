ALTER TABLE `download_requests`
ADD `cancellation_requested_at` integer;
--> statement-breakpoint
CREATE INDEX `download_requests_cancellation_pending_idx`
ON `download_requests` (`user_id`, `cancellation_requested_at`)
WHERE `cancellation_requested_at` IS NOT NULL;
