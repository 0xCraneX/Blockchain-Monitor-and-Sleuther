/**
 * Simple Frontend Test Runner for Polkadot Analysis Tool
 * Tests basic functionality without external dependencies
 */

import { spawn } from 'child_process';
import fs from 'fs';

const TEST_RESULTS = {
  passed: [],
  failed: [],
  warnings: []
};

// Test 1: Check if server is responding
async function testServerResponse() {
  console.log('\n1. Testing Server Response...');
  try {
    const response = await fetch('http://localhost:3000/');
    if (response.ok) {
      const html = await response.text();
      if (html.includes('Polkadot Analysis Tool')) {
        TEST_RESULTS.passed.push('Server is running and serving HTML');
        console.log('✓ Server is responding correctly');
      } else {
        TEST_RESULTS.failed.push('Server returned unexpected HTML');
        console.log('✗ Server returned unexpected HTML');
      }
    } else {
      TEST_RESULTS.failed.push(`Server returned status ${response.status}`);
      console.log(`✗ Server returned status ${response.status}`);
    }
  } catch (error) {
    TEST_RESULTS.failed.push(`Server not reachable: ${error.message}`);
    console.log(`✗ Server not reachable: ${error.message}`);
  }
}

// Test 2: Check static assets
async function testStaticAssets() {
  console.log('\n2. Testing Static Assets...');
  const assets = [
    '/css/style.css',
    '/js/client.js',
    '/js/address-validator.js',
    '/js/search.js'
  ];
  
  for (const asset of assets) {
    try {
      const response = await fetch(`http://localhost:3000${asset}`);
      if (response.ok) {
        TEST_RESULTS.passed.push(`Static asset ${asset} loaded`);
        console.log(`✓ ${asset} - OK`);
      } else {
        TEST_RESULTS.failed.push(`Static asset ${asset} returned ${response.status}`);
        console.log(`✗ ${asset} - Status ${response.status}`);
      }
    } catch (error) {
      TEST_RESULTS.failed.push(`Static asset ${asset} failed: ${error.message}`);
      console.log(`✗ ${asset} - Error: ${error.message}`);
    }
  }
}

// Test 3: Check API endpoints
async function testAPIEndpoints() {
  console.log('\n3. Testing API Endpoints...');
  const endpoints = [
    { path: '/api/addresses', name: 'Addresses API' },
    { path: '/api/graph', name: 'Graph API' },
    { path: '/api/stats', name: 'Stats API' },
    { path: '/api/relationships', name: 'Relationships API' }
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`http://localhost:3000${endpoint.path}`);
      if (response.status < 500) {
        TEST_RESULTS.passed.push(`${endpoint.name} accessible`);
        console.log(`✓ ${endpoint.name} - Status ${response.status}`);
      } else {
        TEST_RESULTS.failed.push(`${endpoint.name} server error ${response.status}`);
        console.log(`✗ ${endpoint.name} - Server Error ${response.status}`);
      }
    } catch (error) {
      TEST_RESULTS.failed.push(`${endpoint.name} failed: ${error.message}`);
      console.log(`✗ ${endpoint.name} - Error: ${error.message}`);
    }
  }
}

// Test 4: Test address search functionality
async function testAddressSearch() {
  console.log('\n4. Testing Address Search...');
  const testAddress = '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5';
  
  try {
    const response = await fetch(`http://localhost:3000/api/addresses/search?q=${testAddress}&limit=1`);
    if (response.ok) {
      const data = await response.json();
      if (data.results && Array.isArray(data.results)) {
        TEST_RESULTS.passed.push('Address search API working');
        console.log('✓ Address search API returns valid format');
      } else {
        TEST_RESULTS.failed.push('Address search API invalid response format');
        console.log('✗ Address search API invalid response format');
      }
    } else {
      TEST_RESULTS.failed.push(`Address search returned ${response.status}`);
      console.log(`✗ Address search returned ${response.status}`);
    }
  } catch (error) {
    TEST_RESULTS.failed.push(`Address search failed: ${error.message}`);
    console.log(`✗ Address search failed: ${error.message}`);
  }
}

// Test 5: Check CORS headers
async function testCORS() {
  console.log('\n5. Testing CORS Configuration...');
  try {
    const response = await fetch('http://localhost:3000/api/addresses', {
      headers: { 'Origin': 'http://example.com' }
    });
    
    const corsHeader = response.headers.get('access-control-allow-origin');
    if (corsHeader) {
      TEST_RESULTS.passed.push('CORS headers present');
      console.log(`✓ CORS headers present: ${corsHeader}`);
    } else {
      TEST_RESULTS.warnings.push('CORS headers not found');
      console.log('⚠ CORS headers not found');
    }
  } catch (error) {
    TEST_RESULTS.failed.push(`CORS test failed: ${error.message}`);
    console.log(`✗ CORS test failed: ${error.message}`);
  }
}

// Test 6: Check WebSocket support
async function testWebSocket() {
  console.log('\n6. Testing WebSocket Support...');
  try {
    const response = await fetch('http://localhost:3000/socket.io/');
    if (response.status === 200 || response.status === 400) {
      TEST_RESULTS.passed.push('Socket.IO endpoint exists');
      console.log('✓ Socket.IO endpoint accessible');
    } else {
      TEST_RESULTS.warnings.push('Socket.IO might not be configured');
      console.log('⚠ Socket.IO endpoint returned unexpected status');
    }
  } catch (error) {
    TEST_RESULTS.warnings.push(`WebSocket test inconclusive: ${error.message}`);
    console.log(`⚠ WebSocket test inconclusive: ${error.message}`);
  }
}

// Test 7: Check error handling
async function testErrorHandling() {
  console.log('\n7. Testing Error Handling...');
  
  // Test non-existent endpoint
  try {
    const response = await fetch('http://localhost:3000/api/nonexistent');
    if (response.status === 404) {
      TEST_RESULTS.passed.push('404 error handling works');
      console.log('✓ 404 error handling works correctly');
    } else {
      TEST_RESULTS.warnings.push(`Non-existent endpoint returned ${response.status}`);
      console.log(`⚠ Non-existent endpoint returned ${response.status}`);
    }
  } catch (error) {
    TEST_RESULTS.failed.push(`Error handling test failed: ${error.message}`);
    console.log(`✗ Error handling test failed: ${error.message}`);
  }
  
  // Test invalid address
  try {
    const response = await fetch('http://localhost:3000/api/addresses/invalid_address');
    if (response.status === 400 || response.status === 404) {
      TEST_RESULTS.passed.push('Invalid address handling works');
      console.log('✓ Invalid address returns appropriate error');
    } else {
      TEST_RESULTS.warnings.push(`Invalid address returned ${response.status}`);
      console.log(`⚠ Invalid address returned ${response.status}`);
    }
  } catch (error) {
    TEST_RESULTS.failed.push(`Invalid address test failed: ${error.message}`);
    console.log(`✗ Invalid address test failed: ${error.message}`);
  }
}

// Test 8: Performance check
async function testPerformance() {
  console.log('\n8. Testing Performance...');
  const endpoints = [
    '/api/addresses',
    '/api/stats',
    '/'
  ];
  
  for (const endpoint of endpoints) {
    const start = Date.now();
    try {
      const response = await fetch(`http://localhost:3000${endpoint}`);
      const duration = Date.now() - start;
      
      if (duration < 1000) {
        TEST_RESULTS.passed.push(`${endpoint} responds quickly (${duration}ms)`);
        console.log(`✓ ${endpoint} - ${duration}ms`);
      } else if (duration < 3000) {
        TEST_RESULTS.warnings.push(`${endpoint} slow response (${duration}ms)`);
        console.log(`⚠ ${endpoint} - ${duration}ms (slow)`);
      } else {
        TEST_RESULTS.failed.push(`${endpoint} very slow (${duration}ms)`);
        console.log(`✗ ${endpoint} - ${duration}ms (too slow)`);
      }
    } catch (error) {
      TEST_RESULTS.failed.push(`${endpoint} performance test failed`);
      console.log(`✗ ${endpoint} - Failed`);
    }
  }
}

// Generate report
function generateReport() {
  console.log('\n========== TEST REPORT ==========');
  console.log(`Total tests run: ${TEST_RESULTS.passed.length + TEST_RESULTS.failed.length + TEST_RESULTS.warnings.length}`);
  console.log(`Passed: ${TEST_RESULTS.passed.length} ✓`);
  console.log(`Failed: ${TEST_RESULTS.failed.length} ✗`);
  console.log(`Warnings: ${TEST_RESULTS.warnings.length} ⚠`);
  
  const passRate = TEST_RESULTS.passed.length / (TEST_RESULTS.passed.length + TEST_RESULTS.failed.length) * 100;
  console.log(`Pass rate: ${passRate.toFixed(1)}%`);
  
  if (TEST_RESULTS.failed.length > 0) {
    console.log('\nFailed tests:');
    TEST_RESULTS.failed.forEach(test => console.log(`  ✗ ${test}`));
  }
  
  if (TEST_RESULTS.warnings.length > 0) {
    console.log('\nWarnings:');
    TEST_RESULTS.warnings.forEach(warning => console.log(`  ⚠ ${warning}`));
  }
  
  console.log('=================================\n');
  
  // Write report to file
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: TEST_RESULTS.passed.length + TEST_RESULTS.failed.length + TEST_RESULTS.warnings.length,
      passed: TEST_RESULTS.passed.length,
      failed: TEST_RESULTS.failed.length,
      warnings: TEST_RESULTS.warnings.length,
      passRate: passRate.toFixed(1) + '%'
    },
    results: TEST_RESULTS
  };
  
  fs.writeFileSync('tests/frontend/test-report.json', JSON.stringify(report, null, 2));
  console.log('Report saved to: tests/frontend/test-report.json');
  
  return TEST_RESULTS.failed.length === 0;
}

// Main test runner
async function runAllTests() {
  console.log('Starting Frontend Test Suite...');
  console.log('Server URL: http://localhost:3000');
  console.log('================================\n');
  
  try {
    await testServerResponse();
    await testStaticAssets();
    await testAPIEndpoints();
    await testAddressSearch();
    await testCORS();
    await testWebSocket();
    await testErrorHandling();
    await testPerformance();
    
    const success = generateReport();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Test runner error:', error);
    process.exit(1);
  }
}

// Run tests
runAllTests();