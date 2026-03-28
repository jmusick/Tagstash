import fs from 'fs';
import path from 'path';
import pool from './db.js';

const runMigrations = async () => {
  const migrationsDir = './server/migrations';
  
  if (!fs.existsSync(migrationsDir)) {
    console.log('No migrations directory found');
    return;
  }

  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  
  if (files.length === 0) {
    console.log('No migration files found');
    return;
  }

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    
    try {
      console.log(`Running migration: ${file}`);
      await pool.query(sql);
      console.log(`✓ Migration completed: ${file}`);
    } catch (error) {
      console.error(`✗ Migration failed: ${file}`);
      console.error(error.message);
      process.exit(1);
    }
  }

  console.log('✓ All migrations completed successfully');
  process.exit(0);
};

runMigrations().catch((error) => {
  console.error('Migration error:', error);
  process.exit(1);
});
