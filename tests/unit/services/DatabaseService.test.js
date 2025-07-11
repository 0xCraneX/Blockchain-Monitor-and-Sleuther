import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../../src/services/DatabaseService.js';
import { createTestDatabase, seedTestData } from '../../setup.js';
import Database from 'better-sqlite3';

describe('DatabaseService', () => {
  let db;
  let dbService;
  let rawDb;

  beforeEach(async () => {
    rawDb = await createTestDatabase();
    seedTestData(rawDb);
    
    dbService = new DatabaseService();
    dbService.db = rawDb;
    dbService.dbPath = './tests/test.db';
  });

  afterEach(() => {
    if (rawDb) {
      rawDb.close();
    }
  });

  describe('Account Methods', () => {
    it('should get an account by address', () => {
      const account = dbService.getAccount('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
      
      expect(account).toBeDefined();
      expect(account.address).toBe('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
      expect(account.identity_display).toBe('Alice');
      expect(account.balance).toBe('1000000000000');
    });

    it('should return undefined for non-existent account', () => {
      const account = dbService.getAccount('5InvalidAddressDoesNotExist');
      expect(account).toBeUndefined();
    });

    it('should create a new account', () => {
      const newAccount = {
        address: '5NewAccountAddress12345',
        publicKey: '0xabcdef',
        identityDisplay: 'NewUser',
        balance: '5000000000000',
        firstSeenBlock: 2200000
      };

      const created = dbService.createAccount(newAccount);
      
      expect(created).toBeDefined();
      expect(created.address).toBe(newAccount.address);
      expect(created.identity_display).toBe(newAccount.identityDisplay);
      expect(created.balance).toBe(newAccount.balance);
    });

    it('should update existing account on conflict', () => {
      const existingAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      const updated = dbService.createAccount({
        address: existingAddress,
        balance: '2000000000000',
        identityDisplay: 'Alice Updated'
      });

      expect(updated.balance).toBe('2000000000000');
      expect(updated.identity_display).toBe('Alice Updated');
    });

    it('should search accounts by address', () => {
      const results = dbService.searchAccounts('5Grw', 10);
      
      expect(results).toHaveLength(1);
      expect(results[0].address).toBe('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
    });

    it('should search accounts by identity', () => {
      const results = dbService.searchAccounts('Bob', 10);
      
      expect(results).toHaveLength(1);
      expect(results[0].identity_display).toBe('Bob');
    });

    it('should limit search results', () => {
      const results = dbService.searchAccounts('5', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should update account identity', () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const identity = {
        display: 'Alice Wonderland',
        legal: 'Alice Legal Name',
        web: 'https://alice.example.com',
        email: 'alice@example.com',
        twitter: '@alice',
        riot: '@alice:matrix.org',
        verified: true
      };

      const result = dbService.updateAccountIdentity(address, identity);
      expect(result.changes).toBe(1);

      const updated = dbService.getAccount(address);
      expect(updated.identity_display).toBe('Alice Wonderland');
      expect(updated.identity_verified).toBe(1);
    });
  });

  describe('Transfer Methods', () => {
    it('should create a new transfer', () => {
      const transfer = {
        hash: '0xnewtransfer123',
        blockNumber: 1700000,
        timestamp: '2023-03-15T10:00:00Z',
        fromAddress: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        toAddress: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        value: '2000000000000',
        fee: '150000000',
        success: true,
        method: 'transfer',
        section: 'balances'
      };

      const result = dbService.createTransfer(transfer);
      expect(result.changes).toBe(1);
    });

    it('should ignore duplicate transfers', () => {
      const transfer = {
        hash: '0x123456789', // Already exists in seed data
        blockNumber: 1500000,
        timestamp: '2023-01-15T10:00:00Z',
        fromAddress: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        toAddress: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        value: '1000000000000',
        fee: '125000000',
        success: true,
        method: 'transfer',
        section: 'balances'
      };

      const result = dbService.createTransfer(transfer);
      expect(result.changes).toBe(0);
    });

    it('should get transfers for an address', () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const transfers = dbService.getTransfers(address);

      expect(transfers).toHaveLength(1);
      expect(transfers[0].from_address).toBe(address);
    });

    it('should filter transfers by time range', () => {
      const address = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
      const transfers = dbService.getTransfers(address, {
        startTime: '2023-02-01T00:00:00Z',
        endTime: '2023-03-01T00:00:00Z'
      });

      expect(transfers).toHaveLength(1);
      expect(transfers[0].timestamp).toBe('2023-02-20T14:30:00Z');
    });

    it('should paginate transfers', () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const page1 = dbService.getTransfers(address, { limit: 1, offset: 0 });
      const page2 = dbService.getTransfers(address, { limit: 1, offset: 1 });

      expect(page1).toHaveLength(1);
      expect(page2).toHaveLength(0); // Only one transfer in test data
    });
  });

  describe('Relationship Methods', () => {
    it('should get relationships for an address', () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const relationships = dbService.getRelationships(address);

      expect(relationships).toBeDefined();
      expect(Array.isArray(relationships)).toBe(true);
    });

    it('should filter relationships by minimum volume', () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const relationships = dbService.getRelationships(address, {
        minVolume: '2000000000000'
      });

      // Should filter out relationships with volume less than 2 DOT
      relationships.forEach(rel => {
        expect(BigInt(rel.total_volume)).toBeGreaterThanOrEqual(BigInt('2000000000000'));
      });
    });
  });

  describe('Pattern Methods', () => {
    it('should create a pattern', () => {
      const pattern = {
        address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        patternType: 'rapid_movement',
        confidence: 0.85,
        details: {
          transfers: 10,
          timeWindow: '1h',
          totalVolume: '10000000000000'
        }
      };

      const result = dbService.createPattern(pattern);
      expect(result.changes).toBe(1);
    });

    it('should get patterns for an address', () => {
      // First create a pattern
      dbService.createPattern({
        address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        patternType: 'circular_flow',
        confidence: 0.75,
        details: { hops: 3 }
      });

      const patterns = dbService.getPatterns('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
      
      expect(patterns).toHaveLength(1);
      expect(patterns[0].pattern_type).toBe('circular_flow');
      expect(patterns[0].confidence).toBe(0.75);
      expect(patterns[0].details.hops).toBe(3);
    });
  });

  describe('Sync Status Methods', () => {
    it('should get sync status', () => {
      const status = dbService.getSyncStatus('polkadot');
      expect(status).toBeUndefined(); // No status initially
    });

    it('should update sync status', () => {
      const status = {
        lastProcessedBlock: 2500000,
        lastFinalizedBlock: 2499000,
        status: 'syncing',
        errorMessage: null
      };

      const result = dbService.updateSyncStatus('polkadot', status);
      expect(result.changes).toBe(1);

      const retrieved = dbService.getSyncStatus('polkadot');
      expect(retrieved.last_processed_block).toBe(2500000);
      expect(retrieved.status).toBe('syncing');
    });
  });

  describe('Statistics Methods', () => {
    it('should update statistics', () => {
      const result = dbService.updateStatistic('total_accounts', '1000', '2023-03-15');
      expect(result.changes).toBe(1);
    });

    it('should get statistics for a metric', () => {
      // Add some test statistics
      dbService.updateStatistic('total_transfers', '100', '2023-03-13');
      dbService.updateStatistic('total_transfers', '150', '2023-03-14');
      dbService.updateStatistic('total_transfers', '200', '2023-03-15');

      const stats = dbService.getStatistics('total_transfers', 7);
      
      expect(stats).toHaveLength(3);
      expect(stats[0].metric_value).toBe('200'); // Most recent first
    });
  });

  describe('Transaction Methods', () => {
    it('should execute operations in a transaction', () => {
      const result = dbService.transaction(() => {
        // Create multiple accounts in one transaction
        dbService.createAccount({
          address: '5Trans1',
          balance: '1000000000000'
        });
        
        dbService.createAccount({
          address: '5Trans2',
          balance: '2000000000000'
        });

        return { success: true };
      });

      expect(result.success).toBe(true);
      
      // Verify both accounts were created
      expect(dbService.getAccount('5Trans1')).toBeDefined();
      expect(dbService.getAccount('5Trans2')).toBeDefined();
    });

    it('should rollback transaction on error', () => {
      try {
        dbService.transaction(() => {
          dbService.createAccount({
            address: '5ShouldNotExist',
            balance: '1000000000000'
          });
          
          // Force an error
          throw new Error('Transaction error');
        });
      } catch (error) {
        // Expected error
      }

      // Account should not exist due to rollback
      expect(dbService.getAccount('5ShouldNotExist')).toBeUndefined();
    });
  });

  describe('Investigation Methods', () => {
    it('should save an investigation', () => {
      const investigation = {
        sessionId: 'test-session-123',
        title: 'Test Investigation',
        description: 'Testing the investigation save',
        addresses: ['5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'],
        filters: { minVolume: '1000000000000' },
        graphState: { depth: 2, layout: 'force' }
      };

      const result = dbService.saveInvestigation(investigation);
      expect(result.changes).toBe(1);
    });

    it('should retrieve an investigation', () => {
      const investigation = {
        sessionId: 'test-retrieve-123',
        title: 'Retrieve Test',
        description: 'Test retrieval',
        addresses: ['5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'],
        filters: { timeRange: '7d' },
        graphState: { zoom: 1.5 }
      };

      dbService.saveInvestigation(investigation);
      const retrieved = dbService.getInvestigation('test-retrieve-123');

      expect(retrieved).toBeDefined();
      expect(retrieved.title).toBe('Retrieve Test');
      expect(retrieved.addresses).toEqual(['5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY']);
      expect(retrieved.filters.timeRange).toBe('7d');
    });
  });
});