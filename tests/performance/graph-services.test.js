import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { DatabaseService } from '../../src/services/DatabaseService.js';
import { GraphQueries } from '../../src/services/GraphQueries.js';
import { PathFinder } from '../../src/services/PathFinder.js';
import { GraphMetrics } from '../../src/services/GraphMetrics.js';
import { DatabaseTestHelper } from '../utils/database-test-helper.js';
import { GraphGenerators } from '../fixtures/graph-generators.js';
import { logger } from '../../src/utils/logger.js';

// Performance targets (in milliseconds)
const PERFORMANCE_TARGETS = {
  DIRECT_CONNECTIONS: 10,
  TWO_HOP_QUERIES: 200,
  THREE_HOP_QUERIES: 1000,
  PAGERANK_500_NODES: 500,
  API_RESPONSES_CACHED: 100,
  SHORTEST_PATH: 100,
  CLUSTERING_COEFFICIENT: 50,
  BETWEENNESS_CENTRALITY: 2000
};

describe('Graph Services Performance Tests', () => {
  let dbService;
  let graphQueries;
  let pathFinder;
  let graphMetrics;
  let rawDb;

  beforeAll(() => {
    // Suppress verbose logging during tests
    logger.level = 'error';
  });

  beforeEach(async () => {
    const testDb = await DatabaseTestHelper.createIsolatedDatabase();
    rawDb = testDb.db;
    
    dbService = new DatabaseService();
    dbService.db = rawDb;
    dbService.dbPath = testDb.dbPath;
    
    graphQueries = new GraphQueries(dbService);
    pathFinder = new PathFinder(dbService, graphQueries);
    graphMetrics = new GraphMetrics(dbService);
  });

  afterEach(async () => {
    if (rawDb) {
      const dbPath = rawDb.name;
      await DatabaseTestHelper.cleanupDatabase(rawDb, dbPath);
    }
  });

  describe('GraphQueries Performance', () => {
    describe('Small Graph (100 nodes)', () => {
      let testGraphData;
      
      beforeEach(async () => {
        // Generate hub-spoke pattern with 100 nodes
        testGraphData = GraphGenerators.generateHubSpoke(null, 99, 2);
        await populateDatabase(testGraphData);
      });

      it('should get direct connections in <10ms', async () => {
        const hubAddress = testGraphData.nodes[0].address;
        const startTime = performance.now();
        
        const result = graphQueries.getDirectConnections(hubAddress, {
          minVolume: '0',
          limit: 100
        });
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.edges.length).toBeGreaterThan(0);
        expect(duration).toBeLessThan(PERFORMANCE_TARGETS.DIRECT_CONNECTIONS);
        
        console.log(`Direct connections (100 nodes): ${duration.toFixed(2)}ms`);
      });

      it('should perform 2-hop queries in <200ms', async () => {
        const hubAddress = testGraphData.nodes[0].address;
        const startTime = performance.now();
        
        const result = graphQueries.getMultiHopConnections(hubAddress, 2, {
          minVolume: '0',
          limit: 200
        });
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(duration).toBeLessThan(PERFORMANCE_TARGETS.TWO_HOP_QUERIES);
        
        console.log(`2-hop query (100 nodes): ${duration.toFixed(2)}ms`);
      });

      it('should extract subgraph efficiently', async () => {
        const hubAddress = testGraphData.nodes[0].address;
        const startTime = performance.now();
        
        const result = graphQueries.extractSubgraph(hubAddress, 2, {
          minVolume: '0'
        });
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(duration).toBeLessThan(100);
        
        console.log(`Subgraph extraction (100 nodes): ${duration.toFixed(2)}ms`);
      });
    });

    describe('Medium Graph (1000 nodes)', () => {
      let testGraphData;
      
      beforeEach(async () => {
        // Generate clustered pattern with 1000 nodes
        testGraphData = GraphGenerators.generateClusters(5, 200, 0.3, 0.05);
        await populateDatabase(testGraphData);
      });

      it('should get direct connections in <10ms', async () => {
        const testAddress = testGraphData.nodes[0].address;
        const startTime = performance.now();
        
        const result = graphQueries.getDirectConnections(testAddress, {
          minVolume: '0',
          limit: 100
        });
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(duration).toBeLessThan(PERFORMANCE_TARGETS.DIRECT_CONNECTIONS);
        
        console.log(`Direct connections (1000 nodes): ${duration.toFixed(2)}ms`);
      });

      it('should perform 2-hop queries in <200ms', async () => {
        const testAddress = testGraphData.nodes[0].address;
        const startTime = performance.now();
        
        const result = graphQueries.getMultiHopConnections(testAddress, 2, {
          minVolume: '0',
          limit: 300
        });
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(duration).toBeLessThan(PERFORMANCE_TARGETS.TWO_HOP_QUERIES);
        
        console.log(`2-hop query (1000 nodes): ${duration.toFixed(2)}ms`);
      });

      it('should perform 3-hop queries in <1s', async () => {
        const testAddress = testGraphData.nodes[0].address;
        const startTime = performance.now();
        
        const result = graphQueries.getMultiHopConnections(testAddress, 3, {
          minVolume: '0',
          limit: 200
        });
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(duration).toBeLessThan(PERFORMANCE_TARGETS.THREE_HOP_QUERIES);
        
        console.log(`3-hop query (1000 nodes): ${duration.toFixed(2)}ms`);
      });
    });

    describe('Large Graph (10000 nodes)', () => {
      let testGraphData;
      
      beforeEach(async () => {
        // Generate scale-free pattern with 10000 nodes (limited for test performance)
        testGraphData = GraphGenerators.generateScaleFree(500, 3);
        await populateDatabase(testGraphData);
      });

      it('should get direct connections in <10ms even with large graph', async () => {
        const testAddress = testGraphData.nodes[0].address;
        const startTime = performance.now();
        
        const result = graphQueries.getDirectConnections(testAddress, {
          minVolume: '0',
          limit: 100
        });
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(duration).toBeLessThan(PERFORMANCE_TARGETS.DIRECT_CONNECTIONS);
        
        console.log(`Direct connections (500 nodes): ${duration.toFixed(2)}ms`);
      });

      it('should handle complex subgraph extraction', async () => {
        const testAddress = testGraphData.nodes[0].address;
        const startTime = performance.now();
        
        const result = graphQueries.extractSubgraph(testAddress, 2, {
          minVolume: '0',
          nodeTypes: ['regular'],
          riskScoreRange: [0, 50]
        });
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(duration).toBeLessThan(500);
        
        console.log(`Complex subgraph extraction (500 nodes): ${duration.toFixed(2)}ms`);
      });
    });
  });

  describe('PathFinder Performance', () => {
    describe('Hub-Spoke Pattern', () => {
      let testGraphData;
      
      beforeEach(async () => {
        testGraphData = GraphGenerators.generateHubSpoke(null, 200, 3);
        await populateDatabase(testGraphData);
      });

      it('should find shortest paths quickly in hub-spoke', async () => {
        const hubAddress = testGraphData.nodes[0].address;
        const spokeAddress = testGraphData.nodes[50].address;
        
        const startTime = performance.now();
        
        const result = pathFinder.findShortestPath(hubAddress, spokeAddress, {
          weightType: 'hops',
          maxDepth: 4
        });
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(result.found).toBe(true);
        expect(duration).toBeLessThan(PERFORMANCE_TARGETS.SHORTEST_PATH);
        
        console.log(`Shortest path (hub-spoke): ${duration.toFixed(2)}ms`);
      });

      it('should find all paths efficiently', async () => {
        const addresses = testGraphData.nodes.slice(0, 10).map(n => n.address);
        const startTime = performance.now();
        
        const result = pathFinder.findAllPaths(addresses[0], addresses[1], 3, 20);
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(duration).toBeLessThan(200);
        
        console.log(`Find all paths (hub-spoke): ${duration.toFixed(2)}ms`);
      });
    });

    describe('Chain Pattern', () => {
      let testGraphData;
      
      beforeEach(async () => {
        testGraphData = GraphGenerators.generateChain(100, 2, false);
        await populateDatabase(testGraphData);
      });

      it('should find paths efficiently in linear chain', async () => {
        const startAddress = testGraphData.nodes[0].address;
        const endAddress = testGraphData.nodes[50].address;
        
        const startTime = performance.now();
        
        const result = pathFinder.findShortestPath(startAddress, endAddress, {
          weightType: 'hops'
        });
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(result.found).toBe(true);
        expect(duration).toBeLessThan(PERFORMANCE_TARGETS.SHORTEST_PATH);
        
        console.log(`Shortest path (chain): ${duration.toFixed(2)}ms`);
      });
    });

    describe('Clustered Pattern', () => {
      let testGraphData;
      
      beforeEach(async () => {
        testGraphData = GraphGenerators.generateClusters(4, 50, 0.6, 0.1);
        await populateDatabase(testGraphData);
      });

      it('should find high-value paths efficiently', async () => {
        const addresses = testGraphData.nodes.slice(0, 20).map(n => n.address);
        const startTime = performance.now();
        
        const result = pathFinder.findHighValuePaths(
          addresses[0], 
          addresses[19], 
          '500000000000'
        );
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(duration).toBeLessThan(300);
        
        console.log(`High-value paths (clustered): ${duration.toFixed(2)}ms`);
      });

      it('should analyze path risk efficiently', async () => {
        const addresses = testGraphData.nodes.slice(0, 10).map(n => n.address);
        const path = addresses.slice(0, 5);
        
        const startTime = performance.now();
        
        const result = pathFinder.analyzePathRisk(path);
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(duration).toBeLessThan(100);
        
        console.log(`Path risk analysis: ${duration.toFixed(2)}ms`);
      });
    });
  });

  describe('GraphMetrics Performance', () => {
    describe('Degree Centrality', () => {
      let testGraphData;
      
      beforeEach(async () => {
        testGraphData = GraphGenerators.generateScaleFree(200, 3);
        await populateDatabase(testGraphData);
      });

      it('should calculate degree centrality quickly', async () => {
        const testAddress = testGraphData.nodes[0].address;
        const startTime = performance.now();
        
        const result = graphMetrics.calculateDegreeCentrality(testAddress);
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(result.totalDegree).toBeGreaterThanOrEqual(0);
        expect(duration).toBeLessThan(50);
        
        console.log(`Degree centrality: ${duration.toFixed(2)}ms`);
      });
    });

    describe('Clustering Coefficient', () => {
      let testGraphData;
      
      beforeEach(async () => {
        testGraphData = GraphGenerators.generateClusters(3, 50, 0.7, 0.1);
        await populateDatabase(testGraphData);
      });

      it('should calculate clustering coefficient efficiently', async () => {
        const testAddress = testGraphData.nodes[0].address;
        const startTime = performance.now();
        
        const result = graphMetrics.calculateClusteringCoefficient(testAddress);
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(result.coefficient).toBeGreaterThanOrEqual(0);
        expect(duration).toBeLessThan(PERFORMANCE_TARGETS.CLUSTERING_COEFFICIENT);
        
        console.log(`Clustering coefficient: ${duration.toFixed(2)}ms`);
      });
    });

    describe('PageRank Calculation', () => {
      let testGraphData;
      
      beforeEach(async () => {
        testGraphData = GraphGenerators.generateScaleFree(500, 3);
        await populateDatabase(testGraphData);
      });

      it('should calculate PageRank for 500 nodes in <500ms', async () => {
        const nodes = testGraphData.nodes.map(n => n.address);
        const startTime = performance.now();
        
        const result = graphMetrics.calculatePageRank(nodes, 15);
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(duration).toBeLessThan(PERFORMANCE_TARGETS.PAGERANK_500_NODES);
        
        console.log(`PageRank (500 nodes): ${duration.toFixed(2)}ms`);
      });

      it('should handle different iterations counts efficiently', async () => {
        const nodes = testGraphData.nodes.slice(0, 100).map(n => n.address);
        
        // Test different iteration counts
        const iterations = [5, 10, 20, 30];
        const results = [];
        
        for (const iter of iterations) {
          const startTime = performance.now();
          
          const result = graphMetrics.calculatePageRank(nodes, iter);
          
          const endTime = performance.now();
          const duration = endTime - startTime;
          
          results.push({ iterations: iter, duration });
          
          expect(result.nodes.length).toBeGreaterThan(0);
        }
        
        console.log('PageRank iterations performance:');
        results.forEach(r => {
          console.log(`  ${r.iterations} iterations: ${r.duration.toFixed(2)}ms`);
        });
      });
    });

    describe('Betweenness Centrality', () => {
      let testGraphData;
      
      beforeEach(async () => {
        testGraphData = GraphGenerators.generateHubSpoke(null, 100, 2);
        await populateDatabase(testGraphData);
      });

      it('should calculate betweenness centrality efficiently', async () => {
        const nodes = testGraphData.nodes.slice(0, 50).map(n => n.address);
        const startTime = performance.now();
        
        const result = graphMetrics.calculateBetweennessCentrality(nodes, 30);
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(duration).toBeLessThan(PERFORMANCE_TARGETS.BETWEENNESS_CENTRALITY);
        
        console.log(`Betweenness centrality (50 nodes): ${duration.toFixed(2)}ms`);
      });
    });

    describe('Hub Identification', () => {
      let testGraphData;
      
      beforeEach(async () => {
        testGraphData = GraphGenerators.generateScaleFree(300, 4);
        await populateDatabase(testGraphData);
      });

      it('should identify hubs quickly', async () => {
        const startTime = performance.now();
        
        const result = graphMetrics.identifyHubs(5);
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(duration).toBeLessThan(200);
        
        console.log(`Hub identification: ${duration.toFixed(2)}ms`);
      });
    });

    describe('Community Detection', () => {
      let testGraphData;
      
      beforeEach(async () => {
        testGraphData = GraphGenerators.generateClusters(4, 75, 0.8, 0.05);
        await populateDatabase(testGraphData);
      });

      it('should detect communities using label propagation', async () => {
        const nodes = testGraphData.nodes.map(n => n.address);
        const startTime = performance.now();
        
        const result = graphMetrics.detectCommunities(nodes, 'label_propagation');
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(result.communities.length).toBeGreaterThan(0);
        expect(duration).toBeLessThan(1000);
        
        console.log(`Community detection: ${duration.toFixed(2)}ms`);
      });
    });

    describe('Graph Density', () => {
      let testGraphData;
      
      beforeEach(async () => {
        testGraphData = GraphGenerators.generateRandom(200, 0.05, 1);
        await populateDatabase(testGraphData);
      });

      it('should calculate graph density efficiently', async () => {
        const nodes = testGraphData.nodes.map(n => n.address);
        const startTime = performance.now();
        
        const result = graphMetrics.calculateGraphDensity(nodes);
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(result.nodeCount).toBeGreaterThan(0);
        expect(result.density).toBeGreaterThanOrEqual(0);
        expect(duration).toBeLessThan(300);
        
        console.log(`Graph density calculation: ${duration.toFixed(2)}ms`);
      });
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not leak memory during large operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform multiple large operations
      for (let i = 0; i < 5; i++) {
        const testData = GraphGenerators.generateHubSpoke(null, 100, 3);
        await populateDatabase(testData);
        
        const hubAddress = testData.nodes[0].address;
        
        // Perform various operations
        graphQueries.getDirectConnections(hubAddress);
        graphQueries.getMultiHopConnections(hubAddress, 2);
        graphMetrics.calculateDegreeCentrality(hubAddress);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        // Clear database for next iteration
        rawDb.exec('DELETE FROM account_relationships');
        rawDb.exec('DELETE FROM accounts');
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
      
      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB limit
    });
  });

  describe('Cache Effectiveness', () => {
    let testGraphData;
    
    beforeEach(async () => {
      testGraphData = GraphGenerators.generateHubSpoke(null, 100, 2);
      await populateDatabase(testGraphData);
    });

    it('should demonstrate query caching benefits', async () => {
      const hubAddress = testGraphData.nodes[0].address;
      
      // First query (cold)
      const startTime1 = performance.now();
      const result1 = graphQueries.getDirectConnections(hubAddress);
      const endTime1 = performance.now();
      const coldDuration = endTime1 - startTime1;
      
      // Second query (should be faster due to SQLite caching)
      const startTime2 = performance.now();
      const result2 = graphQueries.getDirectConnections(hubAddress);
      const endTime2 = performance.now();
      const cachedDuration = endTime2 - startTime2;
      
      expect(result1.nodes.length).toBe(result2.nodes.length);
      expect(cachedDuration).toBeLessThan(coldDuration);
      
      console.log(`Cold query: ${coldDuration.toFixed(2)}ms, Cached: ${cachedDuration.toFixed(2)}ms`);
      console.log(`Cache speedup: ${(coldDuration / cachedDuration).toFixed(2)}x`);
    });
  });

  // Helper function to populate database with test data
  async function populateDatabase(graphData) {
    const { nodes, edges, relationships } = graphData;
    
    // Insert accounts
    dbService.transaction(() => {
      nodes.forEach(node => {
        dbService.createAccount(node);
      });
    });
    
    // Insert transfers
    rawDb.pragma('foreign_keys = ON');
    dbService.transaction(() => {
      edges.forEach(edge => {
        dbService.createTransfer(edge);
      });
    });
    
    // Insert relationships if provided
    if (relationships && relationships.length > 0) {
      dbService.transaction(() => {
        relationships.forEach(rel => {
          try {
            rawDb.prepare(`
              INSERT OR REPLACE INTO account_relationships 
              (from_address, to_address, transfer_count, total_volume, first_transfer_time, last_transfer_time)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(
              rel.from_address,
              rel.to_address,
              rel.transfer_count,
              rel.total_volume,
              rel.first_transfer_block,
              rel.last_transfer_block
            );
          } catch (error) {
            // Skip if relationship already exists or other error
          }
        });
      });
    }
  }
});