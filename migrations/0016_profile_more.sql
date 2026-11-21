-- More of what a profile says about its owner: usernames on other services, a location, pronouns, a
-- record pinned to the top, and whether it shows the record they last played. And an order for badges,
-- set by an admin, starting from the order they were made.
ALTER TABLE profiles ADD COLUMN links TEXT NOT NULL DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN pronouns TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN pinned TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN playing INTEGER NOT NULL DEFAULT 0;
ALTER TABLE badges ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
UPDATE badges SET position = (SELECT COUNT(*) FROM badges b WHERE b.created_at < badges.created_at);
