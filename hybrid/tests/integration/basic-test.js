import { HybridWhaleMonitor } from '../../core/HybridMonitor.js';

async function runBasicTest() {
  console.log('='.repeat(60));
  console.log('HYBRID WHALE MONITOR - BASIC INTEGRATION TEST');
  console.log('='.repeat(60));
  
  const config = {
    // RPC configuration
    rpc: {
      endpoints: [
        'wss://rpc.polkadot.io',
        'wss://polkadot-rpc.dwellir.com'
      ],
      maxReconnectAttempts: 3,
      reconnectDelay: 2000
    },
    
    // Subscan configuration  
    subscan: {
      rateLimit: 1000, // 1 second between requests for testing
      maxRetries: 2
    },
    
    // Alert configuration
    alerts: {
      enrichmentTimeout: 10000 // 10 seconds for testing
    },
    
    // Cache configuration
    cacheConfig: {
      l1TTL: 10000,   // 10 seconds
      l2TTL: 30000,   // 30 seconds
      l3TTL: 60000,   // 1 minute
      l3Path: './hybrid/cache/test-data'
    },
    
    // Monitoring configuration
    topAccountsLimit: 10, // Small number for testing
    enableRealTimeMode: true,
    enableHistoricalMode: false
  };
  
  const monitor = new HybridWhaleMonitor(config);
  
  // Set up event handlers
  monitor.on('started', () => {
    console.log('✅ Monitor started successfully');
  });
  
  monitor.on('rpcConnected', () => {
    console.log('✅ RPC connection established');
  });
  
  monitor.on('alert', (alert) => {
    console.log(`🚨 Quick Alert: ${alert.type} - ${alert.amount} DOT (${alert.confidence})`);
  });
  
  monitor.on('enrichedAlert', (alert) => {
    console.log(`🎯 Enriched Alert: ${alert.type} - ${alert.amount} DOT`);
    console.log(`   Enrichment: ${alert.enrichment?.sources?.join(', ') || 'timeout'}`);
  });
  
  monitor.on('error', (error) => {
    console.error(`❌ Error from ${error.source}:`, error.error.message);
  });
  
  try {
    // Test 1: Initialization and startup
    console.log('\n📋 Test 1: Starting hybrid monitor...');
    await monitor.start();
    
    // Test 2: Wait a bit for connections to stabilize
    console.log('\n📋 Test 2: Waiting for connections to stabilize...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Test 3: Simulate some alerts
    console.log('\n📋 Test 3: Simulating test alerts...');
    
    await monitor.simulateAlert({
      type: 'transfer',
      amount: 150000,
      from: '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn',
      to: '1zugcavYA9yCuYwiEYeMHNJm9gXznYjNfXQjZsZukF1Mpow',
      severity: 'important'
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await monitor.simulateAlert({
      type: 'transfer',
      amount: 2000000,
      from: '1zugcavYA9yCuYwiEYeMHNJm9gXznYjNfXQjZsZukF1Mpow',
      to: '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5',
      severity: 'critical'
    });
    
    // Test 4: Wait for enrichment
    console.log('\n📋 Test 4: Waiting for alert enrichment...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Test 5: Check metrics
    console.log('\n📋 Test 5: Collecting metrics...');
    const metrics = monitor.getMetrics();
    
    console.log('\n📊 METRICS SUMMARY:');
    console.log('─'.repeat(40));
    console.log(`Uptime: ${Math.round(metrics.uptime / 1000)}s`);
    console.log(`Monitored Addresses: ${metrics.monitoredAddresses}`);
    console.log(`Total Alerts: ${metrics.totalAlerts}`);
    console.log(`RPC Alerts: ${metrics.rpcAlerts}`);
    console.log(`Enriched Alerts: ${metrics.enrichedAlerts}`);
    
    if (metrics.rpc) {
      console.log(`RPC Connected: ${metrics.rpc.isConnected}`);
      console.log(`RPC Blocks Processed: ${metrics.rpc.blocksProcessed}`);
    }
    
    if (metrics.cache) {
      console.log(`Cache Hit Rate: ${metrics.cache.performance?.hitRate || 'N/A'}`);
    }
    
    // Test 6: Test cache functionality
    console.log('\n📋 Test 6: Testing cache functionality...');
    
    const testData = { test: 'cache-value', timestamp: Date.now() };
    await monitor.cacheManager.set('test-key', testData);
    
    const cachedData = await monitor.cacheManager.get('test-key');
    
    if (cachedData && cachedData.test === 'cache-value') {
      console.log('✅ Cache test passed');
    } else {
      console.log('❌ Cache test failed');
    }
    
    // Test 7: Add a test address for monitoring
    console.log('\n📋 Test 7: Adding test address...');
    
    const testAddress = '12xtAYsRUrmbniiWQqJtECiBQrMn8AypQcXhnQAc6RB6XkLW';
    await monitor.addTestAddress(testAddress);
    
    console.log(`✅ Added test address: ${testAddress}`);
    
    // Wait a bit more to see if any real-time events come through
    console.log('\n📋 Monitoring for real-time events (30 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Final metrics
    const finalMetrics = monitor.getMetrics();
    console.log('\n📊 FINAL METRICS:');
    console.log('─'.repeat(40));
    console.log(JSON.stringify(finalMetrics, null, 2));
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    try {
      await monitor.stop();
      console.log('✅ Monitor stopped successfully');
    } catch (error) {
      console.error('❌ Error during cleanup:', error.message);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETED');
  console.log('='.repeat(60));
}

// Handle process signals for clean shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  process.exit(0);
});

// Run the test
runBasicTest().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});