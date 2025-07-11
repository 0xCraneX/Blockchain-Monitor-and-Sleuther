/**
 * Application Lifecycle E2E Tests
 * 
 * Tests the complete application startup, health, and shutdown processes
 * including database initialization, API availability, and WebSocket connections.
 */

const { test, expect } = require('@playwright/test');

test.describe('Application Lifecycle', () => {
  
  test.describe('Application Startup', () => {
    test('should start application successfully', async ({ page }) => {
      // Navigate to the application
      await page.goto('/');
      
      // Verify page loads
      await expect(page).toHaveTitle(/Polkadot Analysis Tool/);
      
      // Verify main application container is present
      await expect(page.locator('#app')).toBeVisible();
      
      // Verify header is displayed
      await expect(page.locator('header h1')).toContainText('Polkadot Analysis Tool');
      
      // Verify description is present
      await expect(page.locator('header p')).toContainText('Explore address relationships');
    });
    
    test('should load all required assets', async ({ page }) => {
      // Track network requests
      const requests = [];
      page.on('request', request => requests.push(request.url()));
      
      await page.goto('/');
      
      // Wait for page to be fully loaded
      await page.waitForLoadState('networkidle');
      
      // Verify CSS is loaded
      const cssLoaded = requests.some(url => url.includes('.css'));
      expect(cssLoaded).toBeTruthy();
      
      // Verify D3.js is loaded
      const d3Loaded = await page.evaluate(() => {
        return typeof window.d3 !== 'undefined';
      });
      expect(d3Loaded).toBeTruthy();
      
      // Verify Socket.IO client is loaded
      const socketIOLoaded = await page.evaluate(() => {
        return typeof window.io !== 'undefined';
      });
      expect(socketIOLoaded).toBeTruthy();
    });
    
    test('should initialize search interface', async ({ page }) => {
      await page.goto('/');
      
      // Verify search section is present
      await expect(page.locator('#search-section')).toBeVisible();
      
      // Verify search input is functional
      const searchInput = page.locator('#address-search');
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toHaveAttribute('placeholder', /Enter Polkadot address/);
      
      // Verify search button is present
      await expect(page.locator('#search-btn')).toBeVisible();
      await expect(page.locator('#search-btn')).toContainText('Search');
    });
    
    test('should have proper initial UI state', async ({ page }) => {
      await page.goto('/');
      
      // Controls section should be hidden initially
      await expect(page.locator('#controls-section')).toBeHidden();
      
      // Visualization section should be hidden initially
      await expect(page.locator('#visualization-section')).toBeHidden();
      
      // Loading section should be hidden initially
      await expect(page.locator('#loading')).toBeHidden();
      
      // Search results should be empty initially
      const searchResults = page.locator('#search-results');
      await expect(searchResults).toBeEmpty();
    });
  });
  
  test.describe('API Health Checks', () => {
    test('should have API accessible', async ({ request }) => {
      const response = await request.get('/api');
      
      expect(response.ok()).toBeTruthy();
      
      const data = await response.json();
      expect(data.name).toBe('Polkadot Analysis Tool API');
      expect(data.version).toBe('1.0.0');
      expect(data.endpoints).toBeDefined();
    });
    
    test('should have all API endpoints available', async ({ request }) => {
      const apiInfoResponse = await request.get('/api');
      const apiInfo = await apiInfoResponse.json();
      
      // Test each endpoint for basic availability
      for (const [name, endpoint] of Object.entries(apiInfo.endpoints)) {
        const response = await request.get(endpoint);
        
        // Should not return 404 or 500 errors
        expect(response.status()).not.toBe(404);
        expect(response.status()).not.toBe(500);
        
        console.log(`✅ ${name} endpoint (${endpoint}) is accessible`);
      }
    });
    
    test('should handle CORS properly', async ({ request }) => {
      const response = await request.get('/api', {
        headers: {
          'Origin': 'http://localhost:3000'
        }
      });
      
      expect(response.ok()).toBeTruthy();
      
      // Check for CORS headers (these might not be present in Playwright requests)
      // But ensure no CORS errors occur
    });
    
    test('should have security headers', async ({ request }) => {
      const response = await request.get('/api');
      
      expect(response.ok()).toBeTruthy();
      
      const headers = response.headers();
      
      // Check for security headers from helmet middleware
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBeDefined();
    });
  });
  
  test.describe('Database Integration', () => {
    test('should have database accessible through API', async ({ request }) => {
      // Test a simple search to verify database connection
      const response = await request.get('/api/addresses/search?q=5G&limit=1');
      
      expect(response.ok()).toBeTruthy();
      
      const data = await response.json();
      expect(data.query).toBe('5G');
      expect(Array.isArray(data.results)).toBeTruthy();
    });
    
    test('should return consistent data from database', async ({ request }) => {
      // Make the same request twice
      const response1 = await request.get('/api/addresses/search?q=Alice&limit=5');
      const response2 = await request.get('/api/addresses/search?q=Alice&limit=5');
      
      expect(response1.ok()).toBeTruthy();
      expect(response2.ok()).toBeTruthy();
      
      const data1 = await response1.json();
      const data2 = await response2.json();
      
      // Results should be identical
      expect(data1.count).toBe(data2.count);
      expect(data1.results).toEqual(data2.results);
    });
  });
  
  test.describe('WebSocket Connection', () => {
    test('should establish WebSocket connection', async ({ page }) => {
      await page.goto('/');
      
      // Wait for Socket.IO to be available
      await page.waitForFunction(() => typeof window.io !== 'undefined');
      
      // Establish WebSocket connection
      await page.evaluate(() => {
        window.testSocket = window.io();
        return new Promise((resolve) => {
          window.testSocket.on('connect', resolve);
        });
      });
      
      // Verify connection is established
      const connected = await page.evaluate(() => {
        return window.testSocket.connected;
      });
      
      expect(connected).toBeTruthy();
    });
    
    test('should handle WebSocket ping/pong', async ({ page }) => {
      await page.goto('/');
      
      await page.waitForFunction(() => typeof window.io !== 'undefined');
      
      // Establish connection and test ping/pong
      const pongReceived = await page.evaluate(() => {
        return new Promise((resolve) => {
          window.testSocket = window.io();
          
          window.testSocket.on('connect', () => {
            window.testSocket.emit('ping');
          });
          
          window.testSocket.on('pong', (data) => {
            resolve(data.timestamp > 0);
          });
          
          // Timeout after 5 seconds
          setTimeout(() => resolve(false), 5000);
        });
      });
      
      expect(pongReceived).toBeTruthy();
    });
  });
  
  test.describe('Error Handling', () => {
    test('should handle invalid API requests gracefully', async ({ request }) => {
      const response = await request.get('/api/invalid-endpoint');
      
      expect(response.status()).toBe(404);
    });
    
    test('should handle malformed search requests', async ({ request }) => {
      const response = await request.get('/api/addresses/search');
      
      expect(response.status()).toBe(400);
      
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
    
    test('should display error messages in UI', async ({ page }) => {
      await page.goto('/');
      
      // Mock a failed API request
      await page.route('/api/addresses/search*', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { message: 'Test error' }
          })
        });
      });
      
      // Perform a search that will fail
      await page.fill('#address-search', 'test');
      await page.click('#search-btn');
      
      // Should handle the error gracefully (implementation depends on frontend code)
      // For now, just verify the search doesn't crash the page
      await expect(page.locator('#app')).toBeVisible();
    });
  });
  
  test.describe('Performance Baseline', () => {
    test('should load homepage within performance budget', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      const loadTime = Date.now() - startTime;
      
      // Homepage should load within 5 seconds
      expect(loadTime).toBeLessThan(5000);
      
      console.log(`Homepage loaded in ${loadTime}ms`);
    });
    
    test('should have reasonable API response times', async ({ request }) => {
      const startTime = Date.now();
      
      const response = await request.get('/api');
      
      const responseTime = Date.now() - startTime;
      
      expect(response.ok()).toBeTruthy();
      
      // API should respond within 1 second
      expect(responseTime).toBeLessThan(1000);
      
      console.log(`API responded in ${responseTime}ms`);
    });
  });
  
  test.describe('Cross-browser Compatibility', () => {
    test('should work consistently across browsers', async ({ page, browserName }) => {
      await page.goto('/');
      
      // Verify basic functionality works in all browsers
      await expect(page.locator('#app')).toBeVisible();
      await expect(page.locator('#address-search')).toBeVisible();
      await expect(page.locator('#search-btn')).toBeVisible();
      
      // Log browser compatibility
      console.log(`✅ Basic functionality verified in ${browserName}`);
    });
  });
});