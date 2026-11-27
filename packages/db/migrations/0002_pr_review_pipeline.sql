-- OpenVScan v2: PR-centric review pipeline.
-- Replaces project/scan/finding/scan_log with pull_request/run/finding/run_log,
-- adds agent_credential, and rebuilds repository with the new review policy
-- (connected repositories are preserved; old scan history is dropped).
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
DROP TABLE IF EXISTS `scan_log`;--> statement-breakpoint
DROP TABLE IF EXISTS `finding`;--> statement-breakpoint
DROP TABLE IF EXISTS `scan`;--> statement-breakpoint
DROP TABLE IF EXISTS `project`;--> statement-breakpoint
CREATE TABLE `__new_repository` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`installation_id` text NOT NULL,
	`github_repo_id` text NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`full_name` text NOT NULL,
	`default_branch` text DEFAULT 'main' NOT NULL,
	`private` integer DEFAULT false NOT NULL,
	`auto_review` integer DEFAULT true NOT NULL,
	`skip_drafts` integer DEFAULT true NOT NULL,
	`scanners` text DEFAULT '["trivy","opengrep","gitleaks"]' NOT NULL,
	`agent` text,
	`agent_model` text,
	`instructions` text,
	`fail_on` text DEFAULT 'high' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`installation_id`) REFERENCES `github_installation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_repository` (`id`, `user_id`, `installation_id`, `github_repo_id`, `owner`, `name`, `full_name`, `default_branch`, `private`, `created_at`, `updated_at`) SELECT `id`, `user_id`, `installation_id`, `github_repo_id`, `owner`, `name`, `full_name`, `default_branch`, `private`, `created_at`, `updated_at` FROM `repository` WHERE `id` IN (SELECT MIN(`id`) FROM `repository` GROUP BY `github_repo_id`);--> statement-breakpoint
DROP TABLE `repository`;--> statement-breakpoint
ALTER TABLE `__new_repository` RENAME TO `repository`;--> statement-breakpoint
CREATE UNIQUE INDEX `repository_github_repo_id_uq` ON `repository` (`github_repo_id`);--> statement-breakpoint
CREATE TABLE `agent_credential` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`hint` text NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_credential_user_provider_uq` ON `agent_credential` (`user_id`,`provider`);--> statement-breakpoint
CREATE INDEX `agent_credential_user_idx` ON `agent_credential` (`user_id`);--> statement-breakpoint
CREATE TABLE `pull_request` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`author_avatar` text,
	`url` text NOT NULL,
	`state` text NOT NULL,
	`draft` integer DEFAULT false NOT NULL,
	`head_ref` text NOT NULL,
	`head_sha` text NOT NULL,
	`base_ref` text NOT NULL,
	`base_sha` text NOT NULL,
	`head_repo_full_name` text NOT NULL,
	`summary_comment_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repository`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pull_request_repo_number_uq` ON `pull_request` (`repository_id`,`number`);--> statement-breakpoint
CREATE TABLE `run` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`pull_request_id` text,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`phase` text DEFAULT 'queued' NOT NULL,
	`conclusion` text,
	`head_ref` text NOT NULL,
	`head_sha` text NOT NULL,
	`base_sha` text,
	`scanners` text NOT NULL,
	`agent` text,
	`agent_model` text,
	`fail_on` text NOT NULL,
	`ai_summary` text,
	`ai_risk` text,
	`ai_error` text,
	`counts` text,
	`scanner_stats` text,
	`files_changed` integer,
	`check_run_id` text,
	`review_id` text,
	`error` text,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repository`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pull_request_id`) REFERENCES `pull_request`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_repository_idx` ON `run` (`repository_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `run_pull_request_idx` ON `run` (`pull_request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `finding` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`source` text NOT NULL,
	`rule_id` text,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`severity` text NOT NULL,
	`file_path` text,
	`start_line` integer,
	`end_line` integer,
	`in_diff` integer DEFAULT false NOT NULL,
	`cwe` text,
	`remediation` text,
	`suggestion` text,
	`fingerprint` text NOT NULL,
	`ai_verdict` text,
	`ai_reasoning` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `run`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `finding_run_idx` ON `finding` (`run_id`);--> statement-breakpoint
CREATE TABLE `run_log` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `run`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_log_run_idx` ON `run_log` (`run_id`,`timestamp`);--> statement-breakpoint
PRAGMA defer_foreign_keys = off;
