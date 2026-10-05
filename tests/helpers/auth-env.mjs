import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import bcrypt from 'bcryptjs';

// Run the real queries and migrations against isolated in-memory SQLite, with D1's API shape.
export async function createAuthEnv({ emailTokenHashes = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('../../d1/migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter((name) => name.endsWith('.sql') && (emailTokenHashes || name !== '0013_email_token_hashes.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  const password = 'session-test-password';
  sqlite.prepare(`INSERT INTO users (username, email, password_hash, email_verified)
    VALUES (?, ?, ?, 1)`).run('sessiontester', 'session@example.com', await bcrypt.hash(password, 4));
  const DB = {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return sqlite.prepare(sql).get(...args) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() {
          const result = sqlite.prepare(sql).run(...args);
          return { success: true, meta: { changes: result.changes, last_row_id: result.lastInsertRowid } };
        },
      };
    },
    // D1 batches run in order inside one transaction; mirror that so atomicity is really tested.
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { DB, sqlite, password, JWT_SECRET: 'isolated-test-secret-never-used-in-production', APP_URL: 'https://tagsta.sh' };
}
