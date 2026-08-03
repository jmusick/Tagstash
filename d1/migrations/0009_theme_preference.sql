ALTER TABLE users ADD COLUMN theme TEXT CHECK (theme IN ('slate', 'midnight', 'light'));
