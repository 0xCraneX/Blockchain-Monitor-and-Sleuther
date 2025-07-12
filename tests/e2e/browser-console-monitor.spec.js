import { test, expect } from '@playwright/test';

test.describe('Browser Console Monitoring', () => {
  // Helper class to track console messages
  class ConsoleMonitor {
    constructor(page) {
      this.page = page;
      this.messages = [];
      this.errors = [];
      this.warnings = [];
      this.cspViolations = [];
      this.networkErrors = [];
      
      this.setupListeners();
    }

    setupListeners() {
      // Capture all console messages
      this.page.on('console', msg => {
        const entry = {
          type: msg.type(),
          text: msg.text(),
          location: msg.location(),
          args: msg.args()
        };
        
        this.messages.push(entry);
        
        if (msg.type() === 'error') {
          this.errors.push(entry);
          
          // Check for specific error types
          if (msg.text().includes('Content Security Policy')) {
            this.cspViolations.push(entry);
          }
          if (msg.text().match(/Failed to load|ERR_|CORS|WebSocket/)) {
            this.networkErrors.push(entry);
          }
        } else if (msg.type() === 'warning') {
          this.warnings.push(entry);
        }
      });

      // Capture page errors (uncaught exceptions)
      this.page.on('pageerror', error => {
        this.errors.push({
          type: 'pageerror',
          text: error.message,
          stack: error.stack
        });
      });

      // Monitor failed requests
      this.page.on('requestfailed', request => {
        this.networkErrors.push({
          type: 'requestfailed',
          url: request.url(),
          failure: request.failure()
        });
      });

      // Monitor responses
      this.page.on('response', response => {
        if (response.status() >= 400) {
          this.networkErrors.push({
            type: 'http_error',
            url: response.url(),
            status: response.status(),
            statusText: response.statusText()
          });
        }
      });
    }

    getReport() {
      return {
        totalMessages: this.messages.length,
        errors: this.errors,
        warnings: this.warnings,
        cspViolations: this.cspViolations,
        networkErrors: this.networkErrors,
        errorSummary: this.getErrorSummary()
      };
    }

    getErrorSummary() {
      const summary = {};
      this.errors.forEach(error => {
        const key = error.text.substring(0, 50);
        summary[key] = (summary[key] || 0) + 1;
      });
      return summary;
    }

    assertNoErrors() {
      expect(this.errors, 'Console errors detected').toHaveLength(0);
    }

    assertNoCriticalErrors() {
      const criticalPatterns = [
        /Cannot convert.*to a BigInt/,
        /WebSocket.*failed/,
        /CORS.*blocked/,
        /Uncaught.*Error/,
        /Failed to fetch/,
        /ERR_/
      ];

      const criticalErrors = this.errors.filter(error => 
        criticalPatterns.some(pattern => pattern.test(error.text))
      );

      expect(criticalErrors, 'Critical errors detected').toHaveLength(0);
    }
  }

  test('main page should load without console errors', async ({ page }) => {
    const monitor = new ConsoleMonitor(page);
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const report = monitor.getReport();
    
    // Log report for debugging
    console.log('Console Report:', JSON.stringify(report, null, 2));
    
    // Assertions
    monitor.assertNoErrors();
    expect(report.cspViolations).toHaveLength(0);
    expect(report.networkErrors).toHaveLength(0);
  });

  test('should monitor errors during user interactions', async ({ page }) => {
    const monitor = new ConsoleMonitor(page);
    
    await page.goto('/');
    
    // Perform search operation
    await page.fill('#address-search', '13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk');
    await page.click('#search-btn');
    
    // Wait for graph to load
    await page.waitForSelector('#network-graph', { timeout: 10000 }).catch(() => {});
    
    // Check for errors during interaction
    monitor.assertNoCriticalErrors();
    
    // Specific checks
    const bigIntErrors = monitor.errors.filter(e => e.text.includes('BigInt'));
    expect(bigIntErrors, 'BigInt conversion errors').toHaveLength(0);
    
    const wsErrors = monitor.errors.filter(e => e.text.match(/WebSocket|socket\.io/));
    expect(wsErrors, 'WebSocket errors').toHaveLength(0);
  });

  test('should detect and report CSP violations', async ({ page }) => {
    const monitor = new ConsoleMonitor(page);
    
    // Inject a script that would violate CSP
    await page.goto('/');
    
    try {
      await page.evaluate(() => {
        // Try to inject inline script (should be blocked by CSP)
        const script = document.createElement('script');
        script.textContent = 'console.log("This should be blocked by CSP");';
        document.head.appendChild(script);
      });
    } catch (e) {
      // Expected to fail
    }
    
    // In production, this should generate CSP violation
    if (process.env.NODE_ENV === 'production') {
      expect(monitor.cspViolations.length).toBeGreaterThan(0);
    }
  });

  test('should monitor WebSocket connection lifecycle', async ({ page }) => {
    const monitor = new ConsoleMonitor(page);
    const wsEvents = [];
    
    await page.exposeFunction('logWsEvent', (event) => {
      wsEvents.push(event);
    });
    
    await page.goto('/');
    
    // Monitor WebSocket events
    await page.evaluate(() => {
      const originalSocket = window.io;
      window.io = function(...args) {
        const socket = originalSocket(...args);
        
        socket.on('connect', () => window.logWsEvent({ type: 'connect', id: socket.id }));
        socket.on('connect_error', (err) => window.logWsEvent({ type: 'connect_error', error: err.message }));
        socket.on('disconnect', (reason) => window.logWsEvent({ type: 'disconnect', reason }));
        socket.on('error', (err) => window.logWsEvent({ type: 'error', error: err.message || err }));
        
        return socket;
      };
    });
    
    // Trigger WebSocket connection
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Check WebSocket events
    const connectEvents = wsEvents.filter(e => e.type === 'connect');
    const errorEvents = wsEvents.filter(e => e.type === 'connect_error' || e.type === 'error');
    
    expect(connectEvents.length).toBeGreaterThan(0);
    expect(errorEvents).toHaveLength(0);
    
    // No WebSocket errors in console
    const wsConsoleErrors = monitor.errors.filter(e => 
      e.text.match(/websocket|socket\.io|unauthorized.*origin/i)
    );
    expect(wsConsoleErrors).toHaveLength(0);
  });

  test('should provide detailed error context', async ({ page }) => {
    const monitor = new ConsoleMonitor(page);
    
    // Create a page with intentional errors for testing
    await page.setContent(`
      <html>
        <body>
          <script>
            // TypeError
            const obj = null;
            console.log(obj.property);
          </script>
          <script>
            // ReferenceError
            console.log(undefinedVariable);
          </script>
          <script>
            // Network error
            fetch('http://invalid-domain-that-does-not-exist.com/api')
              .catch(err => console.error('Fetch error:', err));
          </script>
        </body>
      </html>
    `);
    
    await page.waitForTimeout(1000);
    
    const report = monitor.getReport();
    
    // Should capture different error types
    expect(report.errors.length).toBeGreaterThan(0);
    
    // Should have error details
    const typeError = report.errors.find(e => e.text.includes('Cannot read'));
    expect(typeError).toBeDefined();
    
    const refError = report.errors.find(e => e.text.includes('not defined'));
    expect(refError).toBeDefined();
  });

  test('should validate error-free user journey', async ({ page }) => {
    const monitor = new ConsoleMonitor(page);
    
    // Complete user journey
    await page.goto('/');
    
    // Search for address
    await page.fill('#address-search', '13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk');
    await page.click('#search-btn');
    
    // Wait for graph
    await page.waitForSelector('#network-graph', { state: 'visible', timeout: 10000 });
    
    // Apply filters
    await page.fill('#volume-filter', '100');
    await page.selectOption('#depth-filter', '2');
    await page.click('#apply-filters');
    
    // Export data
    await page.click('#export-csv');
    
    // Check entire journey was error-free
    const report = monitor.getReport();
    
    expect(report.errors).toHaveLength(0);
    expect(report.warnings.length).toBeLessThanOrEqual(5); // Some warnings OK
    expect(report.networkErrors).toHaveLength(0);
    expect(report.cspViolations).toHaveLength(0);
  });
});