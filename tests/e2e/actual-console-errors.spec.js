import { test, expect } from '@playwright/test';

test.describe('Actual Console Error Detection', () => {
  test('should catch the exact console errors you showed me', async ({ page }) => {
    const consoleErrors = [];
    const networkErrors = [];
    
    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push({
          text: msg.text(),
          location: msg.location()
        });
      }
    });
    
    // Capture failed network requests
    page.on('requestfailed', request => {
      networkErrors.push({
        url: request.url(),
        failure: request.failure()
      });
    });
    
    // Capture 404s
    page.on('response', response => {
      if (response.status() === 404) {
        networkErrors.push({
          url: response.url(),
          status: 404
        });
      }
    });
    
    // Navigate with specific address
    await page.goto('/?address=13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk');
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Check for specific errors that were in the console
    
    // 1. Invalid graph data format error
    const graphErrors = consoleErrors.filter(e => 
      e.text.includes('Invalid graph data format')
    );
    expect(graphErrors.length, 'Graph data format errors should not occur').toBe(0);
    
    // 2. 404 errors
    const notFoundErrors = networkErrors.filter(e => 
      e.status === 404
    );
    
    // Check specific 404s
    const investigationsError = notFoundErrors.find(e => 
      e.url.includes('/api/investigations')
    );
    expect(investigationsError, '/api/investigations should exist').toBeUndefined();
    
    const faviconError = notFoundErrors.find(e => 
      e.url.includes('favicon.ico')
    );
    expect(faviconError, 'favicon.ico should exist').toBeUndefined();
    
    // 3. WebSocket errors
    const wsErrors = consoleErrors.filter(e => 
      e.text.includes('WebSocket') || e.text.includes('socket.io')
    );
    expect(wsErrors.length, 'No WebSocket errors should occur').toBe(0);
    
    // 4. CSP violations
    const cspErrors = consoleErrors.filter(e => 
      e.text.includes('Content Security Policy')
    );
    // The warning about upgrade-insecure-requests is acceptable
    const criticalCspErrors = cspErrors.filter(e => 
      !e.text.includes('upgrade-insecure-requests')
    );
    expect(criticalCspErrors.length, 'No critical CSP violations').toBe(0);
    
    // Overall check
    console.log('Console errors found:', consoleErrors.map(e => e.text));
    console.log('Network errors found:', networkErrors);
    
    // The page should still function despite warnings
    await expect(page.locator('h1')).toContainText('Polkadot Analysis Tool');
    await expect(page.locator('#network-graph')).toBeVisible();
  });

  test('should verify graph data loads correctly', async ({ page, request }) => {
    // Test the API directly
    const response = await request.get('/api/graph/13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk?depth=1');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    
    // API should return the correct structure
    expect(data).toHaveProperty('nodes');
    expect(data).toHaveProperty('edges'); // API returns edges
    expect(data).toHaveProperty('metadata');
    
    // Frontend should handle the conversion
    await page.goto('/?address=13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk');
    
    // Wait for graph to load
    await page.waitForFunction(() => {
      const svg = document.querySelector('#network-graph');
      return svg && svg.querySelectorAll('circle').length > 0;
    }, { timeout: 10000 });
    
    // Check that nodes are rendered
    const nodeCount = await page.locator('#network-graph circle').count();
    expect(nodeCount).toBeGreaterThan(0);
    
    // Check that edges/links are rendered
    const edgeCount = await page.locator('#network-graph line').count();
    expect(edgeCount).toBeGreaterThan(0);
  });

  test('should handle all required API endpoints', async ({ request }) => {
    const endpoints = [
      { path: '/api', expectedStatus: 200 },
      { path: '/api/investigations', expectedStatus: 200 },
      { path: '/api/addresses/13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk', expectedStatus: 200 },
      { path: '/api/graph/13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk', expectedStatus: 200 },
      { path: '/favicon.ico', expectedStatus: 200 }
    ];
    
    for (const endpoint of endpoints) {
      const response = await request.get(endpoint.path);
      expect(response.status(), `${endpoint.path} should return ${endpoint.expectedStatus}`).toBe(endpoint.expectedStatus);
    }
  });
});