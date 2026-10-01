CREATE TABLE `plan_task_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`week_start` integer NOT NULL,
	`task_id` text NOT NULL,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_task_checks_userId_weekStart_taskId_unique` ON `plan_task_checks` (`user_id`,`week_start`,`task_id`);--> statement-breakpoint
ALTER TABLE `drill_cards` ADD `motif` text;