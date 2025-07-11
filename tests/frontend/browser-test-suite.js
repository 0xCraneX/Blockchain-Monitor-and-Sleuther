/**
 * Browser-based Test Suite for Polkadot Analysis Tool
 * This can be run directly in the browser console
 */

const BrowserTestSuite = {
  results: {
    passed: [],
    failed: [],
    errors: []
  },

  // Test addresses
  testData: {
    validAddress: '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5',
    invalidAddress: 'invalid_address_12345',
    shortAddress: '15oF4uVJ',
    identitySearch: 'alice'
  },

  // Helper function to wait for element
  async waitForElement(selector, timeout = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Element ${selector} not found within ${timeout}ms`);
  },

  // Helper function to wait for element to be visible
  async waitForVisible(selector, timeout = 5000) {
    const element = await this.waitForElement(selector, timeout);
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (element.style.display !== 'none' && element.offsetParent !== null) {
        return element;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Element ${selector} not visible within ${timeout}ms`);
  },

  // Helper function to wait for element to be hidden
  async waitForHidden(selector, timeout = 5000) {
    const element = await this.waitForElement(selector, timeout);
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (element.style.display === 'none' || element.offsetParent === null) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Element ${selector} still visible after ${timeout}ms`);
  },

  // Helper to run a test
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
  },

  // Test 1: Check page elements
  async testPageElements() {
    await this.runTest('Page Elements Test', async () => {
      // Check main structure
      const app = document.getElementById('app');
      if (!app) throw new Error('App container not found');

      // Check search elements
      const searchInput = document.getElementById('address-search');
      const searchBtn = document.getElementById('search-btn');
      if (!searchInput) throw new Error('Search input not found');
      if (!searchBtn) throw new Error('Search button not found');

      // Check sections
      const sections = ['search-section', 'controls-section', 'visualization-section', 'loading'];
      for (const sectionId of sections) {
        const section = document.getElementById(sectionId);
        if (!section) throw new Error(`Section ${sectionId} not found`);
      }
    });
  },

  // Test 2: Search input validation
  async testSearchInput() {
    await this.runTest('Search Input Validation', async () => {
      const searchInput = document.getElementById('address-search');
      
      // Test typing
      searchInput.value = this.testData.validAddress;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (searchInput.value !== this.testData.validAddress) {
        throw new Error('Search input value not set correctly');
      }

      // Clear input
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
  },

  // Test 3: Address validator integration
  async testAddressValidator() {
    await this.runTest('Address Validator', async () => {
      if (!window.polkadotAddressValidator) {
        throw new Error('Address validator not loaded');
      }

      // Test valid address
      const validResult = window.polkadotAddressValidator.validateAddress(this.testData.validAddress);
      if (!validResult.isValid) {
        throw new Error('Valid address marked as invalid');
      }

      // Test invalid address
      const invalidResult = window.polkadotAddressValidator.validateAddress(this.testData.invalidAddress);
      if (invalidResult.isValid) {
        throw new Error('Invalid address marked as valid');
      }
    });
  },

  // Test 4: Search functionality
  async testSearchFunctionality() {
    await this.runTest('Search Functionality', async () => {
      const searchInput = document.getElementById('address-search');
      const searchBtn = document.getElementById('search-btn');

      // Enter invalid address
      searchInput.value = this.testData.invalidAddress;
      searchBtn.click();
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check that visualization is not shown
      const vizSection = document.getElementById('visualization-section');
      if (vizSection.style.display !== 'none') {
        console.warn('Visualization shown for invalid address');
      }

      // Clear and test with valid address
      searchInput.value = this.testData.validAddress;
      searchBtn.click();

      // Wait for loading
      try {
        await this.waitForVisible('#loading', 2000);
        await this.waitForHidden('#loading', 15000);
      } catch (error) {
        console.warn('Loading state not properly shown/hidden');
      }
    });
  },

  // Test 5: D3.js integration
  async testD3Integration() {
    await this.runTest('D3.js Integration', async () => {
      if (typeof d3 === 'undefined') {
        throw new Error('D3.js not loaded');
      }

      // Check D3 version
      console.log('D3.js version:', d3.version);

      // Check if SVG is created
      const svg = d3.select('#network-graph');
      if (svg.empty()) {
        console.warn('Network graph SVG not initialized');
      }
    });
  },

  // Test 6: Socket.IO integration
  async testSocketIO() {
    await this.runTest('Socket.IO Integration', async () => {
      if (typeof io === 'undefined') {
        throw new Error('Socket.IO not loaded');
      }

      // Check if we can create a socket connection
      try {
        const socket = io();
        if (!socket) throw new Error('Socket connection failed');
        socket.close();
      } catch (error) {
        console.warn('Socket.IO connection test failed:', error.message);
      }
    });
  },

  // Test 7: Filter controls
  async testFilterControls() {
    await this.runTest('Filter Controls', async () => {
      const filters = {
        'depth-filter': 'select',
        'volume-filter': 'input',
        'time-filter': 'select',
        'connection-filter': 'input'
      };

      for (const [id, type] of Object.entries(filters)) {
        const element = document.getElementById(id);
        if (!element) throw new Error(`Filter ${id} not found`);
        if (element.tagName.toLowerCase() !== type) {
          throw new Error(`Filter ${id} has wrong element type`);
        }
      }

      // Test filter buttons
      const applyBtn = document.getElementById('apply-filters');
      const resetBtn = document.getElementById('reset-filters');
      if (!applyBtn) throw new Error('Apply filters button not found');
      if (!resetBtn) throw new Error('Reset filters button not found');
    });
  },

  // Test 8: Export functionality
  async testExportButtons() {
    await this.runTest('Export Buttons', async () => {
      const exportButtons = ['export-csv', 'export-json', 'save-investigation'];
      
      for (const btnId of exportButtons) {
        const btn = document.getElementById(btnId);
        if (!btn) throw new Error(`Export button ${btnId} not found`);
      }
    });
  },

  // Test 9: Responsive design
  async testResponsiveDesign() {
    await this.runTest('Responsive Design', async () => {
      const originalWidth = window.innerWidth;
      
      // Test mobile breakpoint
      window.innerWidth = 375;
      window.dispatchEvent(new Event('resize'));
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if search input is still accessible
      const searchInput = document.getElementById('address-search');
      const rect = searchInput.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        throw new Error('Search input not visible on mobile');
      }

      // Restore original width
      window.innerWidth = originalWidth;
      window.dispatchEvent(new Event('resize'));
    });
  },

  // Test 10: Console errors
  async testConsoleErrors() {
    await this.runTest('Console Errors Check', async () => {
      // Check for any console errors logged during tests
      if (this.results.errors.length > 0) {
        throw new Error(`Found ${this.results.errors.length} console errors`);
      }
    });
  },

  // Monitor console errors
  setupErrorMonitoring() {
    const originalError = console.error;
    console.error = (...args) => {
      this.results.errors.push(args.join(' '));
      originalError.apply(console, args);
    };
  },

  // Generate report
  generateReport() {
    const total = this.results.passed.length + this.results.failed.length;
    const passRate = total > 0 ? (this.results.passed.length / total * 100).toFixed(1) : 0;

    console.log('\n========== TEST REPORT ==========');
    console.log(`Total tests: ${total}`);
    console.log(`Passed: ${this.results.passed.length} ✓`);
    console.log(`Failed: ${this.results.failed.length} ✗`);
    console.log(`Pass rate: ${passRate}%`);
    console.log(`Console errors: ${this.results.errors.length}`);

    if (this.results.failed.length > 0) {
      console.log('\nFailed tests:');
      this.results.failed.forEach(({ test, error }) => {
        console.log(`  ✗ ${test}: ${error}`);
      });
    }

    if (this.results.errors.length > 0) {
      console.log('\nConsole errors:');
      this.results.errors.slice(0, 5).forEach(error => {
        console.log(`  - ${error}`);
      });
      if (this.results.errors.length > 5) {
        console.log(`  ... and ${this.results.errors.length - 5} more`);
      }
    }

    console.log('=================================\n');

    return {
      success: this.results.failed.length === 0,
      total,
      passed: this.results.passed.length,
      failed: this.results.failed.length,
      errors: this.results.errors.length,
      passRate
    };
  },

  // Run all tests
  async runAllTests() {
    console.log('Starting browser test suite...\n');
    
    this.setupErrorMonitoring();
    
    // Basic tests
    await this.testPageElements();
    await this.testSearchInput();
    await this.testAddressValidator();
    
    // Integration tests
    await this.testD3Integration();
    await this.testSocketIO();
    
    // Feature tests
    await this.testFilterControls();
    await this.testExportButtons();
    
    // Advanced tests
    await this.testSearchFunctionality();
    await this.testResponsiveDesign();
    
    // Final checks
    await this.testConsoleErrors();
    
    return this.generateReport();
  }
};

// Auto-run if loaded in browser
if (typeof window !== 'undefined' && window.location) {
  window.BrowserTestSuite = BrowserTestSuite;
  console.log('Browser test suite loaded. Run BrowserTestSuite.runAllTests() to execute tests.');
}