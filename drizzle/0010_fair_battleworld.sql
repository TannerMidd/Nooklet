ALTER TABLE `preferences` ADD `default_sonarr_root_folder_path` text;
--> statement-breakpoint
ALTER TABLE `preferences` ADD `default_sonarr_quality_profile_id` integer;
--> statement-breakpoint
ALTER TABLE `preferences` ADD `default_radarr_root_folder_path` text;
--> statement-breakpoint
ALTER TABLE `preferences` ADD `default_radarr_quality_profile_id` integer;