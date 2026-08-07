-- Assembly happens in place during fetching, so the historical state was
-- never written by the engine. Normalize hand-edited or pre-release rows
-- before removing the value from the TypeScript state machine.
UPDATE `engine_downloads`
SET
	`state` = CASE WHEN `control_intent` = 'pause' THEN 'paused' ELSE 'queued' END,
	`control_intent` = CASE WHEN `control_intent` = 'pause' THEN NULL ELSE `control_intent` END,
	`bytes_per_second` = NULL,
	`updated_at` = (unixepoch() * 1000)
WHERE `state` = 'assembling';
