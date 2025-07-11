#!/usr/bin/env node

import { io } from 'socket.io-client';

const WS_URL = 'http://[::1]:3000';

console.log('Testing WebSocket connection to:', WS_URL);

const socket = io(WS_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true
});

// Track events
const events = [];

socket.on('connect', () => {
  console.log('✅ WebSocket connected');
  console.log('Socket ID:', socket.id);
  
  // Test subscribing to graph updates
  const testAddress = '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5';
  
  console.log('\nTesting graph subscriptions...');
  socket.emit('subscribe:graph', { address: testAddress });
  
  // Test other potential events
  setTimeout(() => {
    console.log('\nTesting graph expansion...');
    socket.emit('graph:expand', { 
      address: testAddress,
      direction: 'both'
    });
  }, 1000);
  
  // Disconnect after 5 seconds
  setTimeout(() => {
    console.log('\nTest complete. Disconnecting...');
    socket.disconnect();
  }, 5000);
});

socket.on('disconnect', () => {
  console.log('❌ WebSocket disconnected');
  console.log('\nEvents received:', events.length);
  
  if (events.length > 0) {
    console.log('\nEvent summary:');
    events.forEach((event, index) => {
      console.log(`${index + 1}. ${event.type} - ${event.timestamp}`);
    });
  }
  
  process.exit(0);
});

socket.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
  setTimeout(() => {
    console.log('Retrying connection...');
  }, 1000);
});

// Listen for graph updates
socket.on('graph:update', (data) => {
  console.log('📊 Graph update received:', JSON.stringify(data, null, 2));
  events.push({ type: 'graph:update', timestamp: new Date().toISOString(), data });
});

socket.on('graph:subscribed', (data) => {
  console.log('✅ Subscribed to graph updates:', data);
  events.push({ type: 'graph:subscribed', timestamp: new Date().toISOString(), data });
});

socket.on('graph:expanded', (data) => {
  console.log('📈 Graph expanded:', JSON.stringify(data, null, 2));
  events.push({ type: 'graph:expanded', timestamp: new Date().toISOString(), data });
});

// Listen for any other events
socket.onAny((eventName, ...args) => {
  if (!['connect', 'disconnect', 'error', 'connect_error', 'graph:update', 'graph:subscribed', 'graph:expanded'].includes(eventName)) {
    console.log(`📨 Event: ${eventName}`, args);
    events.push({ type: eventName, timestamp: new Date().toISOString(), data: args });
  }
});

console.log('Connecting to WebSocket server...');