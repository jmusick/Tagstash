import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeBookmarks } from '../src/utils/bookmarkExport.js';

const bookmark = {
  title: '=HYPERLINK("https://example.com")', url: 'https://example.com/?a=1&b="2"',
  description: 'First line\n<script>alert("x")</script>',
  tags: [{ id: 1, name: 'research' }, { id: 2, name: 'work' }],
  created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-02T12:00:00Z',
  is_private: 1, is_favorite: 1, user_id: 123,
};

test('JSON preserves private bookmarks, tags, dates and flags without user identifiers', () => {
  const file = serializeBookmarks([bookmark], 'json');
  const record = JSON.parse(file.content).bookmarks[0];
  assert.deepEqual(record.tags, ['research', 'work']);
  assert.equal(record.is_private, true);
  assert.equal(record.is_favorite, true);
  assert.equal(record.description, bookmark.description);
  assert.equal(record.created_at, bookmark.created_at);
  assert.equal(record.user_id, undefined);
});

test('CSV escapes commas, quotes and multiline notes and neutralizes spreadsheet formulas', () => {
  const file = serializeBookmarks([bookmark], 'csv');
  assert.ok(file.content.startsWith('\uFEFFtitle,url,note,tags,'));
  assert.ok(file.content.includes('"\'=HYPERLINK(""https://example.com"")"'));
  assert.ok(file.content.includes('"research, work"'));
  assert.ok(file.content.includes('First line\n<script>alert(""x"")</script>'));
});

test('Netscape HTML escapes content and includes tag metadata without active unsafe links', () => {
  const file = serializeBookmarks([bookmark, { ...bookmark, url: 'javascript:alert(1)' }], 'html');
  assert.ok(file.content.includes('TAGS="research,work"'));
  assert.ok(file.content.includes('ADD_DATE="1790856000"'));
  assert.ok(file.content.includes('&lt;script&gt;'));
  assert.ok(file.content.includes('&amp;b=&quot;2&quot;'));
  assert.ok(!file.content.includes('javascript:'));
  assert.equal((file.content.match(/<DT><A /g) || []).length, 1);
});

test('empty libraries still produce valid exports', () => {
  assert.deepEqual(JSON.parse(serializeBookmarks([], 'json').content).bookmarks, []);
  assert.ok(serializeBookmarks([], 'csv').content.includes('title,url,note,tags'));
  assert.ok(serializeBookmarks([], 'html').content.includes('<DL><p>'));
});
