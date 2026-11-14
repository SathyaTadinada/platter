-- A profile an admin has taken down. Its owner can't put it back by changing who it's for.
ALTER TABLE profiles ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
