ALTER TABLE `repository` ADD `review_trigger` text DEFAULT 'push' NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `focus` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `base_branches` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `repository` ADD `ignore_paths` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `pull_request` ADD `paused` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `run` ADD `focus` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `run` ADD `ignore_paths` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
-- Carry over the old switch. `auto_review` is dropped in a later migration,
-- once no deployed Worker reads it.
UPDATE `repository` SET `review_trigger` = 'request' WHERE `auto_review` = 0;
