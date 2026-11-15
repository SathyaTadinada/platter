-- Which details about each copy a profile shows: 'rating' and the ids of the owner's Discogs
-- collection fields. None until they pick some.
ALTER TABLE profiles ADD COLUMN details TEXT NOT NULL DEFAULT '[]';
