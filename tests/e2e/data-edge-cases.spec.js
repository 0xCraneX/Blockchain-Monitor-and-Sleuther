import { test, expect } from '@playwright/test';

test.describe('Data Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error('Browser error:', msg.text());
      }
    });
    page.on('pageerror', err => {
      console.error('Page error:', err.message);
    });
  });

  test('should handle decimal values in BigInt conversions', async ({ request }) => {
    // Test data with decimal values that caused the original error
    const testAddresses = [
      {
        address: 'test-decimal-1',
        volume: '2125631908873738.8', // Decimal that broke BigInt
      },
      {
        address: 'test-decimal-2', 
        volume: '999999999999999.999',
      },
      {
        address: 'test-scientific',
        volume: '1.23e15', // Scientific notation
      },
      {
        address: 'test-negative',
        volume: '-123456789.5',
      }
    ];

    // Test graph generation with problematic values
    for (const testCase of testAddresses) {
      const response = await request.post('/api/test/inject-edge', {
        data: {
          from: '13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk',
          to: testCase.address,
          volume: testCase.volume
        }
      }).catch(() => null);

      // Even if injection fails, graph generation should handle it
      const graphResponse = await request.get('/api/graph/13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk?depth=1');
      
      expect(graphResponse.ok()).toBeTruthy();
      const data = await graphResponse.json();
      
      // Should not have errors
      expect(data.error).toBeUndefined();
      expect(data.graph).toBeDefined();
    }
  });

  test('should handle extreme numeric values', async ({ page, request }) => {
    const extremeValues = [
      Number.MAX_SAFE_INTEGER.toString(),
      (Number.MAX_SAFE_INTEGER + 1).toString(), // Beyond safe integer
      '9007199254740992', // 2^53
      '18446744073709551615', // Max uint64
      '340282366920938463463374607431768211455', // Max uint128
      '0',
      '0.0',
      '1e-10', // Very small
      'NaN',
      'Infinity',
      'null',
      'undefined'
    ];

    for (const value of extremeValues) {
      // Test via API
      const response = await request.get(`/api/graph/test-address?minVolume=${value}`).catch(err => ({ 
        ok: () => false, 
        error: err.message 
      }));
      
      // Should either succeed or fail gracefully with proper error
      if (!response.ok()) {
        const body = await response.text().catch(() => '{}');
        expect(body).toMatch(/validation|invalid|error/i);
      }
    }
  });

  test('should validate address formats correctly', async ({ request }) => {
    const testAddresses = [
      // Valid Polkadot addresses
      '13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk',
      '15cfSaBcTxNr8rV59cbhdMNCRagFr3GE6B3zZRsCp4QHHKPu',
      
      // Invalid addresses
      '', // Empty
      '0x1234567890abcdef', // Ethereum format
      '13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaN', // Too short
      '13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNkk', // Too long
      'InvalidCharacters!@#$%', // Invalid characters
      '1'.repeat(100), // Very long
      '<script>alert("xss")</script>', // XSS attempt
      'null',
      'undefined'
    ];

    for (const address of testAddresses) {
      const response = await request.get(`/api/addresses/${encodeURIComponent(address)}`);
      
      if (address.match(/^[1-9A-HJ-NP-Za-km-z]{47,50}$/)) {
        // Valid addresses should work or return 404
        expect([200, 404]).toContain(response.status());
      } else {
        // Invalid addresses should return 400
        expect(response.status()).toBe(400);
      }
    }
  });

  test('should handle concurrent requests without race conditions', async ({ page }) => {
    await page.goto('/');
    
    // Make multiple concurrent WebSocket connections
    const results = await page.evaluate(async () => {
      const connections = [];
      const results = [];
      
      // Create 10 concurrent connections
      for (let i = 0; i < 10; i++) {
        const socket = io('/', {
          transports: ['websocket'],
          query: { clientId: i }
        });
        
        connections.push(socket);
        
        const promise = new Promise((resolve) => {
          let connected = false;
          
          socket.on('connect', () => {
            connected = true;
            socket.emit('graph:generate', {
              address: '13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk',
              options: { depth: 1 }
            });
          });
          
          socket.on('graph:data', (data) => {
            resolve({ 
              clientId: i, 
              connected: true, 
              nodes: data.graph.nodes.length,
              edges: data.graph.edges.length
            });
          });
          
          socket.on('error', (error) => {
            resolve({ 
              clientId: i, 
              connected: false, 
              error: error.message 
            });
          });
          
          setTimeout(() => {
            resolve({ 
              clientId: i, 
              connected, 
              timeout: true 
            });
          }, 5000);
        });
        
        results.push(promise);
      }
      
      // Wait for all connections
      const outcomes = await Promise.all(results);
      
      // Clean up
      connections.forEach(socket => socket.close());
      
      return outcomes;
    });
    
    // All connections should succeed
    const failures = results.filter(r => !r.connected);
    expect(failures).toHaveLength(0);
    
    // All should receive consistent data
    const nodeCounts = results.map(r => r.nodes).filter(n => n !== undefined);
    expect(new Set(nodeCounts).size).toBe(1); // All same node count
  });

  test('should handle malformed requests gracefully', async ({ request }) => {
    const malformedRequests = [
      { url: '/api/graph/', method: 'GET' }, // Trailing slash
      { url: '/api/graph/address?depth=abc', method: 'GET' }, // Invalid depth
      { url: '/api/graph/address?depth=-1', method: 'GET' }, // Negative depth
      { url: '/api/graph/address?depth=100', method: 'GET' }, // Too deep
      { url: '/api/graph/address?maxNodes=abc', method: 'GET' }, // Invalid number
      { url: '/api/graph/address?direction=invalid', method: 'GET' }, // Invalid enum
      { 
        url: '/api/graph/address', 
        method: 'POST',
        data: { invalid: 'body' }
      },
      {
        url: '/api/graph/address',
        method: 'GET',
        headers: { 'Content-Type': 'invalid/type' }
      }
    ];

    for (const req of malformedRequests) {
      const response = await request[req.method.toLowerCase()](req.url, {
        data: req.data,
        headers: req.headers,
        failOnStatusCode: false
      });
      
      // Should return 4xx error, not 5xx
      expect(response.status()).toBeGreaterThanOrEqual(400);
      expect(response.status()).toBeLessThan(500);
      
      // Should return proper error format
      const body = await response.text();
      expect(body).toBeTruthy();
      
      // Should not expose internal errors
      expect(body).not.toMatch(/stack|trace|internal/i);
    }
  });
});