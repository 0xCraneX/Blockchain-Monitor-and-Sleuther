/**
 * Graph Query Performance Benchmarking Suite
 * 
 * This script provides practical benchmarks for different graph query patterns
 * to validate the performance estimates and recommendations.
 */

import Database from 'better-sqlite3';
import { performance } from 'perf_hooks';
import { writeFileSync } from 'fs';

interface BenchmarkResult {
  queryType: string;
  nodeCount: number;
  depth: number;
  duration: number;
  memoryUsed: number;
  rowsReturned: number;
  error?: string;
}

class GraphQueryBenchmark {
  private db: Database.Database;
  private results: BenchmarkResult[] = [];

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.setupOptimalPragmas();
  }

  private setupOptimalPragmas() {
    // Apply recommended SQLite optimizations
    this.db.pragma('cache_size = -64000');      // 64MB cache
    this.db.pragma('temp_store = MEMORY');      // Memory for temp tables
    this.db.pragma('mmap_size = 268435456');   // 256MB mmap
    this.db.pragma('page_size = 4096');         // 4KB pages
    this.db.pragma('journal_mode = WAL');       // WAL mode
    this.db.pragma('synchronous = NORMAL');     // Balance safety/speed
    this.db.pragma('busy_timeout = 5000');      // 5s timeout
    this.db.pragma('optimize');                 // Run optimizer
  }

  /**
   * Generate test data with controlled graph characteristics
   */
  async generateTestData(nodeCount: number, avgConnectionsPerNode: number = 10) {
    console.log(`Generating test data: ${nodeCount} nodes, ~${avgConnectionsPerNode} connections per node...`);
    
    const startTime = performance.now();
    
    // Begin transaction for bulk insert
    this.db.exec('BEGIN TRANSACTION');
    
    try {
      // Insert test accounts
      const insertAccount = this.db.prepare(`
        INSERT OR IGNORE INTO accounts (address, balance, risk_score)
        VALUES (?, ?, ?)
      `);
      
      for (let i = 0; i < nodeCount; i++) {
        const address = `0x${i.toString(16).padStart(40, '0')}`;
        const balance = Math.floor(Math.random() * 1000000).toString();
        const riskScore = Math.random();
        insertAccount.run(address, balance, riskScore);
      }
      
      // Insert relationships with realistic distribution
      const insertRelationship = this.db.prepare(`
        INSERT OR IGNORE INTO account_relationships 
        (from_address, to_address, transfer_count, total_volume)
        VALUES (?, ?, ?, ?)
      `);
      
      // Create power-law distribution (some nodes are hubs)
      for (let i = 0; i < nodeCount; i++) {
        const fromAddress = `0x${i.toString(16).padStart(40, '0')}`;
        
        // Number of connections follows power law
        const connections = Math.floor(
          avgConnectionsPerNode * Math.pow(Math.random(), 2)
        );
        
        for (let j = 0; j < connections; j++) {
          const toIndex = Math.floor(Math.random() * nodeCount);
          if (toIndex === i) continue; // Skip self-connections
          
          const toAddress = `0x${toIndex.toString(16).padStart(40, '0')}`;
          const transferCount = Math.floor(Math.random() * 100) + 1;
          const totalVolume = (Math.random() * 1000000).toFixed(0);
          
          insertRelationship.run(fromAddress, toAddress, transferCount, totalVolume);
        }
      }
      
      this.db.exec('COMMIT');
      
      const duration = performance.now() - startTime;
      console.log(`Test data generated in ${duration.toFixed(2)}ms`);
      
      // Analyze the generated graph
      const stats = this.db.prepare(`
        SELECT 
          COUNT(DISTINCT from_address) as unique_nodes,
          COUNT(*) as total_edges,
          AVG(cnt) as avg_connections
        FROM (
          SELECT from_address, COUNT(*) as cnt
          FROM account_relationships
          GROUP BY from_address
        )
      `).get();
      
      console.log('Graph statistics:', stats);
      
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Benchmark direct connections query
   */
  async benchmarkDirectConnections(nodeCount: number) {
    const address = `0x${Math.floor(Math.random() * nodeCount).toString(16).padStart(40, '0')}`;
    
    const query = this.db.prepare(`
      SELECT 
        CASE 
          WHEN from_address = ? THEN to_address 
          ELSE from_address 
        END as connected_address,
        transfer_count,
        total_volume
      FROM account_relationships
      WHERE from_address = ? OR to_address = ?
    `);
    
    return this.measureQuery('direct_connections', nodeCount, 1, () => {
      return query.all(address, address, address);
    });
  }

  /**
   * Benchmark 2-hop traversal
   */
  async benchmarkTwoHopTraversal(nodeCount: number) {
    const address = `0x${Math.floor(Math.random() * nodeCount).toString(16).padStart(40, '0')}`;
    
    const query = this.db.prepare(`
      WITH first_hop AS (
        SELECT DISTINCT
          CASE 
            WHEN from_address = ? THEN to_address 
            ELSE from_address 
          END as address
        FROM account_relationships
        WHERE from_address = ? OR to_address = ?
      ),
      second_hop AS (
        SELECT DISTINCT
          CASE 
            WHEN r.from_address = f.address THEN r.to_address 
            ELSE r.from_address 
          END as address
        FROM first_hop f
        JOIN account_relationships r 
          ON (r.from_address = f.address OR r.to_address = f.address)
        WHERE 
          r.from_address != ? AND r.to_address != ?
      )
      SELECT address FROM (
        SELECT address FROM first_hop
        UNION
        SELECT address FROM second_hop
      )
      LIMIT 500
    `);
    
    return this.measureQuery('two_hop_traversal', nodeCount, 2, () => {
      return query.all(address, address, address, address, address);
    });
  }

  /**
   * Benchmark recursive CTE with depth 3
   */
  async benchmarkRecursiveTraversal(nodeCount: number, maxDepth: number = 3) {
    const address = `0x${Math.floor(Math.random() * nodeCount).toString(16).padStart(40, '0')}`;
    
    const query = this.db.prepare(`
      WITH RECURSIVE graph_traverse AS (
        -- Base case
        SELECT 
          from_address,
          to_address,
          1 as depth,
          from_address || '->' || to_address as path
        FROM account_relationships
        WHERE from_address = ?
        
        UNION
        
        -- Recursive case
        SELECT 
          r.from_address,
          r.to_address,
          g.depth + 1,
          g.path || '->' || r.to_address
        FROM account_relationships r
        JOIN graph_traverse g ON r.from_address = g.to_address
        WHERE 
          g.depth < ?
          AND g.path NOT LIKE '%' || r.to_address || '%'
      )
      SELECT COUNT(*) as total_paths, MAX(depth) as max_depth
      FROM graph_traverse
    `);
    
    return this.measureQuery(`recursive_depth_${maxDepth}`, nodeCount, maxDepth, () => {
      return query.get(address, maxDepth);
    });
  }

  /**
   * Benchmark shortest path finding
   */
  async benchmarkShortestPath(nodeCount: number) {
    const fromIndex = Math.floor(Math.random() * nodeCount);
    const toIndex = Math.floor(Math.random() * nodeCount);
    
    const fromAddress = `0x${fromIndex.toString(16).padStart(40, '0')}`;
    const toAddress = `0x${toIndex.toString(16).padStart(40, '0')}`;
    
    const query = this.db.prepare(`
      WITH RECURSIVE paths AS (
        SELECT 
          from_address,
          to_address,
          1 as depth,
          from_address || '->' || to_address as path
        FROM account_relationships
        WHERE from_address = ?
        
        UNION
        
        SELECT 
          p.from_address,
          r.to_address,
          p.depth + 1,
          p.path || '->' || r.to_address
        FROM paths p
        JOIN account_relationships r ON p.to_address = r.from_address
        WHERE 
          p.depth < 6
          AND p.path NOT LIKE '%' || r.to_address || '%'
      )
      SELECT path, depth
      FROM paths
      WHERE to_address = ?
      ORDER BY depth
      LIMIT 1
    `);
    
    return this.measureQuery('shortest_path', nodeCount, 6, () => {
      return query.get(fromAddress, toAddress);
    });
  }

  /**
   * Benchmark graph metrics calculation
   */
  async benchmarkGraphMetrics(nodeCount: number) {
    const address = `0x${Math.floor(Math.random() * nodeCount).toString(16).padStart(40, '0')}`;
    
    const query = this.db.prepare(`
      SELECT 
        ? as address,
        (SELECT COUNT(*) FROM account_relationships WHERE from_address = ?) as out_degree,
        (SELECT COUNT(*) FROM account_relationships WHERE to_address = ?) as in_degree,
        (SELECT COUNT(DISTINCT r2.to_address) 
         FROM account_relationships r1
         JOIN account_relationships r2 ON r1.to_address = r2.from_address
         WHERE r1.from_address = ? AND r2.to_address IN (
           SELECT to_address FROM account_relationships WHERE from_address = ?
         )) as triangles
    `);
    
    return this.measureQuery('graph_metrics', nodeCount, 1, () => {
      return query.get(address, address, address, address, address);
    });
  }

  /**
   * Measure query performance
   */
  private async measureQuery(
    queryType: string, 
    nodeCount: number, 
    depth: number,
    queryFn: () => any
  ): Promise<BenchmarkResult> {
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    try {
      const result = queryFn();
      const duration = performance.now() - startTime;
      const memoryUsed = process.memoryUsage().heapUsed - startMemory;
      
      const rowsReturned = Array.isArray(result) 
        ? result.length 
        : (result ? 1 : 0);
      
      const benchmarkResult: BenchmarkResult = {
        queryType,
        nodeCount,
        depth,
        duration,
        memoryUsed,
        rowsReturned
      };
      
      this.results.push(benchmarkResult);
      return benchmarkResult;
      
    } catch (error) {
      const benchmarkResult: BenchmarkResult = {
        queryType,
        nodeCount,
        depth,
        duration: performance.now() - startTime,
        memoryUsed: 0,
        rowsReturned: 0,
        error: error.message
      };
      
      this.results.push(benchmarkResult);
      return benchmarkResult;
    }
  }

  /**
   * Run complete benchmark suite
   */
  async runBenchmarks() {
    const nodeCounts = [100, 1000, 5000, 10000];
    const iterations = 5;
    
    console.log('Starting graph query benchmarks...\n');
    
    for (const nodeCount of nodeCounts) {
      console.log(`\n=== Testing with ${nodeCount} nodes ===`);
      
      // Clear existing data
      this.db.exec('DELETE FROM account_relationships');
      this.db.exec('DELETE FROM accounts');
      
      // Generate test data
      await this.generateTestData(nodeCount);
      
      // Run each benchmark multiple times
      for (let i = 0; i < iterations; i++) {
        console.log(`\nIteration ${i + 1}/${iterations}:`);
        
        // Direct connections
        const direct = await this.benchmarkDirectConnections(nodeCount);
        console.log(`- Direct connections: ${direct.duration.toFixed(2)}ms, ${direct.rowsReturned} rows`);
        
        // 2-hop traversal
        const twoHop = await this.benchmarkTwoHopTraversal(nodeCount);
        console.log(`- Two-hop traversal: ${twoHop.duration.toFixed(2)}ms, ${twoHop.rowsReturned} rows`);
        
        // Recursive traversals
        for (const depth of [2, 3, 4]) {
          const recursive = await this.benchmarkRecursiveTraversal(nodeCount, depth);
          console.log(`- Recursive depth ${depth}: ${recursive.duration.toFixed(2)}ms`);
        }
        
        // Shortest path
        const shortestPath = await this.benchmarkShortestPath(nodeCount);
        console.log(`- Shortest path: ${shortestPath.duration.toFixed(2)}ms`);
        
        // Graph metrics
        const metrics = await this.benchmarkGraphMetrics(nodeCount);
        console.log(`- Graph metrics: ${metrics.duration.toFixed(2)}ms`);
      }
    }
    
    this.generateReport();
  }

  /**
   * Generate performance report
   */
  private generateReport() {
    console.log('\n\n=== PERFORMANCE SUMMARY ===\n');
    
    // Group results by query type and node count
    const summary = new Map<string, Map<number, number[]>>();
    
    for (const result of this.results) {
      if (!summary.has(result.queryType)) {
        summary.set(result.queryType, new Map());
      }
      
      const queryMap = summary.get(result.queryType)!;
      if (!queryMap.has(result.nodeCount)) {
        queryMap.set(result.nodeCount, []);
      }
      
      queryMap.get(result.nodeCount)!.push(result.duration);
    }
    
    // Calculate statistics
    const report: any = {
      timestamp: new Date().toISOString(),
      results: {}
    };
    
    for (const [queryType, nodeMap] of summary) {
      report.results[queryType] = {};
      
      console.log(`\n${queryType}:`);
      console.log('Node Count | Avg Time | Min Time | Max Time | P95 Time');
      console.log('-----------|----------|----------|----------|----------');
      
      for (const [nodeCount, durations] of nodeMap) {
        const avg = durations.reduce((a, b) => a + b) / durations.length;
        const min = Math.min(...durations);
        const max = Math.max(...durations);
        const p95 = this.percentile(durations, 0.95);
        
        console.log(
          `${nodeCount.toString().padEnd(10)} | ` +
          `${avg.toFixed(2).padEnd(8)}ms | ` +
          `${min.toFixed(2).padEnd(8)}ms | ` +
          `${max.toFixed(2).padEnd(8)}ms | ` +
          `${p95.toFixed(2).padEnd(8)}ms`
        );
        
        report.results[queryType][nodeCount] = {
          avg, min, max, p95,
          samples: durations.length
        };
      }
    }
    
    // Save detailed results
    writeFileSync(
      'graph-benchmark-results.json',
      JSON.stringify(report, null, 2)
    );
    
    console.log('\n\nDetailed results saved to graph-benchmark-results.json');
    
    // Performance recommendations
    console.log('\n\n=== PERFORMANCE RECOMMENDATIONS ===\n');
    
    // Check if queries meet interactive requirements
    for (const [queryType, nodeMap] of summary) {
      for (const [nodeCount, durations] of nodeMap) {
        const avg = durations.reduce((a, b) => a + b) / durations.length;
        
        if (avg > 1000) {
          console.log(`⚠️  ${queryType} at ${nodeCount} nodes averages ${avg.toFixed(0)}ms - exceeds 1s interactive threshold`);
        } else if (avg > 500) {
          console.log(`⚡ ${queryType} at ${nodeCount} nodes averages ${avg.toFixed(0)}ms - consider caching`);
        }
      }
    }
  }

  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  close() {
    this.db.close();
  }
}

// Run benchmarks if called directly
if (require.main === module) {
  const benchmark = new GraphQueryBenchmark('./polkadot-analysis.db');
  
  benchmark.runBenchmarks()
    .then(() => {
      console.log('\nBenchmarks completed successfully!');
      benchmark.close();
    })
    .catch(error => {
      console.error('Benchmark failed:', error);
      benchmark.close();
      process.exit(1);
    });
}

export { GraphQueryBenchmark, BenchmarkResult };