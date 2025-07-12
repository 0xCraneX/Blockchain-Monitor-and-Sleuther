#!/usr/bin/env node

/**
 * Pre-deployment Testing Script
 * 
 * Runs comprehensive checks that would have caught the issues we encountered:
 * - WebSocket CORS problems
 * - BigInt conversion errors  
 * - Server accessibility issues
 * - Console errors
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import chalk from 'chalk';

const sleep = promisify(setTimeout);

class PreDeploymentChecker {
  constructor() {
    this.results = {
      passed: [],
      failed: [],
      warnings: []
    };
    this.serverProcess = null;
  }

  log(message, type = 'info') {
    const prefix = {
      info: chalk.blue('ℹ'),
      success: chalk.green('✓'),
      error: chalk.red('✗'),
      warning: chalk.yellow('⚠')
    };

    console.log(`${prefix[type]} ${message}`);
  }

  async runCheck(name, checkFn) {
    this.log(`Running: ${name}`);
    try {
      await checkFn();
      this.results.passed.push(name);
      this.log(`${name} passed`, 'success');
    } catch (error) {
      this.results.failed.push({ name, error: error.message });
      this.log(`${name} failed: ${error.message}`, 'error');
    }
  }

  async startServer(host = '0.0.0.0', port = 3006) {
    this.log('Starting test server...');
    
    this.serverProcess = spawn('npm', ['start'], {
      env: {
        ...process.env,
        HOST: host,
        PORT: port,
        NODE_ENV: 'test',
        LOG_LEVEL: 'error',
        SKIP_BLOCKCHAIN: 'true'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Wait for server to be ready
    let ready = false;
    let attempts = 0;
    
    while (!ready && attempts < 30) {
      await sleep(1000);
      try {
        const response = await fetch(`http://localhost:${port}/api`);
        if (response.ok) ready = true;
      } catch (e) {
        // Not ready yet
      }
      attempts++;
    }

    if (!ready) {
      throw new Error('Server failed to start within 30 seconds');
    }

    this.log('Server started successfully', 'success');
    return port;
  }

  async stopServer() {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      await sleep(1000);
      if (!this.serverProcess.killed) {
        this.serverProcess.kill('SIGKILL');
      }
    }
  }

  async checkServerAccessibility() {
    const hosts = ['localhost', '127.0.0.1'];
    const port = await this.startServer('0.0.0.0', 3007);

    for (const host of hosts) {
      await this.runCheck(`Server accessible via ${host}`, async () => {
        const response = await fetch(`http://${host}:${port}/api`);
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }
      });
    }

    await this.stopServer();
  }

  async checkWebSocketCORS() {
    // Use Playwright to test WebSocket from browser context
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const port = await this.startServer('0.0.0.0', 3008);

    try {
      const origins = [
        'http://localhost:3008',
        'http://127.0.0.1:3008',
        'https://localhost:3008'
      ];

      for (const origin of origins) {
        await this.runCheck(`WebSocket CORS from ${origin}`, async () => {
          const context = await browser.newContext();
          const page = await context.newPage();
          
          await page.goto('about:blank');
          
          const result = await page.evaluate(async ({ origin, port }) => {
            return new Promise((resolve) => {
              const script = document.createElement('script');
              script.src = 'https://cdn.socket.io/4.6.1/socket.io.min.js';
              script.onload = () => {
                const socket = io(`http://localhost:${port}`, {
                  transports: ['websocket'],
                  extraHeaders: { 'Origin': origin }
                });

                const timeout = setTimeout(() => {
                  socket.close();
                  resolve({ success: false, error: 'Timeout' });
                }, 5000);

                socket.on('connect', () => {
                  clearTimeout(timeout);
                  socket.close();
                  resolve({ success: true });
                });

                socket.on('connect_error', (error) => {
                  clearTimeout(timeout);
                  socket.close();
                  resolve({ success: false, error: error.message });
                });
              };
              document.head.appendChild(script);
            });
          }, { origin, port });

          await context.close();
          
          if (!result.success) {
            throw new Error(`WebSocket connection failed: ${result.error}`);
          }
        });
      }
    } finally {
      await browser.close();
      await this.stopServer();
    }
  }

  async checkAPIEndpoints() {
    const port = await this.startServer('localhost', 3009);
    
    const criticalEndpoints = [
      '/api',
      '/api/addresses/13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk',
      '/api/graph/13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk?depth=1',
      '/api/stats/overview'
    ];

    for (const endpoint of criticalEndpoints) {
      await this.runCheck(`API endpoint ${endpoint}`, async () => {
        const response = await fetch(`http://localhost:${port}${endpoint}`);
        if (response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        }
      });
    }

    await this.stopServer();
  }

  async checkDataHandling() {
    const port = await this.startServer('localhost', 3010);
    
    // Test problematic data that caused BigInt errors
    const testCases = [
      { value: '2125631908873738.8', description: 'Decimal value' },
      { value: '1.23e15', description: 'Scientific notation' },
      { value: Number.MAX_SAFE_INTEGER.toString(), description: 'Max safe integer' }
    ];

    for (const testCase of testCases) {
      await this.runCheck(`Handle ${testCase.description}`, async () => {
        const response = await fetch(
          `http://localhost:${port}/api/graph/test-address?minVolume=${testCase.value}`
        );
        
        // Should either succeed or return validation error, not crash
        if (response.status === 500) {
          const body = await response.text();
          if (body.includes('BigInt') || body.includes('TypeError')) {
            throw new Error('BigInt conversion error not handled');
          }
        }
      });
    }

    await this.stopServer();
  }

  async checkBrowserConsole() {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const port = await this.startServer('0.0.0.0', 3011);

    try {
      await this.runCheck('No browser console errors', async () => {
        const page = await browser.newPage();
        const errors = [];
        
        page.on('console', msg => {
          if (msg.type() === 'error') {
            errors.push(msg.text());
          }
        });
        
        page.on('pageerror', err => {
          errors.push(err.message);
        });

        await page.goto(`http://localhost:${port}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        if (errors.length > 0) {
          throw new Error(`Console errors detected:\n${errors.join('\n')}`);
        }
      });
    } finally {
      await browser.close();
      await this.stopServer();
    }
  }

  async checkSecurityHeaders() {
    const port = await this.startServer('localhost', 3012);
    
    await this.runCheck('Security headers present', async () => {
      const response = await fetch(`http://localhost:${port}/`);
      const headers = response.headers;
      
      const requiredHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection'
      ];
      
      const missing = requiredHeaders.filter(h => !headers.get(h));
      if (missing.length > 0) {
        throw new Error(`Missing security headers: ${missing.join(', ')}`);
      }
    });

    await this.stopServer();
  }

  async generateReport() {
    console.log('\n' + chalk.bold('=== Pre-Deployment Check Results ===\n'));
    
    if (this.results.passed.length > 0) {
      console.log(chalk.green.bold(`✓ Passed (${this.results.passed.length}):`));
      this.results.passed.forEach(test => {
        console.log(chalk.green(`  ✓ ${test}`));
      });
    }
    
    if (this.results.failed.length > 0) {
      console.log('\n' + chalk.red.bold(`✗ Failed (${this.results.failed.length}):`));
      this.results.failed.forEach(({ name, error }) => {
        console.log(chalk.red(`  ✗ ${name}`));
        console.log(chalk.red(`    ${error}`));
      });
    }
    
    if (this.results.warnings.length > 0) {
      console.log('\n' + chalk.yellow.bold(`⚠ Warnings (${this.results.warnings.length}):`));
      this.results.warnings.forEach(warning => {
        console.log(chalk.yellow(`  ⚠ ${warning}`));
      });
    }
    
    const total = this.results.passed.length + this.results.failed.length;
    const passRate = (this.results.passed.length / total * 100).toFixed(1);
    
    console.log('\n' + chalk.bold('Summary:'));
    console.log(`  Total checks: ${total}`);
    console.log(`  Pass rate: ${passRate}%`);
    
    if (this.results.failed.length > 0) {
      console.log('\n' + chalk.red.bold('❌ Pre-deployment checks FAILED'));
      console.log(chalk.red('Please fix the issues above before deploying.'));
      process.exit(1);
    } else {
      console.log('\n' + chalk.green.bold('✅ All pre-deployment checks PASSED'));
      process.exit(0);
    }
  }

  async run() {
    console.log(chalk.bold('🚀 Running Pre-Deployment Checks...\n'));
    
    try {
      // Core functionality checks
      await this.checkServerAccessibility();
      await this.checkAPIEndpoints();
      
      // Security checks
      await this.checkWebSocketCORS();
      await this.checkSecurityHeaders();
      
      // Data handling checks
      await this.checkDataHandling();
      
      // Browser compatibility
      await this.checkBrowserConsole();
      
    } catch (error) {
      this.log(`Unexpected error: ${error.message}`, 'error');
      this.results.failed.push({
        name: 'Pre-deployment check execution',
        error: error.message
      });
    } finally {
      // Ensure server is stopped
      await this.stopServer();
    }
    
    await this.generateReport();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const checker = new PreDeploymentChecker();
  checker.run().catch(console.error);
}

export default PreDeploymentChecker;