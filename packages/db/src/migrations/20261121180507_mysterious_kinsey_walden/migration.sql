CREATE TABLE `images` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL UNIQUE,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
