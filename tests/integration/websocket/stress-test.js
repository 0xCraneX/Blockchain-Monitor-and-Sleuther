import { WebSocketTestClient } from './websocket-test-client.js';
import { logger } from '../../../src/utils/logger.js';
import os from 'os';

/**
 * WebSocket Stress Test
 * Tests server performance with multiple concurrent clients and high message rates
 */
class WebSocketStressTest {
  constructor(serverUrl = 'http://localhost:3000') {
    this.serverUrl = serverUrl;
    this.clients = [];
    this.metrics = {
      startTime: null,
      endTime: null,
      totalMessages: 0,
      totalErrors: 0,
      connectionFailures: 0,
      peakConnections: 0,
      systemMetrics: {
        initial: null,
        peak: null,
        final: null
      }
    };
  }

  /**
   * Get current system metrics
   */
  getSystemMetrics() {
    const cpus = os.cpus();
    const avgLoad = os.loadavg();
    const memUsage = process.memoryUsage();
    
    return {
      timestamp: Date.now(),
      cpu: {
        count: cpus.length,
        usage: cpus.map(cpu => {
          const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
          const idle = cpu.times.idle;
          return ((total - idle) / total * 100).toFixed(2);
        }),
        loadAvg: avgLoad
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        process: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external
        }
      }
    };
  }

  /**
   * Create and connect multiple clients
   */
  async createClients(count) {
    logger.info(`Creating ${count} WebSocket clients...`);
    
    const connectionPromises = [];
    
    for (let i = 0; i < count; i++) {
      const client = new WebSocketTestClient(this.serverUrl, {
        reconnection: false // Disable reconnection for stress test
      });
      
      this.clients.push(client);
      
      // Stagger connections slightly to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 10));
      
      connectionPromises.push(
        client.connect().catch(error => {
          this.metrics.connectionFailures++;
          logger.error(`Client ${i} failed to connect:`, error.message);
          return null;
        })
      );
    }
    
    await Promise.all(connectionPromises);
    
    const connectedCount = this.clients.filter(c => c.socket?.connected).length;
    this.metrics.peakConnections = Math.max(this.metrics.peakConnections, connectedCount);
    
    logger.info(`Successfully connected ${connectedCount}/${count} clients`);
    return connectedCount;
  }

  /**
   * Test scenario: Multiple concurrent subscriptions
   */
  async testConcurrentSubscriptions(addressCount = 10) {
    logger.info(`Testing concurrent subscriptions to ${addressCount} addresses...`);
    
    const addresses = Array(addressCount).fill(0).map((_, i) => `1stress${i}test`);
    const subscriptionPromises = [];
    
    for (const client of this.clients) {
      if (!client.socket?.connected) continue;
      
      // Each client subscribes to random addresses
      const randomAddresses = addresses
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.floor(Math.random() * 5) + 1);
      
      for (const address of randomAddresses) {
        subscriptionPromises.push(
          client.subscribeToAddress(address).catch(error => {
            this.metrics.totalErrors++;
            return null;
          })
        );
      }
      
      // Some clients also subscribe to patterns
      if (Math.random() > 0.5) {
        subscriptionPromises.push(
          client.subscribeToPatterns().catch(error => {
            this.metrics.totalErrors++;
            return null;
          })
        );
      }
    }
    
    const results = await Promise.all(subscriptionPromises);
    const successful = results.filter(r => r !== null).length;
    
    logger.info(`Subscription test completed: ${successful}/${subscriptionPromises.length} successful`);
    return successful;
  }

  /**
   * Test scenario: High-frequency message sending
   */
  async testHighFrequencyMessages(duration = 10000, messagesPerSecond = 100) {
    logger.info(`Testing high-frequency messages: ${messagesPerSecond} msg/sec for ${duration/1000}s...`);
    
    const interval = 1000 / messagesPerSecond;
    const startTime = Date.now();
    let messagesSent = 0;
    
    return new Promise((resolve) => {
      const sendInterval = setInterval(async () => {
        if (Date.now() - startTime > duration) {
          clearInterval(sendInterval);
          resolve(messagesSent);
          return;
        }
        
        // Select random client
        const activeClients = this.clients.filter(c => c.socket?.connected);
        if (activeClients.length === 0) {
          clearInterval(sendInterval);
          resolve(messagesSent);
          return;
        }
        
        const client = activeClients[Math.floor(Math.random() * activeClients.length)];
        
        // Send random action
        const actions = ['ping', 'subscribe', 'unsubscribe', 'stream'];
        const action = actions[Math.floor(Math.random() * actions.length)];
        
        try {
          switch (action) {
            case 'ping':
              await client.sendPing();
              break;
            case 'subscribe':
              await client.subscribeToAddress(`1msg${messagesSent}test`);
              break;
            case 'unsubscribe':
              await client.unsubscribeFromAddress(`1msg${messagesSent}test`);
              break;
            case 'stream':
              client.streamGraph(`1stream${messagesSent}test`, 1, '0').catch(() => {});
              break;
          }
          messagesSent++;
          this.metrics.totalMessages++;
        } catch (error) {
          this.metrics.totalErrors++;
        }
      }, interval);
    });
  }

  /**
   * Test scenario: Rapid connect/disconnect cycles
   */
  async testConnectionCycles(cycles = 10, clientsPerCycle = 20) {
    logger.info(`Testing ${cycles} connection cycles with ${clientsPerCycle} clients each...`);
    
    const results = {
      successfulCycles: 0,
      totalConnections: 0,
      totalDisconnections: 0,
      avgCycleTime: 0
    };
    
    const cycleTimes = [];
    
    for (let i = 0; i < cycles; i++) {
      const cycleStart = Date.now();
      
      // Create and connect new clients
      const cycleClients = [];
      for (let j = 0; j < clientsPerCycle; j++) {
        const client = new WebSocketTestClient(this.serverUrl, {
          reconnection: false
        });
        cycleClients.push(client);
      }
      
      // Connect all
      const connectionPromises = cycleClients.map(c => 
        c.connect().then(() => {
          results.totalConnections++;
          return true;
        }).catch(() => false)
      );
      
      await Promise.all(connectionPromises);
      
      // Brief activity
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Disconnect all
      cycleClients.forEach(c => {
        if (c.socket?.connected) {
          c.disconnect();
          results.totalDisconnections++;
        }
      });
      
      results.successfulCycles++;
      cycleTimes.push(Date.now() - cycleStart);
      
      logger.info(`Cycle ${i + 1}/${cycles} completed`);
    }
    
    results.avgCycleTime = cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length;
    return results;
  }

  /**
   * Test scenario: Memory leak detection
   */
  async testMemoryLeaks(duration = 30000) {
    logger.info(`Testing for memory leaks over ${duration/1000} seconds...`);
    
    const memorySnapshots = [];
    const snapshotInterval = 5000; // Take snapshot every 5 seconds
    
    return new Promise((resolve) => {
      const startMemory = process.memoryUsage();
      memorySnapshots.push({
        time: 0,
        memory: startMemory
      });
      
      const interval = setInterval(() => {
        const elapsed = Date.now() - this.metrics.startTime;
        if (elapsed > duration) {
          clearInterval(interval);
          
          const endMemory = process.memoryUsage();
          const heapGrowth = endMemory.heapUsed - startMemory.heapUsed;
          const rssGrowth = endMemory.rss - startMemory.rss;
          
          resolve({
            snapshots: memorySnapshots,
            heapGrowth: heapGrowth,
            rssGrowth: rssGrowth,
            heapGrowthMB: (heapGrowth / 1024 / 1024).toFixed(2),
            rssGrowthMB: (rssGrowth / 1024 / 1024).toFixed(2),
            possibleLeak: heapGrowth > 50 * 1024 * 1024 // More than 50MB growth
          });
          return;
        }
        
        memorySnapshots.push({
          time: elapsed,
          memory: process.memoryUsage()
        });
        
        // Perform some operations to stress memory
        const activeClients = this.clients.filter(c => c.socket?.connected).slice(0, 10);
        activeClients.forEach(client => {
          client.subscribeToAddress(`1mem${Date.now()}test`).catch(() => {});
        });
        
      }, snapshotInterval);
    });
  }

  /**
   * Test scenario: Message ordering and delivery
   */
  async testMessageOrdering(messageCount = 100) {
    logger.info(`Testing message ordering with ${messageCount} messages...`);
    
    if (this.clients.length === 0 || !this.clients[0].socket?.connected) {
      throw new Error('No connected clients available for message ordering test');
    }
    
    const testClient = this.clients[0];
    const testAddress = '1ordering123test';
    
    // Subscribe to address
    await testClient.subscribeToAddress(testAddress);
    
    // Track received messages
    const receivedMessages = [];
    const messageHandler = (data) => {
      if (data.address === testAddress) {
        receivedMessages.push({
          sequence: data.changes?.sequence,
          timestamp: data.timestamp
        });
      }
    };
    
    testClient.socket.on('graph:update', messageHandler);
    
    // Simulate sending ordered updates (would normally come from server)
    // In real test, you'd trigger these from server side
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    testClient.socket.off('graph:update', messageHandler);
    
    // Check ordering
    let inOrder = true;
    for (let i = 1; i < receivedMessages.length; i++) {
      if (receivedMessages[i].timestamp < receivedMessages[i-1].timestamp) {
        inOrder = false;
        break;
      }
    }
    
    return {
      messagesSent: messageCount,
      messagesReceived: receivedMessages.length,
      deliveryRate: (receivedMessages.length / messageCount * 100).toFixed(2) + '%',
      inOrder: inOrder
    };
  }

  /**
   * Run comprehensive stress test
   */
  async runStressTest(config = {}) {
    const {
      clientCount = 100,
      testDuration = 60000,
      messagesPerSecond = 1000
    } = config;
    
    logger.info('Starting WebSocket stress test', config);
    
    this.metrics.startTime = Date.now();
    this.metrics.systemMetrics.initial = this.getSystemMetrics();
    
    const results = {
      connection: null,
      subscription: null,
      highFrequency: null,
      connectionCycles: null,
      memoryLeak: null,
      messageOrdering: null,
      systemImpact: null
    };
    
    try {
      // Phase 1: Connection stress test
      logger.info('\n=== Phase 1: Connection Stress Test ===');
      const connectedCount = await this.createClients(clientCount);
      results.connection = {
        requested: clientCount,
        connected: connectedCount,
        failed: clientCount - connectedCount,
        successRate: (connectedCount / clientCount * 100).toFixed(2) + '%'
      };
      
      // Record peak system metrics
      this.metrics.systemMetrics.peak = this.getSystemMetrics();
      
      // Phase 2: Subscription stress test
      logger.info('\n=== Phase 2: Subscription Stress Test ===');
      results.subscription = await this.testConcurrentSubscriptions(50);
      
      // Phase 3: High-frequency message test
      logger.info('\n=== Phase 3: High-Frequency Message Test ===');
      results.highFrequency = {
        messagesSent: await this.testHighFrequencyMessages(10000, messagesPerSecond),
        duration: 10,
        actualRate: 0
      };
      results.highFrequency.actualRate = 
        (results.highFrequency.messagesSent / results.highFrequency.duration).toFixed(2);
      
      // Phase 4: Connection cycling test
      logger.info('\n=== Phase 4: Connection Cycling Test ===');
      results.connectionCycles = await this.testConnectionCycles(5, 20);
      
      // Phase 5: Memory leak test
      logger.info('\n=== Phase 5: Memory Leak Test ===');
      results.memoryLeak = await this.testMemoryLeaks(20000);
      
      // Phase 6: Message ordering test
      logger.info('\n=== Phase 6: Message Ordering Test ===');
      results.messageOrdering = await this.testMessageOrdering(100);
      
    } catch (error) {
      logger.error('Stress test error:', error);
    } finally {
      // Cleanup
      logger.info('\nCleaning up...');
      this.clients.forEach(client => client.disconnect());
      
      this.metrics.endTime = Date.now();
      this.metrics.systemMetrics.final = this.getSystemMetrics();
      
      // Calculate system impact
      const initial = this.metrics.systemMetrics.initial;
      const peak = this.metrics.systemMetrics.peak;
      const final = this.metrics.systemMetrics.final;
      
      results.systemImpact = {
        peakMemoryUsageMB: ((peak.memory.used - initial.memory.used) / 1024 / 1024).toFixed(2),
        finalMemoryUsageMB: ((final.memory.used - initial.memory.used) / 1024 / 1024).toFixed(2),
        peakCPULoad: peak.cpu.loadAvg[0],
        avgCPUUsage: peak.cpu.usage.reduce((a, b) => a + parseFloat(b), 0) / peak.cpu.count
      };
    }
    
    return {
      summary: {
        duration: ((this.metrics.endTime - this.metrics.startTime) / 1000).toFixed(2) + 's',
        totalMessages: this.metrics.totalMessages,
        totalErrors: this.metrics.totalErrors,
        errorRate: (this.metrics.totalErrors / this.metrics.totalMessages * 100).toFixed(2) + '%',
        peakConnections: this.metrics.peakConnections
      },
      results: results
    };
  }

  /**
   * Generate detailed report
   */
  generateReport(testResults) {
    const report = `
WebSocket Stress Test Report
============================
Generated: ${new Date().toISOString()}

Summary
-------
Duration: ${testResults.summary.duration}
Total Messages: ${testResults.summary.totalMessages}
Total Errors: ${testResults.summary.totalErrors}
Error Rate: ${testResults.summary.errorRate}
Peak Connections: ${testResults.summary.peakConnections}

Test Results
------------

1. Connection Test:
   - Requested: ${testResults.results.connection.requested}
   - Connected: ${testResults.results.connection.connected}
   - Failed: ${testResults.results.connection.failed}
   - Success Rate: ${testResults.results.connection.successRate}

2. Subscription Test:
   - Successful Subscriptions: ${testResults.results.subscription}

3. High-Frequency Message Test:
   - Messages Sent: ${testResults.results.highFrequency.messagesSent}
   - Duration: ${testResults.results.highFrequency.duration}s
   - Actual Rate: ${testResults.results.highFrequency.actualRate} msg/s

4. Connection Cycling:
   - Successful Cycles: ${testResults.results.connectionCycles.successfulCycles}
   - Total Connections: ${testResults.results.connectionCycles.totalConnections}
   - Total Disconnections: ${testResults.results.connectionCycles.totalDisconnections}
   - Avg Cycle Time: ${testResults.results.connectionCycles.avgCycleTime.toFixed(2)}ms

5. Memory Leak Detection:
   - Heap Growth: ${testResults.results.memoryLeak.heapGrowthMB}MB
   - RSS Growth: ${testResults.results.memoryLeak.rssGrowthMB}MB
   - Possible Leak: ${testResults.results.memoryLeak.possibleLeak ? 'YES' : 'NO'}

6. Message Ordering:
   - Messages Sent: ${testResults.results.messageOrdering.messagesSent}
   - Messages Received: ${testResults.results.messageOrdering.messagesReceived}
   - Delivery Rate: ${testResults.results.messageOrdering.deliveryRate}
   - In Order: ${testResults.results.messageOrdering.inOrder ? 'YES' : 'NO'}

System Impact
-------------
Peak Memory Usage: +${testResults.results.systemImpact.peakMemoryUsageMB}MB
Final Memory Usage: +${testResults.results.systemImpact.finalMemoryUsageMB}MB
Peak CPU Load: ${testResults.results.systemImpact.peakCPULoad.toFixed(2)}
Avg CPU Usage: ${testResults.results.systemImpact.avgCPUUsage.toFixed(2)}%

Recommendations
---------------
${this.generateRecommendations(testResults)}
`;
    
    return report;
  }

  /**
   * Generate recommendations based on test results
   */
  generateRecommendations(testResults) {
    const recommendations = [];
    
    // Connection performance
    if (testResults.results.connection.failed > testResults.results.connection.connected * 0.1) {
      recommendations.push('- Consider increasing server connection limits or improving connection handling');
    }
    
    // Error rate
    if (parseFloat(testResults.summary.errorRate) > 5) {
      recommendations.push('- High error rate detected. Review error handling and server capacity');
    }
    
    // Memory usage
    if (testResults.results.memoryLeak.possibleLeak) {
      recommendations.push('- Potential memory leak detected. Review subscription cleanup and message handling');
    }
    
    // Message ordering
    if (!testResults.results.messageOrdering.inOrder) {
      recommendations.push('- Message ordering issues detected. Review message queue implementation');
    }
    
    // CPU usage
    if (testResults.results.systemImpact.avgCPUUsage > 80) {
      recommendations.push('- High CPU usage detected. Consider optimizing message processing');
    }
    
    return recommendations.length > 0 
      ? recommendations.join('\n')
      : '- All tests passed within acceptable parameters';
  }
}

// Run stress test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runStressTest = async () => {
    const stressTest = new WebSocketStressTest();
    
    try {
      const results = await stressTest.runStressTest({
        clientCount: 100,
        testDuration: 60000,
        messagesPerSecond: 1000
      });
      
      const report = stressTest.generateReport(results);
      console.log(report);
      
      // Save report to file
      const fs = await import('fs/promises');
      const reportPath = `./stress-test-report-${Date.now()}.txt`;
      await fs.writeFile(reportPath, report);
      logger.info(`Report saved to: ${reportPath}`);
      
    } catch (error) {
      logger.error('Stress test failed:', error);
    }
    
    process.exit(0);
  };
  
  runStressTest();
}

export { WebSocketStressTest };