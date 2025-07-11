import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RelationshipScorer } from '../../../src/services/RelationshipScorer.js';

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('RelationshipScorer', () => {
  let scorer;
  let mockDb;
  let mockDbInstance;

  beforeEach(() => {
    // Create mock database instance
    mockDbInstance = {
      prepare: vi.fn(),
      transaction: vi.fn()
    };

    // Create mock database service
    mockDb = {
      db: mockDbInstance,
      getAccount: vi.fn()
    };

    scorer = new RelationshipScorer(mockDb);
  });

  describe('calculateVolumeScore', () => {
    it('should return 0 score for relationship with no transfers', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        transfer_count: 0,
        total_volume: '0'
      };

      const result = scorer.calculateVolumeScore(relationship);
      
      expect(result.score).toBe(0);
      expect(result.details).toEqual({});
    });

    it('should calculate volume score correctly', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        transfer_count: 10,
        total_volume: '1000000000000000' // 1000 DOT
      };

      // Mock account data
      mockDb.getAccount.mockReturnValue({
        balance: '5000000000000000' // 5000 DOT
      });

      // Mock percentile queries
      const mockGet = vi.fn()
        .mockReturnValueOnce({ total: 100, rank: 85 }) // Volume percentile
        .mockReturnValueOnce({ total: 100, rank: 70 }); // Avg size percentile

      mockDbInstance.prepare.mockReturnValue({ get: mockGet });

      const result = scorer.calculateVolumeScore(relationship);

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.details.volumeComponent).toBeLessThanOrEqual(40);
      expect(result.details.avgSizeComponent).toBeLessThanOrEqual(30);
      expect(result.details.relativeVolumeComponent).toBeLessThanOrEqual(30);
    });

    it('should handle missing sender balance', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        transfer_count: 5,
        total_volume: '500000000000000'
      };

      mockDb.getAccount.mockReturnValue(null);

      const mockGet = vi.fn()
        .mockReturnValueOnce({ total: 100, rank: 50 })
        .mockReturnValueOnce({ total: 100, rank: 50 });

      mockDbInstance.prepare.mockReturnValue({ get: mockGet });

      const result = scorer.calculateVolumeScore(relationship);

      expect(result.score).toBeGreaterThan(0);
      expect(result.details.relativeVolumeComponent).toBe(15); // Default value
    });
  });

  describe('calculateFrequencyScore', () => {
    it('should return 0 score for relationship with no transfers', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        transfer_count: 0
      };

      const result = scorer.calculateFrequencyScore(relationship);
      
      expect(result.score).toBe(0);
      expect(result.details).toEqual({});
    });

    it('should calculate frequency score correctly', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        transfer_count: 50
      };

      // Mock temporal data
      const mockGet = vi.fn()
        .mockReturnValueOnce({
          first_transfer: '2024-01-01T00:00:00Z',
          last_transfer: '2024-04-10T00:00:00Z',
          unique_days: 40,
          transfers_last_week: 5,
          transfers_last_month: 15
        })
        .mockReturnValueOnce({ total: 100, rank: 90 }); // Count percentile

      mockDbInstance.prepare.mockReturnValue({ get: mockGet });

      const result = scorer.calculateFrequencyScore(relationship);

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.details.countComponent).toBeLessThanOrEqual(40);
      expect(result.details.frequencyComponent).toBeLessThanOrEqual(30);
      expect(result.details.consistencyComponent).toBeLessThanOrEqual(30);
    });
  });

  describe('calculateTemporalScore', () => {
    it('should give maximum recency score for transfer today', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        transfer_count: 10
      };

      const today = new Date();
      const mockGet = vi.fn().mockReturnValue({
        first_transfer: new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString(),
        last_transfer: today.toISOString(),
        unique_days: 30,
        transfers_last_week: 5,
        transfers_last_month: 20
      });

      mockDbInstance.prepare.mockReturnValue({ get: mockGet });

      const result = scorer.calculateTemporalScore(relationship);

      expect(result.details.recencyComponent).toBe(40);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should decay recency score based on days since last transfer', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        transfer_count: 10
      };

      const scenarios = [
        { days: 5, expectedRecency: 35 },
        { days: 20, expectedRecency: 25 },
        { days: 60, expectedRecency: 15 },
        { days: 200, expectedRecency: 5 },
        { days: 400, expectedRecency: 0 }
      ];

      scenarios.forEach(({ days, expectedRecency }) => {
        const lastTransfer = new Date();
        lastTransfer.setDate(lastTransfer.getDate() - days);

        const mockGet = vi.fn().mockReturnValue({
          first_transfer: new Date(lastTransfer.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
          last_transfer: lastTransfer.toISOString(),
          unique_days: 50,
          transfers_last_week: 0,
          transfers_last_month: 0
        });

        mockDbInstance.prepare.mockReturnValue({ get: mockGet });

        const result = scorer.calculateTemporalScore(relationship);
        expect(result.details.recencyComponent).toBe(expectedRecency);
      });
    });
  });

  describe('calculateNetworkScore', () => {
    it('should calculate network score based on common connections and metrics', () => {
      const fromAddress = 'addr1';
      const toAddress = 'addr2';

      // Mock common connections query
      const mockGetCommon = vi.fn().mockReturnValue({ common_connections: 6 });
      
      // Mock network metrics queries
      const mockGetMetrics = vi.fn()
        .mockReturnValueOnce({ degree_centrality: 0.15, pagerank: 0.02 }) // from
        .mockReturnValueOnce({ degree_centrality: 0.20, pagerank: 0.02 }); // to

      mockDbInstance.prepare.mockImplementation((query) => {
        if (query.includes('common_connections')) {
          return { get: mockGetCommon };
        }
        return { get: mockGetMetrics };
      });

      const result = scorer.calculateNetworkScore(fromAddress, toAddress);

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.details.commonConnectionsComponent).toBe(30); // 6 * 5 = 30
      expect(result.details.centralityComponent).toBeCloseTo(17.5, 1);
      expect(result.details.importanceComponent).toBe(20);
    });

    it('should handle missing network metrics', () => {
      const fromAddress = 'addr1';
      const toAddress = 'addr2';

      const mockGet = vi.fn().mockReturnValue(null);
      mockDbInstance.prepare.mockReturnValue({ get: mockGet });

      const result = scorer.calculateNetworkScore(fromAddress, toAddress);

      expect(result.score).toBe(0);
      expect(result.details.avgDegreeCentrality).toBe(0);
      expect(result.details.avgPageRank).toBe(0);
    });
  });

  describe('calculateRiskScore', () => {
    it('should return 0 risk score for relationship with no transfers', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        transfer_count: 0
      };

      const result = scorer.calculateRiskScore(relationship);
      
      expect(result.score).toBe(0);
      expect(result.details).toEqual({});
    });

    it('should calculate risk score based on suspicious patterns', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        transfer_count: 50
      };

      // Mock risk indicator queries
      const mockGet = vi.fn()
        .mockReturnValueOnce({ rapid_count: 2 })     // Rapid transfers
        .mockReturnValueOnce({ round_count: 10 })    // Round numbers
        .mockReturnValueOnce({ unusual_count: 3 })   // Unusual time
        .mockReturnValueOnce({                       // Account ages
          rel_created: '2024-01-08T00:00:00Z',
          acc_created: '2024-01-02T00:00:00Z'
        });

      mockDbInstance.prepare.mockReturnValue({ get: mockGet });

      const result = scorer.calculateRiskScore(relationship);

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.details.rapidTransferRisk).toBeLessThanOrEqual(30);
      expect(result.details.roundNumberRisk).toBeLessThanOrEqual(25);
      expect(result.details.timeAnomalyRisk).toBeLessThanOrEqual(25);
      expect(result.details.newAccountRisk).toBe(20); // New account flag
    });
  });

  describe('calculateTotalScore', () => {
    it('should combine all scores with proper weighting', async () => {
      const fromAddress = 'addr1';
      const toAddress = 'addr2';

      // Mock relationship query
      const mockRelationship = {
        from_address: fromAddress,
        to_address: toAddress,
        transfer_count: 50,
        total_volume: '1000000000000000'
      };

      // Setup all mocks
      const mockGet = vi.fn();
      
      // Relationship query
      mockGet.mockReturnValueOnce(mockRelationship);
      
      // Volume score mocks
      mockDb.getAccount.mockReturnValue({ balance: '5000000000000000' });
      mockGet.mockReturnValueOnce({ total: 100, rank: 75 });
      mockGet.mockReturnValueOnce({ total: 100, rank: 70 });
      
      // Frequency score mocks
      mockGet.mockReturnValueOnce({
        first_transfer: '2024-01-01T00:00:00Z',
        last_transfer: new Date().toISOString(),
        unique_days: 40,
        transfers_last_week: 5,
        transfers_last_month: 15
      });
      mockGet.mockReturnValueOnce({ total: 100, rank: 80 });
      
      // Temporal score mocks (reuse temporal data)
      mockGet.mockReturnValueOnce({
        first_transfer: '2024-01-01T00:00:00Z',
        last_transfer: new Date().toISOString(),
        unique_days: 40,
        transfers_last_week: 5,
        transfers_last_month: 15
      });
      
      // Network score mocks
      mockGet.mockReturnValueOnce({ common_connections: 4 });
      mockGet.mockReturnValueOnce({ degree_centrality: 0.1, pagerank: 0.01 });
      mockGet.mockReturnValueOnce({ degree_centrality: 0.15, pagerank: 0.015 });
      
      // Risk score mocks
      mockGet.mockReturnValueOnce({ rapid_count: 1 });
      mockGet.mockReturnValueOnce({ round_count: 5 });
      mockGet.mockReturnValueOnce({ unusual_count: 2 });
      mockGet.mockReturnValueOnce({ rel_created: '2024-02-01', acc_created: '2023-01-01' });

      mockDbInstance.prepare.mockReturnValue({ get: mockGet });

      const result = await scorer.calculateTotalScore(fromAddress, toAddress);

      expect(result.fromAddress).toBe(fromAddress);
      expect(result.toAddress).toBe(toAddress);
      expect(result.volumeScore).toBeGreaterThan(0);
      expect(result.frequencyScore).toBeGreaterThan(0);
      expect(result.temporalScore).toBeGreaterThan(0);
      expect(result.networkScore).toBeGreaterThan(0);
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeGreaterThan(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
      
      // Check that risk penalty was applied
      const baseScore = result.details.baseScore;
      const expectedTotal = baseScore * result.details.riskMultiplier;
      expect(result.totalScore).toBeCloseTo(expectedTotal, 2);
    });

    it('should return zero scores for non-existent relationship', async () => {
      const fromAddress = 'addr1';
      const toAddress = 'addr2';

      const mockGet = vi.fn().mockReturnValue(null);
      mockDbInstance.prepare.mockReturnValue({ get: mockGet });

      const result = await scorer.calculateTotalScore(fromAddress, toAddress);

      expect(result.volumeScore).toBe(0);
      expect(result.frequencyScore).toBe(0);
      expect(result.temporalScore).toBe(0);
      expect(result.networkScore).toBe(0);
      expect(result.riskScore).toBe(0);
      expect(result.totalScore).toBe(0);
    });
  });

  describe('updateScoresForRelationship', () => {
    it('should calculate and persist scores to database', async () => {
      const fromAddress = 'addr1';
      const toAddress = 'addr2';

      // Mock relationship and all score calculations
      const mockGet = vi.fn()
        .mockReturnValueOnce({ from_address: fromAddress, to_address: toAddress, transfer_count: 10, total_volume: '1000' })
        .mockReturnValue({ total: 100, rank: 50 });

      const mockRun = vi.fn();
      
      mockDbInstance.prepare.mockImplementation((query) => {
        if (query.includes('UPDATE')) {
          return { run: mockRun };
        }
        return { get: mockGet };
      });

      mockDb.getAccount.mockReturnValue({ balance: '5000' });

      const result = await scorer.updateScoresForRelationship(fromAddress, toAddress);

      expect(mockRun).toHaveBeenCalledWith({
        fromAddress,
        toAddress,
        volumeScore: expect.any(Number),
        frequencyScore: expect.any(Number),
        temporalScore: expect.any(Number),
        networkScore: expect.any(Number),
        riskScore: expect.any(Number),
        totalScore: expect.any(Number)
      });

      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
    });
  });

  describe('getBulkScores', () => {
    it('should calculate scores for multiple relationships', async () => {
      const relationships = [
        { from_address: 'addr1', to_address: 'addr2' },
        { from_address: 'addr3', to_address: 'addr4' },
        { from_address: 'addr5', to_address: 'addr6' }
      ];

      // Mock basic responses for all relationships
      const mockGet = vi.fn().mockReturnValue(null);
      mockDbInstance.prepare.mockReturnValue({ get: mockGet });

      const results = await scorer.getBulkScores(relationships);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.fromAddress).toBe(relationships[index].from_address);
        expect(result.toAddress).toBe(relationships[index].to_address);
        expect(result.totalScore).toBeGreaterThanOrEqual(0);
        expect(result.totalScore).toBeLessThanOrEqual(100);
      });
    });

    it('should process relationships in batches', async () => {
      // Create 25 relationships to test batching
      const relationships = Array.from({ length: 25 }, (_, i) => ({
        from_address: `addr${i * 2}`,
        to_address: `addr${i * 2 + 1}`
      }));

      const mockGet = vi.fn().mockReturnValue(null);
      mockDbInstance.prepare.mockReturnValue({ get: mockGet });

      const results = await scorer.getBulkScores(relationships);

      expect(results).toHaveLength(25);
    });
  });

  describe('interpretScore', () => {
    it('should correctly interpret score ranges', () => {
      const interpretations = [
        { score: 10, expected: "Very weak relationship (minimal interaction)" },
        { score: 30, expected: "Weak relationship (occasional interaction)" },
        { score: 50, expected: "Moderate relationship (regular interaction)" },
        { score: 70, expected: "Strong relationship (frequent, consistent interaction)" },
        { score: 90, expected: "Very strong relationship (high volume, frequent, well-connected)" }
      ];

      interpretations.forEach(({ score, expected }) => {
        expect(scorer.interpretScore(score)).toBe(expected);
      });
    });
  });

  describe('Performance', () => {
    it('should calculate single score within 5ms', async () => {
      const fromAddress = 'addr1';
      const toAddress = 'addr2';

      // Mock minimal responses for speed
      const mockGet = vi.fn().mockReturnValue(null);
      mockDbInstance.prepare.mockReturnValue({ get: mockGet });

      const startTime = Date.now();
      await scorer.calculateTotalScore(fromAddress, toAddress);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5);
    });

    it('should calculate bulk scores (100 relationships) within 100ms', async () => {
      const relationships = Array.from({ length: 100 }, (_, i) => ({
        from_address: `addr${i * 2}`,
        to_address: `addr${i * 2 + 1}`
      }));

      const mockGet = vi.fn().mockReturnValue(null);
      mockDbInstance.prepare.mockReturnValue({ get: mockGet });

      const startTime = Date.now();
      await scorer.getBulkScores(relationships);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });
  });

  describe('Edge cases', () => {
    it('should handle division by zero', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        transfer_count: 0,
        total_volume: '1000'
      };

      const result = scorer.calculateVolumeScore(relationship);
      expect(result.score).toBe(0);
    });

    it('should handle null/undefined values gracefully', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        transfer_count: null,
        total_volume: undefined
      };

      const result = scorer.calculateVolumeScore(relationship);
      expect(result.score).toBe(0);
    });

    it('should ensure scores never exceed 100', async () => {
      const fromAddress = 'addr1';
      const toAddress = 'addr2';

      // Mock extreme values that could cause overflow
      const mockGet = vi.fn()
        .mockReturnValueOnce({
          from_address: fromAddress,
          to_address: toAddress,
          transfer_count: 10000,
          total_volume: '999999999999999999'
        })
        .mockReturnValue({ total: 100, rank: 100 });

      mockDbInstance.prepare.mockReturnValue({ get: mockGet });
      mockDb.getAccount.mockReturnValue({ balance: '1' });

      const result = await scorer.calculateTotalScore(fromAddress, toAddress);

      expect(result.volumeScore).toBeLessThanOrEqual(100);
      expect(result.frequencyScore).toBeLessThanOrEqual(100);
      expect(result.temporalScore).toBeLessThanOrEqual(100);
      expect(result.networkScore).toBeLessThanOrEqual(100);
      expect(result.riskScore).toBeLessThanOrEqual(100);
      expect(result.totalScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Caching', () => {
    it('should cache percentile calculations', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        transfer_count: 10,
        total_volume: '1000'
      };

      const mockGet = vi.fn().mockReturnValue({ total: 100, rank: 50 });
      mockDbInstance.prepare.mockReturnValue({ get: mockGet });
      mockDb.getAccount.mockReturnValue({ balance: '5000' });

      // First call
      scorer.calculateVolumeScore(relationship);
      const firstCallCount = mockGet.mock.calls.length;

      // Second call with same values
      scorer.calculateVolumeScore(relationship);
      const secondCallCount = mockGet.mock.calls.length;

      // Should use cache and not make additional DB calls
      expect(secondCallCount).toBe(firstCallCount);
    });

    it('should expire cache after timeout', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        transfer_count: 10,
        total_volume: '1000'
      };

      const mockGet = vi.fn().mockReturnValue({ total: 100, rank: 50 });
      mockDbInstance.prepare.mockReturnValue({ get: mockGet });
      mockDb.getAccount.mockReturnValue({ balance: '5000' });

      // First call
      scorer.calculateVolumeScore(relationship);
      const firstCallCount = mockGet.mock.calls.length;

      // Simulate cache timeout
      scorer.cacheTimeout = -1;

      // Second call should make new DB queries
      scorer.calculateVolumeScore(relationship);
      const secondCallCount = mockGet.mock.calls.length;

      expect(secondCallCount).toBeGreaterThan(firstCallCount);
    });
  });
});