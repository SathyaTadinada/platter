-- A short bio and the owner's setup (turntable, cartridge, phono preamp, amp, speakers), plain text
-- they write themselves. Empty until they add some.
ALTER TABLE profiles ADD COLUMN bio TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN setup TEXT NOT NULL DEFAULT '{}';
