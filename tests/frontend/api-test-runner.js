/**
 * API Test Runner for Polkadot Analysis Tool
 * Tests all API endpoints and WebSocket functionality
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

class APITestRunner {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.results = {
      passed: [],
      failed: [],
      errors: []
    };
  }

  // Helper to make HTTP requests
  async makeRequest(path, options = {}) {
    const url = new URL(path, this.baseUrl);
    const protocol = url.protocol === 'https:' ? https : http;
    
    return new Promise((resolve, reject) => {
      const req = protocol.request(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ status: res.statusCode, data: json, headers: res.headers });
          } catch (e) {
            resolve({ status: res.statusCode, data: data, headers: res.headers });
          }
        });
      });
      
      req.on('error', reject);
      
      if (options.body) {
        req.write(JSON.stringify(options.body));
      }
      
      req.end();
    });
  }

  // Run a test
  async runTest(testName, testFn) {
    console.log(`Running: ${testName}`);
    try {
      await testFn();
      this.results.passed.push(testName);
      console.log(`✓ ${testName}`);
    } catch (error) {
      this.results.failed.push({ test: testName, error: error.message });
      console.error(`✗ ${testName}: ${error.message}`);
    }
  }

  // Test 1: Server health check
  async testServerHealth() {
    await this.runTest('Server Health Check', async () => {
      try {
        const response = await this.makeRequest('/');
        if (response.status !== 200) {
          throw new Error(`Server returned status ${response.status}`);
        }
      } catch (error) {
        throw new Error(`Server not reachable: ${error.message}`);
      }
    });
  }

  // Test 2: API base endpoints
  async testAPIEndpoints() {
    await this.runTest('API Base Endpoints', async () => {
      const endpoints = [
        { path: '/api/addresses', method: 'GET' },
        { path: '/api/graph', method: 'GET' },
        { path: '/api/relationships', method: 'GET' },
        { path: '/api/stats', method: 'GET' }
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await this.makeRequest(endpoint.path, { method: endpoint.method });
          if (response.status >= 500) {
            throw new Error(`${endpoint.path} returned server error ${response.status}`);
          }
        } catch (error) {
          console.warn(`Warning: ${endpoint.path} - ${error.message}`);
        }
      }
    });
  }

  // Test 3: Address search
  async testAddressSearch() {
    await this.runTest('Address Search API', async () => {
      const testAddress = '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5';
      
      // Test search endpoint
      const searchResponse = await this.makeRequest(`/api/addresses/search?q=${testAddress}&limit=1`);
      if (searchResponse.status !== 200) {
        throw new Error(`Search returned status ${searchResponse.status}`);
      }
      
      if (!searchResponse.data.results || !Array.isArray(searchResponse.data.results)) {
        throw new Error('Search response missing results array');
      }
    });
  }

  // Test 4: Address validation
  async testAddressValidation() {
    await this.runTest('Address Validation', async () => {
      // Test with invalid address
      const invalidAddress = 'invalid_address_12345';
      const response = await this.makeRequest(`/api/addresses/${invalidAddress}`);
      
      // Should return 400 or 404 for invalid address
      if (response.status !== 400 && response.status !== 404) {
        console.warn(`Invalid address returned status ${response.status}`);
      }
    });
  }

  // Test 5: Graph data retrieval
  async testGraphData() {
    await this.runTest('Graph Data API', async () => {
      const testAddress = '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5';
      
      // Test relationships endpoint
      const response = await this.makeRequest(`/api/addresses/${testAddress}/relationships?limit=10`);
      
      if (response.status === 200) {
        if (!response.data.relationships || !Array.isArray(response.data.relationships)) {
          throw new Error('Invalid relationships response format');
        }
      } else if (response.status !== 404) {
        throw new Error(`Unexpected status ${response.status}`);
      }
    });
  }

  // Test 6: Rate limiting
  async testRateLimiting() {
    await this.runTest('Rate Limiting', async () => {
      const requests = [];
      
      // Make multiple rapid requests
      for (let i = 0; i < 20; i++) {
        requests.push(this.makeRequest('/api/addresses'));
      }
      
      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.status === 429);
      
      if (!rateLimited) {
        console.warn('Rate limiting might not be properly configured');
      }
    });
  }

  // Test 7: CORS headers
  async testCORSHeaders() {
    await this.runTest('CORS Headers', async () => {
      const response = await this.makeRequest('/api/addresses', {
        headers: { 'Origin': 'http://example.com' }
      });
      
      const corsHeaders = response.headers['access-control-allow-origin'];
      if (!corsHeaders) {
        console.warn('CORS headers not found in response');
      }
    });
  }

  // Test 8: Error handling
  async testErrorHandling() {
    await this.runTest('API Error Handling', async () => {
      // Test non-existent endpoint
      const response = await this.makeRequest('/api/nonexistent');
      
      if (response.status !== 404) {
        throw new Error(`Non-existent endpoint returned ${response.status}`);
      }
      
      // Check for proper error format
      if (response.data && typeof response.data === 'object') {
        if (!response.data.error && !response.data.message) {
          console.warn('Error response missing standard error field');
        }
      }
    });
  }

  // Test 9: Response times
  async testResponseTimes() {
    await this.runTest('Response Time Check', async () => {
      const endpoints = [
        '/api/addresses',
        '/api/stats',
        '/api/graph'
      ];
      
      for (const endpoint of endpoints) {
        const start = Date.now();
        await this.makeRequest(endpoint);
        const duration = Date.now() - start;
        
        console.log(`  ${endpoint}: ${duration}ms`);
        
        if (duration > 5000) {
          throw new Error(`${endpoint} took too long (${duration}ms)`);
        }
      }
    });
  }

  // Test 10: Static file serving
  async testStaticFiles() {
    await this.runTest('Static File Serving', async () => {
      const files = [
        '/index.html',
        '/css/style.css',
        '/js/client.js',
        '/js/address-validator.js'
      ];
      
      for (const file of files) {
        try {
          const response = await this.makeRequest(file);
          if (response.status !== 200) {
            throw new Error(`${file} returned status ${response.status}`);
          }
        } catch (error) {
          console.warn(`Static file ${file}: ${error.message}`);
        }
      }
    });
  }

  // Generate report
  generateReport() {
    const total = this.results.passed.length + this.results.failed.length;
    const passRate = total > 0 ? (this.results.passed.length / total * 100).toFixed(1) : 0;

    console.log('\n========== API TEST REPORT ==========');
    console.log(`Base URL: ${this.baseUrl}`);
    console.log(`Total tests: ${total}`);
    console.log(`Passed: ${this.results.passed.length} ✓`);
    console.log(`Failed: ${this.results.failed.length} ✗`);
    console.log(`Pass rate: ${passRate}%`);

    if (this.results.failed.length > 0) {
      console.log('\nFailed tests:');
      this.results.failed.forEach(({ test, error }) => {
        console.log(`  ✗ ${test}: ${error}`);
      });
    }

    console.log('=====================================\n');

    return {
      success: this.results.failed.length === 0,
      total,
      passed: this.results.passed.length,
      failed: this.results.failed.length,
      passRate
    };
  }

  // Run all tests
  async runAllTests() {
    console.log('Starting API test suite...\n');
    
    // Basic connectivity
    await this.testServerHealth();
    
    // API functionality
    await this.testAPIEndpoints();
    await this.testAddressSearch();
    await this.testAddressValidation();
    await this.testGraphData();
    
    // Security and performance
    await this.testRateLimiting();
    await this.testCORSHeaders();
    await this.testErrorHandling();
    
    // Performance
    await this.testResponseTimes();
    
    // Static assets
    await this.testStaticFiles();
    
    return this.generateReport();
  }
}

// Export for use
export default APITestRunner;

// Run if executed directly
const runner = new APITestRunner();
runner.runAllTests().then(report => {
  process.exit(report.success ? 0 : 1);
}).catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});