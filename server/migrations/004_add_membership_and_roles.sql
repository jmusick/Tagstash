-- Migration: Add membership tiers and user roles for free/paid users and super admin controls

ALTER TABLE users
ADD COLUMN IF NOT EXISTS membership_tier VARCHAR(20);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS role VARCHAR(20);

UPDATE users
SET membership_tier = 'free'
WHERE membership_tier IS NULL;

UPDATE users
SET role = 'user'
WHERE role IS NULL;

ALTER TABLE users
ALTER COLUMN membership_tier SET DEFAULT 'free';

ALTER TABLE users
ALTER COLUMN role SET DEFAULT 'user';

ALTER TABLE users
ALTER COLUMN membership_tier SET NOT NULL;

ALTER TABLE users
ALTER COLUMN role SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_membership_tier_check'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT users_membership_tier_check
    CHECK (membership_tier IN ('free', 'paid'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('user', 'super_admin'));
  END IF;
END $$;

UPDATE users
SET role = 'super_admin'
WHERE LOWER(email) = 'jd@orboro.net';
