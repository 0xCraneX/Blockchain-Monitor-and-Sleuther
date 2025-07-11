import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { DatabaseService } from '../../src/services/DatabaseService.js';
import { GraphQueries } from '../../src/services/GraphQueries.js';
import { PathFinder } from '../../src/services/PathFinder.js';
import { GraphMetrics } from '../../src/services/GraphMetrics.js';
import { DatabaseTestHelper } from '../utils/database-test-helper.js';
import { GraphGenerators } from '../fixtures/graph-generators.js';
import { logger } from '../../src/utils/logger.js';

// Performance targets for API endpoints (in milliseconds)
const API_PERFORMANCE_TARGETS = {
  GET_DIRECT_CONNECTIONS: 100,
  GET_MULTI_HOP: 300,
  GET_SHORTEST_PATH: 150,
  GET_METRICS: 200,
  WEBSOCKET_MESSAGE_LATENCY: 50,
  WEBSOCKET_THROUGHPUT: 100 // messages per second
};

describe('API Performance Tests', () => {
  let app;
  let server;
  let dbService;
  let graphQueries;
  let pathFinder;
  let graphMetrics;
  let rawDb;
  let testGraphData;

  beforeAll(() => {
    logger.level = 'error';
  });

  beforeEach(async () => {
    // Setup database and services
    const testDb = await DatabaseTestHelper.createIsolatedDatabase();
    rawDb = testDb.db;
    
    dbService = new DatabaseService();
    dbService.db = rawDb;
    dbService.dbPath = testDb.dbPath;
    
    graphQueries = new GraphQueries(dbService);
    pathFinder = new PathFinder(dbService, graphQueries);
    graphMetrics = new GraphMetrics(dbService);
    
    // Generate test data
    testGraphData = GraphGenerators.generateHubSpoke(null, 200, 3);
    await populateDatabase(dbService, rawDb, testGraphData);
    
    // Setup Express app with API endpoints
    app = express();
    app.use(express.json());
    
    // Add API routes for testing
    setupAPIRoutes(app, graphQueries, pathFinder, graphMetrics);
  });

  afterEach(async () => {
    if (server) {
      server.close();
    }
    
    if (rawDb) {
      const dbPath = rawDb.name;
      await DatabaseTestHelper.cleanupDatabase(rawDb, dbPath);
    }
  });

  describe('Graph API Endpoints', () => {
    it('should respond to direct connections query within performance target', async () => {
      const testAddress = testGraphData.nodes[0].address;
      const startTime = performance.now();
      
      const response = await request(app)
        .get('/api/graph/connections')
        .query({
          address: testAddress,
          minVolume: '0',
          limit: 100
        })
        .expect(200);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(response.body.nodes).toBeDefined();
      expect(response.body.edges).toBeDefined();
      expect(response.body.metadata.executionTime).toBeLessThan(API_PERFORMANCE_TARGETS.GET_DIRECT_CONNECTIONS);
      expect(duration).toBeLessThan(API_PERFORMANCE_TARGETS.GET_DIRECT_CONNECTIONS + 50); // Add overhead allowance
      
      console.log(`Direct connections API: ${duration.toFixed(2)}ms`);
    });

    it('should respond to multi-hop query within performance target', async () => {
      const testAddress = testGraphData.nodes[0].address;
      const startTime = performance.now();
      
      const response = await request(app)
        .get('/api/graph/multi-hop')
        .query({
          address: testAddress,
          depth: 2,
          minVolume: '0',
          limit: 200
        })
        .expect(200);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(response.body.nodes).toBeDefined();
      expect(response.body.edges).toBeDefined();
      expect(duration).toBeLessThan(API_PERFORMANCE_TARGETS.GET_MULTI_HOP);
      
      console.log(`Multi-hop API: ${duration.toFixed(2)}ms`);
    });

    it('should respond to shortest path query within performance target', async () => {
      const fromAddress = testGraphData.nodes[0].address;
      const toAddress = testGraphData.nodes[10].address;
      const startTime = performance.now();
      
      const response = await request(app)
        .get('/api/graph/shortest-path')
        .query({
          from: fromAddress,
          to: toAddress,
          maxDepth: 4
        })
        .expect(200);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(response.body.found).toBeDefined();
      expect(duration).toBeLessThan(API_PERFORMANCE_TARGETS.GET_SHORTEST_PATH);
      
      console.log(`Shortest path API: ${duration.toFixed(2)}ms`);
    });

    it('should respond to metrics query within performance target', async () => {
      const testAddress = testGraphData.nodes[0].address;
      const startTime = performance.now();
      
      const response = await request(app)
        .get('/api/graph/metrics')
        .query({
          address: testAddress,
          metrics: 'degree,clustering'
        })
        .expect(200);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(response.body.degreeCentrality).toBeDefined();
      expect(response.body.clusteringCoefficient).toBeDefined();
      expect(duration).toBeLessThan(API_PERFORMANCE_TARGETS.GET_METRICS);
      
      console.log(`Metrics API: ${duration.toFixed(2)}ms`);
    });

    it('should handle concurrent API requests efficiently', async () => {
      const testAddress = testGraphData.nodes[0].address;
      const concurrentRequests = 10;
      
      const startTime = performance.now();
      
      const promises = Array.from({ length: concurrentRequests }, () => 
        request(app)
          .get('/api/graph/connections')
          .query({
            address: testAddress,
            minVolume: '0',
            limit: 50
          })
      );
      
      const responses = await Promise.all(promises);
      
      const endTime = performance.now();
      const totalDuration = endTime - startTime;
      const avgDuration = totalDuration / concurrentRequests;
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.nodes).toBeDefined();
      });
      
      // Average response time should still be reasonable
      expect(avgDuration).toBeLessThan(API_PERFORMANCE_TARGETS.GET_DIRECT_CONNECTIONS * 2);
      
      console.log(`Concurrent API requests (${concurrentRequests}): avg ${avgDuration.toFixed(2)}ms`);
    });
  });

  describe('API Response Caching', () => {
    it('should demonstrate caching benefits for repeated queries', async () => {
      const testAddress = testGraphData.nodes[0].address;
      const queryParams = {
        address: testAddress,
        minVolume: '0',
        limit: 100
      };
      
      // First request (cold)
      const start1 = performance.now();
      const response1 = await request(app)
        .get('/api/graph/connections')
        .query(queryParams)
        .expect(200);
      const duration1 = performance.now() - start1;
      
      // Second request (should benefit from any caching)
      const start2 = performance.now();
      const response2 = await request(app)
        .get('/api/graph/connections')
        .query(queryParams)
        .expect(200);
      const duration2 = performance.now() - start2;
      
      // Third request
      const start3 = performance.now();
      const response3 = await request(app)
        .get('/api/graph/connections')
        .query(queryParams)
        .expect(200);
      const duration3 = performance.now() - start3;
      
      // Results should be consistent
      expect(response1.body.nodes.length).toBe(response2.body.nodes.length);
      expect(response2.body.nodes.length).toBe(response3.body.nodes.length);
      
      // Later requests should generally be faster due to various caching mechanisms
      const avgCachedTime = (duration2 + duration3) / 2;
      
      console.log(`API caching - Cold: ${duration1.toFixed(2)}ms, Cached avg: ${avgCachedTime.toFixed(2)}ms`);
      console.log(`Cache benefit: ${(duration1 / avgCachedTime).toFixed(2)}x speedup`);
    });
  });

  describe('Pagination Performance', () => {
    it('should handle pagination efficiently', async () => {
      const testAddress = testGraphData.nodes[0].address;
      const pageSize = 25;
      const totalPages = 4;
      
      const pageRequests = [];
      
      for (let page = 0; page < totalPages; page++) {
        const startTime = performance.now();
        
        const response = await request(app)
          .get('/api/graph/connections')
          .query({
            address: testAddress,
            limit: pageSize,
            offset: page * pageSize
          })
          .expect(200);
        
        const duration = performance.now() - startTime;
        
        pageRequests.push({
          page,
          duration,
          resultCount: response.body.nodes.length
        });
        
        expect(duration).toBeLessThan(API_PERFORMANCE_TARGETS.GET_DIRECT_CONNECTIONS);
      }
      
      const avgDuration = pageRequests.reduce((sum, req) => sum + req.duration, 0) / pageRequests.length;
      
      console.log(`Pagination performance (${totalPages} pages): avg ${avgDuration.toFixed(2)}ms`);
      console.log('Page details:', pageRequests.map(r => `Page ${r.page}: ${r.duration.toFixed(2)}ms (${r.resultCount} results)`));
    });
  });

  describe('Error Handling Performance', () => {
    it('should handle invalid requests quickly', async () => {
      const startTime = performance.now();
      
      const response = await request(app)
        .get('/api/graph/connections')
        .query({
          address: 'invalid-address',
          limit: 100
        })
        .expect(400);
      
      const duration = performance.now() - startTime;
      
      expect(response.body.error).toBeDefined();
      expect(duration).toBeLessThan(50); // Error responses should be very fast
      
      console.log(`Error handling: ${duration.toFixed(2)}ms`);
    });

    it('should handle non-existent addresses efficiently', async () => {
      const nonExistentAddress = '5NonExistent' + 'A'.repeat(40);
      const startTime = performance.now();
      
      const response = await request(app)
        .get('/api/graph/connections')
        .query({
          address: nonExistentAddress,
          limit: 100
        })
        .expect(200);
      
      const duration = performance.now() - startTime;
      
      expect(response.body.nodes.length).toBe(0);
      expect(duration).toBeLessThan(API_PERFORMANCE_TARGETS.GET_DIRECT_CONNECTIONS);
      
      console.log(`Non-existent address handling: ${duration.toFixed(2)}ms`);
    });
  });
});

describe('WebSocket Performance Tests', () => {
  let wss;
  let wsPort;
  let dbService;
  let graphQueries;
  let testGraphData;

  beforeEach(async () => {
    // Setup database
    const testDb = await DatabaseTestHelper.createIsolatedDatabase();
    const rawDb = testDb.db;
    
    dbService = new DatabaseService();
    dbService.db = rawDb;
    dbService.dbPath = testDb.dbPath;
    
    graphQueries = new GraphQueries(dbService);
    
    // Generate test data
    testGraphData = GraphGenerators.generateHubSpoke(null, 100, 2);
    await populateDatabase(dbService, rawDb, testGraphData);
    
    // Setup WebSocket server
    wsPort = 3001;
    wss = new WebSocketServer({ port: wsPort });
    
    setupWebSocketServer(wss, graphQueries);
  });

  afterEach(async () => {
    if (wss) {
      wss.close();
    }
    
    if (dbService?.db) {
      const dbPath = dbService.db.name;
      await DatabaseTestHelper.cleanupDatabase(dbService.db, dbPath);
    }
  });

  describe('WebSocket Message Latency', () => {
    it('should respond to graph queries with low latency', async () => {
      const ws = new WebSocket(`ws://localhost:${wsPort}`);
      
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });
      
      const testAddress = testGraphData.nodes[0].address;
      const latencies = [];
      const messageCount = 10;
      
      for (let i = 0; i < messageCount; i++) {
        const startTime = performance.now();
        
        const message = {
          type: 'graph_query',
          id: `test-${i}`,
          data: {
            address: testAddress,
            depth: 1,
            limit: 50
          }
        };
        
        ws.send(JSON.stringify(message));
        
        const response = await new Promise((resolve) => {
          ws.on('message', function handler(data) {
            const parsed = JSON.parse(data.toString());
            if (parsed.id === message.id) {
              ws.off('message', handler);
              resolve(parsed);
            }
          });
        });
        
        const latency = performance.now() - startTime;
        latencies.push(latency);
        
        expect(response.type).toBe('graph_response');
        expect(response.data.nodes).toBeDefined();
        expect(latency).toBeLessThan(API_PERFORMANCE_TARGETS.WEBSOCKET_MESSAGE_LATENCY);
      }
      
      const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);
      
      console.log(`WebSocket latency - Avg: ${avgLatency.toFixed(2)}ms, Min: ${minLatency.toFixed(2)}ms, Max: ${maxLatency.toFixed(2)}ms`);
      
      ws.close();
    });
  });

  describe('WebSocket Throughput', () => {
    it('should handle high message throughput', async () => {
      const ws = new WebSocket(`ws://localhost:${wsPort}`);
      
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });
      
      const testAddress = testGraphData.nodes[0].address;
      const messageCount = 100;
      const startTime = performance.now();
      
      let responsesReceived = 0;
      const responsePromise = new Promise((resolve) => {
        ws.on('message', () => {
          responsesReceived++;
          if (responsesReceived === messageCount) {
            resolve();
          }
        });
      });
      
      // Send messages rapidly
      for (let i = 0; i < messageCount; i++) {
        const message = {
          type: 'graph_query',
          id: `throughput-${i}`,
          data: {
            address: testAddress,
            depth: 1,
            limit: 20
          }
        };
        
        ws.send(JSON.stringify(message));
      }
      
      // Wait for all responses
      await responsePromise;
      
      const totalTime = performance.now() - startTime;
      const throughput = (messageCount / totalTime) * 1000; // messages per second
      
      expect(throughput).toBeGreaterThan(API_PERFORMANCE_TARGETS.WEBSOCKET_THROUGHPUT);
      
      console.log(`WebSocket throughput: ${throughput.toFixed(2)} messages/second`);
      console.log(`Total time for ${messageCount} messages: ${totalTime.toFixed(2)}ms`);
      
      ws.close();
    });
  });

  describe('WebSocket Connection Handling', () => {
    it('should handle multiple concurrent connections', async () => {
      const connectionCount = 10;
      const connections = [];
      
      // Open multiple connections
      for (let i = 0; i < connectionCount; i++) {
        const ws = new WebSocket(`ws://localhost:${wsPort}`);
        connections.push(ws);
        
        await new Promise((resolve, reject) => {
          ws.on('open', resolve);
          ws.on('error', reject);
        });
      }
      
      const testAddress = testGraphData.nodes[0].address;
      const startTime = performance.now();
      
      // Send a message from each connection simultaneously
      const responsePromises = connections.map((ws, index) => {
        const message = {
          type: 'graph_query',
          id: `concurrent-${index}`,
          data: {
            address: testAddress,
            depth: 1,
            limit: 30
          }
        };
        
        ws.send(JSON.stringify(message));
        
        return new Promise((resolve) => {
          ws.on('message', function handler(data) {
            const parsed = JSON.parse(data.toString());
            if (parsed.id === message.id) {
              ws.off('message', handler);
              resolve(parsed);
            }
          });
        });
      });
      
      // Wait for all responses
      const responses = await Promise.all(responsePromises);
      
      const totalTime = performance.now() - startTime;
      const avgResponseTime = totalTime / connectionCount;
      
      // All connections should receive valid responses
      expect(responses.length).toBe(connectionCount);
      responses.forEach(response => {
        expect(response.type).toBe('graph_response');
        expect(response.data.nodes).toBeDefined();
      });
      
      expect(avgResponseTime).toBeLessThan(API_PERFORMANCE_TARGETS.WEBSOCKET_MESSAGE_LATENCY * 2);
      
      console.log(`Concurrent WebSocket connections (${connectionCount}): avg ${avgResponseTime.toFixed(2)}ms`);
      
      // Clean up connections
      connections.forEach(ws => ws.close());
    });
  });
});

// Helper function to setup API routes
function setupAPIRoutes(app, graphQueries, pathFinder, graphMetrics) {
  app.get('/api/graph/connections', async (req, res) => {
    try {
      const { address, minVolume = '0', limit = 100, offset = 0 } = req.query;
      
      if (!address) {
        return res.status(400).json({ error: 'Address is required' });
      }
      
      // Basic address validation
      if (!/^[1-9A-HJ-NP-Za-km-z]{40,}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid address format' });
      }
      
      const result = graphQueries.getDirectConnections(address, {
        minVolume,
        limit: parseInt(limit)
      });
      
      // Apply offset if specified
      if (offset > 0) {
        result.nodes = result.nodes.slice(offset, offset + parseInt(limit));
        result.edges = result.edges.slice(offset, offset + parseInt(limit));
      }
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.get('/api/graph/multi-hop', async (req, res) => {
    try {
      const { address, depth = 2, minVolume = '0', limit = 200 } = req.query;
      
      if (!address) {
        return res.status(400).json({ error: 'Address is required' });
      }
      
      const result = graphQueries.getMultiHopConnections(address, parseInt(depth), {
        minVolume,
        limit: parseInt(limit)
      });
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.get('/api/graph/shortest-path', async (req, res) => {
    try {
      const { from, to, maxDepth = 4 } = req.query;
      
      if (!from || !to) {
        return res.status(400).json({ error: 'Both from and to addresses are required' });
      }
      
      const result = pathFinder.findShortestPath(from, to, {
        maxDepth: parseInt(maxDepth)
      });
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.get('/api/graph/metrics', async (req, res) => {
    try {
      const { address, metrics = 'degree,clustering' } = req.query;
      
      if (!address) {
        return res.status(400).json({ error: 'Address is required' });
      }
      
      const requestedMetrics = metrics.split(',');
      const result = {};
      
      if (requestedMetrics.includes('degree')) {
        result.degreeCentrality = graphMetrics.calculateDegreeCentrality(address);
      }
      
      if (requestedMetrics.includes('clustering')) {
        result.clusteringCoefficient = graphMetrics.calculateClusteringCoefficient(address);
      }
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

// Helper function to setup WebSocket server
function setupWebSocketServer(wss, graphQueries) {
  wss.on('connection', (ws) => {
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'graph_query') {
          const { address, depth = 1, limit = 50 } = message.data;
          
          const result = graphQueries.getDirectConnections(address, {
            minVolume: '0',
            limit
          });
          
          ws.send(JSON.stringify({
            type: 'graph_response',
            id: message.id,
            data: result
          }));
        }
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          id: message?.id,
          error: error.message
        }));
      }
    });
  });
}

// Helper function to populate database
async function populateDatabase(dbService, rawDb, graphData) {
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
          // Skip if relationship already exists
        }
      });
    });
  }
}