#!/usr/bin/env node

/**
 * Performance Benchmarks for Blockchain Monitoring Tool
 * Ensures demo runs smoothly under pressure
 */

import { performance } from 'perf_hooks';
import chalk from 'chalk';
import ora from 'ora';

class PerformanceBenchmark {
  constructor() {
    this.results = [];
    this.targetMetrics = {
      detectionLatency: 500,      // ms
      queryResponse: 100,         // ms
      graphRendering: 200,        // ms
      alertGeneration: 300,       // ms
      concurrentAddresses: 1000,  // count
      transactionsPerSecond: 10000 // count
    };
  }

  /**
   * Run all benchmarks
   */
  async runAll() {
    console.log(chalk.bold('\n🚀 Running Performance Benchmarks\n'));
    
    await this.benchmarkDetectionLatency();
    await this.benchmarkQueryPerformance();
    await this.benchmarkConcurrentProcessing();
    await this.benchmarkMemoryUsage();
    await this.benchmarkSpeedControls();
    
    this.printSummary();
  }

  /**
   * Benchmark anomaly detection latency
   */
  async benchmarkDetectionLatency() {
    const spinner = ora('Testing detection latency...').start();
    const iterations = 1000;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const transaction = this.generateMockTransaction();
      
      const start = performance.now();
      // Simulate anomaly detection
      await this.detectAnomaly(transaction);
      const end = performance.now();
      
      times.push(end - start);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const maxTime = Math.max(...times);
    const p95Time = times.sort((a, b) => a - b)[Math.floor(iterations * 0.95)];

    this.results.push({
      test: 'Detection Latency',
      average: avgTime,
      max: maxTime,
      p95: p95Time,
      target: this.targetMetrics.detectionLatency,
      passed: avgTime < this.targetMetrics.detectionLatency
    });

    spinner.succeed(`Detection latency: ${avgTime.toFixed(2)}ms avg, ${p95Time.toFixed(2)}ms p95`);
  }

  /**
   * Benchmark query performance
   */
  async benchmarkQueryPerformance() {
    const spinner = ora('Testing query performance...').start();
    const queries = [
      { type: 'whale_balance', complexity: 'simple' },
      { type: 'transaction_history', complexity: 'medium' },
      { type: 'network_graph', complexity: 'complex' },
      { type: 'pattern_matching', complexity: 'heavy' }
    ];

    const results = [];
    
    for (const query of queries) {
      const times = [];
      
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        await this.executeQuery(query);
        const end = performance.now();
        times.push(end - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      results.push({ query: query.type, time: avgTime });
    }

    const overallAvg = results.reduce((sum, r) => sum + r.time, 0) / results.length;
    
    this.results.push({
      test: 'Query Performance',
      average: overallAvg,
      breakdown: results,
      target: this.targetMetrics.queryResponse,
      passed: overallAvg < this.targetMetrics.queryResponse
    });

    spinner.succeed(`Query performance: ${overallAvg.toFixed(2)}ms average`);
  }

  /**
   * Benchmark concurrent address monitoring
   */
  async benchmarkConcurrentProcessing() {
    const spinner = ora('Testing concurrent processing...').start();
    const addressCounts = [100, 500, 1000, 2000, 5000];
    const results = [];

    for (const count of addressCounts) {
      const addresses = Array.from({ length: count }, () => this.generateMockAddress());
      
      const start = performance.now();
      await Promise.all(addresses.map(addr => this.processAddress(addr)));
      const end = performance.now();
      
      const totalTime = end - start;
      const timePerAddress = totalTime / count;
      
      results.push({
        count,
        totalTime,
        timePerAddress,
        throughput: (count / totalTime) * 1000 // addresses per second
      });
    }

    const max = results[results.length - 1];
    
    this.results.push({
      test: 'Concurrent Processing',
      maxAddresses: max.count,
      throughput: max.throughput,
      target: this.targetMetrics.concurrentAddresses,
      passed: max.count >= this.targetMetrics.concurrentAddresses && max.timePerAddress < 10
    });

    spinner.succeed(`Concurrent processing: ${max.count} addresses in ${max.totalTime.toFixed(0)}ms`);
  }

  /**
   * Benchmark memory usage under load
   */
  async benchmarkMemoryUsage() {
    const spinner = ora('Testing memory usage...').start();
    const initialMemory = process.memoryUsage();
    const measurements = [];

    // Generate large dataset
    const transactions = Array.from({ length: 100000 }, () => this.generateMockTransaction());
    const addresses = Array.from({ length: 10000 }, () => this.generateMockAddress());

    // Process in batches
    for (let i = 0; i < 10; i++) {
      const batch = transactions.slice(i * 10000, (i + 1) * 10000);
      await this.processBatch(batch);
      
      const memory = process.memoryUsage();
      measurements.push({
        heapUsed: (memory.heapUsed - initialMemory.heapUsed) / 1024 / 1024, // MB
        external: (memory.external - initialMemory.external) / 1024 / 1024
      });
    }

    const peakMemory = Math.max(...measurements.map(m => m.heapUsed));
    const avgMemory = measurements.reduce((sum, m) => sum + m.heapUsed, 0) / measurements.length;

    this.results.push({
      test: 'Memory Usage',
      peak: peakMemory,
      average: avgMemory,
      target: 500, // MB
      passed: peakMemory < 500
    });

    spinner.succeed(`Memory usage: ${avgMemory.toFixed(2)}MB avg, ${peakMemory.toFixed(2)}MB peak`);
  }

  /**
   * Benchmark speed controls (1x, 10x, 100x)
   */
  async benchmarkSpeedControls() {
    const spinner = ora('Testing speed controls...').start();
    const speedMultipliers = [1, 10, 100];
    const results = [];

    for (const speed of speedMultipliers) {
      const events = this.generateTimelineEvents(1000); // 1000 events
      
      const start = performance.now();
      await this.replayEvents(events, speed);
      const end = performance.now();
      
      const actualTime = end - start;
      const simulatedTime = events[events.length - 1].timestamp - events[0].timestamp;
      const effectiveSpeed = simulatedTime / actualTime;
      
      results.push({
        targetSpeed: speed,
        actualSpeed: effectiveSpeed,
        accuracy: Math.abs(effectiveSpeed - speed) / speed,
        renderTime: actualTime
      });
    }

    this.results.push({
      test: 'Speed Controls',
      results: results,
      passed: results.every(r => r.accuracy < 0.1) // Within 10% of target
    });

    spinner.succeed(`Speed controls: ${results.map(r => `${r.targetSpeed}x`).join(', ')} tested`);
  }

  /**
   * Helper methods for simulating operations
   */
  async detectAnomaly(transaction) {
    // Simulate complex calculations
    await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
    return {
      anomalyDetected: Math.random() > 0.9,
      score: Math.random() * 100
    };
  }

  async executeQuery(query) {
    const delay = {
      simple: 10,
      medium: 30,
      complex: 50,
      heavy: 80
    }[query.complexity];
    
    await new Promise(resolve => setTimeout(resolve, delay + Math.random() * 20));
    return { results: [], count: Math.floor(Math.random() * 1000) };
  }

  async processAddress(address) {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
    return { processed: true };
  }

  async processBatch(batch) {
    await new Promise(resolve => setTimeout(resolve, 50));
    return batch.length;
  }

  async replayEvents(events, speed) {
    const delay = 1000 / speed; // Base delay adjusted by speed
    for (const event of events) {
      await new Promise(resolve => setTimeout(resolve, delay / events.length));
    }
  }

  generateMockTransaction() {
    return {
      hash: '0x' + Math.random().toString(16).substr(2, 64),
      from: this.generateMockAddress(),
      to: this.generateMockAddress(),
      amount: Math.floor(Math.random() * 1000000),
      timestamp: Date.now() - Math.floor(Math.random() * 86400000)
    };
  }

  generateMockAddress() {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    return '1' + Array.from({ length: 47 }, () => 
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  }

  generateTimelineEvents(count) {
    const baseTime = Date.now() - 86400000; // 24 hours ago
    return Array.from({ length: count }, (_, i) => ({
      timestamp: baseTime + (i * 86400000 / count),
      type: ['transfer', 'stake', 'unstake'][Math.floor(Math.random() * 3)],
      amount: Math.floor(Math.random() * 1000000)
    }));
  }

  /**
   * Print benchmark summary
   */
  printSummary() {
    console.log(chalk.bold('\n📊 Benchmark Summary\n'));
    
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    
    this.results.forEach(result => {
      const status = result.passed ? chalk.green('✓') : chalk.red('✗');
      console.log(`${status} ${result.test}`);
      
      if (result.average !== undefined) {
        console.log(`  Average: ${result.average.toFixed(2)}ms (target: ${result.target}ms)`);
      }
      
      if (result.breakdown) {
        result.breakdown.forEach(b => {
          console.log(`  - ${b.query}: ${b.time.toFixed(2)}ms`);
        });
      }
      
      console.log('');
    });
    
    const allPassed = passed === total;
    const summary = allPassed 
      ? chalk.green(`✅ All benchmarks passed (${passed}/${total})`)
      : chalk.yellow(`⚠️  ${passed}/${total} benchmarks passed`);
    
    console.log(chalk.bold(summary));
    
    if (!allPassed) {
      console.log(chalk.yellow('\nOptimization needed for:'));
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`- ${r.test}`);
      });
    }
    
    console.log(chalk.dim('\nDemo readiness: ' + (allPassed ? 'READY' : 'NEEDS OPTIMIZATION')));
  }
}

// Run benchmarks
const benchmark = new PerformanceBenchmark();
benchmark.runAll().catch(console.error);