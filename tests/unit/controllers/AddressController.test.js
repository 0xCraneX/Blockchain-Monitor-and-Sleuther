import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AddressController } from '../../../src/controllers/AddressController.js';
import { createTestDatabase, seedTestData, MockBlockchainService } from '../../setup.js';

describe('AddressController', () => {
  let controller;
  let db;
  let blockchain;
  let dbService;

  beforeEach(async () => {
    controller = new AddressController();
    
    // Create test database
    const rawDb = await createTestDatabase();
    seedTestData(rawDb);
    
    // Create a mock database service
    dbService = {
      searchAccounts: vi.fn((query, limit) => {
        return rawDb.prepare(`
          SELECT * FROM accounts 
          WHERE address LIKE ? OR identity_display LIKE ?
          LIMIT ?
        `).all(`%${query}%`, `%${query}%`, limit);
      }),
      getAccount: vi.fn((address) => {
        return rawDb.prepare('SELECT * FROM accounts WHERE address = ?').get(address);
      }),
      createAccount: vi.fn((account) => {
        const stmt = rawDb.prepare(`
          INSERT INTO accounts (address, identity_display, balance, first_seen_block)
          VALUES (@address, @identityDisplay, @balance, @firstSeenBlock)
          ON CONFLICT(address) DO UPDATE SET
            identity_display = @identityDisplay,
            balance = @balance,
            updated_at = CURRENT_TIMESTAMP
          RETURNING *
        `);
        return stmt.get(account);
      }),
      updateAccountIdentity: vi.fn(),
      getTransfers: vi.fn((address, options) => {
        return rawDb.prepare('SELECT * FROM transfers WHERE from_address = ? OR to_address = ?')
          .all(address, address);
      }),
      getRelationships: vi.fn(() => []),
      getPatterns: vi.fn(() => [])
    };
    
    // Create mock blockchain service
    blockchain = new MockBlockchainService();
    await blockchain.connect();
  });

  describe('search', () => {
    it('should search for accounts by address prefix', async () => {
      const results = await controller.search(dbService, '5Grw', 10);
      
      expect(results).toHaveLength(1);
      expect(results[0].address).toBe('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
      expect(dbService.searchAccounts).toHaveBeenCalledWith('5Grw', 10);
    });

    it('should search for accounts by identity', async () => {
      const results = await controller.search(dbService, 'Alice', 10);
      
      expect(results).toHaveLength(1);
      expect(results[0].identity_display).toBe('Alice');
    });

    it('should handle search errors', async () => {
      dbService.searchAccounts.mockRejectedValue(new Error('Database error'));
      
      await expect(controller.search(dbService, 'test', 10))
        .rejects.toThrow('Database error');
    });
  });

  describe('getAccount', () => {
    it('should get account from database if exists', async () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const account = await controller.getAccount(dbService, blockchain, address);
      
      expect(account).toBeDefined();
      expect(account.address).toBe(address);
      expect(account.identity_display).toBe('Alice');
      expect(dbService.getAccount).toHaveBeenCalledWith(address);
    });

    it('should fetch from blockchain if not in database', async () => {
      const newAddress = '5NewAddressNotInDB';
      
      // Mock blockchain response
      blockchain.setMockAccount(newAddress, {
        address: newAddress,
        balance: '5000000000000',
        nonce: 0,
        identity: {
          display: 'New User',
          email: 'new@example.com'
        }
      });
      
      // Mock database to return null initially
      dbService.getAccount.mockReturnValueOnce(null);
      
      const account = await controller.getAccount(dbService, blockchain, newAddress);
      
      expect(dbService.createAccount).toHaveBeenCalled();
      expect(dbService.updateAccountIdentity).toHaveBeenCalled();
    });

    it('should update stale data from blockchain', async () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      // Mock stale account data
      const staleAccount = {
        address,
        identity_display: 'Alice',
        balance: '1000000000000',
        updated_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() // 48 hours old
      };
      
      dbService.getAccount.mockReturnValueOnce(staleAccount);
      
      // Mock fresh blockchain data
      blockchain.setMockAccount(address, {
        address,
        balance: '2000000000000',
        nonce: 5,
        identity: { display: 'Alice Updated' }
      });
      
      await controller.getAccount(dbService, blockchain, address);
      
      expect(dbService.createAccount).toHaveBeenCalled();
    });
  });

  describe('getTransfers', () => {
    it('should get transfers with direction', async () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const transfers = await controller.getTransfers(dbService, address, {});
      
      expect(transfers).toBeDefined();
      expect(Array.isArray(transfers)).toBe(true);
      
      // Check that direction is added
      transfers.forEach(transfer => {
        expect(transfer).toHaveProperty('direction');
        expect(transfer).toHaveProperty('counterparty');
      });
    });

    it('should mark outgoing transfers correctly', async () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      dbService.getTransfers.mockReturnValueOnce([{
        from_address: address,
        to_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        value: '1000000000000'
      }]);
      
      const transfers = await controller.getTransfers(dbService, address, {});
      
      expect(transfers[0].direction).toBe('out');
      expect(transfers[0].counterparty).toBe('5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty');
    });

    it('should mark incoming transfers correctly', async () => {
      const address = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
      
      dbService.getTransfers.mockReturnValueOnce([{
        from_address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        to_address: address,
        value: '1000000000000'
      }]);
      
      const transfers = await controller.getTransfers(dbService, address, {});
      
      expect(transfers[0].direction).toBe('in');
      expect(transfers[0].counterparty).toBe('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
    });
  });

  describe('getRelationships', () => {
    it('should enhance relationships with account info', async () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      dbService.getRelationships.mockReturnValueOnce([{
        connected_address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        total_volume: '2000000000000',
        transfer_count: 5
      }]);
      
      dbService.getAccount.mockImplementation((addr) => {
        if (addr === '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty') {
          return {
            address: addr,
            identity_display: 'Bob',
            risk_score: 0.2
          };
        }
      });
      
      const relationships = await controller.getRelationships(dbService, address, {});
      
      expect(relationships).toHaveLength(1);
      expect(relationships[0].identity).toBe('Bob');
      expect(relationships[0].risk_score).toBe(0.2);
    });
  });

  describe('getPatterns', () => {
    it('should get patterns for address', async () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      dbService.getPatterns.mockReturnValueOnce([{
        pattern_type: 'rapid_movement',
        confidence: 0.85,
        details: { transfers: 10 }
      }]);
      
      const patterns = await controller.getPatterns(dbService, address);
      
      expect(patterns).toHaveLength(1);
      expect(patterns[0].pattern_type).toBe('rapid_movement');
      expect(dbService.getPatterns).toHaveBeenCalledWith(address);
    });
  });

  describe('isDataStale', () => {
    it('should identify stale data', () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      expect(controller.isDataStale(oldDate.toISOString())).toBe(true);
    });

    it('should identify fresh data', () => {
      const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
      expect(controller.isDataStale(recentDate.toISOString())).toBe(false);
    });

    it('should treat null as stale', () => {
      expect(controller.isDataStale(null)).toBe(true);
    });
  });
});