CREATE TABLE `reference_objects` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`aliases` text DEFAULT '' NOT NULL,
	`shape` text NOT NULL,
	`width_mm` real NOT NULL,
	`height_mm` real NOT NULL
);
--> statement-breakpoint
ALTER TABLE `images` ADD `analysis` text;--> statement-breakpoint
INSERT INTO `reference_objects` (`id`, `name`, `aliases`, `shape`, `width_mm`, `height_mm`) VALUES
('id1-card', 'ISO/IEC 7810 ID-1 card', 'credit card, debit card, bank card, driving licence, Aadhaar PVC card, PAN card, ID card, metro card, hotel key card', 'rect', 85.6, 53.98),
('a4', 'A4 paper sheet', 'ISO 216 A4, printer paper', 'rect', 297, 210),
('a5', 'A5 paper sheet', 'ISO 216 A5, half A4', 'rect', 210, 148),
('us-letter', 'US Letter paper sheet', '8.5x11 inch paper', 'rect', 279.4, 215.9),
('business-card-us', 'US business card', '3.5x2 inch card', 'rect', 88.9, 50.8),
('business-card-eu', 'EU/ISO business card', 'ISO 7810 sized business card', 'rect', 85, 55),
('sticky-note', 'Square sticky note', 'Post-it 3x3 inch', 'rect', 76, 76),
('usd-bill', 'US dollar banknote', 'any US paper currency', 'rect', 156.1, 66.3),
('inr-500', 'Indian 500 rupee note (Mahatma Gandhi New Series)', 'INR 500', 'rect', 150, 66),
('inr-200', 'Indian 200 rupee note', 'INR 200', 'rect', 146, 66),
('inr-100-new', 'Indian 100 rupee note (new lavender)', 'INR 100', 'rect', 142, 66),
('sd-card', 'SD memory card', 'full-size SD card', 'rect', 32, 24),
('aa-battery', 'AA battery (side view)', 'LR6, 14500', 'rect', 50.5, 14.5),
('soda-can-330', '12 oz / 355 ml soda can (side view)', 'Coke can, beer can', 'rect', 122.2, 66.2),
('cd', 'CD/DVD disc', 'compact disc, Blu-ray', 'circle', 120, 120),
('us-quarter', 'US quarter coin', '25 cents', 'circle', 24.26, 24.26),
('us-penny', 'US penny coin', '1 cent', 'circle', 19.05, 19.05),
('euro-1', '1 euro coin', 'EUR 1', 'circle', 23.25, 23.25),
('euro-2', '2 euro coin', 'EUR 2', 'circle', 25.75, 25.75),
('uk-pound', 'UK 1 pound coin (12-sided)', 'GBP 1', 'circle', 23.43, 23.43),
('inr-10-coin', 'Indian 10 rupee coin', 'INR 10 coin', 'circle', 27, 27),
('lego-2x4', 'LEGO 2x4 brick (top view)', 'lego brick', 'rect', 31.8, 15.8);
