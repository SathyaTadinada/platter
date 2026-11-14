-- Following: who follows whom, and whether a request to follow a Followers profile has been approved
CREATE TABLE follows (
  follower TEXT NOT NULL,
  followee TEXT NOT NULL,
  status TEXT NOT NULL, -- pending or accepted
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower, followee)
) WITHOUT ROWID;
CREATE INDEX follows_followee ON follows (followee, status);

-- People someone has blocked: they can't follow, and don't see a Followers profile or find it
CREATE TABLE blocks (
  blocker TEXT NOT NULL,
  blocked TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker, blocked)
) WITHOUT ROWID;
CREATE INDEX blocks_blocked ON blocks (blocked);
