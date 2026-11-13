-- What sort of thing each device is (phone, tablet, computer), so its icon stays right after a rename
ALTER TABLE devices ADD COLUMN kind TEXT;
