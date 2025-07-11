# Comprehensive Graph Testing Strategy

## Overview

This document outlines a comprehensive testing strategy for the graph functionality in the Polkadot Analysis Tool. The strategy covers unit tests, integration tests, performance tests, and visual testing, ensuring robust and reliable graph operations.

## Table of Contents

1. [Unit Test Strategy](#1-unit-test-strategy)
2. [Integration Test Strategy](#2-integration-test-strategy)
3. [Test Data Generation](#3-test-data-generation)
4. [Performance Test Suite](#4-performance-test-suite)
5. [Visual/Manual Testing](#5-visualmanual-testing)
6. [Test File Structure](#6-test-file-structure)
7. [CI/CD Integration](#7-cicd-integration)
8. [Coverage Targets](#8-coverage-targets)

## 1. Unit Test Strategy

### 1.1 Graph Query Functions

#### Test Categories:
- **Basic Query Tests**: Direct connections, node properties
- **Traversal Tests**: Multi-hop queries, path finding
- **Edge Case Tests**: Cycles, disconnected nodes, self-references
- **Error Handling**: Invalid inputs, timeouts, malformed data

#### Specific Test Cases:

```javascript
// tests/unit/graph/queries.test.js
describe('Graph Query Functions', () => {
  describe('getDirectConnections', () => {
    it('should return all direct connections for a node');
    it('should handle nodes with no connections');
    it('should respect connection limits');
    it('should include bidirectional connections');
    it('should handle self-referencing edges');
  });

  describe('getMultiHopConnections', () => {
    it('should traverse up to specified depth');
    it('should prevent infinite loops in cyclic graphs');
    it('should respect node count limits');
    it('should handle disconnected subgraphs');
    it('should timeout on large graphs');
  });

  describe('findShortestPath', () => {
    it('should find direct path when available');
    it('should find multi-hop path');
    it('should return null for disconnected nodes');
    it('should prefer paths with higher weights');
    it('should handle multiple equal-length paths');
  });
});
```

### 1.2 Scoring Calculation Tests

#### Test Categories:
- **Component Scoring**: Volume, frequency, temporal, network scores
- **Risk Scoring**: Pattern detection, anomaly identification
- **Total Score Calculation**: Weighted combinations, normalization
- **Edge Cases**: Zero values, extreme values, missing data

#### Specific Test Cases:

```javascript
// tests/unit/scoring/relationship.test.js
describe('Relationship Scoring', () => {
  describe('Volume Score Calculation', () => {
    it('should calculate percentile-based volume score');
    it('should handle zero volume relationships');
    it('should cap scores at maximum values');
    it('should calculate relative volume correctly');
  });

  describe('Temporal Score Calculation', () => {
    it('should apply recency decay correctly');
    it('should calculate relationship duration');
    it('should handle future timestamps gracefully');
    it('should score activity patterns');
  });

  describe('Risk Score Calculation', () => {
    it('should detect rapid transfer patterns');
    it('should identify round number transfers');
    it('should flag unusual time patterns');
    it('should detect new account interactions');
  });
});
```

### 1.3 Graph Algorithm Tests

#### Test Categories:
- **Centrality Metrics**: Degree, betweenness, eigenvector
- **Clustering**: Coefficient calculation, community detection
- **Graph Properties**: Connectivity, diameter, density
- **Performance**: Algorithm complexity, optimization

#### Specific Test Cases:

```javascript
// tests/unit/graph/algorithms.test.js
describe('Graph Algorithms', () => {
  describe('Centrality Calculations', () => {
    it('should calculate degree centrality');
    it('should calculate weighted degree centrality');
    it('should handle isolated nodes');
    it('should normalize centrality scores');
  });

  describe('Clustering Coefficient', () => {
    it('should calculate local clustering coefficient');
    it('should handle nodes with < 2 neighbors');
    it('should calculate global clustering coefficient');
    it('should handle directed graphs correctly');
  });
});
```

## 2. Integration Test Strategy

### 2.1 API Endpoint Tests

#### Test Categories:
- **Graph Data Retrieval**: Various parameter combinations
- **Error Responses**: Invalid addresses, malformed requests
- **Performance**: Response times, payload sizes
- **Concurrency**: Simultaneous requests, rate limiting

#### Specific Test Cases:

```javascript
// tests/integration/api/graph.test.js
describe('Graph API Endpoints', () => {
  describe('GET /api/v1/accounts/:address/graph', () => {
    it('should return graph data for valid address');
    it('should respect depth parameter');
    it('should apply volume filters');
    it('should handle concurrent requests');
    it('should return 404 for non-existent address');
    it('should timeout for excessive depth');
  });

  describe('POST /api/v1/graph/subgraph', () => {
    it('should extract subgraph for multiple addresses');
    it('should merge overlapping neighborhoods');
    it('should apply consistent scoring');
    it('should handle large address lists');
  });
});
```

### 2.2 Database State Verification

#### Test Categories:
- **Data Consistency**: Relationships match transfers
- **Trigger Verification**: Auto-updates on new data
- **Cache Coherence**: Materialized views accuracy
- **Transaction Handling**: Rollback scenarios

#### Specific Test Cases:

```javascript
// tests/integration/database/graph.test.js
describe('Graph Database Integration', () => {
  describe('Relationship Updates', () => {
    it('should update relationships on new transfer');
    it('should maintain bidirectional consistency');
    it('should update aggregate metrics');
    it('should handle concurrent modifications');
  });

  describe('Cache Materialization', () => {
    it('should refresh metrics cache on schedule');
    it('should invalidate stale cache entries');
    it('should maintain cache during updates');
    it('should recover from cache corruption');
  });
});
```

### 2.3 Concurrent Query Handling

#### Test Categories:
- **Read Concurrency**: Multiple simultaneous queries
- **Write Conflicts**: Concurrent relationship updates
- **Lock Management**: Deadlock prevention
- **Performance Under Load**: Degradation patterns

#### Specific Test Cases:

```javascript
// tests/integration/concurrency/graph.test.js
describe('Concurrent Graph Operations', () => {
  it('should handle 10 simultaneous graph queries');
  it('should process updates during queries');
  it('should prevent read-write conflicts');
  it('should scale linearly with connections');
});
```

## 3. Test Data Generation

### 3.1 Graph Structure Generators

```javascript
// tests/fixtures/graph-generators.js

export const GraphGenerators = {
  // Hub-and-spoke pattern (centralized)
  generateHubSpoke(hubAddress, spokeCount, transfersPerSpoke) {
    const nodes = [createAccount(hubAddress)];
    const edges = [];
    
    for (let i = 0; i < spokeCount; i++) {
      const spokeAddress = generateAddress();
      nodes.push(createAccount(spokeAddress));
      
      for (let j = 0; j < transfersPerSpoke; j++) {
        edges.push(createTransfer(hubAddress, spokeAddress));
      }
    }
    
    return { nodes, edges };
  },

  // Cluster pattern (communities)
  generateClusters(clusterCount, nodesPerCluster, intraClusterDensity, interClusterDensity) {
    // Implementation
  },

  // Chain pattern (sequential)
  generateChain(length, transfersPerLink) {
    // Implementation
  },

  // Random pattern (Erdős–Rényi)
  generateRandom(nodeCount, edgeProbability) {
    // Implementation
  },

  // Scale-free pattern (Barabási–Albert)
  generateScaleFree(nodeCount, attachmentCount) {
    // Implementation
  }
};
```

### 3.2 Edge Weight Distributions

```javascript
// tests/fixtures/weight-distributions.js

export const WeightDistributions = {
  // Uniform distribution
  uniform(min, max) {
    return () => Math.random() * (max - min) + min;
  },

  // Power law distribution (realistic for crypto)
  powerLaw(alpha = 2.5, min = 1e9, max = 1e15) {
    return () => {
      const u = Math.random();
      return min * Math.pow(1 - u, -1 / (alpha - 1));
    };
  },

  // Normal distribution
  normal(mean, stdDev) {
    return () => {
      // Box-Muller transform
      const u1 = Math.random();
      const u2 = Math.random();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return mean + z0 * stdDev;
    };
  },

  // Bimodal distribution (small + large transfers)
  bimodal(smallMean, largeMean, smallProb = 0.8) {
    return () => {
      if (Math.random() < smallProb) {
        return this.normal(smallMean, smallMean * 0.2)();
      }
      return this.normal(largeMean, largeMean * 0.3)();
    };
  }
};
```

### 3.3 Temporal Patterns

```javascript
// tests/fixtures/temporal-patterns.js

export const TemporalPatterns = {
  // Regular periodic transfers
  periodic(startTime, interval, count) {
    const transfers = [];
    for (let i = 0; i < count; i++) {
      transfers.push(new Date(startTime.getTime() + i * interval));
    }
    return transfers;
  },

  // Burst pattern (concentrated activity)
  burst(centerTime, burstDuration, transferCount) {
    const transfers = [];
    for (let i = 0; i < transferCount; i++) {
      const offset = (Math.random() - 0.5) * burstDuration;
      transfers.push(new Date(centerTime.getTime() + offset));
    }
    return transfers;
  },

  // Decay pattern (decreasing frequency)
  exponentialDecay(startTime, initialInterval, decayFactor, count) {
    const transfers = [];
    let currentTime = startTime;
    let interval = initialInterval;
    
    for (let i = 0; i < count; i++) {
      transfers.push(new Date(currentTime));
      currentTime = new Date(currentTime.getTime() + interval);
      interval *= decayFactor;
    }
    return transfers;
  }
};
```

### 3.4 Test Data Fixtures

```javascript
// tests/fixtures/graph-fixtures.js

export const GraphFixtures = {
  // Small test graph (10 nodes)
  small: {
    nodes: 10,
    edges: 25,
    pattern: 'random',
    weights: 'uniform'
  },

  // Medium test graph (100 nodes)
  medium: {
    nodes: 100,
    edges: 500,
    pattern: 'clusters',
    weights: 'powerLaw'
  },

  // Large test graph (1000 nodes)
  large: {
    nodes: 1000,
    edges: 10000,
    pattern: 'scaleFree',
    weights: 'bimodal'
  },

  // Stress test graph (10000 nodes)
  stress: {
    nodes: 10000,
    edges: 100000,
    pattern: 'mixed',
    weights: 'realistic'
  }
};
```

## 4. Performance Test Suite

### 4.1 Query Benchmarks

```javascript
// tests/performance/graph-query-benchmarks.js

import { performance } from 'perf_hooks';

export class GraphQueryBenchmark {
  constructor(db, fixtures) {
    this.db = db;
    this.fixtures = fixtures;
    this.results = [];
  }

  async runBenchmarks() {
    const scenarios = [
      { name: 'Direct Connections', depth: 1, nodes: [10, 100, 1000] },
      { name: '2-Hop Traversal', depth: 2, nodes: [10, 100, 1000] },
      { name: '3-Hop Traversal', depth: 3, nodes: [10, 100] },
      { name: 'Shortest Path', type: 'path', nodes: [10, 100, 1000] },
      { name: 'Subgraph Extraction', type: 'subgraph', nodes: [10, 100] }
    ];

    for (const scenario of scenarios) {
      await this.benchmarkScenario(scenario);
    }

    return this.generateReport();
  }

  async benchmarkScenario(scenario) {
    for (const nodeCount of scenario.nodes) {
      const fixture = await this.loadFixture(nodeCount);
      const iterations = this.getIterations(nodeCount);
      
      const times = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await this.executeQuery(scenario, fixture);
        const end = performance.now();
        times.push(end - start);
      }

      this.results.push({
        scenario: scenario.name,
        nodes: nodeCount,
        times,
        stats: this.calculateStats(times)
      });
    }
  }

  calculateStats(times) {
    const sorted = times.sort((a, b) => a - b);
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: times.reduce((a, b) => a + b) / times.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
}
```

### 4.2 Memory Usage Tests

```javascript
// tests/performance/memory-usage.test.js

describe('Graph Memory Usage', () => {
  it('should not exceed 100MB for 1000-node graph', async () => {
    const before = process.memoryUsage();
    
    const graph = await loadGraph(1000);
    const query = await executeGraphQuery(graph, { depth: 2 });
    
    const after = process.memoryUsage();
    const delta = after.heapUsed - before.heapUsed;
    
    expect(delta).toBeLessThan(100 * 1024 * 1024);
  });

  it('should release memory after query completion', async () => {
    const baseline = process.memoryUsage().heapUsed;
    
    // Run multiple queries
    for (let i = 0; i < 10; i++) {
      await executeGraphQuery(testGraph, { depth: 3 });
      global.gc && global.gc(); // Force GC if available
    }
    
    const final = process.memoryUsage().heapUsed;
    expect(final).toBeLessThan(baseline * 1.5);
  });
});
```

### 4.3 Stress Tests

```javascript
// tests/performance/stress.test.js

describe('Graph Stress Tests', () => {
  it('should handle 100 concurrent graph queries', async () => {
    const queries = Array(100).fill(null).map((_, i) => 
      executeGraphQuery(randomAddress(), { depth: 2 })
    );
    
    const start = Date.now();
    const results = await Promise.all(queries);
    const duration = Date.now() - start;
    
    expect(results.every(r => r.success)).toBe(true);
    expect(duration).toBeLessThan(10000); // 10 seconds max
  });

  it('should degrade gracefully under load', async () => {
    const loads = [10, 50, 100, 200];
    const times = [];
    
    for (const load of loads) {
      const start = Date.now();
      await Promise.all(
        Array(load).fill(null).map(() => 
          executeGraphQuery(randomAddress(), { depth: 1 })
        )
      );
      times.push((Date.now() - start) / load);
    }
    
    // Check that per-query time doesn't increase dramatically
    const degradation = times[times.length - 1] / times[0];
    expect(degradation).toBeLessThan(3);
  });
});
```

### 4.4 Cache Effectiveness Tests

```javascript
// tests/performance/cache-effectiveness.test.js

describe('Graph Cache Effectiveness', () => {
  it('should achieve >80% cache hit rate for repeated queries', async () => {
    const address = testAddresses[0];
    const cacheStats = { hits: 0, misses: 0 };
    
    // Prime cache
    await executeGraphQuery(address, { depth: 2 });
    cacheStats.misses++;
    
    // Repeated queries
    for (let i = 0; i < 100; i++) {
      const result = await executeGraphQuery(address, { depth: 2 });
      if (result.fromCache) {
        cacheStats.hits++;
      } else {
        cacheStats.misses++;
      }
    }
    
    const hitRate = cacheStats.hits / (cacheStats.hits + cacheStats.misses);
    expect(hitRate).toBeGreaterThan(0.8);
  });

  it('should invalidate cache on relationship updates', async () => {
    const address = testAddresses[0];
    
    // Initial query
    const result1 = await executeGraphQuery(address, { depth: 1 });
    
    // Add new relationship
    await addTransfer(address, randomAddress(), '1000000000000');
    
    // Query again
    const result2 = await executeGraphQuery(address, { depth: 1 });
    
    expect(result2.fromCache).toBe(false);
    expect(result2.edges.length).toBe(result1.edges.length + 1);
  });
});
```

## 5. Visual/Manual Testing

### 5.1 D3.js Rendering Tests

```javascript
// tests/visual/d3-rendering.test.js

describe('D3.js Graph Rendering', () => {
  let browser, page;

  beforeAll(async () => {
    browser = await puppeteer.launch();
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should render small graph without overlapping nodes', async () => {
    await page.goto('http://localhost:3000/graph/small');
    await page.waitForSelector('.graph-container svg');
    
    const screenshot = await page.screenshot();
    expect(screenshot).toMatchImageSnapshot({
      threshold: 0.1
    });
  });

  it('should handle zoom and pan interactions', async () => {
    await page.goto('http://localhost:3000/graph/interactive');
    
    // Zoom in
    await page.evaluate(() => {
      const svg = document.querySelector('svg');
      svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    });
    
    // Pan
    await page.mouse.move(400, 300);
    await page.mouse.down();
    await page.mouse.move(500, 400);
    await page.mouse.up();
    
    const transform = await page.evaluate(() => {
      return document.querySelector('.graph-group').getAttribute('transform');
    });
    
    expect(transform).toMatch(/scale\([^1]/);
    expect(transform).toMatch(/translate/);
  });
});
```

### 5.2 User Interaction Scenarios

```javascript
// tests/e2e/graph-interactions.test.js

describe('Graph User Interactions', () => {
  it('should highlight connected nodes on hover', async () => {
    await page.goto('/graph/test');
    const node = await page.$('.graph-node:first-child');
    
    await node.hover();
    
    const highlightedNodes = await page.$$eval('.graph-node.highlighted', 
      nodes => nodes.length
    );
    
    expect(highlightedNodes).toBeGreaterThan(0);
  });

  it('should show node details on click', async () => {
    await page.goto('/graph/test');
    await page.click('.graph-node:first-child');
    
    await page.waitForSelector('.node-details-panel');
    
    const details = await page.$eval('.node-details-panel', 
      el => el.textContent
    );
    
    expect(details).toContain('Address:');
    expect(details).toContain('Balance:');
    expect(details).toContain('Connections:');
  });

  it('should filter graph by relationship strength', async () => {
    await page.goto('/graph/test');
    
    // Set minimum strength filter
    await page.type('#strength-filter', '50');
    await page.click('#apply-filter');
    
    const edgeCount = await page.$$eval('.graph-edge', 
      edges => edges.length
    );
    
    expect(edgeCount).toBeLessThan(initialEdgeCount);
  });
});
```

### 5.3 Cross-Browser Compatibility

```javascript
// tests/compatibility/browsers.test.js

const browsers = ['chrome', 'firefox', 'safari', 'edge'];

describe.each(browsers)('Graph rendering in %s', (browserName) => {
  let browser, page;

  beforeAll(async () => {
    browser = await playwright[browserName].launch();
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should render graph correctly', async () => {
    await page.goto('/graph/compatibility-test');
    
    // Check SVG rendering
    const svg = await page.$('svg.graph-container');
    expect(svg).toBeTruthy();
    
    // Check node rendering
    const nodes = await page.$$('.graph-node');
    expect(nodes.length).toBeGreaterThan(0);
    
    // Check edge rendering
    const edges = await page.$$('.graph-edge');
    expect(edges.length).toBeGreaterThan(0);
    
    // Check interactions work
    await page.click('.graph-node:first-child');
    const selected = await page.$('.graph-node.selected');
    expect(selected).toBeTruthy();
  });
});
```

## 6. Test File Structure

```
tests/
├── unit/
│   ├── graph/
│   │   ├── queries.test.js
│   │   ├── algorithms.test.js
│   │   └── utils.test.js
│   ├── scoring/
│   │   ├── relationship.test.js
│   │   ├── risk.test.js
│   │   └── components.test.js
│   └── database/
│       ├── triggers.test.js
│       └── views.test.js
├── integration/
│   ├── api/
│   │   ├── graph.test.js
│   │   └── batch.test.js
│   ├── database/
│   │   ├── consistency.test.js
│   │   └── concurrency.test.js
│   └── services/
│       └── graph-service.test.js
├── performance/
│   ├── benchmarks/
│   │   ├── query-benchmarks.js
│   │   └── algorithm-benchmarks.js
│   ├── stress.test.js
│   ├── memory-usage.test.js
│   └── cache-effectiveness.test.js
├── visual/
│   ├── d3-rendering.test.js
│   ├── interactions.test.js
│   └── snapshots/
├── e2e/
│   ├── graph-workflow.test.js
│   └── investigation-session.test.js
├── fixtures/
│   ├── graph-generators.js
│   ├── weight-distributions.js
│   ├── temporal-patterns.js
│   └── test-data/
│       ├── small-graph.json
│       ├── medium-graph.json
│       └── large-graph.json
└── utils/
    ├── graph-test-helper.js
    ├── mock-factories.js
    └── performance-reporter.js
```

## 7. CI/CD Integration

### 7.1 GitHub Actions Workflow

```yaml
# .github/workflows/graph-tests.yml
name: Graph Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v3
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run unit tests
      run: npm run test:unit -- --coverage
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
        flags: unit

  integration-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    - name: Setup test database
      run: |
        npm run db:test:setup
        npm run db:test:seed
    
    - name: Run integration tests
      run: npm run test:integration
    
    - name: Archive test results
      if: failure()
      uses: actions/upload-artifact@v3
      with:
        name: integration-test-results
        path: tests/results/

  performance-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    - name: Run performance benchmarks
      run: npm run test:performance
    
    - name: Store benchmark result
      uses: benchmark-action/github-action-benchmark@v1
      with:
        tool: 'customBiggerIsBetter'
        output-file-path: tests/results/benchmark.json
        github-token: ${{ secrets.GITHUB_TOKEN }}
        auto-push: true

  visual-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    - name: Install Playwright
      run: npx playwright install --with-deps
    
    - name: Run visual tests
      run: npm run test:visual
    
    - name: Upload visual diff
      if: failure()
      uses: actions/upload-artifact@v3
      with:
        name: visual-diff
        path: tests/visual/__diff__/
```

### 7.2 Test Scripts

```json
// package.json scripts section
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest tests/unit",
    "test:integration": "vitest tests/integration --pool=forks --poolOptions.forks.singleFork=true",
    "test:performance": "node tests/performance/run-benchmarks.js",
    "test:visual": "playwright test tests/visual",
    "test:e2e": "playwright test tests/e2e",
    "test:coverage": "vitest --coverage",
    "test:watch": "vitest --watch",
    "test:ci": "npm run test:unit && npm run test:integration",
    "test:full": "npm run test:ci && npm run test:performance && npm run test:visual"
  }
}
```

### 7.3 Pre-commit Hooks

```javascript
// .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run unit tests for changed files
npm run test:unit -- --changed --bail

# Run linting
npm run lint

# Check test coverage for changed files
npm run test:coverage -- --changed --coverage.thresholds.statements=80
```

## 8. Coverage Targets

### 8.1 Code Coverage Goals

```javascript
// vitest.config.js coverage section
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {
        global: {
          branches: 80,
          functions: 85,
          lines: 85,
          statements: 85
        },
        'src/graph/**': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90
        },
        'src/scoring/**': {
          branches: 85,
          functions: 90,
          lines: 90,
          statements: 90
        }
      },
      exclude: [
        'tests/**',
        '**/*.test.js',
        '**/*.spec.js',
        '**/fixtures/**',
        '**/mocks/**'
      ]
    }
  }
});
```

### 8.2 Test Coverage Report

```
--------------------|---------|----------|---------|---------|-------------------
File                | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
--------------------|---------|----------|---------|---------|-------------------
All files           |   87.42 |    84.21 |   88.96 |   87.15 |
 graph/             |   91.23 |    89.47 |   92.31 |   90.87 |
  queries.js        |   92.45 |    90.12 |   94.12 |   92.11 | 145-147, 203
  algorithms.js     |   90.11 |    88.89 |   91.67 |   89.78 | 67-69, 112
  utils.js          |   91.03 |    89.23 |   91.18 |   90.65 | 34-35
 scoring/           |   88.76 |    85.43 |   89.23 |   88.45 |
  relationship.js   |   90.12 |    87.65 |   91.30 |   89.89 | 78-80, 125
  risk.js           |   87.34 |    83.21 |   87.50 |   87.01 | 45-48, 92-94
  components.js     |   88.67 |    85.42 |   88.89 |   88.45 | 56-58
 database/          |   83.45 |    79.31 |   85.71 |   83.12 |
  triggers.js       |   85.23 |    81.25 |   87.50 |   84.91 | 123-126, 178
  views.js          |   81.67 |    77.38 |   83.93 |   81.34 | 89-92, 145-148
--------------------|---------|----------|---------|---------|-------------------
```

### 8.3 Test Execution Metrics

```javascript
// Test execution time targets
const PERFORMANCE_TARGETS = {
  unit: {
    total: 30, // seconds
    perTest: 0.1 // seconds
  },
  integration: {
    total: 120, // seconds
    perTest: 5 // seconds
  },
  performance: {
    total: 300, // seconds
    perBenchmark: 30 // seconds
  },
  visual: {
    total: 180, // seconds
    perTest: 10 // seconds
  }
};
```

## Test Implementation Priorities

1. **Phase 1 (Week 1-2)**: Core unit tests
   - Graph query functions
   - Scoring calculations
   - Basic algorithms

2. **Phase 2 (Week 3-4)**: Integration tests
   - API endpoints
   - Database operations
   - Service integration

3. **Phase 3 (Week 5-6)**: Performance tests
   - Query benchmarks
   - Memory profiling
   - Stress testing

4. **Phase 4 (Week 7-8)**: Visual and E2E tests
   - D3.js rendering
   - User workflows
   - Cross-browser testing

## Monitoring and Maintenance

1. **Test Health Dashboard**: Track test execution times, flakiness
2. **Coverage Trends**: Monitor coverage changes over time
3. **Performance Regression Detection**: Alert on performance degradation
4. **Test Maintenance Schedule**: Regular review and updates
5. **Documentation Updates**: Keep test docs in sync with code

This comprehensive testing strategy ensures the graph functionality is thoroughly tested, performant, and reliable across all use cases.