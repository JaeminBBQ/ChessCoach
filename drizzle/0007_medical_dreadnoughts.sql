CREATE TABLE `game_repertoire` (
	`game_id` integer PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`status` text NOT NULL,
	`repertoire_id` integer,
	`left_ply` integer,
	`left_san` text,
	`book_sans` text,
	`positions` text NOT NULL,
	`computed_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`repertoire_id`) REFERENCES `repertoires`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `repertoire_nodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repertoire_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`path` text NOT NULL,
	`san` text NOT NULL,
	`by` text NOT NULL,
	`fen` text NOT NULL,
	`fen_key` text NOT NULL,
	`eval` text,
	`punish` integer DEFAULT false NOT NULL,
	`note` text,
	FOREIGN KEY (`repertoire_id`) REFERENCES `repertoires`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `repertoire_nodes_userId_fenKey_idx` ON `repertoire_nodes` (`user_id`,`fen_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `repertoire_nodes_repertoireId_path_unique` ON `repertoire_nodes` (`repertoire_id`,`path`);--> statement-breakpoint
CREATE TABLE `repertoires` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`root` text NOT NULL,
	`engine` text NOT NULL,
	`generated_at` integer NOT NULL,
	`imported_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repertoires_userId_slug_unique` ON `repertoires` (`user_id`,`slug`);