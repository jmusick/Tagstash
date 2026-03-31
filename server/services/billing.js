import pool from '../db.js';
import { MEMBERSHIP_TIERS, normalizeEmail } from '../config/membership.js';

export const BILLING_EVENT_TYPES = {
  SUBSCRIPTION_ACTIVATED: 'subscription_activated',
  SUBSCRIPTION_CANCELED: 'subscription_canceled',
  PAYMENT_SUCCEEDED: 'payment_succeeded',
  PAYMENT_FAILED: 'payment_failed',
};

const getMembershipTierForEvent = (eventType) => {
  switch (eventType) {
    case BILLING_EVENT_TYPES.SUBSCRIPTION_ACTIVATED:
    case BILLING_EVENT_TYPES.PAYMENT_SUCCEEDED:
      return MEMBERSHIP_TIERS.PAID;
    case BILLING_EVENT_TYPES.SUBSCRIPTION_CANCELED:
    case BILLING_EVENT_TYPES.PAYMENT_FAILED:
      return MEMBERSHIP_TIERS.FREE;
    default:
      return null;
  }
};

export const setUserMembershipTier = async (userId, membershipTier, dbClient = pool) => {
  const result = await dbClient.query(
    `UPDATE users
     SET membership_tier = $1
     WHERE id = $2
     RETURNING id, username, email, membership_tier, role, updated_at`,
    [membershipTier, userId]
  );

  return result.rows[0] || null;
};

export const upgradeUserToPaid = async (userId, dbClient = pool) =>
  setUserMembershipTier(userId, MEMBERSHIP_TIERS.PAID, dbClient);

export const downgradeUserToFree = async (userId, dbClient = pool) =>
  setUserMembershipTier(userId, MEMBERSHIP_TIERS.FREE, dbClient);

const findUserForBillingEvent = async (event, dbClient = pool) => {
  const userId = Number(event?.data?.userId);
  const email = normalizeEmail(event?.data?.email);

  if (Number.isInteger(userId) && userId > 0) {
    const byId = await dbClient.query(
      'SELECT id, username, email, membership_tier, role FROM users WHERE id = $1',
      [userId]
    );

    if (byId.rows.length > 0) {
      return byId.rows[0];
    }
  }

  if (email) {
    const byEmail = await dbClient.query(
      'SELECT id, username, email, membership_tier, role FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (byEmail.rows.length > 0) {
      return byEmail.rows[0];
    }
  }

  return null;
};

export const processBillingWebhookEvent = async (event, dbClient = pool) => {
  const eventType = event?.type;
  const nextTier = getMembershipTierForEvent(eventType);

  if (!eventType || !nextTier) {
    return {
      handled: false,
      reason: 'Unsupported or missing billing event type',
    };
  }

  const user = await findUserForBillingEvent(event, dbClient);

  if (!user) {
    return {
      handled: false,
      reason: 'No matching user for billing event',
    };
  }

  if (user.membership_tier === nextTier) {
    return {
      handled: true,
      action: 'noop',
      user,
      eventType,
    };
  }

  const updatedUser = await setUserMembershipTier(user.id, nextTier, dbClient);

  return {
    handled: true,
    action: 'membership_updated',
    eventType,
    previousTier: user.membership_tier,
    nextTier,
    user: updatedUser,
  };
};
