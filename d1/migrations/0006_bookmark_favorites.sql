ALTER TABLE bookmarks ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_favorite ON bookmarks(user_id, is_favorite);