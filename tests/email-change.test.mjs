import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';
import { createAuthEnv } from './helpers/auth-env.mjs';

const webHeaders = { Origin: 'https://tagsta.sh', 'X-Tagstash-Client': 'web' };
const call = (env, path, { method = 'GET', headers = {}, body } = {}) =>
  onRequest({ env, request: new Request(`https://tagsta.sh/api/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) });
const cookieFrom = (response) => response.headers.get('Set-Cookie').split(';')[0];

// Capture outgoing mail instead of sending it.
const withMailbox = async (env, run) => {
  const originalFetch = globalThis.fetch;
  const mail = [];
  globalThis.fetch = async (url, options) => {
    mail.push(JSON.parse(options.body));
    return Response.json({ success: true });
  };
  env.CLOUDFLARE_API_TOKEN = 'isolated-test';
  env.CLOUDFLARE_ACCOUNT_ID = 'isolated-test';
  try { await run(mail); } finally { globalThis.fetch = originalFetch; }
};

const signIn = async (env) => {
  const response = await call(env, 'auth/login', {
    method: 'POST', headers: webHeaders, body: { email: 'session@example.com', password: env.password },
  });
  assert.equal(response.status, 200);
  return { ...webHeaders, Cookie: cookieFrom(response) };
};
const linkTokenFrom = (message) => message.text.match(/token=([0-9a-f]{64})/)[1];
const requestChange = (env, headers, newEmail) =>
  call(env, 'auth/email', { method: 'PUT', headers, body: { newEmail, password: env.password } });

test('claiming a configured super-admin address does not change role or email until the inbox confirms', async () => {
  const env = await createAuthEnv();
  env.SUPER_ADMIN_EMAIL = 'admin@example.com';
  try {
    await withMailbox(env, async (mail) => {
      const headers = await signIn(env);
      const response = await requestChange(env, headers, 'Admin@Example.com');
      assert.equal(response.status, 200);
      assert.equal((await response.json()).pending, true);

      const row = env.sqlite.prepare('SELECT email, role FROM users').get();
      assert.equal(row.email, 'session@example.com');
      assert.equal(row.role, 'user');
      assert.equal((await call(env, 'auth/admin/users', { headers })).status, 403);

      // The link goes to the new address; the old address is only warned.
      const toNew = mail.find((m) => m.to === 'admin@example.com');
      const toOld = mail.find((m) => m.to === 'session@example.com');
      assert.ok(toNew && toOld);
      assert.doesNotMatch(toOld.text, /token=/);

      const confirm = await call(env, `auth/verify-email?token=${linkTokenFrom(toNew)}`, { headers: webHeaders });
      assert.equal(confirm.status, 200);
      const body = await confirm.json();
      assert.equal(body.emailChanged, true);
      assert.equal(confirm.headers.get('Set-Cookie'), null);
      assert.equal(body.token, undefined);

      const after = env.sqlite.prepare('SELECT email, role FROM users').get();
      assert.equal(after.email, 'admin@example.com');
      assert.equal(after.role, 'super_admin');
      // Old session is revoked by the token-version bump.
      assert.ok([401, 403].includes((await call(env, 'auth/me', { headers })).status));
    });
  } finally { env.sqlite.close(); }
});

test('email-change links are single-use, expire, and clear outstanding reset links', async () => {
  const env = await createAuthEnv();
  try {
    await withMailbox(env, async (mail) => {
      const headers = await signIn(env);
      env.sqlite.prepare(`INSERT INTO password_reset_tokens (user_id, token, token_hash, expires_at) VALUES (1, 'x', 'h', '2099-01-01')`).run();
      await requestChange(env, headers, 'new@example.com');
      const token = linkTokenFrom(mail.find((m) => m.to === 'new@example.com'));

      const results = await Promise.all([1, 2].map(() => call(env, `auth/verify-email?token=${token}`, { headers: webHeaders })));
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
      assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS c FROM password_reset_tokens').get().c, 0);

      // Expired link is refused and changes nothing.
      const stale = await signInAs(env, 'new@example.com');
      await requestChange(env, stale, 'later@example.com');
      env.sqlite.exec(`UPDATE email_change_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE used_at IS NULL`);
      const expiredToken = linkTokenFrom(mail.filter((m) => m.to === 'later@example.com').at(-1));
      assert.equal((await call(env, `auth/verify-email?token=${expiredToken}`, { headers: webHeaders })).status, 400);
      assert.equal(env.sqlite.prepare('SELECT email FROM users').get().email, 'new@example.com');
    });
  } finally { env.sqlite.close(); }
});

const signInAs = async (env, email) => {
  const response = await call(env, 'auth/login', {
    method: 'POST', headers: webHeaders, body: { email, password: env.password },
  });
  assert.equal(response.status, 200);
  return { ...webHeaders, Cookie: cookieFrom(response) };
};

test('email change needs the password, rejects taken addresses and fails closed before migration', async () => {
  const env = await createAuthEnv();
  try {
    await withMailbox(env, async (mail) => {
      const headers = await signIn(env);
      const wrong = await call(env, 'auth/email', { method: 'PUT', headers, body: { newEmail: 'x@example.com', password: 'wrong-password' } });
      assert.equal(wrong.status, 401);
      assert.equal(mail.length, 0);

      env.sqlite.prepare(`INSERT INTO users (username, email, password_hash, email_verified) VALUES ('other', 'taken@example.com', 'h', 1)`).run();
      assert.equal((await requestChange(env, headers, 'taken@example.com')).status, 400);

      env.sqlite.exec('DROP TABLE email_change_tokens');
      assert.equal((await requestChange(env, headers, 'free@example.com')).status, 503);
      assert.equal(env.sqlite.prepare('SELECT email FROM users WHERE id = 1').get().email, 'session@example.com');
    });
  } finally { env.sqlite.close(); }
});
