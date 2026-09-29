-- Hand-edited (T003): SQLite cannot ADD COLUMN ... NOT NULL without a default,
-- and drizzle-kit's generated ALTER omitted ON DELETE CASCADE. Rebuild `games`
-- instead: create the new table, copy, drop, rename, and recreate the indexes.
-- `games` is empty in every existing DB, so the copy preserves nothing but
-- keeps the statement valid.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`account_id` integer NOT NULL,
	`platform` text NOT NULL,
	`external_id` text NOT NULL,
	`url` text NOT NULL,
	`pgn` text NOT NULL,
	`played_at` integer NOT NULL,
	`time_control` text,
	`rated` integer DEFAULT true NOT NULL,
	`speed` text NOT NULL,
	`user_color` text NOT NULL,
	`result` text NOT NULL,
	`termination` text,
	`user_rating` integer,
	`opponent_name` text,
	`opponent_rating` integer,
	`opening_eco` text,
	`opening_name` text,
	`imported_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `linked_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_games`(`id`, `user_id`, `platform`, `external_id`, `url`, `pgn`, `played_at`, `time_control`, `rated`, `speed`, `user_color`, `result`, `termination`, `user_rating`, `opponent_name`, `opponent_rating`, `opening_eco`, `opening_name`, `imported_at`) SELECT `id`, `user_id`, `platform`, `external_id`, `url`, `pgn`, `played_at`, `time_control`, `rated`, `speed`, `user_color`, `result`, `termination`, `user_rating`, `opponent_name`, `opponent_rating`, `opening_eco`, `opening_name`, `imported_at` FROM `games`;--> statement-breakpoint
DROP TABLE `games`;--> statement-breakpoint
ALTER TABLE `__new_games` RENAME TO `games`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `games_platform_externalId_userId_unique` ON `games` (`platform`,`external_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `linked_accounts` ADD `created_at` integer DEFAULT 0 NOT NULL;