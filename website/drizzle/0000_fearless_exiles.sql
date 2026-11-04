CREATE TABLE `interview_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`body` text NOT NULL,
	`lock_token` text,
	`lock_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_owner` ON `interview_sessions` (`owner`);--> statement-breakpoint
CREATE TABLE `agent_settings` (
	`owner` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL
);
