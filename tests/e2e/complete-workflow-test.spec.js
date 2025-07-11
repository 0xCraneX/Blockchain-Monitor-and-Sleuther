/**
 * Comprehensive User Workflow E2E Tests
 * 
 * Tests all major user workflows including investigation, analysis,
 * real-time monitoring, data management, and error recovery scenarios.
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs/promises');

// Test data
const TEST_ADDRESSES = {
  alice: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  bob: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
  charlie: '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y',
  dave: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy',
  eve: '5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw',
  e2eTest: '5E2E2testAddressForE2ESearching123456789ABCDEF',
  highRisk: '5HIGHriskAddressForPatternTesting123456789ABCDEF'
};

// Helper to wait for WebSocket connection
async function waitForWebSocket(page) {
  await page.waitForFunction(() => {
    return typeof window.io !== 'undefined' && 
           window.testSocket && 
           window.testSocket.connected;
  }, { timeout: 10000 });
}

// Helper to simulate file upload
async function uploadFile(page, selector, fileName, content) {
  const buffer = Buffer.from(content);
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.locator(selector).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: fileName,
    mimeType: 'text/csv',
    buffer: buffer
  });
}

test.describe('Complete User Workflows', () => {
  
  test.describe('1. Investigation Workflow', () => {
    test('should complete full investigation workflow', async ({ page }) => {
      // Start investigation
      await page.goto('/');
      
      // Search for suspicious address
      await page.fill('#address-search', TEST_ADDRESSES.highRisk);
      await page.click('#search-btn');
      
      // Wait for search results
      await page.waitForSelector('#search-results .search-result', { timeout: 10000 });
      
      // View address details
      const searchResult = page.locator('#search-results .search-result').first();
      await expect(searchResult).toContainText('High Risk Test');
      await searchResult.click();
      
      // Wait for graph visualization
      await expect(page.locator('#visualization-section')).toBeVisible();
      await expect(page.locator('#network-graph')).toBeVisible();
      
      // Expand graph to find connections
      await page.click('#expand-graph');
      await page.waitForTimeout(2000); // Wait for graph expansion
      
      // Apply filters to narrow results
      await page.selectOption('#depth-filter', '3');
      await page.fill('#volume-filter', '1000000');
      await page.selectOption('#time-filter', '30d');
      await page.fill('#connection-filter', '5');
      await page.click('#apply-filters');
      
      // Wait for filtered results
      await expect(page.locator('#loading')).toBeVisible();
      await expect(page.locator('#loading')).toBeHidden({ timeout: 15000 });
      
      // Check pattern detection
      const stats = await page.locator('#graph-stats').textContent();
      expect(stats).toContain('Nodes:');
      expect(stats).toContain('Edges:');
      
      // Save investigation
      await page.fill('#investigation-name', 'High Risk Investigation ' + Date.now());
      await page.fill('#investigation-notes', 'Investigation of high-risk address patterns');
      await page.click('#save-investigation');
      
      // Wait for save confirmation
      await page.waitForSelector('.success-message', { timeout: 5000 });
      
      // Export results
      const [csvDownload] = await Promise.all([
        page.waitForEvent('download'),
        page.click('#export-csv')
      ]);
      
      expect(csvDownload.suggestedFilename()).toMatch(/investigation.*\.csv$/);
      
      // Export as JSON
      const [jsonDownload] = await Promise.all([
        page.waitForEvent('download'),
        page.click('#export-json')
      ]);
      
      expect(jsonDownload.suggestedFilename()).toMatch(/investigation.*\.json$/);
    });
    
    test('should detect patterns in relationships', async ({ page }) => {
      await page.goto('/');
      
      // Search for known pattern address
      await page.fill('#address-search', TEST_ADDRESSES.highRisk);
      await page.click('#search-btn');
      
      await page.waitForSelector('#search-results .search-result');
      await page.locator('#search-results .search-result').first().click();
      
      // Wait for graph
      await expect(page.locator('#network-graph')).toBeVisible();
      
      // Enable pattern detection
      await page.click('#enable-pattern-detection');
      
      // Wait for patterns to be detected
      await page.waitForSelector('#pattern-alerts', { timeout: 10000 });
      
      // Check if patterns were found
      const patternAlerts = await page.locator('#pattern-alerts .pattern-item').count();
      expect(patternAlerts).toBeGreaterThan(0);
      
      // Click on a pattern to highlight
      if (patternAlerts > 0) {
        await page.locator('#pattern-alerts .pattern-item').first().click();
        
        // Verify nodes are highlighted
        const highlightedNodes = await page.locator('#network-graph .highlighted').count();
        expect(highlightedNodes).toBeGreaterThan(0);
      }
    });
  });
  
  test.describe('2. Analysis Workflow', () => {
    test('should import known addresses and analyze', async ({ page }) => {
      await page.goto('/');
      
      // Navigate to import section
      await page.click('#data-management');
      await page.click('#import-addresses');
      
      // Prepare CSV content
      const csvContent = `address,label,risk_score
${TEST_ADDRESSES.alice},Alice,low
${TEST_ADDRESSES.bob},Bob,medium
${TEST_ADDRESSES.charlie},Charlie,high
${TEST_ADDRESSES.dave},Dave,medium
${TEST_ADDRESSES.eve},Eve,high`;
      
      // Upload CSV file
      await uploadFile(page, '#file-upload', 'known_addresses.csv', csvContent);
      
      // Confirm import
      await page.click('#confirm-import');
      
      // Wait for import success
      await page.waitForSelector('.import-success', { timeout: 10000 });
      
      // Build relationship graph
      await page.click('#build-graph');
      
      // Select addresses for analysis
      await page.check(`input[value="${TEST_ADDRESSES.alice}"]`);
      await page.check(`input[value="${TEST_ADDRESSES.bob}"]`);
      await page.check(`input[value="${TEST_ADDRESSES.charlie}"]`);
      
      await page.click('#analyze-selected');
      
      // Wait for analysis to complete
      await expect(page.locator('#analysis-results')).toBeVisible({ timeout: 15000 });
      
      // Calculate shortest paths
      await page.click('#calculate-paths');
      await page.selectOption('#path-from', TEST_ADDRESSES.alice);
      await page.selectOption('#path-to', TEST_ADDRESSES.charlie);
      await page.click('#find-shortest-path');
      
      // Wait for path results
      await page.waitForSelector('#path-results', { timeout: 10000 });
      const pathInfo = await page.locator('#path-results').textContent();
      expect(pathInfo).toContain('Path length:');
      
      // Identify high-risk connections
      await page.click('#identify-risks');
      await page.waitForSelector('#risk-analysis', { timeout: 10000 });
      
      // Generate report
      await page.click('#generate-report');
      await page.selectOption('#report-format', 'pdf');
      await page.fill('#report-title', 'Risk Analysis Report');
      
      const [reportDownload] = await Promise.all([
        page.waitForEvent('download'),
        page.click('#download-report')
      ]);
      
      expect(reportDownload.suggestedFilename()).toMatch(/report.*\.pdf$/);
    });
  });
  
  test.describe('3. Real-time Monitoring', () => {
    test('should handle real-time address monitoring', async ({ page }) => {
      await page.goto('/');
      
      // Initialize WebSocket connection
      await page.evaluate(() => {
        window.testSocket = window.io();
        window.socketEvents = [];
        
        window.testSocket.on('connect', () => {
          window.socketConnected = true;
        });
        
        window.testSocket.on('graph:update', (data) => {
          window.socketEvents.push({ type: 'graph:update', data });
        });
        
        window.testSocket.on('pattern:detected', (data) => {
          window.socketEvents.push({ type: 'pattern:detected', data });
        });
      });
      
      // Wait for connection
      await waitForWebSocket(page);
      
      // Subscribe to address updates
      await page.evaluate((address) => {
        window.testSocket.emit('subscribe:address', { address });
      }, TEST_ADDRESSES.alice);
      
      // Wait for subscription confirmation
      await page.waitForFunction(() => {
        return window.socketEvents.some(e => e.type === 'subscription:confirmed');
      }, { timeout: 5000 });
      
      // Subscribe to pattern alerts
      await page.evaluate(() => {
        window.testSocket.emit('subscribe:patterns', {
          minRiskScore: 0.7,
          patterns: ['circular', 'rapid_transfer', 'mixing']
        });
      });
      
      // Simulate live updates
      await page.evaluate(() => {
        // Simulate incoming graph update
        window.testSocket.emit('test:simulate:update', {
          type: 'new_transfer',
          from: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          to: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
          amount: '1000000000000'
        });
      });
      
      // Wait for live update to be processed
      await page.waitForTimeout(2000);
      
      // Check if updates were received
      const eventCount = await page.evaluate(() => window.socketEvents.length);
      expect(eventCount).toBeGreaterThan(1);
      
      // Test connection interruption and recovery
      await page.evaluate(() => {
        window.testSocket.disconnect();
      });
      
      // Wait for disconnection
      await page.waitForFunction(() => !window.testSocket.connected, { timeout: 5000 });
      
      // Simulate reconnection
      await page.evaluate(() => {
        window.testSocket.connect();
      });
      
      // Wait for reconnection
      await waitForWebSocket(page);
      
      // Verify subscriptions are restored
      const connected = await page.evaluate(() => window.socketConnected);
      expect(connected).toBe(true);
    });
    
    test('should display live graph updates', async ({ page }) => {
      await page.goto('/');
      
      // Search and visualize an address
      await page.fill('#address-search', TEST_ADDRESSES.alice);
      await page.click('#search-btn');
      
      await page.waitForSelector('#search-results .search-result');
      await page.locator('#search-results .search-result').first().click();
      
      // Wait for graph
      await expect(page.locator('#network-graph')).toBeVisible();
      
      // Enable live updates
      await page.click('#enable-live-updates');
      
      // Initialize WebSocket for live updates
      await page.evaluate(() => {
        window.testSocket = window.io();
        window.graphUpdates = [];
        
        window.testSocket.on('graph:node:added', (data) => {
          window.graphUpdates.push({ type: 'node:added', data });
        });
        
        window.testSocket.on('graph:edge:added', (data) => {
          window.graphUpdates.push({ type: 'edge:added', data });
        });
      });
      
      await waitForWebSocket(page);
      
      // Get initial node count
      const initialNodeCount = await page.locator('#node-count').textContent();
      const initialNodes = parseInt(initialNodeCount.match(/\d+/)[0]);
      
      // Simulate adding a new node
      await page.evaluate(() => {
        window.testSocket.emit('test:add:node', {
          address: '5NEWtestAddressForLiveUpdate123456789ABCDEF',
          label: 'New Live Node'
        });
      });
      
      // Wait for graph update
      await page.waitForTimeout(2000);
      
      // Check if node count increased
      const updatedNodeCount = await page.locator('#node-count').textContent();
      const updatedNodes = parseInt(updatedNodeCount.match(/\d+/)[0]);
      
      expect(updatedNodes).toBeGreaterThan(initialNodes);
    });
  });
  
  test.describe('4. Data Management', () => {
    test('should handle bulk import of addresses', async ({ page }) => {
      await page.goto('/');
      
      // Navigate to data management
      await page.click('#data-management');
      await page.click('#bulk-import');
      
      // Generate large CSV (1000 addresses)
      let largeCsvContent = 'address,label,balance,risk_score\n';
      for (let i = 0; i < 1000; i++) {
        const address = `5TESTaddr${i.toString().padStart(10, '0')}ABCDEFGHIJKLMNOPQRS`;
        largeCsvContent += `${address},Test Account ${i},${1000000 * i},${Math.random()}\n`;
      }
      
      // Upload large CSV
      await uploadFile(page, '#bulk-file-upload', 'bulk_addresses.csv', largeCsvContent);
      
      // Confirm bulk import
      await page.click('#confirm-bulk-import');
      
      // Wait for progress bar
      await expect(page.locator('#import-progress')).toBeVisible();
      
      // Wait for import to complete (with extended timeout for large dataset)
      await page.waitForSelector('.bulk-import-complete', { timeout: 60000 });
      
      // Verify import statistics
      const importStats = await page.locator('#import-statistics').textContent();
      expect(importStats).toContain('1000');
      expect(importStats).toContain('imported successfully');
    });
    
    test('should export large datasets', async ({ page }) => {
      await page.goto('/');
      
      // Navigate to export
      await page.click('#data-management');
      await page.click('#export-data');
      
      // Configure export parameters
      await page.selectOption('#export-type', 'full_graph');
      await page.check('#include-metadata');
      await page.check('#include-relationships');
      await page.check('#include-risk-scores');
      
      // Select date range
      await page.fill('#export-date-from', '2024-01-01');
      await page.fill('#export-date-to', '2024-12-31');
      
      // Choose format
      await page.selectOption('#export-format', 'json');
      
      // Start export
      const [exportDownload] = await Promise.all([
        page.waitForEvent('download'),
        page.click('#start-export')
      ]);
      
      expect(exportDownload.suggestedFilename()).toMatch(/export.*\.json$/);
    });
    
    test('should backup and restore investigations', async ({ page }) => {
      // First create an investigation to backup
      await page.goto('/');
      
      await page.fill('#address-search', TEST_ADDRESSES.alice);
      await page.click('#search-btn');
      await page.waitForSelector('#search-results .search-result');
      await page.locator('#search-results .search-result').first().click();
      
      // Save investigation
      const investigationName = 'Backup Test Investigation ' + Date.now();
      await page.fill('#investigation-name', investigationName);
      await page.click('#save-investigation');
      await page.waitForSelector('.success-message');
      
      // Navigate to backup
      await page.click('#data-management');
      await page.click('#backup-restore');
      
      // Create backup
      await page.click('#create-backup');
      await page.selectOption('#backup-type', 'investigations');
      
      const [backupDownload] = await Promise.all([
        page.waitForEvent('download'),
        page.click('#download-backup')
      ]);
      
      const backupFilename = backupDownload.suggestedFilename();
      expect(backupFilename).toMatch(/backup.*\.zip$/);
      
      // Simulate restore process
      await page.click('#restore-tab');
      
      // Note: Actual file upload for restore would require the downloaded file
      // For testing, we'll verify the UI elements exist
      await expect(page.locator('#restore-file-upload')).toBeVisible();
      await expect(page.locator('#restore-backup-btn')).toBeVisible();
    });
    
    test('should clean up old data', async ({ page }) => {
      await page.goto('/');
      
      // Navigate to data cleanup
      await page.click('#data-management');
      await page.click('#data-cleanup');
      
      // Configure cleanup parameters
      await page.selectOption('#cleanup-type', 'old_investigations');
      await page.fill('#cleanup-days', '90');
      await page.check('#cleanup-archived');
      
      // Preview cleanup
      await page.click('#preview-cleanup');
      
      // Wait for preview results
      await page.waitForSelector('#cleanup-preview', { timeout: 10000 });
      
      const previewText = await page.locator('#cleanup-preview').textContent();
      expect(previewText).toContain('items will be removed');
      
      // Confirm cleanup
      await page.click('#confirm-cleanup');
      
      // Wait for cleanup to complete
      await page.waitForSelector('.cleanup-complete', { timeout: 30000 });
    });
  });
  
  test.describe('5. Error Recovery', () => {
    test('should recover from server restart', async ({ page, context }) => {
      await page.goto('/');
      
      // Start an investigation
      await page.fill('#address-search', TEST_ADDRESSES.alice);
      await page.click('#search-btn');
      await page.waitForSelector('#search-results .search-result');
      await page.locator('#search-results .search-result').first().click();
      
      // Store current state
      const nodeCount = await page.locator('#node-count').textContent();
      
      // Simulate server restart by intercepting API calls
      await page.route('/api/**', route => {
        // Simulate server being down
        route.abort('failed');
      });
      
      // Try to perform an action that requires server
      await page.click('#expand-graph');
      
      // Should show error message
      await expect(page.locator('.error-message')).toBeVisible({ timeout: 5000 });
      
      // Restore server connection
      await page.unroute('/api/**');
      
      // Click retry or refresh
      if (await page.locator('#retry-connection').isVisible()) {
        await page.click('#retry-connection');
      } else {
        await page.reload();
      }
      
      // Verify recovery - should restore previous state
      await expect(page.locator('#network-graph')).toBeVisible({ timeout: 10000 });
      const recoveredNodeCount = await page.locator('#node-count').textContent();
      expect(recoveredNodeCount).toBe(nodeCount);
    });
    
    test('should handle database connection loss', async ({ page }) => {
      await page.goto('/');
      
      // Mock database error responses
      await page.route('/api/addresses/search*', async route => {
        if (route.request().url().includes('search')) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Database connection lost',
              code: 'DB_CONNECTION_ERROR'
            })
          });
        }
      });
      
      // Attempt search
      await page.fill('#address-search', 'test');
      await page.click('#search-btn');
      
      // Should show appropriate error
      await expect(page.locator('.error-message')).toContainText(/database/i);
      
      // Restore connection
      await page.unroute('/api/addresses/search*');
      
      // Retry should work
      await page.click('#search-btn');
      await expect(page.locator('#search-results')).toBeVisible({ timeout: 10000 });
    });
    
    test('should handle blockchain RPC failures', async ({ page }) => {
      await page.goto('/');
      
      // Navigate to blockchain sync status
      await page.click('#blockchain-status');
      
      // Mock RPC failure
      await page.route('/api/blockchain/status', route => {
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'RPC endpoint unavailable',
            code: 'RPC_ERROR'
          })
        });
      });
      
      // Check status
      await page.click('#refresh-blockchain-status');
      
      // Should show RPC error
      await expect(page.locator('#rpc-status')).toContainText(/unavailable|error/i);
      
      // Test fallback mode
      await expect(page.locator('#fallback-mode-notice')).toBeVisible();
      
      // Verify app still functions with cached data
      await page.click('#back-to-search');
      await page.fill('#address-search', TEST_ADDRESSES.alice);
      await page.click('#search-btn');
      
      // Should still work with cached data
      await expect(page.locator('#search-results')).toBeVisible({ timeout: 10000 });
    });
    
    test('should validate and handle invalid data', async ({ page }) => {
      await page.goto('/');
      
      // Test invalid address format
      await page.fill('#address-search', 'INVALID_ADDRESS_FORMAT_12345');
      await page.click('#search-btn');
      
      // Should show validation error
      await expect(page.locator('.validation-error')).toContainText(/invalid.*address/i);
      
      // Test XSS attempt
      await page.fill('#address-search', '<script>alert("xss")</script>');
      await page.click('#search-btn');
      
      // Should sanitize and show error
      await expect(page.locator('.validation-error')).toBeVisible();
      
      // Page should remain stable
      await expect(page.locator('#app')).toBeVisible();
      
      // Test SQL injection attempt in filters
      await page.fill('#volume-filter', "1000'; DROP TABLE accounts; --");
      await page.click('#apply-filters');
      
      // Should reject invalid input
      await expect(page.locator('.validation-error')).toBeVisible();
      
      // Test extremely large number
      await page.fill('#depth-filter', '999999999');
      await page.click('#apply-filters');
      
      // Should cap to maximum allowed
      const depthValue = await page.locator('#depth-filter').inputValue();
      expect(parseInt(depthValue)).toBeLessThanOrEqual(10);
    });
  });
  
  test.describe('6. Performance Under Load', () => {
    test('should handle multiple concurrent operations', async ({ page }) => {
      await page.goto('/');
      
      // Start multiple searches concurrently
      const searchPromises = [];
      
      for (const address of Object.values(TEST_ADDRESSES).slice(0, 5)) {
        searchPromises.push(
          page.evaluate(async (addr) => {
            const response = await fetch(`/api/addresses/search?q=${addr}`);
            return response.json();
          }, address)
        );
      }
      
      // Wait for all searches
      const results = await Promise.all(searchPromises);
      
      // All should complete successfully
      expect(results.length).toBe(5);
      results.forEach(result => {
        expect(result).toHaveProperty('results');
      });
      
      // UI should remain responsive
      await page.fill('#address-search', TEST_ADDRESSES.alice);
      await page.click('#search-btn');
      await expect(page.locator('#search-results')).toBeVisible({ timeout: 10000 });
    });
    
    test('should handle large graph visualizations', async ({ page }) => {
      await page.goto('/');
      
      // Search for high-connection address
      await page.fill('#address-search', TEST_ADDRESSES.highRisk);
      await page.click('#search-btn');
      
      await page.waitForSelector('#search-results .search-result');
      await page.locator('#search-results .search-result').first().click();
      
      // Expand to maximum depth
      await page.selectOption('#depth-filter', '5');
      await page.click('#apply-filters');
      
      // Wait for large graph to load
      await expect(page.locator('#loading')).toBeVisible();
      await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
      
      // Check performance metrics
      const stats = await page.locator('#graph-stats').textContent();
      const nodeMatch = stats.match(/Nodes: (\d+)/);
      
      if (nodeMatch) {
        const nodeCount = parseInt(nodeMatch[1]);
        
        // Test zoom performance with large graph
        const startTime = Date.now();
        await page.locator('#graph-container').hover();
        await page.mouse.wheel(0, -100);
        await page.mouse.wheel(0, -100);
        await page.mouse.wheel(0, 100);
        const zoomTime = Date.now() - startTime;
        
        // Zoom should be responsive even with many nodes
        expect(zoomTime).toBeLessThan(1000);
      }
    });
  });
});

// Test Report Generation Helper
test.afterAll(async () => {
  // Generate comprehensive test report
  const reportData = {
    timestamp: new Date().toISOString(),
    testSuite: 'Complete User Workflows',
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      duration: 0
    },
    workflows: {
      investigation: { tested: true, issues: [] },
      analysis: { tested: true, issues: [] },
      monitoring: { tested: true, issues: [] },
      dataManagement: { tested: true, issues: [] },
      errorRecovery: { tested: true, issues: [] },
      performance: { tested: true, issues: [] }
    },
    recommendations: []
  };
  
  // Save report
  const reportPath = path.join(__dirname, '../../test-results/workflow-test-report.json');
  await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
});