import fs from 'fs/promises';
import path from 'path';
import { DatabaseService } from '../src/services/DatabaseService.js';
import { GraphQueries } from '../src/services/GraphQueries.js';
import { PathFinder } from '../src/services/PathFinder.js';
import { GraphMetrics } from '../src/services/GraphMetrics.js';
import { DatabaseTestHelper } from '../tests/utils/database-test-helper.js';
import { GraphGenerators } from '../tests/fixtures/graph-generators.js';
import { logger } from '../src/utils/logger.js';

// Performance targets and thresholds
const PERFORMANCE_TARGETS = {
  DIRECT_CONNECTIONS: { target: 10, warning: 15, critical: 25 },
  TWO_HOP_QUERIES: { target: 200, warning: 300, critical: 500 },
  THREE_HOP_QUERIES: { target: 1000, warning: 1500, critical: 3000 },
  PAGERANK_500_NODES: { target: 500, warning: 750, critical: 1500 },
  SHORTEST_PATH: { target: 100, warning: 150, critical: 300 },
  CLUSTERING_COEFFICIENT: { target: 50, warning: 75, critical: 150 },
  BETWEENNESS_CENTRALITY: { target: 2000, warning: 3000, critical: 5000 }
};

// Graph patterns for testing
const GRAPH_PATTERNS = {
  'hub-spoke-100': () => GraphGenerators.generateHubSpoke(null, 99, 2),
  'hub-spoke-500': () => GraphGenerators.generateHubSpoke(null, 499, 2),
  'clusters-small': () => GraphGenerators.generateClusters(4, 50, 0.6, 0.1),
  'clusters-medium': () => GraphGenerators.generateClusters(5, 100, 0.5, 0.08),
  'chain-100': () => GraphGenerators.generateChain(100, 2, false),
  'chain-500': () => GraphGenerators.generateChain(500, 1, false),
  'scale-free-200': () => GraphGenerators.generateScaleFree(200, 3),
  'scale-free-500': () => GraphGenerators.generateScaleFree(500, 3),
  'random-sparse': () => GraphGenerators.generateRandom(200, 0.05, 1),
  'random-dense': () => GraphGenerators.generateRandom(100, 0.2, 2),
  'tree-deep': () => GraphGenerators.generateTree(5, 3),
  'ring-large': () => GraphGenerators.generateRing(200, 4)
};

class GraphBenchmarkRunner {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      benchmarks: [],
      summary: {},
      regressions: []
    };
    
    // Suppress logging during benchmarks
    logger.level = 'error';
  }

  async runAllBenchmarks() {
    console.log('🚀 Starting Graph Services Benchmark Suite');
    console.log('=' .repeat(60));
    
    const startTime = Date.now();
    
    for (const [patternName, generator] of Object.entries(GRAPH_PATTERNS)) {
      console.log(`\n📊 Testing pattern: ${patternName}`);
      await this.benchmarkPattern(patternName, generator);
    }
    
    const totalTime = Date.now() - startTime;
    
    await this.generateSummary(totalTime);
    await this.saveResults();
    await this.checkForRegressions();
    
    console.log('\n✅ Benchmark suite completed');
    return this.results;
  }

  async benchmarkPattern(patternName, generator) {
    let dbService, graphQueries, pathFinder, graphMetrics, rawDb;
    
    try {
      // Setup database and services
      const testDb = await DatabaseTestHelper.createIsolatedDatabase();
      rawDb = testDb.db;
      
      dbService = new DatabaseService();
      dbService.db = rawDb;
      dbService.dbPath = testDb.dbPath;
      
      graphQueries = new GraphQueries(dbService);
      pathFinder = new PathFinder(dbService, graphQueries);
      graphMetrics = new GraphMetrics(dbService);
      
      // Generate and populate test data
      const graphData = generator();
      await this.populateDatabase(dbService, rawDb, graphData);
      
      const pattern = {
        name: patternName,
        nodeCount: graphData.nodes.length,
        edgeCount: graphData.edges.length,
        benchmarks: {}
      };
      
      // Run benchmarks for this pattern
      await this.benchmarkGraphQueries(pattern, graphQueries, graphData);
      await this.benchmarkPathFinder(pattern, pathFinder, graphData);
      await this.benchmarkGraphMetrics(pattern, graphMetrics, graphData);
      
      this.results.benchmarks.push(pattern);
      
    } catch (error) {
      console.error(`❌ Error benchmarking ${patternName}:`, error.message);
    } finally {
      // Cleanup
      if (rawDb) {
        try {
          const dbPath = rawDb.name;
          await DatabaseTestHelper.cleanupDatabase(rawDb, dbPath);
        } catch (error) {
          console.error(`Warning: Cleanup failed for ${patternName}:`, error.message);
        }
      }
    }
  }

  async benchmarkGraphQueries(pattern, graphQueries, graphData) {
    const testAddress = graphData.nodes[0].address;
    const results = {};
    
    // Direct connections
    const directStart = performance.now();
    try {
      const directResult = graphQueries.getDirectConnections(testAddress, {
        minVolume: '0',
        limit: 100
      });
      const directTime = performance.now() - directStart;
      results.directConnections = {
        duration: directTime,
        resultCount: directResult.nodes.length,
        status: this.getStatus(directTime, PERFORMANCE_TARGETS.DIRECT_CONNECTIONS)
      };
    } catch (error) {
      results.directConnections = { error: error.message };
    }
    
    // 2-hop queries
    const twoHopStart = performance.now();
    try {
      const twoHopResult = graphQueries.getMultiHopConnections(testAddress, 2, {
        minVolume: '0',
        limit: 200
      });
      const twoHopTime = performance.now() - twoHopStart;
      results.twoHopQueries = {
        duration: twoHopTime,
        resultCount: twoHopResult.nodes.length,
        status: this.getStatus(twoHopTime, PERFORMANCE_TARGETS.TWO_HOP_QUERIES)
      };
    } catch (error) {
      results.twoHopQueries = { error: error.message };
    }
    
    // 3-hop queries (only for smaller graphs)
    if (graphData.nodes.length <= 500) {
      const threeHopStart = performance.now();
      try {
        const threeHopResult = graphQueries.getMultiHopConnections(testAddress, 3, {
          minVolume: '0',
          limit: 100
        });
        const threeHopTime = performance.now() - threeHopStart;
        results.threeHopQueries = {
          duration: threeHopTime,
          resultCount: threeHopResult.nodes.length,
          status: this.getStatus(threeHopTime, PERFORMANCE_TARGETS.THREE_HOP_QUERIES)
        };
      } catch (error) {
        results.threeHopQueries = { error: error.message };
      }
    }
    
    // Subgraph extraction
    const subgraphStart = performance.now();
    try {
      const subgraphResult = graphQueries.extractSubgraph(testAddress, 2, {
        minVolume: '0'
      });
      const subgraphTime = performance.now() - subgraphStart;
      results.subgraphExtraction = {
        duration: subgraphTime,
        resultCount: subgraphResult.nodes.length
      };
    } catch (error) {
      results.subgraphExtraction = { error: error.message };
    }
    
    pattern.benchmarks.graphQueries = results;
  }

  async benchmarkPathFinder(pattern, pathFinder, graphData) {
    const results = {};
    const addresses = graphData.nodes.slice(0, 10).map(n => n.address);
    
    // Shortest path
    if (addresses.length >= 2) {
      const shortestStart = performance.now();
      try {
        const shortestResult = pathFinder.findShortestPath(addresses[0], addresses[1], {
          weightType: 'hops',
          maxDepth: 4
        });
        const shortestTime = performance.now() - shortestStart;
        results.shortestPath = {
          duration: shortestTime,
          found: shortestResult.found,
          hops: shortestResult.hops || 0,
          status: this.getStatus(shortestTime, PERFORMANCE_TARGETS.SHORTEST_PATH)
        };
      } catch (error) {
        results.shortestPath = { error: error.message };
      }
    }
    
    // All paths (only for smaller graphs)
    if (graphData.nodes.length <= 200 && addresses.length >= 2) {
      const allPathsStart = performance.now();
      try {
        const allPathsResult = pathFinder.findAllPaths(addresses[0], addresses[1], 3, 10);
        const allPathsTime = performance.now() - allPathsStart;
        results.allPaths = {
          duration: allPathsTime,
          pathCount: allPathsResult.paths.length
        };
      } catch (error) {
        results.allPaths = { error: error.message };
      }
    }
    
    // High-value paths
    if (addresses.length >= 2) {
      const highValueStart = performance.now();
      try {
        const highValueResult = pathFinder.findHighValuePaths(
          addresses[0], 
          addresses[1], 
          '500000000000'
        );
        const highValueTime = performance.now() - highValueStart;
        results.highValuePaths = {
          duration: highValueTime,
          pathCount: highValueResult.paths.length
        };
      } catch (error) {
        results.highValuePaths = { error: error.message };
      }
    }
    
    // Path risk analysis
    if (addresses.length >= 3) {
      const riskStart = performance.now();
      try {
        const riskResult = pathFinder.analyzePathRisk(addresses.slice(0, 3));
        const riskTime = performance.now() - riskStart;
        results.pathRiskAnalysis = {
          duration: riskTime,
          riskLevel: riskResult.riskLevel
        };
      } catch (error) {
        results.pathRiskAnalysis = { error: error.message };
      }
    }
    
    pattern.benchmarks.pathFinder = results;
  }

  async benchmarkGraphMetrics(pattern, graphMetrics, graphData) {
    const results = {};
    const testAddress = graphData.nodes[0].address;
    const nodeAddresses = graphData.nodes.map(n => n.address);
    
    // Degree centrality
    const degreeStart = performance.now();
    try {
      const degreeResult = graphMetrics.calculateDegreeCentrality(testAddress);
      const degreeTime = performance.now() - degreeStart;
      results.degreeCentrality = {
        duration: degreeTime,
        totalDegree: degreeResult.totalDegree
      };
    } catch (error) {
      results.degreeCentrality = { error: error.message };
    }
    
    // Clustering coefficient
    const clusteringStart = performance.now();
    try {
      const clusteringResult = graphMetrics.calculateClusteringCoefficient(testAddress);
      const clusteringTime = performance.now() - clusteringStart;
      results.clusteringCoefficient = {
        duration: clusteringTime,
        coefficient: clusteringResult.coefficient,
        status: this.getStatus(clusteringTime, PERFORMANCE_TARGETS.CLUSTERING_COEFFICIENT)
      };
    } catch (error) {
      results.clusteringCoefficient = { error: error.message };
    }
    
    // PageRank (limit to 500 nodes for performance)
    const pageRankNodes = nodeAddresses.slice(0, Math.min(500, nodeAddresses.length));
    if (pageRankNodes.length >= 10) {
      const pageRankStart = performance.now();
      try {
        const pageRankResult = graphMetrics.calculatePageRank(pageRankNodes, 15);
        const pageRankTime = performance.now() - pageRankStart;
        results.pageRank = {
          duration: pageRankTime,
          nodeCount: pageRankResult.nodes.length,
          status: this.getStatus(pageRankTime, PERFORMANCE_TARGETS.PAGERANK_500_NODES)
        };
      } catch (error) {
        results.pageRank = { error: error.message };
      }
    }
    
    // Betweenness centrality (limit to 50 nodes for performance)
    const betweennessNodes = nodeAddresses.slice(0, Math.min(50, nodeAddresses.length));
    if (betweennessNodes.length >= 10) {
      const betweennessStart = performance.now();
      try {
        const betweennessResult = graphMetrics.calculateBetweennessCentrality(betweennessNodes, 20);
        const betweennessTime = performance.now() - betweennessStart;
        results.betweennessCentrality = {
          duration: betweennessTime,
          nodeCount: betweennessResult.nodes.length,
          status: this.getStatus(betweennessTime, PERFORMANCE_TARGETS.BETWEENNESS_CENTRALITY)
        };
      } catch (error) {
        results.betweennessCentrality = { error: error.message };
      }
    }
    
    // Hub identification
    const hubStart = performance.now();
    try {
      const hubResult = graphMetrics.identifyHubs(3);
      const hubTime = performance.now() - hubStart;
      results.hubIdentification = {
        duration: hubTime,
        hubCount: hubResult.hubs.length
      };
    } catch (error) {
      results.hubIdentification = { error: error.message };
    }
    
    // Community detection (limit to 300 nodes)
    const communityNodes = nodeAddresses.slice(0, Math.min(300, nodeAddresses.length));
    if (communityNodes.length >= 20) {
      const communityStart = performance.now();
      try {
        const communityResult = graphMetrics.detectCommunities(communityNodes, 'label_propagation');
        const communityTime = performance.now() - communityStart;
        results.communityDetection = {
          duration: communityTime,
          communityCount: communityResult.communities.length
        };
      } catch (error) {
        results.communityDetection = { error: error.message };
      }
    }
    
    // Graph density
    const densityStart = performance.now();
    try {
      const densityResult = graphMetrics.calculateGraphDensity(nodeAddresses);
      const densityTime = performance.now() - densityStart;
      results.graphDensity = {
        duration: densityTime,
        density: densityResult.density,
        nodeCount: densityResult.nodeCount
      };
    } catch (error) {
      results.graphDensity = { error: error.message };
    }
    
    pattern.benchmarks.graphMetrics = results;
  }

  async generateSummary(totalTime) {
    const summary = {
      totalDuration: totalTime,
      patternstested: this.results.benchmarks.length,
      warnings: 0,
      critical: 0,
      passed: 0,
      failed: 0
    };
    
    // Analyze results
    this.results.benchmarks.forEach(pattern => {
      Object.values(pattern.benchmarks).forEach(category => {
        Object.values(category).forEach(benchmark => {
          if (benchmark.error) {
            summary.failed++;
          } else if (benchmark.status) {
            switch (benchmark.status) {
              case 'PASS':
                summary.passed++;
                break;
              case 'WARNING':
                summary.warnings++;
                break;
              case 'CRITICAL':
                summary.critical++;
                break;
            }
          }
        });
      });
    });
    
    this.results.summary = summary;
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 BENCHMARK SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Duration: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`Patterns Tested: ${summary.patternsested}`);
    console.log(`✅ Passed: ${summary.passed}`);
    console.log(`⚠️  Warnings: ${summary.warnings}`);
    console.log(`🚨 Critical: ${summary.critical}`);
    console.log(`❌ Failed: ${summary.failed}`);
    
    // Show critical issues
    if (summary.critical > 0 || summary.failed > 0) {
      console.log('\n🚨 ISSUES FOUND:');
      this.results.benchmarks.forEach(pattern => {
        Object.entries(pattern.benchmarks).forEach(([category, benchmarks]) => {
          Object.entries(benchmarks).forEach(([name, result]) => {
            if (result.status === 'CRITICAL' || result.error) {
              const issue = result.error || `${result.duration.toFixed(2)}ms (target: ${this.getTargetForBenchmark(name)}ms)`;
              console.log(`  ${pattern.name}.${category}.${name}: ${issue}`);
            }
          });
        });
      });
    }
  }

  async saveResults() {
    const benchmarksDir = path.dirname(new URL(import.meta.url).pathname);
    const resultsFile = path.join(benchmarksDir, 'results', `benchmark-${Date.now()}.json`);
    
    try {
      await fs.mkdir(path.dirname(resultsFile), { recursive: true });
      await fs.writeFile(resultsFile, JSON.stringify(this.results, null, 2));
      console.log(`\n💾 Results saved to: ${resultsFile}`);
    } catch (error) {
      console.error('❌ Failed to save results:', error.message);
    }
  }

  async checkForRegressions() {
    const benchmarksDir = path.dirname(new URL(import.meta.url).pathname);
    const resultsDir = path.join(benchmarksDir, 'results');
    
    try {
      const files = await fs.readdir(resultsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
      
      if (jsonFiles.length < 2) {
        console.log('\n📊 Not enough historical data for regression analysis');
        return;
      }
      
      // Compare with previous run
      const prevFile = path.join(resultsDir, jsonFiles[jsonFiles.length - 2]);
      const prevResults = JSON.parse(await fs.readFile(prevFile, 'utf8'));
      
      const regressions = this.detectRegressions(prevResults, this.results);
      
      if (regressions.length > 0) {
        console.log('\n📉 PERFORMANCE REGRESSIONS DETECTED:');
        regressions.forEach(regression => {
          console.log(`  ${regression.test}: ${regression.change}% slower (${regression.prev}ms → ${regression.current}ms)`);
        });
        
        this.results.regressions = regressions;
      } else {
        console.log('\n✅ No performance regressions detected');
      }
      
    } catch (error) {
      console.log('\n⚠️ Could not perform regression analysis:', error.message);
    }
  }

  detectRegressions(prev, current, threshold = 20) {
    const regressions = [];
    
    current.benchmarks.forEach(pattern => {
      const prevPattern = prev.benchmarks.find(p => p.name === pattern.name);
      if (!prevPattern) return;
      
      Object.entries(pattern.benchmarks).forEach(([category, benchmarks]) => {
        const prevCategory = prevPattern.benchmarks[category];
        if (!prevCategory) return;
        
        Object.entries(benchmarks).forEach(([name, result]) => {
          const prevResult = prevCategory[name];
          if (!prevResult || !result.duration || !prevResult.duration) return;
          
          const change = ((result.duration - prevResult.duration) / prevResult.duration) * 100;
          
          if (change > threshold) {
            regressions.push({
              test: `${pattern.name}.${category}.${name}`,
              change: change.toFixed(1),
              prev: prevResult.duration.toFixed(2),
              current: result.duration.toFixed(2)
            });
          }
        });
      });
    });
    
    return regressions;
  }

  getStatus(duration, target) {
    if (duration <= target.target) return 'PASS';
    if (duration <= target.warning) return 'WARNING';
    return 'CRITICAL';
  }

  getTargetForBenchmark(benchmarkName) {
    const mapping = {
      'directConnections': PERFORMANCE_TARGETS.DIRECT_CONNECTIONS.target,
      'twoHopQueries': PERFORMANCE_TARGETS.TWO_HOP_QUERIES.target,
      'threeHopQueries': PERFORMANCE_TARGETS.THREE_HOP_QUERIES.target,
      'shortestPath': PERFORMANCE_TARGETS.SHORTEST_PATH.target,
      'clusteringCoefficient': PERFORMANCE_TARGETS.CLUSTERING_COEFFICIENT.target,
      'pageRank': PERFORMANCE_TARGETS.PAGERANK_500_NODES.target,
      'betweennessCentrality': PERFORMANCE_TARGETS.BETWEENNESS_CENTRALITY.target
    };
    
    return mapping[benchmarkName] || 100;
  }

  async populateDatabase(dbService, rawDb, graphData) {
    const { nodes, edges, relationships } = graphData;
    
    // Insert accounts
    dbService.transaction(() => {
      nodes.forEach(node => {
        dbService.createAccount(node);
      });
    });
    
    // Insert transfers
    rawDb.pragma('foreign_keys = ON');
    dbService.transaction(() => {
      edges.forEach(edge => {
        dbService.createTransfer(edge);
      });
    });
    
    // Insert relationships if provided
    if (relationships && relationships.length > 0) {
      dbService.transaction(() => {
        relationships.forEach(rel => {
          try {
            rawDb.prepare(`
              INSERT OR REPLACE INTO account_relationships 
              (from_address, to_address, transfer_count, total_volume, first_transfer_time, last_transfer_time)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(
              rel.from_address,
              rel.to_address,
              rel.transfer_count,
              rel.total_volume,
              rel.first_transfer_block,
              rel.last_transfer_block
            );
          } catch (error) {
            // Skip if relationship already exists
          }
        });
      });
    }
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new GraphBenchmarkRunner();
  
  try {
    const results = await runner.runAllBenchmarks();
    
    // Exit with error code if critical issues found
    if (results.summary.critical > 0 || results.summary.failed > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Benchmark suite failed:', error);
    process.exit(1);
  }
}

export { GraphBenchmarkRunner, PERFORMANCE_TARGETS, GRAPH_PATTERNS };