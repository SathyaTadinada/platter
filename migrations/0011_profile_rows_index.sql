-- The primary key already orders profile rows by account, kind, and key, so this index only doubled
-- the cost of every write
DROP INDEX IF EXISTS profile_rows_kind;
