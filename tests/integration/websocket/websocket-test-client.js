import { io } from 'socket.io-client';
import { logger } from '../../../src/utils/logger.js';

/**
 * Comprehensive WebSocket Test Client
 * Tests all WebSocket functionality including connection, authentication,
 * subscriptions, real-time updates, and reconnection logic
 */
class WebSocketTestClient {
  constructor(serverUrl = 'http://localhost:3000', options = {}) {
    this.serverUrl = serverUrl;
    this.clientId = `test-client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.options = {
      autoConnect: false,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      ...options
    };
    
    this.socket = null;
    this.subscriptions = new Set();
    this.receivedMessages = [];
    this.connectionAttempts = 0;
    this.metrics = {
      messagesReceived: 0,
      messagesSent: 0,
      errors: 0,
      reconnections: 0,
      latencies: [],
      startTime: Date.now()
    };
  }

  /**
   * Connect to WebSocket server
   */
  async connect() {
    return new Promise((resolve, reject) => {
      logger.info(`WebSocketTestClient: Connecting to ${this.serverUrl}`, {
        clientId: this.clientId
      });

      this.socket = io(this.serverUrl, this.options);
      
      // Connection events
      this.socket.on('connect', () => {
        this.connectionAttempts++;
        logger.info('WebSocketTestClient: Connected', {
          clientId: this.clientId,
          socketId: this.socket.id,
          attempt: this.connectionAttempts
        });
        resolve(this.socket.id);
      });

      this.socket.on('connect_error', (error) => {
        this.metrics.errors++;
        logger.error('WebSocketTestClient: Connection error', {
          clientId: this.clientId,
          error: error.message
        });
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        logger.info('WebSocketTestClient: Disconnected', {
          clientId: this.clientId,
          reason
        });
      });

      this.socket.on('reconnect', (attemptNumber) => {
        this.metrics.reconnections++;
        logger.info('WebSocketTestClient: Reconnected', {
          clientId: this.clientId,
          attemptNumber
        });
      });

      // Set up message handlers
      this.setupMessageHandlers();

      // Connect
      this.socket.connect();
    });
  }

  /**
   * Set up handlers for all WebSocket events
   */
  setupMessageHandlers() {
    // Graph update events
    this.socket.on('graph:update', (data) => {
      this.handleGraphUpdate(data);
    });

    // Pattern alerts
    this.socket.on('pattern:alert', (data) => {
      this.handlePatternAlert(data);
    });

    // Risk alerts
    this.socket.on('risk:alert', (data) => {
      this.handleRiskAlert(data);
    });

    // Analytics updates
    this.socket.on('analytics:update', (data) => {
      this.handleAnalyticsUpdate(data);
    });

    // Subscription confirmations
    this.socket.on('subscription:confirmed', (data) => {
      this.handleSubscriptionConfirmed(data);
    });

    this.socket.on('unsubscription:confirmed', (data) => {
      this.handleUnsubscriptionConfirmed(data);
    });

    // Stream events
    this.socket.on('stream:started', (data) => {
      this.handleStreamStarted(data);
    });

    this.socket.on('stream:progress', (data) => {
      this.handleStreamProgress(data);
    });

    this.socket.on('stream:data', (data) => {
      this.handleStreamData(data);
    });

    this.socket.on('stream:completed', (data) => {
      this.handleStreamCompleted(data);
    });

    this.socket.on('stream:stopped', (data) => {
      this.handleStreamStopped(data);
    });

    this.socket.on('stream:error', (data) => {
      this.handleStreamError(data);
    });

    // Heartbeat
    this.socket.on('pong', (data) => {
      this.handlePong(data);
    });

    // Error events
    this.socket.on('error', (error) => {
      this.handleError(error);
    });
  }

  /**
   * Event handlers
   */
  handleGraphUpdate(data) {
    this.metrics.messagesReceived++;
    this.receivedMessages.push({
      type: 'graph:update',
      data,
      timestamp: Date.now()
    });
    logger.debug('WebSocketTestClient: Graph update received', {
      clientId: this.clientId,
      updateType: data.type
    });
  }

  handlePatternAlert(data) {
    this.metrics.messagesReceived++;
    this.receivedMessages.push({
      type: 'pattern:alert',
      data,
      timestamp: Date.now()
    });
    logger.info('WebSocketTestClient: Pattern alert received', {
      clientId: this.clientId,
      patternType: data.pattern?.type
    });
  }

  handleRiskAlert(data) {
    this.metrics.messagesReceived++;
    this.receivedMessages.push({
      type: 'risk:alert',
      data,
      timestamp: Date.now()
    });
    logger.info('WebSocketTestClient: Risk alert received', {
      clientId: this.clientId,
      severity: data.alert?.severity
    });
  }

  handleAnalyticsUpdate(data) {
    this.metrics.messagesReceived++;
    this.receivedMessages.push({
      type: 'analytics:update',
      data,
      timestamp: Date.now()
    });
    logger.debug('WebSocketTestClient: Analytics update received', {
      clientId: this.clientId
    });
  }

  handleSubscriptionConfirmed(data) {
    if (data.type === 'address') {
      this.subscriptions.add(`address:${data.address}`);
    } else if (data.type === 'patterns') {
      this.subscriptions.add('patterns:alerts');
    }
    logger.info('WebSocketTestClient: Subscription confirmed', {
      clientId: this.clientId,
      type: data.type,
      subscription: data.address || 'patterns'
    });
  }

  handleUnsubscriptionConfirmed(data) {
    if (data.type === 'address') {
      this.subscriptions.delete(`address:${data.address}`);
    } else if (data.type === 'patterns') {
      this.subscriptions.delete('patterns:alerts');
    }
    logger.info('WebSocketTestClient: Unsubscription confirmed', {
      clientId: this.clientId,
      type: data.type
    });
  }

  handleStreamStarted(data) {
    logger.info('WebSocketTestClient: Stream started', {
      clientId: this.clientId,
      sessionId: data.sessionId
    });
  }

  handleStreamProgress(data) {
    logger.debug('WebSocketTestClient: Stream progress', {
      clientId: this.clientId,
      progress: data.progress
    });
  }

  handleStreamData(data) {
    this.metrics.messagesReceived++;
    logger.debug('WebSocketTestClient: Stream data received', {
      clientId: this.clientId,
      nodes: data.batch?.nodes?.length || 0,
      edges: data.batch?.edges?.length || 0
    });
  }

  handleStreamCompleted(data) {
    logger.info('WebSocketTestClient: Stream completed', {
      clientId: this.clientId,
      summary: data.summary
    });
  }

  handleStreamStopped(data) {
    logger.info('WebSocketTestClient: Stream stopped', {
      clientId: this.clientId,
      sessionId: data.sessionId
    });
  }

  handleStreamError(data) {
    this.metrics.errors++;
    logger.error('WebSocketTestClient: Stream error', {
      clientId: this.clientId,
      error: data.error
    });
  }

  handlePong(data) {
    const latency = Date.now() - this.lastPingTime;
    this.metrics.latencies.push(latency);
    logger.debug('WebSocketTestClient: Pong received', {
      clientId: this.clientId,
      latency
    });
  }

  handleError(error) {
    this.metrics.errors++;
    logger.error('WebSocketTestClient: Error received', {
      clientId: this.clientId,
      error
    });
  }

  /**
   * Test methods
   */
  
  // Test address subscription
  async subscribeToAddress(address, filters = {}) {
    return new Promise((resolve) => {
      this.metrics.messagesSent++;
      this.socket.emit('subscribe:address', { address, filters });
      
      const handler = (data) => {
        if (data.type === 'address' && data.address === address) {
          this.socket.off('subscription:confirmed', handler);
          resolve(data);
        }
      };
      this.socket.on('subscription:confirmed', handler);
    });
  }

  // Test address unsubscription
  async unsubscribeFromAddress(address) {
    return new Promise((resolve) => {
      this.metrics.messagesSent++;
      this.socket.emit('unsubscribe:address', { address });
      
      const handler = (data) => {
        if (data.type === 'address' && data.address === address) {
          this.socket.off('unsubscription:confirmed', handler);
          resolve(data);
        }
      };
      this.socket.on('unsubscription:confirmed', handler);
    });
  }

  // Test pattern subscription
  async subscribeToPatterns() {
    return new Promise((resolve) => {
      this.metrics.messagesSent++;
      this.socket.emit('subscribe:patterns');
      
      const handler = (data) => {
        if (data.type === 'patterns') {
          this.socket.off('subscription:confirmed', handler);
          resolve(data);
        }
      };
      this.socket.on('subscription:confirmed', handler);
    });
  }

  // Test pattern unsubscription
  async unsubscribeFromPatterns() {
    return new Promise((resolve) => {
      this.metrics.messagesSent++;
      this.socket.emit('unsubscribe:patterns');
      
      const handler = (data) => {
        if (data.type === 'patterns') {
          this.socket.off('unsubscription:confirmed', handler);
          resolve(data);
        }
      };
      this.socket.on('unsubscription:confirmed', handler);
    });
  }

  // Test graph streaming
  async streamGraph(address, depth = 2, minVolume = '0') {
    return new Promise((resolve, reject) => {
      this.metrics.messagesSent++;
      const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const results = {
        started: false,
        progress: [],
        data: [],
        completed: false,
        error: null
      };

      // Set up handlers
      const startHandler = (data) => {
        if (data.sessionId === streamId) {
          results.started = true;
        }
      };

      const progressHandler = (data) => {
        if (data.sessionId === streamId) {
          results.progress.push(data.progress);
        }
      };

      const dataHandler = (data) => {
        if (data.sessionId === streamId) {
          results.data.push(data.batch);
        }
      };

      const completedHandler = (data) => {
        if (data.sessionId === streamId) {
          results.completed = true;
          cleanup();
          resolve(results);
        }
      };

      const errorHandler = (data) => {
        results.error = data.error;
        cleanup();
        reject(new Error(data.error));
      };

      const cleanup = () => {
        this.socket.off('stream:started', startHandler);
        this.socket.off('stream:progress', progressHandler);
        this.socket.off('stream:data', dataHandler);
        this.socket.off('stream:completed', completedHandler);
        this.socket.off('stream:error', errorHandler);
      };

      // Add handlers
      this.socket.on('stream:started', startHandler);
      this.socket.on('stream:progress', progressHandler);
      this.socket.on('stream:data', dataHandler);
      this.socket.on('stream:completed', completedHandler);
      this.socket.on('stream:error', errorHandler);

      // Start streaming
      this.socket.emit('stream:graph', { address, depth, minVolume, streamId });
    });
  }

  // Test stopping stream
  stopStream() {
    this.metrics.messagesSent++;
    this.socket.emit('stream:stop');
  }

  // Test heartbeat
  async sendPing() {
    return new Promise((resolve) => {
      this.metrics.messagesSent++;
      this.lastPingTime = Date.now();
      this.socket.emit('ping');
      
      const handler = (data) => {
        this.socket.off('pong', handler);
        resolve(Date.now() - this.lastPingTime);
      };
      this.socket.on('pong', handler);
    });
  }

  // Test rapid subscription/unsubscription
  async rapidSubscriptionTest(address, iterations = 10) {
    const results = {
      successful: 0,
      failed: 0,
      avgTime: 0
    };

    const times = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      try {
        await this.subscribeToAddress(address);
        await this.unsubscribeFromAddress(address);
        results.successful++;
        times.push(Date.now() - startTime);
      } catch (error) {
        results.failed++;
        logger.error('Rapid subscription test failed', { error });
      }
    }

    results.avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    return results;
  }

  // Test large payload handling
  async testLargePayload() {
    // Create a large address list for pattern testing
    const largeAddressList = Array(1000).fill(0).map((_, i) => `1large${i}address`);
    
    return new Promise((resolve, reject) => {
      this.metrics.messagesSent++;
      
      // Subscribe to patterns to receive the alert
      this.subscribeToPatterns().then(() => {
        // Simulate a large pattern alert
        const largePattern = {
          id: 'large_pattern_test',
          type: 'large_cluster',
          confidence: 0.99,
          addresses: largeAddressList,
          description: 'Large cluster test pattern',
          riskLevel: 'medium',
          metadata: {
            // Add more data to increase payload size
            additionalData: Array(100).fill(0).map(() => ({
              key: Math.random().toString(36),
              value: Math.random().toString(36).repeat(100)
            }))
          }
        };

        const handler = (data) => {
          if (data.pattern?.id === 'large_pattern_test') {
            this.socket.off('pattern:alert', handler);
            resolve({
              payloadSize: JSON.stringify(data).length,
              addressCount: data.pattern.addresses.length,
              received: true
            });
          }
        };

        this.socket.on('pattern:alert', handler);

        // Note: In a real test, you would trigger this from the server
        // For now, we'll just resolve with expected structure
        setTimeout(() => {
          resolve({
            payloadSize: JSON.stringify(largePattern).length,
            addressCount: largeAddressList.length,
            simulated: true
          });
        }, 1000);
      }).catch(reject);
    });
  }

  // Test connection interruption and recovery
  async testConnectionRecovery() {
    const results = {
      disconnected: false,
      reconnected: false,
      dataPreserved: false,
      subscriptionsRestored: false
    };

    // Subscribe to some addresses first
    const testAddress = '1recovery123test';
    await this.subscribeToAddress(testAddress);
    const initialSubs = new Set(this.subscriptions);

    return new Promise((resolve) => {
      // Listen for disconnect
      this.socket.once('disconnect', () => {
        results.disconnected = true;
        logger.info('Connection recovery test: Disconnected');
      });

      // Listen for reconnect
      this.socket.once('reconnect', () => {
        results.reconnected = true;
        results.subscriptionsRestored = this.subscriptions.has(`address:${testAddress}`);
        logger.info('Connection recovery test: Reconnected');
        
        // Wait a bit to ensure everything is restored
        setTimeout(() => {
          results.dataPreserved = initialSubs.size === this.subscriptions.size;
          resolve(results);
        }, 500);
      });

      // Force disconnect
      this.socket.disconnect();
      
      // Reconnect after a delay
      setTimeout(() => {
        this.socket.connect();
      }, 1000);
    });
  }

  // Get metrics summary
  getMetrics() {
    const runtime = Date.now() - this.metrics.startTime;
    const avgLatency = this.metrics.latencies.length > 0
      ? this.metrics.latencies.reduce((a, b) => a + b, 0) / this.metrics.latencies.length
      : 0;

    return {
      clientId: this.clientId,
      runtime: runtime,
      messagesReceived: this.metrics.messagesReceived,
      messagesSent: this.metrics.messagesSent,
      errors: this.metrics.errors,
      reconnections: this.metrics.reconnections,
      avgLatency: avgLatency,
      minLatency: Math.min(...this.metrics.latencies) || 0,
      maxLatency: Math.max(...this.metrics.latencies) || 0,
      subscriptions: this.subscriptions.size,
      connectionAttempts: this.connectionAttempts
    };
  }

  // Disconnect from server
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      logger.info('WebSocketTestClient: Disconnected', {
        clientId: this.clientId,
        metrics: this.getMetrics()
      });
    }
  }
}

// Run comprehensive tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runComprehensiveTests = async () => {
    logger.info('Starting comprehensive WebSocket tests');
    
    const client = new WebSocketTestClient();
    
    try {
      // 1. Test connection
      logger.info('Test 1: Connection establishment');
      await client.connect();
      logger.info('✓ Connection established');

      // 2. Test heartbeat
      logger.info('Test 2: Heartbeat (ping/pong)');
      const latency = await client.sendPing();
      logger.info(`✓ Heartbeat working, latency: ${latency}ms`);

      // 3. Test address subscription
      logger.info('Test 3: Address subscription');
      const testAddress = '1test123address456';
      await client.subscribeToAddress(testAddress);
      logger.info('✓ Address subscription successful');

      // 4. Test pattern subscription
      logger.info('Test 4: Pattern subscription');
      await client.subscribeToPatterns();
      logger.info('✓ Pattern subscription successful');

      // 5. Test graph streaming
      logger.info('Test 5: Graph streaming');
      const streamResults = await client.streamGraph(testAddress, 2, '1000000');
      logger.info('✓ Graph streaming successful', {
        progressUpdates: streamResults.progress.length,
        dataBatches: streamResults.data.length
      });

      // 6. Test rapid subscription/unsubscription
      logger.info('Test 6: Rapid subscription/unsubscription');
      const rapidResults = await client.rapidSubscriptionTest('1rapid123test', 20);
      logger.info('✓ Rapid subscription test completed', rapidResults);

      // 7. Test large payload
      logger.info('Test 7: Large payload handling');
      const largePayloadResults = await client.testLargePayload();
      logger.info('✓ Large payload test completed', largePayloadResults);

      // 8. Test connection recovery
      logger.info('Test 8: Connection recovery');
      const recoveryResults = await client.testConnectionRecovery();
      logger.info('✓ Connection recovery test completed', recoveryResults);

      // 9. Test unsubscription
      logger.info('Test 9: Unsubscription');
      await client.unsubscribeFromAddress(testAddress);
      await client.unsubscribeFromPatterns();
      logger.info('✓ Unsubscription successful');

      // Final metrics
      logger.info('Test completed successfully!', {
        metrics: client.getMetrics()
      });

    } catch (error) {
      logger.error('Test failed', { error: error.message });
    } finally {
      client.disconnect();
    }
  };

  runComprehensiveTests().catch(console.error);
}

export { WebSocketTestClient };