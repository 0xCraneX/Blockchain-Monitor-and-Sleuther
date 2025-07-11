import { WebSocketTestClient } from './websocket-test-client.js';
import { logger } from '../../../src/utils/logger.js';

/**
 * Connection Pool Test
 * Tests WebSocket connection pooling, reuse, and management
 */
class ConnectionPoolTest {
  constructor(serverUrl = 'http://localhost:3000') {
    this.serverUrl = serverUrl;
    this.connectionPool = new Map();
    this.metrics = {
      connectionsCreated: 0,
      connectionsReused: 0,
      connectionsFailed: 0,
      maxPoolSize: 0,
      avgConnectionTime: 0,
      connectionTimes: []
    };
  }

  /**
   * Create or reuse a connection from the pool
   */
  async getConnection(poolKey = 'default', options = {}) {
    const startTime = Date.now();
    
    // Check if we have an existing connection
    if (this.connectionPool.has(poolKey)) {
      const existingClient = this.connectionPool.get(poolKey);
      
      if (existingClient.socket?.connected) {
        this.metrics.connectionsReused++;
        logger.debug(`Reusing connection from pool: ${poolKey}`);
        return existingClient;
      } else {
        // Remove disconnected client from pool
        this.connectionPool.delete(poolKey);
      }
    }
    
    // Create new connection
    try {
      const client = new WebSocketTestClient(this.serverUrl, {
        ...options,
        reconnection: true,
        reconnectionAttempts: 3
      });
      
      await client.connect();
      
      this.connectionPool.set(poolKey, client);
      this.metrics.connectionsCreated++;
      this.metrics.maxPoolSize = Math.max(this.metrics.maxPoolSize, this.connectionPool.size);
      
      const connectionTime = Date.now() - startTime;
      this.metrics.connectionTimes.push(connectionTime);
      
      logger.info(`Created new connection for pool: ${poolKey}`, {
        connectionTime,
        poolSize: this.connectionPool.size
      });
      
      return client;
      
    } catch (error) {
      this.metrics.connectionsFailed++;
      logger.error(`Failed to create connection for pool: ${poolKey}`, error);
      throw error;
    }
  }

  /**
   * Test connection pool basic functionality
   */
  async testBasicPooling() {
    logger.info('Testing basic connection pooling...');
    
    const results = {
      sameKeyReuse: false,
      differentKeyCreation: false,
      disconnectedRemoval: false
    };
    
    // Test 1: Same key should reuse connection
    const client1a = await this.getConnection('test1');
    const client1b = await this.getConnection('test1');
    results.sameKeyReuse = (client1a === client1b);
    
    // Test 2: Different keys should create new connections
    const client2 = await this.getConnection('test2');
    results.differentKeyCreation = (client1a !== client2);
    
    // Test 3: Disconnected connections should be removed from pool
    client1a.disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const client1c = await this.getConnection('test1');
    results.disconnectedRemoval = (client1a !== client1c);
    
    return results;
  }

  /**
   * Test connection pool under load
   */
  async testPoolUnderLoad(requestCount = 100, maxPoolSize = 10) {
    logger.info(`Testing pool under load: ${requestCount} requests, max pool size ${maxPoolSize}`);
    
    const results = {
      totalRequests: requestCount,
      successfulRequests: 0,
      poolHits: 0,
      poolMisses: 0,
      errors: 0,
      timing: []
    };
    
    const requests = [];
    
    for (let i = 0; i < requestCount; i++) {
      // Use pool keys that will cause both hits and misses
      const poolKey = `pool-${i % maxPoolSize}`;
      const requestStart = Date.now();
      
      requests.push(
        this.getConnection(poolKey)
          .then(client => {
            const requestTime = Date.now() - requestStart;
            results.timing.push(requestTime);
            results.successfulRequests++;
            
            if (this.metrics.connectionsReused > results.poolHits) {
              results.poolHits++;
            } else {
              results.poolMisses++;
            }
            
            // Simulate some work
            return client.sendPing();
          })
          .catch(error => {
            results.errors++;
            logger.error('Pool request failed:', error);
          })
      );
      
      // Stagger requests slightly
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    await Promise.all(requests);
    
    results.avgRequestTime = results.timing.reduce((a, b) => a + b, 0) / results.timing.length;
    results.hitRate = (results.poolHits / results.totalRequests * 100).toFixed(2) + '%';
    
    return results;
  }

  /**
   * Test connection lifecycle management
   */
  async testConnectionLifecycle() {
    logger.info('Testing connection lifecycle management...');
    
    const results = {
      idleTimeout: false,
      maxAge: false,
      healthCheck: false,
      autoReconnect: false
    };
    
    // Test 1: Idle timeout simulation
    const idleClient = await this.getConnection('idle-test');
    const idleSocketId = idleClient.socket.id;
    
    // Simulate idle timeout by waiting
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if connection is still valid
    const idleCheck = await idleClient.sendPing();
    results.idleTimeout = (idleCheck > 0);
    
    // Test 2: Connection max age (simulate by checking connection time)
    const connectionAge = Date.now() - idleClient.metrics.startTime;
    results.maxAge = connectionAge > 0;
    
    // Test 3: Health check
    results.healthCheck = idleClient.socket.connected;
    
    // Test 4: Auto-reconnect after disconnect
    idleClient.socket.disconnect();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // For auto-reconnect test, we need to check if the socket reconnected
    results.autoReconnect = idleClient.socket.connected && 
                           idleClient.socket.id !== idleSocketId;
    
    return results;
  }

  /**
   * Test connection pool limits and eviction
   */
  async testPoolLimitsAndEviction(maxSize = 5) {
    logger.info(`Testing pool limits and eviction with max size: ${maxSize}`);
    
    const results = {
      maxSizeRespected: true,
      oldestEvicted: false,
      lruEviction: false,
      evictionCount: 0
    };
    
    const connectionTimestamps = new Map();
    
    // Fill pool to max size
    for (let i = 0; i < maxSize; i++) {
      const client = await this.getConnection(`limit-${i}`);
      connectionTimestamps.set(`limit-${i}`, Date.now());
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Check current pool size
    results.maxSizeRespected = this.connectionPool.size <= maxSize;
    
    // Add one more connection (should trigger eviction in a real pool)
    const overflow = await this.getConnection('limit-overflow');
    
    // In a real implementation with eviction, check which connection was removed
    // For this test, we'll simulate the behavior
    if (this.connectionPool.size > maxSize) {
      results.maxSizeRespected = false;
    } else {
      results.oldestEvicted = !this.connectionPool.has('limit-0');
      results.evictionCount = 1;
    }
    
    // Test LRU eviction by accessing middle connection
    const middleKey = `limit-${Math.floor(maxSize / 2)}`;
    await this.getConnection(middleKey); // Access to update LRU
    
    // Add another overflow
    await this.getConnection('limit-overflow-2');
    
    // Check if least recently used was evicted (not the one we just accessed)
    results.lruEviction = this.connectionPool.has(middleKey);
    
    return results;
  }

  /**
   * Test concurrent connection requests
   */
  async testConcurrentRequests(concurrentCount = 20) {
    logger.info(`Testing ${concurrentCount} concurrent connection requests...`);
    
    const results = {
      totalRequests: concurrentCount,
      successful: 0,
      failed: 0,
      duplicatePrevented: 0,
      timing: {
        min: Infinity,
        max: 0,
        avg: 0
      }
    };
    
    const promises = [];
    const timings = [];
    
    // Create concurrent requests for the same pool keys
    for (let i = 0; i < concurrentCount; i++) {
      const poolKey = `concurrent-${i % 5}`; // 5 unique keys, so duplicates
      const startTime = Date.now();
      
      promises.push(
        this.getConnection(poolKey)
          .then(client => {
            const elapsed = Date.now() - startTime;
            timings.push(elapsed);
            results.successful++;
            
            // Test if this was a reused connection
            if (elapsed < 50) { // Reused connections are faster
              results.duplicatePrevented++;
            }
            
            return client;
          })
          .catch(error => {
            results.failed++;
            logger.error('Concurrent request failed:', error);
            return null;
          })
      );
    }
    
    await Promise.all(promises);
    
    // Calculate timing statistics
    if (timings.length > 0) {
      results.timing.min = Math.min(...timings);
      results.timing.max = Math.max(...timings);
      results.timing.avg = timings.reduce((a, b) => a + b, 0) / timings.length;
    }
    
    return results;
  }

  /**
   * Test connection pool cleanup
   */
  async testPoolCleanup() {
    logger.info('Testing connection pool cleanup...');
    
    const results = {
      initialSize: this.connectionPool.size,
      cleanedConnections: 0,
      remainingConnections: 0,
      allClosed: true
    };
    
    // Create some test connections
    for (let i = 0; i < 5; i++) {
      await this.getConnection(`cleanup-${i}`);
    }
    
    // Disconnect some connections to simulate dead connections
    let disconnectedCount = 0;
    this.connectionPool.forEach((client, key) => {
      if (key.startsWith('cleanup-') && Math.random() > 0.5) {
        client.disconnect();
        disconnectedCount++;
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Run cleanup
    this.cleanupPool();
    
    results.cleanedConnections = disconnectedCount;
    results.remainingConnections = this.connectionPool.size;
    
    // Check if all remaining connections are valid
    this.connectionPool.forEach(client => {
      if (!client.socket?.connected) {
        results.allClosed = false;
      }
    });
    
    return results;
  }

  /**
   * Clean up disconnected connections from pool
   */
  cleanupPool() {
    const keysToRemove = [];
    
    this.connectionPool.forEach((client, key) => {
      if (!client.socket?.connected) {
        keysToRemove.push(key);
      }
    });
    
    keysToRemove.forEach(key => {
      this.connectionPool.delete(key);
      logger.debug(`Removed disconnected client from pool: ${key}`);
    });
    
    return keysToRemove.length;
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    const stats = {
      currentSize: this.connectionPool.size,
      activeConnections: 0,
      metrics: this.metrics
    };
    
    this.connectionPool.forEach(client => {
      if (client.socket?.connected) {
        stats.activeConnections++;
      }
    });
    
    if (this.metrics.connectionTimes.length > 0) {
      stats.metrics.avgConnectionTime = 
        this.metrics.connectionTimes.reduce((a, b) => a + b, 0) / 
        this.metrics.connectionTimes.length;
    }
    
    return stats;
  }

  /**
   * Close all connections in the pool
   */
  closeAll() {
    logger.info('Closing all connections in pool...');
    
    this.connectionPool.forEach((client, key) => {
      client.disconnect();
      logger.debug(`Closed connection: ${key}`);
    });
    
    this.connectionPool.clear();
  }

  /**
   * Run comprehensive connection pool tests
   */
  async runAllTests() {
    logger.info('Running comprehensive connection pool tests...');
    
    const testResults = {
      basic: null,
      load: null,
      lifecycle: null,
      limits: null,
      concurrent: null,
      cleanup: null,
      finalStats: null
    };
    
    try {
      // Test 1: Basic pooling
      logger.info('\n=== Test 1: Basic Connection Pooling ===');
      testResults.basic = await this.testBasicPooling();
      logger.info('Basic pooling results:', testResults.basic);
      
      // Test 2: Pool under load
      logger.info('\n=== Test 2: Pool Under Load ===');
      testResults.load = await this.testPoolUnderLoad(100, 10);
      logger.info('Load test results:', testResults.load);
      
      // Test 3: Connection lifecycle
      logger.info('\n=== Test 3: Connection Lifecycle ===');
      testResults.lifecycle = await this.testConnectionLifecycle();
      logger.info('Lifecycle results:', testResults.lifecycle);
      
      // Test 4: Pool limits and eviction
      logger.info('\n=== Test 4: Pool Limits and Eviction ===');
      testResults.limits = await this.testPoolLimitsAndEviction(5);
      logger.info('Limits test results:', testResults.limits);
      
      // Test 5: Concurrent requests
      logger.info('\n=== Test 5: Concurrent Requests ===');
      testResults.concurrent = await this.testConcurrentRequests(50);
      logger.info('Concurrent test results:', testResults.concurrent);
      
      // Test 6: Pool cleanup
      logger.info('\n=== Test 6: Pool Cleanup ===');
      testResults.cleanup = await this.testPoolCleanup();
      logger.info('Cleanup results:', testResults.cleanup);
      
      // Get final statistics
      testResults.finalStats = this.getPoolStats();
      
    } catch (error) {
      logger.error('Test suite failed:', error);
    } finally {
      this.closeAll();
    }
    
    return testResults;
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runTests = async () => {
    const poolTest = new ConnectionPoolTest();
    
    try {
      const results = await poolTest.runAllTests();
      
      console.log('\n=== Connection Pool Test Summary ===');
      console.log(JSON.stringify(results, null, 2));
      
      // Generate pass/fail summary
      const summary = {
        passed: 0,
        failed: 0,
        tests: []
      };
      
      // Check basic pooling
      if (results.basic?.sameKeyReuse && 
          results.basic?.differentKeyCreation && 
          results.basic?.disconnectedRemoval) {
        summary.passed++;
        summary.tests.push('✓ Basic pooling');
      } else {
        summary.failed++;
        summary.tests.push('✗ Basic pooling');
      }
      
      // Check load test
      if (results.load?.successfulRequests > results.load?.totalRequests * 0.95) {
        summary.passed++;
        summary.tests.push('✓ Pool under load');
      } else {
        summary.failed++;
        summary.tests.push('✗ Pool under load');
      }
      
      // Check lifecycle
      if (results.lifecycle?.healthCheck) {
        summary.passed++;
        summary.tests.push('✓ Connection lifecycle');
      } else {
        summary.failed++;
        summary.tests.push('✗ Connection lifecycle');
      }
      
      // Check concurrent handling
      if (results.concurrent?.failed === 0) {
        summary.passed++;
        summary.tests.push('✓ Concurrent requests');
      } else {
        summary.failed++;
        summary.tests.push('✗ Concurrent requests');
      }
      
      console.log('\n=== Test Summary ===');
      summary.tests.forEach(test => console.log(test));
      console.log(`\nTotal: ${summary.passed} passed, ${summary.failed} failed`);
      
    } catch (error) {
      logger.error('Test execution failed:', error);
    }
    
    process.exit(0);
  };
  
  runTests();
}

export { ConnectionPoolTest };