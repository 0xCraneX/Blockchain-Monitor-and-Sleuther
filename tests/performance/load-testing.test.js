import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import os from 'os';
import { DatabaseService } from '../../src/services/DatabaseService.js';
import { GraphQueries } from '../../src/services/GraphQueries.js';
import { PathFinder } from '../../src/services/PathFinder.js';
import { GraphMetrics } from '../../src/services/GraphMetrics.js';
import { DatabaseTestHelper } from '../utils/database-test-helper.js';
import { GraphGenerators } from '../fixtures/graph-generators.js';
import { logger } from '../../src/utils/logger.js';

// Load testing configurations
const LOAD_TEST_CONFIGS = {
  sustained: {
    duration: 60000, // 1 minute for quick test (can be extended to 10 minutes)
    requestsPerSecond: 100,
    warmupTime: 5000
  },
  spike: {
    minRPS: 0,
    maxRPS: 1000,
    rampUpTime: 10000,
    sustainTime: 5000,
    rampDownTime: 5000
  },
  endurance: {
    duration: 300000, // 5 minutes for test (can be extended to 1 hour)
    requestsPerSecond: 50
  },
  stress: {
    initialRPS: 100,
    incrementRPS: 100,
    incrementInterval: 5000,
    maxRPS: 2000
  }
};

// Performance metrics collector
class PerformanceMetricsCollector {
  constructor() {
    this.metrics = {
      requestCount: 0,
      errorCount: 0,
      responseTimes: [],
      cpuUsage: [],
      memoryUsage: [],
      timestamps: []
    };
    this.startTime = Date.now();
  }

  recordRequest(responseTime, isError = false) {
    this.metrics.requestCount++;
    if (isError) this.metrics.errorCount++;
    this.metrics.responseTimes.push(responseTime);
    this.metrics.timestamps.push(Date.now() - this.startTime);
  }

  recordSystemMetrics() {
    const cpuUsage = process.cpuUsage();
    const memUsage = process.memoryUsage();
    
    this.metrics.cpuUsage.push({
      user: cpuUsage.user / 1000000, // Convert to seconds
      system: cpuUsage.system / 1000000,
      timestamp: Date.now() - this.startTime
    });
    
    this.metrics.memoryUsage.push({
      heapUsed: memUsage.heapUsed / 1024 / 1024, // Convert to MB
      heapTotal: memUsage.heapTotal / 1024 / 1024,
      rss: memUsage.rss / 1024 / 1024,
      external: memUsage.external / 1024 / 1024,
      timestamp: Date.now() - this.startTime
    });
  }

  getPercentiles() {
    const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
    const len = sorted.length;
    
    return {
      p50: sorted[Math.floor(len * 0.5)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
      min: sorted[0],
      max: sorted[len - 1],
      avg: sorted.reduce((a, b) => a + b, 0) / len
    };
  }

  getThroughput() {
    const duration = (Date.now() - this.startTime) / 1000; // in seconds
    return {
      totalRequests: this.metrics.requestCount,
      successfulRequests: this.metrics.requestCount - this.metrics.errorCount,
      errorRate: (this.metrics.errorCount / this.metrics.requestCount) * 100,
      requestsPerSecond: this.metrics.requestCount / duration
    };
  }

  getResourceUsage() {
    const avgCpu = this.metrics.cpuUsage.reduce((acc, curr) => ({
      user: acc.user + curr.user,
      system: acc.system + curr.system
    }), { user: 0, system: 0 });
    
    avgCpu.user /= this.metrics.cpuUsage.length;
    avgCpu.system /= this.metrics.cpuUsage.length;

    const maxMemory = Math.max(...this.metrics.memoryUsage.map(m => m.heapUsed));
    const avgMemory = this.metrics.memoryUsage.reduce((acc, curr) => acc + curr.heapUsed, 0) / this.metrics.memoryUsage.length;

    return {
      cpu: {
        avgUser: avgCpu.user,
        avgSystem: avgCpu.system,
        avgTotal: avgCpu.user + avgCpu.system
      },
      memory: {
        avgHeapUsed: avgMemory,
        maxHeapUsed: maxMemory,
        lastRSS: this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1]?.rss || 0
      }
    };
  }

  generateReport() {
    return {
      summary: {
        duration: (Date.now() - this.startTime) / 1000,
        totalRequests: this.metrics.requestCount,
        errorRate: `${((this.metrics.errorCount / this.metrics.requestCount) * 100).toFixed(2)}%`
      },
      responseTimes: this.getPercentiles(),
      throughput: this.getThroughput(),
      resources: this.getResourceUsage()
    };
  }
}

describe('Load Testing Suite', () => {
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
    
    // Generate larger test data for load testing
    testGraphData = GraphGenerators.generateHubSpoke(null, 1000, 5);
    await populateDatabase(dbService, rawDb, testGraphData);
    
    // Setup Express app
    app = express();
    app.use(express.json());
    setupAPIRoutes(app, graphQueries, pathFinder, graphMetrics);
    
    // Start server
    server = app.listen(0); // Random port
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

  describe('Concurrent Request Testing', () => {
    const testConcurrentRequests = async (concurrentCount, endpoint, params = {}) => {
      const collector = new PerformanceMetricsCollector();
      const promises = [];
      
      for (let i = 0; i < concurrentCount; i++) {
        const promise = (async () => {
          const startTime = performance.now();
          try {
            const response = await request(app)
              .get(endpoint)
              .query(params)
              .timeout(5000);
            
            const responseTime = performance.now() - startTime;
            collector.recordRequest(responseTime, response.status !== 200);
            
            return { success: response.status === 200, responseTime };
          } catch (error) {
            const responseTime = performance.now() - startTime;
            collector.recordRequest(responseTime, true);
            return { success: false, responseTime, error: error.message };
          }
        })();
        
        promises.push(promise);
      }
      
      collector.recordSystemMetrics();
      const results = await Promise.all(promises);
      collector.recordSystemMetrics();
      
      return {
        results,
        metrics: collector.generateReport()
      };
    };

    it('should handle 1 concurrent request', async () => {
      const testAddress = testGraphData.nodes[0].address;
      const { metrics } = await testConcurrentRequests(1, '/api/graph/connections', {
        address: testAddress,
        minVolume: '0',
        limit: 100
      });

      expect(metrics.summary.errorRate).toBe('0.00%');
      expect(metrics.responseTimes.avg).toBeLessThan(100);
      
      console.log('1 Concurrent Request Metrics:', JSON.stringify(metrics, null, 2));
    });

    it('should handle 10 concurrent requests', async () => {
      const testAddress = testGraphData.nodes[0].address;
      const { metrics } = await testConcurrentRequests(10, '/api/graph/connections', {
        address: testAddress,
        minVolume: '0',
        limit: 100
      });

      expect(parseFloat(metrics.summary.errorRate)).toBeLessThan(5);
      expect(metrics.responseTimes.p95).toBeLessThan(200);
      
      console.log('10 Concurrent Requests Metrics:', JSON.stringify(metrics, null, 2));
    });

    it('should handle 100 concurrent requests', async () => {
      const testAddress = testGraphData.nodes[0].address;
      const { metrics } = await testConcurrentRequests(100, '/api/graph/connections', {
        address: testAddress,
        minVolume: '0',
        limit: 100
      });

      expect(parseFloat(metrics.summary.errorRate)).toBeLessThan(10);
      expect(metrics.responseTimes.p95).toBeLessThan(500);
      
      console.log('100 Concurrent Requests Metrics:', JSON.stringify(metrics, null, 2));
    }, 30000);

    it('should handle 1000 concurrent requests', async () => {
      const testAddress = testGraphData.nodes[0].address;
      const { metrics } = await testConcurrentRequests(1000, '/api/graph/connections', {
        address: testAddress,
        minVolume: '0',
        limit: 50
      });

      expect(parseFloat(metrics.summary.errorRate)).toBeLessThan(20);
      
      console.log('1000 Concurrent Requests Metrics:', JSON.stringify(metrics, null, 2));
    }, 60000);
  });

  describe('Sustained Load Testing', () => {
    it('should handle sustained load of 100 req/sec', async () => {
      const collector = new PerformanceMetricsCollector();
      const testAddress = testGraphData.nodes[0].address;
      const duration = 10000; // 10 seconds for quick test
      const requestsPerSecond = 100;
      const interval = 1000 / requestsPerSecond;
      
      let activeRequests = 0;
      let completedRequests = 0;
      const startTime = Date.now();
      
      const intervalId = setInterval(async () => {
        if (Date.now() - startTime > duration) {
          clearInterval(intervalId);
          return;
        }
        
        activeRequests++;
        const reqStartTime = performance.now();
        
        try {
          const response = await request(app)
            .get('/api/graph/connections')
            .query({
              address: testAddress,
              minVolume: '0',
              limit: 50
            })
            .timeout(2000);
          
          const responseTime = performance.now() - reqStartTime;
          collector.recordRequest(responseTime, response.status !== 200);
        } catch (error) {
          const responseTime = performance.now() - reqStartTime;
          collector.recordRequest(responseTime, true);
        }
        
        activeRequests--;
        completedRequests++;
        
        // Record system metrics every second
        if (completedRequests % requestsPerSecond === 0) {
          collector.recordSystemMetrics();
        }
      }, interval);
      
      // Wait for test to complete
      await new Promise(resolve => setTimeout(resolve, duration + 2000));
      
      const report = collector.generateReport();
      
      expect(report.throughput.requestsPerSecond).toBeGreaterThan(90); // Allow some variance
      expect(parseFloat(report.summary.errorRate)).toBeLessThan(5);
      expect(report.responseTimes.p95).toBeLessThan(200);
      
      console.log('Sustained Load Test Report:', JSON.stringify(report, null, 2));
    }, 30000);
  });

  describe('Spike Testing', () => {
    it('should handle traffic spikes from 0 to 500 req/sec', async () => {
      const collector = new PerformanceMetricsCollector();
      const testAddress = testGraphData.nodes[0].address;
      
      let currentRPS = 0;
      const targetRPS = 500;
      const rampUpTime = 5000; // 5 seconds
      const sustainTime = 5000; // 5 seconds
      const rampDownTime = 5000; // 5 seconds
      
      const phases = [
        { name: 'ramp-up', duration: rampUpTime, startRPS: 0, endRPS: targetRPS },
        { name: 'sustain', duration: sustainTime, startRPS: targetRPS, endRPS: targetRPS },
        { name: 'ramp-down', duration: rampDownTime, startRPS: targetRPS, endRPS: 0 }
      ];
      
      for (const phase of phases) {
        const phaseStartTime = Date.now();
        const rpsIncrement = (phase.endRPS - phase.startRPS) / (phase.duration / 100); // Update every 100ms
        
        const phaseInterval = setInterval(async () => {
          const elapsed = Date.now() - phaseStartTime;
          if (elapsed >= phase.duration) {
            clearInterval(phaseInterval);
            return;
          }
          
          if (phase.name === 'ramp-up') {
            currentRPS = phase.startRPS + (rpsIncrement * (elapsed / 100));
          } else if (phase.name === 'ramp-down') {
            currentRPS = phase.startRPS - (rpsIncrement * (elapsed / 100));
          } else {
            currentRPS = phase.startRPS;
          }
          
          // Send requests based on current RPS
          const requestsToSend = Math.floor(currentRPS / 10); // Per 100ms
          
          for (let i = 0; i < requestsToSend; i++) {
            const reqStartTime = performance.now();
            
            request(app)
              .get('/api/graph/connections')
              .query({
                address: testAddress,
                minVolume: '0',
                limit: 20
              })
              .timeout(2000)
              .then(response => {
                const responseTime = performance.now() - reqStartTime;
                collector.recordRequest(responseTime, response.status !== 200);
              })
              .catch(() => {
                const responseTime = performance.now() - reqStartTime;
                collector.recordRequest(responseTime, true);
              });
          }
          
          // Record metrics
          if (elapsed % 1000 === 0) {
            collector.recordSystemMetrics();
          }
        }, 100);
        
        await new Promise(resolve => setTimeout(resolve, phase.duration + 500));
      }
      
      const report = collector.generateReport();
      
      console.log('Spike Test Report:', JSON.stringify(report, null, 2));
      expect(parseFloat(report.summary.errorRate)).toBeLessThan(15);
    }, 60000);
  });
});

// Helper function to populate database
async function populateDatabase(dbService, db, graphData) {
  // Add nodes
  const insertAddress = db.prepare(`
    INSERT OR IGNORE INTO addresses (address, first_seen_at, last_seen_at, total_transactions, total_volume)
    VALUES (?, datetime('now'), datetime('now'), ?, ?)
  `);
  
  for (const node of graphData.nodes) {
    insertAddress.run(node.address, node.transactionCount || 10, node.totalVolume || '1000000');
  }
  
  // Add edges
  const insertTransaction = db.prepare(`
    INSERT INTO transactions (
      from_address, 
      to_address, 
      amount, 
      block_number, 
      timestamp, 
      transaction_hash,
      transaction_index,
      success
    ) VALUES (?, ?, ?, ?, datetime('now'), ?, 0, 1)
  `);
  
  for (const edge of graphData.edges) {
    insertTransaction.run(
      edge.source,
      edge.target,
      edge.amount || '100000',
      edge.blockNumber || Math.floor(Math.random() * 1000000),
      edge.hash || `0x${Math.random().toString(16).slice(2)}`
    );
  }
}

// Helper function to setup API routes
function setupAPIRoutes(app, graphQueries, pathFinder, graphMetrics) {
  // Direct connections endpoint
  app.get('/api/graph/connections', async (req, res) => {
    try {
      const { address, minVolume = '0', limit = 100 } = req.query;
      const startTime = performance.now();
      
      const result = await graphQueries.getDirectConnections(
        address,
        { minTransactionValue: minVolume, limit: parseInt(limit) }
      );
      
      result.metadata = {
        executionTime: performance.now() - startTime
      };
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Multi-hop endpoint
  app.get('/api/graph/multi-hop', async (req, res) => {
    try {
      const { address, depth = 2, minVolume = '0', limit = 200 } = req.query;
      const startTime = performance.now();
      
      const result = await graphQueries.getMultiHopConnections(
        address,
        parseInt(depth),
        { minTransactionValue: minVolume, limit: parseInt(limit) }
      );
      
      result.metadata = {
        executionTime: performance.now() - startTime
      };
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Shortest path endpoint
  app.get('/api/graph/shortest-path', async (req, res) => {
    try {
      const { from, to, maxDepth = 6 } = req.query;
      const startTime = performance.now();
      
      const result = await pathFinder.findShortestPath(from, to, parseInt(maxDepth));
      
      res.json({
        ...result,
        executionTime: performance.now() - startTime
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Metrics endpoint
  app.get('/api/graph/metrics', async (req, res) => {
    try {
      const { address } = req.query;
      const startTime = performance.now();
      
      const metrics = await graphMetrics.calculateNodeMetrics(address);
      
      res.json({
        ...metrics,
        executionTime: performance.now() - startTime
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}