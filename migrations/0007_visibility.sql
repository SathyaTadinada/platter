-- Who a profile is for, in one setting rather than a switch beside the sections: private (nobody),
-- unlisted (anyone with the link), or public (that, and it turns up when people search).
ALTER TABLE profiles ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';
UPDATE profiles SET visibility = CASE WHEN listed = 1 THEN 'public' ELSE 'unlisted' END;
ALTER TABLE profiles DROP COLUMN listed;
