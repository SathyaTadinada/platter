-- Cloud sync: what each account has saved, and which Discogs sign-ins belong to it.

-- A Discogs sign-in (hashed, never stored as-is) and the account it was confirmed to belong to
CREATE TABLE logins (
  hash TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  verified_at INTEGER NOT NULL
);
CREATE INDEX logins_username ON logins (username);

-- One per account. seq goes up with every saved change, so a device can ask for what's new.
CREATE TABLE accounts (
  username TEXT PRIMARY KEY,
  seq INTEGER NOT NULL DEFAULT 0
);

-- Everything synced, one row per thing (a play, a day of value history, a setting). value is JSON,
-- or null once deleted; deleted rows stay so other devices hear about the delete.
CREATE TABLE rows (
  username TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,
  PRIMARY KEY (username, kind, key)
) WITHOUT ROWID;
CREATE INDEX rows_seq ON rows (username, seq);
