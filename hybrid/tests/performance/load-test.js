import { HybridWhaleMonitor } from '../../core/HybridMonitor.js';
import { hybridConfig } from '../../config/hybrid.config.js';

class PerformanceLoadTest {
  constructor() {
    this.testConfig = {
      ...hybridConfig,
      environment: 'test',
      monitoring: {
        ...hybridConfig.monitoring,
        topAccountsLimit: 100, // Start with fewer for testing
        enableRealTimeMode: true,
        enableHistoricalMode: false
      }
    };
    
    this.metrics = {
      startTime: null,
      alertsReceived: 0,
      enrichedAlerts: 0,
      averageLatency: 0,
      maxLatency: 0,
      minLatency: Infinity,
      memoryUsage: [],
      cpuUsage: [],
      errors: []
    };
    
    this.testDuration = 300000; // 5 minutes
    this.simulationInterval = null;
    this.metricsInterval = null;
  }
  
  async runLoadTest() {
    console.log('🚀 HYBRID PERFORMANCE LOAD TEST');
    console.log('=' .repeat(50));
    console.log(`Duration: ${this.testDuration / 1000}s`);
    console.log(`Target: ${this.testConfig.monitoring.topAccountsLimit} addresses`);
    console.log('=' .repeat(50));
    
    const monitor = new HybridWhaleMonitor(this.testConfig);
    
    // Set up monitoring
    this.setupMonitoring(monitor);
    
    try {
      // Start the hybrid monitor
      console.log('📡 Starting hybrid monitor...');
      await monitor.start();
      
      this.metrics.startTime = Date.now();
      
      // Start metrics collection
      this.startMetricsCollection();
      
      // Start load simulation
      this.startLoadSimulation(monitor);
      
      // Run test for specified duration
      console.log(`⏱️  Running load test for ${this.testDuration / 1000} seconds...`);
      await this.sleep(this.testDuration);
      
      // Stop simulation
      this.stopLoadSimulation();
      
      // Wait for final processing
      console.log('⏳ Waiting for final processing...');
      await this.sleep(10000);
      
      // Collect final metrics
      const finalMetrics = monitor.getMetrics();
      
      // Generate report
      this.generateReport(finalMetrics);
      
    } catch (error) {
      console.error('❌ Load test failed:', error.message);
      this.metrics.errors.push(error.message);
    } finally {
      // Cleanup
      await monitor.stop();
      this.stopMetricsCollection();
    }
  }
  
  setupMonitoring(monitor) {
    monitor.on('alert', (alert) => {
      this.metrics.alertsReceived++;
      
      const latency = Date.now() - alert.timestamp;
      this.updateLatencyMetrics(latency);
    });
    
    monitor.on('enrichedAlert', (alert) => {
      this.metrics.enrichedAlerts++;
      
      if (alert.totalProcessingTime) {
        this.updateLatencyMetrics(alert.totalProcessingTime);
      }
    });
    
    monitor.on('error', (error) => {
      this.metrics.errors.push(`${error.source}: ${error.error.message}`);
    });
    
    monitor.on('blockIndexed', (data) => {
      // Track indexing performance
      if (data.processingTime > 1000) { // Slow block processing
        console.warn(`⚠️  Slow block processing: ${data.blockNumber} (${data.processingTime}ms)`);
      }
    });
  }
  
  updateLatencyMetrics(latency) {
    // Update average
    if (this.metrics.averageLatency === 0) {
      this.metrics.averageLatency = latency;
    } else {
      this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2;
    }
    
    // Update min/max
    this.metrics.maxLatency = Math.max(this.metrics.maxLatency, latency);
    this.metrics.minLatency = Math.min(this.metrics.minLatency, latency);
  }
  
  startMetricsCollection() {
    this.metricsInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 5000); // Every 5 seconds
  }
  
  stopMetricsCollection() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
  }
  
  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage.push({\n      timestamp: Date.now(),\n      rss: memUsage.rss,\n      heapUsed: memUsage.heapUsed,\n      heapTotal: memUsage.heapTotal\n    });\n    \n    // CPU usage would require additional libraries in a real implementation\n    // For now, we'll estimate based on event loop lag\n    const start = process.hrtime.bigint();\n    setImmediate(() => {\n      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms\n      this.metrics.cpuUsage.push({\n        timestamp: Date.now(),\n        eventLoopLag: lag\n      });\n    });\n  }\n  \n  startLoadSimulation(monitor) {\n    console.log('🎯 Starting load simulation...');\n    \n    // Simulate whale alerts at varying frequencies\n    this.simulationInterval = setInterval(() => {\n      this.simulateWhaleActivity(monitor);\n    }, 2000); // Every 2 seconds\n    \n    // Simulate burst activity\n    setTimeout(() => {\n      this.simulateBurstActivity(monitor);\n    }, 60000); // After 1 minute\n  }\n  \n  stopLoadSimulation() {\n    if (this.simulationInterval) {\n      clearInterval(this.simulationInterval);\n    }\n  }\n  \n  async simulateWhaleActivity(monitor) {\n    const scenarios = [\n      {\n        type: 'large_transfer',\n        amount: this.randomAmount(100000, 2000000),\n        from: this.randomAddress(),\n        to: this.randomAddress(),\n        severity: 'critical'\n      },\n      {\n        type: 'exchange_deposit',\n        amount: this.randomAmount(50000, 500000),\n        from: this.randomAddress(),\n        to: 'exchange_hot_wallet',\n        severity: 'important'\n      },\n      {\n        type: 'staking_change',\n        amount: this.randomAmount(10000, 100000),\n        from: this.randomAddress(),\n        to: 'validator_address',\n        severity: 'notable'\n      }\n    ];\n    \n    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];\n    \n    try {\n      await monitor.simulateAlert(scenario);\n    } catch (error) {\n      console.error('Simulation error:', error.message);\n    }\n  }\n  \n  async simulateBurstActivity(monitor) {\n    console.log('💥 Simulating burst activity...');\n    \n    // Generate 20 alerts rapidly\n    const promises = [];\n    \n    for (let i = 0; i < 20; i++) {\n      const alert = {\n        type: 'coordinated_movement',\n        amount: this.randomAmount(500000, 3000000),\n        from: this.randomAddress(),\n        to: this.randomAddress(),\n        severity: 'critical',\n        burst: true\n      };\n      \n      promises.push(monitor.simulateAlert(alert));\n    }\n    \n    try {\n      await Promise.all(promises);\n      console.log('✅ Burst simulation completed');\n    } catch (error) {\n      console.error('❌ Burst simulation failed:', error.message);\n    }\n  }\n  \n  randomAmount(min, max) {\n    return Math.floor(Math.random() * (max - min + 1)) + min;\n  }\n  \n  randomAddress() {\n    const addresses = [\n      '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn',\n      '1zugcavYA9yCuYwiEYeMHNJm9gXznYjNfXQjZsZukF1Mpow',\n      '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5',\n      '12xtAYsRUrmbniiWQqJtECiBQrMn8AypQcXhnQAc6RB6XkLW',\n      '14E5nqKAp3oAJcmzgZhUD2RcptBeUBScxKHgJKU4HPNcKVf3'\n    ];\n    \n    return addresses[Math.floor(Math.random() * addresses.length)];\n  }\n  \n  generateReport(finalMetrics) {\n    const duration = Date.now() - this.metrics.startTime;\n    \n    console.log('\\n📊 PERFORMANCE LOAD TEST RESULTS');\n    console.log('=' .repeat(50));\n    \n    // Test summary\n    console.log('🎯 TEST SUMMARY:');\n    console.log(`   Duration: ${duration / 1000}s`);\n    console.log(`   Alerts Generated: ${this.metrics.alertsReceived}`);\n    console.log(`   Enriched Alerts: ${this.metrics.enrichedAlerts}`);\n    console.log(`   Errors: ${this.metrics.errors.length}`);\n    \n    // Performance metrics\n    console.log('\\n⚡ PERFORMANCE METRICS:');\n    console.log(`   Average Latency: ${Math.round(this.metrics.averageLatency)}ms`);\n    console.log(`   Min Latency: ${Math.round(this.metrics.minLatency)}ms`);\n    console.log(`   Max Latency: ${Math.round(this.metrics.maxLatency)}ms`);\n    console.log(`   Alert Rate: ${(this.metrics.alertsReceived / (duration / 1000)).toFixed(2)} alerts/sec`);\n    \n    // System metrics\n    if (this.metrics.memoryUsage.length > 0) {\n      const avgMemory = this.metrics.memoryUsage.reduce((sum, m) => sum + m.heapUsed, 0) / this.metrics.memoryUsage.length;\n      const maxMemory = Math.max(...this.metrics.memoryUsage.map(m => m.heapUsed));\n      \n      console.log('\\n💾 MEMORY USAGE:');\n      console.log(`   Average Heap: ${Math.round(avgMemory / 1024 / 1024)}MB`);\n      console.log(`   Peak Heap: ${Math.round(maxMemory / 1024 / 1024)}MB`);\n    }\n    \n    if (this.metrics.cpuUsage.length > 0) {\n      const avgLag = this.metrics.cpuUsage.reduce((sum, c) => sum + c.eventLoopLag, 0) / this.metrics.cpuUsage.length;\n      const maxLag = Math.max(...this.metrics.cpuUsage.map(c => c.eventLoopLag));\n      \n      console.log('\\n🔄 CPU/EVENT LOOP:');\n      console.log(`   Average Lag: ${avgLag.toFixed(2)}ms`);\n      console.log(`   Max Lag: ${maxLag.toFixed(2)}ms`);\n    }\n    \n    // Component metrics\n    console.log('\\n🔧 COMPONENT METRICS:');\n    \n    if (finalMetrics.rpc) {\n      console.log(`   RPC Connected: ${finalMetrics.rpc.isConnected}`);\n      console.log(`   Blocks Processed: ${finalMetrics.rpc.blocksProcessed}`);\n      console.log(`   RPC Reconnections: ${finalMetrics.rpc.reconnections}`);\n    }\n    \n    if (finalMetrics.indexer) {\n      console.log(`   Indexer Rate: ${finalMetrics.indexer.indexingRate}`);\n      console.log(`   Blocks Indexed: ${finalMetrics.indexer.blocksIndexed}`);\n      console.log(`   Transfers Indexed: ${finalMetrics.indexer.transfersIndexed}`);\n    }\n    \n    if (finalMetrics.cache) {\n      console.log(`   Cache Hit Rate: ${finalMetrics.cache.performance?.hitRate}`);\n    }\n    \n    if (finalMetrics.fetcher) {\n      console.log(`   Fetch Success Rate: ${finalMetrics.fetcher.successRate}`);\n      console.log(`   Average Fetch Time: ${finalMetrics.fetcher.averageFetchTime}`);\n    }\n    \n    // Error summary\n    if (this.metrics.errors.length > 0) {\n      console.log('\\n❌ ERRORS ENCOUNTERED:');\n      this.metrics.errors.slice(0, 5).forEach((error, i) => {\n        console.log(`   ${i + 1}. ${error}`);\n      });\n      \n      if (this.metrics.errors.length > 5) {\n        console.log(`   ... and ${this.metrics.errors.length - 5} more`);\n      }\n    }\n    \n    // Performance assessment\n    console.log('\\n📈 PERFORMANCE ASSESSMENT:');\n    \n    if (this.metrics.averageLatency < 5000) {\n      console.log('   ✅ Alert latency: EXCELLENT (<5s)');\n    } else if (this.metrics.averageLatency < 10000) {\n      console.log('   ⚠️  Alert latency: GOOD (<10s)');\n    } else {\n      console.log('   ❌ Alert latency: POOR (>10s)');\n    }\n    \n    if (this.metrics.errors.length === 0) {\n      console.log('   ✅ Error rate: EXCELLENT (0 errors)');\n    } else if (this.metrics.errors.length < 5) {\n      console.log('   ⚠️  Error rate: ACCEPTABLE (<5 errors)');\n    } else {\n      console.log('   ❌ Error rate: HIGH (>5 errors)');\n    }\n    \n    const memoryPeak = this.metrics.memoryUsage.length > 0 ? \n      Math.max(...this.metrics.memoryUsage.map(m => m.heapUsed)) : 0;\n    \n    if (memoryPeak < 500 * 1024 * 1024) { // 500MB\n      console.log('   ✅ Memory usage: EXCELLENT (<500MB)');\n    } else if (memoryPeak < 1024 * 1024 * 1024) { // 1GB\n      console.log('   ⚠️  Memory usage: ACCEPTABLE (<1GB)');\n    } else {\n      console.log('   ❌ Memory usage: HIGH (>1GB)');\n    }\n    \n    console.log('\\n=' .repeat(50));\n    console.log('LOAD TEST COMPLETED');\n    console.log('=' .repeat(50));\n  }\n  \n  sleep(ms) {\n    return new Promise(resolve => setTimeout(resolve, ms));\n  }\n}\n\n// Run the load test\nconst loadTest = new PerformanceLoadTest();\nloadTest.runLoadTest().catch(error => {\n  console.error('Load test runner failed:', error);\n  process.exit(1);\n});