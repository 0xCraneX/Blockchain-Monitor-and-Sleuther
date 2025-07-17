import 'dotenv/config';
import chalk from 'chalk';
import ora from 'ora';
import { OptimizedWhaleMonitor } from './src/performance/OptimizedWhaleMonitor.js';
import { createLogger, formatDuration } from './src/utils/logger.js';

const logger = createLogger('demo');

/**
 * Demonstration of Optimized Whale Monitor
 * 
 * Shows performance capabilities:
 * - Monitoring 1000 addresses
 * - Parallel processing with worker threads
 * - Memory optimization
 * - Real-time pattern detection
 * - Performance metrics
 */
async function runDemo() {
  console.log(chalk.cyan.bold('\n🚀 Polkadot Whale Monitor - Performance Demo\n'));
  console.log(chalk.white('This demo showcases monitoring 1000 addresses with optimized performance.\n'));
  
  // Configuration for demo
  const config = {
    // Scale testing
    maxAddresses: parseInt(process.env.DEMO_ADDRESSES) || 1000,
    
    // Performance settings
    workerCount: parseInt(process.env.WORKER_COUNT) || 4,
    batchSize: 50,
    maxMemoryMB: parseInt(process.env.MAX_MEMORY_MB) || 100,
    cacheSize: 10000,
    
    // Update intervals
    updateInterval: 30000, // 30 seconds for demo
    fullScanInterval: 120000, // 2 minutes for demo
    
    // Enable all optimizations
    enableParallel: true,
    enableStreaming: true,
    enableCompression: true,
    enableIncremental: true
  };
  
  console.log(chalk.yellow('Configuration:'));
  console.log(chalk.white(`  • Addresses to monitor: ${config.maxAddresses}`));
  console.log(chalk.white(`  • Worker threads: ${config.workerCount}`));
  console.log(chalk.white(`  • Memory limit: ${config.maxMemoryMB}MB`));
  console.log(chalk.white(`  • Batch size: ${config.batchSize}\n`));
  
  const monitor = new OptimizedWhaleMonitor(config);
  
  // Set up event listeners
  setupEventListeners(monitor);
  
  try {
    // Initialize the monitor
    const initSpinner = ora('Initializing optimized monitor...').start();
    await monitor.initialize();
    initSpinner.succeed('Monitor initialized');
    
    // Start monitoring
    console.log(chalk.cyan('\n📊 Starting whale monitoring...\n'));
    await monitor.startMonitoring();
    
    // Run for demo duration
    const demoDuration = parseInt(process.env.DEMO_DURATION) || 60000; // 1 minute default
    console.log(chalk.yellow(`\nDemo will run for ${demoDuration / 1000} seconds...\n`));
    
    // Display real-time metrics
    const metricsInterval = setInterval(() => {
      displayMetrics(monitor);
    }, 5000);
    
    // Wait for demo duration
    await new Promise(resolve => setTimeout(resolve, demoDuration));
    
    // Stop monitoring
    clearInterval(metricsInterval);
    console.log(chalk.cyan('\n📊 Stopping monitor...\n'));
    
    const finalReport = await monitor.stopMonitoring();
    
    // Display final report
    displayFinalReport(finalReport);
    
  } catch (error) {
    console.error(chalk.red('\n❌ Demo error:'), error);
    process.exit(1);
  }
}

/**
 * Set up event listeners for the monitor
 */
function setupEventListeners(monitor) {
  // Monitoring started
  monitor.on('monitoring:started', (data) => {
    console.log(chalk.green(`✅ Monitoring started for ${data.addressCount} addresses`));
  });
  
  // Scan completed
  monitor.on('scan:completed', (data) => {
    console.log(chalk.blue(`\n🔍 Scan completed:`));
    console.log(chalk.white(`  • Duration: ${formatDuration(data.duration)}`));
    console.log(chalk.white(`  • Addresses processed: ${data.addressesProcessed}`));
    console.log(chalk.white(`  • Patterns detected: ${data.patternsDetected}`));
    console.log(chalk.white(`  • Memory usage: ${data.memoryUsageMB.toFixed(2)}MB\n`));
  });
  
  // Patterns detected
  monitor.on('patterns:detected', (patterns) => {
    console.log(chalk.yellow(`\n⚠️  ${patterns.length} patterns detected:`));
    
    // Group patterns by type
    const patternTypes = {};
    patterns.forEach(pattern => {
      patternTypes[pattern.type] = (patternTypes[pattern.type] || 0) + 1;
    });
    
    Object.entries(patternTypes).forEach(([type, count]) => {
      console.log(chalk.white(`  • ${type}: ${count}`));
    });
    
    // Show sample patterns
    if (patterns.length > 0) {
      console.log(chalk.gray('\n  Sample patterns:'));
      patterns.slice(0, 3).forEach(pattern => {
        console.log(chalk.gray(`    - ${pattern.type} at ${pattern.address?.substring(0, 16)}...`));
      });
    }
  });
  
  // Metrics updates
  let lastMetricsLog = 0;
  monitor.on('metrics:update', (metrics) => {
    // Log detailed metrics every 20 seconds
    const now = Date.now();
    if (now - lastMetricsLog > 20000) {
      console.log(chalk.gray(`\n📈 Performance update: ${metrics.accountsProcessed} addresses processed`));
      lastMetricsLog = now;
    }
  });
}

/**
 * Display real-time metrics
 */
function displayMetrics(monitor) {
  const report = monitor.getPerformanceReport();
  
  console.log(chalk.cyan('\n=== Real-time Metrics ==='));
  console.log(chalk.white(`Uptime: ${report.summary.uptime}`));
  console.log(chalk.white(`Accounts processed: ${report.summary.accountsProcessed}/${report.summary.accountsMonitored}`));
  console.log(chalk.white(`Processing rate: ${report.performance.processingRate}`));
  console.log(chalk.white(`Cache hit rate: ${report.performance.cacheHitRate}`));
  console.log(chalk.white(`Memory usage: ${report.memory.currentUsageMB}MB / ${report.memory.limitMB}MB`));
  console.log(chalk.white(`Patterns detected: ${report.summary.patternsDetected}`));
}

/**
 * Display final performance report
 */
function displayFinalReport(report) {
  console.log(chalk.cyan.bold('\n==============================================='));
  console.log(chalk.cyan.bold('          PERFORMANCE REPORT'));
  console.log(chalk.cyan.bold('===============================================\n'));
  
  // Summary
  console.log(chalk.yellow('📊 Summary:'));
  console.log(chalk.white(`  • Total uptime: ${report.summary.uptime}`));
  console.log(chalk.white(`  • Addresses monitored: ${report.summary.accountsMonitored}`));
  console.log(chalk.white(`  • Addresses processed: ${report.summary.accountsProcessed}`));
  console.log(chalk.white(`  • Transfers analyzed: ${report.summary.transfersAnalyzed.toLocaleString()}`));
  console.log(chalk.white(`  • Patterns detected: ${report.summary.patternsDetected}\n`));
  
  // Performance metrics
  console.log(chalk.yellow('⚡ Performance:'));
  console.log(chalk.white(`  • Processing rate: ${report.performance.processingRate}`));
  console.log(chalk.white(`  • Avg processing time: ${report.performance.avgProcessingTime}`));
  console.log(chalk.white(`  • Last cycle time: ${report.performance.lastCycleTime}`));
  console.log(chalk.white(`  • Cache hit rate: ${report.performance.cacheHitRate}`));
  console.log(chalk.white(`  • Worker utilization: ${report.performance.workerUtilization}\n`));
  
  // Memory usage
  console.log(chalk.yellow('💾 Memory Usage:'));
  console.log(chalk.white(`  • Current: ${report.memory.currentUsageMB}MB`));
  console.log(chalk.white(`  • Peak: ${report.memory.peakUsageMB}MB`));
  console.log(chalk.white(`  • Limit: ${report.memory.limitMB}MB`));
  console.log(chalk.white(`  • Cache entries: ${report.memory.cacheEntries.toLocaleString()}\n`));
  
  // Optimizations
  console.log(chalk.yellow('🔧 Optimizations Applied:'));
  console.log(chalk.white(`  • Parallel processing: ${report.optimization.parallelProcessing ? '✅' : '❌'}`));
  console.log(chalk.white(`  • Stream processing: ${report.optimization.streaming ? '✅' : '❌'}`));
  console.log(chalk.white(`  • Data compression: ${report.optimization.compression ? '✅' : '❌'}`));
  console.log(chalk.white(`  • Incremental updates: ${report.optimization.incrementalUpdates ? '✅' : '❌'}\n`));
  
  // Target metrics achievement
  console.log(chalk.yellow('🎯 Target Metrics:'));
  const cycleTime = parseFloat(report.performance.lastCycleTime.replace(/[^\d.]/g, ''));
  const memoryUsage = parseFloat(report.memory.peakUsageMB);
  
  const cycleTarget = cycleTime < 300000; // < 5 minutes
  const memoryTarget = memoryUsage < 100; // < 100MB
  
  console.log(chalk.white(`  • Full cycle < 5 min: ${cycleTarget ? '✅' : '❌'} (${report.performance.lastCycleTime})`));
  console.log(chalk.white(`  • Memory < 100MB: ${memoryTarget ? '✅' : '❌'} (${report.memory.peakUsageMB}MB peak)`));
  
  if (cycleTarget && memoryTarget) {
    console.log(chalk.green.bold('\n✨ All performance targets achieved! ✨'));
  }
  
  console.log(chalk.cyan.bold('\n===============================================\n'));
}

/**
 * Performance benchmark test
 */
async function runBenchmark() {
  console.log(chalk.cyan.bold('\n🏁 Running Performance Benchmark...\n'));
  
  const testConfigs = [
    { addresses: 100, workers: 1, name: 'Small (100 addresses, 1 worker)' },
    { addresses: 500, workers: 2, name: 'Medium (500 addresses, 2 workers)' },
    { addresses: 1000, workers: 4, name: 'Large (1000 addresses, 4 workers)' }
  ];
  
  const results = [];
  
  for (const config of testConfigs) {
    console.log(chalk.yellow(`\nTesting: ${config.name}`));
    
    const monitor = new OptimizedWhaleMonitor({
      maxAddresses: config.addresses,
      workerCount: config.workers,
      maxMemoryMB: 100,
      enableParallel: true
    });
    
    await monitor.initialize();
    
    const startTime = Date.now();
    const startMemory = process.memoryUsage();
    
    await monitor.startMonitoring();
    
    // Wait for one full scan
    await new Promise(resolve => {
      monitor.once('scan:completed', resolve);
    });
    
    const endTime = Date.now();
    const endMemory = process.memoryUsage();
    
    const report = await monitor.stopMonitoring();
    
    results.push({
      config: config.name,
      addresses: config.addresses,
      workers: config.workers,
      duration: endTime - startTime,
      memoryUsed: (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024,
      processedCount: report.summary.accountsProcessed,
      rate: report.performance.processingRate
    });
    
    console.log(chalk.green(`  ✓ Completed in ${formatDuration(endTime - startTime)}`));
  }
  
  // Display benchmark results
  console.log(chalk.cyan.bold('\n📊 Benchmark Results:\n'));
  console.table(results.map(r => ({
    Configuration: r.config,
    'Duration': formatDuration(r.duration),
    'Memory (MB)': r.memoryUsed.toFixed(2),
    'Processing Rate': r.rate
  })));
}

// Main execution
(async () => {
  const mode = process.argv[2] || 'demo';
  
  try {
    if (mode === 'benchmark') {
      await runBenchmark();
    } else {
      await runDemo();
    }
  } catch (error) {
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
})();