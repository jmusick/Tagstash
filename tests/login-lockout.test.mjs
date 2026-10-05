import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';
import { createAuthEnv } from './helpers/auth-env.mjs';

const webHeaders = { Origin: 'https://tagsta.sh', 'X-Tagstash-Client': 'web' };
const login = (env, password) =>
  onRequest({ env, request: new Request('https://tagsta.sh/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...webHeaders },
    body: JSON.stringify({ email: 'session@example.com', password }),
  }) });
const row = (env) => env.sqlite.prepare('SELECT failed_attempts, locked_until FROM users WHERE id = 1').get();

test('eight simultaneous wrong passwords count every attempt and lock the account', async () => {
  const env = await createAuthEnv();
  try {
    const statuses = (await Promise.all(Array.from({ length: 8 }, () => login(env, 'wrong-password')))).map((r) => r.status);
    assert.equal(statuses.filter((s) => s === 429).length, 1, 'exactly the 8th miss reports the lock');
    assert.equal(statuses.filter((s) => s === 401).length, 7);
    assert.ok(row(env).locked_until > Date.now());
    assert.equal(row(env).failed_attempts, 0);
    assert.equal((await login(env, env.password)).status, 429);
  } finally { env.sqlite.close(); }
});

test('concurrent misses match sequential misses, and extra in-flight misses cannot shorten or reset a lock', async () => {
  const env = await createAuthEnv();
  try {
    for (let i = 0; i < 3; i += 1) await login(env, 'wrong-password');
    assert.equal(row(env).failed_attempts, 3);
    await Promise.all(Array.from({ length: 5 }, () => login(env, 'wrong-password')));
    const locked = row(env);
    assert.ok(locked.locked_until > Date.now());
    await Promise.all(Array.from({ length: 6 }, () => login(env, 'wrong-password')));
    assert.deepEqual({ ...row(env) }, { ...locked });
  } finally { env.sqlite.close(); }
});

test('a correct password racing the locking misses is refused; success after expiry clears the counter', async () => {
  const env = await createAuthEnv();
  try {
    const results = await Promise.all([
      ...Array.from({ length: 8 }, () => login(env, 'wrong-password')),
      login(env, env.password),
    ]);
    // The correct guess finishes bcrypt alongside the misses; it may only succeed if the lock was not yet applied.
    const lockedAfter = row(env).locked_until > Date.now();
    assert.ok(lockedAfter);
    if (results[8].status === 200) assert.ok(results[8].headers.get('Set-Cookie'));
    assert.equal((await login(env, env.password)).status, 429);

    env.sqlite.exec('UPDATE users SET locked_until = 1');
    assert.equal((await login(env, 'wrong-password')).status, 401);
    assert.equal(row(env).failed_attempts, 1, 'an expired lock restarts the count at one');
    assert.equal((await login(env, env.password)).status, 200);
    assert.equal(row(env).failed_attempts, 0);
  } finally { env.sqlite.close(); }
});
