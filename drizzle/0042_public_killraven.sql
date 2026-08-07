CREATE TABLE `instance_configuration` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `instance_configuration` (`id`, `owner_user_id`)
SELECT 'default', `id`
FROM `users`
ORDER BY
	CASE WHEN `role` = 'admin' AND `is_disabled` = 0 THEN 0 ELSE 1 END,
	`created_at`,
	`id`
LIMIT 1;--> statement-breakpoint
CREATE TEMP TABLE `instance_configuration_connection_moves` (`id` text PRIMARY KEY NOT NULL);--> statement-breakpoint
INSERT INTO `instance_configuration_connection_moves` (`id`)
SELECT `source_connection`.`id`
FROM `service_connections` AS `source_connection`
WHERE `source_connection`.`ownership_scope` = 'shared'
	AND EXISTS (SELECT 1 FROM `instance_configuration` WHERE `id` = 'default')
	AND `source_connection`.`owner_user_id` <> (
		SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM `service_connections` AS `canonical_connection`
		WHERE `canonical_connection`.`owner_user_id` = (
			SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default'
		)
			AND `canonical_connection`.`service_type` = `source_connection`.`service_type`
	)
	AND `source_connection`.`id` = (
		SELECT `candidate_connection`.`id`
		FROM `service_connections` AS `candidate_connection`
		WHERE `candidate_connection`.`ownership_scope` = 'shared'
			AND `candidate_connection`.`owner_user_id` <> (
				SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default'
			)
			AND `candidate_connection`.`service_type` = `source_connection`.`service_type`
		ORDER BY `candidate_connection`.`id`
		LIMIT 1
	);--> statement-breakpoint
UPDATE `service_connections`
SET `owner_user_id` = (SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default')
WHERE `id` IN (SELECT `id` FROM `instance_configuration_connection_moves`);--> statement-breakpoint
DROP TABLE `instance_configuration_connection_moves`;--> statement-breakpoint
CREATE TEMP TABLE `instance_configuration_indexer_moves` (`id` text PRIMARY KEY NOT NULL);--> statement-breakpoint
INSERT INTO `instance_configuration_indexer_moves` (`id`)
SELECT `source_indexer`.`id`
FROM `indexers` AS `source_indexer`
WHERE EXISTS (SELECT 1 FROM `instance_configuration` WHERE `id` = 'default')
	AND `source_indexer`.`user_id` <> (
		SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM `indexers` AS `canonical_indexer`
		WHERE `canonical_indexer`.`user_id` = (
			SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default'
		)
			AND `canonical_indexer`.`name` = `source_indexer`.`name`
	)
	AND `source_indexer`.`id` = (
		SELECT `candidate_indexer`.`id`
		FROM `indexers` AS `candidate_indexer`
		WHERE `candidate_indexer`.`user_id` <> (
			SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default'
		)
			AND `candidate_indexer`.`name` = `source_indexer`.`name`
		ORDER BY `candidate_indexer`.`id`
		LIMIT 1
	);--> statement-breakpoint
UPDATE `indexers`
SET `user_id` = (SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default')
WHERE `id` IN (SELECT `id` FROM `instance_configuration_indexer_moves`);--> statement-breakpoint
DROP TABLE `instance_configuration_indexer_moves`;--> statement-breakpoint
CREATE TEMP TABLE `instance_configuration_library_candidates` (`id` text PRIMARY KEY NOT NULL);--> statement-breakpoint
INSERT INTO `instance_configuration_library_candidates` (`id`)
SELECT `source_library`.`id`
FROM `media_libraries` AS `source_library`
WHERE EXISTS (SELECT 1 FROM `instance_configuration` WHERE `id` = 'default')
	AND `source_library`.`user_id` <> (
		SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM `media_libraries` AS `canonical_library`
		WHERE `canonical_library`.`user_id` = (
			SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default'
		)
			AND `canonical_library`.`media_type` = `source_library`.`media_type`
			AND `canonical_library`.`name` = `source_library`.`name`
	)
	AND NOT EXISTS (
		SELECT 1
		FROM `media_library_paths` AS `source_path`
		INNER JOIN `media_library_paths` AS `canonical_path`
			ON `canonical_path`.`user_id` = (
				SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default'
			)
			AND `canonical_path`.`path` = `source_path`.`path`
		WHERE `source_path`.`library_id` = `source_library`.`id`
	);--> statement-breakpoint
CREATE TEMP TABLE `instance_configuration_library_moves` (`id` text PRIMARY KEY NOT NULL);--> statement-breakpoint
INSERT INTO `instance_configuration_library_moves` (`id`)
SELECT `source_library`.`id`
FROM `instance_configuration_library_candidates` AS `source_candidate`
INNER JOIN `media_libraries` AS `source_library` ON `source_library`.`id` = `source_candidate`.`id`
WHERE NOT EXISTS (
	SELECT 1
	FROM `instance_configuration_library_candidates` AS `other_candidate`
	INNER JOIN `media_libraries` AS `other_library` ON `other_library`.`id` = `other_candidate`.`id`
	WHERE `other_library`.`id` < `source_library`.`id`
		AND (
			(
				`other_library`.`media_type` = `source_library`.`media_type`
				AND `other_library`.`name` = `source_library`.`name`
			)
			OR EXISTS (
				SELECT 1
				FROM `media_library_paths` AS `source_path`
				INNER JOIN `media_library_paths` AS `other_path`
					ON `other_path`.`library_id` = `other_library`.`id`
					AND `other_path`.`path` = `source_path`.`path`
				WHERE `source_path`.`library_id` = `source_library`.`id`
			)
		)
);--> statement-breakpoint
UPDATE `media_library_paths`
SET `user_id` = (SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default')
WHERE `library_id` IN (SELECT `id` FROM `instance_configuration_library_moves`);--> statement-breakpoint
UPDATE `media_libraries`
SET `user_id` = (SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default')
WHERE `id` IN (SELECT `id` FROM `instance_configuration_library_moves`);--> statement-breakpoint
DROP TABLE `instance_configuration_library_moves`;--> statement-breakpoint
DROP TABLE `instance_configuration_library_candidates`;--> statement-breakpoint
DROP INDEX `download_clients_connection_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `download_clients_user_connection_unique` ON `download_clients` (`user_id`,`service_connection_id`);--> statement-breakpoint
CREATE INDEX `audit_events_actor_created_idx` ON `audit_events` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_type_created_idx` ON `audit_events` (`event_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_created_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `recommendation_timeline_user_item_created_idx` ON `recommendation_item_timeline_events` (`user_id`,`item_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `recommendation_items_run_position_idx` ON `recommendation_items` (`run_id`,`position`);--> statement-breakpoint
CREATE INDEX `recommendation_run_metrics_user_created_idx` ON `recommendation_run_metrics` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `recommendation_runs_user_media_created_idx` ON `recommendation_runs` (`user_id`,`media_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `watch_history_items_user_media_watched_idx` ON `watch_history_items` (`user_id`,`media_type`,`watched_at`);--> statement-breakpoint
CREATE INDEX `watch_history_items_user_media_key_idx` ON `watch_history_items` (`user_id`,`media_type`,`normalized_key`);--> statement-breakpoint
CREATE INDEX `watch_history_sync_runs_user_created_idx` ON `watch_history_sync_runs` (`user_id`,`created_at`);
