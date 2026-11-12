-- Sync accounts of its own: a name (the Discogs username) and a password, rather than a Discogs
-- sign-in checked with Discogs, which the Worker can't reach. Nothing synced yet, so the old tables go.
DROP TABLE IF EXISTS logins;
DROP TABLE IF EXISTS rows;
DROP TABLE IF EXISTS accounts;

-- Names aren't unique: an account is a name and a password together, so nobody can take a name
-- from anyone. proof is a fingerprint of what the browser derives from the password, never the password.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  proof TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  off TEXT NOT NULL DEFAULT '[]', -- categories switched off on the Sync page
  created_at INTEGER NOT NULL
);
CREATE INDEX accounts_name ON accounts (name, proof);

-- A browser that's in. token is a fingerprint of the key the browser keeps.
CREATE TABLE devices (
  token TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX devices_account ON devices (account);

-- "Add a device" codes, good for 10 minutes and one use
CREATE TABLE pairings (
  code TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE rows (
  account TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,
  PRIMARY KEY (account, kind, key)
) WITHOUT ROWID;
CREATE INDEX rows_seq ON rows (account, seq);
