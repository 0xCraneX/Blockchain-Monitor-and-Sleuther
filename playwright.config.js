import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'test-results/e2e-report' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
    ['list']
  ],
  
  use: {
    // Capture console logs and errors
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    
    // Set longer timeout for debugging
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  projects: [
    // Test with different origins
    {
      name: 'localhost',
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3001',
      },
    },
    {
      name: '127.0.0.1',
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3001',
      },
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        baseURL: 'http://localhost:3001',
      },
    },
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        baseURL: 'http://localhost:3001',
      },
    },
  ],

  // Run server before tests
  webServer: {
    command: 'HOST=0.0.0.0 npm start',
    port: 3001,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'debug',
      SKIP_BLOCKCHAIN: 'true'
    },
  },
});