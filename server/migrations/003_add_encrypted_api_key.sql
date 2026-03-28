-- Migration: Add encrypted_key column so API keys can be revealed later

ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS encrypted_key TEXT;
