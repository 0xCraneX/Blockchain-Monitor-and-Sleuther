import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../src/services/DatabaseService.js';
import { createTestDatabase, seedTestData } from '../setup.js';
import { PERFORMANCE_TEST_DATA } from '../fixtures/addresses.js';

describe('Database Performance Tests', () => {
  let dbService;
  let rawDb;

  beforeEach(async () => {
    rawDb = await createTestDatabase();
    dbService = new DatabaseService();
    dbService.db = rawDb;
  });

  afterEach(() => {
    if (rawDb) {
      rawDb.close();
    }
  });

  describe('Large Dataset Performance', () => {
    it('should handle inserting 1000 accounts efficiently', () => {
      const start = performance.now();
      
      // Use transaction for better performance
      dbService.transaction(() => {
        PERFORMANCE_TEST_DATA.LARGE_ACCOUNT_SET.forEach(account => {
          dbService.createAccount(account);
        });
      });
      
      const end = performance.now();
      const duration = end - start;
      
      console.log(`Inserted 1000 accounts in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
      
      // Verify data was inserted
      const count = rawDb.prepare('SELECT COUNT(*) as count FROM accounts').get();
      expect(count.count).toBe(1000);
    });

    it('should handle inserting 10000 transfers efficiently', () => {
      // First insert some accounts
      const accounts = PERFORMANCE_TEST_DATA.LARGE_ACCOUNT_SET.slice(0, 100);
      dbService.transaction(() => {
        accounts.forEach(account => {
          dbService.createAccount(account);
        });
      });

      const start = performance.now();
      
      // Insert transfers in batches for better performance
      const batchSize = 1000;
      const transfers = PERFORMANCE_TEST_DATA.LARGE_TRANSFER_SET;
      
      for (let i = 0; i < transfers.length; i += batchSize) {
        const batch = transfers.slice(i, i + batchSize);
        dbService.transaction(() => {
          batch.forEach(transfer => {
            dbService.createTransfer(transfer);
          });
        });
      }
      
      const end = performance.now();
      const duration = end - start;
      
      console.log(`Inserted 10000 transfers in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(15000); // Should complete in under 15 seconds
      
      // Verify data was inserted
      const count = rawDb.prepare('SELECT COUNT(*) as count FROM transfers').get();
      expect(count.count).toBe(10000);
    });

    it('should search through large dataset efficiently', () => {
      // Insert test data
      dbService.transaction(() => {
        PERFORMANCE_TEST_DATA.LARGE_ACCOUNT_SET.forEach(account => {
          dbService.createAccount(account);
        });
      });

      const start = performance.now();
      
      // Perform multiple searches
      const searches = ['Test1', 'Test5', 'Test99', '5Test1', '5Test9'];
      const allResults = [];
      
      searches.forEach(query => {
        const results = dbService.searchAccounts(query, 50);
        allResults.push(results);
      });
      
      const end = performance.now();
      const duration = end - start;
      
      console.log(`Performed ${searches.length} searches in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(1000); // Should complete searches in under 1 second
      
      // Verify we got results
      expect(allResults.every(results => results.length > 0)).toBe(true);
    });

    it('should handle complex relationship queries efficiently', () => {
      // Insert accounts and transfers
      const accounts = PERFORMANCE_TEST_DATA.LARGE_ACCOUNT_SET.slice(0, 100);
      const transfers = PERFORMANCE_TEST_DATA.LARGE_TRANSFER_SET.slice(0, 1000);
      
      dbService.transaction(() => {
        accounts.forEach(account => {
          dbService.createAccount(account);
        });
        transfers.forEach(transfer => {
          dbService.createTransfer(transfer);
        });
      });

      const start = performance.now();
      
      // Test relationship queries for multiple addresses
      const testAddresses = accounts.slice(0, 10).map(a => a.address);
      const allRelationships = [];
      
      testAddresses.forEach(address => {
        const relationships = dbService.getRelationships(address, {
          depth: 1,
          minVolume: '1000000000',
          limit: 100
        });
        allRelationships.push(relationships);
      });
      
      const end = performance.now();
      const duration = end - start;
      
      console.log(`Retrieved relationships for ${testAddresses.length} addresses in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
    });
  });

  describe('Query Optimization', () => {
    beforeEach(() => {
      // Insert moderate amount of test data
      const accounts = PERFORMANCE_TEST_DATA.LARGE_ACCOUNT_SET.slice(0, 200);
      const transfers = PERFORMANCE_TEST_DATA.LARGE_TRANSFER_SET.slice(0, 2000);
      
      dbService.transaction(() => {
        accounts.forEach(account => {
          dbService.createAccount(account);
        });
        transfers.forEach(transfer => {
          dbService.createTransfer(transfer);
        });
      });
    });

    it('should use indexes for address queries', () => {
      const start = performance.now();
      
      // Query that should use address index
      const account = dbService.getAccount('5Test' + '0'.repeat(44));
      
      const end = performance.now();
      const duration = end - start;
      
      console.log(`Address lookup took ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(50); // Should be very fast with index
    });

    it('should efficiently paginate transfer queries', () => {
      const address = '5Test' + '0'.repeat(44);
      const pageSize = 100;
      
      const start = performance.now();
      
      // Get multiple pages
      const page1 = dbService.getTransfers(address, { limit: pageSize, offset: 0 });
      const page2 = dbService.getTransfers(address, { limit: pageSize, offset: pageSize });
      const page3 = dbService.getTransfers(address, { limit: pageSize, offset: pageSize * 2 });
      
      const end = performance.now();
      const duration = end - start;
      
      console.log(`Paginated transfer queries took ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(500); // Should be fast with proper indexing
    });

    it('should handle time-based transfer filtering efficiently', () => {
      const address = '5Test' + '0'.repeat(44);
      
      const start = performance.now();
      
      // Query with time filters
      const recentTransfers = dbService.getTransfers(address, {
        startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Last 30 days
        endTime: new Date().toISOString(),
        limit: 100
      });
      
      const end = performance.now();
      const duration = end - start;
      
      console.log(`Time-filtered transfer query took ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(200); // Should be fast with timestamp index
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during large operations', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform large operations
      for (let i = 0; i < 10; i++) {
        const batch = PERFORMANCE_TEST_DATA.LARGE_ACCOUNT_SET.slice(i * 100, (i + 1) * 100);
        dbService.transaction(() => {
          batch.forEach(account => {
            dbService.createAccount(account);
          });
        });
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
      
      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent reads efficiently', async () => {
      // Insert test data
      const accounts = PERFORMANCE_TEST_DATA.LARGE_ACCOUNT_SET.slice(0, 100);
      dbService.transaction(() => {
        accounts.forEach(account => {
          dbService.createAccount(account);
        });
      });

      const start = performance.now();
      
      // Perform concurrent read operations
      const queries = Array.from({ length: 50 }, (_, i) => {
        const address = accounts[i % accounts.length].address;
        return () => dbService.getAccount(address);
      });
      
      const results = await Promise.all(queries.map(query => 
        new Promise(resolve => {
          setTimeout(() => resolve(query()), Math.random() * 10);
        })
      ));
      
      const end = performance.now();
      const duration = end - start;
      
      console.log(`50 concurrent reads took ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(1000);
      expect(results.every(result => result !== undefined)).toBe(true);
    });
  });
});