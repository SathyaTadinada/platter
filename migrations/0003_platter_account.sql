-- The Platter account: sync accounts tied to a Discogs user ID the server confirmed itself, with
-- passkeys, an optional password, and an admin flag. SQLite can't drop NOT NULL from proof, so the
-- table is rebuilt.

CREATE TABLE accounts_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  proof TEXT, -- null when no password is set
  discogs_id INTEGER, -- null until the account's Discogs login has been confirmed once
  admin INTEGER NOT NULL DEFAULT 0, -- set by hand with wrangler d1 execute, never from the app
  badges TEXT NOT NULL DEFAULT '[]',
  seq INTEGER NOT NULL DEFAULT 0,
  off TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
INSERT INTO accounts_new (id, name, proof, seq, off, created_at) SELECT id, name, proof, seq, off, created_at FROM accounts;
DROP TABLE accounts;
ALTER TABLE accounts_new RENAME TO accounts;
CREATE INDEX accounts_name ON accounts (name, proof);
CREATE UNIQUE INDEX accounts_discogs ON accounts (discogs_id);

-- For the device list
ALTER TABLE devices ADD COLUMN name TEXT;
ALTER TABLE devices ADD COLUMN last_seen_at INTEGER;

CREATE TABLE passkeys (
  id TEXT PRIMARY KEY, -- credential ID, base64url
  account TEXT NOT NULL,
  public_key TEXT NOT NULL, -- base64url
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]',
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX passkeys_account ON passkeys (account);

-- WebAuthn challenges, a few minutes and one use. account is null while signing in.
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  account TEXT,
  challenge TEXT NOT NULL,
  purpose TEXT NOT NULL, -- register or signin
  expires_at INTEGER NOT NULL
);
