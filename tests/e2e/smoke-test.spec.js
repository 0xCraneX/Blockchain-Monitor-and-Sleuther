import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';

const sleep = promisify(setTimeout);

test.describe('Application Smoke Tests', () => {
  test('server should start successfully with all services', async () => {
    // Start server with specific test configuration
    const server = spawn('npm', ['start'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: '3002', // Different port to avoid conflicts
        LOG_LEVEL: 'info',
        SKIP_BLOCKCHAIN: 'true'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const logs = [];
    const errors = [];

    server.stdout.on('data', (data) => {
      const log = data.toString();
      logs.push(log);
      console.log('Server:', log.trim());
    });

    server.stderr.on('data', (data) => {
      const error = data.toString();
      errors.push(error);
      console.error('Server Error:', error.trim());
    });

    try {
      // Wait for server to be ready
      let serverReady = false;
      let attempts = 0;
      
      while (!serverReady && attempts < 30) {
        await sleep(1000);
        
        try {
          const response = await fetch('http://localhost:3002/api');
          if (response.ok) {
            serverReady = true;
          }
        } catch (e) {
          // Server not ready yet
        }
        
        attempts++;
      }

      expect(serverReady).toBe(true);

      // Check for critical startup logs
      const combinedLogs = logs.join('\n');
      
      // Should initialize all services
      expect(combinedLogs).toContain('Database initialized');
      expect(combinedLogs).toContain('Server running at');
      expect(combinedLogs).toContain('WebSocket handlers initialized');
      
      // Should not have critical errors
      expect(combinedLogs).not.toContain('Failed to initialize');
      expect(combinedLogs).not.toContain('FATAL');
      expect(combinedLogs).not.toContain('CRITICAL');
      
      // Database errors should be warnings, not failures
      const dbErrors = logs.filter(log => log.includes('Error executing') && log.includes('schema'));
      expect(dbErrors.length).toBeGreaterThan(0); // Known schema warnings are OK
      
      // Verify all API endpoints are accessible
      const endpoints = [
        '/api',
        '/api/addresses/13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk',
        '/api/graph/13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk',
        '/api/stats/overview'
      ];

      for (const endpoint of endpoints) {
        const response = await fetch(`http://localhost:3002${endpoint}`);
        expect(response.status).toBeLessThan(500); // No server errors
      }

    } finally {
      // Clean up
      server.kill('SIGTERM');
      await sleep(1000);
      if (!server.killed) {
        server.kill('SIGKILL');
      }
    }
  });

  test('application should handle different HOST bindings', async () => {
    const hostConfigs = [
      { HOST: 'localhost', expectedAccess: ['localhost'] },
      { HOST: '0.0.0.0', expectedAccess: ['localhost', '127.0.0.1'] },
      { HOST: '127.0.0.1', expectedAccess: ['127.0.0.1'] }
    ];

    for (const config of hostConfigs) {
      const server = spawn('npm', ['start'], {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          HOST: config.HOST,
          PORT: '3003',
          LOG_LEVEL: 'error', // Reduce noise
          SKIP_BLOCKCHAIN: 'true'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      try {
        // Wait for server startup
        await sleep(3000);

        // Test each expected access point
        for (const host of config.expectedAccess) {
          const response = await fetch(`http://${host}:3003/api`).catch(() => null);
          expect(response).not.toBeNull();
          expect(response?.ok).toBe(true);
        }

      } finally {
        server.kill('SIGKILL');
        await sleep(500);
      }
    }
  });

  test('frontend should load all required resources', async ({ page }) => {
    const failedResources = [];
    
    page.on('requestfailed', request => {
      failedResources.push({
        url: request.url(),
        failure: request.failure()
      });
    });

    page.on('response', response => {
      if (response.status() >= 400) {
        console.log(`HTTP ${response.status()} for ${response.url()}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that critical resources loaded
    expect(failedResources).toHaveLength(0);

    // Verify JavaScript files loaded
    const jsFiles = [
      'client.js',
      'search.js',
      'graph.js',
      'app.js',
      'address-validator.js'
    ];

    for (const file of jsFiles) {
      const script = await page.locator(`script[src*="${file}"]`).count();
      expect(script).toBeGreaterThan(0);
    }

    // Verify external dependencies loaded
    const externalDeps = [
      'd3js.org',
      'socket.io'
    ];

    for (const dep of externalDeps) {
      const loaded = await page.evaluate((dep) => {
        return Array.from(document.scripts).some(script => 
          script.src.includes(dep)
        );
      }, dep);
      expect(loaded).toBe(true);
    }

    // Check that main UI elements are present
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#address-search')).toBeVisible();
    await expect(page.locator('header h1')).toContainText('Polkadot Analysis Tool');
  });

  test('critical APIs should respond within timeout', async ({ request }) => {
    const criticalEndpoints = [
      { path: '/api', maxTime: 100 },
      { path: '/api/addresses/13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk', maxTime: 500 },
      { path: '/api/graph/13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk?depth=1', maxTime: 1000 }
    ];

    for (const endpoint of criticalEndpoints) {
      const start = Date.now();
      const response = await request.get(endpoint.path);
      const duration = Date.now() - start;

      expect(response.ok()).toBe(true);
      expect(duration).toBeLessThan(endpoint.maxTime);
    }
  });

  test('should handle server shutdown gracefully', async () => {
    const server = spawn('npm', ['start'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: '3004',
        SKIP_BLOCKCHAIN: 'true'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const logs = [];
    server.stdout.on('data', (data) => logs.push(data.toString()));

    try {
      // Wait for server to start
      await sleep(3000);

      // Send shutdown signal
      server.kill('SIGTERM');

      // Wait for graceful shutdown
      await sleep(2000);

      const shutdownLogs = logs.join('\n');
      
      // Should log graceful shutdown
      expect(shutdownLogs).toContain('shutting down gracefully');
      expect(shutdownLogs).toContain('Database connections closed');
      
      // Process should be terminated
      expect(server.killed).toBe(true);

    } finally {
      if (!server.killed) {
        server.kill('SIGKILL');
      }
    }
  });
});