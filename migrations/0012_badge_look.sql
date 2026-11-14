-- How a badge looks: one of a few colors and icons the app knows, gray with an award unless picked.
-- Early supporter keeps the amber it has had.
ALTER TABLE badges ADD COLUMN color TEXT NOT NULL DEFAULT 'gray';
ALTER TABLE badges ADD COLUMN icon TEXT NOT NULL DEFAULT 'award';
UPDATE badges SET color = 'amber' WHERE id = 'early';
