-- Apply with the matching Worker release. Previously emailed links are invalidated;
-- users can request fresh verification/reset links. No user accounts are removed.
-- Keep token for older bundles, but new code stores only a marked digest there.
ALTER TABLE email_verification_tokens ADD COLUMN token_hash TEXT;
ALTER TABLE password_reset_tokens ADD COLUMN token_hash TEXT;
CREATE UNIQUE INDEX idx_verification_token_hash ON email_verification_tokens(token_hash);
CREATE UNIQUE INDEX idx_reset_token_hash ON password_reset_tokens(token_hash);
DELETE FROM email_verification_tokens;
DELETE FROM password_reset_tokens;
