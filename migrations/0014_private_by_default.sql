-- A profile is now there whenever it isn't Private, even with every section off, and new accounts
-- start Private. Anyone who had nothing switched on had no profile to see, so they become Private
-- rather than suddenly showing up.
UPDATE profiles SET visibility = 'private' WHERE sections NOT LIKE '%"public"%';
