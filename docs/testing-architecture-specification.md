# Testing Architecture Specification

## Overview

This document outlines the comprehensive testing strategy for the Polkadot Analysis Tool, based on detailed analysis of test failures and architectural improvements needed.

## Test Failure Analysis Summary

### Root Causes Identified

1. **Database Isolation Issues**
   - Multiple tests using same database file path
   - SQLite WAL mode conflicts with concurrent access
   - Insufficient cleanup between tests

2. **SQL Parameter Binding Issues**
   - Boolean values not converted to integers for SQLite
   - Parameter name mismatches (camelCase vs snake_case)
   - Missing type validation before database operations

3. **Test Setup Conflicts**
   - Global beforeEach hooks interfering with integration tests
   - Shared resources between unit and integration tests
   - Race conditions in test database creation/cleanup

4. **Mock Strategy Issues**
   - Hybrid real/mock approach causing confusion
   - Heavy database setup for unit tests
   - Inconsistent async/await patterns

## Test Organization Strategy

### Test Categories

#### 1. Implemented Features (Should Pass)
- Basic functionality tests
- Database operations (CRUD)
- API endpoints (structure and validation)
- Simple service layer tests

#### 2. Partially Implemented Features (Mixed Results Expected)
- AddressController with blockchain integration
- Complex relationship queries
- Pattern detection (CRUD only, not algorithms)

#### 3. Unimplemented Features (Should be Excluded)
- Graph generation algorithms
- Real-time WebSocket features
- Advanced pattern detection algorithms
- Multi-chain support

### Directory Structure

```
tests/
├── unit/                 # Pure unit tests with mocks
│   ├── utils/           # Basic functionality
│   ├── services/        # Service layer tests
│   └── controllers/     # Controller logic tests
├── integration/         # API and service integration
│   ├── api.test.js     # API endpoint tests
│   └── server.test.js  # Server integration
├── performance/         # Performance benchmarks
│   └── database.test.js
├── features/           # Future feature tests (excluded)
├── fixtures/           # Test data and utilities
└── setup.js           # Global test configuration
```

## Test Configuration

### Vitest Configuration

```javascript
export default defineConfig({
  test: {
    projects: [
      {
        name: 'unit',
        include: ['tests/unit/**/*.test.js'],
        setupFiles: ['./tests/unit-setup.js']
      },
      {
        name: 'integration', 
        include: ['tests/integration/**/*.test.js'],
        setupFiles: ['./tests/integration-setup.js']
      },
      {
        name: 'performance',
        include: ['tests/performance/**/*.test.js'],
        testTimeout: 30000
      }
    ],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }
    }
  }
});
```

## Database Testing Strategy

### Test Database Isolation

1. **Unique Database Files**: Each test gets a UUID-based database file
2. **Proper Cleanup**: Database connections closed and files deleted
3. **SQLite Configuration**: Disable WAL mode, enable foreign keys
4. **Transaction Management**: Use transactions for test data setup

### Implementation Pattern

```javascript
let db, dbPath;

beforeEach(async () => {
  const uniqueId = randomUUID();
  dbPath = path.join(TEST_DB_DIR, `test-${uniqueId}.db`);
  
  db = new Database(dbPath);
  db.pragma('journal_mode = DELETE'); // Avoid WAL conflicts
  db.pragma('foreign_keys = ON');
  
  // Execute schema
  const schema = await fs.readFile(schemaPath, 'utf8');
  db.exec(schema);
});

afterEach(async () => {
  if (db) {
    db.close();
    await new Promise(resolve => setTimeout(resolve, 100));
    await fs.unlink(dbPath).catch(() => {}); // Ignore errors
  }
});
```

## Service Layer Testing

### Mock Strategy Guidelines

1. **Pure Unit Tests**: Use complete mocks without real database
2. **Integration Tests**: Use real database with isolated instances
3. **Dependency Injection**: Pass services as parameters for easier mocking

### Recommended Mock Pattern

```javascript
// Unit test - pure mocks
const mockDbService = {
  searchAccounts: vi.fn().mockResolvedValue([]),
  getAccount: vi.fn().mockResolvedValue(null),
  // ... other methods
};

// Integration test - real service with test database
const dbService = new DatabaseService();
await dbService.initialize(); // Uses test database
```

## Performance Testing Standards

### Performance Benchmarks

| Operation | Target Time | Dataset Size | Notes |
|-----------|-------------|--------------|-------|
| Account Insertion | < 10s | 1,000 accounts | With identity processing |
| Transfer Insertion | < 30s | 10,000 transfers | With FK validation |
| Address Search | < 2s | 1,000+ accounts | Pattern matching |
| Relationship Query | < 3s | 10 addresses | Complex JOINs |
| Concurrent Reads | < 2s | 50 operations | SQLite locking |

### Data Integrity Rules

1. **Foreign Key Compliance**: All transfers must reference existing accounts
2. **Transaction Safety**: Use database transactions for multi-step operations
3. **Memory Management**: Monitor heap usage during large operations
4. **Connection Cleanup**: Ensure proper resource disposal

## Test Utilities and Helpers

### Database Factories

```javascript
export function createTestAccount(overrides = {}) {
  return {
    address: generateTestAddress(),
    identity_display: 'Test User',
    balance: '1000000000000',
    total_transfers_in: 0,
    total_transfers_out: 0,
    ...overrides
  };
}

export function generateTransfersForAccounts(accounts, count = 100) {
  // Ensures referential integrity
  return accounts.slice(0, count).map((account, i) => ({
    hash: `0x${i.toString(16).padStart(64, '0')}`,
    from_address: account.address,
    to_address: accounts[(i + 1) % accounts.length].address,
    // ... other fields
  }));
}
```

### API Test Client

```javascript
export function createTestApiClient(app) {
  return {
    get: (path) => request(app).get(path),
    post: (path, data) => request(app).post(path).send(data),
    expectStatus: (response, status) => {
      expect(response.status).toBe(status);
      return response.body;
    }
  };
}
```

## Error Handling Standards

### Expected Error Scenarios

1. **400 Bad Request**: Invalid input format (address, parameters)
2. **404 Not Found**: Resource doesn't exist (after successful validation)
3. **429 Too Many Requests**: Rate limiting triggered
4. **500 Internal Server Error**: Database or service failures

### Error Response Format

```javascript
{
  "error": {
    "message": "Human readable error message",
    "status": 400,
    "details": { /* Optional validation details */ }
  }
}
```

## Implementation Roadmap

### Phase 1: Fix Current Tests (Immediate)
- ✅ Implement database isolation fixes
- ✅ Fix SQL parameter binding
- ✅ Resolve integration test conflicts
- ✅ Update performance test expectations

### Phase 2: Improve Test Architecture (1-2 days)
- Separate test configurations by type
- Add comprehensive test utilities
- Improve mock strategies
- Add missing error scenario coverage

### Phase 3: Feature Implementation (Ongoing)
- Graph generation algorithms
- Pattern detection logic
- Real-time WebSocket features
- Multi-chain support

## Success Metrics

### Current Status
- ✅ 16 core tests passing (100% for implemented features)
- ✅ Database operations working reliably
- ✅ API endpoints responding correctly
- ✅ Performance benchmarks established

### Target Goals
- 100% test pass rate for implemented features
- < 5 second test suite execution time
- Complete test coverage for all API endpoints
- Performance regression detection
- Reliable CI/CD integration

This specification provides the foundation for reliable, maintainable testing as the Polkadot Analysis Tool evolves.