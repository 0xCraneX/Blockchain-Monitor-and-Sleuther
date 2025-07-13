#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

console.log('🧪 Polkadot Analysis Tool Test Runner');
console.log('====================================\n');

async function runTests() {
  try {
    // Check if vitest is available
    const packageJson = JSON.parse(await fs.readFile('./package.json', 'utf8'));
    
    console.log('📋 Test Configuration:');
    console.log(`   Test Command: ${packageJson.scripts.test}`);
    console.log(`   Node Version: ${process.version}`);
    console.log(`   Working Directory: ${process.cwd()}\n`);
    
    // Try to run vitest
    console.log('🚀 Running test suite...\n');
    
    const testProcess = spawn('npx', ['vitest', 'run', '--reporter=verbose'], {
      stdio: 'inherit',
      shell: true
    });
    
    testProcess.on('close', (code) => {
      console.log(`\n📊 Test process exited with code: ${code}`);
      if (code === 0) {
        console.log('✅ All tests passed!');
      } else {
        console.log('❌ Some tests failed or there were errors');
      }
    });
    
    testProcess.on('error', (error) => {
      console.error('❌ Failed to start test process:', error.message);
      
      // Try fallback to npm test
      console.log('\n🔄 Trying fallback: npm test...\n');
      
      const npmProcess = spawn('npm', ['test'], {
        stdio: 'inherit',
        shell: true
      });
      
      npmProcess.on('close', (code) => {
        console.log(`\n📊 NPM test process exited with code: ${code}`);
      });
      
      npmProcess.on('error', (error) => {
        console.error('❌ NPM test also failed:', error.message);
        console.log('\n📋 Manual test analysis required');
        
        // Show test files found
        analyzeTestStructure();
      });
    });
    
  } catch (error) {
    console.error('❌ Error in test runner:', error.message);
    await analyzeTestStructure();
  }
}

async function analyzeTestStructure() {
  console.log('\n🔍 Analyzing test structure...\n');
  
  try {
    const testDirs = ['tests/unit', 'tests/integration', 'tests/performance'];
    let totalTests = 0;
    
    for (const dir of testDirs) {
      try {
        const files = await fs.readdir(dir, { recursive: true });
        const testFiles = files.filter(file => file.endsWith('.test.js'));
        
        console.log(`📁 ${dir}: ${testFiles.length} test files`);
        
        for (const file of testFiles) {
          console.log(`   - ${file}`);
          totalTests++;
        }
        console.log();
      } catch (error) {
        console.log(`📁 ${dir}: Directory not accessible`);
      }
    }
    
    console.log(`📊 Total test files found: ${totalTests}`);
    
    // Check for common issues
    console.log('\n🔧 Checking for common issues...');
    
    // Check if node_modules exists
    try {
      await fs.access('./node_modules');
      console.log('✅ node_modules directory exists');
    } catch {
      console.log('❌ node_modules directory missing - run npm install');
    }
    
    // Check if database schema files exist
    try {
      await fs.access('./src/database/schema.sql');
      console.log('✅ Main database schema exists');
    } catch {
      console.log('❌ Main database schema missing');
    }
    
    try {
      await fs.access('./src/database/graph-schema.sql');
      console.log('✅ Graph database schema exists');
    } catch {
      console.log('❌ Graph database schema missing');
    }
    
  } catch (error) {
    console.error('❌ Error analyzing test structure:', error.message);
  }
}

// Run the tests
runTests();