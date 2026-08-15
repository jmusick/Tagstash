ALTER TABLE users ADD COLUMN link_target TEXT CHECK (link_target IN ('new', 'same'));
