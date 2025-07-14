import { io } from 'socket.io-client';

console.log('Testing WebSocket progressive loading...');

// Connect to the server
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('✅ Connected to WebSocket server');
  
  // Test streaming with volume filter
  const testData = {
    address: '14Xs22PogFVE4nfPmsRFhmnqX3RqdrUANZRaVJU7Hik8DArR',
    depth: 2,
    minVolume: '50000000000000000', // 5000 DOT
    maxPages: 5
  };
  
  console.log('📤 Sending stream:graph event:', testData);
  socket.emit('stream:graph', testData);
});

socket.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

socket.on('stream:started', (data) => {
  console.log('🚀 Stream started:', data);
});

socket.on('stream:progress', (data) => {
  console.log('📊 Stream progress:', data);
});

socket.on('stream:data', (data) => {
  console.log('📦 Stream data batch:', {
    sessionId: data.sessionId,
    batchInfo: data.batch
  });
});

socket.on('stream:completed', (data) => {
  console.log('✅ Stream completed:', {
    sessionId: data.sessionId,
    totalNodes: data.summary?.totalNodes,
    totalEdges: data.summary?.totalEdges,
    executionTime: data.summary?.executionTime
  });
  process.exit(0);
});

socket.on('stream:error', (data) => {
  console.error('❌ Stream error:', data);
  process.exit(1);
});

// Timeout after 30 seconds
setTimeout(() => {
  console.log('⏱️ Test timed out after 30 seconds');
  process.exit(1);
}, 30000);