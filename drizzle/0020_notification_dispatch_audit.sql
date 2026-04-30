CREATE TABLE `notification_dispatch_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`dispatched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`status` text NOT NULL,
	`message` text,
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_dispatch_audit_channel_dispatched_idx` ON `notification_dispatch_audit` (`channel_id`,`dispatched_at`);--> statement-breakpoint
INSERT INTO `notification_dispatch_audit` (`id`, `channel_id`, `dispatched_at`, `status`, `message`)
SELECT lower(hex(randomblob(16))), `id`, `last_dispatch_at`, `last_dispatch_status`, `last_dispatch_message`
FROM `notification_channels`
WHERE `last_dispatch_at` IS NOT NULL
  AND `last_dispatch_status` IN ('success', 'error');
--> statement-breakpoint
ALTER TABLE `notification_channels` DROP COLUMN `last_dispatch_at`;--> statement-breakpoint
ALTER TABLE `notification_channels` DROP COLUMN `last_dispatch_status`;--> statement-breakpoint
ALTER TABLE `notification_channels` DROP COLUMN `last_dispatch_message`;