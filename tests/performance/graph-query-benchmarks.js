import { performance } from 'perf_hooks';
import Database from 'better-sqlite3';
import { GraphQueries } from '../../src/services/GraphQueries';
import { GraphGenerators } from '../fixtures/graph-generators';
import { createTestDatabase, insertGraphData } from '../utils/graph-test-helper';
import fs from 'fs/promises';
import path from 'path';

export class GraphQueryBenchmark {
  constructor(config = {}) {
    this.resultsDir = config.resultsDir || './tests/results';
    this.iterations = config.iterations || 10;
    this.warmupIterations = config.warmupIterations || 3;
    this.results = [];
    this.db = null;
    this.queries = null;
  }

  async setup() {
    // Ensure results directory exists
    await fs.mkdir(this.resultsDir, { recursive: true });
    
    // Create test database with optimal settings
    this.db = await createTestDatabase();
    this.queries = new GraphQueries(this.db);
    
    // Set optimal pragmas for benchmarking
    this.db.pragma('cache_size = -64000');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 268435456');
    this.db.pragma('optimize');
  }

  async teardown() {
    if (this.db) {
      this.db.close();
    }
  }

  async runBenchmarks() {
    console.log('Starting Graph Query Benchmarks...\n');
    
    const scenarios = [
      { 
        name: 'Direct Connections',
        type: 'direct',
        depths: [1],
        nodeCounts: [10, 100, 1000, 10000]
      },
      {
        name: '2-Hop Traversal',
        type: 'traversal',
        depths: [2],
        nodeCounts: [10, 100, 1000]
      },
      {
        name: '3-Hop Traversal',
        type: 'traversal',
        depths: [3],
        nodeCounts: [10, 100]
      },
      {
        name: 'Shortest Path',
        type: 'path',
        depths: [4],
        nodeCounts: [10, 100, 1000]
      },
      {
        name: 'Subgraph Extraction',
        type: 'subgraph',
        depths: [2],
        nodeCounts: [10, 100, 1000]
      }
    ];

    for (const scenario of scenarios) {
      console.log(`\nBenchmarking: ${scenario.name}`);
      console.log('='.repeat(50));
      
      await this.benchmarkScenario(scenario);
    }

    const report = await this.generateReport();
    console.log('\nBenchmark Complete!');
    console.log(`Results saved to: ${report.path}`);
    
    return report;
  }

  async benchmarkScenario(scenario) {
    for (const nodeCount of scenario.nodeCounts) {
      console.log(`\n  Testing with ${nodeCount} nodes...`);
      
      // Generate and load test data
      const graphData = await this.generateTestGraph(nodeCount, scenario.type);
      await this.loadGraphData(graphData);
      
      for (const depth of scenario.depths) {
        const times = [];
        const memorySamples = [];
        
        // Get a sample address for queries
        const testAddress = graphData.nodes[0].address;
        const targetAddress = graphData.nodes[Math.min(nodeCount - 1, graphData.nodes.length - 1)].address;
        
        // Warmup runs
        console.log(`    Warming up (${this.warmupIterations} iterations)...`);
        for (let i = 0; i < this.warmupIterations; i++) {
          await this.executeQuery(scenario.type, testAddress, targetAddress, depth);
        }
        
        // Actual benchmark runs
        console.log(`    Running benchmark (${this.iterations} iterations)...`);
        for (let i = 0; i < this.iterations; i++) {
          const startMemory = process.memoryUsage().heapUsed;
          const startTime = performance.now();
          
          const result = await this.executeQuery(scenario.type, testAddress, targetAddress, depth);
          
          const endTime = performance.now();
          const endMemory = process.memoryUsage().heapUsed;
          
          times.push(endTime - startTime);
          memorySamples.push(endMemory - startMemory);
          
          // Progress indicator
          if ((i + 1) % Math.ceil(this.iterations / 10) === 0) {
            process.stdout.write('.');
          }
        }
        console.log(' Done!');
        
        const stats = this.calculateStats(times);
        const memoryStats = this.calculateStats(memorySamples);
        
        this.results.push({
          scenario: scenario.name,
          type: scenario.type,
          nodes: nodeCount,
          depth: depth,
          iterations: this.iterations,
          timing: stats,
          memory: memoryStats,
          timestamp: new Date().toISOString()
        });
        
        // Print summary
        console.log(`    Results: avg=${stats.mean.toFixed(2)}ms, p95=${stats.p95.toFixed(2)}ms, p99=${stats.p99.toFixed(2)}ms`);
        console.log(`    Memory: avg=${(memoryStats.mean / 1024 / 1024).toFixed(2)}MB`);
      }
      
      // Clear data for next iteration
      await this.clearGraphData();
    }
  }

  async generateTestGraph(nodeCount, type) {
    switch (type) {
      case 'direct':
      case 'traversal':
        // Use scale-free for realistic network
        return GraphGenerators.generateScaleFree(nodeCount, 3);
      
      case 'path':
        // Mix of patterns for path finding
        if (nodeCount <= 100) {
          return GraphGenerators.generateClusters(4, Math.floor(nodeCount / 4), 0.7, 0.2);
        } else {
          return GraphGenerators.generateScaleFree(nodeCount, 5);
        }
      
      case 'subgraph':
        // Dense clusters for subgraph extraction
        const clusterSize = Math.max(5, Math.floor(nodeCount / 10));
        const clusterCount = Math.floor(nodeCount / clusterSize);
        return GraphGenerators.generateClusters(clusterCount, clusterSize, 0.8, 0.1);
      
      default:
        return GraphGenerators.generateRandom(nodeCount, 0.1);
    }
  }

  async loadGraphData(graphData) {
    // Use transactions for faster bulk inserts
    const insertAccounts = this.db.prepare(`
      INSERT OR IGNORE INTO accounts (address, identity_display, balance, first_seen_block, last_seen_block)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const insertTransfers = this.db.prepare(`
      INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const insertRelationships = this.db.prepare(`
      INSERT OR REPLACE INTO account_relationships 
      (from_address, to_address, transfer_count, total_volume, first_transfer_block, last_transfer_block)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    this.db.transaction(() => {
      // Insert accounts
      for (const node of graphData.nodes) {
        insertAccounts.run(
          node.address,
          node.identity_display,
          node.balance,
          node.first_seen_block,
          node.last_seen_block
        );
      }
      
      // Insert transfers
      for (const edge of graphData.edges) {
        insertTransfers.run(
          edge.hash,
          edge.block_number,
          edge.timestamp,
          edge.from_address,
          edge.to_address,
          edge.value,
          edge.fee,
          edge.success ? 1 : 0
        );
      }
      
      // Insert relationships if provided
      if (graphData.relationships) {
        for (const rel of graphData.relationships) {
          insertRelationships.run(
            rel.from_address,
            rel.to_address,
            rel.transfer_count,
            rel.total_volume,
            rel.first_transfer_block,
            rel.last_transfer_block
          );
        }
      }
    })();
  }

  async clearGraphData() {
    this.db.exec(`
      DELETE FROM transfers;
      DELETE FROM account_relationships;
      DELETE FROM accounts;
    `);
  }

  async executeQuery(type, fromAddress, toAddress, depth) {
    switch (type) {
      case 'direct':
        return this.queries.getDirectConnections(fromAddress, 1000);
      
      case 'traversal':
        return this.queries.getMultiHopConnections(fromAddress, depth, 1000);
      
      case 'path':
        return this.queries.findShortestPath(fromAddress, toAddress, depth);
      
      case 'subgraph':
        return this.queries.extractSubgraph(fromAddress, depth);
      
      default:
        throw new Error(`Unknown query type: ${type}`);
    }
  }

  calculateStats(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: sum / values.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p50: sorted[Math.floor(sorted.length * 0.50)],
      p75: sorted[Math.floor(sorted.length * 0.75)],
      p90: sorted[Math.floor(sorted.length * 0.90)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      stdDev: this.calculateStdDev(values, sum / values.length)
    };
  }

  calculateStdDev(values, mean) {
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  }

  async generateReport() {
    const report = {
      metadata: {
        timestamp: new Date().toISOString(),
        iterations: this.iterations,
        warmupIterations: this.warmupIterations,
        platform: process.platform,
        nodeVersion: process.version,
        cpus: require('os').cpus().length,
        memory: require('os').totalmem()
      },
      results: this.results,
      summary: this.generateSummary()
    };
    
    // Save detailed JSON report
    const jsonPath = path.join(this.resultsDir, `benchmark-${Date.now()}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
    
    // Save human-readable markdown report
    const mdPath = path.join(this.resultsDir, `benchmark-${Date.now()}.md`);
    await fs.writeFile(mdPath, this.generateMarkdownReport(report));
    
    // Save CSV for easy analysis
    const csvPath = path.join(this.resultsDir, `benchmark-${Date.now()}.csv`);
    await fs.writeFile(csvPath, this.generateCSVReport(report));
    
    return {
      path: jsonPath,
      report
    };
  }

  generateSummary() {
    const summary = {};
    
    for (const result of this.results) {
      const key = `${result.scenario}_${result.nodes}nodes`;
      summary[key] = {
        avgTime: result.timing.mean.toFixed(2) + 'ms',
        p95Time: result.timing.p95.toFixed(2) + 'ms',
        p99Time: result.timing.p99.toFixed(2) + 'ms',
        avgMemory: (result.memory.mean / 1024 / 1024).toFixed(2) + 'MB',
        status: this.getPerformanceStatus(result)
      };
    }
    
    return summary;
  }

  getPerformanceStatus(result) {
    const targets = {
      'Direct Connections': { 10: 1, 100: 2, 1000: 5, 10000: 10 },
      '2-Hop Traversal': { 10: 20, 100: 200, 1000: 2000 },
      '3-Hop Traversal': { 10: 200, 100: 2000 },
      'Shortest Path': { 10: 50, 100: 500, 1000: 5000 },
      'Subgraph Extraction': { 10: 100, 100: 1000, 1000: 10000 }
    };
    
    const target = targets[result.scenario]?.[result.nodes];
    if (!target) return 'N/A';
    
    if (result.timing.p95 <= target) return '✅ Excellent';
    if (result.timing.p95 <= target * 1.5) return '⚠️ Good';
    if (result.timing.p95 <= target * 3) return '⚠️ Acceptable';
    return '❌ Needs Optimization';
  }

  generateMarkdownReport(report) {
    let md = '# Graph Query Performance Benchmark Report\n\n';
    md += `Generated: ${report.metadata.timestamp}\n\n`;
    
    md += '## Environment\n\n';
    md += `- Platform: ${report.metadata.platform}\n`;
    md += `- Node.js: ${report.metadata.nodeVersion}\n`;
    md += `- CPUs: ${report.metadata.cpus}\n`;
    md += `- Memory: ${(report.metadata.memory / 1024 / 1024 / 1024).toFixed(2)} GB\n\n`;
    
    md += '## Summary\n\n';
    md += '| Scenario | Nodes | Avg Time | P95 Time | P99 Time | Avg Memory | Status |\n';
    md += '|----------|-------|----------|----------|----------|------------|--------|\n';
    
    for (const result of report.results) {
      md += `| ${result.scenario} | ${result.nodes} | ${result.timing.mean.toFixed(2)}ms | `;
      md += `${result.timing.p95.toFixed(2)}ms | ${result.timing.p99.toFixed(2)}ms | `;
      md += `${(result.memory.mean / 1024 / 1024).toFixed(2)}MB | `;
      md += `${this.getPerformanceStatus(result)} |\n`;
    }
    
    md += '\n## Detailed Results\n\n';
    
    let currentScenario = '';
    for (const result of report.results) {
      if (result.scenario !== currentScenario) {
        currentScenario = result.scenario;
        md += `### ${currentScenario}\n\n`;
      }
      
      md += `#### ${result.nodes} nodes (depth: ${result.depth})\n\n`;
      md += '- **Timing Statistics:**\n';
      md += `  - Min: ${result.timing.min.toFixed(2)}ms\n`;
      md += `  - Max: ${result.timing.max.toFixed(2)}ms\n`;
      md += `  - Mean: ${result.timing.mean.toFixed(2)}ms\n`;
      md += `  - Median: ${result.timing.median.toFixed(2)}ms\n`;
      md += `  - P95: ${result.timing.p95.toFixed(2)}ms\n`;
      md += `  - P99: ${result.timing.p99.toFixed(2)}ms\n`;
      md += `  - Std Dev: ${result.timing.stdDev.toFixed(2)}ms\n\n`;
      
      md += '- **Memory Statistics:**\n';
      md += `  - Mean: ${(result.memory.mean / 1024 / 1024).toFixed(2)}MB\n`;
      md += `  - Max: ${(result.memory.max / 1024 / 1024).toFixed(2)}MB\n\n`;
    }
    
    return md;
  }

  generateCSVReport(report) {
    let csv = 'Scenario,Type,Nodes,Depth,Min_Time,Max_Time,Mean_Time,Median_Time,P95_Time,P99_Time,Mean_Memory_MB\n';
    
    for (const result of report.results) {
      csv += `"${result.scenario}",${result.type},${result.nodes},${result.depth},`;
      csv += `${result.timing.min.toFixed(2)},${result.timing.max.toFixed(2)},`;
      csv += `${result.timing.mean.toFixed(2)},${result.timing.median.toFixed(2)},`;
      csv += `${result.timing.p95.toFixed(2)},${result.timing.p99.toFixed(2)},`;
      csv += `${(result.memory.mean / 1024 / 1024).toFixed(2)}\n`;
    }
    
    return csv;
  }
}

// Run benchmarks if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const benchmark = new GraphQueryBenchmark({
    iterations: 20,
    warmupIterations: 5
  });
  
  (async () => {
    try {
      await benchmark.setup();
      await benchmark.runBenchmarks();
    } catch (error) {
      console.error('Benchmark failed:', error);
      process.exit(1);
    } finally {
      await benchmark.teardown();
    }
  })();
}