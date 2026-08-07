CREATE TEMP TABLE `instance_configuration_job_moves` (
	`id` text PRIMARY KEY NOT NULL
);--> statement-breakpoint
INSERT INTO `instance_configuration_job_moves` (`id`)
SELECT `source_job`.`id`
FROM `jobs` AS `source_job`
WHERE EXISTS (SELECT 1 FROM `instance_configuration` WHERE `id` = 'default')
	AND `source_job`.`user_id` <> (
		SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default'
	)
	AND `source_job`.`job_type` IN (
		'media-library-scan',
		'missing-content-search',
		'metadata-refresh'
	)
	AND `source_job`.`target_type` = 'media-library'
	AND `source_job`.`target_key` = 'all'
	AND NOT EXISTS (
		SELECT 1
		FROM `jobs` AS `canonical_job`
		WHERE `canonical_job`.`user_id` = (
			SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default'
		)
			AND `canonical_job`.`job_type` = `source_job`.`job_type`
			AND `canonical_job`.`target_type` = 'media-library'
			AND `canonical_job`.`target_key` = 'all'
	)
	AND `source_job`.`id` = (
		SELECT `candidate_job`.`id`
		FROM `jobs` AS `candidate_job`
		WHERE `candidate_job`.`user_id` <> (
			SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default'
		)
			AND `candidate_job`.`job_type` = `source_job`.`job_type`
			AND `candidate_job`.`target_type` = 'media-library'
			AND `candidate_job`.`target_key` = 'all'
		ORDER BY `candidate_job`.`id`
		LIMIT 1
	);--> statement-breakpoint
UPDATE `jobs`
SET
	`user_id` = (SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default'),
	`last_status` = CASE WHEN `last_status` = 'running' THEN 'idle' ELSE `last_status` END,
	`run_token` = NULL,
	`locked_until` = NULL,
	`last_heartbeat_at` = NULL,
	`updated_at` = (unixepoch() * 1000)
WHERE `id` IN (SELECT `id` FROM `instance_configuration_job_moves`);--> statement-breakpoint
UPDATE `jobs`
SET
	`is_enabled` = 0,
	`next_run_at` = NULL,
	`last_status` = CASE WHEN `last_status` = 'running' THEN 'idle' ELSE `last_status` END,
	`run_token` = NULL,
	`locked_until` = NULL,
	`last_heartbeat_at` = NULL,
	`updated_at` = (unixepoch() * 1000)
WHERE EXISTS (SELECT 1 FROM `instance_configuration` WHERE `id` = 'default')
	AND `user_id` <> (SELECT `owner_user_id` FROM `instance_configuration` WHERE `id` = 'default')
	AND `job_type` IN (
		'media-library-scan',
		'missing-content-search',
		'metadata-refresh'
	)
	AND `target_type` = 'media-library'
	AND `target_key` = 'all'
	AND (
		`is_enabled` <> 0
		OR `next_run_at` IS NOT NULL
		OR `last_status` = 'running'
		OR `run_token` IS NOT NULL
		OR `locked_until` IS NOT NULL
		OR `last_heartbeat_at` IS NOT NULL
	);--> statement-breakpoint
DROP TABLE `instance_configuration_job_moves`;
