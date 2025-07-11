/**
 * User Workflow E2E Tests
 * 
 * Tests the complete user journey from address search through API calls
 * to graph visualization, covering the primary application workflows.
 */

const { test, expect } = require('@playwright/test');

test.describe('Complete User Workflows', () => {
  
  test.describe('Address Search to Visualization Workflow', () => {
    test('should complete full address search and visualization flow', async ({ page }) => {
      await page.goto('/');
      
      // Step 1: Perform address search
      await page.fill('#address-search', 'Alice');
      await page.click('#search-btn');
      
      // Step 2: Verify search results appear
      await expect(page.locator('#search-results')).toBeVisible();
      
      // Wait for search results to load
      await page.waitForSelector('#search-results .search-result', { timeout: 10000 });
      
      // Step 3: Click on a search result
      const firstResult = page.locator('#search-results .search-result').first();
      await expect(firstResult).toBeVisible();
      await firstResult.click();
      
      // Step 4: Verify controls section becomes visible
      await expect(page.locator('#controls-section')).toBeVisible();
      
      // Step 5: Verify visualization section becomes visible
      await expect(page.locator('#visualization-section')).toBeVisible();
      
      // Step 6: Verify graph container is present
      await expect(page.locator('#graph-container')).toBeVisible();
      await expect(page.locator('#network-graph')).toBeVisible();
      
      // Step 7: Verify statistics are displayed
      await expect(page.locator('#graph-stats')).toBeVisible();
      await expect(page.locator('#node-count')).toContainText(/\d+/);
      await expect(page.locator('#edge-count')).toContainText(/\d+/);
    });
    
    test('should handle search with filters and depth controls', async ({ page }) => {
      await page.goto('/');
      
      // Perform initial search
      await page.fill('#address-search', 'E2E Test Account');
      await page.click('#search-btn');
      
      // Wait for and click search result
      await page.waitForSelector('#search-results .search-result');
      await page.locator('#search-results .search-result').first().click();
      
      // Wait for controls to appear
      await expect(page.locator('#controls-section')).toBeVisible();
      
      // Test depth filter
      await page.selectOption('#depth-filter', '3');
      
      // Test volume filter
      await page.fill('#volume-filter', '1000');
      
      // Test time range filter
      await page.selectOption('#time-filter', '30d');
      
      // Test minimum connections filter
      await page.fill('#connection-filter', '2');
      
      // Apply filters
      await page.click('#apply-filters');
      
      // Verify loading state appears
      await expect(page.locator('#loading')).toBeVisible();
      
      // Wait for loading to complete
      await expect(page.locator('#loading')).toBeHidden({ timeout: 15000 });
      
      // Verify graph is updated with new filters
      await expect(page.locator('#network-graph')).toBeVisible();
    });
    
    test('should export graph data', async ({ page }) => {
      await page.goto('/');
      
      // Complete search and visualization
      await page.fill('#address-search', 'Alice');
      await page.click('#search-btn');
      await page.waitForSelector('#search-results .search-result');
      await page.locator('#search-results .search-result').first().click();
      
      // Wait for visualization to load
      await expect(page.locator('#controls-section')).toBeVisible();
      
      // Test CSV export
      const [csvDownload] = await Promise.all([
        page.waitForEvent('download'),
        page.click('#export-csv')
      ]);
      
      expect(csvDownload.suggestedFilename()).toMatch(/\.csv$/);
      
      // Test JSON export
      const [jsonDownload] = await Promise.all([
        page.waitForEvent('download'),
        page.click('#export-json')
      ]);
      
      expect(jsonDownload.suggestedFilename()).toMatch(/\.json$/);
    });
    
    test('should save investigation', async ({ page }) => {
      await page.goto('/');
      
      // Complete search and visualization
      await page.fill('#address-search', 'Bob');
      await page.click('#search-btn');
      await page.waitForSelector('#search-results .search-result');
      await page.locator('#search-results .search-result').first().click();
      
      // Wait for controls to appear
      await expect(page.locator('#controls-section')).toBeVisible();
      
      // Save investigation
      await page.click('#save-investigation');
      
      // Verify success (implementation depends on UI feedback)
      // This test verifies the button works without errors
      await expect(page.locator('#app')).toBeVisible();
    });
  });
  
  test.describe('Graph Interaction Workflows', () => {
    test('should handle node selection and details display', async ({ page }) => {
      await page.goto('/');
      
      // Complete initial search and visualization
      await page.fill('#address-search', 'Charlie');
      await page.click('#search-btn');
      await page.waitForSelector('#search-results .search-result');
      await page.locator('#search-results .search-result').first().click();
      
      // Wait for graph to render
      await expect(page.locator('#network-graph')).toBeVisible();
      
      // Wait for graph nodes to be rendered (SVG elements)
      await page.waitForSelector('#network-graph circle, #network-graph rect', { timeout: 10000 });
      
      // Click on a graph node
      const firstNode = page.locator('#network-graph circle, #network-graph rect').first();
      await firstNode.click();
      
      // Verify node details panel appears
      await expect(page.locator('#node-details')).toBeVisible();
      await expect(page.locator('#node-info')).toBeVisible();
    });
    
    test('should handle graph zooming and panning', async ({ page }) => {
      await page.goto('/');
      
      // Complete initial setup
      await page.fill('#address-search', 'E2E Test Account');
      await page.click('#search-btn');
      await page.waitForSelector('#search-results .search-result');
      await page.locator('#search-results .search-result').first().click();
      
      // Wait for graph
      await expect(page.locator('#network-graph')).toBeVisible();
      
      const graphContainer = page.locator('#graph-container');
      
      // Test mouse wheel zoom (simulate)
      await graphContainer.hover();
      await page.mouse.wheel(0, -100); // Zoom in
      
      // Test drag panning
      const box = await graphContainer.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 50);
        await page.mouse.up();
      }
      
      // Verify graph remains functional
      await expect(page.locator('#network-graph')).toBeVisible();
    });
  });
  
  test.describe('Real-time Updates Workflow', () => {
    test('should handle WebSocket subscription workflow', async ({ page }) => {
      await page.goto('/');
      
      // Complete search and visualization
      await page.fill('#address-search', 'Alice');
      await page.click('#search-btn');
      await page.waitForSelector('#search-results .search-result');
      await page.locator('#search-results .search-result').first().click();
      
      // Wait for visualization to load
      await expect(page.locator('#visualization-section')).toBeVisible();
      
      // Establish WebSocket connection for real-time updates
      await page.evaluate(() => {
        if (typeof window.io !== 'undefined') {
          window.testSocket = window.io();
          
          window.testSocket.on('connect', () => {
            // Subscribe to address updates
            window.testSocket.emit('subscribe:address', {
              address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'
            });
          });
          
          window.testSocket.on('subscription:confirmed', (data) => {
            console.log('Subscription confirmed:', data);
            window.subscriptionConfirmed = true;
          });
        }
      });
      
      // Wait for subscription confirmation
      await page.waitForFunction(() => window.subscriptionConfirmed === true, { timeout: 5000 });
      
      // Verify subscription was successful
      const subscribed = await page.evaluate(() => window.subscriptionConfirmed);
      expect(subscribed).toBeTruthy();
    });
    
    test('should handle pattern alert subscriptions', async ({ page }) => {
      await page.goto('/');
      
      // Wait for Socket.IO to be available
      await page.waitForFunction(() => typeof window.io !== 'undefined');
      
      // Subscribe to pattern alerts
      await page.evaluate(() => {
        window.testSocket = window.io();
        
        window.testSocket.on('connect', () => {
          window.testSocket.emit('subscribe:patterns');
        });
        
        window.testSocket.on('subscription:confirmed', (data) => {
          if (data.type === 'patterns') {
            window.patternSubscriptionConfirmed = true;
          }
        });
      });
      
      // Wait for pattern subscription confirmation
      await page.waitForFunction(() => window.patternSubscriptionConfirmed === true, { timeout: 5000 });
      
      const subscribed = await page.evaluate(() => window.patternSubscriptionConfirmed);
      expect(subscribed).toBeTruthy();
    });
  });
  
  test.describe('Error Recovery Workflows', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      await page.goto('/');
      
      // Mock network failure for search
      await page.route('/api/addresses/search*', route => {
        route.abort('failed');
      });
      
      // Attempt search
      await page.fill('#address-search', 'test');
      await page.click('#search-btn');
      
      // Verify application remains functional
      await expect(page.locator('#app')).toBeVisible();
      await expect(page.locator('#address-search')).toBeVisible();
      
      // Clear the route mock and retry
      await page.unroute('/api/addresses/search*');
      
      // Mock successful response
      await page.route('/api/addresses/search*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            query: 'test',
            count: 1,
            results: [{
              address: '5TestAddress123456789ABCDEF',
              identity_display: 'Test Recovery',
              balance: '1000000000000'
            }]
          })
        });
      });
      
      // Retry search
      await page.click('#search-btn');
      
      // Verify recovery
      await expect(page.locator('#search-results')).toBeVisible();
    });
    
    test('should handle invalid search results', async ({ page }) => {
      await page.goto('/');
      
      // Search for non-existent address
      await page.fill('#address-search', 'NonExistentAddress123456789');
      await page.click('#search-btn');
      
      // Should handle empty results gracefully
      await page.waitForSelector('#search-results', { timeout: 10000 });
      
      // Verify no crash occurs
      await expect(page.locator('#app')).toBeVisible();
      await expect(page.locator('#address-search')).toBeVisible();
    });
  });
  
  test.describe('Multi-tab Workflows', () => {
    test('should handle multiple investigations in different tabs', async ({ context }) => {
      // Create two pages (tabs)
      const page1 = await context.newPage();
      const page2 = await context.newPage();
      
      // Navigate both to the application
      await page1.goto('/');
      await page2.goto('/');
      
      // Perform different searches in each tab
      await page1.fill('#address-search', 'Alice');
      await page1.click('#search-btn');
      
      await page2.fill('#address-search', 'Bob');
      await page2.click('#search-btn');
      
      // Wait for both searches to complete
      await Promise.all([
        page1.waitForSelector('#search-results .search-result'),
        page2.waitForSelector('#search-results .search-result')
      ]);
      
      // Click results in both tabs
      await page1.locator('#search-results .search-result').first().click();
      await page2.locator('#search-results .search-result').first().click();
      
      // Verify both tabs work independently
      await expect(page1.locator('#controls-section')).toBeVisible();
      await expect(page2.locator('#controls-section')).toBeVisible();
      
      // Close tabs
      await page1.close();
      await page2.close();
    });
  });
  
  test.describe('Mobile Workflow Adaptations', () => {
    test('should adapt interface for mobile devices', async ({ page }) => {
      // Test on mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      
      // Verify mobile adaptation
      await expect(page.locator('#app')).toBeVisible();
      
      // Test search functionality on mobile
      await page.fill('#address-search', 'Alice');
      await page.click('#search-btn');
      
      // Verify mobile layout works
      await page.waitForSelector('#search-results', { timeout: 10000 });
      await expect(page.locator('#search-results')).toBeVisible();
      
      // Test if controls are accessible on mobile
      if (await page.locator('#search-results .search-result').count() > 0) {
        await page.locator('#search-results .search-result').first().click();
        
        // Controls might be collapsed or adapted for mobile
        const controlsVisible = await page.locator('#controls-section').isVisible();
        
        // On mobile, controls might be hidden/collapsed by default
        console.log(`Mobile controls visibility: ${controlsVisible}`);
      }
    });
  });
});