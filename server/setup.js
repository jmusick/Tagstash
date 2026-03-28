import pool from './db.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function setupDatabase() {
  console.log('🔧 Setting up database...');

  try {
    // Read the schema file
    const schemaPath = join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // Execute the entire schema as one transaction
    await pool.query(schemaSql);

    console.log('✓ Database schema created successfully');
    console.log('✓ Tables: users, bookmarks, tags, bookmark_tags');
    console.log('✓ Indexes and triggers created');
    console.log('\n✅ Database is ready! You can now start the server.');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up database:', error.message);
    console.error('\nMake sure:');
    console.error('1. PostgreSQL is running');
    console.error('2. The database "tagstash" exists (CREATE DATABASE tagstash;)');
    console.error('3. Your .env file has the correct database credentials');
    await pool.end();
    process.exit(1);
  }
}

setupDatabase();
