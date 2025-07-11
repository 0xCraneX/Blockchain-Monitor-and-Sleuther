import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Simple Database Test', () => {
  let db;
  const testDbPath = './tests/simple-test.db';

  beforeEach(async () => {
    // Clean up any existing test database
    try {
      await fs.unlink(testDbPath);
    } catch (error) {
      // File doesn't exist, that's fine
    }
    
    // Create fresh database
    db = new Database(testDbPath);
    
    // Create simple test table
    db.exec(`
      CREATE TABLE test_accounts (
        id INTEGER PRIMARY KEY,
        address TEXT UNIQUE,
        name TEXT
      )
    `);
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }
    try {
      await fs.unlink(testDbPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should create and query database', () => {
    // Insert test data
    const stmt = db.prepare('INSERT INTO test_accounts (address, name) VALUES (?, ?)');
    stmt.run('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 'Alice');
    stmt.run('5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty', 'Bob');

    // Query data
    const query = db.prepare('SELECT * FROM test_accounts WHERE name = ?');
    const alice = query.get('Alice');
    
    expect(alice).toBeDefined();
    expect(alice.name).toBe('Alice');
    expect(alice.address).toBe('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
  });

  it('should handle search queries', () => {
    // Insert test data
    const stmt = db.prepare('INSERT INTO test_accounts (address, name) VALUES (?, ?)');
    stmt.run('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 'Alice');
    stmt.run('5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty', 'Bob');
    stmt.run('5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy', 'Charlie');

    // Search by partial address
    const searchStmt = db.prepare('SELECT * FROM test_accounts WHERE address LIKE ?');
    const results = searchStmt.all('%5Grw%');
    
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Alice');
  });

  it('should handle transactions', () => {
    const insertStmt = db.prepare('INSERT INTO test_accounts (address, name) VALUES (?, ?)');
    
    // Test successful transaction
    const transaction = db.transaction((accounts) => {
      for (const account of accounts) {
        insertStmt.run(account.address, account.name);
      }
    });
    
    transaction([
      { address: '5Test1', name: 'Test1' },
      { address: '5Test2', name: 'Test2' }
    ]);
    
    const count = db.prepare('SELECT COUNT(*) as count FROM test_accounts').get();
    expect(count.count).toBe(2);
  });

  it('should handle constraints', () => {
    const stmt = db.prepare('INSERT INTO test_accounts (address, name) VALUES (?, ?)');
    
    // Insert first record
    stmt.run('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 'Alice');
    
    // Try to insert duplicate - should throw
    expect(() => {
      stmt.run('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 'Alice2');
    }).toThrow();
  });
});