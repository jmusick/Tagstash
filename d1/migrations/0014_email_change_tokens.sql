-- Pending email-address changes. The account keeps its current email (and role) until the
-- link emailed to the NEW address is opened. Code fails closed (503) until this is applied.
CREATE TABLE IF NOT EXISTS email_change_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  new_email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_change_user_id ON email_change_tokens(user_id);
