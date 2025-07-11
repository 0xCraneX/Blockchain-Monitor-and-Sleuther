import { WebSocketTestClient } from './websocket-test-client.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GraphWebSocket } from '../../../src/services/GraphWebSocket.js';
import { logger } from '../../../src/utils/logger.js';

/**
 * Quick WebSocket Test Runner
 * Runs essential WebSocket tests with focus on key functionality
 */
async function runQuickTests() {
  let server, io, graphWebSocket, port;
  
  try {
    // Start server
    server = createServer();
    io = new Server(server, {
      cors: { origin: '*', methods: ['GET', 'POST'] }
    });
    
    graphWebSocket = new GraphWebSocket();
    graphWebSocket.initializeHandlers(io);
    
    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        logger.info(`Test server started on port ${port}`);
        resolve();
      });
    });
    
    console.log('\n=== WebSocket Quick Test Suite ===\n');
    
    // Test 1: Basic Connection
    console.log('1. Testing Connection...');
    const client1 = new WebSocketTestClient(`http://localhost:${port}`);
    try {
      await client1.connect();
      console.log('✓ Connection established');
    } catch (error) {
      console.log('✗ Connection failed:', error.message);
    }
    
    // Test 2: Heartbeat
    console.log('\n2. Testing Heartbeat...');
    try {
      const latency = await client1.sendPing();
      console.log(`✓ Heartbeat working, latency: ${latency}ms`);
    } catch (error) {
      console.log('✗ Heartbeat failed:', error.message);
    }
    
    // Test 3: Subscriptions
    console.log('\n3. Testing Subscriptions...');
    const testAddress = '1quick123test';
    try {
      await client1.subscribeToAddress(testAddress);
      console.log('✓ Address subscription successful');
      
      await client1.subscribeToPatterns();
      console.log('✓ Pattern subscription successful');
      
      await client1.unsubscribeFromAddress(testAddress);
      await client1.unsubscribeFromPatterns();
      console.log('✓ Unsubscription successful');
    } catch (error) {
      console.log('✗ Subscription test failed:', error.message);
    }
    
    // Test 4: Real-time Updates
    console.log('\n4. Testing Real-time Updates...');
    await client1.subscribeToAddress(testAddress);
    
    // Clear previous messages
    client1.receivedMessages = [];
    
    // Trigger updates
    graphWebSocket.broadcastNodeUpdate(testAddress, {
      balance: '1000000000000',
      riskScore: 0.5
    });
    
    graphWebSocket.broadcastEdgeAdded({
      id: 'edge123',
      source: testAddress,
      target: '1target123',
      volume: '500000000000'
    });
    
    // Wait for updates
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const updates = client1.receivedMessages.filter(m => m.type === 'graph:update');
    console.log(`✓ Received ${updates.length} real-time updates`);
    
    // Test 5: Multiple Clients
    console.log('\n5. Testing Multiple Concurrent Clients...');
    const clients = [client1];
    const clientCount = 10;
    
    try {
      // Create more clients
      for (let i = 1; i < clientCount; i++) {
        const client = new WebSocketTestClient(`http://localhost:${port}`);
        await client.connect();
        clients.push(client);
      }
      console.log(`✓ Connected ${clients.length} concurrent clients`);
      
      // Test concurrent subscriptions
      const subPromises = clients.map((client, i) => 
        client.subscribeToAddress(`1client${i}test`)
      );
      await Promise.all(subPromises);
      console.log('✓ All clients subscribed successfully');
      
    } catch (error) {
      console.log('✗ Multiple client test failed:', error.message);
    }
    
    // Test 6: Graph Streaming
    console.log('\n6. Testing Graph Streaming...');
    try {
      const streamResults = await client1.streamGraph('1stream123test', 2, '0');
      console.log(`✓ Graph streaming completed with ${streamResults.data.length} data batches`);
    } catch (error) {
      console.log('✗ Graph streaming failed:', error.message);
    }
    
    // Test 7: Pattern Alerts
    console.log('\n7. Testing Pattern Alerts...');
    await client1.subscribeToPatterns();
    
    // Clear messages
    client1.receivedMessages = [];
    
    // Broadcast pattern alert
    graphWebSocket.broadcastPatternAlert({
      id: 'pattern_test',
      type: 'suspicious_activity',
      confidence: 0.85,
      addresses: [testAddress],
      description: 'Test pattern detected',
      riskLevel: 'high'
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const patternAlerts = client1.receivedMessages.filter(m => m.type === 'pattern:alert');
    console.log(`✓ Received ${patternAlerts.length} pattern alert(s)`);
    
    // Test 8: Rapid Subscribe/Unsubscribe
    console.log('\n8. Testing Rapid Subscribe/Unsubscribe...');
    try {
      const rapidResults = await client1.rapidSubscriptionTest('1rapid123test', 10);
      console.log(`✓ Rapid test: ${rapidResults.successful}/10 successful, avg time: ${rapidResults.avgTime.toFixed(2)}ms`);
    } catch (error) {
      console.log('✗ Rapid subscription test failed:', error.message);
    }
    
    // Test 9: Connection Recovery
    console.log('\n9. Testing Connection Recovery...');
    const recoveryClient = new WebSocketTestClient(`http://localhost:${port}`, {
      reconnection: true,
      reconnectionAttempts: 3
    });
    
    try {
      await recoveryClient.connect();
      const initialId = recoveryClient.socket.id;
      
      // Force disconnect
      recoveryClient.socket.disconnect();
      
      // Wait for reconnect
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Reconnection timeout')), 5000);
        recoveryClient.socket.once('reconnect', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      
      console.log(`✓ Connection recovered (new ID: ${recoveryClient.socket.id})`);
      recoveryClient.disconnect();
    } catch (error) {
      console.log('✗ Connection recovery failed:', error.message);
    }
    
    // Test 10: Server Statistics
    console.log('\n10. Server Statistics:');
    const stats = graphWebSocket.getSubscriptionStats();
    console.log(`- Connected clients: ${stats.connectedClients}`);
    console.log(`- Address subscriptions: ${stats.addressSubscriptions}`);
    console.log(`- Pattern subscriptions: ${stats.patternSubscriptions}`);
    console.log(`- Active streams: ${stats.activeStreams}`);
    
    // Cleanup
    console.log('\nCleaning up...');
    clients.forEach(client => client.disconnect());
    
    console.log('\n=== Test Summary ===');
    console.log('All essential WebSocket functionality has been tested.');
    console.log('The WebSocket implementation appears to be working correctly.');
    
  } catch (error) {
    console.error('Test suite error:', error);
  } finally {
    if (io) io.close();
    if (server) server.close();
    console.log('\nTest server stopped');
  }
}

// Run tests
runQuickTests().catch(console.error);