#!/usr/bin/env node

import fetch from 'node-fetch';
import chalk from 'chalk';
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3001';
const LOG_DIR = path.join(__dirname, '../logs/debug-harness');
const LOG_FILE = path.join(LOG_DIR, `graph-debug-${Date.now()}.log`);

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Fetch wrapper with logging
async function apiRequest(endpoint, params = {}) {
  const startTime = performance.now();
  const url = new URL(endpoint, API_URL);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  
  const requestEntry = {
    timestamp: new Date().toISOString(),
    type: 'REQUEST',
    method: 'GET',
    url: url.toString(),
    params
  };
  
  log('REQUEST', requestEntry);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'GraphDebugHarness/1.0'
      }
    });
    
    const data = await response.json();
    const duration = performance.now() - startTime;
    
    const responseEntry = {
      timestamp: new Date().toISOString(),
      type: 'RESPONSE',
      status: response.status,
      statusText: response.statusText,
      duration: `${duration.toFixed(2)}ms`,
      dataSize: JSON.stringify(data).length,
      data
    };
    
    log('RESPONSE', responseEntry);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return { status: response.status, data };
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorEntry = {
      timestamp: new Date().toISOString(),
      type: 'RESPONSE_ERROR',
      error: error.message,
      duration: `${duration.toFixed(2)}ms`,
      stack: error.stack
    };
    
    log('RESPONSE_ERROR', errorEntry);
    throw error;
  }
}

// Logging functions
function log(type, data) {
  const logEntry = `[${type}] ${JSON.stringify(data, null, 2)}\n`;
  fs.appendFileSync(LOG_FILE, logEntry);
  
  // Console output with colors
  switch(type) {
    case 'REQUEST':
      console.log(chalk.blue(`[REQUEST] ${data.method} ${data.url}`));
      break;
    case 'RESPONSE':
      const statusColor = data.status >= 200 && data.status < 300 ? 'green' : 'red';
      console.log(chalk[statusColor](`[RESPONSE] ${data.status} ${data.statusText} (${data.duration})`));
      break;
    case 'RESPONSE_ERROR':
      console.log(chalk.red(`[ERROR] ${data.error} - Status: ${data.status}`));
      break;
    case 'TEST':
      console.log(chalk.yellow(`[TEST] ${data.name}`));
      break;
    case 'RESULT':
      const resultColor = data.success ? 'green' : 'red';
      console.log(chalk[resultColor](`[RESULT] ${data.test}: ${data.success ? 'PASSED' : 'FAILED'}`));
      break;
    default:
      console.log(`[${type}] ${JSON.stringify(data)}`);
  }
}

// Test scenarios
const testScenarios = [
  {
    name: 'Basic graph request with default parameters',
    endpoint: '/api/graph/15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu',
    params: {},
    description: 'Test the most basic graph request'
  },
  {
    name: 'Graph with depth=1',
    endpoint: '/api/graph/15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu',
    params: { depth: 1 },
    description: 'Test minimal depth graph'
  },
  {
    name: 'Graph with depth=5 and maxNodes=50',
    endpoint: '/api/graph/15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu',
    params: { depth: 5, maxNodes: 50 },
    description: 'Test maximum depth with node limit'
  },
  {
    name: 'Graph with minVolume filter',
    endpoint: '/api/graph/15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu',
    params: { minVolume: '1000000000000' }, // 1000 DOT
    description: 'Test volume filtering'
  },
  {
    name: 'Graph with direction=incoming',
    endpoint: '/api/graph/15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu',
    params: { direction: 'incoming' },
    description: 'Test incoming transactions only'
  },
  {
    name: 'Graph with direction=outgoing',
    endpoint: '/api/graph/15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu',
    params: { direction: 'outgoing' },
    description: 'Test outgoing transactions only'
  },
  {
    name: 'Graph with includeRiskScores=true',
    endpoint: '/api/graph/15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu',
    params: { includeRiskScores: true },
    description: 'Test risk score calculation'
  },
  {
    name: 'Invalid address format',
    endpoint: '/api/graph/invalid-address',
    params: {},
    description: 'Test error handling for invalid address',
    expectError: true
  },
  {
    name: 'Graph with invalid depth',
    endpoint: '/api/graph/15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu',
    params: { depth: 10 },
    description: 'Test validation for excessive depth',
    expectError: true
  },
  {
    name: 'Graph with multiple parameters',
    endpoint: '/api/graph/15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu',
    params: { 
      depth: 3, 
      maxNodes: 75, 
      minVolume: '100000000000',
      direction: 'both',
      includeRiskScores: true,
      layout: 'hierarchical'
    },
    description: 'Test complex query with multiple parameters'
  },
  {
    name: 'Different address - testing consistency',
    endpoint: '/api/graph/12H7nsDUrJUSCQQJrTKAFfyCWSactiSdjoVUixqcd9CZHTj',
    params: { depth: 2 },
    description: 'Test with a different address'
  },
  {
    name: 'Path finding between addresses',
    endpoint: '/api/graph/path',
    params: {
      from: '15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu',
      to: '12H7nsDUrJUSCQQJrTKAFfyCWSactiSdjoVUixqcd9CZHTj',
      maxDepth: 4
    },
    description: 'Test shortest path finding'
  },
  {
    name: 'Node metrics endpoint',
    endpoint: '/api/graph/metrics/15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu',
    params: {},
    description: 'Test node metrics calculation'
  },
  {
    name: 'Pattern detection endpoint',
    endpoint: '/api/graph/patterns/15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu',
    params: { depth: 2, timeWindow: 3600 },
    description: 'Test pattern detection'
  }
];

// Test runner
async function runTest(scenario) {
  const testId = Date.now();
  log('TEST', { 
    id: testId,
    name: scenario.name,
    description: scenario.description,
    endpoint: scenario.endpoint,
    params: scenario.params
  });

  try {
    const response = await apiRequest(scenario.endpoint, scenario.params);
    
    const result = {
      test: scenario.name,
      success: !scenario.expectError,
      status: response.status,
      dataReceived: true,
      nodeCount: response.data.nodes?.length || 0,
      edgeCount: response.data.links?.length || 0,
      hasMetadata: !!response.data.metadata,
      executionTime: response.data.metadata?.executionTime || 'N/A'
    };
    
    log('RESULT', result);
    return result;
  } catch (error) {
    const result = {
      test: scenario.name,
      success: scenario.expectError === true,
      error: error.message,
      status: null,
      errorCode: null
    };
    
    log('RESULT', result);
    return result;
  }
}

// Stress test function
async function stressTest(endpoint, params, requestCount = 10) {
  console.log(chalk.cyan(`\n[STRESS TEST] Running ${requestCount} concurrent requests...`));
  
  const promises = Array(requestCount).fill(null).map((_, index) => {
    return apiRequest(endpoint, params)
      .then(response => ({
        index,
        success: true,
        status: response.status
      }))
      .catch(error => ({
        index,
        success: false,
        error: error.message,
        status: null
      }));
  });
  
  const startTime = performance.now();
  const results = await Promise.all(promises);
  const totalDuration = performance.now() - startTime;
  
  const successCount = results.filter(r => r.success).length;
  console.log(chalk.cyan(`[STRESS TEST] Complete: ${successCount}/${requestCount} successful`));
  console.log(chalk.cyan(`[STRESS TEST] Total time: ${totalDuration.toFixed(2)}ms`));
  
  return { results, totalDuration, successCount };
}

// Environment comparison
async function compareEnvironments() {
  console.log(chalk.magenta('\n[ENVIRONMENT COMPARISON] Testing with and without SKIP_BLOCKCHAIN...'));
  
  const testEndpoint = '/api/graph/15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu';
  const testParams = { depth: 2, maxNodes: 50 };
  
  // Test with SKIP_BLOCKCHAIN
  process.env.SKIP_BLOCKCHAIN = 'true';
  console.log(chalk.magenta('[ENV] SKIP_BLOCKCHAIN=true'));
  const withSkipResults = [];
  for (let i = 0; i < 3; i++) {
    try {
      const response = await apiRequest(testEndpoint, testParams);
      withSkipResults.push({
        attempt: i + 1,
        nodeCount: response.data.nodes?.length || 0,
        edgeCount: response.data.links?.length || 0,
        dataSource: response.data.metadata?.dataSource || 'unknown'
      });
    } catch (error) {
      withSkipResults.push({
        attempt: i + 1,
        error: error.message
      });
    }
  }
  
  // Test without SKIP_BLOCKCHAIN
  delete process.env.SKIP_BLOCKCHAIN;
  console.log(chalk.magenta('[ENV] SKIP_BLOCKCHAIN=undefined'));
  const withoutSkipResults = [];
  for (let i = 0; i < 3; i++) {
    try {
      const response = await apiRequest(testEndpoint, testParams);
      withoutSkipResults.push({
        attempt: i + 1,
        nodeCount: response.data.nodes?.length || 0,
        edgeCount: response.data.links?.length || 0,
        dataSource: response.data.metadata?.dataSource || 'unknown'
      });
    } catch (error) {
      withoutSkipResults.push({
        attempt: i + 1,
        error: error.message
      });
    }
  }
  
  console.log(chalk.magenta('\n[COMPARISON RESULTS]'));
  console.log('With SKIP_BLOCKCHAIN:', withSkipResults);
  console.log('Without SKIP_BLOCKCHAIN:', withoutSkipResults);
  
  log('ENVIRONMENT_COMPARISON', {
    withSkipBlockchain: withSkipResults,
    withoutSkipBlockchain: withoutSkipResults
  });
}

// Main execution
async function main() {
  console.log(chalk.bold.cyan('\n🔍 Graph Endpoint Debug Harness'));
  console.log(chalk.gray(`API URL: ${API_URL}`));
  console.log(chalk.gray(`Log file: ${LOG_FILE}`));
  console.log(chalk.gray(`Started at: ${new Date().toISOString()}\n`));

  // Check if server is running by testing a simple endpoint
  try {
    await apiRequest('/api/graph/15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu', { depth: 1 });
    console.log(chalk.green('✓ Server is running (graph endpoint accessible)\n'));
  } catch (error) {
    if (error.message.includes('HTTP 404') || error.message.includes('real data service is not available')) {
      console.log(chalk.yellow('⚠ Server is running but RealDataService is not available (this is what we are debugging)\n'));
    } else if (error.message.includes('ECONNREFUSED')) {
      console.log(chalk.red('✗ Server is not accessible'));
      console.log(chalk.red(`  Please start the server at ${API_URL}`));
      process.exit(1);
    } else {
      console.log(chalk.yellow(`⚠ Server responded with error: ${error.message}\n`));
    }
  }

  // Run all test scenarios
  console.log(chalk.bold('\n📋 Running Test Scenarios:'));
  const results = [];
  for (const scenario of testScenarios) {
    const result = await runTest(scenario);
    results.push(result);
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(chalk.bold(`\n📊 Test Summary:`));
  console.log(chalk.green(`  Passed: ${passed}`));
  console.log(chalk.red(`  Failed: ${failed}`));
  console.log(chalk.gray(`  Total: ${results.length}`));

  // Run stress test
  await stressTest(
    '/api/graph/15KRsCq9LLNmCxNFhGk55s5bEyazKefunDxUH24GFZwsTxyu',
    { depth: 2, maxNodes: 50 },
    10
  );

  // Compare environments
  await compareEnvironments();

  // Performance analysis
  console.log(chalk.bold('\n⚡ Performance Analysis:'));
  const logContent = fs.readFileSync(LOG_FILE, 'utf-8');
  const responseEntries = logContent.split('\n')
    .filter(line => line.includes('[RESPONSE]'))
    .map(line => {
      try {
        const match = line.match(/"duration":\s*"(\d+\.?\d*)ms"/);
        return match ? parseFloat(match[1]) : null;
      } catch (e) {
        return null;
      }
    })
    .filter(d => d !== null);

  if (responseEntries.length > 0) {
    const avgDuration = responseEntries.reduce((a, b) => a + b, 0) / responseEntries.length;
    const minDuration = Math.min(...responseEntries);
    const maxDuration = Math.max(...responseEntries);
    
    console.log(`  Average response time: ${avgDuration.toFixed(2)}ms`);
    console.log(`  Min response time: ${minDuration.toFixed(2)}ms`);
    console.log(`  Max response time: ${maxDuration.toFixed(2)}ms`);
  }

  console.log(chalk.bold(`\n✅ Debug harness completed`));
  console.log(chalk.gray(`Full logs available at: ${LOG_FILE}`));
}

// Run the harness
main().catch(error => {
  console.error(chalk.red('\n❌ Fatal error:'), error);
  process.exit(1);
});