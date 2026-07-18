ALTER TABLE users ADD COLUMN profile_public INTEGER NOT NULL DEFAULT 0 CHECK (profile_public IN (0, 1));
ALTER TABLE bookmarks ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_private ON bookmarks(user_id, is_private);
