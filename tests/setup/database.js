/**
 * Test Database Setup
 * 
 * Provides consistent database initialization for all tests
 */

import Database from 'better-sqlite3';
import { DatabaseService } from '../../src/services/DatabaseService.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create an in-memory test database with proper setup
 */
export async function createTestDatabase() {
  const db = new DatabaseService();
  
  // Use in-memory database for tests
  db.dbPath = ':memory:';
  
  // Override the initialize method to ensure REGEXP is registered
  const originalInitialize = db.initialize.bind(db);
  
  db.initialize = async function() {
    // Create in-memory database
    this.db = new Database(':memory:', {
      verbose: process.env.LOG_LEVEL === 'debug' ? console.log : null
    });

    // Enable foreign keys and WAL mode
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');

    // CRITICAL: Register REGEXP function for SQLite
    this.db.function('REGEXP', (pattern, text) => {
      if (!pattern || !text) {
        return 0;
      }
      try {
        const regex = new RegExp(pattern);
        return regex.test(String(text)) ? 1 : 0;
      } catch (error) {
        console.warn('Invalid regex pattern:', pattern, error.message);
        return 0;
      }
    });

    // Load schemas
    try {
      const schemaPath = join(__dirname, '../../src/database/schema.sql');
      const schema = await fs.readFile(schemaPath, 'utf8');
      this.db.exec(schema);

      // Try to load additional schemas
      const graphSchemaPath = join(__dirname, '../../src/database/graph-schema.sql');
      try {
        const graphSchema = await fs.readFile(graphSchemaPath, 'utf8');
        const statements = graphSchema.split(';').filter(s => s.trim());
        for (const statement of statements) {
          if (statement.trim()) {
            try {
              this.db.exec(`${statement};`);
            } catch (error) {
              if (!error.message.includes('duplicate column name')) {
                console.warn('Error executing graph schema statement:', error.message);
              }
            }
          }
        }
      } catch (error) {
        // Graph schema is optional
      }

      // Load relationship scoring schema
      const scoringSchemaPath = join(__dirname, '../../src/database/relationship_scoring.sql');
      try {
        const scoringSchema = await fs.readFile(scoringSchemaPath, 'utf8');
        // Remove IF NOT EXISTS from ALTER TABLE statements for SQLite compatibility
        const modifiedSchema = scoringSchema
          .replace(/ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS/g, 'ALTER TABLE $1 ADD COLUMN')
          .replace(/CREATE INDEX IF NOT EXISTS/g, 'CREATE INDEX');
          
        const statements = modifiedSchema.split(';').filter(s => s.trim());
        for (const statement of statements) {
          if (statement.trim()) {
            try {
              this.db.exec(`${statement};`);
            } catch (error) {
              // Ignore errors for duplicate columns, indexes, or tables
              if (!error.message.includes('duplicate column name') &&
                  !error.message.includes('already exists') &&
                  !error.message.includes('index') &&
                  !error.message.includes('table')) {
                console.warn('Error executing scoring schema statement:', error.message);
              }
            }
          }
        }
      } catch (error) {
        // Scoring schema is optional
        console.warn('Could not load scoring schema:', error.message);
      }
    } catch (error) {
      console.error('Failed to load schemas:', error);
      throw error;
    }

    this.isInitialized = true;
    this.connectionPool.activeConnections = 1;
    this.connectionPool.lastActivity = Date.now();
  };

  await db.initialize();
  return db;
}

/**
 * Seed test data into the database
 */
export async function seedTestData(db, data = {}) {
  const defaults = {
    accounts: [
      {
        address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        balance: '1000000000000',
        identity_display: 'Alice',
        risk_score: 0.1
      },
      {
        address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        balance: '500000000000',
        identity_display: 'Bob',
        risk_score: 0.2
      }
    ],
    transfers: [
      {
        hash: '0x123',
        block_number: 1000,
        timestamp: new Date('2024-01-01').toISOString(),
        from_address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        to_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        value: '100000000000',
        success: true
      }
    ]
  };

  const testData = { ...defaults, ...data };

  // Insert accounts
  const accountStmt = db.db.prepare(`
    INSERT INTO accounts (address, balance, identity_display, risk_score)
    VALUES (@address, @balance, @identity_display, @risk_score)
  `);

  for (const account of testData.accounts) {
    accountStmt.run(account);
  }

  // Insert transfers
  const transferStmt = db.db.prepare(`
    INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, success)
    VALUES (@hash, @block_number, @timestamp, @from_address, @to_address, @value, @success)
  `);

  for (const transfer of testData.transfers) {
    transferStmt.run(transfer);
  }

  return db;
}

/**
 * Clean up test database
 */
export async function cleanupTestDatabase(db) {
  if (db && db.db) {
    try {
      await db.close();
    } catch (error) {
      console.warn('Error closing test database:', error);
    }
  }
}