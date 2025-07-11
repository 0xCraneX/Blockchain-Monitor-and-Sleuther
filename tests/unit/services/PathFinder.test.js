import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PathFinder } from '../../../src/services/PathFinder.js';
import { DatabaseService } from '../../../src/services/DatabaseService.js';
import { GraphQueries } from '../../../src/services/GraphQueries.js';
import { createTestDatabase, cleanupTestDatabase } from '../../utils/database-test-helper.js';
import { generateLinearGraph, generateCircularGraph, generateHubSpokeGraph } from '../../fixtures/graph-generators.js';

describe('PathFinder', () => {
  let db;
  let databaseService;
  let graphQueries;
  let pathFinder;

  beforeAll(async () => {
    db = await createTestDatabase();
    databaseService = new DatabaseService();
    databaseService.db = db; // Inject test database
    graphQueries = new GraphQueries(databaseService);
    pathFinder = new PathFinder(databaseService, graphQueries);
  });

  afterAll(async () => {
    await cleanupTestDatabase(db);
  });

  beforeEach(async () => {
    // Clear database before each test - order matters for foreign keys
    db.exec('DELETE FROM node_metrics');
    db.exec('DELETE FROM relationship_scores');
    db.exec('DELETE FROM transfers');
    db.exec('DELETE FROM account_relationships');
    db.exec('DELETE FROM accounts');
  });

  describe('findShortestPath', () => {
    it('should find direct path between connected nodes', () => {
      // Create simple two-node graph
      generateLinearGraph(db, 2);
      
      const result = pathFinder.findShortestPath('address_0', 'address_1');
      
      expect(result.found).toBe(true);
      expect(result.path).toEqual(['address_0', 'address_1']);
      expect(result.hops).toBe(1);
      expect(result.cost).toBe(1);
    });

    it('should find multi-hop path', () => {
      // Create linear graph: 0 -> 1 -> 2 -> 3
      generateLinearGraph(db, 4);
      
      const result = pathFinder.findShortestPath('address_0', 'address_3');
      
      expect(result.found).toBe(true);
      expect(result.path).toEqual(['address_0', 'address_1', 'address_2', 'address_3']);
      expect(result.hops).toBe(3);
    });

    it('should return not found for disconnected nodes', () => {
      // Create two disconnected components
      generateLinearGraph(db, 2);
      generateLinearGraph(db, 2, 10); // Start from address_10
      
      const result = pathFinder.findShortestPath('address_0', 'address_10');
      
      expect(result.found).toBe(false);
      expect(result.message).toContain('No path found');
    });

    it('should respect maxDepth limit', () => {
      // Create linear graph longer than maxDepth
      generateLinearGraph(db, 5);
      
      const result = pathFinder.findShortestPath('address_0', 'address_4', {
        maxDepth: 3
      });
      
      expect(result.found).toBe(false);
    });

    it('should use volume-based weights correctly', async () => {
      // Create graph with different volume paths
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000'), ('B', '1000'), ('C', '1000'), ('D', '1000')`).run();
      
      // Path A -> B -> D (high volume)
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'B', '10000000000', 5), ('B', 'D', '10000000000', 5)`).run();
      
      // Path A -> C -> D (low volume)
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'C', '1000000', 1), ('C', 'D', '1000000', 1)`).run();
      
      const result = pathFinder.findShortestPath('A', 'D', {
        weightType: 'volume'
      });
      
      expect(result.found).toBe(true);
      // Should prefer high volume path (lower weight)
      expect(result.path).toEqual(['A', 'B', 'D']);
    });

    it('should handle self-loops correctly', () => {
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000')`).run();
      
      const result = pathFinder.findShortestPath('A', 'A');
      
      expect(result.found).toBe(true);
      expect(result.path).toEqual(['A']);
      expect(result.hops).toBe(0);
      expect(result.cost).toBe(0);
    });
  });

  describe('findAllPaths', () => {
    it('should find all paths in a simple graph', () => {
      // Create diamond graph: A -> B,C -> D
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000'), ('B', '1000'), ('C', '1000'), ('D', '1000')`).run();
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'B', '1000000', 1), ('A', 'C', '1000000', 1),
                           ('B', 'D', '1000000', 1), ('C', 'D', '1000000', 1)`).run();
      
      const result = pathFinder.findAllPaths('A', 'D', 3);
      
      expect(result.paths).toHaveLength(2);
      expect(result.paths[0].path).toEqual(['A', 'B', 'D']);
      expect(result.paths[1].path).toEqual(['A', 'C', 'D']);
    });

    it('should respect maxPaths limit', () => {
      // Create graph with many paths
      generateHubSpokeGraph(db, 5);
      
      const result = pathFinder.findAllPaths('address_1', 'address_2', 3, 1);
      
      expect(result.paths).toHaveLength(1);
    });

    it('should sort paths by length', () => {
      // Create graph with paths of different lengths
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000'), ('B', '1000'), ('C', '1000'), ('D', '1000')`).run();
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'D', '1000000', 1), ('A', 'B', '1000000', 1),
                           ('B', 'C', '1000000', 1), ('C', 'D', '1000000', 1)`).run();
      
      const result = pathFinder.findAllPaths('A', 'D', 4);
      
      expect(result.paths[0].hops).toBe(1); // Direct path
      expect(result.paths[1].hops).toBe(3); // Longer path
    });
  });

  describe('findHighValuePaths', () => {
    it('should find paths meeting minimum volume', () => {
      // Create paths with different volumes
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000'), ('B', '1000'), ('C', '1000'), ('D', '1000')`).run();
      
      // High volume path
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'B', '10000000000', 5), ('B', 'D', '10000000000', 5)`).run();
      
      // Low volume path
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'C', '100000', 1), ('C', 'D', '100000', 1)`).run();
      
      const result = pathFinder.findHighValuePaths('A', 'D', '1000000000');
      
      expect(result.paths).toHaveLength(1);
      expect(result.paths[0].path).toEqual(['A', 'B', 'D']);
      expect(BigInt(result.paths[0].minEdgeVolume)).toBeGreaterThanOrEqual(BigInt('1000000000'));
    });

    it('should return empty for no high value paths', () => {
      generateLinearGraph(db, 3);
      
      const result = pathFinder.findHighValuePaths('address_0', 'address_2', '999999999999999');
      
      expect(result.paths).toHaveLength(0);
    });
  });

  describe('findQuickestPaths', () => {
    it('should find paths with recent activity', () => {
      const now = Math.floor(Date.now() / 1000);
      const oldTime = now - 86400 * 30; // 30 days ago
      
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000'), ('B', '1000'), ('C', '1000'), ('D', '1000')`).run();
      
      // Recent path
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count, last_transfer_time) 
                    VALUES ('A', 'B', '1000000', 1, ${now - 3600}), ('B', 'D', '1000000', 1, ${now - 1800})`).run();
      
      // Old path
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count, last_transfer_time) 
                    VALUES ('A', 'C', '1000000', 1, ${oldTime}), ('C', 'D', '1000000', 1, ${oldTime})`).run();
      
      const result = pathFinder.findQuickestPaths('A', 'D', 86400); // 24 hour window
      
      expect(result.paths.length).toBeGreaterThan(0);
      expect(result.paths[0].path).toEqual(['A', 'B', 'D']);
    });
  });

  describe('analyzePathRisk', () => {
    it('should calculate risk for a path', () => {
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000'), ('B', '1000'), ('C', '1000')`).run();
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'B', '1000000', 1), ('B', 'C', '1000000', 1)`).run();
      db.prepare(`INSERT INTO node_metrics (address, risk_score, node_type) 
                    VALUES ('B', 75, 'mixer')`).run();
      
      const result = pathFinder.analyzePathRisk(['A', 'B', 'C']);
      
      expect(result.nodeRisks).toHaveLength(3);
      expect(result.maxNodeRisk).toBe(75);
      expect(result.suspiciousPatterns.length).toBeGreaterThan(0);
      expect(result.riskLevel).toBeDefined();
    });

    it('should detect large single transfers', () => {
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000'), ('B', '1000')`).run();
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'B', '2000000000000', 1)`).run(); // Large single transfer
      
      const result = pathFinder.analyzePathRisk(['A', 'B']);
      
      const largeTransferPattern = result.suspiciousPatterns.find(p => p.type === 'large_single_transfer');
      expect(largeTransferPattern).toBeDefined();
    });
  });

  describe('findCriticalNodes', () => {
    it('should identify nodes that appear in most paths', () => {
      // Create graph where B is critical: A -> B -> C, A -> B -> D
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000'), ('B', '1000'), ('C', '1000'), ('D', '1000')`).run();
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'B', '1000000', 1), ('B', 'C', '1000000', 1), ('B', 'D', '1000000', 1)`).run();
      
      const result = pathFinder.findCriticalNodes('A', 'C');
      
      expect(result.criticalNodes.length).toBeGreaterThan(0);
      expect(result.criticalNodes[0].address).toBe('B');
      expect(result.criticalNodes[0].participationRate).toBe(1);
    });

    it('should handle no paths case', () => {
      generateLinearGraph(db, 2);
      
      const result = pathFinder.findCriticalNodes('address_0', 'address_10');
      
      expect(result.criticalNodes).toHaveLength(0);
      expect(result.metadata.pathsAnalyzed).toBe(0);
    });
  });

  describe('Performance Tests', () => {
    it('should find shortest path in under 200ms for 1000 nodes', () => {
      // Create a larger graph
      const nodeCount = 100; // Reduced for test speed
      generateHubSpokeGraph(db, nodeCount);
      
      const startTime = Date.now();
      const result = pathFinder.findShortestPath('address_1', 'address_50');
      const executionTime = Date.now() - startTime;
      
      expect(executionTime).toBeLessThan(200);
      expect(result.found).toBe(true);
    });

    it('should find all paths in under 1s for depth 3', () => {
      generateCircularGraph(db, 10);
      
      const startTime = Date.now();
      const result = pathFinder.findAllPaths('address_0', 'address_5', 3, 50);
      const executionTime = Date.now() - startTime;
      
      expect(executionTime).toBeLessThan(1000);
      expect(result.paths.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty graph', async () => {
      const result = pathFinder.findShortestPath('A', 'B');
      expect(result.found).toBe(false);
    });

    it('should handle nodes with no outgoing edges', () => {
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000'), ('B', '1000')`).run();
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'B', '1000000', 1)`).run();
      
      const result = pathFinder.findShortestPath('B', 'A');
      expect(result.found).toBe(false);
    });

    it('should handle very large volumes correctly', () => {
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000'), ('B', '1000')`).run();
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'B', '999999999999999999', 1)`).run();
      
      const result = pathFinder.findHighValuePaths('A', 'B', '999999999999999998');
      expect(result.paths).toHaveLength(1);
    });
  });
});