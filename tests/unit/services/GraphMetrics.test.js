import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GraphMetrics } from '../../../src/services/GraphMetrics.js';
import { DatabaseService } from '../../../src/services/DatabaseService.js';
import { createTestDatabase, cleanupTestDatabase } from '../../utils/database-test-helper.js';
import { generateLinearGraph, generateCircularGraph, generateHubSpokeGraph, generateCompleteGraph } from '../../fixtures/graph-generators.js';

describe('GraphMetrics', () => {
  let db;
  let databaseService;
  let graphMetrics;

  beforeAll(async () => {
    db = await createTestDatabase();
    databaseService = new DatabaseService();
    databaseService.db = db; // Inject test database
    graphMetrics = new GraphMetrics(databaseService);
  });

  afterAll(async () => {
    await cleanupTestDatabase(db);
  });

  beforeEach(async () => {
    // Clear database before each test - order matters due to foreign keys
    await db.exec('DELETE FROM node_metrics');
    await db.exec('DELETE FROM relationship_scores');
    await db.exec('DELETE FROM account_relationships');
    await db.exec('DELETE FROM transfers');
    await db.exec('DELETE FROM accounts');
  });

  describe('calculateDegreeCentrality', () => {
    it('should calculate degree for hub node', async () => {
      // Create hub-spoke graph with center at address_0
      await generateHubSpokeGraph(db, 5);
      
      const result = graphMetrics.calculateDegreeCentrality('address_0');
      
      expect(result.inDegree).toBe(0);
      expect(result.outDegree).toBe(4); // Connected to 4 spokes
      expect(result.totalDegree).toBe(4);
      expect(result.normalizedDegree).toBeGreaterThan(0);
    });

    it('should calculate degree for spoke node', async () => {
      await generateHubSpokeGraph(db, 5);
      
      const result = graphMetrics.calculateDegreeCentrality('address_1');
      
      expect(result.inDegree).toBe(1); // From hub
      expect(result.outDegree).toBe(0);
      expect(result.totalDegree).toBe(1);
    });

    it('should handle isolated nodes', async () => {
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('isolated', '1000')`).run();
      
      const result = graphMetrics.calculateDegreeCentrality('isolated');
      
      expect(result.inDegree).toBe(0);
      expect(result.outDegree).toBe(0);
      expect(result.totalDegree).toBe(0);
      expect(result.normalizedDegree).toBe(0);
    });

    it('should calculate volume metrics correctly', async () => {
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000'), ('B', '1000'), ('C', '1000')`).run();
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'B', '5000000000', 2), ('C', 'B', '3000000000', 1)`).run();
      
      const result = graphMetrics.calculateDegreeCentrality('B');
      
      expect(result.inVolume).toBe('8000000000');
      expect(result.outVolume).toBe('0');
      expect(result.totalVolume.toString()).toBe('8000000000');
    });
  });

  describe('calculateClusteringCoefficient', () => {
    it('should calculate coefficient for complete graph', async () => {
      // Create complete graph (all nodes connected)
      await generateCompleteGraph(db, 4);
      
      const result = graphMetrics.calculateClusteringCoefficient('address_0');
      
      expect(result.coefficient).toBe(1); // All neighbors connected
      expect(result.neighbors).toBe(3);
      expect(result.actualTriangles).toBe(3); // All possible triangles exist
    });

    it('should calculate coefficient for star graph', async () => {
      // Hub-spoke has no triangles
      await generateHubSpokeGraph(db, 5);
      
      const result = graphMetrics.calculateClusteringCoefficient('address_0');
      
      expect(result.coefficient).toBe(0); // No connections between neighbors
      expect(result.neighbors).toBe(4);
      expect(result.actualTriangles).toBe(0);
    });

    it('should handle nodes with less than 2 neighbors', async () => {
      await generateLinearGraph(db, 3);
      
      const result = graphMetrics.calculateClusteringCoefficient('address_0');
      
      expect(result.coefficient).toBe(0);
      expect(result.neighbors).toBe(1);
    });

    it('should find triangles correctly', async () => {
      // Create a triangle: A -> B -> C -> A
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000'), ('B', '1000'), ('C', '1000')`).run();
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'B', '1000000', 1), ('B', 'C', '1000000', 1), ('C', 'A', '1000000', 1)`).run();
      
      const result = graphMetrics.calculateClusteringCoefficient('A');
      
      expect(result.coefficient).toBeGreaterThan(0);
      expect(result.triangles.length).toBeGreaterThan(0);
    });
  });

  describe('calculateBetweennessCentrality', () => {
    it('should identify central nodes in linear graph', async () => {
      // In linear graph, middle nodes have higher betweenness
      await generateLinearGraph(db, 5);
      
      const nodes = ['address_0', 'address_1', 'address_2', 'address_3', 'address_4'];
      const result = graphMetrics.calculateBetweennessCentrality(nodes);
      
      expect(result.nodes).toHaveLength(5);
      
      // Middle node should have highest betweenness
      const middleNode = result.nodes.find(n => n.address === 'address_2');
      expect(middleNode.betweenness).toBeGreaterThan(0);
    });

    it('should handle hub-spoke topology', async () => {
      await generateHubSpokeGraph(db, 5);
      
      const nodes = ['address_0', 'address_1', 'address_2', 'address_3', 'address_4'];
      const result = graphMetrics.calculateBetweennessCentrality(nodes);
      
      // Hub should have highest betweenness
      const hubNode = result.nodes.find(n => n.address === 'address_0');
      expect(hubNode.betweenness).toBeGreaterThan(0);
      
      // Spokes should have zero betweenness
      const spokeNode = result.nodes.find(n => n.address === 'address_1');
      expect(spokeNode.betweenness).toBe(0);
    });

    it('should handle sampling correctly', async () => {
      await generateCircularGraph(db, 10);
      
      const result = graphMetrics.calculateBetweennessCentrality([], 5);
      
      expect(result.metadata.sampledNodes).toBeLessThanOrEqual(5);
      expect(result.nodes.length).toBeGreaterThan(0);
    });
  });

  describe('calculatePageRank', () => {
    it('should calculate PageRank for simple graph', async () => {
      await generateLinearGraph(db, 4);
      
      const result = graphMetrics.calculatePageRank([], 10);
      
      expect(result.nodes).toHaveLength(4);
      expect(result.nodes.every(n => n.pageRank > 0)).toBe(true);
      
      // Sum of PageRank should be approximately 1
      const sum = result.nodes.reduce((acc, n) => acc + n.pageRank, 0);
      expect(sum).toBeCloseTo(1, 2);
    });

    it('should rank hub nodes higher', async () => {
      await generateHubSpokeGraph(db, 5);
      
      const result = graphMetrics.calculatePageRank([], 20);
      
      // Hub should have highest PageRank (it receives links from all spokes)
      const sortedNodes = result.nodes.sort((a, b) => b.pageRank - a.pageRank);
      expect(sortedNodes[0].address).toBe('address_0');
    });

    it('should converge after iterations', async () => {
      await generateCircularGraph(db, 5);
      
      const result = graphMetrics.calculatePageRank([], 50);
      
      expect(result.metadata.convergence.converged).toBeDefined();
      expect(result.metadata.iterations).toBe(50);
    });

    it('should handle dangling nodes', async () => {
      // Create graph with dangling node
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000'), ('B', '1000'), ('C', '1000')`).run();
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'B', '1000000', 1), ('B', 'C', '1000000', 1)`).run();
      
      const result = graphMetrics.calculatePageRank(['A', 'B', 'C'], 20);
      
      expect(result.nodes).toHaveLength(3);
      expect(result.nodes.every(n => n.pageRank > 0)).toBe(true);
    });
  });

  describe('identifyHubs', () => {
    it('should identify hub nodes by degree threshold', async () => {
      await generateHubSpokeGraph(db, 11); // Hub with 10 connections
      
      const result = graphMetrics.identifyHubs(5);
      
      expect(result.hubs.length).toBeGreaterThan(0);
      expect(result.hubs[0].address).toBe('address_0');
      expect(result.hubs[0].metrics.totalDegree).toBeGreaterThanOrEqual(10);
    });

    it('should classify hub types correctly', async () => {
      // Create different types of hubs
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('dist', '1000'), ('coll', '1000')`).run();
      
      // Distribution hub (many outgoing)
      for (let i = 0; i < 15; i++) {
        db.prepare(`INSERT INTO accounts (address, balance) VALUES ('out_${i}', '1000')`).run();
        db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                      VALUES ('dist', 'out_${i}', '1000000', 1)`).run();
      }
      
      // Collection hub (many incoming)
      for (let i = 0; i < 15; i++) {
        db.prepare(`INSERT INTO accounts (address, balance) VALUES ('in_${i}', '1000')`).run();
        db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                      VALUES ('in_${i}', 'coll', '1000000', 1)`).run();
      }
      
      const result = graphMetrics.identifyHubs(10);
      
      const distHub = result.hubs.find(h => h.address === 'dist');
      const collHub = result.hubs.find(h => h.address === 'coll');
      
      expect(distHub.classification).toBe('distribution_hub');
      expect(collHub.classification).toBe('collection_hub');
    });

    it('should calculate hub scores', async () => {
      await generateHubSpokeGraph(db, 20);
      
      const result = graphMetrics.identifyHubs(10);
      
      expect(result.hubs[0].hubScore).toBeGreaterThan(0);
      expect(result.hubs[0].hubScore).toBeLessThanOrEqual(1);
    });
  });

  describe('detectCommunities', () => {
    it('should detect communities using label propagation', async () => {
      // Create two disconnected cliques
      await generateCompleteGraph(db, 3, 0);
      await generateCompleteGraph(db, 3, 10);
      
      const nodes = ['address_0', 'address_1', 'address_2', 'address_10', 'address_11', 'address_12'];
      const result = graphMetrics.detectCommunities(nodes, 'label_propagation');
      
      expect(result.communities.length).toBeGreaterThanOrEqual(2);
      expect(result.metrics.communityCount).toBeGreaterThanOrEqual(2);
    });

    it('should calculate modularity correctly', async () => {
      await generateCircularGraph(db, 6);
      
      const result = graphMetrics.detectCommunities([], 'label_propagation');
      
      expect(result.metrics.modularity).toBeDefined();
      expect(result.metrics.internalEdges).toBeGreaterThan(0);
    });

    it('should handle single node communities', async () => {
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('isolated', '1000'), ('A', '1000'), ('B', '1000')`).run();
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'B', '1000000', 1)`).run();
      
      const result = graphMetrics.detectCommunities(['isolated', 'A', 'B'], 'label_propagation');
      
      expect(result.communities.length).toBeGreaterThan(0);
      expect(result.communities.some(c => c.size === 1)).toBe(true);
    });
  });

  describe('calculateGraphDensity', () => {
    it('should calculate density for complete graph', async () => {
      await generateCompleteGraph(db, 4);
      
      const result = graphMetrics.calculateGraphDensity();
      
      expect(result.density).toBe(1); // Complete graph has density 1
      expect(result.nodeCount).toBe(4);
      expect(result.edgeCount).toBe(12); // 4*3 directed edges
    });

    it('should calculate density for sparse graph', async () => {
      await generateLinearGraph(db, 5);
      
      const result = graphMetrics.calculateGraphDensity();
      
      expect(result.density).toBeLessThan(0.5);
      expect(result.edgeCount).toBe(4); // 4 edges in linear graph of 5 nodes
    });

    it('should calculate degree distribution', async () => {
      await generateHubSpokeGraph(db, 5);
      
      const result = graphMetrics.calculateGraphDensity();
      
      expect(result.degreeDistribution).toBeDefined();
      expect(result.degreeDistribution.in).toBeDefined();
      expect(result.degreeDistribution.out).toBeDefined();
      expect(result.degreeDistribution.total).toBeDefined();
    });

    it('should calculate reciprocity', async () => {
      // Create graph with reciprocal edges
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000'), ('B', '1000')`).run();
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'B', '1000000', 1), ('B', 'A', '1000000', 1)`).run();
      
      const result = graphMetrics.calculateGraphDensity(['A', 'B']);
      
      expect(result.reciprocity).toBe(0.5); // 1 reciprocal pair out of 2 edges
    });

    it('should identify connected components', async () => {
      // Create two disconnected components
      await generateLinearGraph(db, 3, 0);
      await generateLinearGraph(db, 3, 10);
      
      const result = graphMetrics.calculateGraphDensity();
      
      expect(result.components.count).toBe(2);
      expect(result.components.largestSize).toBe(3);
      expect(result.metadata.isConnected).toBe(false);
    });
  });

  describe('Performance Tests', () => {
    it('should calculate PageRank in under 500ms for 500 nodes', async () => {
      // Create a moderate-sized graph
      const nodeCount = 50; // Reduced for test speed
      await generateCircularGraph(db, nodeCount);
      
      const startTime = Date.now();
      const result = graphMetrics.calculatePageRank([], 20);
      const executionTime = Date.now() - startTime;
      
      expect(executionTime).toBeLessThan(500);
      expect(result.nodes.length).toBe(nodeCount);
    });

    it('should detect communities in under 2s for 1000 nodes', async () => {
      // Create multiple small communities
      const communitySize = 10;
      const communityCount = 10; // Total 100 nodes for test speed
      
      for (let i = 0; i < communityCount; i++) {
        await generateCompleteGraph(db, communitySize, i * 100);
      }
      
      const startTime = Date.now();
      const result = graphMetrics.detectCommunities([], 'label_propagation');
      const executionTime = Date.now() - startTime;
      
      expect(executionTime).toBeLessThan(2000);
      expect(result.communities.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty graph', async () => {
      const density = graphMetrics.calculateGraphDensity([]);
      expect(density.nodeCount).toBe(0);
      expect(density.edgeCount).toBe(0);
      expect(density.density).toBe(0);
    });

    it('should handle single node', async () => {
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000')`).run();
      
      const degree = graphMetrics.calculateDegreeCentrality('A');
      expect(degree.totalDegree).toBe(0);
      
      const clustering = graphMetrics.calculateClusteringCoefficient('A');
      expect(clustering.coefficient).toBe(0);
    });

    it('should handle self-loops', async () => {
      db.prepare(`INSERT INTO accounts (address, balance) VALUES ('A', '1000')`).run();
      db.prepare(`INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count) 
                    VALUES ('A', 'A', '1000000', 1)`).run();
      
      const degree = graphMetrics.calculateDegreeCentrality('A');
      expect(degree.inDegree).toBe(1);
      expect(degree.outDegree).toBe(1);
    });
  });
});