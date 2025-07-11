import http from 'http';
import WebSocket from 'ws';
import { spawn } from 'child_process';
import os from 'os';

class StressTester {
  constructor(baseUrl = 'http://localhost:3000', wsUrl = 'ws://localhost:3000') {
    this.baseUrl = baseUrl;
    this.wsUrl = wsUrl;
    this.metrics = {
      requests: {
        sent: 0,
        successful: 0,
        failed: 0,
        errors: []
      },
      response: {
        times: [],
        statusCodes: {}
      },
      system: {
        cpuUsage: [],
        memoryUsage: []
      },
      websockets: {
        connected: 0,
        messages: 0,
        errors: 0
      }
    };
    this.running = false;
    this.startTime = null;
  }

  async findBreakingPoint() {
    console.log('🔥 Starting Stress Test - Finding Breaking Point\n');
    
    let currentRPS = 100;
    const increment = 100;
    const testDuration = 30000; // 30 seconds per level
    let consecutiveFailures = 0;
    
    this.running = true;
    this.startTime = Date.now();
    
    // Monitor system resources
    this.startSystemMonitoring();
    
    while (this.running && currentRPS <= 5000) {
      console.log(`\n📈 Testing at ${currentRPS} requests/second...`);
      
      // Reset metrics for this level
      this.resetLevelMetrics();
      
      // Run test at current level
      await this.runLoadLevel(currentRPS, testDuration);
      
      // Analyze results
      const errorRate = (this.metrics.requests.failed / this.metrics.requests.sent) * 100;
      const avgResponseTime = this.calculateAverageResponseTime();
      const p95ResponseTime = this.calculatePercentile(95);
      
      console.log(`\n📊 Results at ${currentRPS} RPS:`);
      console.log(`   - Success Rate: ${(100 - errorRate).toFixed(2)}%`);
      console.log(`   - Avg Response Time: ${avgResponseTime.toFixed(2)}ms`);
      console.log(`   - P95 Response Time: ${p95ResponseTime.toFixed(2)}ms`);
      console.log(`   - Errors: ${this.metrics.requests.failed}`);
      
      // Check breaking conditions
      if (errorRate > 50 || avgResponseTime > 5000 || p95ResponseTime > 10000) {
        consecutiveFailures++;
        console.log(`\n⚠️  Performance degraded significantly!`);
        
        if (consecutiveFailures >= 2) {
          console.log(`\n💥 Breaking point found at approximately ${currentRPS - increment} RPS`);
          break;
        }
      } else {
        consecutiveFailures = 0;
      }
      
      // Increase load
      currentRPS += increment;
      
      // Cool down period
      await this.sleep(5000);
    }
    
    this.running = false;
    return this.generateStressTestReport();
  }

  async runLoadLevel(targetRPS, duration) {
    const interval = 1000 / targetRPS;
    const endTime = Date.now() + duration;
    const promises = [];
    
    while (Date.now() < endTime && this.running) {
      // Send HTTP request
      promises.push(this.sendRequest());
      
      // Occasionally create WebSocket connections
      if (Math.random() < 0.1) {
        promises.push(this.createWebSocketConnection());
      }
      
      await this.sleep(interval);
      
      // Clean up completed promises to prevent memory buildup
      if (promises.length > 1000) {
        await Promise.race(promises);
        promises.splice(0, 500);
      }
    }
    
    // Wait for remaining requests
    await Promise.allSettled(promises);
  }

  async sendRequest() {
    const endpoints = [
      '/api/addresses/info?address=1234567890',
      '/api/graph/connections?address=1234567890&minVolume=0',
      '/api/graph/multi-hop?address=1234567890&depth=2',
      '/api/relationships/scoring?address=1234567890',
      '/api/stats/summary'
    ];
    
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const startTime = performance.now();
    
    this.metrics.requests.sent++;
    
    return new Promise((resolve) => {
      const req = http.get(`${this.baseUrl}${endpoint}`, (res) => {
        const responseTime = performance.now() - startTime;
        
        // Record response
        this.metrics.response.times.push(responseTime);
        this.metrics.response.statusCodes[res.statusCode] = 
          (this.metrics.response.statusCodes[res.statusCode] || 0) + 1;
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          this.metrics.requests.successful++;
        } else {
          this.metrics.requests.failed++;
        }
        
        // Consume response data
        res.on('data', () => {});
        res.on('end', resolve);
      });
      
      req.on('error', (error) => {
        const responseTime = performance.now() - startTime;
        this.metrics.requests.failed++;
        this.metrics.requests.errors.push({
          time: Date.now(),
          error: error.message,
          endpoint
        });
        this.metrics.response.times.push(responseTime);
        resolve();
      });
      
      req.setTimeout(5000, () => {
        req.destroy();
        this.metrics.requests.failed++;
        resolve();
      });
    });
  }

  async createWebSocketConnection() {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(this.wsUrl);
        
        ws.on('open', () => {
          this.metrics.websockets.connected++;
          
          // Send test messages
          const testMessages = [
            { type: 'subscribe', channel: 'graph_updates' },
            { type: 'graph_query', data: { address: '1234567890', depth: 2 } }
          ];
          
          testMessages.forEach(msg => {
            ws.send(JSON.stringify(msg));
            this.metrics.websockets.messages++;
          });
          
          // Close after a delay
          setTimeout(() => {
            ws.close();
            resolve();
          }, Math.random() * 10000 + 5000);
        });
        
        ws.on('error', (error) => {
          this.metrics.websockets.errors++;
          resolve();
        });
        
        ws.on('close', resolve);
      } catch (error) {
        this.metrics.websockets.errors++;
        resolve();
      }
    });
  }

  startSystemMonitoring() {
    const monitoringInterval = setInterval(() => {
      if (!this.running) {
        clearInterval(monitoringInterval);
        return;
      }
      
      const cpuUsage = process.cpuUsage();
      const memUsage = process.memoryUsage();
      
      this.metrics.system.cpuUsage.push({
        timestamp: Date.now(),
        user: cpuUsage.user / 1000000,
        system: cpuUsage.system / 1000000
      });
      
      this.metrics.system.memoryUsage.push({
        timestamp: Date.now(),
        heapUsed: memUsage.heapUsed / 1024 / 1024,
        heapTotal: memUsage.heapTotal / 1024 / 1024,
        rss: memUsage.rss / 1024 / 1024
      });
    }, 1000);
  }

  resetLevelMetrics() {
    this.metrics.requests = {
      sent: 0,
      successful: 0,
      failed: 0,
      errors: []
    };
    this.metrics.response.times = [];
    this.metrics.websockets = {
      connected: 0,
      messages: 0,
      errors: 0
    };
  }

  calculateAverageResponseTime() {
    const times = this.metrics.response.times;
    if (times.length === 0) return 0;
    return times.reduce((a, b) => a + b, 0) / times.length;
  }

  calculatePercentile(percentile) {
    const times = [...this.metrics.response.times].sort((a, b) => a - b);
    if (times.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * times.length) - 1;
    return times[index];
  }

  generateStressTestReport() {
    const duration = (Date.now() - this.startTime) / 1000;
    
    return {
      summary: {
        duration: `${duration.toFixed(2)} seconds`,
        totalRequests: this.metrics.requests.sent,
        successfulRequests: this.metrics.requests.successful,
        failedRequests: this.metrics.requests.failed,
        successRate: `${((this.metrics.requests.successful / this.metrics.requests.sent) * 100).toFixed(2)}%`
      },
      performance: {
        avgResponseTime: `${this.calculateAverageResponseTime().toFixed(2)}ms`,
        p50ResponseTime: `${this.calculatePercentile(50).toFixed(2)}ms`,
        p95ResponseTime: `${this.calculatePercentile(95).toFixed(2)}ms`,
        p99ResponseTime: `${this.calculatePercentile(99).toFixed(2)}ms`
      },
      statusCodes: this.metrics.response.statusCodes,
      websockets: this.metrics.websockets,
      systemResources: {
        peakCPU: Math.max(...this.metrics.system.cpuUsage.map(u => u.user + u.system)),
        peakMemory: Math.max(...this.metrics.system.memoryUsage.map(m => m.heapUsed))
      },
      errors: this.metrics.requests.errors.slice(-10) // Last 10 errors
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Endurance test runner
class EnduranceTester extends StressTester {
  async runEnduranceTest(rps = 50, duration = 300000) { // 5 minutes default
    console.log(`🏃 Starting Endurance Test - ${rps} RPS for ${duration/1000} seconds\n`);
    
    this.running = true;
    this.startTime = Date.now();
    
    this.startSystemMonitoring();
    
    // Run sustained load
    await this.runLoadLevel(rps, duration);
    
    this.running = false;
    
    const report = this.generateStressTestReport();
    
    // Add endurance-specific metrics
    report.endurance = {
      sustainedRPS: rps,
      memoryLeakDetected: this.detectMemoryLeak(),
      performanceDegradation: this.detectPerformanceDegradation()
    };
    
    return report;
  }

  detectMemoryLeak() {
    if (this.metrics.system.memoryUsage.length < 10) return false;
    
    const firstHalf = this.metrics.system.memoryUsage.slice(0, Math.floor(this.metrics.system.memoryUsage.length / 2));
    const secondHalf = this.metrics.system.memoryUsage.slice(Math.floor(this.metrics.system.memoryUsage.length / 2));
    
    const avgFirstHalf = firstHalf.reduce((sum, m) => sum + m.heapUsed, 0) / firstHalf.length;
    const avgSecondHalf = secondHalf.reduce((sum, m) => sum + m.heapUsed, 0) / secondHalf.length;
    
    // If memory increased by more than 20%, possible leak
    return (avgSecondHalf - avgFirstHalf) / avgFirstHalf > 0.2;
  }

  detectPerformanceDegradation() {
    if (this.metrics.response.times.length < 100) return false;
    
    const firstQuarter = this.metrics.response.times.slice(0, Math.floor(this.metrics.response.times.length / 4));
    const lastQuarter = this.metrics.response.times.slice(-Math.floor(this.metrics.response.times.length / 4));
    
    const avgFirst = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
    const avgLast = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;
    
    // If response time increased by more than 50%, performance degraded
    return (avgLast - avgFirst) / avgFirst > 0.5;
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const testType = process.argv[2] || 'stress';
  
  console.log('🚀 Polkadot Analysis Tool - Performance Stress Testing\n');
  
  // Check if server is running
  http.get('http://localhost:3000/api/stats/summary', (res) => {
    console.log('✅ Server is running\n');
    
    let tester;
    let testPromise;
    
    if (testType === 'endurance') {
      tester = new EnduranceTester();
      testPromise = tester.runEnduranceTest(100, 300000); // 100 RPS for 5 minutes
    } else {
      tester = new StressTester();
      testPromise = tester.findBreakingPoint();
    }
    
    testPromise.then(report => {
      console.log('\n📊 Final Stress Test Report:');
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    }).catch(error => {
      console.error('\n❌ Error during stress test:', error);
      process.exit(1);
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\n⏹️  Stopping stress test...');
      tester.running = false;
    });
    
  }).on('error', () => {
    console.error('❌ Server is not running. Please start the server first:');
    console.error('   npm start\n');
    process.exit(1);
  });
}

export { StressTester, EnduranceTester };