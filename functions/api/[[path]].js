import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { Resend } from 'resend';

const MEMBERSHIP_TIERS = {
  FREE: 'free',
  PAID: 'paid',
};

const USER_ROLES = {
  USER: 'user',
  SUPER_ADMIN: 'super_admin',
};

const FREE_BOOKMARK_LIMIT = 50;

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tagstash-Webhook-Secret',
};

const encoder = new TextEncoder();

// --- Email verification helpers ---

const generateVerificationToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const sendVerificationEmail = async (email, username, token, env) => {
  if (!env.RESEND_API_KEY) {
    throw new Error('Missing RESEND_API_KEY');
  }
  if (!env.EMAIL_FROM) {
    throw new Error('Missing EMAIL_FROM');
  }

  const appUrl = (env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  const verifyUrl = `${appUrl}/verify-email?token=${token}`;
  const resend = new Resend(env.RESEND_API_KEY);
  const fromAddress = env.EMAIL_FROM;
  const replyTo = env.EMAIL_REPLY_TO || undefined;
  const textBody = [
    `Hi ${username},`,
    '',
    'Thanks for signing up for Tagstash. Please verify your email address by opening this link:',
    verifyUrl,
    '',
    'This link expires in 24 hours.',
    'If you did not create a Tagstash account, you can ignore this email.',
  ].join('\n');
  const htmlBody = `
<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #111827;">
  <p>Hi ${username},</p>
  <p>Thanks for signing up for Tagstash. Please verify your email address by clicking the button below:</p>
  <p>
    <a href="${verifyUrl}" style="display:inline-block;padding:10px 16px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;">Verify email address</a>
  </p>
  <p>If the button does not work, copy and paste this link into your browser:</p>
  <p><a href="${verifyUrl}">${verifyUrl}</a></p>
  <p>This link expires in 24 hours.</p>
  <p>If you did not create a Tagstash account, you can safely ignore this email.</p>
</div>`;

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: email,
    replyTo,
    subject: 'Verify your Tagstash email address',
    text: textBody,
    html: htmlBody,
  });

  if (error) {
    throw new Error(error.message || 'Failed to send verification email');
  }
};

const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const normalizeEmail = (email) =>
  typeof email === 'string' ? email.trim().toLowerCase() : '';

const superAdminEmail = (env) =>
  normalizeEmail(env.SUPER_ADMIN_EMAIL || '');

const isSuperAdminEmail = (email, env) =>
  normalizeEmail(email) === superAdminEmail(env);

const getRoleForEmail = (email, env) =>
  isSuperAdminEmail(email, env) ? USER_ROLES.SUPER_ADMIN : USER_ROLES.USER;

const isPaidTier = (tier) => tier === MEMBERSHIP_TIERS.PAID;

const extractDomain = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return 'favicon';
  }
};

const getFaviconUrl = (url) => `https://www.google.com/s2/favicons?sz=64&domain=${extractDomain(url)}`;

const extractMetaDescription = (html) => {
  if (!html || typeof html !== 'string') {
    return null;
  }

  const patterns = [
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i,
    /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/\s+/g, ' ').trim();
    }
  }

  return null;
};

const extractPageTitle = (html) => {
  if (!html || typeof html !== 'string') {
    return null;
  }

  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match?.[1]) {
    return null;
  }

  return match[1].replace(/\s+/g, ' ').trim() || null;
};

const toHex = (bytes) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const fromHex = (hex) => {
  if (!hex || hex.length % 2 !== 0) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
};

const getJwtSecret = (env) => {
  if (!env.JWT_SECRET) {
    throw new Error('Missing JWT_SECRET');
  }
  return encoder.encode(env.JWT_SECRET);
};

const getApiKeySecretBytes = async (env) => {
  const secret = env.API_KEY_ENCRYPTION_SECRET || env.JWT_SECRET;
  if (!secret) {
    throw new Error('Missing API_KEY_ENCRYPTION_SECRET or JWT_SECRET');
  }
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return new Uint8Array(digest);
};

const getApiKeyAesKey = async (env) => {
  const rawKey = await getApiKeySecretBytes(env);
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

const hashApiKey = async (value) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return toHex(new Uint8Array(digest));
};

const encryptApiKey = async (value, env) => {
  const key = await getApiKeyAesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(value)
  );
  return `${toHex(iv)}:${toHex(new Uint8Array(encrypted))}`;
};

const decryptApiKey = async (encryptedValue, env) => {
  if (!encryptedValue) {
    return null;
  }

  const parts = encryptedValue.split(':');
  if (parts.length !== 2) {
    return null;
  }

  const iv = fromHex(parts[0]);
  const data = fromHex(parts[1]);
  if (!iv || !data) {
    return null;
  }

  const key = await getApiKeyAesKey(env);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
};

const generateApiKeyValue = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `tsk_${toHex(bytes)}`;
};

const parseBody = async (request) => {
  try {
    return await request.json();
  } catch {
    return {};
  }
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const verifyTurnstile = async (request, env, captchaToken) => {
  if (!env.TURNSTILE_SECRET_KEY) {
    return { ok: false, status: 503, error: 'Support form is not configured.' };
  }

  if (!captchaToken || typeof captchaToken !== 'string') {
    return { ok: false, status: 400, error: 'CAPTCHA token is required.' };
  }

  const remoteIp = request.headers.get('CF-Connecting-IP') || '';
  const payload = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: captchaToken,
  });

  if (remoteIp) {
    payload.set('remoteip', remoteIp);
  }

  try {
    const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
    });
    const verifyData = await verifyResponse.json();

    if (!verifyData?.success) {
      return { ok: false, status: 400, error: 'CAPTCHA verification failed. Please try again.' };
    }

    return { ok: true };
  } catch {
    return { ok: false, status: 502, error: 'Could not verify CAPTCHA. Please try again.' };
  }
};

const getBearerToken = (request) => {
  const authHeader = request.headers.get('Authorization') || '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
};

const requireAuth = async (request, env) => {
  const token = getBearerToken(request);
  if (!token) {
    return { error: jsonResponse({ error: 'Access token required' }, 401) };
  }

  try {
    const { payload } = await jwtVerify(token, getJwtSecret(env));
    return { user: payload };
  } catch {
    return { error: jsonResponse({ error: 'Invalid or expired token' }, 403) };
  }
};

const signUserToken = async (user, env) =>
  new SignJWT({
    id: user.id,
    username: user.username,
    role: user.role,
    membershipTier: user.membership_tier,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret(env));

const ensureUserRoleMatchesConfig = async (db, user, env) => {
  const expectedRole = getRoleForEmail(user.email, env);
  if (user.role !== expectedRole) {
    await db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(expectedRole, user.id).run();
    user.role = expectedRole;
  }
  return user;
};

const requireSuperAdmin = async (db, authUser, env) => {
  const adminUser = await db
    .prepare('SELECT id, username, email, membership_tier, role FROM users WHERE id = ?')
    .bind(authUser.id)
    .first();

  if (!adminUser) {
    return { error: jsonResponse({ error: 'User not found' }, 404) };
  }

  await ensureUserRoleMatchesConfig(db, adminUser, env);

  if (adminUser.role !== USER_ROLES.SUPER_ADMIN) {
    return { error: jsonResponse({ error: 'Super admin access required' }, 403) };
  }

  return { adminUser };
};

const getUserPlanStatus = async (db, userId) => {
  const user = await db
    .prepare('SELECT membership_tier FROM users WHERE id = ?')
    .bind(userId)
    .first();

  if (!user) {
    return null;
  }

  const countResult = await db
    .prepare('SELECT COUNT(*) AS count FROM bookmarks WHERE user_id = ?')
    .bind(userId)
    .first();

  const bookmarkCount = Number(countResult?.count || 0);
  const paidTier = isPaidTier(user.membership_tier);

  return {
    membershipTier: user.membership_tier,
    bookmarkCount,
    paidTier,
    remainingSlots: paidTier ? null : Math.max(FREE_BOOKMARK_LIMIT - bookmarkCount, 0),
  };
};

const getTagsByBookmarkId = async (db, userId) => {
  const rows = await db
    .prepare(
      `SELECT bt.bookmark_id, t.id, t.name
       FROM bookmark_tags bt
       INNER JOIN tags t ON t.id = bt.tag_id
       INNER JOIN bookmarks b ON b.id = bt.bookmark_id
       WHERE b.user_id = ?
       ORDER BY t.name ASC`
    )
    .bind(userId)
    .all();

  const byBookmark = new Map();
  for (const row of rows.results || []) {
    if (!byBookmark.has(row.bookmark_id)) {
      byBookmark.set(row.bookmark_id, []);
    }
    byBookmark.get(row.bookmark_id).push({ id: row.id, name: row.name });
  }

  return byBookmark;
};

const attachTagsToBookmarks = async (db, userId, bookmarks) => {
  const tagsByBookmark = await getTagsByBookmarkId(db, userId);
  return bookmarks.map((bookmark) => ({
    ...bookmark,
    tags: tagsByBookmark.get(bookmark.id) || [],
  }));
};

const ensureTag = async (db, tagName) => {
  await db
    .prepare('INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO UPDATE SET name = excluded.name')
    .bind(tagName)
    .run();

  const tag = await db.prepare('SELECT id, name FROM tags WHERE name = ?').bind(tagName).first();
  return tag;
};

const setBookmarkTags = async (db, bookmarkId, tags) => {
  await db.prepare('DELETE FROM bookmark_tags WHERE bookmark_id = ?').bind(bookmarkId).run();

  const bookmarkTags = [];
  for (const tagName of tags) {
    const trimmed = tagName.trim().toLowerCase();
    if (!trimmed) {
      continue;
    }
    if (/\s/.test(trimmed)) {
      throw new Error(`INVALID_TAG:${tagName}`);
    }

    const tag = await ensureTag(db, trimmed);
    await db
      .prepare('INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)')
      .bind(bookmarkId, tag.id)
      .run();

    bookmarkTags.push(tag);
  }

  return bookmarkTags;
};

const fetchSiteMetadata = async (url) => {
  if (!url || typeof url !== 'string') {
    return { error: 'A valid URL is required', status: 400 };
  }

  let normalizedUrl = url.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    new URL(normalizedUrl);
  } catch {
    return { error: 'Invalid URL format', status: 400 };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(normalizedUrl, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    });

    const html = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      title: extractPageTitle(html),
      description: extractMetaDescription(html),
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { error: 'Timed out while fetching site metadata', status: 504 };
    }
    return { error: 'Server error fetching site metadata', status: 500 };
  } finally {
    clearTimeout(timeoutId);
  }
};

const listBookmarks = async (db, userId) => {
  const bookmarksResult = await db
    .prepare('SELECT * FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId)
    .all();

  const bookmarks = bookmarksResult.results || [];

  for (const bookmark of bookmarks) {
    if (!bookmark.favicon_url) {
      const faviconUrl = getFaviconUrl(bookmark.url);
      bookmark.favicon_url = faviconUrl;
      await db
        .prepare('UPDATE bookmarks SET favicon_url = ? WHERE id = ?')
        .bind(faviconUrl, bookmark.id)
        .run();
    }
  }

  return attachTagsToBookmarks(db, userId, bookmarks);
};

// --- Stripe helpers ---

const stripeRequest = async (method, path, params, env) => {
  const url = `https://api.stripe.com/v1${path}`;
  const auth = btoa(`${env.STRIPE_SECRET_KEY}:`);
  const options = {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  if (params) {
    options.body = new URLSearchParams(params).toString();
  }
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Stripe API error: ${response.status}`);
  }
  return data;
};

const verifyStripeSignature = async (rawBody, sigHeader, secret) => {
  if (!sigHeader || !secret) return false;
  const parts = {};
  for (const part of sigHeader.split(',')) {
    const idx = part.indexOf('=');
    if (idx > 0) parts[part.slice(0, idx)] = part.slice(idx + 1);
  }
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  // Reject webhooks older than 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;
  const payload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return expected === signature;
};

const processStripeEvent = async (db, event) => {
  const { type, data } = event;
  const obj = data?.object;

  if (type === 'checkout.session.completed') {
    const customerId = obj?.customer;
    const subscriptionId = obj?.subscription;
    const userId = Number(obj?.metadata?.userId);
    const email = normalizeEmail(obj?.customer_email || obj?.customer_details?.email);
    let user = null;
    if (Number.isInteger(userId) && userId > 0) {
      user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    }
    if (!user && email) {
      user = await db
        .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)')
        .bind(email)
        .first();
    }
    if (!user) return { handled: false, reason: 'No matching user' };
    await db
      .prepare(
        'UPDATE users SET membership_tier = ?, stripe_customer_id = ?, stripe_subscription_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      )
      .bind(MEMBERSHIP_TIERS.PAID, customerId, subscriptionId, user.id)
      .run();
    return { handled: true, action: 'membership_upgraded', eventType: type };
  }

  if (type === 'customer.subscription.deleted') {
    const customerId = obj?.customer;
    const user = await db
      .prepare('SELECT * FROM users WHERE stripe_customer_id = ?')
      .bind(customerId)
      .first();
    if (!user) return { handled: false, reason: 'No matching user for customer' };
    await db
      .prepare(
        'UPDATE users SET membership_tier = ?, stripe_subscription_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      )
      .bind(MEMBERSHIP_TIERS.FREE, user.id)
      .run();
    return { handled: true, action: 'membership_downgraded', eventType: type };
  }

  if (type === 'customer.subscription.updated') {
    const customerId = obj?.customer;
    const status = obj?.status;
    const user = await db
      .prepare('SELECT * FROM users WHERE stripe_customer_id = ?')
      .bind(customerId)
      .first();
    if (!user) return { handled: false, reason: 'No matching user for customer' };
    const tier = ['active', 'trialing'].includes(status) ? MEMBERSHIP_TIERS.PAID : MEMBERSHIP_TIERS.FREE;
    if (user.membership_tier !== tier) {
      await db
        .prepare('UPDATE users SET membership_tier = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(tier, user.id)
        .run();
    }
    return { handled: true, action: 'subscription_status_synced', status, eventType: type };
  }

  return { handled: false, reason: `Unhandled event type: ${type}` };
};

async function handleAuth(request, env, segments) {
  const db = env.DB;

  if (request.method === 'POST' && segments[1] === 'register') {
    const { username, email, password } = await parseBody(request);
    const trimmedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedEmail = normalizeEmail(email);

    if (!trimmedUsername || !normalizedEmail || !password) {
      return jsonResponse({ error: 'All fields are required' }, 400);
    }

    if (/\s/.test(trimmedUsername)) {
      return jsonResponse({ error: 'Username cannot contain spaces' }, 400);
    }

    if (password.length < 6) {
      return jsonResponse({ error: 'Password must be at least 6 characters' }, 400);
    }

    const existing = await db
      .prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)')
      .bind(normalizedEmail, trimmedUsername)
      .first();

    if (existing) {
      return jsonResponse({ error: 'User already exists with this email or username' }, 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const role = getRoleForEmail(normalizedEmail, env);

    const insert = await db
      .prepare(
        'INSERT INTO users (username, email, password_hash, membership_tier, role, email_verified) VALUES (?, ?, ?, ?, ?, 0)'
      )
      .bind(trimmedUsername, normalizedEmail, passwordHash, MEMBERSHIP_TIERS.FREE, role)
      .run();

    const userId = insert.meta.last_row_id;

    // Generate and store verification token (expires in 24 hours)
    const verificationToken = generateVerificationToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db
      .prepare('INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
      .bind(userId, verificationToken, expiresAt)
      .run();

    try {
      await sendVerificationEmail(normalizedEmail, trimmedUsername, verificationToken, env);
    } catch (emailErr) {
      // Roll back user creation if email fails so they can try again
      await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
      return jsonResponse({ error: 'Failed to send verification email. Please try again.' }, 500);
    }

    return jsonResponse(
      {
        message: 'Registration successful. Please check your email to verify your account.',
        pendingVerification: true,
      },
      201
    );
  }

  if (request.method === 'POST' && segments[1] === 'login') {
    const { email, password } = await parseBody(request);
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return jsonResponse({ error: 'Email and password are required' }, 400);
    }

    const user = await db
      .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)')
      .bind(normalizedEmail)
      .first();

    if (!user) {
      return jsonResponse({ error: 'Invalid email or password' }, 401);
    }

    if (!user.email_verified) {
      return jsonResponse({ error: 'Please verify your email address before logging in.' }, 403);
    }

    await ensureUserRoleMatchesConfig(db, user, env);

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return jsonResponse({ error: 'Invalid email or password' }, 401);
    }

    const token = await signUserToken(user, env);

    return jsonResponse({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        membership_tier: user.membership_tier,
        role: user.role,
      },
    });
  }

  if (request.method === 'GET' && segments[1] === 'verify-email') {
    const token = new URL(request.url).searchParams.get('token');
    if (!token) {
      return jsonResponse({ error: 'Verification token is required' }, 400);
    }

    const record = await db
      .prepare(
        `SELECT evt.id, evt.user_id, evt.expires_at, evt.used_at
         FROM email_verification_tokens evt
         WHERE evt.token = ?`
      )
      .bind(token)
      .first();

    if (!record) {
      return jsonResponse({ error: 'Invalid or expired verification link.' }, 400);
    }

    if (record.used_at) {
      return jsonResponse({ error: 'This verification link has already been used.' }, 400);
    }

    if (new Date(record.expires_at) < new Date()) {
      return jsonResponse({ error: 'This verification link has expired. Please request a new one.' }, 400);
    }

    await db
      .prepare('UPDATE users SET email_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(record.user_id)
      .run();

    await db
      .prepare('UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(record.id)
      .run();

    const verifiedUser = await db
      .prepare('SELECT id, username, email, membership_tier, role FROM users WHERE id = ?')
      .bind(record.user_id)
      .first();

    const authToken = await signUserToken(verifiedUser, env);

    return jsonResponse({
      message: 'Email verified successfully.',
      token: authToken,
      user: verifiedUser,
    });
  }

  if (request.method === 'POST' && segments[1] === 'resend-verification') {
    const { email } = await parseBody(request);
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return jsonResponse({ error: 'Email is required' }, 400);
    }

    const unverifiedUser = await db
      .prepare('SELECT id, username, email_verified FROM users WHERE LOWER(email) = LOWER(?)')
      .bind(normalizedEmail)
      .first();

    if (!unverifiedUser || unverifiedUser.email_verified) {
      return jsonResponse({ message: 'If that address is awaiting verification, a new link has been sent.' });
    }

    const recent = await db
      .prepare(
        `SELECT id FROM email_verification_tokens
         WHERE user_id = ? AND used_at IS NULL
           AND created_at > datetime('now', '-60 seconds')
         LIMIT 1`
      )
      .bind(unverifiedUser.id)
      .first();

    if (recent) {
      return jsonResponse({ error: 'Please wait a moment before requesting another link.' }, 429);
    }

    await db
      .prepare('DELETE FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL')
      .bind(unverifiedUser.id)
      .run();

    const verificationToken = generateVerificationToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db
      .prepare('INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
      .bind(unverifiedUser.id, verificationToken, expiresAt)
      .run();

    await sendVerificationEmail(normalizedEmail, unverifiedUser.username, verificationToken, env);

    return jsonResponse({ message: 'If that address is awaiting verification, a new link has been sent.' });
  }

  if (request.method === 'GET' && segments[1] === 'me') {
    const auth = await requireAuth(request, env);
    if (auth.error) return auth.error;

    const user = await db
      .prepare('SELECT id, username, email, membership_tier, role, created_at FROM users WHERE id = ?')
      .bind(auth.user.id)
      .first();

    if (!user) {
      return jsonResponse({ error: 'User not found' }, 404);
    }

    await ensureUserRoleMatchesConfig(db, user, env);
    return jsonResponse({ user });
  }

  if (request.method === 'PUT' && segments[1] === 'username') {
    const auth = await requireAuth(request, env);
    if (auth.error) return auth.error;

    const { newUsername, password } = await parseBody(request);
    const trimmedUsername = typeof newUsername === 'string' ? newUsername.trim() : '';

    if (!trimmedUsername || !password) {
      return jsonResponse({ error: 'Username and password are required' }, 400);
    }

    if (/\s/.test(trimmedUsername)) {
      return jsonResponse({ error: 'Username cannot contain spaces' }, 400);
    }

    if (trimmedUsername.length < 2) {
      return jsonResponse({ error: 'Username must be at least 2 characters' }, 400);
    }

    if (trimmedUsername.length > 50) {
      return jsonResponse({ error: 'Username must be 50 characters or less' }, 400);
    }

    const usernameCheck = await db
      .prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?')
      .bind(trimmedUsername, auth.user.id)
      .first();

    if (usernameCheck) {
      return jsonResponse({ error: 'Username is already in use' }, 400);
    }

    const user = await db
      .prepare('SELECT password_hash, username FROM users WHERE id = ?')
      .bind(auth.user.id)
      .first();

    if (!user) {
      return jsonResponse({ error: 'User not found' }, 404);
    }

    if (user.username === trimmedUsername) {
      return jsonResponse({ error: 'New username must be different from current username' }, 400);
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return jsonResponse({ error: 'Incorrect password' }, 401);
    }

    await db.prepare('UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(trimmedUsername, auth.user.id).run();

    const updatedUser = await db
      .prepare('SELECT id, username, email, membership_tier, role FROM users WHERE id = ?')
      .bind(auth.user.id)
      .first();

    return jsonResponse({ message: 'Username updated successfully', user: updatedUser });
  }

  if (request.method === 'PUT' && segments[1] === 'email') {
    const auth = await requireAuth(request, env);
    if (auth.error) return auth.error;

    const { newEmail, password } = await parseBody(request);
    const normalizedNewEmail = normalizeEmail(newEmail);

    if (!normalizedNewEmail || !password) {
      return jsonResponse({ error: 'Email and password are required' }, 400);
    }

    const emailCheck = await db
      .prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?')
      .bind(normalizedNewEmail, auth.user.id)
      .first();

    if (emailCheck) {
      return jsonResponse({ error: 'Email is already in use' }, 400);
    }

    const user = await db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(auth.user.id)
      .first();

    if (!user) {
      return jsonResponse({ error: 'User not found' }, 404);
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return jsonResponse({ error: 'Incorrect password' }, 401);
    }

    const updatedRole = getRoleForEmail(normalizedNewEmail, env);

    await db
      .prepare('UPDATE users SET email = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(normalizedNewEmail, updatedRole, auth.user.id)
      .run();

    const updatedUser = await db
      .prepare('SELECT id, username, email, membership_tier, role FROM users WHERE id = ?')
      .bind(auth.user.id)
      .first();

    return jsonResponse({ message: 'Email updated successfully', user: updatedUser });
  }

  if (request.method === 'PUT' && segments[1] === 'password') {
    const auth = await requireAuth(request, env);
    if (auth.error) return auth.error;

    const { currentPassword, newPassword, confirmPassword } = await parseBody(request);

    if (!currentPassword || !newPassword || !confirmPassword) {
      return jsonResponse({ error: 'All fields are required' }, 400);
    }

    if (newPassword.length < 6) {
      return jsonResponse({ error: 'New password must be at least 6 characters' }, 400);
    }

    if (newPassword !== confirmPassword) {
      return jsonResponse({ error: 'Passwords do not match' }, 400);
    }

    if (currentPassword === newPassword) {
      return jsonResponse({ error: 'New password must be different from current password' }, 400);
    }

    const user = await db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(auth.user.id)
      .first();

    if (!user) {
      return jsonResponse({ error: 'User not found' }, 404);
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      return jsonResponse({ error: 'Incorrect current password' }, 401);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(passwordHash, auth.user.id).run();

    return jsonResponse({ message: 'Password updated successfully' });
  }

  if (request.method === 'GET' && segments[1] === 'api-keys') {
    const auth = await requireAuth(request, env);
    if (auth.error) return auth.error;

    const result = await db
      .prepare(
        `SELECT id, name, key_prefix, key_last4, encrypted_key, created_at, last_used_at, revoked_at
         FROM api_keys
         WHERE user_id = ?
         ORDER BY created_at DESC`
      )
      .bind(auth.user.id)
      .all();

    const apiKeys = [];
    for (const row of result.results || []) {
      let apiKey = null;
      try {
        apiKey = await decryptApiKey(row.encrypted_key, env);
      } catch {
        apiKey = null;
      }
      apiKeys.push({
        id: row.id,
        name: row.name,
        key_prefix: row.key_prefix,
        key_last4: row.key_last4,
        created_at: row.created_at,
        last_used_at: row.last_used_at,
        revoked_at: row.revoked_at,
        api_key: apiKey,
      });
    }

    return jsonResponse({ apiKeys });
  }

  if (request.method === 'POST' && segments[1] === 'api-keys') {
    const auth = await requireAuth(request, env);
    if (auth.error) return auth.error;

    const { name } = await parseBody(request);
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const keyName = trimmedName || 'Default API Key';

    if (keyName.length > 100) {
      return jsonResponse({ error: 'API key name must be 100 characters or less' }, 400);
    }

    const apiKey = generateApiKeyValue();
    const keyHash = await hashApiKey(apiKey);
    const encryptedKey = await encryptApiKey(apiKey, env);
    const keyPrefix = apiKey.slice(0, 8);
    const keyLast4 = apiKey.slice(-4);

    const insert = await db
      .prepare(
        `INSERT INTO api_keys (user_id, name, key_hash, encrypted_key, key_prefix, key_last4)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(auth.user.id, keyName, keyHash, encryptedKey, keyPrefix, keyLast4)
      .run();

    const apiKeyMetadata = await db
      .prepare(
        'SELECT id, name, key_prefix, key_last4, created_at, last_used_at, revoked_at FROM api_keys WHERE id = ?'
      )
      .bind(insert.meta.last_row_id)
      .first();

    return jsonResponse(
      {
        message: 'API key created successfully',
        apiKey,
        apiKeyMetadata,
      },
      201
    );
  }

  if (request.method === 'DELETE' && segments[1] === 'api-keys' && segments[3] === 'permanent') {
    const auth = await requireAuth(request, env);
    if (auth.error) return auth.error;

    const id = Number(segments[2]);
    const result = await db
      .prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?')
      .bind(id, auth.user.id)
      .run();

    if ((result.meta.changes || 0) === 0) {
      return jsonResponse({ error: 'API key not found' }, 404);
    }

    return jsonResponse({ message: 'API key deleted successfully' });
  }

  if (request.method === 'DELETE' && segments[1] === 'api-keys' && segments[2]) {
    const auth = await requireAuth(request, env);
    if (auth.error) return auth.error;

    const id = Number(segments[2]);
    const result = await db
      .prepare(
        `UPDATE api_keys
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ? AND revoked_at IS NULL`
      )
      .bind(id, auth.user.id)
      .run();

    if ((result.meta.changes || 0) === 0) {
      return jsonResponse({ error: 'API key not found or already revoked' }, 404);
    }

    return jsonResponse({ message: 'API key revoked successfully' });
  }

  if (request.method === 'GET' && segments[1] === 'admin' && segments[2] === 'users') {
    const auth = await requireAuth(request, env);
    if (auth.error) return auth.error;

    const access = await requireSuperAdmin(db, auth.user, env);
    if (access.error) return access.error;

    const result = await db
      .prepare(
        `SELECT u.id, u.username, u.email, u.membership_tier, u.role, u.created_at, u.updated_at,
                COUNT(b.id) AS bookmark_count
         FROM users u
         LEFT JOIN bookmarks b ON b.user_id = u.id
         GROUP BY u.id
         ORDER BY u.created_at DESC`
      )
      .all();

    const users = (result.results || []).map((u) => ({
      ...u,
      bookmark_count: Number(u.bookmark_count || 0),
    }));

    return jsonResponse({ users });
  }

  if (
    request.method === 'PATCH' &&
    segments[1] === 'admin' &&
    segments[2] === 'users' &&
    segments[3]
  ) {
    const auth = await requireAuth(request, env);
    if (auth.error) return auth.error;

    const access = await requireSuperAdmin(db, auth.user, env);
    if (access.error) return access.error;

    const targetId = Number(segments[3]);
    const { membershipTier, role } = await parseBody(request);

    const hasMembershipTier = membershipTier !== undefined;
    const hasRole = role !== undefined;

    if (!hasMembershipTier && !hasRole) {
      return jsonResponse({ error: 'No updates provided' }, 400);
    }

    const validTiers = Object.values(MEMBERSHIP_TIERS);
    const validRoles = Object.values(USER_ROLES);

    if (hasMembershipTier && !validTiers.includes(membershipTier)) {
      return jsonResponse({ error: 'Invalid membership tier' }, 400);
    }

    if (hasRole && !validRoles.includes(role)) {
      return jsonResponse({ error: 'Invalid role' }, 400);
    }

    const targetUser = await db
      .prepare('SELECT id, email, membership_tier, role FROM users WHERE id = ?')
      .bind(targetId)
      .first();

    if (!targetUser) {
      return jsonResponse({ error: 'User not found' }, 404);
    }

    const isConfiguredSuperAdmin = isSuperAdminEmail(targetUser.email, env);

    const nextMembershipTier = hasMembershipTier ? membershipTier : targetUser.membership_tier;
    const nextRole = hasRole ? role : targetUser.role;

    if (isConfiguredSuperAdmin && nextRole !== USER_ROLES.SUPER_ADMIN) {
      return jsonResponse({ error: 'Configured super admin account role cannot be changed' }, 400);
    }

    if (!isConfiguredSuperAdmin && nextRole === USER_ROLES.SUPER_ADMIN) {
      return jsonResponse(
        { error: 'Only the configured super admin email can have super admin role' },
        400
      );
    }

    await db
      .prepare('UPDATE users SET membership_tier = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(nextMembershipTier, nextRole, targetId)
      .run();

    const updatedUser = await db
      .prepare('SELECT id, username, email, membership_tier, role, created_at, updated_at FROM users WHERE id = ?')
      .bind(targetId)
      .first();

    return jsonResponse({ message: 'User access updated successfully', user: updatedUser });
  }

  return jsonResponse({ error: 'Route not found' }, 404);
}

async function handleBookmarks(request, env, segments) {
  const db = env.DB;
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;

  if (request.method === 'GET' && segments.length === 1) {
    const bookmarks = await listBookmarks(db, auth.user.id);
    return jsonResponse({ bookmarks });
  }

  if (request.method === 'POST' && segments[1] === 'meta-description') {
    const { url } = await parseBody(request);
    const metadata = await fetchSiteMetadata(url);

    if (metadata.error) {
      return jsonResponse({ error: metadata.error }, metadata.status || 500);
    }

    if (!metadata.description) {
      if (!metadata.ok) {
        return jsonResponse(
          {
            error: `Site blocked the request (HTTP ${metadata.status}) — try the extension instead, which reads directly from the loaded page`,
          },
          502
        );
      }
      return jsonResponse({ error: 'No meta description found on this page' }, 404);
    }

    return jsonResponse({ description: metadata.description });
  }

  if (request.method === 'POST' && segments[1] === 'meta') {
    const { url } = await parseBody(request);
    const metadata = await fetchSiteMetadata(url);

    if (metadata.error) {
      return jsonResponse({ error: metadata.error }, metadata.status || 500);
    }

    if (!metadata.title && !metadata.description) {
      if (!metadata.ok) {
        return jsonResponse(
          {
            error: `Site blocked the request (HTTP ${metadata.status}) — try the extension instead, which reads directly from the loaded page`,
          },
          502
        );
      }
      return jsonResponse({ error: 'No metadata found on this page' }, 404);
    }

    return jsonResponse({ title: metadata.title, description: metadata.description });
  }

  if (request.method === 'GET' && segments[1] === 'by-url') {
    const url = new URL(request.url).searchParams.get('url');
    if (!url) {
      return jsonResponse({ error: 'url query parameter is required' }, 400);
    }

    const bookmark = await db
      .prepare('SELECT * FROM bookmarks WHERE user_id = ? AND url = ?')
      .bind(auth.user.id, url)
      .first();

    if (!bookmark) {
      return jsonResponse({ error: 'Bookmark not found' }, 404);
    }

    const tagsByBookmark = await getTagsByBookmarkId(db, auth.user.id);
    return jsonResponse({ bookmark: { ...bookmark, tags: tagsByBookmark.get(bookmark.id) || [] } });
  }

  if (request.method === 'POST' && segments[1] === 'import') {
    const { bookmarks } = await parseBody(request);

    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return jsonResponse({ error: 'bookmarks array is required' }, 400);
    }

    if (bookmarks.length > 2000) {
      return jsonResponse({ error: 'Cannot import more than 2000 bookmarks at once' }, 400);
    }

    const planStatus = await getUserPlanStatus(db, auth.user.id);
    if (!planStatus) {
      return jsonResponse({ error: 'User not found' }, 404);
    }

    if (!planStatus.paidTier && planStatus.bookmarkCount >= FREE_BOOKMARK_LIMIT) {
      return jsonResponse(
        {
          error: `Free users can save up to ${FREE_BOOKMARK_LIMIT} bookmarks. Upgrade to paid for unlimited bookmarks.`,
        },
        403
      );
    }

    const results = { imported: 0, skipped: 0, limitReached: false };
    let remainingSlots = planStatus.remainingSlots;

    for (const bm of bookmarks) {
      const { title, url, description, tags } = bm || {};

      if (!title || !url) {
        results.skipped += 1;
        continue;
      }

      if (!planStatus.paidTier && remainingSlots <= 0) {
        results.skipped += 1;
        results.limitReached = true;
        continue;
      }

      const existing = await db
        .prepare('SELECT id FROM bookmarks WHERE user_id = ? AND url = ?')
        .bind(auth.user.id, url)
        .first();

      if (existing) {
        results.skipped += 1;
        continue;
      }

      const insert = await db
        .prepare(
          'INSERT INTO bookmarks (user_id, title, url, description, favicon_url) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(auth.user.id, title, url, description || null, getFaviconUrl(url))
        .run();

      const bookmarkId = insert.meta.last_row_id;

      if (Array.isArray(tags) && tags.length > 0) {
        for (const tagName of tags) {
          const sanitized = tagName.trim().toLowerCase().replace(/\s+/g, '-');
          if (!sanitized) continue;
          const tag = await ensureTag(db, sanitized);
          await db
            .prepare('INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)')
            .bind(bookmarkId, tag.id)
            .run();
        }
      }

      results.imported += 1;
      if (!planStatus.paidTier) {
        remainingSlots -= 1;
      }
    }

    return jsonResponse({
      ...results,
      membership_tier: planStatus.membershipTier,
      bookmark_limit: planStatus.paidTier ? null : FREE_BOOKMARK_LIMIT,
    });
  }

  if (request.method === 'GET' && segments[1] === 'tags' && segments[2] === 'all') {
    const result = await db
      .prepare(
        `SELECT t.id, t.name, COUNT(bt.bookmark_id) AS count
         FROM tags t
         INNER JOIN bookmark_tags bt ON t.id = bt.tag_id
         INNER JOIN bookmarks b ON bt.bookmark_id = b.id
         WHERE b.user_id = ?
         GROUP BY t.id, t.name
         ORDER BY count DESC, t.name ASC`
      )
      .bind(auth.user.id)
      .all();

    const tags = (result.results || []).map((t) => ({
      ...t,
      count: Number(t.count || 0),
    }));

    return jsonResponse({ tags });
  }

  if (request.method === 'POST' && segments.length === 1) {
    const { title, url, description, tags } = await parseBody(request);

    if (!title || !url) {
      return jsonResponse({ error: 'Title and URL are required' }, 400);
    }

    const planStatus = await getUserPlanStatus(db, auth.user.id);
    if (!planStatus) {
      return jsonResponse({ error: 'User not found' }, 404);
    }

    if (!planStatus.paidTier && planStatus.bookmarkCount >= FREE_BOOKMARK_LIMIT) {
      return jsonResponse(
        {
          error: `Free users can save up to ${FREE_BOOKMARK_LIMIT} bookmarks. Upgrade to paid for unlimited bookmarks.`,
        },
        403
      );
    }

    const insert = await db
      .prepare(
        'INSERT INTO bookmarks (user_id, title, url, description, favicon_url) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(auth.user.id, title, url, description || null, getFaviconUrl(url))
      .run();

    const bookmark = await db
      .prepare('SELECT * FROM bookmarks WHERE id = ?')
      .bind(insert.meta.last_row_id)
      .first();

    let bookmarkTags = [];
    if (Array.isArray(tags) && tags.length > 0) {
      try {
        bookmarkTags = await setBookmarkTags(db, bookmark.id, tags);
      } catch (error) {
        if (String(error.message || '').startsWith('INVALID_TAG:')) {
          const invalidTag = error.message.replace('INVALID_TAG:', '');
          return jsonResponse({ error: `Tag "${invalidTag}" must be a single word with no spaces` }, 400);
        }
        throw error;
      }
    }

    return jsonResponse(
      {
        message: 'Bookmark created successfully',
        bookmark: { ...bookmark, tags: bookmarkTags },
      },
      201
    );
  }

  if (segments[1]) {
    const bookmarkId = Number(segments[1]);

    if (request.method === 'GET') {
      const bookmark = await db
        .prepare('SELECT * FROM bookmarks WHERE id = ? AND user_id = ?')
        .bind(bookmarkId, auth.user.id)
        .first();

      if (!bookmark) {
        return jsonResponse({ error: 'Bookmark not found' }, 404);
      }

      if (!bookmark.favicon_url) {
        const faviconUrl = getFaviconUrl(bookmark.url);
        bookmark.favicon_url = faviconUrl;
        await db
          .prepare('UPDATE bookmarks SET favicon_url = ? WHERE id = ?')
          .bind(faviconUrl, bookmark.id)
          .run();
      }

      const tagsByBookmark = await getTagsByBookmarkId(db, auth.user.id);
      return jsonResponse({ bookmark: { ...bookmark, tags: tagsByBookmark.get(bookmark.id) || [] } });
    }

    if (request.method === 'PUT') {
      const { title, url, description, tags } = await parseBody(request);

      const existing = await db
        .prepare('SELECT * FROM bookmarks WHERE id = ? AND user_id = ?')
        .bind(bookmarkId, auth.user.id)
        .first();

      if (!existing) {
        return jsonResponse({ error: 'Bookmark not found' }, 404);
      }

      await db
        .prepare('UPDATE bookmarks SET title = ?, url = ?, description = ?, favicon_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
        .bind(title, url, description || null, getFaviconUrl(url), bookmarkId, auth.user.id)
        .run();

      const bookmark = await db
        .prepare('SELECT * FROM bookmarks WHERE id = ? AND user_id = ?')
        .bind(bookmarkId, auth.user.id)
        .first();

      let bookmarkTags = [];
      if (tags !== undefined) {
        try {
          bookmarkTags = await setBookmarkTags(db, bookmark.id, Array.isArray(tags) ? tags : []);
        } catch (error) {
          if (String(error.message || '').startsWith('INVALID_TAG:')) {
            const invalidTag = error.message.replace('INVALID_TAG:', '');
            return jsonResponse({ error: `Tag "${invalidTag}" must be a single word with no spaces` }, 400);
          }
          throw error;
        }
      } else {
        const tagsByBookmark = await getTagsByBookmarkId(db, auth.user.id);
        bookmarkTags = tagsByBookmark.get(bookmark.id) || [];
      }

      return jsonResponse({ message: 'Bookmark updated successfully', bookmark: { ...bookmark, tags: bookmarkTags } });
    }

    if (request.method === 'DELETE') {
      const result = await db
        .prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?')
        .bind(bookmarkId, auth.user.id)
        .run();

      if ((result.meta.changes || 0) === 0) {
        return jsonResponse({ error: 'Bookmark not found' }, 404);
      }

      return jsonResponse({ message: 'Bookmark deleted successfully' });
    }
  }

  return jsonResponse({ error: 'Route not found' }, 404);
}

async function handleBilling(request, env, segments) {
  const db = env.DB;

  if (request.method === 'POST' && segments[1] === 'webhook') {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      return jsonResponse({ error: 'Webhook secret not configured' }, 500);
    }
    const rawBody = await request.text();
    const sigHeader = request.headers.get('stripe-signature');
    const valid = await verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
    if (!valid) {
      return jsonResponse({ error: 'Invalid webhook signature' }, 400);
    }
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }
    const result = await processStripeEvent(db, event);
    return jsonResponse({ received: true, result });
  }

  if (request.method === 'POST' && segments[1] === 'checkout-session') {
    const auth = await requireAuth(request, env);
    if (auth.error) return auth.error;
    if (!env.STRIPE_SECRET_KEY) {
      return jsonResponse({ error: 'Stripe is not configured' }, 503);
    }
    const { plan } = await parseBody(request);
    const priceMap = {
      monthly: env.STRIPE_MONTHLY_PRICE_ID,
      annual: env.STRIPE_ANNUAL_PRICE_ID,
    };
    const priceId = priceMap[plan];
    if (!priceId) {
      return jsonResponse({ error: 'Invalid or unavailable plan' }, 400);
    }
    const dbUser = await db.prepare('SELECT * FROM users WHERE id = ?').bind(auth.user.id).first();
    if (!dbUser) return jsonResponse({ error: 'User not found' }, 404);
    if (dbUser.membership_tier === MEMBERSHIP_TIERS.PAID) {
      return jsonResponse({ error: 'Already on a paid plan' }, 400);
    }
    let customerId = dbUser.stripe_customer_id;
    if (!customerId) {
      const customer = await stripeRequest('POST', '/customers', {
        email: dbUser.email,
        name: dbUser.username,
        'metadata[userId]': String(dbUser.id),
      }, env);
      customerId = customer.id;
      await db
        .prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?')
        .bind(customerId, dbUser.id)
        .run();
    }
    const appUrl = (env.APP_URL || 'https://tagsta.sh').replace(/\/$/, '');
    const session = await stripeRequest('POST', '/checkout/sessions', {
      customer: customerId,
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: `${appUrl}/?billing=success`,
      cancel_url: `${appUrl}/?billing=cancelled`,
      'metadata[userId]': String(dbUser.id),
    }, env);
    return jsonResponse({ url: session.url });
  }

  if (request.method === 'POST' && segments[1] === 'portal-session') {
    const auth = await requireAuth(request, env);
    if (auth.error) return auth.error;
    if (!env.STRIPE_SECRET_KEY) {
      return jsonResponse({ error: 'Stripe is not configured' }, 503);
    }
    const dbUser = await db.prepare('SELECT * FROM users WHERE id = ?').bind(auth.user.id).first();
    if (!dbUser) return jsonResponse({ error: 'User not found' }, 404);
    if (!dbUser.stripe_customer_id) {
      return jsonResponse({ error: 'No billing account found' }, 404);
    }
    const appUrl = (env.APP_URL || 'https://tagsta.sh').replace(/\/$/, '');
    const session = await stripeRequest('POST', '/billing_portal/sessions', {
      customer: dbUser.stripe_customer_id,
      return_url: `${appUrl}/settings`,
    }, env);
    return jsonResponse({ url: session.url });
  }

  if (request.method === 'GET' && segments[1] === 'status') {
    const auth = await requireAuth(request, env);
    if (auth.error) return auth.error;
    if (!env.STRIPE_SECRET_KEY) {
      return jsonResponse({ error: 'Stripe is not configured' }, 503);
    }

    const dbUser = await db.prepare('SELECT * FROM users WHERE id = ?').bind(auth.user.id).first();
    if (!dbUser) return jsonResponse({ error: 'User not found' }, 404);

    if (!dbUser.stripe_subscription_id) {
      return jsonResponse({
        synced: true,
        subscription: null,
        user: {
          id: dbUser.id,
          username: dbUser.username,
          email: dbUser.email,
          membership_tier: dbUser.membership_tier,
          role: dbUser.role,
        },
      });
    }

    const subscription = await stripeRequest(
      'GET',
      `/subscriptions/${dbUser.stripe_subscription_id}`,
      null,
      env
    );

    const status = subscription?.status;
    const nextTier = ['active', 'trialing'].includes(status)
      ? MEMBERSHIP_TIERS.PAID
      : MEMBERSHIP_TIERS.FREE;

    if (dbUser.membership_tier !== nextTier) {
      await db
        .prepare('UPDATE users SET membership_tier = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(nextTier, dbUser.id)
        .run();
    }

    const refreshedUser = await db
      .prepare('SELECT id, username, email, membership_tier, role FROM users WHERE id = ?')
      .bind(dbUser.id)
      .first();

    return jsonResponse({
      synced: true,
      subscription: {
        id: subscription?.id,
        status: subscription?.status,
        cancel_at_period_end: !!subscription?.cancel_at_period_end,
        cancel_at: subscription?.cancel_at || null,
        canceled_at: subscription?.canceled_at || null,
        current_period_end: subscription?.current_period_end || null,
      },
      user: refreshedUser,
    });
  }

  if (request.method === 'GET' && segments[1] === 'plans') {
    return jsonResponse({
      plans: [
        { id: 'monthly', available: !!env.STRIPE_MONTHLY_PRICE_ID },
        { id: 'annual', available: !!env.STRIPE_ANNUAL_PRICE_ID },
      ],
    });
  }

  return jsonResponse({ error: 'Route not found' }, 404);
}

async function handleSupport(request, env, segments) {
  if (request.method !== 'POST' || segments.length !== 1) {
    return jsonResponse({ error: 'Route not found' }, 404);
  }

  const { email, message, captchaToken } = await parseBody(request);
  const normalizedEmail = normalizeEmail(email);
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';

  if (!normalizedEmail || !trimmedMessage) {
    return jsonResponse({ error: 'Email and message are required.' }, 400);
  }

  if (!isValidEmail(normalizedEmail)) {
    return jsonResponse({ error: 'Please provide a valid email address.' }, 400);
  }

  if (trimmedMessage.length < 10) {
    return jsonResponse({ error: 'Message must be at least 10 characters.' }, 400);
  }

  if (trimmedMessage.length > 4000) {
    return jsonResponse({ error: 'Message must be 4000 characters or less.' }, 400);
  }

  const captcha = await verifyTurnstile(request, env, captchaToken);
  if (!captcha.ok) {
    return jsonResponse({ error: captcha.error }, captcha.status);
  }

  if (!env.RESEND_API_KEY) {
    return jsonResponse({ error: 'Support email is not configured.' }, 503);
  }
  if (!env.EMAIL_FROM) {
    return jsonResponse({ error: 'Support email is not configured.' }, 503);
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const toAddress = env.SUPPORT_EMAIL || 'support@tagsta.sh';
  const fromAddress = env.EMAIL_FROM;

  const textBody = [
    'New Tagstash support request',
    '',
    `Account email: ${normalizedEmail}`,
    '',
    'Message:',
    trimmedMessage,
  ].join('\n');

  const escapedEmail = normalizedEmail
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const escapedMessage = trimmedMessage
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const htmlBody = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>Tagstash support request</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#f3f4f6;color:#111827;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;margin:0 auto;border-collapse:collapse;">
      <tr>
        <td style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;color:#111827;">
          <h2 style="margin:0 0 12px 0;color:#111827;font-size:24px;line-height:1.25;">New Tagstash support request</h2>
          <p style="margin:0 0 12px 0;color:#111827;">
            <strong>Account email:</strong>
            <a href="mailto:${escapedEmail}" style="color:#0f172a;text-decoration:underline;">${escapedEmail}</a>
          </p>
          <p style="margin:0 0 8px 0;color:#111827;"><strong>Message:</strong></p>
          <div style="white-space:pre-wrap;background-color:#f9fafb;border:1px solid #e5e7eb;padding:12px;border-radius:8px;color:#111827;">${escapedMessage}</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: toAddress,
    replyTo: normalizedEmail,
    subject: `Tagstash support request from ${normalizedEmail}`,
    text: textBody,
    html: htmlBody,
  });

  if (error) {
    return jsonResponse({ error: 'Failed to send support request. Please try again.' }, 500);
  }

  return jsonResponse({ message: 'Support request sent successfully.' }, 201);
}

export const onRequestOptions = async () => new Response(null, { status: 204, headers: corsHeaders });

export async function onRequest(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);

    if (segments[0] !== 'api') {
      return jsonResponse({ error: 'Route not found' }, 404);
    }

    if (request.method === 'GET' && segments[1] === 'health') {
      return jsonResponse({ status: 'ok', message: 'Tagstash API is running' });
    }

    if (!env.DB) {
      return jsonResponse({ error: 'D1 binding DB is not configured' }, 500);
    }

    if (segments[1] === 'auth') {
      return handleAuth(request, env, segments.slice(1));
    }

    if (segments[1] === 'bookmarks') {
      return handleBookmarks(request, env, segments.slice(1));
    }

    if (segments[1] === 'billing') {
      return handleBilling(request, env, segments.slice(1));
    }

    if (segments[1] === 'support') {
      return handleSupport(request, env, segments.slice(1));
    }

    return jsonResponse({ error: 'Route not found' }, 404);
  } catch (error) {
    console.error('API handler error:', error);
    return jsonResponse({ error: 'Something went wrong!' }, 500);
  }
}
