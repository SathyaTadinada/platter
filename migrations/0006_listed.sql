-- Whether a profile turns up when people search for someone. On unless its owner says otherwise.
ALTER TABLE profiles ADD COLUMN listed INTEGER NOT NULL DEFAULT 1;
