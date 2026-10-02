import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, jwtVerify } from 'jose';
import { onRequest, onRequestOptions } from '../functions/api/[[path]].js';
import { createAuthEnv } from './helpers/auth-env.mjs';

const webHeaders = { Origin: 'https://tagsta.sh', 'X-Tagstash-Client': 'web' };
const call = (env, path, { method = 'GET', headers = {}, body, origin = 'https://tagsta.sh' } = {}) =>
  onRequest({ env, request: new Request(`${origin}/api/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) });
const login = (env, headers = webHeaders) => call(env, 'auth/login', {
  method: 'POST', headers, body: { email: 'session@example.com', password: env.password },
});
const cookieFrom = (response) => response.headers.get('Set-Cookie').split(';')[0];
const tokenFrom = (cookie) => cookie.slice(cookie.indexOf('=') + 1);

test('web login issues a host-only, HttpOnly seven-day session without a JSON token', async () => {
  const env = await createAuthEnv();
  try {
    const response = await login(env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).token, undefined);
    const cookie = response.headers.get('Set-Cookie');
    assert.match(cookie, /^__Host-tagstash-session=/);
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=604800']) assert.ok(cookie.includes(attribute));
    assert.ok(!cookie.includes('Domain='));
    const { payload } = await jwtVerify(tokenFrom(cookieFrom(response)), new TextEncoder().encode(env.JWT_SECRET));
    assert.equal(payload.exp - payload.iat, 604800);
    assert.equal(payload.session, 'web');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal((await call(env, 'auth/me', { headers: { ...webHeaders, Cookie: cookieFrom(response) } })).status, 200);
  } finally { env.sqlite.close(); }
});

test('CSRF rejects hostile, missing-origin and simple-form mutations before changing data', async () => {
  const env = await createAuthEnv();
  try {
    const cookie = cookieFrom(await login(env));
    for (const headers of [
      { Cookie: cookie },
      { Cookie: cookie, Origin: 'https://tagsta.sh' },
      { Cookie: cookie, 'X-Tagstash-Client': 'web' },
      { Cookie: cookie, 'X-Tagstash-Client': 'web', Origin: 'https://evil.example' },
      { Cookie: cookie, 'X-Tagstash-Client': 'web', Origin: 'null' },
      { Cookie: cookie, 'X-Tagstash-Client': 'web', Origin: 'moz-extension://test' },
    ]) {
      assert.equal((await call(env, 'auth/theme', { method: 'PUT', headers, body: { theme: 'light' } })).status, 403);
    }
    assert.equal(env.sqlite.prepare('SELECT theme FROM users').get().theme, null);
    assert.equal((await call(env, 'auth/theme', { method: 'PUT', headers: { ...webHeaders, Cookie: cookie }, body: { theme: 'light' } })).status, 200);
    assert.equal(env.sqlite.prepare('SELECT theme FROM users').get().theme, 'light');
    assert.equal((await login(env, { 'X-Tagstash-Client': 'web', Origin: 'https://evil.example' })).status, 403);
  } finally { env.sqlite.close(); }
});

test('extension bearer auth remains compatible, and cookie/bearer token types cannot be swapped', async () => {
  const env = await createAuthEnv();
  try {
    const response = await login(env, {});
    const { token } = await response.json();
    assert.ok(token);
    assert.equal(response.headers.get('Set-Cookie'), null);
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.JWT_SECRET));
    assert.equal(payload.exp - payload.iat, 60 * 86400);
    assert.equal((await call(env, 'auth/me', { headers: { Authorization: `Bearer ${token}` } })).status, 200);
    assert.equal((await call(env, 'auth/me', { headers: { Cookie: `__Host-tagstash-session=${token}` } })).status, 403);
    const cookie = cookieFrom(await login(env));
    assert.equal((await call(env, 'auth/me', { headers: { Authorization: `Bearer ${tokenFrom(cookie)}` } })).status, 403);
    // Cookie presence cannot force an explicit extension bearer request into web auth.
    assert.equal((await call(env, 'auth/theme', { method: 'PUT', headers: { Cookie: cookie, Authorization: `Bearer ${token}` }, body: { theme: 'light' } })).status, 200);
  } finally { env.sqlite.close(); }
});

test('legacy tokens upgrade to cookies and logout clears the session with matching attributes', async () => {
  const env = await createAuthEnv();
  try {
    const { token } = await (await login(env, {})).json();
    const upgraded = await call(env, 'auth/session', { method: 'POST', headers: { ...webHeaders, Authorization: `Bearer ${token}` } });
    assert.equal(upgraded.status, 200);
    assert.equal((await upgraded.json()).token, undefined);
    const cookie = cookieFrom(upgraded);
    const logout = await call(env, 'auth/logout', { method: 'POST', headers: { ...webHeaders, Cookie: cookie } });
    assert.match(logout.headers.get('Set-Cookie'), /^__Host-tagstash-session=;.*Max-Age=0; Secure$/);
    assert.equal((await call(env, 'auth/me')).status, 401);
    env.sqlite.exec('UPDATE users SET token_version = token_version + 1');
    assert.equal((await call(env, 'auth/session', { method: 'POST', headers: { ...webHeaders, Authorization: `Bearer ${token}` } })).status, 403);
  } finally { env.sqlite.close(); }
});

test('password change replaces the current cookie and revokes older web and extension sessions', async () => {
  const env = await createAuthEnv();
  try {
    const cookie = cookieFrom(await login(env));
    const { token } = await (await login(env, {})).json();
    const response = await call(env, 'auth/password', { method: 'PUT', headers: { ...webHeaders, Cookie: cookie },
      body: { currentPassword: env.password, newPassword: 'new-session-password', confirmPassword: 'new-session-password' } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).token, undefined);
    assert.equal((await call(env, 'auth/me', { headers: { Cookie: cookie } })).status, 403);
    assert.equal((await call(env, 'auth/me', { headers: { Authorization: `Bearer ${token}` } })).status, 403);
    assert.equal((await call(env, 'auth/me', { headers: { Cookie: cookieFrom(response) } })).status, 200);
  } finally { env.sqlite.close(); }
});

test('expired sessions and deleted users cannot authenticate', async () => {
  const env = await createAuthEnv();
  try {
    const expired = await new SignJWT({ id: 1, tv: 0, session: 'web' }).setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1).sign(new TextEncoder().encode(env.JWT_SECRET));
    assert.equal((await call(env, 'auth/me', { headers: { Cookie: `__Host-tagstash-session=${expired}` } })).status, 403);
    const cookie = cookieFrom(await login(env));
    env.sqlite.exec('DELETE FROM users WHERE id = 1');
    assert.equal((await call(env, 'auth/me', { headers: { Cookie: cookie } })).status, 403);
  } finally { env.sqlite.close(); }
});

test('verification and reset issue cookies, and reset revokes the previous session', async () => {
  const env = await createAuthEnv();
  try {
    const expiry = new Date(Date.now() + 3600000).toISOString();
    env.sqlite.exec('UPDATE users SET email_verified = 0');
    env.sqlite.prepare('INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (1, ?, ?)').run('verification-test', expiry);
    const verified = await call(env, 'auth/verify-email?token=verification-test', { headers: webHeaders });
    assert.equal(verified.status, 200);
    assert.equal((await verified.json()).token, undefined);
    const cookie = cookieFrom(verified);
    assert.equal((await call(env, 'auth/me', { headers: { Cookie: cookie } })).status, 200);
    env.sqlite.prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (1, ?, ?)').run('reset-test', expiry);
    const reset = await call(env, 'auth/reset-password', { method: 'POST', headers: webHeaders, body: { token: 'reset-test', password: 'reset-session-password' } });
    assert.equal(reset.status, 200);
    assert.equal((await reset.json()).token, undefined);
    assert.equal((await call(env, 'auth/me', { headers: { Cookie: cookie } })).status, 403);
    assert.equal((await call(env, 'auth/me', { headers: { Cookie: cookieFrom(reset) } })).status, 200);
  } finally { env.sqlite.close(); }
});

test('Stripe webhook continues to use signature validation even if a session cookie is present', async () => {
  const env = await createAuthEnv();
  try {
    env.STRIPE_WEBHOOK_SECRET = 'isolated-webhook-secret';
    const response = await call(env, 'billing/webhook', { method: 'POST', headers: { Cookie: cookieFrom(await login(env)) }, body: {} });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'Invalid webhook signature');
  } finally { env.sqlite.close(); }
});

test('CORS credentials only cover trusted web origins; public API retains wildcard', async () => {
  const env = await createAuthEnv();
  try {
    for (const origin of ['https://tagsta.sh', 'https://evil.example', 'moz-extension://test']) {
      const response = await onRequestOptions({ env, request: new Request('https://tagsta.sh/api/auth/login', { method: 'OPTIONS', headers: { Origin: origin } }) });
      assert.equal(response.headers.get('Access-Control-Allow-Credentials'), origin === 'https://tagsta.sh' ? 'true' : null);
      assert.match(response.headers.get('Access-Control-Allow-Headers'), /X-Tagstash-Client/);
      if (origin === 'https://evil.example') assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    }
    const publicResponse = await call(env, 'profiles/missing', { headers: { Origin: 'https://evil.example' } });
    assert.equal(publicResponse.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(publicResponse.headers.get('Access-Control-Allow-Credentials'), null);
  } finally { env.sqlite.close(); }
});

test('localhost proxy supports cookies without permitting insecure remote-host cookies', async () => {
  const env = await createAuthEnv();
  try {
    const response = await call(env, 'auth/login', { method: 'POST', origin: 'http://127.0.0.1:5000',
      headers: { 'X-Tagstash-Client': 'web', Origin: 'http://localhost:3000' }, body: { email: 'session@example.com', password: env.password } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Set-Cookie'), /^tagstash-session=/);
    assert.ok(!response.headers.get('Set-Cookie').includes('Secure'));
    const remote = await call(env, 'auth/login', { method: 'POST', origin: 'http://example.test',
      headers: { 'X-Tagstash-Client': 'web', Origin: 'http://example.test' }, body: { email: 'session@example.com', password: env.password } });
    assert.match(remote.headers.get('Set-Cookie'), /^__Host-tagstash-session=.*; Secure$/);
  } finally { env.sqlite.close(); }
});
