import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'crypto';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  MEMBERSHIP_TIERS,
  USER_ROLES,
  isSuperAdminEmail,
  normalizeEmail,
} from '../config/membership.js';

const router = express.Router();

const getRoleForEmail = (email) =>
  isSuperAdminEmail(email) ? USER_ROLES.SUPER_ADMIN : USER_ROLES.USER;

const ensureUserRoleMatchesConfig = async (user) => {
  const expectedRole = getRoleForEmail(user.email);

  if (user.role !== expectedRole) {
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [expectedRole, user.id]);
    user.role = expectedRole;
  }

  return user;
};

const requireSuperAdmin = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, membership_tier, role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const adminUser = await ensureUserRoleMatchesConfig(result.rows[0]);

    if (adminUser.role !== USER_ROLES.SUPER_ADMIN) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    req.adminUser = adminUser;
    next();
  } catch (error) {
    console.error('Super admin authorization error:', error);
    res.status(500).json({ error: 'Server error during authorization' });
  }
};

const hashApiKey = (apiKey) => createHash('sha256').update(apiKey).digest('hex');

const getApiKeyEncryptionKey = () => {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('Missing API key encryption secret');
  }
  return createHash('sha256').update(secret).digest();
};

const encryptApiKey = (apiKey) => {
  const key = getApiKeyEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
};

const decryptApiKey = (encryptedApiKey) => {
  if (!encryptedApiKey) {
    return null;
  }

  const parts = encryptedApiKey.split(':');
  if (parts.length !== 3) {
    return null;
  }

  const [ivHex, authTagHex, dataHex] = parts;
  const key = getApiKeyEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
};

const generateApiKeyValue = () => {
  const randomPart = randomBytes(24).toString('hex');
  return `tsk_${randomPart}`;
};

// Register a new user
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const normalizedEmail = normalizeEmail(email);
    const trimmedUsername = typeof username === 'string' ? username.trim() : '';

    // Validate input
    if (!trimmedUsername || !normalizedEmail || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (/\s/.test(trimmedUsername)) {
      return res.status(400).json({ error: 'Username cannot contain spaces' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const userCheck = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR username = $2',
      [normalizedEmail, trimmedUsername]
    );

    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email or username' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const role = getRoleForEmail(normalizedEmail);

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, membership_tier, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, membership_tier, role, created_at`,
      [trimmedUsername, normalizedEmail, passwordHash, MEMBERSHIP_TIERS.FREE, role]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        membershipTier: user.membership_tier,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        membership_tier: user.membership_tier,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const normalizedEmail = normalizeEmail(email);

    // Validate input
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = await ensureUserRoleMatchesConfig(result.rows[0]);

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        membershipTier: user.membership_tier,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
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
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get current user (protected route)
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      'SELECT id, username, email, membership_tier, role, created_at FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = await ensureUserRoleMatchesConfig(result.rows[0]);
    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(403).json({ error: 'Invalid or expired token' });
  }
});

// Update username (protected route)
router.put('/username', authenticateToken, async (req, res) => {
  const { newUsername, password } = req.body;

  try {
    const trimmedUsername = typeof newUsername === 'string' ? newUsername.trim() : '';

    if (!trimmedUsername || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (/\s/.test(trimmedUsername)) {
      return res.status(400).json({ error: 'Username cannot contain spaces' });
    }

    if (trimmedUsername.length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters' });
    }

    if (trimmedUsername.length > 50) {
      return res.status(400).json({ error: 'Username must be 50 characters or less' });
    }

    const usernameCheck = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2',
      [trimmedUsername, req.user.id]
    );

    if (usernameCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Username is already in use' });
    }

    const userResult = await pool.query(
      'SELECT password_hash, username FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (userResult.rows[0].username === trimmedUsername) {
      return res.status(400).json({ error: 'New username must be different from current username' });
    }

    const validPassword = await bcrypt.compare(password, userResult.rows[0].password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const updateResult = await pool.query(
      `UPDATE users
       SET username = $1
       WHERE id = $2
       RETURNING id, username, email, membership_tier, role`,
      [trimmedUsername, req.user.id]
    );

    res.json({
      message: 'Username updated successfully',
      user: updateResult.rows[0],
    });
  } catch (error) {
    console.error('Update username error:', error);
    res.status(500).json({ error: 'Server error updating username' });
  }
});

// Update email (protected route)
router.put('/email', authenticateToken, async (req, res) => {
  const { newEmail, password } = req.body;

  try {
    const normalizedNewEmail = normalizeEmail(newEmail);

    // Validate input
    if (!normalizedNewEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if new email is already in use
    const emailCheck = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND id != $2',
      [normalizedNewEmail, req.user.id]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email is already in use' });
    }

    // Verify current password
    const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [
      req.user.id,
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(password, userResult.rows[0].password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const updatedRole = getRoleForEmail(normalizedNewEmail);

    // Update email
    const updateResult = await pool.query(
      `UPDATE users
       SET email = $1, role = $2
       WHERE id = $3
       RETURNING id, username, email, membership_tier, role`,
      [normalizedNewEmail, updatedRole, req.user.id]
    );

    res.json({
      message: 'Email updated successfully',
      user: updateResult.rows[0],
    });
  } catch (error) {
    console.error('Update email error:', error);
    res.status(500).json({ error: 'Server error updating email' });
  }
});

// Update password (protected route)
router.put('/password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  try {
    // Validate input
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    // Verify current password
    const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [
      req.user.id,
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Incorrect current password' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Update password
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      passwordHash,
      req.user.id,
    ]);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ error: 'Server error updating password' });
  }
});

// List API keys for current user (protected route)
router.get('/api-keys', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, key_prefix, key_last4, encrypted_key, created_at, last_used_at, revoked_at
       FROM api_keys
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    const apiKeys = result.rows.map((row) => {
      let apiKey = null;
      try {
        apiKey = decryptApiKey(row.encrypted_key);
      } catch {
        apiKey = null;
      }

      return {
        id: row.id,
        name: row.name,
        key_prefix: row.key_prefix,
        key_last4: row.key_last4,
        created_at: row.created_at,
        last_used_at: row.last_used_at,
        revoked_at: row.revoked_at,
        api_key: apiKey,
      };
    });

    res.json({ apiKeys });
  } catch (error) {
    console.error('List API keys error:', error);
    res.status(500).json({ error: 'Server error fetching API keys' });
  }
});

// Create API key for current user (protected route)
router.post('/api-keys', authenticateToken, async (req, res) => {
  const { name } = req.body;

  try {
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const keyName = trimmedName || 'Default API Key';

    if (keyName.length > 100) {
      return res.status(400).json({ error: 'API key name must be 100 characters or less' });
    }

    const apiKey = generateApiKeyValue();
    const keyHash = hashApiKey(apiKey);
    const encryptedKey = encryptApiKey(apiKey);
    const keyPrefix = apiKey.slice(0, 8);
    const keyLast4 = apiKey.slice(-4);

    const result = await pool.query(
      `INSERT INTO api_keys (user_id, name, key_hash, encrypted_key, key_prefix, key_last4)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, key_prefix, key_last4, created_at, last_used_at, revoked_at`,
      [req.user.id, keyName, keyHash, encryptedKey, keyPrefix, keyLast4]
    );

    res.status(201).json({
      message: 'API key created successfully',
      apiKey,
      apiKeyMetadata: result.rows[0],
    });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ error: 'Server error creating API key' });
  }
});

// Revoke API key for current user (protected route)
router.delete('/api-keys/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE api_keys
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'API key not found or already revoked' });
    }

    res.json({ message: 'API key revoked successfully' });
  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json({ error: 'Server error revoking API key' });
  }
});

// Permanently delete API key for current user (protected route)
router.delete('/api-keys/:id/permanent', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM api_keys
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json({ message: 'API key deleted successfully' });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ error: 'Server error deleting API key' });
  }
});

// List all users (super admin only)
router.get('/admin/users', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.membership_tier, u.role, u.created_at, u.updated_at,
              COUNT(b.id)::INTEGER AS bookmark_count
       FROM users u
       LEFT JOIN bookmarks b ON b.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );

    res.json({ users: result.rows });
  } catch (error) {
    console.error('List users admin error:', error);
    res.status(500).json({ error: 'Server error listing users' });
  }
});

// Update user access controls (super admin only)
router.patch('/admin/users/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  const { membershipTier, role } = req.body;

  try {
    const hasMembershipTier = membershipTier !== undefined;
    const hasRole = role !== undefined;

    if (!hasMembershipTier && !hasRole) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const validTiers = Object.values(MEMBERSHIP_TIERS);
    const validRoles = Object.values(USER_ROLES);

    if (hasMembershipTier && !validTiers.includes(membershipTier)) {
      return res.status(400).json({ error: 'Invalid membership tier' });
    }

    if (hasRole && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const userResult = await pool.query(
      'SELECT id, email, membership_tier, role FROM users WHERE id = $1',
      [req.params.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userResult.rows[0];
    const isConfiguredSuperAdmin = isSuperAdminEmail(targetUser.email);

    const nextMembershipTier = hasMembershipTier ? membershipTier : targetUser.membership_tier;
    const nextRole = hasRole ? role : targetUser.role;

    if (isConfiguredSuperAdmin && nextRole !== USER_ROLES.SUPER_ADMIN) {
      return res.status(400).json({ error: 'Configured super admin account role cannot be changed' });
    }

    if (!isConfiguredSuperAdmin && nextRole === USER_ROLES.SUPER_ADMIN) {
      return res.status(400).json({ error: 'Only the configured super admin email can have super admin role' });
    }

    const updateResult = await pool.query(
      `UPDATE users
       SET membership_tier = $1, role = $2
       WHERE id = $3
       RETURNING id, username, email, membership_tier, role, created_at, updated_at`,
      [nextMembershipTier, nextRole, req.params.id]
    );

    res.json({
      message: 'User access updated successfully',
      user: updateResult.rows[0],
    });
  } catch (error) {
    console.error('Update user admin error:', error);
    res.status(500).json({ error: 'Server error updating user access' });
  }
});


export default router;
