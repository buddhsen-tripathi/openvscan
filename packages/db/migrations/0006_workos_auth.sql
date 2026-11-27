-- Sign-in moves from Better Auth to WorkOS AuthKit, and user ids become
-- WorkOS ids. Existing accounts are not carried over: everyone signs in
-- again, and their installations, repositories, credentials and reviews
-- (which cascade from the user) start fresh.
DELETE FROM `user`;--> statement-breakpoint
CREATE TABLE `github_account` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`github_id` text NOT NULL,
	`login` text NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_account_user_id_unique` ON `github_account` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `github_account_github_id_unique` ON `github_account` (`github_id`);--> statement-breakpoint
DROP TABLE `account`;--> statement-breakpoint
DROP TABLE `rate_limit`;--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
DROP TABLE `verification`;--> statement-breakpoint
ALTER TABLE `repository` DROP COLUMN `auto_review`;