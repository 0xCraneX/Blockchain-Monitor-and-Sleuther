import { WebSocketTestClient } from './websocket-test-client.js';
import { WebSocketStressTest } from './stress-test.js';
import { ConnectionPoolTest } from './connection-pool-test.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GraphWebSocket } from '../../../src/services/GraphWebSocket.js';
import { logger } from '../../../src/utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Comprehensive WebSocket Test Suite Runner
 * Runs all WebSocket tests and generates a comprehensive report
 */
class WebSocketTestRunner {
  constructor() {
    this.server = null;
    this.io = null;
    this.graphWebSocket = null;
    this.port = null;
    this.results = {
      startTime: new Date(),
      endTime: null,
      tests: {},
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      }
    };
  }

  /**
   * Start test server
   */
  async startServer() {
    this.server = createServer();
    this.io = new Server(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      },
      // Configure for stress testing
      pingTimeout: 60000,
      pingInterval: 25000,
      upgradeTimeout: 30000,
      maxHttpBufferSize: 1e8 // 100 MB
    });

    this.graphWebSocket = new GraphWebSocket();
    this.graphWebSocket.initializeHandlers(this.io);

    return new Promise((resolve) => {
      this.server.listen(0, () => {
        this.port = this.server.address().port;
        logger.info(`Test server started on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop test server
   */
  async stopServer() {
    if (this.io) {
      this.io.close();
    }
    if (this.server) {
      this.server.close();
    }
    logger.info('Test server stopped');
  }

  /**
   * Run functionality tests
   */
  async runFunctionalityTests() {
    logger.info('\n========== FUNCTIONALITY TESTS ==========');
    
    const client = new WebSocketTestClient(`http://localhost:${this.port}`);
    const results = {
      connection: { passed: 0, failed: 0 },
      authentication: { passed: 0, failed: 0 },
      subscriptions: { passed: 0, failed: 0 },
      realTimeUpdates: { passed: 0, failed: 0 },
      streaming: { passed: 0, failed: 0 },
      errorHandling: { passed: 0, failed: 0 }
    };

    try {
      // Test 1: Connection
      logger.info('\n--- Testing Connection ---');
      try {
        await client.connect();
        results.connection.passed++;
        logger.info('✓ Basic connection established');
      } catch (error) {
        results.connection.failed++;
        logger.error('✗ Basic connection failed:', error.message);
      }

      // Test 2: Authentication (if implemented)
      logger.info('\n--- Testing Authentication ---');
      // Note: Authentication not implemented in current WebSocket service
      logger.info('⚠ Authentication not implemented - skipping');
      
      // Test 3: Subscriptions
      logger.info('\n--- Testing Subscriptions ---');
      
      // Address subscription
      try {
        const addr = '1test123subscription';
        await client.subscribeToAddress(addr);
        results.subscriptions.passed++;
        logger.info('✓ Address subscription successful');
      } catch (error) {
        results.subscriptions.failed++;
        logger.error('✗ Address subscription failed:', error.message);
      }

      // Pattern subscription
      try {
        await client.subscribeToPatterns();
        results.subscriptions.passed++;
        logger.info('✓ Pattern subscription successful');
      } catch (error) {
        results.subscriptions.failed++;
        logger.error('✗ Pattern subscription failed:', error.message);
      }

      // Unsubscription
      try {
        await client.unsubscribeFromAddress('1test123subscription');
        await client.unsubscribeFromPatterns();
        results.subscriptions.passed++;
        logger.info('✓ Unsubscription successful');
      } catch (error) {
        results.subscriptions.failed++;
        logger.error('✗ Unsubscription failed:', error.message);
      }

      // Test 4: Real-time updates
      logger.info('\n--- Testing Real-time Updates ---');
      
      // Subscribe and wait for update
      const testAddr = '1realtime123test';
      await client.subscribeToAddress(testAddr);
      
      // Trigger updates from server
      setTimeout(() => {
        this.graphWebSocket.broadcastNodeUpdate(testAddr, {
          balance: '1000000000000',
          riskScore: 0.5
        });
        
        this.graphWebSocket.broadcastEdgeAdded({
          id: 'edge123',
          source: testAddr,
          target: '1target123',
          volume: '500000000000'
        });
      }, 100);

      // Wait for updates
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const graphUpdates = client.receivedMessages.filter(m => m.type === 'graph:update');
      if (graphUpdates.length >= 2) {
        results.realTimeUpdates.passed++;
        logger.info(`✓ Real-time updates received: ${graphUpdates.length} updates`);
      } else {
        results.realTimeUpdates.failed++;
        logger.error(`✗ Real-time updates failed: only ${graphUpdates.length} updates received`);
      }

      // Test 5: Graph streaming
      logger.info('\n--- Testing Graph Streaming ---');
      
      try {
        const streamResults = await client.streamGraph('1stream123test', 2, '0');
        if (streamResults.started && streamResults.completed) {
          results.streaming.passed++;
          logger.info('✓ Graph streaming successful');
        } else {
          results.streaming.failed++;
          logger.error('✗ Graph streaming incomplete');
        }
      } catch (error) {
        results.streaming.failed++;
        logger.error('✗ Graph streaming failed:', error.message);
      }

      // Test 6: Error handling
      logger.info('\n--- Testing Error Handling ---');
      
      // Test invalid subscription
      client.socket.emit('subscribe:address', { address: null });
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const errors = client.receivedMessages.filter(m => m.type === 'error');
      if (errors.length > 0) {
        results.errorHandling.passed++;
        logger.info('✓ Error handling working correctly');
      } else {
        results.errorHandling.failed++;
        logger.error('✗ Error handling not working');
      }

    } finally {
      client.disconnect();
    }

    return results;
  }

  /**
   * Run stress tests
   */
  async runStressTests() {
    logger.info('\n========== STRESS TESTS ==========');
    
    const stressTest = new WebSocketStressTest(`http://localhost:${this.port}`);
    
    const results = await stressTest.runStressTest({
      clientCount: 50,  // Reduced for faster testing
      testDuration: 30000,
      messagesPerSecond: 500
    });

    // Log key metrics
    logger.info('\nStress Test Results:');
    logger.info(`- Peak Connections: ${results.summary.peakConnections}`);
    logger.info(`- Total Messages: ${results.summary.totalMessages}`);
    logger.info(`- Error Rate: ${results.summary.errorRate}`);
    logger.info(`- Memory Growth: ${results.results.memoryLeak?.heapGrowthMB}MB`);
    
    return results;
  }

  /**
   * Run connection pool tests
   */
  async runConnectionPoolTests() {
    logger.info('\n========== CONNECTION POOL TESTS ==========');
    
    const poolTest = new ConnectionPoolTest(`http://localhost:${this.port}`);
    const results = await poolTest.runAllTests();
    
    return results;
  }

  /**
   * Run reconnection tests
   */
  async runReconnectionTests() {
    logger.info('\n========== RECONNECTION TESTS ==========');
    
    const client = new WebSocketTestClient(`http://localhost:${this.port}`, {
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000
    });

    const results = {
      autoReconnect: false,
      dataPreservation: false,
      reconnectTime: 0
    };

    try {
      // Connect and subscribe
      await client.connect();
      await client.subscribeToAddress('1reconnect123test');
      
      const initialSocketId = client.socket.id;
      const initialSubs = new Set(client.subscriptions);

      // Force disconnect
      const disconnectTime = Date.now();
      client.socket.disconnect();

      // Wait for auto-reconnect
      await new Promise(resolve => {
        client.socket.once('reconnect', () => {
          results.reconnectTime = Date.now() - disconnectTime;
          resolve();
        });
      });

      results.autoReconnect = client.socket.connected && 
                             client.socket.id !== initialSocketId;
      
      // Check if subscriptions are preserved (would need server support)
      results.dataPreservation = client.subscriptions.size === initialSubs.size;

      logger.info('Reconnection test results:', results);

    } finally {
      client.disconnect();
    }

    return results;
  }

  /**
   * Run heartbeat tests
   */
  async runHeartbeatTests() {
    logger.info('\n========== HEARTBEAT TESTS ==========');
    
    const client = new WebSocketTestClient(`http://localhost:${this.port}`);
    const results = {
      avgLatency: 0,
      maxLatency: 0,
      minLatency: Infinity,
      consistency: true
    };

    try {
      await client.connect();
      
      const latencies = [];
      
      // Send multiple pings
      for (let i = 0; i < 20; i++) {
        const latency = await client.sendPing();
        latencies.push(latency);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      results.avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      results.maxLatency = Math.max(...latencies);
      results.minLatency = Math.min(...latencies);
      
      // Check consistency (all latencies within reasonable range)
      const variance = results.maxLatency - results.minLatency;
      results.consistency = variance < 50; // Within 50ms variance

      logger.info('Heartbeat test results:', {
        ...results,
        samples: latencies.length
      });

    } finally {
      client.disconnect();
    }

    return results;
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    const report = `
# WebSocket Comprehensive Test Report

**Generated:** ${this.results.endTime.toISOString()}  
**Duration:** ${(this.results.endTime - this.results.startTime) / 1000}s

## Executive Summary

- **Total Tests Run:** ${this.results.summary.total}
- **Passed:** ${this.results.summary.passed}
- **Failed:** ${this.results.summary.failed}
- **Success Rate:** ${(this.results.summary.passed / this.results.summary.total * 100).toFixed(2)}%

## Test Results

### 1. Functionality Tests
${this.formatFunctionalityResults(this.results.tests.functionality)}

### 2. Stress Test Results
${this.formatStressResults(this.results.tests.stress)}

### 3. Connection Pool Tests
${this.formatPoolResults(this.results.tests.connectionPool)}

### 4. Reconnection Tests
${this.formatReconnectionResults(this.results.tests.reconnection)}

### 5. Heartbeat Tests
${this.formatHeartbeatResults(this.results.tests.heartbeat)}

## Recommendations

${this.generateRecommendations()}

## Conclusion

${this.generateConclusion()}
`;

    return report;
  }

  formatFunctionalityResults(results) {
    if (!results) return 'No functionality test results available';
    
    let output = '';
    for (const [category, result] of Object.entries(results)) {
      const total = result.passed + result.failed;
      const rate = total > 0 ? (result.passed / total * 100).toFixed(0) : 0;
      output += `\n#### ${category}\n`;
      output += `- Passed: ${result.passed}/${total} (${rate}%)\n`;
    }
    return output;
  }

  formatStressResults(results) {
    if (!results) return 'No stress test results available';
    
    return `
- **Peak Connections:** ${results.summary.peakConnections}
- **Total Messages:** ${results.summary.totalMessages}
- **Error Rate:** ${results.summary.errorRate}
- **Connection Success Rate:** ${results.results.connection.successRate}
- **Memory Growth:** ${results.results.memoryLeak?.heapGrowthMB}MB
- **Possible Memory Leak:** ${results.results.memoryLeak?.possibleLeak ? 'YES ⚠️' : 'NO ✓'}
- **Message Ordering:** ${results.results.messageOrdering?.inOrder ? 'Preserved ✓' : 'Lost ⚠️'}
`;
  }

  formatPoolResults(results) {
    if (!results) return 'No connection pool test results available';
    
    return `
- **Basic Pooling:** ${results.basic?.sameKeyReuse ? 'Working ✓' : 'Failed ✗'}
- **Load Handling:** ${results.load?.successfulRequests}/${results.load?.totalRequests} requests
- **Hit Rate:** ${results.load?.hitRate}
- **Concurrent Handling:** ${results.concurrent?.failed === 0 ? 'Good ✓' : 'Issues ⚠️'}
- **Cleanup:** ${results.cleanup?.allClosed ? 'Working ✓' : 'Issues ⚠️'}
`;
  }

  formatReconnectionResults(results) {
    if (!results) return 'No reconnection test results available';
    
    return `
- **Auto-reconnect:** ${results.autoReconnect ? 'Working ✓' : 'Failed ✗'}
- **Reconnect Time:** ${results.reconnectTime}ms
- **Data Preservation:** ${results.dataPreservation ? 'Yes ✓' : 'No ✗'}
`;
  }

  formatHeartbeatResults(results) {
    if (!results) return 'No heartbeat test results available';
    
    return `
- **Average Latency:** ${results.avgLatency.toFixed(2)}ms
- **Min/Max Latency:** ${results.minLatency}ms / ${results.maxLatency}ms
- **Consistency:** ${results.consistency ? 'Good ✓' : 'Variable ⚠️'}
`;
  }

  generateRecommendations() {
    const recommendations = [];
    
    // Check functionality test results
    const func = this.results.tests.functionality;
    if (func) {
      for (const [category, result] of Object.entries(func)) {
        if (result.failed > 0) {
          recommendations.push(`- Fix ${category} issues (${result.failed} failures)`);
        }
      }
    }

    // Check stress test results
    const stress = this.results.tests.stress;
    if (stress) {
      if (parseFloat(stress.summary.errorRate) > 5) {
        recommendations.push('- High error rate under load - review error handling and capacity');
      }
      if (stress.results.memoryLeak?.possibleLeak) {
        recommendations.push('- Investigate potential memory leak');
      }
      if (!stress.results.messageOrdering?.inOrder) {
        recommendations.push('- Fix message ordering issues');
      }
    }

    // Check reconnection
    const reconnect = this.results.tests.reconnection;
    if (reconnect && !reconnect.dataPreservation) {
      recommendations.push('- Implement subscription state preservation on reconnect');
    }

    return recommendations.length > 0 
      ? recommendations.join('\n')
      : '- All tests passed within acceptable parameters';
  }

  generateConclusion() {
    const successRate = (this.results.summary.passed / this.results.summary.total * 100).toFixed(0);
    
    if (successRate >= 95) {
      return 'The WebSocket implementation is robust and production-ready.';
    } else if (successRate >= 80) {
      return 'The WebSocket implementation is functional but has some issues that should be addressed.';
    } else {
      return 'The WebSocket implementation requires significant improvements before production use.';
    }
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    try {
      await this.startServer();

      // Run each test suite
      this.results.tests.functionality = await this.runFunctionalityTests();
      this.results.tests.stress = await this.runStressTests();
      this.results.tests.connectionPool = await this.runConnectionPoolTests();
      this.results.tests.reconnection = await this.runReconnectionTests();
      this.results.tests.heartbeat = await this.runHeartbeatTests();

      // Calculate summary
      this.calculateSummary();

      this.results.endTime = new Date();

      // Generate and save report
      const report = this.generateReport();
      const reportPath = path.join(process.cwd(), `websocket-test-report-${Date.now()}.md`);
      await fs.writeFile(reportPath, report);
      
      logger.info(`\nTest report saved to: ${reportPath}`);
      console.log('\n' + report);

    } finally {
      await this.stopServer();
    }
  }

  calculateSummary() {
    let total = 0;
    let passed = 0;

    // Count functionality tests
    const func = this.results.tests.functionality;
    if (func) {
      for (const result of Object.values(func)) {
        total += result.passed + result.failed;
        passed += result.passed;
      }
    }

    // Count stress test as single test
    if (this.results.tests.stress) {
      total++;
      if (parseFloat(this.results.tests.stress.summary.errorRate) < 5) {
        passed++;
      }
    }

    // Count pool tests
    const pool = this.results.tests.connectionPool;
    if (pool) {
      total++;
      if (pool.basic?.sameKeyReuse && pool.concurrent?.failed === 0) {
        passed++;
      }
    }

    // Count reconnection test
    if (this.results.tests.reconnection) {
      total++;
      if (this.results.tests.reconnection.autoReconnect) {
        passed++;
      }
    }

    // Count heartbeat test
    if (this.results.tests.heartbeat) {
      total++;
      if (this.results.tests.heartbeat.consistency) {
        passed++;
      }
    }

    this.results.summary.total = total;
    this.results.summary.passed = passed;
    this.results.summary.failed = total - passed;
  }
}

// Run all tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new WebSocketTestRunner();
  runner.runAllTests().catch(console.error);
}

export { WebSocketTestRunner };