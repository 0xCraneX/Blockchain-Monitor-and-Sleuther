#!/usr/bin/env node

import { promises as fs } from 'fs';

const API_BASE = 'http://[::1]:3000/api';
const COLORS = {
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
  RESET: '\x1b[0m'
};

// Test addresses - mix of valid and invalid
const TEST_ADDRESSES = {
  valid: [
    '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // Example address
    '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5', // Polkadot format
    '14E5nqKAp3oAJcmzgZhUD2RcptBeUBScxKHgJKU4HPNcKVf3' // Another Polkadot format
  ],
  invalid: [
    'invalid_address_123',
    '12345',
    '',
    null,
    'not-an-address'
  ]
};

// Helper function to make HTTP requests
async function makeRequest(endpoint, options = {}) {
  const startTime = Date.now();
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    const responseTime = Date.now() - startTime;
    const data = await response.text();
    let parsedData = null;
    
    try {
      parsedData = JSON.parse(data);
    } catch (e) {
      parsedData = data;
    }
    
    return {
      status: response.status,
      statusText: response.statusText,
      data: parsedData,
      responseTime,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (error) {
    return {
      status: 0,
      statusText: 'Network Error',
      error: error.message,
      responseTime: Date.now() - startTime
    };
  }
}

// Test result logger
function logTestResult(testName, result, expected) {
  const passed = result.status === expected.status;
  const color = passed ? COLORS.GREEN : COLORS.RED;
  const symbol = passed ? '✓' : '✗';
  
  console.log(`${color}${symbol} ${testName}${COLORS.RESET}`);
  console.log(`  Status: ${result.status} ${result.statusText} (${result.responseTime}ms)`);
  
  if (!passed) {
    console.log(`  Expected: ${expected.status}`);
  }
  
  if (result.error) {
    console.log(`  ${COLORS.RED}Error: ${result.error}${COLORS.RESET}`);
  }
  
  if (result.data && Object.keys(result.data).length > 0) {
    console.log(`  Response: ${JSON.stringify(result.data, null, 2).substring(0, 200)}...`);
  }
  
  console.log('');
  return passed;
}

// Test Categories
const tests = {
  // Root API endpoint
  root: [
    {
      name: 'GET /api - API Info',
      endpoint: '/',
      method: 'GET',
      expected: { status: 200 }
    }
  ],

  // Address API Tests
  addresses: [
    {
      name: 'GET /api/addresses/search - Valid query',
      endpoint: '/addresses/search?q=test',
      method: 'GET',
      expected: { status: 200 }
    },
    {
      name: 'GET /api/addresses/search - Empty query',
      endpoint: '/addresses/search?q=',
      method: 'GET',
      expected: { status: 400 }
    },
    {
      name: 'GET /api/addresses/search - Missing query param',
      endpoint: '/addresses/search',
      method: 'GET',
      expected: { status: 400 }
    },
    {
      name: 'GET /api/addresses/search - Long query',
      endpoint: '/addresses/search?q=' + 'a'.repeat(100),
      method: 'GET',
      expected: { status: 200 }
    },
    ...TEST_ADDRESSES.valid.map(addr => ({
      name: `GET /api/addresses/{address} - Valid (${addr.substring(0, 10)}...)`,
      endpoint: `/addresses/${addr}`,
      method: 'GET',
      expected: { status: 200 }
    })),
    ...TEST_ADDRESSES.invalid.map(addr => ({
      name: `GET /api/addresses/{address} - Invalid (${addr})`,
      endpoint: `/addresses/${addr}`,
      method: 'GET',
      expected: { status: 400 }
    })),
    ...TEST_ADDRESSES.valid.map(addr => ({
      name: `GET /api/addresses/{address}/transfers - Valid address`,
      endpoint: `/addresses/${addr}/transfers`,
      method: 'GET',
      expected: { status: 200 }
    })),
    ...TEST_ADDRESSES.valid.map(addr => ({
      name: `GET /api/addresses/{address}/relationships - Valid address`,
      endpoint: `/addresses/${addr}/relationships`,
      method: 'GET',
      expected: { status: 200 }
    })),
    ...TEST_ADDRESSES.valid.map(addr => ({
      name: `GET /api/addresses/{address}/patterns - Valid address`,
      endpoint: `/addresses/${addr}/patterns`,
      method: 'GET',
      expected: { status: 200 }
    }))
  ],

  // Graph API Tests
  graph: [
    ...TEST_ADDRESSES.valid.map(addr => ({
      name: `GET /api/graph/{address} - Default depth`,
      endpoint: `/graph/${addr}`,
      method: 'GET',
      expected: { status: 200 }
    })),
    ...TEST_ADDRESSES.valid.map(addr => ({
      name: `GET /api/graph/{address}?depth=1 - Min depth`,
      endpoint: `/graph/${addr}?depth=1`,
      method: 'GET',
      expected: { status: 200 }
    })),
    ...TEST_ADDRESSES.valid.map(addr => ({
      name: `GET /api/graph/{address}?depth=5 - Max depth`,
      endpoint: `/graph/${addr}?depth=5`,
      method: 'GET',
      expected: { status: 200 }
    })),
    {
      name: 'GET /api/graph/{address}?depth=0 - Invalid depth',
      endpoint: `/graph/${TEST_ADDRESSES.valid[0]}?depth=0`,
      method: 'GET',
      expected: { status: 400 }
    },
    {
      name: 'GET /api/graph/{address}?depth=10 - Excessive depth',
      endpoint: `/graph/${TEST_ADDRESSES.valid[0]}?depth=10`,
      method: 'GET',
      expected: { status: 400 }
    },
    {
      name: 'GET /api/graph/path - Valid addresses',
      endpoint: `/graph/path?from=${TEST_ADDRESSES.valid[0]}&to=${TEST_ADDRESSES.valid[1]}`,
      method: 'GET',
      expected: { status: 200 }
    },
    {
      name: 'GET /api/graph/path - Missing from param',
      endpoint: `/graph/path?to=${TEST_ADDRESSES.valid[0]}`,
      method: 'GET',
      expected: { status: 400 }
    },
    {
      name: 'GET /api/graph/path - Missing to param',
      endpoint: `/graph/path?from=${TEST_ADDRESSES.valid[0]}`,
      method: 'GET',
      expected: { status: 400 }
    },
    ...TEST_ADDRESSES.valid.map(addr => ({
      name: `GET /api/graph/metrics/{address}`,
      endpoint: `/graph/metrics/${addr}`,
      method: 'GET',
      expected: { status: 200 }
    })),
    ...TEST_ADDRESSES.valid.map(addr => ({
      name: `GET /api/graph/patterns/{address}`,
      endpoint: `/graph/patterns/${addr}`,
      method: 'GET',
      expected: { status: 200 }
    })),
    {
      name: 'GET /api/graph/expand - Valid request',
      endpoint: '/graph/expand',
      method: 'GET',
      expected: { status: 200 }
    }
  ],

  // Relationship API Tests
  relationships: [
    {
      name: 'GET /api/relationships/{from}/{to}/score - Valid addresses',
      endpoint: `/relationships/${TEST_ADDRESSES.valid[0]}/${TEST_ADDRESSES.valid[1]}/score`,
      method: 'GET',
      expected: { status: 200 }
    },
    {
      name: 'GET /api/relationships/{from}/{to}/score - Invalid from address',
      endpoint: `/relationships/${TEST_ADDRESSES.invalid[0]}/${TEST_ADDRESSES.valid[1]}/score`,
      method: 'GET',
      expected: { status: 400 }
    },
    {
      name: 'GET /api/relationships/{from}/{to}/score - Invalid to address',
      endpoint: `/relationships/${TEST_ADDRESSES.valid[0]}/${TEST_ADDRESSES.invalid[0]}/score`,
      method: 'GET',
      expected: { status: 400 }
    }
  ],

  // Investigation API Tests
  investigations: [
    {
      name: 'POST /api/investigations - Create new investigation',
      endpoint: '/investigations',
      method: 'POST',
      body: {
        name: 'Test Investigation',
        description: 'Testing API endpoint',
        addresses: TEST_ADDRESSES.valid.slice(0, 2)
      },
      expected: { status: 201 }
    },
    {
      name: 'POST /api/investigations - Missing required fields',
      endpoint: '/investigations',
      method: 'POST',
      body: {
        description: 'Missing name field'
      },
      expected: { status: 400 }
    },
    {
      name: 'POST /api/investigations - Empty body',
      endpoint: '/investigations',
      method: 'POST',
      body: {},
      expected: { status: 400 }
    }
  ],

  // Stats API Tests
  stats: [
    {
      name: 'GET /api/stats - General statistics',
      endpoint: '/stats',
      method: 'GET',
      expected: { status: 200 }
    }
  ],

  // Rate Limiting Tests
  rateLimiting: [
    {
      name: 'Rate Limiting - Rapid requests test',
      custom: async () => {
        const results = [];
        const endpoint = '/addresses/search?q=test';
        
        // Make 20 rapid requests
        for (let i = 0; i < 20; i++) {
          const result = await makeRequest(endpoint);
          results.push(result);
          
          // Check if we hit rate limit
          if (result.status === 429) {
            return {
              status: 429,
              statusText: 'Rate limit hit after ' + (i + 1) + ' requests',
              data: { requestCount: i + 1, rateLimitHit: true }
            };
          }
        }
        
        return {
          status: 200,
          statusText: 'No rate limit hit',
          data: { requestCount: 20, rateLimitHit: false }
        };
      },
      expected: { status: 429 }
    }
  ],

  // Concurrent Request Tests
  concurrent: [
    {
      name: 'Concurrent Requests - 10 simultaneous requests',
      custom: async () => {
        const promises = [];
        const endpoints = [
          '/addresses/search?q=test',
          `/addresses/${TEST_ADDRESSES.valid[0]}`,
          `/graph/${TEST_ADDRESSES.valid[0]}`,
          '/stats',
          `/addresses/${TEST_ADDRESSES.valid[1]}`,
          `/graph/${TEST_ADDRESSES.valid[1]}?depth=2`,
          '/addresses/search?q=another',
          `/relationships/${TEST_ADDRESSES.valid[0]}/${TEST_ADDRESSES.valid[1]}/score`,
          `/addresses/${TEST_ADDRESSES.valid[0]}/transfers`,
          `/addresses/${TEST_ADDRESSES.valid[0]}/patterns`
        ];
        
        const startTime = Date.now();
        
        // Make all requests simultaneously
        for (const endpoint of endpoints) {
          promises.push(makeRequest(endpoint));
        }
        
        const results = await Promise.all(promises);
        const totalTime = Date.now() - startTime;
        
        const successCount = results.filter(r => r.status === 200).length;
        const failureCount = results.filter(r => r.status !== 200).length;
        
        return {
          status: successCount === endpoints.length ? 200 : 207,
          statusText: `${successCount}/${endpoints.length} requests successful`,
          data: {
            totalRequests: endpoints.length,
            successCount,
            failureCount,
            totalTime,
            averageTime: totalTime / endpoints.length
          },
          responseTime: totalTime
        };
      },
      expected: { status: 200 }
    }
  ],

  // Error Handling Tests
  errorHandling: [
    {
      name: 'GET /api/nonexistent - 404 handling',
      endpoint: '/nonexistent',
      method: 'GET',
      expected: { status: 404 }
    },
    {
      name: 'POST /api/addresses - Method not allowed',
      endpoint: '/addresses',
      method: 'POST',
      expected: { status: 404 }
    },
    {
      name: 'GET /api/addresses/../../etc/passwd - Path traversal attempt',
      endpoint: '/addresses/../../etc/passwd',
      method: 'GET',
      expected: { status: 400 }
    }
  ]
};

// Main test runner
async function runTests() {
  console.log(`${COLORS.CYAN}=== Polkadot Analysis Tool API Test Suite ===${COLORS.RESET}\n`);
  console.log(`API Base URL: ${API_BASE}`);
  console.log(`Test Started: ${new Date().toISOString()}\n`);
  
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    categories: {}
  };
  
  // Run tests by category
  for (const [category, categoryTests] of Object.entries(tests)) {
    console.log(`${COLORS.BLUE}--- ${category.toUpperCase()} TESTS ---${COLORS.RESET}\n`);
    
    results.categories[category] = {
      total: 0,
      passed: 0,
      failed: 0
    };
    
    for (const test of categoryTests) {
      results.total++;
      results.categories[category].total++;
      
      let result;
      
      if (test.custom) {
        // Custom test function
        result = await test.custom();
      } else {
        // Standard HTTP request test
        const options = {
          method: test.method || 'GET'
        };
        
        if (test.body) {
          options.body = JSON.stringify(test.body);
        }
        
        result = await makeRequest(test.endpoint, options);
      }
      
      const passed = logTestResult(test.name, result, test.expected);
      
      if (passed) {
        results.passed++;
        results.categories[category].passed++;
      } else {
        results.failed++;
        results.categories[category].failed++;
      }
      
      // Small delay between tests to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('');
  }
  
  // Print summary
  console.log(`${COLORS.CYAN}=== TEST SUMMARY ===${COLORS.RESET}\n`);
  
  for (const [category, stats] of Object.entries(results.categories)) {
    const color = stats.failed === 0 ? COLORS.GREEN : COLORS.RED;
    console.log(`${category}: ${color}${stats.passed}/${stats.total} passed${COLORS.RESET}`);
  }
  
  console.log('');
  
  const overallColor = results.failed === 0 ? COLORS.GREEN : COLORS.RED;
  console.log(`Total Tests: ${results.total}`);
  console.log(`${COLORS.GREEN}Passed: ${results.passed}${COLORS.RESET}`);
  console.log(`${COLORS.RED}Failed: ${results.failed}${COLORS.RESET}`);
  console.log(`${overallColor}Success Rate: ${((results.passed / results.total) * 100).toFixed(2)}%${COLORS.RESET}`);
  
  // Save results to file
  const reportData = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.total,
      passed: results.passed,
      failed: results.failed,
      successRate: ((results.passed / results.total) * 100).toFixed(2) + '%'
    },
    categories: results.categories,
    apiBase: API_BASE
  };
  
  await fs.writeFile(
    'api-test-results.json',
    JSON.stringify(reportData, null, 2)
  );
  
  console.log(`\nTest results saved to api-test-results.json`);
  console.log(`Test Completed: ${new Date().toISOString()}`);
}

// Run the tests
runTests().catch(console.error);