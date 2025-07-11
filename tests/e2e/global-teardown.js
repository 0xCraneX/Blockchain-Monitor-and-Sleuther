/**
 * Global Teardown for E2E Tests
 * 
 * Handles cleanup of server processes, test databases, and temporary files
 * after end-to-end test execution.
 */

const fs = require('fs/promises');
const path = require('path');

async function globalTeardown() {
  console.log('🧹 Starting E2E Test Global Teardown...');
  
  try {
    const testState = global.e2eTestState;
    
    if (testState) {
      // 1. Stop server process
      await stopTestServer(testState.serverProcess);
      
      // 2. Close database connections
      await closeDatabaseConnections(testState.testDb);
      
      // 3. Clean up test files
      await cleanupTestFiles(testState.testDbPath);
      
      // 4. Clean up temporary test data
      await cleanupTempDirectory();
    }
    
    console.log('✅ E2E Test Global Teardown Complete');
    
  } catch (error) {
    console.error('❌ E2E Test Global Teardown Error:', error);
    // Don't throw - teardown should be best effort
  }
}

async function stopTestServer(serverProcess) {
  if (!serverProcess) {
    return;
  }
  
  console.log('🛑 Stopping test server...');
  
  return new Promise((resolve) => {
    if (serverProcess.killed) {
      resolve();
      return;
    }
    
    // Try graceful shutdown first
    serverProcess.kill('SIGTERM');
    
    let resolved = false;
    
    serverProcess.on('exit', () => {
      if (!resolved) {
        console.log('✅ Test server stopped gracefully');
        resolved = true;
        resolve();
      }
    });
    
    // Force kill after timeout
    setTimeout(() => {
      if (!resolved && !serverProcess.killed) {
        console.log('⚠️ Force killing test server...');
        serverProcess.kill('SIGKILL');
        resolved = true;
        resolve();
      }
    }, 5000);
  });
}

async function closeDatabaseConnections(db) {
  if (!db) {
    return;
  }
  
  console.log('📊 Closing database connections...');
  
  try {
    if (db.open) {
      db.close();
    }
    console.log('✅ Database connections closed');
  } catch (error) {
    console.warn('⚠️ Error closing database:', error.message);
  }
}

async function cleanupTestFiles(testDbPath) {
  if (!testDbPath) {
    return;
  }
  
  console.log('🗂️ Cleaning up test database files...');
  
  try {
    // Remove main database file
    await fs.unlink(testDbPath).catch(() => {});
    
    // Remove WAL and SHM files
    await fs.unlink(`${testDbPath}-wal`).catch(() => {});
    await fs.unlink(`${testDbPath}-shm`).catch(() => {});
    
    console.log('✅ Test database files cleaned up');
  } catch (error) {
    console.warn('⚠️ Error cleaning up test files:', error.message);
  }
}

async function cleanupTempDirectory() {
  console.log('🗂️ Cleaning up temporary test directory...');
  
  const tempDir = path.join(__dirname, '../temp');
  
  try {
    // Remove all files in temp directory
    const files = await fs.readdir(tempDir).catch(() => []);
    
    for (const file of files) {
      if (file.startsWith('e2e-test') || file.startsWith('test-')) {
        await fs.unlink(path.join(tempDir, file)).catch(() => {});
      }
    }
    
    console.log('✅ Temporary test directory cleaned up');
  } catch (error) {
    console.warn('⚠️ Error cleaning up temp directory:', error.message);
  }
}

module.exports = globalTeardown;