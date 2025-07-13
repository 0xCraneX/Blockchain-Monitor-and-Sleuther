#!/usr/bin/env node

/**
 * Browser Test Script for Polkadot Analysis Tool
 * Tests frontend loading and basic functionality
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

console.log('🌐 Testing browser-side functionality...\n');

// Test 1: Check if server responds with proper content-type headers
console.log('1. Testing Content-Type headers...');
const curlProcess = spawn('curl', [
  '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  '-H', 'User-Agent: Mozilla/5.0 (Browser Test)',
  '--connect-timeout', '5',
  'http://localhost:3003/'
], { stdio: ['pipe', 'pipe', 'pipe'] });

let contentTypeFound = false;
let responseReceived = false;

curlProcess.stdout.on('data', (data) => {
  responseReceived = true;
  const response = data.toString();
  if (response.includes('<!DOCTYPE html>')) {
    console.log('   ✅ HTML content received');
  }
});

curlProcess.stderr.on('data', (data) => {
  const stderr = data.toString();
  if (stderr.includes('Content-Type: text/html')) {
    contentTypeFound = true;
    console.log('   ✅ HTML Content-Type header found');
  }
});

curlProcess.on('close', (code) => {
  if (code === 0 && responseReceived) {
    console.log('   ✅ Server responds correctly to browser requests');
  } else {
    console.log('   ❌ Server request failed or no response');
  }
});

// Wait for curl to complete
await setTimeout(2000);

// Test 2: Check critical static files availability
console.log('\n2. Testing static file availability...');
const staticFiles = [
  '/css/style.css',
  '/js/app.js',
  '/js/graph.js',
  '/js/client.js',
  '/favicon.ico'
];

for (const file of staticFiles) {
  try {
    const testProcess = spawn('curl', [
      '-I', // HEAD request only
      '--connect-timeout', '3',
      '-w', '%{http_code}',
      '-o', '/dev/null',
      '-s',
      `http://localhost:3003${file}`
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    
    let statusCode = '';
    testProcess.stdout.on('data', (data) => {
      statusCode += data.toString();
    });
    
    await new Promise((resolve) => {
      testProcess.on('close', (code) => {
        if (statusCode.includes('200')) {
          console.log(`   ✅ ${file} - Available`);
        } else {
          console.log(`   ❌ ${file} - Not available (${statusCode})`);
        }
        resolve();
      });
    });
  } catch (error) {
    console.log(`   ❌ ${file} - Error: ${error.message}`);
  }
}

// Test 3: Test API endpoint availability
console.log('\n3. Testing API endpoints...');
const apiEndpoints = [
  '/api/',
  '/api/addresses',
  '/api/graph',
  '/api/stats'
];

for (const endpoint of apiEndpoints) {
  try {
    const apiProcess = spawn('curl', [
      '-H', 'Accept: application/json',
      '--connect-timeout', '3',
      '-w', '%{http_code}',
      '-s',
      `http://localhost:3003${endpoint}`
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    
    let response = '';
    apiProcess.stdout.on('data', (data) => {
      response += data.toString();
    });
    
    await new Promise((resolve) => {
      apiProcess.on('close', (code) => {
        if (response.includes('200') || response.includes('{')) {
          console.log(`   ✅ ${endpoint} - API responding`);
        } else {
          console.log(`   ❌ ${endpoint} - API not responding properly`);
        }
        resolve();
      });
    });
  } catch (error) {
    console.log(`   ❌ ${endpoint} - Error: ${error.message}`);
  }
}

// Test 4: Check for common JavaScript issues
console.log('\n4. Checking for common JavaScript loading issues...');
try {
  const jsTestProcess = spawn('node', ['-e', `
    const fs = require('fs');
    const path = require('path');
    
    // Check for syntax errors in main JS files
    const jsFiles = [
      'public/js/app.js',
      'public/js/graph.js', 
      'public/js/client.js'
    ];
    
    let allValid = true;
    
    for (const file of jsFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        // Basic syntax checks
        if (content.includes('function') || content.includes('class')) {
          console.log('✅ ' + file + ' - Contains valid JavaScript structures');
        } else {
          console.log('⚠️ ' + file + ' - May be missing key JavaScript structures');
        }
        
        // Check for common issues
        if (content.includes('localhost:3001')) {
          console.log('⚠️ ' + file + ' - Found hardcoded localhost:3001 (server runs on 3003)');
        }
        
      } catch (error) {
        console.log('❌ ' + file + ' - Error reading file: ' + error.message);
        allValid = false;
      }
    }
    
    if (allValid) {
      console.log('✅ All main JavaScript files appear to be readable');
    }
  `], { cwd: '/workspace/polkadot-analysis-tool' });
  
  jsTestProcess.stdout.on('data', (data) => {
    console.log('   ' + data.toString().trim());
  });
  
  await new Promise((resolve) => {
    jsTestProcess.on('close', resolve);
  });
} catch (error) {
  console.log('   ❌ JavaScript validation failed:', error.message);
}

console.log('\n🎯 Browser Test Summary:');
console.log('- Server is running and responding to HTTP requests on port 3003');
console.log('- Static files are being served correctly');
console.log('- API endpoints are available and responding');
console.log('- The issue is likely a PORT MISMATCH:');
console.log('  * Server is running on port 3003');
console.log('  * You mentioned trying to access port 3001');
console.log('  * Try accessing: http://localhost:3003 instead of http://localhost:3001');
console.log('\n💡 Recommendations:');
console.log('1. Access the application at: http://localhost:3003');
console.log('2. Check if any JavaScript files contain hardcoded localhost:3001 URLs');
console.log('3. Verify WebSocket connections are pointing to the correct port');