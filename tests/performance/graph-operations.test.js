import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../src/services/DatabaseService.js';
import { GraphQueries } from '../../src/services/GraphQueries.js';
import { PathFinder } from '../../src/services/PathFinder.js';
import { PatternDetector } from '../../src/services/PatternDetector.js';
import { GraphMetrics } from '../../src/services/GraphMetrics.js';
import { DatabaseTestHelper } from '../utils/database-test-helper.js';
import { GraphGenerators } from '../fixtures/graph-generators.js';
import { logger } from '../../src/utils/logger.js';

class MemoryMonitor {
  constructor() {
    this.baseline = process.memoryUsage();
    this.measurements = [];
  }

  measure(label) {
    const current = process.memoryUsage();
    const delta = {
      heapUsed: (current.heapUsed - this.baseline.heapUsed) / 1024 / 1024,
      heapTotal: (current.heapTotal - this.baseline.heapTotal) / 1024 / 1024,
      rss: (current.rss - this.baseline.rss) / 1024 / 1024,
      external: (current.external - this.baseline.external) / 1024 / 1024
    };
    
    this.measurements.push({ label, ...delta, timestamp: Date.now() });
    return delta;
  }

  getReport() {
    return {
      baseline: {
        heapUsed: this.baseline.heapUsed / 1024 / 1024,
        heapTotal: this.baseline.heapTotal / 1024 / 1024,
        rss: this.baseline.rss / 1024 / 1024
      },
      measurements: this.measurements,
      peak: {
        heapUsed: Math.max(...this.measurements.map(m => m.heapUsed)),
        rss: Math.max(...this.measurements.map(m => m.rss))
      }
    };
  }
}

describe('Graph Operations Performance Tests', () => {
  let dbService;
  let graphQueries;
  let pathFinder;
  let patternDetector;
  let graphMetrics;
  let rawDb;

  beforeEach(async () => {
    logger.level = 'error';
    
    const testDb = await DatabaseTestHelper.createIsolatedDatabase();
    rawDb = testDb.db;
    
    dbService = new DatabaseService();
    dbService.db = rawDb;
    dbService.dbPath = testDb.dbPath;
    
    graphQueries = new GraphQueries(dbService);
    pathFinder = new PathFinder(dbService, graphQueries);
    patternDetector = new PatternDetector(dbService, graphQueries);
    graphMetrics = new GraphMetrics(dbService);
  });

  afterEach(async () => {
    if (rawDb) {
      const dbPath = rawDb.name;
      await DatabaseTestHelper.cleanupDatabase(rawDb, dbPath);
    }
  });

  describe('Graph Generation Performance', () => {
    const testGraphSizes = [
      { nodes: 10, edges: 30, name: 'Tiny' },
      { nodes: 100, edges: 500, name: 'Small' },
      { nodes: 1000, edges: 5000, name: 'Medium' },
      { nodes: 10000, edges: 50000, name: 'Large' }
    ];

    it('should measure graph generation performance for different sizes', async () => {
      const results = [];
      
      for (const size of testGraphSizes) {
        const memoryMonitor = new MemoryMonitor();
        
        // Generate graph
        const startGen = performance.now();
        const graphData = GraphGenerators.generateScaleFreeNetwork(null, size.nodes, size.edges / size.nodes);
        const genTime = performance.now() - startGen;
        
        memoryMonitor.measure('after_generation');
        
        // Insert into database
        const startInsert = performance.now();
        await populateDatabase(rawDb, graphData);
        const insertTime = performance.now() - startInsert;
        
        memoryMonitor.measure('after_insert');
        
        // Query graph structure
        const startQuery = performance.now();
        const sampleNode = graphData.nodes[0].address;
        const connections = await graphQueries.getDirectConnections(sampleNode);
        const queryTime = performance.now() - startQuery;
        
        memoryMonitor.measure('after_query');
        
        results.push({
          size: size.name,
          nodes: size.nodes,
          edges: graphData.edges.length,
          generationTime: genTime,
          insertTime,
          queryTime,
          memory: memoryMonitor.getReport()
        });
      }
      
      console.log('\nGraph Generation Performance:');
      console.log('=============================');
      console.table(results.map(r => ({
        Size: r.size,
        Nodes: r.nodes,
        Edges: r.edges,
        'Gen Time (ms)': r.generationTime.toFixed(2),
        'Insert Time (ms)': r.insertTime.toFixed(2),
        'Query Time (ms)': r.queryTime.toFixed(2),
        'Peak Memory (MB)': r.memory.peak.heapUsed.toFixed(2)
      })));
    }, 120000);
  });

  describe('Pathfinding Algorithm Performance', () => {
    beforeEach(async () => {
      // Create a complex graph for pathfinding tests
      const graphData = GraphGenerators.generateLayeredNetwork(null, 1000, 5);
      await populateDatabase(rawDb, graphData);
    });

    it('should measure BFS pathfinding performance', async () => {
      const testCases = [
        { depth: 2, expected: 'fast' },
        { depth: 3, expected: 'moderate' },
        { depth: 4, expected: 'slow' },
        { depth: 5, expected: 'very slow' }
      ];
      
      const results = [];
      
      for (const testCase of testCases) {
        // Get random source and target nodes
        const nodes = rawDb.prepare('SELECT address FROM addresses ORDER BY RANDOM() LIMIT 2').all();
        const source = nodes[0].address;
        const target = nodes[1].address;
        
        const memoryBefore = process.memoryUsage().heapUsed / 1024 / 1024;
        const startTime = performance.now();
        
        const path = await pathFinder.findShortestPath(source, target, testCase.depth);
        
        const duration = performance.now() - startTime;
        const memoryAfter = process.memoryUsage().heapUsed / 1024 / 1024;
        
        results.push({
          depth: testCase.depth,
          found: path.found,
          pathLength: path.path?.length || 0,
          duration,
          memoryDelta: memoryAfter - memoryBefore,
          nodesExplored: path.statistics?.nodesExplored || 0
        });
      }
      
      console.log('\nBFS Pathfinding Performance:');
      console.log('============================');
      console.table(results);
      
      // Performance assertions
      expect(results[0].duration).toBeLessThan(100); // 2-hop should be fast
      expect(results[1].duration).toBeLessThan(500); // 3-hop should be reasonable
    });

    it('should compare different pathfinding strategies', async () => {
      const nodes = rawDb.prepare('SELECT address FROM addresses ORDER BY RANDOM() LIMIT 2').all();
      const source = nodes[0].address;
      const target = nodes[1].address;
      
      const strategies = [
        { name: 'BFS', fn: () => pathFinder.findShortestPath(source, target, 4) },
        { name: 'High-Value Paths', fn: () => pathFinder.findHighValuePaths(source, target, 4, 3) },
        { name: 'All Paths (limited)', fn: () => pathFinder.findAllPaths(source, target, 3, 5) }
      ];
      
      const results = [];
      
      for (const strategy of strategies) {
        const startTime = performance.now();
        const memoryBefore = process.memoryUsage().heapUsed;
        
        const result = await strategy.fn();
        
        const duration = performance.now() - startTime;
        const memoryUsed = (process.memoryUsage().heapUsed - memoryBefore) / 1024 / 1024;
        
        results.push({
          strategy: strategy.name,
          duration,
          memoryUsed,
          resultSize: JSON.stringify(result).length
        });
      }
      
      console.log('\nPathfinding Strategy Comparison:');
      console.log('================================');
      console.table(results);
    });
  });

  describe('Pattern Detection Performance', () => {
    beforeEach(async () => {
      // Create graphs with specific patterns
      const hubSpokeData = GraphGenerators.generateHubSpoke(null, 500, 10);
      await populateDatabase(rawDb, hubSpokeData);
    });

    it('should measure pattern detection speed', async () => {
      const patterns = [
        { name: 'Hubs', fn: () => patternDetector.findHubs(10, '1000000') },
        { name: 'Cycles', fn: () => patternDetector.detectCycles(3) },
        { name: 'Clusters', fn: () => patternDetector.detectClusters(0.5) },
        { name: 'Mixing Services', fn: () => patternDetector.detectMixingServices(10, 0.8) }
      ];
      
      const results = [];
      
      for (const pattern of patterns) {
        const memoryMonitor = new MemoryMonitor();
        const startTime = performance.now();
        
        let result;
        try {
          result = await pattern.fn();
        } catch (error) {
          result = { error: error.message };
        }
        
        const duration = performance.now() - startTime;
        memoryMonitor.measure('after_detection');
        
        results.push({
          pattern: pattern.name,
          duration,
          resultCount: Array.isArray(result) ? result.length : 
                      result.hubs ? result.hubs.length :
                      result.cycles ? result.cycles.length :
                      result.clusters ? result.clusters.length :
                      result.nodes ? result.nodes.length : 0,
          memoryUsed: memoryMonitor.measurements[0].heapUsed
        });
      }
      
      console.log('\nPattern Detection Performance:');
      console.log('=============================');
      console.table(results);
      
      // All pattern detections should complete within reasonable time
      results.forEach(r => {
        expect(r.duration).toBeLessThan(5000); // 5 seconds max
      });
    });
  });

  describe('Graph Metrics Calculation Performance', () => {
    const setupGraphForMetrics = async (size) => {
      const graphData = GraphGenerators.generateScaleFreeNetwork(null, size, 5);
      await populateDatabase(rawDb, graphData);
      return graphData;
    };

    it('should measure metrics calculation performance with increasing graph sizes', async () => {
      const sizes = [100, 500, 1000, 2000];
      const results = [];
      
      for (const size of sizes) {
        const graphData = await setupGraphForMetrics(size);
        const sampleNode = graphData.nodes[0].address;
        
        const metrics = {
          centrality: { name: 'Degree Centrality', fn: () => graphMetrics.calculateCentrality('degree') },
          betweenness: { name: 'Betweenness Centrality', fn: () => graphMetrics.calculateCentrality('betweenness') },
          pagerank: { name: 'PageRank', fn: () => graphMetrics.calculatePageRank(0.85, 10) },
          nodeMetrics: { name: 'Node Metrics', fn: () => graphMetrics.calculateNodeMetrics(sampleNode) }
        };
        
        const sizeResults = { size };
        
        for (const [key, metric] of Object.entries(metrics)) {
          const startTime = performance.now();
          const memoryBefore = process.memoryUsage().heapUsed / 1024 / 1024;
          
          try {
            await metric.fn();
            sizeResults[key] = {
              duration: performance.now() - startTime,
              memory: (process.memoryUsage().heapUsed / 1024 / 1024) - memoryBefore
            };
          } catch (error) {
            sizeResults[key] = {
              duration: performance.now() - startTime,
              error: error.message
            };
          }
        }
        
        results.push(sizeResults);
      }
      
      console.log('\nGraph Metrics Performance Scaling:');
      console.log('=================================');
      
      for (const result of results) {
        console.log(`\nGraph Size: ${result.size} nodes`);
        for (const [key, data] of Object.entries(result)) {
          if (key !== 'size') {
            if (data.error) {
              console.log(`  ${key}: ERROR - ${data.error}`);
            } else {
              console.log(`  ${key}: ${data.duration.toFixed(2)}ms, Memory: ${data.memory.toFixed(2)}MB`);
            }
          }
        }
      }
    }, 120000);
  });

  describe('Memory Usage During Graph Operations', () => {
    it('should monitor memory usage during complex graph traversal', async () => {
      // Create a large graph
      const graphData = GraphGenerators.generateScaleFreeNetwork(null, 5000, 10);
      await populateDatabase(rawDb, graphData);
      
      const memoryMonitor = new MemoryMonitor();
      const operations = [];
      
      // 1. Multi-hop query
      memoryMonitor.measure('baseline');
      const startMultiHop = performance.now();
      
      const multiHopResult = await graphQueries.getMultiHopConnections(
        graphData.nodes[0].address,
        3,
        { limit: 1000 }
      );
      
      operations.push({
        operation: 'Multi-hop (depth 3)',
        duration: performance.now() - startMultiHop,
        resultNodes: multiHopResult.nodes.length,
        resultEdges: multiHopResult.edges.length
      });
      memoryMonitor.measure('after_multihop');
      
      // 2. Subgraph extraction
      const startSubgraph = performance.now();
      
      const subgraphNodes = graphData.nodes.slice(0, 100).map(n => n.address);
      const subgraph = await graphQueries.extractSubgraph(subgraphNodes);
      
      operations.push({
        operation: 'Subgraph extraction (100 nodes)',
        duration: performance.now() - startSubgraph,
        resultNodes: subgraph.nodes.length,
        resultEdges: subgraph.edges.length
      });
      memoryMonitor.measure('after_subgraph');
      
      // 3. Pattern detection on subgraph
      const startPattern = performance.now();
      
      const patterns = await patternDetector.detectClusters(0.5);
      
      operations.push({
        operation: 'Cluster detection',
        duration: performance.now() - startPattern,
        resultClusters: patterns.clusters?.length || 0
      });
      memoryMonitor.measure('after_patterns');
      
      // Generate report
      const memoryReport = memoryMonitor.getReport();
      
      console.log('\nMemory Usage During Graph Operations:');
      console.log('====================================');
      console.log('Operations:');
      console.table(operations);
      
      console.log('\nMemory Profile:');
      console.table(memoryReport.measurements.map(m => ({
        Label: m.label,
        'Heap Used Delta (MB)': m.heapUsed.toFixed(2),
        'RSS Delta (MB)': m.rss.toFixed(2)
      })));
      
      console.log(`\nPeak Heap Usage: ${memoryReport.peak.heapUsed.toFixed(2)} MB`);
      console.log(`Peak RSS: ${memoryReport.peak.rss.toFixed(2)} MB`);
      
      // Memory usage assertions
      expect(memoryReport.peak.heapUsed).toBeLessThan(500); // Should not use more than 500MB
    });
  });
});

// Helper function to populate database efficiently
async function populateDatabase(db, graphData) {
  // Batch insert addresses
  const insertAddress = db.prepare(`
    INSERT OR IGNORE INTO addresses (address, first_seen_at, last_seen_at, total_transactions, total_volume)
    VALUES (?, datetime('now'), datetime('now'), ?, ?)
  `);
  
  const insertAddressBatch = db.transaction((addresses) => {
    for (const addr of addresses) {
      insertAddress.run(
        addr.address,
        addr.transactionCount || 10,
        addr.totalVolume || '1000000'
      );
    }
  });
  
  insertAddressBatch(graphData.nodes);
  
  // Batch insert transactions
  const insertTransaction = db.prepare(`
    INSERT INTO transactions (
      from_address, to_address, amount, block_number, timestamp,
      transaction_hash, transaction_index, success
    ) VALUES (?, ?, ?, ?, datetime('now'), ?, 0, 1)
  `);
  
  const insertTransactionBatch = db.transaction((transactions) => {
    for (const tx of transactions) {
      insertTransaction.run(
        tx.source,
        tx.target,
        tx.amount || '100000',
        tx.blockNumber || Math.floor(Math.random() * 1000000),
        tx.hash || `0x${Math.random().toString(16).slice(2).padStart(64, '0')}`
      );
    }
  });
  
  // Insert in chunks
  const chunkSize = 1000;
  for (let i = 0; i < graphData.edges.length; i += chunkSize) {
    const chunk = graphData.edges.slice(i, i + chunkSize);
    insertTransactionBatch(chunk);
  }
}