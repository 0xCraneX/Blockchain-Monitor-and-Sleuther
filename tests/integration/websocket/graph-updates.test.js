import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { io as Client } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GraphWebSocket } from '../../../src/services/GraphWebSocket.js';
import { logger } from '../../../src/utils/logger.js';

// Test helper functions
const createTestServer = () => {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });
  return { httpServer, io };
};

const createTestClient = (port) => {
  return Client(`http://localhost:${port}`, {
    autoConnect: false,
    forceNew: true
  });
};

const waitForEvent = (client, event, timeout = 1000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeout);

    client.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
};

describe('GraphWebSocket Integration Tests', () => {
  let httpServer;
  let io;
  let graphWebSocket;
  let client1;
  let client2;
  let port;

  beforeEach(async () => {
    // Create test server
    ({ httpServer, io } = createTestServer());
    
    // Get available port
    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        port = httpServer.address().port;
        resolve();
      });
    });

    // Initialize GraphWebSocket
    graphWebSocket = new GraphWebSocket();
    graphWebSocket.initializeHandlers(io);

    // Create test clients
    client1 = createTestClient(port);
    client2 = createTestClient(port);
  });

  afterEach(async () => {
    // Disconnect clients
    if (client1.connected) client1.disconnect();
    if (client2.connected) client2.disconnect();
    
    // Close server
    io.close();
    httpServer.close();
    
    // Small delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  describe('Connection and Basic Functionality', () => {
    it('should handle client connections', async () => {
      client1.connect();
      
      await waitForEvent(client1, 'connect');
      expect(client1.connected).toBe(true);
      
      const stats = graphWebSocket.getSubscriptionStats();
      expect(stats.connectedClients).toBe(1);
    });

    it('should handle client disconnections', async () => {
      client1.connect();
      await waitForEvent(client1, 'connect');
      
      let initialStats = graphWebSocket.getSubscriptionStats();
      expect(initialStats.connectedClients).toBe(1);
      
      client1.disconnect();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      let finalStats = graphWebSocket.getSubscriptionStats();
      expect(finalStats.connectedClients).toBe(0);
    });

    it('should respond to ping with pong', async () => {
      client1.connect();
      await waitForEvent(client1, 'connect');
      
      client1.emit('ping');
      const response = await waitForEvent(client1, 'pong');
      
      expect(response).toHaveProperty('timestamp');
      expect(typeof response.timestamp).toBe('number');
    });
  });

  describe('Address Subscriptions', () => {
    beforeEach(async () => {
      client1.connect();
      client2.connect();
      await Promise.all([
        waitForEvent(client1, 'connect'),
        waitForEvent(client2, 'connect')
      ]);
    });

    it('should handle address subscription', async () => {
      const testAddress = '1test123address456';
      
      client1.emit('subscribe:address', { address: testAddress });
      const confirmation = await waitForEvent(client1, 'subscription:confirmed');
      
      expect(confirmation).toMatchObject({
        type: 'address',
        address: testAddress,
        room: `address:${testAddress}`
      });
      
      const stats = graphWebSocket.getSubscriptionStats();
      expect(stats.addressSubscriptions).toBe(1);
      expect(stats.totalAddressSubscriptions).toBe(1);
    });

    it('should handle multiple clients subscribing to same address', async () => {
      const testAddress = '1shared456address789';
      
      // Both clients subscribe to same address
      client1.emit('subscribe:address', { address: testAddress });
      client2.emit('subscribe:address', { address: testAddress });
      
      await Promise.all([
        waitForEvent(client1, 'subscription:confirmed'),
        waitForEvent(client2, 'subscription:confirmed')
      ]);
      
      const stats = graphWebSocket.getSubscriptionStats();
      expect(stats.addressSubscriptions).toBe(1); // One unique address
      expect(stats.totalAddressSubscriptions).toBe(2); // Two client subscriptions
    });

    it('should handle address unsubscription', async () => {
      const testAddress = '1unsub123address456';
      
      // Subscribe first
      client1.emit('subscribe:address', { address: testAddress });
      await waitForEvent(client1, 'subscription:confirmed');
      
      // Then unsubscribe
      client1.emit('unsubscribe:address', { address: testAddress });
      const confirmation = await waitForEvent(client1, 'unsubscription:confirmed');
      
      expect(confirmation).toMatchObject({
        type: 'address',
        address: testAddress
      });
      
      const stats = graphWebSocket.getSubscriptionStats();
      expect(stats.addressSubscriptions).toBe(0);
    });

    it('should handle subscription errors for invalid address', async () => {
      client1.emit('subscribe:address', { address: null });
      const error = await waitForEvent(client1, 'error');
      
      expect(error).toMatchObject({
        type: 'subscription_error',
        message: 'Invalid address provided'
      });
    });
  });

  describe('Pattern Alert Subscriptions', () => {
    beforeEach(async () => {
      client1.connect();
      await waitForEvent(client1, 'connect');
    });

    it('should handle pattern subscription', async () => {
      client1.emit('subscribe:patterns');
      const confirmation = await waitForEvent(client1, 'subscription:confirmed');
      
      expect(confirmation).toMatchObject({
        type: 'patterns',
        room: 'patterns:alerts'
      });
      
      const stats = graphWebSocket.getSubscriptionStats();
      expect(stats.patternSubscriptions).toBe(1);
    });

    it('should handle pattern unsubscription', async () => {
      // Subscribe first
      client1.emit('subscribe:patterns');
      await waitForEvent(client1, 'subscription:confirmed');
      
      // Then unsubscribe
      client1.emit('unsubscribe:patterns');
      const confirmation = await waitForEvent(client1, 'unsubscription:confirmed');
      
      expect(confirmation).toMatchObject({
        type: 'patterns'
      });
      
      const stats = graphWebSocket.getSubscriptionStats();
      expect(stats.patternSubscriptions).toBe(0);
    });
  });

  describe('Broadcasting Node Updates', () => {
    beforeEach(async () => {
      client1.connect();
      client2.connect();
      await Promise.all([
        waitForEvent(client1, 'connect'),
        waitForEvent(client2, 'connect')
      ]);
    });

    it('should broadcast node updates to subscribed clients', async () => {
      const testAddress = '1broadcast123node456';
      
      // Subscribe client1 to address
      client1.emit('subscribe:address', { address: testAddress });
      await waitForEvent(client1, 'subscription:confirmed');
      
      // Broadcast node update
      const changes = {
        balance: '1000000000000',
        riskScore: 0.3,
        nodeType: 'suspicious'
      };
      
      const updatePromise = waitForEvent(client1, 'graph:update');
      graphWebSocket.broadcastNodeUpdate(testAddress, changes);
      
      const update = await updatePromise;
      expect(update).toMatchObject({
        type: 'node_updated',
        address: testAddress,
        changes
      });
    });

    it('should not broadcast to unsubscribed clients', async () => {
      const testAddress = '1notsubscribed123';
      
      // Don't subscribe client1
      // Broadcast node update
      const changes = { balance: '500000000000' };
      
      let updateReceived = false;
      client1.on('graph:update', () => {
        updateReceived = true;
      });
      
      graphWebSocket.broadcastNodeUpdate(testAddress, changes);
      
      // Wait a bit to ensure no update is received
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(updateReceived).toBe(false);
    });

    it('should broadcast node addition', async () => {
      const testAddress = '1newnode123address456';
      
      client1.emit('subscribe:address', { address: testAddress });
      await waitForEvent(client1, 'subscription:confirmed');
      
      const newNode = {
        id: testAddress,
        address: testAddress,
        identity: 'Test Node',
        nodeType: 'regular',
        balance: '2000000000000'
      };
      
      const updatePromise = waitForEvent(client1, 'graph:update');
      graphWebSocket.broadcastNodeAdded(newNode);
      
      const update = await updatePromise;
      expect(update).toMatchObject({
        type: 'node_added',
        node: newNode
      });
    });

    it('should broadcast node removal', async () => {
      const testAddress = '1removenode123';
      
      client1.emit('subscribe:address', { address: testAddress });
      await waitForEvent(client1, 'subscription:confirmed');
      
      const updatePromise = waitForEvent(client1, 'graph:update');
      graphWebSocket.broadcastNodeRemoved(testAddress);
      
      const update = await updatePromise;
      expect(update).toMatchObject({
        type: 'node_removed',
        address: testAddress
      });
    });
  });

  describe('Broadcasting Edge Updates', () => {
    beforeEach(async () => {
      client1.connect();
      client2.connect();
      await Promise.all([
        waitForEvent(client1, 'connect'),
        waitForEvent(client2, 'connect')
      ]);
    });

    it('should broadcast edge updates to both source and target subscribers', async () => {
      const sourceAddress = '1source123';
      const targetAddress = '1target456';
      
      // Subscribe clients to different addresses
      client1.emit('subscribe:address', { address: sourceAddress });
      client2.emit('subscribe:address', { address: targetAddress });
      
      await Promise.all([
        waitForEvent(client1, 'subscription:confirmed'),
        waitForEvent(client2, 'subscription:confirmed')
      ]);
      
      const edge = {
        id: `${sourceAddress}->${targetAddress}`,
        source: sourceAddress,
        target: targetAddress
      };
      
      const changes = {
        volume: '5000000000000',
        transferCount: 15
      };
      
      const updatePromises = [
        waitForEvent(client1, 'graph:update'),
        waitForEvent(client2, 'graph:update')
      ];
      
      graphWebSocket.broadcastEdgeUpdate(edge, changes);
      
      const [update1, update2] = await Promise.all(updatePromises);
      
      [update1, update2].forEach(update => {
        expect(update).toMatchObject({
          type: 'edge_updated',
          edge: {
            id: edge.id,
            source: sourceAddress,
            target: targetAddress
          },
          changes
        });
      });
    });

    it('should broadcast edge addition', async () => {
      const sourceAddress = '1newsource123';
      const targetAddress = '1newtarget456';
      
      client1.emit('subscribe:address', { address: sourceAddress });
      await waitForEvent(client1, 'subscription:confirmed');
      
      const newEdge = {
        id: `${sourceAddress}->${targetAddress}`,
        source: sourceAddress,
        target: targetAddress,
        volume: '1000000000000',
        transferCount: 5
      };
      
      const updatePromise = waitForEvent(client1, 'graph:update');
      graphWebSocket.broadcastEdgeAdded(newEdge);
      
      const update = await updatePromise;
      expect(update).toMatchObject({
        type: 'edge_added',
        edge: newEdge
      });
    });

    it('should broadcast edge removal', async () => {
      const sourceAddress = '1removesource123';
      const targetAddress = '1removetarget456';
      
      client1.emit('subscribe:address', { address: sourceAddress });
      await waitForEvent(client1, 'subscription:confirmed');
      
      const removedEdge = {
        id: `${sourceAddress}->${targetAddress}`,
        source: sourceAddress,
        target: targetAddress
      };
      
      const updatePromise = waitForEvent(client1, 'graph:update');
      graphWebSocket.broadcastEdgeRemoved(removedEdge);
      
      const update = await updatePromise;
      expect(update).toMatchObject({
        type: 'edge_removed',
        edge: {
          id: removedEdge.id,
          source: sourceAddress,
          target: targetAddress
        }
      });
    });
  });

  describe('Pattern and Risk Alerts', () => {
    beforeEach(async () => {
      client1.connect();
      client2.connect();
      await Promise.all([
        waitForEvent(client1, 'connect'),
        waitForEvent(client2, 'connect')
      ]);
    });

    it('should broadcast pattern alerts to pattern subscribers', async () => {
      client1.emit('subscribe:patterns');
      await waitForEvent(client1, 'subscription:confirmed');
      
      const pattern = {
        id: 'pattern_123',
        type: 'money_laundering',
        confidence: 0.85,
        addresses: ['1addr1', '1addr2', '1addr3'],
        description: 'Suspicious circular transaction pattern detected',
        riskLevel: 'high'
      };
      
      const alertPromise = waitForEvent(client1, 'pattern:alert');
      graphWebSocket.broadcastPatternAlert(pattern);
      
      const alert = await alertPromise;
      expect(alert).toMatchObject({
        type: 'pattern_detected',
        pattern: {
          id: pattern.id,
          type: pattern.type,
          confidence: pattern.confidence,
          addresses: pattern.addresses,
          description: pattern.description,
          riskLevel: pattern.riskLevel
        }
      });
    });

    it('should broadcast pattern alerts to relevant address subscribers', async () => {
      const testAddress = '1pattern123addr';
      
      client1.emit('subscribe:address', { address: testAddress });
      await waitForEvent(client1, 'subscription:confirmed');
      
      const pattern = {
        id: 'pattern_456',
        type: 'mixing_service',
        confidence: 0.92,
        addresses: [testAddress],
        description: 'Address involved in mixing service',
        riskLevel: 'medium'
      };
      
      const alertPromise = waitForEvent(client1, 'pattern:alert');
      graphWebSocket.broadcastPatternAlert(pattern);
      
      const alert = await alertPromise;
      expect(alert.type).toBe('pattern_detected');
      expect(alert.pattern.addresses).toContain(testAddress);
    });

    it('should broadcast risk alerts', async () => {
      client1.emit('subscribe:patterns');
      await waitForEvent(client1, 'subscription:confirmed');
      
      const riskAlert = {
        id: 'risk_789',
        severity: 'high',
        address: '1risky123addr',
        riskType: 'suspicious_volume',
        description: 'Abnormally high transaction volume detected',
        score: 0.95
      };
      
      const alertPromise = waitForEvent(client1, 'risk:alert');
      graphWebSocket.broadcastRiskAlert(riskAlert);
      
      const alert = await alertPromise;
      expect(alert).toMatchObject({
        type: 'risk_alert',
        alert: {
          id: riskAlert.id,
          severity: riskAlert.severity,
          address: riskAlert.address,
          riskType: riskAlert.riskType,
          description: riskAlert.description,
          score: riskAlert.score
        }
      });
    });
  });

  describe('Graph Streaming', () => {
    beforeEach(async () => {
      client1.connect();
      await waitForEvent(client1, 'connect');
    });

    it('should handle graph streaming request', async () => {
      const query = {
        address: '1stream123addr',
        depth: 2,
        minVolume: '1000000',
        streamId: 'test_stream_1'
      };
      
      client1.emit('stream:graph', query);
      
      const startConfirmation = await waitForEvent(client1, 'stream:started');
      expect(startConfirmation).toMatchObject({
        sessionId: query.streamId,
        address: query.address,
        depth: query.depth
      });
      
      const stats = graphWebSocket.getSubscriptionStats();
      expect(stats.activeStreams).toBe(1);
    });

    it('should receive streaming progress updates', async () => {
      const query = {
        address: '1progress123addr',
        depth: 2,
        streamId: 'test_stream_2'
      };
      
      client1.emit('stream:graph', query);
      await waitForEvent(client1, 'stream:started');
      
      // Wait for progress updates
      const progress = await waitForEvent(client1, 'stream:progress');
      expect(progress).toHaveProperty('progress');
      expect(progress.progress).toHaveProperty('currentDepth');
      expect(progress.progress).toHaveProperty('percentage');
    });

    it('should receive streaming data batches', async () => {
      const query = {
        address: '1data123addr',
        depth: 2,
        streamId: 'test_stream_3'
      };
      
      client1.emit('stream:graph', query);
      await waitForEvent(client1, 'stream:started');
      
      // Wait for data batch
      const data = await waitForEvent(client1, 'stream:data');
      expect(data).toHaveProperty('batch');
      expect(data.batch).toHaveProperty('nodes');
      expect(data.batch).toHaveProperty('edges');
      expect(Array.isArray(data.batch.nodes)).toBe(true);
    });

    it('should handle stream stopping', async () => {
      const query = {
        address: '1stop123addr',
        depth: 2,
        streamId: 'test_stream_4'
      };
      
      client1.emit('stream:graph', query);
      await waitForEvent(client1, 'stream:started');
      
      client1.emit('stream:stop');
      const stopConfirmation = await waitForEvent(client1, 'stream:stopped');
      
      expect(stopConfirmation).toHaveProperty('sessionId');
      
      const stats = graphWebSocket.getSubscriptionStats();
      expect(stats.activeStreams).toBe(0);
    });

    it('should handle streaming errors', async () => {
      const invalidQuery = {
        // Missing required address
        depth: 2,
        streamId: 'test_stream_error'
      };
      
      client1.emit('stream:graph', invalidQuery);
      const error = await waitForEvent(client1, 'error');
      
      expect(error).toMatchObject({
        type: 'stream_error',
        message: 'Address required for graph streaming'
      });
    });
  });

  describe('Analytics Broadcasting', () => {
    beforeEach(async () => {
      client1.connect();
      client2.connect();
      await Promise.all([
        waitForEvent(client1, 'connect'),
        waitForEvent(client2, 'connect')
      ]);
    });

    it('should broadcast analytics to all clients', async () => {
      const analytics = {
        totalNodes: 15000,
        totalEdges: 45000,
        avgDegree: 3.2,
        networkDensity: 0.0002,
        topRiskAddresses: ['1risk1', '1risk2'],
        recentPatterns: 5
      };
      
      const analyticsPromises = [
        waitForEvent(client1, 'analytics:update'),
        waitForEvent(client2, 'analytics:update')
      ];
      
      graphWebSocket.broadcastAnalytics(analytics);
      
      const [update1, update2] = await Promise.all(analyticsPromises);
      
      [update1, update2].forEach(update => {
        expect(update).toMatchObject({
          type: 'analytics_update',
          analytics
        });
      });
    });
  });

  describe('Subscription Statistics', () => {
    beforeEach(async () => {
      client1.connect();
      client2.connect();
      await Promise.all([
        waitForEvent(client1, 'connect'),
        waitForEvent(client2, 'connect')
      ]);
    });

    it('should track subscription statistics correctly', async () => {
      // Initial state
      let stats = graphWebSocket.getSubscriptionStats();
      expect(stats.connectedClients).toBe(2);
      expect(stats.addressSubscriptions).toBe(0);
      expect(stats.patternSubscriptions).toBe(0);
      
      // Add subscriptions
      client1.emit('subscribe:address', { address: '1stats1' });
      client2.emit('subscribe:address', { address: '1stats2' });
      client1.emit('subscribe:patterns');
      
      await Promise.all([
        waitForEvent(client1, 'subscription:confirmed'),
        waitForEvent(client2, 'subscription:confirmed'),
        waitForEvent(client1, 'subscription:confirmed')
      ]);
      
      stats = graphWebSocket.getSubscriptionStats();
      expect(stats.addressSubscriptions).toBe(2);
      expect(stats.patternSubscriptions).toBe(1);
      expect(stats.totalAddressSubscriptions).toBe(2);
    });

    it('should clean up statistics on disconnect', async () => {
      // Subscribe to addresses
      client1.emit('subscribe:address', { address: '1cleanup1' });
      client2.emit('subscribe:address', { address: '1cleanup2' });
      
      await Promise.all([
        waitForEvent(client1, 'subscription:confirmed'),
        waitForEvent(client2, 'subscription:confirmed')
      ]);
      
      let stats = graphWebSocket.getSubscriptionStats();
      expect(stats.addressSubscriptions).toBe(2);
      
      // Disconnect one client
      client1.disconnect();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      stats = graphWebSocket.getSubscriptionStats();
      expect(stats.connectedClients).toBe(1);
      expect(stats.addressSubscriptions).toBe(1);
    });
  });
});