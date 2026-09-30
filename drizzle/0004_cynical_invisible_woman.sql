CREATE TABLE `drill_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`ply` integer NOT NULL,
	`kind` text NOT NULL,
	`fen` text NOT NULL,
	`solution_uci` text NOT NULL,
	`solution_san` text NOT NULL,
	`solution_win` real NOT NULL,
	`played_san` text NOT NULL,
	`played_win` real NOT NULL,
	`last_move_uci` text,
	`ease` real NOT NULL,
	`interval_days` real NOT NULL,
	`reps` integer NOT NULL,
	`lapses` integer NOT NULL,
	`due` integer NOT NULL,
	`last_reviewed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drill_cards_gameId_ply_unique` ON `drill_cards` (`game_id`,`ply`);--> statement-breakpoint
CREATE TABLE `drill_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`card_id` integer NOT NULL,
	`grade` text NOT NULL,
	`correct` integer NOT NULL,
	`reviewed_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_id`) REFERENCES `drill_cards`(`id`) ON UPDATE no action ON DELETE cascade
);
