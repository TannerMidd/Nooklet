CREATE TABLE `storage_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`path` text NOT NULL,
	`exists` integer DEFAULT false NOT NULL,
	`reachable` integer DEFAULT false NOT NULL,
	`readable` integer DEFAULT false NOT NULL,
	`writable` integer DEFAULT false NOT NULL,
	`free_space_bytes` integer,
	`total_space_bytes` integer,
	`error_message` text,
	`checked_at` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `storage_snapshots_kind_idx` ON `storage_snapshots` (`kind`);
