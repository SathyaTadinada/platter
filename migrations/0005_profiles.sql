-- Profiles: a page at /u/<discogs username> showing what its owner chose to share. Kept apart from
-- the synced rows, which stay private, so nothing a profile serves can come from them.

CREATE TABLE profiles (
  account TEXT PRIMARY KEY,
  sections TEXT NOT NULL DEFAULT '{}', -- which sections are on, e.g. {"collection":"public"}
  published_at INTEGER, -- when its owner's devices last sent anything
  created_at INTEGER NOT NULL
);

-- One row per record, wantlist entry, or summary. value is JSON, written by the owner's devices.
CREATE TABLE profile_rows (
  account TEXT NOT NULL,
  kind TEXT NOT NULL, -- item, want, stats, year
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account, kind, key)
) WITHOUT ROWID;
CREATE INDEX profile_rows_kind ON profile_rows (account, kind, key);
