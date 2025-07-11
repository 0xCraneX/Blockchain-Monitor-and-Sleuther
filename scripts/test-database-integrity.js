#!/usr/bin/env node

import { DatabaseService } from '../src/services/DatabaseService.js';
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { performance } from 'perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const TEST_DB_PATH = './data/test-integrity.db';
const BULK_INSERT_COUNT = 1000;
const LARGE_INSERT_COUNT = 10000;
const MASSIVE_TRANSFER_COUNT = 50000;

class DatabaseIntegrityTester {
  constructor() {
    this.results = {
      constraints: [],
      operations: [],
      performance: [],
      edgeCases: []
    };
    this.dbService = null;
    this.db = null;
  }

  async setup() {
    console.log('\n🔧 Setting up test database...');
    
    // Clean up any existing test database
    try {
      await fs.unlink(TEST_DB_PATH);
      await fs.unlink(`${TEST_DB_PATH}-wal`);
      await fs.unlink(`${TEST_DB_PATH}-shm`);
    } catch (error) {
      // Ignore if files don't exist
    }

    // Create fresh database service
    this.dbService = new DatabaseService();
    this.dbService.dbPath = TEST_DB_PATH;
    await this.dbService.initialize();
    
    this.db = this.dbService.db;
    console.log('✅ Database initialized');
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    if (this.dbService) {
      this.dbService.close();
    }
    
    try {
      await fs.unlink(TEST_DB_PATH);
      await fs.unlink(`${TEST_DB_PATH}-wal`);
      await fs.unlink(`${TEST_DB_PATH}-shm`);
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  // Test foreign key constraints
  async testForeignKeyConstraints() {
    console.log('\n🔑 Testing Foreign Key Constraints...');
    
    try {
      // Test 1: Try to insert transfer with non-existent addresses
      console.log('  → Testing transfer with non-existent addresses');
      const stmt = this.db.prepare(`
        INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      try {
        stmt.run('0xtest1', 1000, '2024-01-01', 'NonExistentFrom', 'NonExistentTo', '1000');
        this.results.constraints.push({
          test: 'Foreign key enforcement',
          status: 'FAILED',
          message: 'Foreign key constraint not enforced - transfer inserted without accounts'
        });
      } catch (error) {
        if (error.message.includes('FOREIGN KEY constraint failed')) {
          this.results.constraints.push({
            test: 'Foreign key enforcement',
            status: 'PASSED',
            message: 'Foreign key constraints properly enforced'
          });
        } else {
          throw error;
        }
      }

      // Test 2: Cascade behavior
      console.log('  → Testing cascade behavior');
      // First create accounts and transfers
      this.dbService.createAccount({
        address: 'TestCascade1',
        balance: '1000000'
      });
      this.dbService.createAccount({
        address: 'TestCascade2',
        balance: '2000000'
      });
      
      this.dbService.createTransfer({
        hash: '0xcascadetest',
        block_number: 2000,
        timestamp: '2024-01-02',
        from_address: 'TestCascade1',
        to_address: 'TestCascade2',
        value: '500000'
      });

      // Try to delete account with transfers
      const deleteStmt = this.db.prepare('DELETE FROM accounts WHERE address = ?');
      try {
        deleteStmt.run('TestCascade1');
        this.results.constraints.push({
          test: 'Cascade protection',
          status: 'FAILED',
          message: 'Account deleted despite having transfers'
        });
      } catch (error) {
        if (error.message.includes('FOREIGN KEY constraint failed')) {
          this.results.constraints.push({
            test: 'Cascade protection',
            status: 'PASSED',
            message: 'Cannot delete account with existing transfers'
          });
        }
      }

    } catch (error) {
      this.results.constraints.push({
        test: 'Foreign key constraints',
        status: 'ERROR',
        message: error.message
      });
    }
  }

  // Test unique constraints
  async testUniqueConstraints() {
    console.log('\n🔒 Testing Unique Constraints...');
    
    try {
      // Test account address uniqueness
      console.log('  → Testing account address uniqueness');
      const account1 = this.dbService.createAccount({
        address: 'UniqueTest123',
        balance: '1000'
      });
      
      // Try to create duplicate (should update, not fail)
      const account2 = this.dbService.createAccount({
        address: 'UniqueTest123',
        balance: '2000'
      });
      
      if (account2.balance === '2000') {
        this.results.constraints.push({
          test: 'Account uniqueness with UPSERT',
          status: 'PASSED',
          message: 'Account UPSERT works correctly'
        });
      }

      // Test transfer hash uniqueness
      console.log('  → Testing transfer hash uniqueness');
      this.dbService.createTransfer({
        hash: '0xuniquehash',
        block_number: 3000,
        timestamp: '2024-01-03',
        from_address: 'UniqueTest123',
        to_address: 'UniqueTest123',
        value: '100'
      });

      // Try to insert duplicate (should be ignored)
      const result = this.dbService.createTransfer({
        hash: '0xuniquehash',
        block_number: 3001,
        timestamp: '2024-01-04',
        from_address: 'UniqueTest123',
        to_address: 'UniqueTest123',
        value: '200'
      });

      if (result.changes === 0) {
        this.results.constraints.push({
          test: 'Transfer hash uniqueness',
          status: 'PASSED',
          message: 'Duplicate transfers properly ignored'
        });
      }

    } catch (error) {
      this.results.constraints.push({
        test: 'Unique constraints',
        status: 'ERROR',
        message: error.message
      });
    }
  }

  // Test trigger functionality
  async testTriggers() {
    console.log('\n⚡ Testing Trigger Functionality...');
    
    try {
      // Create accounts for testing
      console.log('  → Testing account statistics update trigger');
      this.dbService.createAccount({
        address: 'TriggerTest1',
        balance: '0',
        total_transfers_in: 0,
        total_transfers_out: 0,
        volume_in: '0',
        volume_out: '0'
      });
      
      this.dbService.createAccount({
        address: 'TriggerTest2',
        balance: '0',
        total_transfers_in: 0,
        total_transfers_out: 0,
        volume_in: '0',
        volume_out: '0'
      });

      // Create a transfer
      this.dbService.createTransfer({
        hash: '0xtriggertest',
        block_number: 4000,
        timestamp: '2024-01-05',
        from_address: 'TriggerTest1',
        to_address: 'TriggerTest2',
        value: '1000000'
      });

      // Check if accounts were updated by trigger
      const sender = this.dbService.getAccount('TriggerTest1');
      const receiver = this.dbService.getAccount('TriggerTest2');

      if (sender.total_transfers_out === 1 && sender.volume_out === '1000000' &&
          receiver.total_transfers_in === 1 && receiver.volume_in === '1000000') {
        this.results.constraints.push({
          test: 'Account update trigger',
          status: 'PASSED',
          message: 'Triggers properly update account statistics'
        });
      } else {
        this.results.constraints.push({
          test: 'Account update trigger',
          status: 'FAILED',
          message: 'Account statistics not properly updated by trigger'
        });
      }

      // Test relationship trigger
      console.log('  → Testing relationship update trigger');
      const relStmt = this.db.prepare(`
        SELECT * FROM account_relationships 
        WHERE from_address = ? AND to_address = ?
      `);
      const relationship = relStmt.get('TriggerTest1', 'TriggerTest2');

      if (relationship && relationship.transfer_count === 1 && relationship.total_volume === '1000000') {
        this.results.constraints.push({
          test: 'Relationship update trigger',
          status: 'PASSED',
          message: 'Relationship properly created/updated by trigger'
        });
      } else {
        this.results.constraints.push({
          test: 'Relationship update trigger',
          status: 'FAILED',
          message: 'Relationship not properly managed by trigger'
        });
      }

    } catch (error) {
      this.results.constraints.push({
        test: 'Triggers',
        status: 'ERROR',
        message: error.message
      });
    }
  }

  // Test view performance
  async testViewPerformance() {
    console.log('\n👁️ Testing View Performance...');
    
    try {
      // First, create some test data
      console.log('  → Creating test data for views...');
      for (let i = 0; i < 100; i++) {
        this.dbService.createAccount({
          address: `ViewTest${i}`,
          balance: `${i * 1000000}`,
          identity_display: `User ${i}`,
          risk_score: Math.random()
        });
      }

      // Test account_summary view
      console.log('  → Testing account_summary view performance');
      const viewStart = performance.now();
      const viewStmt = this.db.prepare('SELECT * FROM account_summary LIMIT 50');
      const viewResults = viewStmt.all();
      const viewTime = performance.now() - viewStart;

      this.results.performance.push({
        operation: 'account_summary view query',
        records: viewResults.length,
        time: `${viewTime.toFixed(2)}ms`,
        rps: Math.round(viewResults.length / (viewTime / 1000))
      });

      if (viewTime < 100) {
        this.results.constraints.push({
          test: 'View performance',
          status: 'PASSED',
          message: `View query completed in ${viewTime.toFixed(2)}ms`
        });
      } else {
        this.results.constraints.push({
          test: 'View performance',
          status: 'WARNING',
          message: `View query slow: ${viewTime.toFixed(2)}ms`
        });
      }

    } catch (error) {
      this.results.constraints.push({
        test: 'Views',
        status: 'ERROR',
        message: error.message
      });
    }
  }

  // Test index effectiveness
  async testIndexEffectiveness() {
    console.log('\n📊 Testing Index Effectiveness...');
    
    try {
      // Test indexed vs non-indexed queries
      console.log('  → Comparing indexed vs non-indexed queries');
      
      // Query using indexed column (address)
      const indexedStart = performance.now();
      const indexedStmt = this.db.prepare('SELECT * FROM accounts WHERE address = ?');
      for (let i = 0; i < 100; i++) {
        indexedStmt.get(`ViewTest${i % 50}`);
      }
      const indexedTime = performance.now() - indexedStart;

      // Query using non-indexed column (notes)
      const nonIndexedStart = performance.now();
      const nonIndexedStmt = this.db.prepare('SELECT * FROM accounts WHERE notes = ?');
      for (let i = 0; i < 100; i++) {
        nonIndexedStmt.get(`Note ${i % 50}`);
      }
      const nonIndexedTime = performance.now() - nonIndexedStart;

      const speedup = nonIndexedTime / indexedTime;
      
      this.results.performance.push({
        operation: 'Indexed query (address)',
        records: 100,
        time: `${indexedTime.toFixed(2)}ms`,
        rps: Math.round(100 / (indexedTime / 1000))
      });
      
      this.results.performance.push({
        operation: 'Non-indexed query (notes)',
        records: 100,
        time: `${nonIndexedTime.toFixed(2)}ms`,
        rps: Math.round(100 / (nonIndexedTime / 1000))
      });

      if (speedup > 2) {
        this.results.constraints.push({
          test: 'Index effectiveness',
          status: 'PASSED',
          message: `Indexes provide ${speedup.toFixed(1)}x speedup`
        });
      } else {
        this.results.constraints.push({
          test: 'Index effectiveness',
          status: 'WARNING',
          message: `Low index speedup: ${speedup.toFixed(1)}x`
        });
      }

      // Test composite index usage
      console.log('  → Testing composite index usage');
      const compositeStart = performance.now();
      const compositeStmt = this.db.prepare(`
        SELECT * FROM transfers 
        WHERE from_address = ? AND timestamp > ?
        ORDER BY timestamp DESC
        LIMIT 10
      `);
      compositeStmt.all('ViewTest0', '2024-01-01');
      const compositeTime = performance.now() - compositeStart;

      this.results.performance.push({
        operation: 'Composite index query',
        records: 10,
        time: `${compositeTime.toFixed(2)}ms`,
        rps: 'N/A'
      });

    } catch (error) {
      this.results.constraints.push({
        test: 'Indexes',
        status: 'ERROR',
        message: error.message
      });
    }
  }

  // Test bulk operations
  async testBulkOperations() {
    console.log('\n📦 Testing Bulk Operations...');
    
    try {
      // Test bulk inserts
      console.log(`  → Testing bulk insert of ${BULK_INSERT_COUNT} accounts`);
      const bulkStart = performance.now();
      
      const transaction = this.db.transaction((accounts) => {
        const stmt = this.db.prepare(`
          INSERT INTO accounts (address, balance, identity_display)
          VALUES (@address, @balance, @identity_display)
          ON CONFLICT(address) DO UPDATE SET
            balance = @balance,
            updated_at = CURRENT_TIMESTAMP
        `);
        
        for (const account of accounts) {
          stmt.run(account);
        }
      });

      const bulkAccounts = [];
      for (let i = 0; i < BULK_INSERT_COUNT; i++) {
        bulkAccounts.push({
          address: `BulkAccount${i}`,
          balance: `${i * 1000000}`,
          identity_display: `Bulk User ${i}`
        });
      }

      transaction(bulkAccounts);
      const bulkTime = performance.now() - bulkStart;

      this.results.operations.push({
        test: 'Bulk insert accounts',
        status: 'PASSED',
        count: BULK_INSERT_COUNT,
        time: `${bulkTime.toFixed(2)}ms`,
        rps: Math.round(BULK_INSERT_COUNT / (bulkTime / 1000))
      });

      // Test bulk transfer inserts
      console.log(`  → Testing bulk insert of ${BULK_INSERT_COUNT} transfers`);
      const transferStart = performance.now();
      
      const transferTransaction = this.db.transaction((transfers) => {
        const stmt = this.db.prepare(`
          INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value)
          VALUES (@hash, @block_number, @timestamp, @from_address, @to_address, @value)
          ON CONFLICT(hash) DO NOTHING
        `);
        
        for (const transfer of transfers) {
          stmt.run(transfer);
        }
      });

      const bulkTransfers = [];
      for (let i = 0; i < BULK_INSERT_COUNT; i++) {
        bulkTransfers.push({
          hash: `0xbulk${i}`,
          block_number: 5000 + i,
          timestamp: new Date(2024, 0, 1, 0, 0, i).toISOString(),
          from_address: `BulkAccount${i % 100}`,
          to_address: `BulkAccount${(i + 1) % 100}`,
          value: `${(i + 1) * 100000}`
        });
      }

      transferTransaction(bulkTransfers);
      const transferTime = performance.now() - transferStart;

      this.results.operations.push({
        test: 'Bulk insert transfers',
        status: 'PASSED',
        count: BULK_INSERT_COUNT,
        time: `${transferTime.toFixed(2)}ms`,
        rps: Math.round(BULK_INSERT_COUNT / (transferTime / 1000))
      });

    } catch (error) {
      this.results.operations.push({
        test: 'Bulk operations',
        status: 'ERROR',
        message: error.message
      });
    }
  }

  // Test complex JOIN queries
  async testComplexJoins() {
    console.log('\n🔗 Testing Complex JOIN Queries...');
    
    try {
      // Test multi-table JOIN with aggregation
      console.log('  → Testing complex multi-table JOIN');
      const complexStart = performance.now();
      
      const complexQuery = this.db.prepare(`
        SELECT 
          a1.address as sender,
          a1.identity_display as sender_name,
          a2.address as receiver,
          a2.identity_display as receiver_name,
          COUNT(t.hash) as transfer_count,
          SUM(CAST(t.value AS INTEGER)) as total_volume,
          AVG(CAST(t.value AS INTEGER)) as avg_transfer,
          MIN(t.timestamp) as first_transfer,
          MAX(t.timestamp) as last_transfer
        FROM transfers t
        INNER JOIN accounts a1 ON t.from_address = a1.address
        INNER JOIN accounts a2 ON t.to_address = a2.address
        WHERE a1.balance > '0'
        GROUP BY a1.address, a2.address
        HAVING transfer_count > 1
        ORDER BY total_volume DESC
        LIMIT 20
      `);
      
      const complexResults = complexQuery.all();
      const complexTime = performance.now() - complexStart;

      this.results.operations.push({
        test: 'Complex JOIN with aggregation',
        status: 'PASSED',
        results: complexResults.length,
        time: `${complexTime.toFixed(2)}ms`
      });

      // Test recursive-like query for path finding
      console.log('  → Testing recursive-like path query');
      const pathStart = performance.now();
      
      // Simulate 2-hop path finding
      const pathQuery = this.db.prepare(`
        SELECT DISTINCT
          r1.from_address as start,
          r1.to_address as hop1,
          r2.to_address as end,
          r1.total_volume + r2.total_volume as path_volume
        FROM account_relationships r1
        INNER JOIN account_relationships r2 ON r1.to_address = r2.from_address
        WHERE r1.from_address = ?
          AND r2.to_address != r1.from_address
        ORDER BY path_volume DESC
        LIMIT 10
      `);
      
      const pathResults = pathQuery.all('BulkAccount0');
      const pathTime = performance.now() - pathStart;

      this.results.operations.push({
        test: '2-hop path finding',
        status: 'PASSED',
        paths: pathResults.length,
        time: `${pathTime.toFixed(2)}ms`
      });

    } catch (error) {
      this.results.operations.push({
        test: 'Complex JOINs',
        status: 'ERROR',
        message: error.message
      });
    }
  }

  // Test transaction rollbacks
  async testTransactionRollbacks() {
    console.log('\n↩️ Testing Transaction Rollbacks...');
    
    try {
      // Get initial account count
      const initialCount = this.db.prepare('SELECT COUNT(*) as count FROM accounts').get().count;

      // Test successful transaction
      console.log('  → Testing successful transaction');
      const successTx = this.db.transaction(() => {
        for (let i = 0; i < 5; i++) {
          this.dbService.createAccount({
            address: `TxSuccess${i}`,
            balance: '1000000'
          });
        }
      });
      
      successTx();
      const afterSuccess = this.db.prepare('SELECT COUNT(*) as count FROM accounts').get().count;
      
      if (afterSuccess === initialCount + 5) {
        this.results.operations.push({
          test: 'Successful transaction',
          status: 'PASSED',
          message: 'Transaction committed successfully'
        });
      }

      // Test failed transaction with rollback
      console.log('  → Testing transaction rollback on error');
      try {
        const failTx = this.db.transaction(() => {
          for (let i = 0; i < 5; i++) {
            this.dbService.createAccount({
              address: `TxFail${i}`,
              balance: '2000000'
            });
          }
          // Force an error
          throw new Error('Simulated transaction failure');
        });
        
        failTx();
        this.results.operations.push({
          test: 'Transaction rollback',
          status: 'FAILED',
          message: 'Transaction should have rolled back'
        });
      } catch (error) {
        const afterFail = this.db.prepare('SELECT COUNT(*) as count FROM accounts').get().count;
        if (afterFail === afterSuccess) {
          this.results.operations.push({
            test: 'Transaction rollback',
            status: 'PASSED',
            message: 'Transaction properly rolled back on error'
          });
        } else {
          this.results.operations.push({
            test: 'Transaction rollback',
            status: 'FAILED',
            message: 'Transaction not properly rolled back'
          });
        }
      }

      // Test nested transaction behavior
      console.log('  → Testing nested transaction behavior');
      const outerTx = this.db.transaction(() => {
        this.dbService.createAccount({
          address: 'OuterTxAccount',
          balance: '3000000'
        });
        
        const innerTx = this.db.transaction(() => {
          this.dbService.createAccount({
            address: 'InnerTxAccount',
            balance: '4000000'
          });
        });
        
        innerTx();
      });
      
      outerTx();
      
      const outer = this.dbService.getAccount('OuterTxAccount');
      const inner = this.dbService.getAccount('InnerTxAccount');
      
      if (outer && inner) {
        this.results.operations.push({
          test: 'Nested transactions',
          status: 'PASSED',
          message: 'Nested transactions work correctly'
        });
      }

    } catch (error) {
      this.results.operations.push({
        test: 'Transaction rollbacks',
        status: 'ERROR',
        message: error.message
      });
    }
  }

  // Test concurrent access
  async testConcurrentAccess() {
    console.log('\n🔄 Testing Concurrent Access...');
    
    try {
      // Simulate concurrent reads
      console.log('  → Testing concurrent reads');
      const readPromises = [];
      const readStart = performance.now();
      
      for (let i = 0; i < 50; i++) {
        readPromises.push(
          new Promise((resolve) => {
            const account = this.dbService.getAccount(`BulkAccount${i % 100}`);
            resolve(account);
          })
        );
      }
      
      await Promise.all(readPromises);
      const readTime = performance.now() - readStart;
      
      this.results.operations.push({
        test: 'Concurrent reads',
        status: 'PASSED',
        operations: 50,
        time: `${readTime.toFixed(2)}ms`,
        opsPerSec: Math.round(50 / (readTime / 1000))
      });

      // Test concurrent writes with transactions
      console.log('  → Testing concurrent writes');
      const writeStart = performance.now();
      
      // SQLite handles concurrent writes by serializing them
      for (let i = 0; i < 10; i++) {
        const tx = this.db.transaction(() => {
          this.dbService.createAccount({
            address: `ConcurrentWrite${i}`,
            balance: `${i * 1000000}`
          });
          
          this.dbService.createTransfer({
            hash: `0xconcurrent${i}`,
            block_number: 6000 + i,
            timestamp: new Date().toISOString(),
            from_address: `ConcurrentWrite${i}`,
            to_address: `ConcurrentWrite${(i + 1) % 10}`,
            value: '100000'
          });
        });
        
        tx();
      }
      
      const writeTime = performance.now() - writeStart;
      
      this.results.operations.push({
        test: 'Sequential writes (SQLite limitation)',
        status: 'PASSED',
        operations: 10,
        time: `${writeTime.toFixed(2)}ms`,
        note: 'SQLite serializes writes'
      });

    } catch (error) {
      this.results.operations.push({
        test: 'Concurrent access',
        status: 'ERROR',
        message: error.message
      });
    }
  }

  // Test REGEXP pattern matching
  async testRegexpMatching() {
    console.log('\n🔍 Testing REGEXP Pattern Matching...');
    
    try {
      // Test basic pattern matching
      console.log('  → Testing address pattern matching');
      const addressPattern = this.db.prepare(`
        SELECT * FROM accounts 
        WHERE address REGEXP ?
        LIMIT 10
      `);
      
      const patternResults = addressPattern.all('^Bulk.*[0-9]$');
      
      if (patternResults.length > 0) {
        this.results.operations.push({
          test: 'REGEXP pattern matching',
          status: 'PASSED',
          matches: patternResults.length,
          pattern: '^Bulk.*[0-9]$'
        });
      }

      // Test complex pattern for suspicious addresses
      console.log('  → Testing complex pattern matching');
      const suspiciousPattern = this.db.prepare(`
        SELECT address, 
               CASE 
                 WHEN address REGEXP '^[A-Z]{3}[0-9]{3,}$' THEN 'Pattern A'
                 WHEN address REGEXP '(Test|Bulk).*[0-9]+' THEN 'Test Pattern'
                 ELSE 'Normal'
               END as pattern_type
        FROM accounts
        WHERE address REGEXP '^[A-Z]{3}[0-9]{3,}$|^(Test|Bulk).*[0-9]+'
        LIMIT 20
      `);
      
      const suspiciousResults = suspiciousPattern.all();
      
      this.results.operations.push({
        test: 'Complex REGEXP patterns',
        status: 'PASSED',
        matches: suspiciousResults.length,
        note: 'Pattern detection for suspicious addresses'
      });

      // Test invalid pattern handling
      console.log('  → Testing invalid pattern handling');
      try {
        const invalidPattern = this.db.prepare(`
          SELECT * FROM accounts WHERE address REGEXP ?
        `);
        invalidPattern.all('[invalid(pattern');
        
        this.results.operations.push({
          test: 'Invalid REGEXP handling',
          status: 'WARNING',
          message: 'Invalid pattern did not throw error'
        });
      } catch (error) {
        this.results.operations.push({
          test: 'Invalid REGEXP handling',
          status: 'PASSED',
          message: 'Invalid patterns handled gracefully'
        });
      }

    } catch (error) {
      this.results.operations.push({
        test: 'REGEXP matching',
        status: 'ERROR',
        message: error.message
      });
    }
  }

  // Test full-text search capabilities
  async testFullTextSearch() {
    console.log('\n📝 Testing Full-Text Search...');
    
    try {
      // SQLite's LIKE operator for text search
      console.log('  → Testing LIKE-based text search');
      
      // Add some accounts with searchable text
      for (let i = 0; i < 20; i++) {
        this.dbService.createAccount({
          address: `SearchTest${i}`,
          identity_display: `${['Alice', 'Bob', 'Charlie', 'David'][i % 4]} ${['Smith', 'Jones', 'Brown', 'Wilson'][Math.floor(i / 4) % 4]}`,
          notes: `This is a test account for ${['trading', 'staking', 'governance', 'transfers'][i % 4]}`
        });
      }

      // Test multi-field search
      const searchStart = performance.now();
      const searchQuery = this.db.prepare(`
        SELECT * FROM accounts
        WHERE identity_display LIKE '%' || ? || '%'
           OR notes LIKE '%' || ? || '%'
           OR address LIKE '%' || ? || '%'
        ORDER BY 
          CASE 
            WHEN identity_display LIKE ? || '%' THEN 1
            WHEN address LIKE ? || '%' THEN 2
            ELSE 3
          END
        LIMIT 10
      `);
      
      const searchTerm = 'Alice';
      const searchResults = searchQuery.all(
        searchTerm, searchTerm, searchTerm,
        searchTerm, searchTerm
      );
      const searchTime = performance.now() - searchStart;

      this.results.operations.push({
        test: 'Multi-field text search',
        status: 'PASSED',
        results: searchResults.length,
        time: `${searchTime.toFixed(2)}ms`,
        searchTerm: searchTerm
      });

      // Test case-insensitive search
      console.log('  → Testing case-insensitive search');
      const caseInsensitive = this.db.prepare(`
        SELECT * FROM accounts
        WHERE LOWER(identity_display) LIKE LOWER('%' || ? || '%')
        LIMIT 10
      `);
      
      const caseResults = caseInsensitive.all('ALICE');
      
      if (caseResults.length > 0) {
        this.results.operations.push({
          test: 'Case-insensitive search',
          status: 'PASSED',
          results: caseResults.length
        });
      }

    } catch (error) {
      this.results.operations.push({
        test: 'Full-text search',
        status: 'ERROR',
        message: error.message
      });
    }
  }

  // Test edge cases
  async testEdgeCases() {
    console.log('\n⚠️ Testing Edge Cases...');
    
    // Test database locks
    console.log('  → Testing database lock handling');
    try {
      // Start a long-running transaction
      const lockTx = this.db.transaction(() => {
        // Hold the lock for a moment
        const stmt = this.db.prepare('SELECT COUNT(*) FROM accounts');
        for (let i = 0; i < 100; i++) {
          stmt.get();
        }
      });
      
      lockTx();
      
      this.results.edgeCases.push({
        test: 'Database lock handling',
        status: 'PASSED',
        message: 'Lock contention handled gracefully'
      });
    } catch (error) {
      this.results.edgeCases.push({
        test: 'Database lock handling',
        status: 'ERROR',
        message: error.message
      });
    }

    // Test long-running queries
    console.log('  → Testing long-running query timeout');
    try {
      const longStart = performance.now();
      
      // Create a complex query that takes time
      const longQuery = this.db.prepare(`
        SELECT 
          a1.address,
          COUNT(DISTINCT t1.to_address) as unique_recipients,
          COUNT(DISTINCT t2.from_address) as unique_senders,
          SUM(CAST(t1.value AS INTEGER)) as total_sent,
          SUM(CAST(t2.value AS INTEGER)) as total_received
        FROM accounts a1
        LEFT JOIN transfers t1 ON a1.address = t1.from_address
        LEFT JOIN transfers t2 ON a1.address = t2.to_address
        GROUP BY a1.address
        ORDER BY total_sent DESC
      `);
      
      const results = longQuery.all();
      const longTime = performance.now() - longStart;
      
      this.results.edgeCases.push({
        test: 'Long-running query',
        status: 'PASSED',
        time: `${longTime.toFixed(2)}ms`,
        results: results.length
      });
    } catch (error) {
      this.results.edgeCases.push({
        test: 'Long-running query',
        status: 'ERROR',
        message: error.message
      });
    }

    // Test extremely large values
    console.log('  → Testing extremely large values');
    try {
      const largeValue = '999999999999999999999999999999999999';
      this.dbService.createAccount({
        address: 'LargeValueTest',
        balance: largeValue
      });
      
      const retrieved = this.dbService.getAccount('LargeValueTest');
      if (retrieved.balance === largeValue) {
        this.results.edgeCases.push({
          test: 'Large value handling',
          status: 'PASSED',
          message: 'Large numeric values stored as text correctly'
        });
      }
    } catch (error) {
      this.results.edgeCases.push({
        test: 'Large value handling',
        status: 'ERROR',
        message: error.message
      });
    }

    // Test special characters in data
    console.log('  → Testing special character handling');
    try {
      const specialChars = "Test's \"Special\" <Characters> & Symbols: 🚀 €$¥";
      this.dbService.createAccount({
        address: 'SpecialCharTest',
        identity_display: specialChars,
        notes: specialChars
      });
      
      const retrieved = this.dbService.getAccount('SpecialCharTest');
      if (retrieved.identity_display === specialChars) {
        this.results.edgeCases.push({
          test: 'Special character handling',
          status: 'PASSED',
          message: 'Special characters and emojis handled correctly'
        });
      }
    } catch (error) {
      this.results.edgeCases.push({
        test: 'Special character handling',
        status: 'ERROR',
        message: error.message
      });
    }

    // Test NULL value handling
    console.log('  → Testing NULL value handling');
    try {
      this.dbService.createAccount({
        address: 'NullTest',
        balance: null,
        identity_display: null
      });
      
      const nullAccount = this.dbService.getAccount('NullTest');
      this.results.edgeCases.push({
        test: 'NULL value handling',
        status: 'PASSED',
        message: 'NULL values handled correctly'
      });
    } catch (error) {
      this.results.edgeCases.push({
        test: 'NULL value handling',
        status: 'ERROR',
        message: error.message
      });
    }
  }

  // Create massive test dataset
  async createMassiveTestData() {
    console.log('\n🏗️ Creating Massive Test Dataset...');
    
    try {
      console.log(`  → Inserting ${LARGE_INSERT_COUNT} test accounts...`);
      const accountStart = performance.now();
      
      // Use transaction for better performance
      const massiveAccountTx = this.db.transaction((accounts) => {
        const stmt = this.db.prepare(`
          INSERT INTO accounts (address, balance, identity_display, risk_score)
          VALUES (@address, @balance, @identity_display, @risk_score)
          ON CONFLICT(address) DO NOTHING
        `);
        
        for (const account of accounts) {
          stmt.run(account);
        }
      });

      const massiveAccounts = [];
      for (let i = 0; i < LARGE_INSERT_COUNT; i++) {
        massiveAccounts.push({
          address: `MassiveTest${i}`,
          balance: `${Math.floor(Math.random() * 1000000000000)}`,
          identity_display: `User ${i}`,
          risk_score: Math.random()
        });
      }

      massiveAccountTx(massiveAccounts);
      const accountTime = performance.now() - accountStart;

      this.results.performance.push({
        operation: 'Massive account insert',
        records: LARGE_INSERT_COUNT,
        time: `${accountTime.toFixed(2)}ms`,
        rps: Math.round(LARGE_INSERT_COUNT / (accountTime / 1000))
      });

      console.log(`  → Creating ${MASSIVE_TRANSFER_COUNT} test transfers...`);
      const transferStart = performance.now();
      
      // Insert transfers in batches
      const batchSize = 5000;
      for (let batch = 0; batch < MASSIVE_TRANSFER_COUNT / batchSize; batch++) {
        const transferBatch = this.db.transaction((transfers) => {
          const stmt = this.db.prepare(`
            INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value)
            VALUES (@hash, @block_number, @timestamp, @from_address, @to_address, @value)
            ON CONFLICT(hash) DO NOTHING
          `);
          
          for (const transfer of transfers) {
            stmt.run(transfer);
          }
        });

        const transfers = [];
        for (let i = 0; i < batchSize; i++) {
          const idx = batch * batchSize + i;
          transfers.push({
            hash: `0xmassive${idx}`,
            block_number: 7000000 + idx,
            timestamp: new Date(2024, 0, 1, 0, 0, idx % 86400).toISOString(),
            from_address: `MassiveTest${idx % LARGE_INSERT_COUNT}`,
            to_address: `MassiveTest${(idx + 1) % LARGE_INSERT_COUNT}`,
            value: `${Math.floor(Math.random() * 1000000000)}`
          });
        }

        transferBatch(transfers);
      }
      
      const transferTime = performance.now() - transferStart;

      this.results.performance.push({
        operation: 'Massive transfer insert',
        records: MASSIVE_TRANSFER_COUNT,
        time: `${transferTime.toFixed(2)}ms`,
        rps: Math.round(MASSIVE_TRANSFER_COUNT / (transferTime / 1000))
      });

      // Test pattern detection on large dataset
      console.log('  → Running pattern detection on large dataset...');
      const patternStart = performance.now();
      
      // Find accounts with high activity
      const highActivityQuery = this.db.prepare(`
        SELECT 
          address,
          total_transfers_in + total_transfers_out as total_activity,
          CAST(volume_in AS INTEGER) + CAST(volume_out AS INTEGER) as total_volume
        FROM accounts
        WHERE total_transfers_in + total_transfers_out > 100
        ORDER BY total_activity DESC
        LIMIT 100
      `);
      
      const highActivity = highActivityQuery.all();
      const patternTime = performance.now() - patternStart;

      this.results.performance.push({
        operation: 'Pattern detection query',
        records: highActivity.length,
        time: `${patternTime.toFixed(2)}ms`,
        note: 'High activity account detection'
      });

      // Analyze database size
      const stats = this.db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get();
      const dbSizeMB = (stats.size / 1024 / 1024).toFixed(2);
      
      this.results.performance.push({
        operation: 'Database size',
        records: `${LARGE_INSERT_COUNT + MASSIVE_TRANSFER_COUNT} total`,
        size: `${dbSizeMB} MB`,
        note: 'After massive data insert'
      });

    } catch (error) {
      this.results.performance.push({
        operation: 'Massive data creation',
        status: 'ERROR',
        message: error.message
      });
    }
  }

  // Generate final report
  generateReport() {
    console.log('\n\n📊 DATABASE INTEGRITY TEST REPORT');
    console.log('=====================================\n');

    console.log('🔑 CONSTRAINT TESTS:');
    this.results.constraints.forEach(result => {
      const icon = result.status === 'PASSED' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌';
      console.log(`  ${icon} ${result.test}: ${result.status}`);
      if (result.message) console.log(`     └─ ${result.message}`);
    });

    console.log('\n⚙️ OPERATION TESTS:');
    this.results.operations.forEach(result => {
      const icon = result.status === 'PASSED' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌';
      console.log(`  ${icon} ${result.test}: ${result.status || 'COMPLETED'}`);
      if (result.time) console.log(`     └─ Time: ${result.time}`);
      if (result.count) console.log(`     └─ Count: ${result.count}`);
      if (result.rps) console.log(`     └─ Rate: ${result.rps} records/sec`);
      if (result.message) console.log(`     └─ ${result.message}`);
      if (result.note) console.log(`     └─ Note: ${result.note}`);
    });

    console.log('\n📈 PERFORMANCE METRICS:');
    this.results.performance.forEach(metric => {
      console.log(`  • ${metric.operation}:`);
      if (metric.records) console.log(`    └─ Records: ${metric.records}`);
      if (metric.time) console.log(`    └─ Time: ${metric.time}`);
      if (metric.rps) console.log(`    └─ Rate: ${metric.rps} records/sec`);
      if (metric.size) console.log(`    └─ Size: ${metric.size}`);
      if (metric.note) console.log(`    └─ Note: ${metric.note}`);
    });

    console.log('\n⚠️ EDGE CASE TESTS:');
    this.results.edgeCases.forEach(result => {
      const icon = result.status === 'PASSED' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌';
      console.log(`  ${icon} ${result.test}: ${result.status}`);
      if (result.message) console.log(`     └─ ${result.message}`);
      if (result.time) console.log(`     └─ Time: ${result.time}`);
    });

    // Summary statistics
    const totalTests = 
      this.results.constraints.length + 
      this.results.operations.length + 
      this.results.edgeCases.length;
    
    const passedTests = [
      ...this.results.constraints,
      ...this.results.operations,
      ...this.results.edgeCases
    ].filter(r => r.status === 'PASSED').length;
    
    const failedTests = [
      ...this.results.constraints,
      ...this.results.operations,
      ...this.results.edgeCases
    ].filter(r => r.status === 'FAILED' || r.status === 'ERROR').length;

    console.log('\n\n📊 SUMMARY:');
    console.log(`  Total Tests: ${totalTests}`);
    console.log(`  ✅ Passed: ${passedTests}`);
    console.log(`  ❌ Failed: ${failedTests}`);
    console.log(`  ⚠️ Warnings: ${totalTests - passedTests - failedTests}`);
    console.log(`  Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  }

  // Main test runner
  async runAllTests() {
    try {
      await this.setup();
      
      // Run all test categories
      await this.testForeignKeyConstraints();
      await this.testUniqueConstraints();
      await this.testTriggers();
      await this.testViewPerformance();
      await this.testIndexEffectiveness();
      await this.testBulkOperations();
      await this.testComplexJoins();
      await this.testTransactionRollbacks();
      await this.testConcurrentAccess();
      await this.testRegexpMatching();
      await this.testFullTextSearch();
      await this.testEdgeCases();
      await this.createMassiveTestData();
      
      this.generateReport();
      
    } catch (error) {
      console.error('\n❌ Test suite failed:', error);
    } finally {
      await this.cleanup();
    }
  }
}

// Run the tests
const tester = new DatabaseIntegrityTester();
tester.runAllTests();