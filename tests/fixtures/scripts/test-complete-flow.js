#!/usr/bin/env node

/**
 * Complete end-to-end test to verify real blockchain data flow
 */

import fetch from 'node-fetch';
import { spawn } from 'child_process';

const TEST_ADDRESS = '15kUt2i86LHRWCkE3D9Bg1HZAoc2smhn1fwPzDERTb1BXAkX';
const SERVER_PORT = 3001;
const BASE_URL = `http://localhost:${SERVER_PORT}`;

async function waitForServer(timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`${BASE_URL}/api/stats`);
      if (response.ok) {
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

async function testCompleteFlow() {
  console.log('🚀 Testing complete data flow from blockchain to API...\n');
  
  // Start the server
  console.log('📡 Starting server...');
  const server = spawn('npm', ['start'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SKIP_BLOCKCHAIN: 'false' }
  });
  
  let serverReady = false;
  let serverLogs = '';
  
  server.stdout.on('data', (data) => {
    const output = data.toString();
    serverLogs += output;
    if (output.includes('Server running at')) {
      serverReady = true;
    }
  });
  
  server.stderr.on('data', (data) => {
    serverLogs += data.toString();
  });
  
  try {
    // Wait for server to start
    console.log('⏳ Waiting for server to start...');
    const isReady = await waitForServer();
    
    if (!isReady) {
      throw new Error('Server failed to start within timeout');
    }
    
    console.log('✅ Server is running\n');
    
    // Test 1: Stats endpoint
    console.log('1️⃣ Testing stats endpoint...');
    const statsResponse = await fetch(`${BASE_URL}/api/stats`);
    const stats = await statsResponse.json();
    console.log(`   Total accounts: ${stats.totalAccounts || 0}`);
    console.log(`   Total transfers: ${stats.totalTransfers || 0}`);
    console.log(`   Status: ${statsResponse.ok ? '✅ Working' : '❌ Failed'}\n`);
    
    // Test 2: Graph endpoint with real address
    console.log('2️⃣ Testing graph endpoint with real address...');
    const graphResponse = await fetch(`${BASE_URL}/api/graph/${TEST_ADDRESS}?depth=1&maxNodes=10`);
    
    if (graphResponse.ok) {
      const graphData = await graphResponse.json();
      console.log(`   Nodes: ${graphData.nodes?.length || 0}`);
      console.log(`   Edges: ${graphData.edges?.length || 0}`);
      console.log(`   Data source: ${graphData.metadata?.dataSource || 'unknown'}`);
      console.log(`   Center address: ${graphData.metadata?.centerNode || 'unknown'}`);
      
      // Check if we're getting real data
      const isRealData = graphData.metadata?.dataSource === 'live' || 
                        graphData.nodes?.some(n => n.balance?.free && n.balance.free !== '0');
      
      console.log(`   Using real data: ${isRealData ? '✅ Yes' : '⚠️  No'}\n`);
      
      if (isRealData) {
        const centerNode = graphData.nodes?.find(n => n.address === TEST_ADDRESS);
        if (centerNode) {
          console.log(`   Real balance found: ${centerNode.balance?.free || 'unknown'}`);
          console.log(`   Identity: ${centerNode.identity?.display || 'None'}`);
        }
      }
    } else {
      console.log(`   Status: ❌ Failed (${graphResponse.status})\n`);
    }
    
    // Test 3: Address search
    console.log('3️⃣ Testing address search...');
    const searchResponse = await fetch(`${BASE_URL}/api/addresses/search?q=${TEST_ADDRESS.substring(0, 10)}&limit=5`);
    
    if (searchResponse.ok) {
      const searchResults = await searchResponse.json();
      console.log(`   Search results: ${searchResults.addresses?.length || 0}`);
      console.log(`   Status: ✅ Working\n`);
    } else {
      console.log(`   Status: ❌ Failed (${searchResponse.status})\n`);
    }
    
    // Test 4: Relationships endpoint
    console.log('4️⃣ Testing relationships endpoint...');
    const relResponse = await fetch(`${BASE_URL}/api/relationships/${TEST_ADDRESS}?limit=5`);
    
    if (relResponse.ok) {
      const relationships = await relResponse.json();
      console.log(`   Relationships found: ${relationships.relationships?.length || 0}`);
      console.log(`   Status: ✅ Working\n`);
    } else {
      console.log(`   Status: ❌ Failed (${relResponse.status})\n`);
    }
    
    console.log('🎉 Complete flow test finished!');
    
    // Check server logs for blockchain connection
    const hasBlockchainConnection = serverLogs.includes('Connected to blockchain') || 
                                   serverLogs.includes('Blockchain connection established');
    
    const hasRealDataService = serverLogs.includes('Using real blockchain data') ||
                              !serverLogs.includes('SKIP_BLOCKCHAIN=true');
    
    return {
      status: 'success',
      serverStarted: true,
      blockchainConnected: hasBlockchainConnection,
      realDataServiceActive: hasRealDataService,
      apiEndpointsWorking: statsResponse.ok && graphResponse.ok,
      conclusion: hasBlockchainConnection && !serverLogs.includes('SKIP_BLOCKCHAIN=true') 
        ? 'Application is using real blockchain data' 
        : 'Application may be using sample data'
    };
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (serverLogs) {
      console.log('\n📋 Server logs:');
      console.log(serverLogs.split('\n').slice(-10).join('\n')); // Last 10 lines
    }
    
    return {
      status: 'failed',
      error: error.message,
      serverLogs: serverLogs.split('\n').slice(-5).join('\n')
    };
  } finally {
    // Clean up
    console.log('\n🧹 Cleaning up...');
    server.kill('SIGTERM');
    
    // Wait a moment for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

testCompleteFlow()
  .then(result => {
    console.log('\n📊 Complete Flow Test Results:');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'success' ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });