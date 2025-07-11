# Database Testing Specification

## Overview

This specification defines the comprehensive approach for testing database operations in the Polkadot Analysis Tool, ensuring reliability, performance, and data integrity.

## Database Test Architecture

### Core Principles

1. **Test Isolation**: Each test uses a unique database instance
2. **Data Integrity**: All tests maintain referential integrity
3. **Performance Validation**: Benchmarks for realistic workloads
4. **Error Handling**: Comprehensive error scenario coverage
5. **Resource Management**: Proper cleanup and resource disposal

### Test Database Configuration

```javascript
// SQLite Configuration for Tests
{
  journal_mode: 'DELETE',     // Avoid WAL file conflicts
  foreign_keys: 'ON',         // Maintain referential integrity
  synchronous: 'NORMAL',      // Balance performance/reliability
  cache_size: 10000,          // Adequate cache for tests
  temp_store: 'MEMORY'        // Fast temporary storage
}
```

## Test Categories and Requirements

### 1. Unit Tests - Database Service Methods

#### Account Operations
```javascript
describe('Account Operations', () => {
  it('should create account with proper type conversion', () => {
    const account = {
      address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      identity_display: 'Alice',
      balance: '1000000000000',
      first_seen_block: 1000000
    };
    
    const result = dbService.createAccount(account);
    expect(result.changes).toBe(1);
    
    const retrieved = dbService.getAccount(account.address);
    expect(retrieved.identity_display).toBe('Alice');
  });
});
```

#### Transfer Operations
```javascript
describe('Transfer Operations', () => {
  it('should handle boolean success field correctly', () => {
    const transfer = {
      hash: '0x123456789',
      block_number: 1500000,
      from_address: 'existing_account_1',
      to_address: 'existing_account_2', 
      value: '1000000000000',
      success: true  // Boolean will be converted to 1
    };
    
    const result = dbService.createTransfer(transfer);
    expect(result.changes).toBe(1);
    
    const retrieved = db.prepare('SELECT success FROM transfers WHERE hash = ?')
                        .get(transfer.hash);
    expect(retrieved.success).toBe(1); // Stored as integer
  });
});
```

### 2. Integration Tests - API with Database

#### Search Functionality
```javascript
describe('Address Search Integration', () => {
  it('should search accounts with pattern matching', async () => {
    // Setup test data
    await setupTestAccounts([
      { address: '5GrwAlice...', identity_display: 'Alice' },
      { address: '5GrwBob...', identity_display: 'Bob' }
    ]);
    
    const response = await request(app)
      .get('/api/addresses/search?q=5Grw')
      .expect(200);
      
    expect(response.body.count).toBe(2);
    expect(response.body.results).toHaveLength(2);
  });
});
```

### 3. Performance Tests - Scalability Validation

#### Large Dataset Operations
```javascript
describe('Performance with Large Datasets', () => {
  it('should handle 1000 account insertions efficiently', () => {
    const accounts = generateTestAccounts(1000);
    
    const start = performance.now();
    
    // Use transaction for optimal performance
    const transaction = db.transaction(() => {
      accounts.forEach(account => {
        dbService.createAccount(account);
      });
    });
    transaction();
    
    const duration = performance.now() - start;
    
    // Realistic expectation for 1000 accounts
    expect(duration).toBeLessThan(10000); // 10 seconds
    
    // Verify data integrity
    const count = db.prepare('SELECT COUNT(*) as count FROM accounts').get();
    expect(count.count).toBe(1000);
  });
});
```

## Data Generation Strategies

### Test Account Factory

```javascript
export function generateTestAccounts(count = 100) {
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
```

### Transfer Factory with Referential Integrity

```javascript
export function generateTransfersForAccounts(accounts, count = 1000) {
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
```

## Database Test Utilities

### Test Database Helper

```javascript
export class DatabaseTestHelper {
  static async createIsolatedDatabase() {
    const uniqueId = randomUUID();
    const dbPath = path.join(TEST_DB_DIR, `test-${uniqueId}.db`);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    
    const db = new Database(dbPath);
    
    // Configure for testing
    db.pragma('journal_mode = DELETE');
    db.pragma('foreign_keys = ON'); 
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 10000');
    
    // Execute schema
    const schemaPath = path.join(__dirname, '../src/database/schema.sql');
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
      
      // Then insert transfers
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
          success: transfer.success ? 1 : 0  // Convert boolean
        };
        insertTransfer.run(transferData);
      });
    });
    
    transaction();
  }
}
```

### Data Validation Utilities

```javascript
export class DatabaseValidator {
  static validateAccount(account) {
    expect(account).toHaveProperty('address');
    expect(account).toHaveProperty('balance');
    expect(account.address).toMatch(/^5[1-9A-HJ-NP-Za-km-z]{47}$/);
    expect(BigInt(account.balance)).toBeGreaterThanOrEqual(0n);
  }
  
  static validateTransfer(transfer) {
    expect(transfer).toHaveProperty('hash');
    expect(transfer).toHaveProperty('from_address');
    expect(transfer).toHaveProperty('to_address');
    expect(transfer.hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(transfer.success).toBeOneOf([0, 1]); // Integer, not boolean
  }
  
  static validateForeignKeyIntegrity(db) {
    // Check that all transfers reference existing accounts
    const orphanedTransfers = db.prepare(`
      SELECT t.hash, t.from_address, t.to_address
      FROM transfers t
      LEFT JOIN accounts a1 ON t.from_address = a1.address
      LEFT JOIN accounts a2 ON t.to_address = a2.address
      WHERE a1.address IS NULL OR a2.address IS NULL
    `).all();
    
    expect(orphanedTransfers).toHaveLength(0);
  }
}
```

## Performance Benchmarks

### Baseline Performance Expectations

| Operation | Dataset Size | Target Time | Memory Limit |
|-----------|--------------|-------------|--------------|
| Account CRUD | 1,000 records | < 10s | < 50MB |
| Transfer CRUD | 10,000 records | < 30s | < 100MB |
| Search Operations | 1,000 accounts | < 2s | < 20MB |
| Relationship Queries | 100 connections | < 3s | < 30MB |
| Pattern Detection | 500 accounts | < 5s | < 40MB |

### Performance Test Implementation

```javascript
describe('Database Performance Benchmarks', () => {
  it('should meet account insertion performance targets', () => {
    const accounts = generateTestAccounts(1000);
    
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    DatabaseTestHelper.setupTestData(db, { accounts });
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;
    
    const duration = endTime - startTime;
    const memoryUsed = endMemory - startMemory;
    
    expect(duration).toBeLessThan(10000); // 10 seconds
    expect(memoryUsed).toBeLessThan(50 * 1024 * 1024); // 50MB
    
    console.log(`Performance: ${duration.toFixed(2)}ms, Memory: ${(memoryUsed / 1024 / 1024).toFixed(2)}MB`);
  });
});
```

## Error Handling Test Scenarios

### Database Constraint Violations

```javascript
describe('Error Handling', () => {
  it('should handle foreign key constraint violations', () => {
    const invalidTransfer = {
      hash: '0x123',
      from_address: 'non_existent_account',
      to_address: 'another_non_existent_account',
      value: '1000000000000'
    };
    
    expect(() => {
      dbService.createTransfer(invalidTransfer);
    }).toThrow(/FOREIGN KEY constraint failed/);
  });
  
  it('should handle duplicate key violations', () => {
    const account = generateTestAccounts(1)[0];
    
    dbService.createAccount(account);
    
    expect(() => {
      dbService.createAccount(account); // Same address
    }).toThrow(/UNIQUE constraint failed/);
  });
});
```

### Concurrent Access Scenarios

```javascript
describe('Concurrent Access', () => {
  it('should handle multiple simultaneous reads', async () => {
    const accounts = generateTestAccounts(100);
    DatabaseTestHelper.setupTestData(db, { accounts });
    
    const readOperations = Array.from({ length: 50 }, (_, i) => {
      const address = accounts[i % accounts.length].address;
      return () => dbService.getAccount(address);
    });
    
    const startTime = performance.now();
    
    const results = await Promise.all(
      readOperations.map(operation => 
        new Promise(resolve => {
          setTimeout(() => resolve(operation()), Math.random() * 10);
        })
      )
    );
    
    const duration = performance.now() - startTime;
    
    expect(results.every(result => result !== undefined)).toBe(true);
    expect(duration).toBeLessThan(2000); // 2 seconds
  });
});
```

## Test Execution Guidelines

### Pre-test Setup
1. Ensure `tests/temp/` directory exists and is writable
2. Clean up any existing test database files
3. Verify schema.sql is accessible and valid
4. Check that all test dependencies are installed

### During Test Execution
1. Monitor memory usage for large dataset tests
2. Log performance metrics for baseline comparison
3. Validate data integrity after bulk operations
4. Clean up resources immediately after each test

### Post-test Cleanup
1. Close all database connections
2. Delete temporary database files
3. Clear any cached data or connections
4. Report performance metrics and anomalies

This specification ensures comprehensive, reliable, and performant database testing for the Polkadot Analysis Tool.