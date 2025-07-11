# Testing Strategy Guide

## Overview

This document outlines a comprehensive testing strategy for the Polkadot Analysis Tool, emphasizing real-world data testing, continuous integration, and quality assurance at every level.

## Test Infrastructure

### Test Setup

```javascript
// vitest.config.js
import { defineConfig } from 'vitest';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.test.js',
        '**/*.spec.js'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    },
    testTimeout: 30000,
    hookTimeout: 30000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@test': path.resolve(__dirname, './tests')
    }
  }
});
```

### Test Database Setup

```javascript
// tests/setup.js
import Database from 'better-sqlite3';
import { migrate } from 'db-migrate';
import fs from 'fs-extra';
import path from 'path';

let testDb;

beforeAll(async () => {
  // Create test database
  const testDbPath = path.join(__dirname, 'test.db');
  
  // Remove existing test database
  await fs.remove(testDbPath);
  
  // Create new database
  testDb = new Database(testDbPath);
  
  // Run migrations
  await migrate.up({
    config: {
      driver: 'sqlite3',
      filename: testDbPath
    }
  });
  
  // Load test data
  await loadTestData(testDb);
  
  // Make database available globally
  global.testDb = testDb;
});

afterAll(async () => {
  if (testDb) {
    testDb.close();
  }
});

async function loadTestData(db) {
  // Insert known test addresses
  const testAddresses = [
    {
      address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', // Alice
      display_name: 'Alice Test',
      balance: '1000000000000000',
      is_verified: true
    },
    {
      address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty', // Bob
      display_name: 'Bob Test',
      balance: '500000000000000',
      is_verified: false
    },
    {
      address: '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y', // Charlie
      display_name: null,
      balance: '100000000000000',
      is_verified: false
    }
  ];
  
  const stmt = db.prepare(`
    INSERT INTO accounts (address, display_name, balance, is_verified)
    VALUES (@address, @display_name, @balance, @is_verified)
  `);
  
  for (const account of testAddresses) {
    stmt.run(account);
  }
}
```

## Unit Tests

### Repository Layer Tests

```javascript
// tests/unit/repositories/AccountRepository.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { AccountRepository } from '@/repositories/AccountRepository';

describe('AccountRepository', () => {
  let repo;
  
  beforeEach(() => {
    repo = new AccountRepository(global.testDb);
  });
  
  describe('getAccount', () => {
    it('should retrieve account by address', async () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const account = await repo.getAccount(address);
      
      expect(account).toBeDefined();
      expect(account.address).toBe(address);
      expect(account.display_name).toBe('Alice Test');
      expect(account.is_verified).toBe(true);
    });
    
    it('should return null for non-existent address', async () => {
      const account = await repo.getAccount('invalid_address');
      expect(account).toBeNull();
    });
  });
  
  describe('searchAccounts', () => {
    it('should find accounts by partial address', async () => {
      const results = await repo.searchAccounts('5Grw');
      
      expect(results).toHaveLength(1);
      expect(results[0].address).toContain('5Grw');
    });
    
    it('should find accounts by display name', async () => {
      const results = await repo.searchAccounts('Alice');
      
      expect(results).toHaveLength(1);
      expect(results[0].display_name).toBe('Alice Test');
    });
    
    it('should respect limit parameter', async () => {
      const results = await repo.searchAccounts('5', { limit: 2 });
      
      expect(results).toHaveLength(2);
    });
  });
  
  describe('createAccount', () => {
    it('should create new account', async () => {
      const newAccount = {
        address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
        display_name: 'Dave Test',
        balance: '2000000000000000'
      };
      
      const created = await repo.createAccount(newAccount);
      
      expect(created).toBe(true);
      
      // Verify creation
      const account = await repo.getAccount(newAccount.address);
      expect(account.display_name).toBe('Dave Test');
    });
    
    it('should handle duplicate address gracefully', async () => {
      const duplicate = {
        address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'
      };
      
      const created = await repo.createAccount(duplicate);
      expect(created).toBe(false);
    });
  });
});
```

### Service Layer Tests

```javascript
// tests/unit/services/analysis/PatternDetector.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PatternDetector } from '@/services/analysis/PatternDetector';

describe('PatternDetector', () => {
  let detector;
  let mockTransferRepo;
  
  beforeEach(() => {
    mockTransferRepo = {
      getTransfersByAddress: vi.fn(),
      getTransferVolume: vi.fn()
    };
    
    detector = new PatternDetector(mockTransferRepo);
  });
  
  describe('detectRapidMovement', () => {
    it('should detect rapid fund movement pattern', async () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      const now = Math.floor(Date.now() / 1000);
      
      // Mock transfers within short time window
      mockTransferRepo.getTransfersByAddress.mockResolvedValue([
        { from: address, to: 'addr1', amount: '1000000000000', timestamp: now - 100 },
        { from: address, to: 'addr2', amount: '2000000000000', timestamp: now - 200 },
        { from: address, to: 'addr3', amount: '1500000000000', timestamp: now - 300 },
        { from: address, to: 'addr4', amount: '1000000000000', timestamp: now - 400 },
        { from: address, to: 'addr5', amount: '2000000000000', timestamp: now - 500 }
      ]);
      
      const result = await detector.detectRapidMovement(address, {
        timeWindow: 3600,
        minTransactions: 5
      });
      
      expect(result.detected).toBe(true);
      expect(result.type).toBe('RAPID_MOVEMENT');
      expect(result.details.transferCount).toBe(5);
      expect(result.details.uniqueAddresses).toBe(5);
    });
    
    it('should not detect pattern with few transactions', async () => {
      mockTransferRepo.getTransfersByAddress.mockResolvedValue([
        { from: 'addr', to: 'addr1', amount: '1000000000000', timestamp: Date.now() }
      ]);
      
      const result = await detector.detectRapidMovement('addr');
      
      expect(result.detected).toBe(false);
    });
  });
  
  describe('detectCircularFlow', () => {
    it('should detect circular transaction pattern', async () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      // Mock circular flow: A → B → C → A
      mockTransferRepo.getTransfersByAddress
        .mockResolvedValueOnce([
          { from: address, to: 'addrB', amount: '1000000000000' }
        ])
        .mockResolvedValueOnce([
          { from: 'addrB', to: 'addrC', amount: '900000000000' }
        ])
        .mockResolvedValueOnce([
          { from: 'addrC', to: address, amount: '800000000000' }
        ]);
      
      const result = await detector.detectCircularFlow(address);
      
      expect(result.detected).toBe(true);
      expect(result.type).toBe('CIRCULAR_FLOW');
      expect(result.details.cycles).toHaveLength(1);
      expect(result.details.cycles[0].path).toEqual([address, 'addrB', 'addrC']);
    });
  });
});
```

## Integration Tests

### API Integration Tests

```javascript
// tests/integration/api/graph.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/api/server';
import { startServices } from '@/services';

describe('Graph API Integration', () => {
  let app;
  let services;
  
  beforeAll(async () => {
    services = await startServices({ db: global.testDb });
    app = createApp(services);
  });
  
  afterAll(async () => {
    await services.stop();
  });
  
  describe('GET /api/address/:address/graph', () => {
    it('should return graph data for valid address', async () => {
      const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
      
      const response = await request(app)
        .get(`/api/address/${address}/graph`)
        .query({ depth: 2 })
        .expect(200);
      
      expect(response.body).toHaveProperty('accounts');
      expect(response.body).toHaveProperty('connections');
      expect(response.body.accounts).toContainEqual(
        expect.objectContaining({ address })
      );
    });
    
    it('should validate depth parameter', async () => {
      const response = await request(app)
        .get('/api/address/5Grw.../graph')
        .query({ depth: 10 })
        .expect(400);
      
      expect(response.body.error).toContain('Validation failed');
    });
    
    it('should handle non-existent address', async () => {
      const response = await request(app)
        .get('/api/address/5InvalidAddress123/graph')
        .expect(404);
      
      expect(response.body.error).toContain('Address not found');
    });
  });
});
```

### Database Integration Tests

```javascript
// tests/integration/database/transfers.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { TransferRepository } from '@/repositories/TransferRepository';
import { AccountRepository } from '@/repositories/AccountRepository';

describe('Transfer Database Integration', () => {
  let transferRepo;
  let accountRepo;
  let testAccounts;
  
  beforeEach(async () => {
    transferRepo = new TransferRepository(global.testDb);
    accountRepo = new AccountRepository(global.testDb);
    
    // Create test accounts
    testAccounts = [
      { address: 'test_addr_1', balance: '1000000000000' },
      { address: 'test_addr_2', balance: '2000000000000' },
      { address: 'test_addr_3', balance: '3000000000000' }
    ];
    
    for (const account of testAccounts) {
      await accountRepo.createAccount(account);
    }
  });
  
  describe('Transfer creation and retrieval', () => {
    it('should create and retrieve transfers', async () => {
      const transfer = {
        from_address: 'test_addr_1',
        to_address: 'test_addr_2',
        amount: '100000000000',
        block_number: 1000,
        timestamp: Math.floor(Date.now() / 1000)
      };
      
      await transferRepo.createTransfer(transfer);
      
      const transfers = await transferRepo.getTransfersBetween(
        'test_addr_1',
        'test_addr_2'
      );
      
      expect(transfers).toHaveLength(1);
      expect(transfers[0]).toMatchObject(transfer);
    });
    
    it('should update transfer statistics', async () => {
      // Create multiple transfers
      const transfers = [
        { from: 'test_addr_1', to: 'test_addr_2', amount: '100000000000' },
        { from: 'test_addr_1', to: 'test_addr_2', amount: '200000000000' },
        { from: 'test_addr_1', to: 'test_addr_3', amount: '300000000000' }
      ];
      
      for (const transfer of transfers) {
        await transferRepo.createTransfer({
          from_address: transfer.from,
          to_address: transfer.to,
          amount: transfer.amount,
          block_number: 1000,
          timestamp: Date.now()
        });
      }
      
      const stats = await transferRepo.getTransferStats('test_addr_1', 'test_addr_2');
      
      expect(stats.transfer_count).toBe(2);
      expect(BigInt(stats.total_volume)).toBe(300000000000n);
    });
  });
});
```

## End-to-End Tests

### Full User Journey Tests

```javascript
// tests/e2e/userJourney.spec.js
import { test, expect } from '@playwright/test';

test.describe('User Journey', () => {
  test('should search for address and view graph', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Search for an address
    await page.fill('[data-testid="search-input"]', '5Grw');
    await page.waitForSelector('[data-testid="search-results"]');
    
    // Click on first result
    await page.click('[data-testid="search-result-0"]');
    
    // Wait for graph to load
    await page.waitForSelector('[data-testid="network-graph"]');
    
    // Verify graph elements
    const nodes = await page.$$('[data-testid="graph-node"]');
    expect(nodes.length).toBeGreaterThan(0);
    
    // Expand a node
    await page.click('[data-testid="graph-node-0"]');
    await page.waitForTimeout(1000); // Wait for animation
    
    // Verify expansion
    const expandedNodes = await page.$$('[data-testid="graph-node"]');
    expect(expandedNodes.length).toBeGreaterThan(nodes.length);
  });
  
  test('should detect and display patterns', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Navigate to suspicious address
    const suspiciousAddress = '5SuspiciousAddressForTesting';
    await page.goto(`http://localhost:3000/address/${suspiciousAddress}`);
    
    // Check for pattern warnings
    await page.waitForSelector('[data-testid="pattern-warning"]');
    
    const patterns = await page.$$('[data-testid="pattern-item"]');
    expect(patterns.length).toBeGreaterThan(0);
    
    // Verify risk score
    const riskScore = await page.textContent('[data-testid="risk-score"]');
    expect(parseInt(riskScore)).toBeGreaterThan(50);
  });
});
```

## Real Data Testing

### Blockchain Data Fixtures

```javascript
// tests/fixtures/realData.js
export const REAL_ADDRESSES = {
  // Polkadot Treasury
  TREASURY: '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn',
  
  // Known exchange addresses
  EXCHANGES: {
    BINANCE: '1234...', // Replace with actual
    KRAKEN: '5678...'   // Replace with actual
  },
  
  // Known validator addresses
  VALIDATORS: [
    '14Gn7SEmCgMX8n4AarXpJfbxWaHjwHbpU5sQqYXtUj1y5qr2',
    '15cfSaBcTxNr8rV59cbhdMNCRagFr3GE6B3zZRsCp4QHHKPu'
  ],
  
  // Test suspicious patterns
  SUSPICIOUS: {
    MIXER: 'mixer_address_here',
    HIGH_VOLUME: 'high_volume_address'
  }
};

export const REAL_TRANSACTIONS = [
  {
    from: REAL_ADDRESSES.TREASURY,
    to: REAL_ADDRESSES.VALIDATORS[0],
    amount: '10000000000000',
    block: 15000000,
    hash: '0xabc...'
  }
];
```

### Performance Benchmarks

```javascript
// tests/performance/benchmarks.test.js
import { describe, it, expect } from 'vitest';
import { performance } from 'perf_hooks';
import { GraphBuilder } from '@/services/analysis/GraphBuilder';
import { generateLargeDataset } from '@test/fixtures/largeDataset';

describe('Performance Benchmarks', () => {
  let graphBuilder;
  let largeDataset;
  
  beforeAll(async () => {
    largeDataset = await generateLargeDataset({
      accounts: 10000,
      transfers: 100000
    });
    
    graphBuilder = new GraphBuilder(global.testDb);
  });
  
  it('should build graph for 1000 nodes in < 1 second', async () => {
    const start = performance.now();
    
    const graph = await graphBuilder.buildGraph(largeDataset.centerAddress, {
      depth: 3,
      maxNodes: 1000
    });
    
    const duration = performance.now() - start;
    
    expect(graph.nodes).toHaveLength(1000);
    expect(duration).toBeLessThan(1000); // 1 second
  });
  
  it('should search 10000 accounts in < 100ms', async () => {
    const searchEngine = new SearchEngine(global.testDb);
    
    const start = performance.now();
    const results = await searchEngine.search('test', { limit: 50 });
    const duration = performance.now() - start;
    
    expect(results.total).toBeGreaterThan(0);
    expect(duration).toBeLessThan(100);
  });
  
  it('should process 1000 transfers in < 500ms', async () => {
    const processor = new DataProcessor(global.testDb);
    const transfers = largeDataset.transfers.slice(0, 1000);
    
    const start = performance.now();
    await processor.processTransfers(transfers);
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(500);
  });
});
```

## Test Data Generation

### Test Data Factory

```javascript
// tests/factories/dataFactory.js
import { faker } from '@faker-js/faker';

export class DataFactory {
  static generateAddress() {
    // Generate valid SS58 address format
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let address = '5'; // Polkadot addresses typically start with 5
    
    for (let i = 0; i < 47; i++) {
      address += chars[Math.floor(Math.random() * chars.length)];
    }
    
    return address;
  }
  
  static generateAccount(overrides = {}) {
    return {
      address: this.generateAddress(),
      display_name: faker.internet.userName(),
      balance: faker.number.bigInt({ min: 0n, max: 10000000000000000n }).toString(),
      is_verified: faker.datatype.boolean(),
      created_at: faker.date.past().getTime(),
      ...overrides
    };
  }
  
  static generateTransfer(fromAddress, toAddress, overrides = {}) {
    return {
      from_address: fromAddress,
      to_address: toAddress,
      amount: faker.number.bigInt({ min: 100000000n, max: 1000000000000n }).toString(),
      block_number: faker.number.int({ min: 1000000, max: 15000000 }),
      timestamp: faker.date.recent().getTime() / 1000,
      hash: '0x' + faker.string.hexadecimal({ length: 64 }),
      ...overrides
    };
  }
  
  static generateSuspiciousPattern(address, type) {
    const patterns = {
      RAPID_MOVEMENT: {
        transfers: Array(20).fill(null).map((_, i) => ({
          from: address,
          to: this.generateAddress(),
          amount: '1000000000000',
          timestamp: Date.now() / 1000 - i * 60 // 1 minute apart
        }))
      },
      CIRCULAR_FLOW: {
        addresses: [address, ...Array(3).fill(null).map(() => this.generateAddress())],
        createCircle() {
          const transfers = [];
          for (let i = 0; i < this.addresses.length; i++) {
            transfers.push({
              from: this.addresses[i],
              to: this.addresses[(i + 1) % this.addresses.length],
              amount: '500000000000'
            });
          }
          return transfers;
        }
      },
      MIXER_BEHAVIOR: {
        inputs: Array(10).fill(null).map(() => ({
          from: this.generateAddress(),
          to: address,
          amount: '100000000000' // Same amount
        })),
        outputs: Array(10).fill(null).map(() => ({
          from: address,
          to: this.generateAddress(),
          amount: '95000000000' // Slightly less (fee)
        }))
      }
    };
    
    return patterns[type];
  }
}
```

### Mock Blockchain Client

```javascript
// tests/mocks/blockchainClient.js
import { vi } from 'vitest';

export function createMockBlockchainClient() {
  return {
    connect: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn().mockResolvedValue(true),
    isConnected: vi.fn().mockReturnValue(true),
    
    getLatestBlock: vi.fn().mockResolvedValue(15000000),
    
    getBlock: vi.fn().mockImplementation(async (blockNumber) => ({
      number: blockNumber,
      hash: `0xblock${blockNumber}`,
      parentHash: `0xblock${blockNumber - 1}`,
      timestamp: Date.now() - (15000000 - blockNumber) * 6000,
      extrinsics: []
    })),
    
    subscribeNewHeads: vi.fn().mockImplementation((callback) => {
      // Simulate new blocks every 6 seconds
      const interval = setInterval(() => {
        callback({
          number: { toNumber: () => 15000001 },
          hash: '0xnewblock'
        });
      }, 6000);
      
      // Return unsubscribe function
      return () => clearInterval(interval);
    }),
    
    getAccount: vi.fn().mockImplementation(async (address) => ({
      address,
      balance: {
        free: '1000000000000',
        reserved: '0',
        frozen: '0'
      },
      nonce: 0
    }))
  };
}
```

## Continuous Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    services:
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linter
      run: npm run lint
    
    - name: Run unit tests
      run: npm run test:unit
      env:
        NODE_ENV: test
    
    - name: Run integration tests
      run: npm run test:integration
      env:
        NODE_ENV: test
        REDIS_URL: redis://localhost:6379
    
    - name: Run e2e tests
      run: npm run test:e2e
      env:
        NODE_ENV: test
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/coverage-final.json
        flags: unittests
        name: codecov-umbrella
    
    - name: Performance tests
      run: npm run test:performance
      
    - name: Check coverage thresholds
      run: npm run coverage:check
```

### Pre-commit Hooks

```javascript
// .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run tests related to changed files
npm run test:related

# Run linter on staged files
npm run lint:staged

# Check types
npm run type-check
```

## Test Scripts

```json
// package.json scripts
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run --config vitest.unit.config.js",
    "test:integration": "vitest run --config vitest.integration.config.js",
    "test:e2e": "playwright test",
    "test:performance": "vitest run --config vitest.performance.config.js",
    "test:watch": "vitest watch",
    "test:related": "vitest related",
    "test:coverage": "vitest run --coverage",
    "coverage:check": "vitest run --coverage --coverage.thresholdAutoUpdate=false",
    "test:ci": "npm run test:unit && npm run test:integration"
  }
}
```

## Monitoring Test Health

### Test Analytics Dashboard

```javascript
// scripts/testAnalytics.js
import fs from 'fs-extra';
import path from 'path';

async function analyzeTestResults() {
  const resultsPath = path.join(__dirname, '../test-results');
  const results = await fs.readJson(path.join(resultsPath, 'results.json'));
  
  const analytics = {
    totalTests: results.numTotalTests,
    passedTests: results.numPassedTests,
    failedTests: results.numFailedTests,
    coverage: results.coverageMap,
    slowTests: results.testResults
      .flatMap(r => r.testResults)
      .filter(t => t.duration > 1000)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10),
    flakyTests: await identifyFlakyTests(),
    testGrowth: await calculateTestGrowth()
  };
  
  // Generate report
  await generateReport(analytics);
}

async function identifyFlakyTests() {
  // Analyze test history for flaky tests
  const history = await loadTestHistory();
  const flaky = [];
  
  for (const [testName, results] of Object.entries(history)) {
    const failureRate = results.filter(r => !r.passed).length / results.length;
    if (failureRate > 0.1 && failureRate < 0.9) {
      flaky.push({ testName, failureRate });
    }
  }
  
  return flaky;
}
```

This testing strategy ensures high quality and reliability through comprehensive testing at all levels, with special emphasis on real-world data and continuous monitoring.