import { test, expect } from '@playwright/test';

test.describe('CORS and WebSocket Tests', () => {
  // Helper to check for console errors
  async function checkNoConsoleErrors(page) {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', err => errors.push(err.message));
    return errors;
  }

  test('should load without console errors', async ({ page, baseURL }) => {
    const errors = await checkNoConsoleErrors(page);
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check for common error patterns
    expect(errors).not.toContain(expect.stringMatching(/CORS/i));
    expect(errors).not.toContain(expect.stringMatching(/CSP/i));
    expect(errors).not.toContain(expect.stringMatching(/WebSocket/i));
    expect(errors).not.toContain(expect.stringMatching(/Failed to load/i));
    
    // Page should load successfully
    await expect(page.locator('h1')).toContainText('Polkadot Analysis Tool');
  });

  test('WebSocket should connect from different origins', async ({ page, browserName }) => {
    const errors = await checkNoConsoleErrors(page);
    
    // Create a test page that connects via WebSocket
    await page.setContent(`
      <html>
        <head>
          <script src="https://cdn.socket.io/4.6.1/socket.io.min.js"></script>
        </head>
        <body>
          <div id="status">Connecting...</div>
          <script>
            window.socketStatus = 'connecting';
            window.socketErrors = [];
            
            const socket = io('${page.context()._options.baseURL || 'http://localhost:3001'}', {
              transports: ['websocket', 'polling']
            });
            
            socket.on('connect', () => {
              window.socketStatus = 'connected';
              document.getElementById('status').textContent = 'Connected: ' + socket.id;
            });
            
            socket.on('connect_error', (error) => {
              window.socketStatus = 'error';
              window.socketErrors.push(error.message);
              document.getElementById('status').textContent = 'Error: ' + error.message;
            });
            
            socket.on('error', (error) => {
              window.socketErrors.push(error.message || error);
            });
          </script>
        </body>
      </html>
    `);
    
    // Wait for connection
    await page.waitForFunction(() => window.socketStatus !== 'connecting', { timeout: 10000 });
    
    // Check connection status
    const status = await page.evaluate(() => window.socketStatus);
    const socketErrors = await page.evaluate(() => window.socketErrors);
    
    expect(status).toBe('connected');
    expect(socketErrors).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  test('API endpoints should be accessible with proper CORS headers', async ({ page, request }) => {
    // Test various API endpoints
    const endpoints = [
      '/api',
      '/api/addresses/13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk',
      '/api/graph/13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk?depth=1'
    ];
    
    for (const endpoint of endpoints) {
      const response = await request.get(endpoint);
      
      // Should return successful response
      expect(response.status()).toBeLessThan(400);
      
      // Should have proper CORS headers
      const headers = response.headers();
      expect(headers['access-control-allow-origin']).toBeTruthy();
      
      // For browser requests, check CORS preflight
      const preflightResponse = await request.fetch(endpoint, {
        method: 'OPTIONS',
        headers: {
          'Origin': page.context()._options.baseURL,
          'Access-Control-Request-Method': 'GET'
        }
      });
      
      expect(preflightResponse.status()).toBeLessThan(400);
    }
  });

  test('CSP should allow required resources', async ({ page }) => {
    const cspViolations = [];
    
    page.on('console', msg => {
      if (msg.text().includes('Content Security Policy')) {
        cspViolations.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check that required resources loaded
    await expect(page.locator('script[src*="socket.io"]')).toHaveCount(1);
    await expect(page.locator('script[src*="d3js.org"]')).toHaveCount(1);
    
    // No CSP violations
    expect(cspViolations).toHaveLength(0);
  });

  test('WebSocket should handle origin validation correctly', async ({ page }) => {
    // Test with missing origin header (development mode)
    const response = await page.evaluate(async () => {
      try {
        const ws = new WebSocket('ws://localhost:3001/socket.io/?transport=websocket');
        await new Promise((resolve, reject) => {
          ws.onopen = () => resolve('connected');
          ws.onerror = () => reject('connection failed');
          setTimeout(() => reject('timeout'), 5000);
        });
        ws.close();
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    
    // In development, should allow connection
    if (process.env.NODE_ENV !== 'production') {
      expect(response.success).toBe(true);
    }
  });
});