#!/usr/bin/env node

import { io } from 'socket.io-client';

const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
const testAddress = process.env.TEST_ADDRESS || '16ZL8yLyXv3V3L3z9ofR1ovFLziyXaN1DPq4yffMAZ9czzBD';
const minVolume = process.env.MIN_VOLUME || '50000000000000000'; // 5000 DOT

console.log('WebSocket Debug Script');
console.log('=====================');
console.log(`Server URL: ${serverUrl}`);
console.log(`Test Address: ${testAddress}`);
console.log(`Min Volume: ${minVolume} (${BigInt(minVolume) / BigInt(10 ** 10)} DOT)`);
console.log('');

// Connect to WebSocket
const socket = io(serverUrl, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 3,
  reconnectionDelay: 1000
});

// Connection handlers
socket.on('connect', () => {
  console.log('✅ WebSocket connected');
  console.log(`Socket ID: ${socket.id}`);
  console.log('');
  
  // Send stream:graph event
  console.log('📤 Sending stream:graph event...');
  socket.emit('stream:graph', {
    address: testAddress,
    depth: 2,
    minVolume: minVolume,
    streamId: `debug_${Date.now()}`,
    maxPages: 10
  });
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('🔌 Disconnected:', reason);
});

// Stream event handlers
socket.on('stream:started', (data) => {
  console.log('✅ Stream started:', JSON.stringify(data, null, 2));
});

socket.on('stream:progress', (data) => {
  console.log('📊 Stream progress:', JSON.stringify(data, null, 2));
});

socket.on('stream:data', (data) => {
  console.log('📦 Stream data received:');
  console.log(`  Session ID: ${data.sessionId}`);
  console.log(`  Batch info:`, data.batch);
});

socket.on('stream:completed', (data) => {
  console.log('✅ Stream completed:', JSON.stringify(data, null, 2));
  console.log('');
  console.log('Test completed successfully!');
  process.exit(0);
});

socket.on('stream:error', (data) => {
  console.error('❌ Stream error:', data);
  process.exit(1);
});

socket.on('error', (data) => {
  console.error('❌ General error:', data);
});

// Timeout after 30 seconds
setTimeout(() => {
  console.error('❌ Test timed out after 30 seconds');
  process.exit(1);
}, 30000);

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  socket.disconnect();
  process.exit(0);
});