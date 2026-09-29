CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`platform` text NOT NULL,
	`external_id` text NOT NULL,
	`url` text NOT NULL,
	`pgn` text NOT NULL,
	`played_at` integer NOT NULL,
	`time_control` text,
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
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_platform_externalId_userId_unique` ON `games` (`platform`,`external_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `linked_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`platform` text NOT NULL,
	`username` text NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `linked_accounts_platform_username_userId_unique` ON `linked_accounts` (`platform`,`username`,`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL
);
