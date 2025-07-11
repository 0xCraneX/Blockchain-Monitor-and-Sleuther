/**
 * Global Setup for E2E Tests
 * 
 * Handles server startup, database initialization, and test environment preparation
 * for end-to-end testing scenarios.
 */

const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const { createTestDatabase, seedTestData } = require('../setup.js');

let serverProcess = null;
let testDb = null;
const TEST_PORT = process.env.TEST_PORT || 3001;
const TEST_DB_PATH = path.join(__dirname, '../temp/e2e-test.db');

async function globalSetup() {
  console.log('🚀 Starting E2E Test Global Setup...');
  
  try {
    // 1. Prepare test database
    await setupTestDatabase();
    
    // 2. Start the application server
    await startTestServer();
    
    // 3. Verify server is ready
    await verifyServerHealth();
    
    // 4. Setup browser contexts
    await setupBrowserContext();
    
    console.log('✅ E2E Test Global Setup Complete');
    
    // Store global state for cleanup
    global.e2eTestState = {
      serverProcess,
      testDb,
      testDbPath: TEST_DB_PATH,
      testPort: TEST_PORT
    };
    
  } catch (error) {
    console.error('❌ E2E Test Global Setup Failed:', error);
    await cleanup();
    throw error;
  }
}

async function setupTestDatabase() {
  console.log('📊 Setting up test database...');
  
  // Ensure test directory exists
  const testDir = path.dirname(TEST_DB_PATH);
  await fs.mkdir(testDir, { recursive: true });
  
  // Create and seed test database
  testDb = await createTestDatabase(TEST_DB_PATH);
  const seedData = seedTestData(testDb);
  
  // Add additional test data for e2e scenarios
  await addE2ETestData(testDb);
  
  console.log('✅ Test database ready with seed data');
}

async function addE2ETestData(db) {
  // Add more comprehensive test data for e2e scenarios
  const additionalAccounts = [
    {
      address: '5E2E2testAddressForE2ESearching123456789ABCDEF',
      identity_display: 'E2E Test Account',
      balance: '5000000000000',
      total_transfers_in: 15,
      total_transfers_out: 10,
      volume_in: '15000000000000',
      volume_out: '10000000000000',
      first_seen_block: 1000000,
      last_seen_block: 2000000
    },
    {
      address: '5HIGHriskAddressForPatternTesting123456789ABCDEF',
      identity_display: 'High Risk Test',
      balance: '10000000000000',
      total_transfers_in: 100,
      total_transfers_out: 100,
      volume_in: '1000000000000000',
      volume_out: '1000000000000000',
      first_seen_block: 500000,
      last_seen_block: 2100000
    }
  ];
  
  const insertAccount = db.prepare(`
    INSERT INTO accounts (
      address, identity_display, balance, total_transfers_in, 
      total_transfers_out, volume_in, volume_out, first_seen_block, last_seen_block
    ) VALUES (
      @address, @identity_display, @balance, @total_transfers_in,
      @total_transfers_out, @volume_in, @volume_out, @first_seen_block, @last_seen_block
    )
  `);

  for (const account of additionalAccounts) {
    try {
      insertAccount.run(account);
    } catch (error) {
      // Ignore duplicate key errors
      if (!error.message.includes('UNIQUE constraint failed')) {
        throw error;
      }
    }
  }
}

async function startTestServer() {
  console.log(`🚀 Starting test server on port ${TEST_PORT}...`);
  
  return new Promise((resolve, reject) => {
    const serverScript = path.join(__dirname, '../../src/index.js');
    
    serverProcess = spawn('node', [serverScript], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: TEST_PORT,
        DATABASE_PATH: TEST_DB_PATH,
        LOG_LEVEL: 'warn' // Reduce log noise during tests
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    serverProcess.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes(`Server running at http://localhost:${TEST_PORT}`) || 
          output.includes('Server running at http://0.0.0.0:')) {
        console.log('✅ Test server started successfully');
        resolve();
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    serverProcess.on('error', (error) => {
      console.error('❌ Failed to start test server:', error);
      reject(error);
    });
    
    serverProcess.on('exit', (code) => {
      if (code !== 0) {
        console.error('❌ Test server exited with code:', code);
        console.error('STDERR:', errorOutput);
        reject(new Error(`Server exited with code ${code}`));
      }
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        reject(new Error('Server startup timeout'));
      }
    }, 30000);
  });
}

async function verifyServerHealth() {
  console.log('🔍 Verifying server health...');
  
  const fetch = require('node-fetch');
  const maxRetries = 10;
  const retryDelay = 1000;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`http://localhost:${TEST_PORT}/api`);
      if (response.ok) {
        const data = await response.json();
        if (data.name === 'Polkadot Analysis Tool API') {
          console.log('✅ Server health check passed');
          return;
        }
      }
    } catch (error) {
      // Expected during startup
    }
    
    await new Promise(resolve => setTimeout(resolve, retryDelay));
  }
  
  throw new Error('Server health check failed after retries');
}

async function setupBrowserContext() {
  console.log('🌐 Setting up browser context...');
  
  // Launch browser for shared context setup if needed
  const browser = await chromium.launch();
  const context = await browser.newContext();
  
  // Pre-warm the application by visiting the main page
  const page = await context.newPage();
  await page.goto(`http://localhost:${TEST_PORT}`);
  
  // Verify basic page load
  await page.waitForSelector('#app', { timeout: 10000 });
  
  await browser.close();
  console.log('✅ Browser context setup complete');
}

async function cleanup() {
  console.log('🧹 Cleaning up test resources...');
  
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    
    // Wait for graceful shutdown
    await new Promise(resolve => {
      serverProcess.on('exit', resolve);
      setTimeout(() => {
        if (!serverProcess.killed) {
          serverProcess.kill('SIGKILL');
          resolve();
        }
      }, 5000);
    });
  }
  
  if (testDb) {
    try {
      testDb.close();
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

module.exports = globalSetup;