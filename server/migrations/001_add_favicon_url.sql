-- Migration: Add favicon_url column to bookmarks table
-- Run this migration if you have an existing database before the favicon feature was added

ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS favicon_url TEXT;

-- Optionally populate favicon URLs for existing bookmarks
-- Update existing bookmarks to have the new favicon_url
-- This is optional - favicons will be fetched for new bookmarks automatically
-- UPDATE bookmarks SET favicon_url = 'https://www.google.com/s2/favicons?sz=64&domain=' || 
--   substring(url from 'https?://([^/]+)') WHERE favicon_url IS NULL;
