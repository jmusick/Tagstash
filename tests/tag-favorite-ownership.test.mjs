import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { onRequest } from '../functions/api/[[path]].js';
import { createAuthEnv } from './helpers/auth-env.mjs';

const webHeaders = { Origin: 'https://tagsta.sh', 'X-Tagstash-Client': 'web', 'Content-Type': 'application/json' };
const call = (env, path, headers) =>
  onRequest({ env, request: new Request(`https://tagsta.sh/api/${path}`, { method: 'POST', headers: { ...webHeaders, ...headers }, body: '{}' }) });

async function setup() {
  const env = await createAuthEnv();
  const { sqlite } = env;
  sqlite.prepare(`INSERT INTO users (id, username, email, password_hash, email_verified) VALUES (2, 'other', 'other@example.com', ?, 1)`)
    .run(await bcrypt.hash('other-password-123', 4));
  const bookmark = (id, userId) => sqlite.prepare(`INSERT INTO bookmarks (id, user_id, url, title) VALUES (?, ?, ?, ?)`).run(id, userId, `https://e.com/${id}`, `b${id}`);
  const tag = (id, name) => sqlite.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(id, name);
  const link = (b, t) => sqlite.prepare('INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)').run(b, t);
  bookmark(1, 1); bookmark(2, 2);
  tag(10, 'mine'); tag(11, 'secret-foreign'); tag(12, 'shared'); tag(13, 'orphan');
  link(1, 10); link(2, 11); link(1, 12); link(2, 12);
  const login = await onRequest({ env, request: new Request('https://tagsta.sh/api/auth/login', {
    method: 'POST', headers: webHeaders, body: JSON.stringify({ email: 'session@example.com', password: env.password }) }) });
  assert.equal(login.status, 200);
  return { env, headers: { Cookie: login.headers.get('Set-Cookie').split(';')[0] } };
}
const favorites = (env) => env.sqlite.prepare('SELECT tag_id FROM favorite_tags WHERE user_id = 1').all().map((r) => r.tag_id);

test('favoriting a foreign or orphan tag returns 404, leaks no name and writes nothing', async () => {
  const { env, headers } = await setup();
  try {
    for (const id of [11, 13, 999]) {
      const response = await call(env, `bookmarks/tags/${id}/favorite`, headers);
      assert.equal(response.status, 404);
      assert.ok(!JSON.stringify(await response.json()).includes('secret-foreign'));
    }
    assert.deepEqual(favorites(env), []);
  } finally { env.sqlite.close(); }
});

test('own and shared tags can be favorited and unfavorited', async () => {
  const { env, headers } = await setup();
  try {
    for (const id of [10, 12]) assert.equal((await call(env, `bookmarks/tags/${id}/favorite`, headers)).status, 200);
    assert.deepEqual(favorites(env).sort(), [10, 12]);
    assert.equal((await call(env, 'bookmarks/tags/12/favorite', headers)).status, 200);
    assert.deepEqual(favorites(env), [10]);
  } finally { env.sqlite.close(); }
});

test('a stale favorite on a tag no longer used can still be removed', async () => {
  const { env, headers } = await setup();
  try {
    env.sqlite.prepare('INSERT INTO favorite_tags (user_id, tag_id) VALUES (1, 13)').run();
    assert.equal((await call(env, 'bookmarks/tags/13/favorite', headers)).status, 200);
    assert.deepEqual(favorites(env), []);
  } finally { env.sqlite.close(); }
});
