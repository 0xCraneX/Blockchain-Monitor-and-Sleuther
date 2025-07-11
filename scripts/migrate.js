#!/usr/bin/env node

/**
 * Database migration script for polkadot-analysis-tool
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

// Configuration
const config = {
  dbPath: process.env.DATABASE_PATH || join(projectRoot, 'data', 'analysis.db'),
  migrationsDir: join(projectRoot, 'migrations'),
  schemaFile: join(projectRoot, 'src', 'database', 'schema.sql')
};

async function createMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getExecutedMigrations(db) {
  const rows = db.prepare('SELECT name FROM migrations ORDER BY id').all();
  return new Set(rows.map(row => row.name));
}

async function executeMigration(db, migrationFile) {
  try {
    const content = await fs.readFile(migrationFile, 'utf8');
    console.log(`Executing migration: ${migrationFile}`);
    
    db.exec(content);
    
    const migrationName = migrationFile.split('/').pop().replace(/\.sql$/, '');
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migrationName);
    
    console.log(`✓ Migration ${migrationName} completed`);
  } catch (error) {
    console.error(`✗ Migration failed: ${error.message}`);
    throw error;
  }
}

async function runMigrations() {
  try {
    console.log('Starting database migrations...\n');
    
    // Ensure data directory exists
    await fs.mkdir(dirname(config.dbPath), { recursive: true });
    
    // Initialize database
    const db = new Database(config.dbPath);
    
    // Create migrations table
    await createMigrationsTable(db);
    
    // Get executed migrations
    const executedMigrations = await getExecutedMigrations(db);
    
    // Check if migrations directory exists
    try {
      await fs.access(config.migrationsDir);
    } catch {
      console.log('No migrations directory found. Creating from schema...');
      
      // Try to load schema file
      try {
        const schema = await fs.readFile(config.schemaFile, 'utf8');
        console.log('Executing schema.sql...');
        db.exec(schema);
        console.log('✓ Schema loaded successfully');
      } catch (error) {
        console.log('No schema file found. Database initialized with empty schema.');
      }
      
      db.close();
      return;
    }
    
    // Get migration files
    const files = await fs.readdir(config.migrationsDir);
    const migrationFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort()
      .map(f => join(config.migrationsDir, f));
    
    // Execute pending migrations
    let executedCount = 0;
    for (const file of migrationFiles) {
      const migrationName = file.split('/').pop().replace(/\.sql$/, '');
      
      if (!executedMigrations.has(migrationName)) {
        await executeMigration(db, file);
        executedCount++;
      } else {
        console.log(`Skipping already executed migration: ${migrationName}`);
      }
    }
    
    if (executedCount === 0) {
      console.log('No pending migrations found.');
    } else {
      console.log(`\n✓ Executed ${executedCount} migration(s) successfully`);
    }
    
    db.close();
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

async function rollbackMigration() {
  console.log('Rollback functionality not implemented yet.');
  console.log('To rollback, manually restore from backup or drop/recreate the database.');
}

// Main execution
const command = process.argv[2];

if (command === 'rollback') {
  rollbackMigration();
} else {
  runMigrations();
}