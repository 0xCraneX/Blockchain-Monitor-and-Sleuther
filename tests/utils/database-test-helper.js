import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DB_DIR = path.join(__dirname, '..', 'temp');

export class DatabaseTestHelper {
  static async createIsolatedDatabase() {
    const uniqueId = randomUUID();
    const dbPath = path.join(TEST_DB_DIR, `test-${uniqueId}.db`);
    
    // Ensure directory exists
    await fs.mkdir(TEST_DB_DIR, { recursive: true });
    
    const db = new Database(dbPath);
    
    // Configure for testing - avoid WAL mode to prevent file conflicts
    db.pragma('journal_mode = DELETE');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 10000');
    db.pragma('temp_store = MEMORY');
    
    // Execute schema
    const schemaPath = path.join(__dirname, '../../src/database/schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');
    db.exec(schema);
    
    return { db, dbPath };
  }
  
  static async cleanupDatabase(db, dbPath) {
    if (db) {
      try {
        db.close();
      } catch (error) {
        console.warn('Database close error:', error.message);
      }
    }
    
    if (dbPath) {
      // Wait for file handles to release
      await new Promise(resolve => setTimeout(resolve, 100));
      
      try {
        await fs.unlink(dbPath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn('Database cleanup error:', error.message);
        }
      }
    }
  }
  
  static setupTestData(db, { accounts = [], transfers = [] } = {}) {
    const transaction = db.transaction(() => {
      // Insert accounts first (for FK constraints)
      if (accounts.length > 0) {
        const insertAccount = db.prepare(`
          INSERT INTO accounts (
            address, identity_display, balance, 
            total_transfers_in, total_transfers_out,
            first_seen_block, last_seen_block
          ) VALUES (
            @address, @identity_display, @balance,
            @total_transfers_in, @total_transfers_out,
            @first_seen_block, @last_seen_block
          )
        `);
        
        accounts.forEach(account => {
          insertAccount.run(account);
        });
      }
      
      // Then insert transfers
      if (transfers.length > 0) {
        const insertTransfer = db.prepare(`
          INSERT INTO transfers (
            hash, block_number, timestamp, from_address, to_address,
            value, fee, success, method, section
          ) VALUES (
            @hash, @block_number, @timestamp, @from_address, @to_address,
            @value, @fee, @success, @method, @section
          )
        `);
        
        transfers.forEach(transfer => {
          const transferData = {
            ...transfer,
            success: transfer.success ? 1 : 0  // Convert boolean to integer
          };
          insertTransfer.run(transferData);
        });
      }
    });
    
    transaction();
  }
  
  static generateTestAccounts(count = 100) {
    return Array.from({ length: count }, (_, i) => ({
      address: `5Test${i.toString().padStart(44, '0')}`,
      identity_display: `TestUser${i}`,
      balance: (Math.random() * 10000000000000).toString(),
      total_transfers_in: Math.floor(Math.random() * 50),
      total_transfers_out: Math.floor(Math.random() * 50),
      first_seen_block: 1000000 + i,
      last_seen_block: 2000000 + i
    }));
  }
  
  static generateTransfersForAccounts(accounts, count = 1000) {
    const addressList = accounts.map(a => a.address);
    
    return Array.from({ length: count }, (_, i) => {
      const fromIndex = i % addressList.length;
      const toIndex = (i + 1) % addressList.length;
      
      return {
        hash: `0x${i.toString(16).padStart(64, '0')}`,
        block_number: 1500000 + i,
        timestamp: new Date(Date.now() - i * 12000).toISOString(),
        from_address: addressList[fromIndex],
        to_address: addressList[toIndex],
        value: (Math.random() * 1000000000000).toString(),
        fee: '125000000',
        success: Math.random() > 0.05, // 95% success rate
        method: 'transfer',
        section: 'balances'
      };
    });
  }
}

// Clean up temp directory on process exit
process.on('exit', async () => {
  try {
    await fs.rmdir(TEST_DB_DIR, { recursive: true });
  } catch (error) {
    // Ignore cleanup errors on exit
  }
});