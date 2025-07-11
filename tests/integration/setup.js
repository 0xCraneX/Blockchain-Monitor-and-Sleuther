import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Creates an isolated test database for integration tests
 * Each test suite gets its own unique database to avoid conflicts
 */
export async function createIsolatedTestDatabase() {
  // Generate unique database path
  const dbPath = path.join('./tests', `integration-${uuidv4()}.db`);
  
  // Ensure parent directory exists
  const dir = path.dirname(dbPath);
  await fs.mkdir(dir, { recursive: true });
  
  // Create database with proper settings for test isolation
  const db = new Database(dbPath);
  
  // Configure SQLite for better test isolation
  db.pragma('journal_mode = DELETE'); // Avoid WAL mode conflicts
  db.pragma('synchronous = FULL'); // Ensure data integrity
  db.pragma('foreign_keys = ON'); // Enable foreign key constraints
  
  // Read and execute schema
  const schemaPath = path.join(__dirname, '../../src/database/schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');
  db.exec(schema);
  
  return { db, dbPath };
}

/**
 * Cleanup helper for integration test databases
 */
export async function cleanupTestDatabase(dbPath, db) {
  // Close database connection if open
  if (db && db.open) {
    try {
      db.close();
    } catch (error) {
      console.error('Error closing database:', error);
    }
  }
  
  // Remove database file and any associated files
  if (dbPath) {
    try {
      await fs.unlink(dbPath);
      // Also try to remove WAL and SHM files if they exist
      await fs.unlink(`${dbPath}-wal`).catch(() => {});
      await fs.unlink(`${dbPath}-shm`).catch(() => {});
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Creates a test Express app with proper middleware
 */
export function createTestApp() {
  const express = require('express');
  const app = express();
  
  // Add common middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  return app;
}

/**
 * Wait for all database operations to complete
 */
export async function waitForDatabase(db, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    
    const check = () => {
      try {
        // Try a simple query to ensure database is accessible
        db.prepare('SELECT 1').get();
        resolve();
      } catch (error) {
        if (Date.now() - start > timeout) {
          reject(new Error('Database timeout'));
        } else {
          setTimeout(check, 100);
        }
      }
    };
    
    check();
  });
}