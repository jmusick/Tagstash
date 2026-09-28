-- Brute-force protection for login, plus an audit trail for auth events.
-- failed_attempts/locked_until drive the per-account lockout; auth_events is both the
-- failed-login log and the counter behind per-IP / per-email throttling of login,
-- registration, verification resends and password-reset requests.
ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until INTEGER;

CREATE TABLE IF NOT EXISTS auth_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  email TEXT,
  user_id INTEGER,
  ip TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_events_type_ip ON auth_events(event_type, ip, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_events_type_email ON auth_events(event_type, email, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_events_created ON auth_events(created_at);
