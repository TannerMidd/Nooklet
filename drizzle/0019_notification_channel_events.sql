CREATE TABLE `notification_channel_events` (
	`channel_id` text NOT NULL,
	`event_type` text NOT NULL,
	PRIMARY KEY(`channel_id`, `event_type`),
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `notification_channel_events` (`channel_id`, `event_type`)
SELECT `notification_channels`.`id`, `json_each`.`value`
FROM `notification_channels`, json_each(`notification_channels`.`event_mask_json`)
WHERE json_valid(`notification_channels`.`event_mask_json`);
--> statement-breakpoint
ALTER TABLE `notification_channels` DROP COLUMN `event_mask_json`;