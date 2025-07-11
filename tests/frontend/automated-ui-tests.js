/**
 * Automated UI Tests for Polkadot Analysis Tool
 * This script tests all major UI components and user workflows
 */

const puppeteer = require('puppeteer');
const { expect } = require('chai');

// Test configuration
const BASE_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 30000;

// Test data
const TEST_ADDRESSES = {
  valid: '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5', // Example Polkadot address
  invalid: 'invalid_address_12345',
  withIdentity: '14ShUZUYUR35RBZW6uVVt1zXDxmSQddkeDdXf1JkMA6P721N',
  withConnections: '12xtAYsRUrmbniiWQqJtECiBQrMn8AypQcXhnQAc6RB6XkLW'
};

class UITestRunner {
  constructor() {
    this.browser = null;
    this.page = null;
    this.results = {
      passed: [],
      failed: [],
      errors: []
    };
  }

  async initialize() {
    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.page = await this.browser.newPage();
      
      // Set viewport
      await this.page.setViewport({ width: 1280, height: 800 });
      
      // Enable console logging
      this.page.on('console', msg => {
        if (msg.type() === 'error') {
          this.results.errors.push(`Console error: ${msg.text()}`);
        }
      });
      
      // Track network errors
      this.page.on('pageerror', error => {
        this.results.errors.push(`Page error: ${error.message}`);
      });
      
      await this.page.goto(BASE_URL, { waitUntil: 'networkidle2' });
      console.log('Browser initialized successfully');
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async runTest(testName, testFn) {
    console.log(`\nRunning test: ${testName}`);
    try {
      await testFn();
      this.results.passed.push(testName);
      console.log(`✓ ${testName} passed`);
    } catch (error) {
      this.results.failed.push({ test: testName, error: error.message });
      console.error(`✗ ${testName} failed: ${error.message}`);
    }
  }

  // Test: Page loads correctly
  async testPageLoad() {
    await this.runTest('Page Load Test', async () => {
      const title = await this.page.title();
      expect(title).to.equal('Polkadot Analysis Tool');
      
      // Check main elements exist
      await this.page.waitForSelector('#app', { timeout: 5000 });
      await this.page.waitForSelector('#address-search', { timeout: 5000 });
      await this.page.waitForSelector('#search-btn', { timeout: 5000 });
    });
  }

  // Test: Search bar functionality
  async testSearchBar() {
    await this.runTest('Search Bar Basic Functionality', async () => {
      const searchInput = await this.page.$('#address-search');
      const searchButton = await this.page.$('#search-btn');
      
      expect(searchInput).to.not.be.null;
      expect(searchButton).to.not.be.null;
      
      // Test typing
      await searchInput.type(TEST_ADDRESSES.valid);
      const value = await this.page.$eval('#address-search', el => el.value);
      expect(value).to.equal(TEST_ADDRESSES.valid);
      
      // Clear input
      await this.page.$eval('#address-search', el => el.value = '');
    });
  }

  // Test: Address validation
  async testAddressValidation() {
    await this.runTest('Real-time Address Validation', async () => {
      const searchInput = await this.page.$('#address-search');
      
      // Test invalid address
      await searchInput.type(TEST_ADDRESSES.invalid);
      await this.page.waitForTimeout(500); // Wait for validation
      
      // Check for validation feedback (implementation dependent)
      // This might show as a class change, error message, etc.
      
      // Clear and test valid address
      await this.page.$eval('#address-search', el => el.value = '');
      await searchInput.type(TEST_ADDRESSES.valid);
      await this.page.waitForTimeout(500);
    });
  }

  // Test: Search workflow
  async testSearchWorkflow() {
    await this.runTest('Complete Search Workflow', async () => {
      // Clear any previous searches
      await this.page.reload({ waitUntil: 'networkidle2' });
      
      // Enter address and search
      await this.page.type('#address-search', TEST_ADDRESSES.valid);
      await this.page.click('#search-btn');
      
      // Wait for loading to complete
      await this.page.waitForSelector('#loading', { visible: true, timeout: 5000 });
      await this.page.waitForSelector('#loading', { hidden: true, timeout: 15000 });
      
      // Check if visualization section appears
      await this.page.waitForSelector('#visualization-section', { visible: true, timeout: 5000 });
      await this.page.waitForSelector('#controls-section', { visible: true, timeout: 5000 });
      
      // Check for graph container
      const graphContainer = await this.page.$('#graph-container');
      expect(graphContainer).to.not.be.null;
    });
  }

  // Test: Graph visualization
  async testGraphVisualization() {
    await this.runTest('Graph Visualization Rendering', async () => {
      // Ensure we have a graph loaded
      if (!(await this.page.$('#network-graph svg'))) {
        await this.page.type('#address-search', TEST_ADDRESSES.withConnections);
        await this.page.click('#search-btn');
        await this.page.waitForSelector('#network-graph', { timeout: 10000 });
      }
      
      // Check SVG elements
      const svg = await this.page.$('#network-graph');
      expect(svg).to.not.be.null;
      
      // Check for nodes
      const nodes = await this.page.$$('#network-graph circle.node');
      expect(nodes.length).to.be.greaterThan(0);
      
      // Check for edges
      const edges = await this.page.$$('#network-graph line.link');
      // Edges might be 0 if no connections
    });
  }

  // Test: Node interactions
  async testNodeInteractions() {
    await this.runTest('Graph Node Interactions', async () => {
      // Ensure graph is loaded
      await this.page.waitForSelector('#network-graph circle.node', { timeout: 5000 });
      
      // Test hover (check for tooltip or highlight)
      const firstNode = await this.page.$('#network-graph circle.node');
      if (firstNode) {
        const box = await firstNode.boundingBox();
        await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await this.page.waitForTimeout(500); // Wait for hover effect
      }
      
      // Test click
      await firstNode.click();
      await this.page.waitForTimeout(500);
      
      // Check if node details panel appears
      const nodeDetails = await this.page.$('#node-details');
      const isVisible = await nodeDetails.evaluate(el => 
        window.getComputedStyle(el).display !== 'none'
      );
      expect(isVisible).to.be.true;
    });
  }

  // Test: Filter controls
  async testFilterControls() {
    await this.runTest('Filter Controls Functionality', async () => {
      // Check filter elements exist
      const depthFilter = await this.page.$('#depth-filter');
      const volumeFilter = await this.page.$('#volume-filter');
      const timeFilter = await this.page.$('#time-filter');
      const connectionFilter = await this.page.$('#connection-filter');
      
      expect(depthFilter).to.not.be.null;
      expect(volumeFilter).to.not.be.null;
      expect(timeFilter).to.not.be.null;
      expect(connectionFilter).to.not.be.null;
      
      // Test changing filters
      await this.page.select('#depth-filter', '2');
      await this.page.type('#volume-filter', '100');
      await this.page.select('#time-filter', '7d');
      
      // Apply filters
      await this.page.click('#apply-filters');
      await this.page.waitForTimeout(1000); // Wait for filter application
    });
  }

  // Test: Export functionality
  async testExportFunctionality() {
    await this.runTest('Export Functions', async () => {
      // Test CSV export
      const csvButton = await this.page.$('#export-csv');
      expect(csvButton).to.not.be.null;
      
      // Test JSON export
      const jsonButton = await this.page.$('#export-json');
      expect(jsonButton).to.not.be.null;
      
      // Test save investigation
      const saveButton = await this.page.$('#save-investigation');
      expect(saveButton).to.not.be.null;
    });
  }

  // Test: Error handling
  async testErrorHandling() {
    await this.runTest('Error Handling - Invalid Address', async () => {
      await this.page.reload({ waitUntil: 'networkidle2' });
      
      // Search with invalid address
      await this.page.type('#address-search', TEST_ADDRESSES.invalid);
      await this.page.click('#search-btn');
      
      // Wait for error handling (alert, message, etc.)
      await this.page.waitForTimeout(2000);
      
      // Check that visualization didn't load
      const vizSection = await this.page.$('#visualization-section');
      const isHidden = await vizSection.evaluate(el => 
        window.getComputedStyle(el).display === 'none'
      );
      expect(isHidden).to.be.true;
    });
  }

  // Test: Responsive design
  async testResponsiveDesign() {
    await this.runTest('Responsive Design', async () => {
      // Test mobile viewport
      await this.page.setViewport({ width: 375, height: 667 });
      await this.page.waitForTimeout(500);
      
      // Check if elements are still accessible
      const searchInput = await this.page.$('#address-search');
      expect(searchInput).to.not.be.null;
      
      // Test tablet viewport
      await this.page.setViewport({ width: 768, height: 1024 });
      await this.page.waitForTimeout(500);
      
      // Reset to desktop
      await this.page.setViewport({ width: 1280, height: 800 });
    });
  }

  // Test: WebSocket connection
  async testWebSocketConnection() {
    await this.runTest('WebSocket Connection', async () => {
      // Check if Socket.IO is loaded
      const hasSocketIO = await this.page.evaluate(() => {
        return typeof io !== 'undefined';
      });
      expect(hasSocketIO).to.be.true;
      
      // Monitor WebSocket events (if implemented)
      // This would require checking for specific WebSocket functionality
    });
  }

  // Test: Performance
  async testPerformance() {
    await this.runTest('Performance Metrics', async () => {
      const metrics = await this.page.metrics();
      
      console.log('Performance metrics:', {
        timestamp: metrics.Timestamp,
        documents: metrics.Documents,
        jsHeapUsed: Math.round(metrics.JSHeapUsedSize / 1024 / 1024) + ' MB',
        nodes: metrics.Nodes
      });
      
      // Check that memory usage is reasonable
      expect(metrics.JSHeapUsedSize).to.be.lessThan(100 * 1024 * 1024); // Less than 100MB
    });
  }

  // Generate test report
  generateReport() {
    console.log('\n========== TEST REPORT ==========');
    console.log(`Total tests: ${this.results.passed.length + this.results.failed.length}`);
    console.log(`Passed: ${this.results.passed.length}`);
    console.log(`Failed: ${this.results.failed.length}`);
    console.log(`Errors: ${this.results.errors.length}`);
    
    if (this.results.failed.length > 0) {
      console.log('\nFailed tests:');
      this.results.failed.forEach(({ test, error }) => {
        console.log(`  - ${test}: ${error}`);
      });
    }
    
    if (this.results.errors.length > 0) {
      console.log('\nErrors encountered:');
      this.results.errors.forEach(error => {
        console.log(`  - ${error}`);
      });
    }
    
    console.log('\n=================================\n');
    
    return {
      success: this.results.failed.length === 0,
      results: this.results
    };
  }

  // Run all tests
  async runAllTests() {
    try {
      await this.initialize();
      
      // Core functionality tests
      await this.testPageLoad();
      await this.testSearchBar();
      await this.testAddressValidation();
      
      // User workflow tests
      await this.testSearchWorkflow();
      await this.testGraphVisualization();
      await this.testNodeInteractions();
      
      // Feature tests
      await this.testFilterControls();
      await this.testExportFunctionality();
      
      // Error and edge case tests
      await this.testErrorHandling();
      
      // Browser compatibility tests
      await this.testResponsiveDesign();
      await this.testWebSocketConnection();
      
      // Performance tests
      await this.testPerformance();
      
      return this.generateReport();
    } catch (error) {
      console.error('Test runner error:', error);
      this.results.errors.push(`Test runner error: ${error.message}`);
      return this.generateReport();
    } finally {
      await this.cleanup();
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UITestRunner;
}

// Run tests if executed directly
if (require.main === module) {
  const runner = new UITestRunner();
  runner.runAllTests().then(report => {
    process.exit(report.success ? 0 : 1);
  });
}