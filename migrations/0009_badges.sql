-- Badges an admin can give, made and renamed from the Members page. Accounts keep the ids, so a
-- rename shows everywhere at once.
CREATE TABLE badges (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX badges_label ON badges (lower(label));
INSERT INTO badges (id, label, created_at) VALUES ('early', 'Early supporter', 1794627793493);
