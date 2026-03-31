export const MEMBERSHIP_TIERS = {
  FREE: 'free',
  PAID: 'paid',
};

export const USER_ROLES = {
  USER: 'user',
  SUPER_ADMIN: 'super_admin',
};

export const FREE_BOOKMARK_LIMIT = 50;

export const SUPER_ADMIN_EMAIL = (
  process.env.SUPER_ADMIN_EMAIL || 'jd@orboro.net'
).trim().toLowerCase();

export const normalizeEmail = (email) =>
  typeof email === 'string' ? email.trim().toLowerCase() : '';

export const isSuperAdminEmail = (email) =>
  normalizeEmail(email) === SUPER_ADMIN_EMAIL;

export const isPaidTier = (tier) => tier === MEMBERSHIP_TIERS.PAID;
