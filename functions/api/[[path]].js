import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

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
    await db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(expectedRole, user.id).run();
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

const processBillingWebhookEvent = async (db, event) => {
  const eventType = event?.type;
  const typeToTier = {
    subscription_activated: MEMBERSHIP_TIERS.PAID,
    payment_succeeded: MEMBERSHIP_TIERS.PAID,
    subscription_canceled: MEMBERSHIP_TIERS.FREE,
    payment_failed: MEMBERSHIP_TIERS.FREE,
  };

  const nextTier = typeToTier[eventType];
  if (!eventType || !nextTier) {
    return { handled: false, reason: 'Unsupported or missing billing event type' };
  }

  const userId = Number(event?.data?.userId);
  const email = normalizeEmail(event?.data?.email);

  let user = null;
  if (Number.isInteger(userId) && userId > 0) {
    user = await db
      .prepare('SELECT id, username, email, membership_tier, role FROM users WHERE id = ?')
      .bind(userId)
      .first();
  }

  if (!user && email) {
    user = await db
      .prepare('SELECT id, username, email, membership_tier, role FROM users WHERE LOWER(email) = LOWER(?)')
      .bind(email)
      .first();
  }

  if (!user) {
    return { handled: false, reason: 'No matching user for billing event' };
  }

  if (user.membership_tier === nextTier) {
    return { handled: true, action: 'noop', user, eventType };
  }

  await db
    .prepare('UPDATE users SET membership_tier = ? WHERE id = ?')
    .bind(nextTier, user.id)
    .run();

  const updatedUser = await db
    .prepare('SELECT id, username, email, membership_tier, role, updated_at FROM users WHERE id = ?')
    .bind(user.id)
    .first();

  return {
    handled: true,
    action: 'membership_updated',
    eventType,
    previousTier: user.membership_tier,
    nextTier,
    user: updatedUser,
  };
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
        'INSERT INTO users (username, email, password_hash, membership_tier, role) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(trimmedUsername, normalizedEmail, passwordHash, MEMBERSHIP_TIERS.FREE, role)
      .run();

    const user = await db
      .prepare('SELECT id, username, email, membership_tier, role FROM users WHERE id = ?')
      .bind(insert.meta.last_row_id)
      .first();

    const token = await signUserToken(user, env);

    return jsonResponse(
      {
        message: 'User registered successfully',
        token,
        user,
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

    await db.prepare('UPDATE users SET username = ? WHERE id = ?').bind(trimmedUsername, auth.user.id).run();

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
      .prepare('UPDATE users SET email = ?, role = ? WHERE id = ?')
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
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(passwordHash, auth.user.id).run();

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
      .prepare('UPDATE users SET membership_tier = ?, role = ? WHERE id = ?')
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
    const expectedSecret = env.BILLING_WEBHOOK_SECRET;
    const providedSecret = request.headers.get('x-tagstash-webhook-secret');

    if (expectedSecret && providedSecret !== expectedSecret) {
      return jsonResponse({ error: 'Invalid webhook secret' }, 401);
    }

    const event = await parseBody(request);
    const result = await processBillingWebhookEvent(db, event);
    return jsonResponse({ received: true, result });
  }

  if (request.method === 'POST' && segments[1] === 'checkout-session') {
    const auth = await requireAuth(request, env);
    if (auth.error) return auth.error;

    return jsonResponse(
      {
        error: 'Billing provider not configured yet',
        message:
          'Create checkout session is a placeholder until payment provider integration is added',
        suggestedProviderFields: ['providerCustomerId', 'providerPriceId', 'successUrl', 'cancelUrl'],
      },
      501
    );
  }

  if (request.method === 'POST' && segments[1] === 'portal-session') {
    const auth = await requireAuth(request, env);
    if (auth.error) return auth.error;

    return jsonResponse(
      {
        error: 'Billing provider not configured yet',
        message:
          'Create billing portal session is a placeholder until payment provider integration is added',
        suggestedProviderFields: ['providerCustomerId', 'returnUrl'],
      },
      501
    );
  }

  return jsonResponse({ error: 'Route not found' }, 404);
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

    return jsonResponse({ error: 'Route not found' }, 404);
  } catch (error) {
    console.error('API handler error:', error);
    return jsonResponse({ error: 'Something went wrong!' }, 500);
  }
}
