import { beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test database path
export const TEST_DB_PATH = './tests/test.db';

// Skip global setup for integration tests to avoid conflicts
const isIntegrationTest = process.env.VITEST_POOL_ID && 
  (process.cwd().includes('integration') || process.argv.some(arg => arg.includes('integration')));

if (!isIntegrationTest) {
  // Create test database before all tests
  beforeAll(async () => {
    // Ensure test directory exists
    await fs.mkdir('./tests', { recursive: true });
  });

  // Clean up after each test
  beforeEach(async () => {
    // Remove existing test database if it exists
    try {
      await fs.unlink(TEST_DB_PATH);
    } catch (error) {
      // File doesn't exist, that's fine
    }
  });
}

// Clean up after all tests
if (!isIntegrationTest) {
  afterAll(async () => {
    // Remove test database
    try {
      await fs.unlink(TEST_DB_PATH);
    } catch (error) {
      // Ignore errors
    }
  });
}

// Helper to create a fresh test database
export async function createTestDatabase(customPath = null) {
  const dbPath = customPath || TEST_DB_PATH;
  
  // Ensure parent directory exists
  const dir = path.dirname(dbPath);
  await fs.mkdir(dir, { recursive: true });
  
  // Remove existing database file to ensure fresh start
  try {
    await fs.unlink(dbPath);
    await fs.unlink(`${dbPath}-wal`).catch(() => {});
    await fs.unlink(`${dbPath}-shm`).catch(() => {});
  } catch (error) {
    // Ignore if files don't exist
  }
  
  const db = new Database(dbPath);
  
  // Configure for better test isolation
  db.pragma('journal_mode = DELETE'); // Avoid WAL mode conflicts in tests
  db.pragma('synchronous = FULL'); // Ensure data integrity
  
  // Register custom REGEXP function for SQLite
  db.function('REGEXP', (pattern, text) => {
    if (!pattern || !text) return 0;
    try {
      const regex = new RegExp(pattern);
      return regex.test(String(text)) ? 1 : 0;
    } catch (error) {
      console.warn('Invalid regex pattern:', pattern);
      return 0;
    }
  });
  
  // Read and execute main schema
  const schemaPath = path.join(__dirname, '../src/database/schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');
  db.exec(schema);
  
  // Read and execute graph schema
  const graphSchemaPath = path.join(__dirname, '../src/database/graph-schema.sql');
  try {
    const graphSchema = await fs.readFile(graphSchemaPath, 'utf8');
    // Execute statements one by one to handle ALTER TABLE gracefully
    const statements = graphSchema.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          db.exec(statement + ';');
        } catch (error) {
          // Ignore errors for ALTER TABLE if column already exists
          if (!error.message.includes('duplicate column name')) {
            console.warn('Error executing graph schema statement:', error.message);
          }
        }
      }
    }
  } catch (error) {
    console.warn('Graph schema not found or error loading:', error.message);
  }
  
  return db;
}

// Helper to seed test data
export function seedTestData(db) {
  const testAccounts = [
    {
      address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      identity_display: 'Alice',
      balance: '1000000000000',
      total_transfers_in: 5,
      total_transfers_out: 3,
      volume_in: '5000000000000',
      volume_out: '3000000000000',
      first_seen_block: 1000000,
      last_seen_block: 2000000
    },
    {
      address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      identity_display: 'Bob',
      balance: '500000000000',
      total_transfers_in: 2,
      total_transfers_out: 4,
      volume_in: '2000000000000',
      volume_out: '4000000000000',
      first_seen_block: 1500000,
      last_seen_block: 2000000
    },
    {
      address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
      identity_display: 'Charlie',
      balance: '2000000000000',
      total_transfers_in: 10,
      total_transfers_out: 8,
      volume_in: '10000000000000',
      volume_out: '8000000000000',
      first_seen_block: 800000,
      last_seen_block: 2100000
    }
  ];

  const insertAccount = db.prepare(`
    INSERT INTO accounts (
      address, identity_display, balance, total_transfers_in, 
      total_transfers_out, volume_in, volume_out, first_seen_block, last_seen_block
    ) VALUES (
      @address, @identity_display, @balance, @total_transfers_in,
      @total_transfers_out, @volume_in, @volume_out, @first_seen_block, @last_seen_block
    )
  `);

  for (const account of testAccounts) {
    insertAccount.run(account);
  }

  // Add test transfers
  const testTransfers = [
    {
      hash: '0x123456789',
      block_number: 1500000,
      timestamp: '2023-01-15T10:00:00Z',
      from_address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      to_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      value: '1000000000000',
      fee: '125000000',
      success: true,
      method: 'transfer',
      section: 'balances'
    },
    {
      hash: '0x987654321',
      block_number: 1600000,
      timestamp: '2023-02-20T14:30:00Z',
      from_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
      to_address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
      value: '500000000000',
      fee: '125000000',
      success: true,
      method: 'transferKeepAlive',
      section: 'balances'
    }
  ];

  const insertTransfer = db.prepare(`
    INSERT INTO transfers (
      hash, block_number, timestamp, from_address, to_address,
      value, fee, success, method, section
    ) VALUES (
      @hash, @block_number, @timestamp, @from_address, @to_address,
      @value, @fee, @success, @method, @section
    )
  `);

  for (const transfer of testTransfers) {
    // Convert boolean to integer for SQLite compatibility
    const transferData = {
      ...transfer,
      success: transfer.success ? 1 : 0
    };
    insertTransfer.run(transferData);
  }

  return { accounts: testAccounts, transfers: testTransfers };
}

// Mock blockchain service
export class MockBlockchainService {
  constructor() {
    this.connected = false;
    this.mockData = new Map();
  }

  async connect() {
    this.connected = true;
    return Promise.resolve();
  }

  async disconnect() {
    this.connected = false;
    return Promise.resolve();
  }

  async getAccount(address) {
    return this.mockData.get(address) || {
      address,
      balance: '0',
      nonce: 0,
      identity: null
    };
  }

  setMockAccount(address, data) {
    this.mockData.set(address, data);
  }

  async getCurrentBlock() {
    return 2500000;
  }

  async getFinalizedBlock() {
    return 2499000;
  }
}

// Test utilities
export const testUtils = {
  createTestDatabase,
  seedTestData,
  MockBlockchainService,
  TEST_DB_PATH
};