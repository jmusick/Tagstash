import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';
import { createAuthEnv } from './helpers/auth-env.mjs';

const webHeaders = { Origin: 'https://tagsta.sh', 'X-Tagstash-Client': 'web' };
const send = (env, path, method, body, headers = {}) =>
  onRequest({ env, request: new Request(`https://tagsta.sh/api/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...webHeaders, ...headers }, body: JSON.stringify(body),
  }) });
const signIn = async (env) => {
  const response = await send(env, 'auth/login', 'POST', { email: 'session@example.com', password: env.password });
  assert.equal(response.status, 200);
  return { Cookie: response.headers.get('Set-Cookie').split(';')[0] };
};
const attempts = [
  (env, h, i) => send(env, 'auth/username', 'PUT', { newUsername: `newname${i}`, password: 'wrong-password' }, h),
  (env, h, i) => send(env, 'auth/email', 'PUT', { newEmail: `n${i}@example.com`, password: 'wrong-password' }, h),
  (env, h) => send(env, 'auth/password', 'PUT', { currentPassword: 'wrong-password', newPassword: 'whatever-new-pw', confirmPassword: 'whatever-new-pw' }, h),
];
const row = (env) => env.sqlite.prepare('SELECT username, email, password_hash, failed_attempts, locked_until FROM users WHERE id = 1').get();

test('wrong confirmations rotating across endpoints share one budget, lock with 429 and mutate nothing', async () => {
  const env = await createAuthEnv();
  try {
    const headers = await signIn(env);
    const before = row(env);
    const statuses = [];
    for (let i = 0; i < 8; i += 1) statuses.push((await attempts[i % 3](env, headers, i)).status);
    assert.deepEqual(statuses, [401, 401, 401, 401, 401, 401, 401, 429]);
    assert.ok(row(env).locked_until > Date.now());
    // Once locked, even the correct password is refused on every route (and at login).
    assert.equal((await send(env, 'auth/username', 'PUT', { newUsername: 'brandnew', password: env.password }, headers)).status, 429);
    assert.equal((await send(env, 'auth/login', 'POST', { email: 'session@example.com', password: env.password })).status, 429);
    const after = row(env);
    assert.equal(after.username, before.username);
    assert.equal(after.email, before.email);
    assert.equal(after.password_hash, before.password_hash);
    assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS c FROM email_change_tokens').get().c, 0);
  } finally { env.sqlite.close(); }
});

test('simultaneous wrong confirmations are all counted, and misses share the counter with login', async () => {
  const env = await createAuthEnv();
  try {
    const headers = await signIn(env);
    await send(env, 'auth/login', 'POST', { email: 'session@example.com', password: 'wrong-password' });
    const results = await Promise.all(Array.from({ length: 7 }, (_, i) => attempts[i % 3](env, headers, i)));
    assert.equal(results.filter((r) => r.status === 429).length, 1);
    assert.ok(row(env).locked_until > Date.now());
  } finally { env.sqlite.close(); }
});

test('a correct confirmation still works, resets the counter, and malformed requests spend no budget', async () => {
  const env = await createAuthEnv();
  try {
    const headers = await signIn(env);
    for (let i = 0; i < 3; i += 1) await attempts[0](env, headers, i);
    assert.equal(row(env).failed_attempts, 3);
    // Validation failures come before the password check.
    assert.equal((await send(env, 'auth/username', 'PUT', { newUsername: 'has space', password: 'wrong-password' }, headers)).status, 400);
    assert.equal(row(env).failed_attempts, 3);
    const ok = await send(env, 'auth/username', 'PUT', { newUsername: 'renamed', password: env.password }, headers);
    assert.equal(ok.status, 200);
    assert.equal(row(env).username, 'renamed');
    assert.equal(row(env).failed_attempts, 0);
  } finally { env.sqlite.close(); }
});

test('the per-IP failure cap is shared between login and password confirmation', async () => {
  const env = await createAuthEnv();
  try {
    const headers = await signIn(env);
    const ip = { 'CF-Connecting-IP': '203.0.113.9' };
    env.sqlite.exec('DELETE FROM auth_events');
    const insert = env.sqlite.prepare("INSERT INTO auth_events (event_type, email, user_id, ip) VALUES (?, NULL, 1, '203.0.113.9')");
    for (let i = 0; i < 10; i += 1) insert.run('login_failed');
    for (let i = 0; i < 10; i += 1) insert.run('password_confirmation_failed');
    const response = await send(env, 'auth/username', 'PUT', { newUsername: 'renamed', password: env.password }, { ...headers, ...ip });
    assert.equal(response.status, 429);
    assert.equal(row(env).username, 'sessiontester');
  } finally { env.sqlite.close(); }
});
