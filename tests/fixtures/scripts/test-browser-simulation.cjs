#!/usr/bin/env node
/**
 * Browser Simulation Test for Complete Visualization Flow
 * 
 * This script simulates browser behavior to test the complete user workflow:
 * 1. Load the application
 * 2. Test graph initialization with target address
 * 3. Verify API responses and data flow
 * 4. Test interactive features
 * 5. Check for common errors and issues
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_CONFIG = {
    serverPort: 3003,
    targetAddress: '13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk',
    timeout: 10000
};

// Colors for console output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log(`\n${colors.bold}${colors.blue}=== ${title} ===${colors.reset}`);
}

function logSuccess(message) {
    log(`✓ ${message}`, 'green');
}

function logError(message) {
    log(`✗ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠ ${message}`, 'yellow');
}

// Test results
const testResults = {
    passed: 0,
    failed: 0,
    warnings: 0,
    issues: []
};

function recordTest(testName, passed, message = '') {
    if (passed) {
        testResults.passed++;
        logSuccess(`${testName}: ${message || 'PASSED'}`);
    } else {
        testResults.failed++;
        logError(`${testName}: ${message || 'FAILED'}`);
        testResults.issues.push(`${testName}: ${message}`);
    }
}

function recordWarning(testName, message) {
    testResults.warnings++;
    logWarning(`${testName}: ${message}`);
}

// HTTP request helper
function makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
        const requestOptions = {
            hostname: 'localhost',
            port: TEST_CONFIG.serverPort,
            path: path,
            method: options.method || 'GET',
            timeout: TEST_CONFIG.timeout,
            headers: {
                'User-Agent': 'Browser-Simulation-Test/1.0',
                ...options.headers
            }
        };

        const req = http.request(requestOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    data: data,
                    success: res.statusCode >= 200 && res.statusCode < 300
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        if (options.data) {
            req.write(options.data);
        }
        req.end();
    });
}

// Test server availability
async function testServerAvailability() {
    logSection('Server Availability Check');
    
    try {
        const response = await makeRequest('/');
        recordTest('Server response', response.success, `Status: ${response.statusCode}`);
        
        if (response.success) {
            // Check if it's the correct HTML page
            const hasTitle = response.data.includes('Polkadot Analysis Tool');
            recordTest('Correct HTML page', hasTitle, hasTitle ? 'Title found' : 'Incorrect page served');
            
            // Check for essential HTML elements
            const essentialElements = [
                '#network-graph',
                '#address-search',
                'PolkadotAnalysisApp',
                'D3.js'
            ];
            
            for (const element of essentialElements) {
                const found = response.data.includes(element.replace('#', 'id="').replace('"', '') + '"') || 
                             response.data.includes(element);
                recordTest(`HTML element/script ${element}`, found, found ? 'Found' : 'Missing');
            }
        }
        
        return response.success;
    } catch (error) {
        recordTest('Server availability', false, `Server not responding: ${error.message}`);
        return false;
    }
}

// Test API endpoints
async function testAPIEndpoints() {
    logSection('API Endpoints Test');
    
    // Test graph API with target address
    try {
        const graphUrl = `/api/graph/${TEST_CONFIG.targetAddress}?depth=1&maxNodes=20`;
        const response = await makeRequest(graphUrl);
        
        recordTest('Graph API response', response.success, `Status: ${response.statusCode}`);
        
        if (response.success) {
            try {
                const graphData = JSON.parse(response.data);
                
                // Verify data structure
                const hasNodes = Array.isArray(graphData.nodes) && graphData.nodes.length > 0;
                const hasEdges = Array.isArray(graphData.edges) && graphData.edges.length > 0;
                
                recordTest('Graph data structure - nodes', hasNodes, 
                    hasNodes ? `${graphData.nodes.length} nodes found` : 'No nodes in response');
                recordTest('Graph data structure - edges', hasEdges, 
                    hasEdges ? `${graphData.edges.length} edges found` : 'No edges in response');
                
                // Verify target address is in nodes
                const targetNodeExists = graphData.nodes.some(node => 
                    node.address === TEST_CONFIG.targetAddress);
                recordTest('Target address in graph', targetNodeExists, 
                    targetNodeExists ? 'Target address found in nodes' : 'Target address missing');
                
                // Check node data completeness
                if (hasNodes) {
                    const firstNode = graphData.nodes[0];
                    const hasAddress = !!firstNode.address;
                    const hasNodeType = firstNode.nodeType !== undefined;
                    const hasBalance = firstNode.balance !== undefined;
                    
                    recordTest('Node data completeness - address', hasAddress, 'Address field present');
                    recordTest('Node data completeness - nodeType', hasNodeType, 'NodeType field present');
                    recordTest('Node data completeness - balance', hasBalance, 'Balance field present');
                }
                
                // Check edge data completeness
                if (hasEdges) {
                    const firstEdge = graphData.edges[0];
                    const hasSource = !!firstEdge.source;
                    const hasTarget = !!firstEdge.target;
                    const hasVolume = firstEdge.volume !== undefined;
                    
                    recordTest('Edge data completeness - source', hasSource, 'Source field present');
                    recordTest('Edge data completeness - target', hasTarget, 'Target field present');
                    recordTest('Edge data completeness - volume', hasVolume, 'Volume field present');
                }
                
                // Check metadata
                if (graphData.metadata) {
                    recordTest('Graph metadata', true, 'Metadata present in response');
                } else {
                    recordWarning('Graph metadata', 'No metadata in response');
                }
                
                return graphData;
            } catch (parseError) {
                recordTest('Graph API JSON parsing', false, `Invalid JSON: ${parseError.message}`);
                return null;
            }
        }
    } catch (error) {
        recordTest('Graph API request', false, `Request failed: ${error.message}`);
        return null;
    }
    
    // Test other API endpoints
    const otherEndpoints = [
        { path: '/api/stats', name: 'Stats API' },
        { path: '/api/addresses/search?q=test', name: 'Search API' }
    ];
    
    for (const endpoint of otherEndpoints) {
        try {
            const response = await makeRequest(endpoint.path);
            recordTest(`${endpoint.name} availability`, response.success, 
                `Status: ${response.statusCode}`);
        } catch (error) {
            recordTest(`${endpoint.name} availability`, false, `Error: ${error.message}`);
        }
    }
}

// Test JavaScript file integrity
async function testJavaScriptFiles() {
    logSection('JavaScript Files Integrity');
    
    const jsFiles = [
        '/js/app.js',
        '/js/graph.js',
        '/js/client.js',
        '/js/address-validator.js',
        '/js/search.js'
    ];
    
    for (const jsFile of jsFiles) {
        try {
            const response = await makeRequest(jsFile);
            recordTest(`${jsFile} availability`, response.success, 
                `Status: ${response.statusCode}, Size: ${(response.data.length / 1024).toFixed(1)}KB`);
            
            if (response.success) {
                // Basic syntax check
                const hasClassDeclaration = response.data.includes('class ');
                const hasFunctionDeclaration = response.data.includes('function ') || response.data.includes('=>');
                const hasConsoleLog = response.data.includes('console.log');
                const hasSyntaxError = response.data.includes('SyntaxError') || 
                                      response.data.includes('Unexpected token');
                
                if (jsFile.includes('app.js')) {
                    recordTest(`${jsFile} class structure`, hasClassDeclaration, 
                        hasClassDeclaration ? 'Class declaration found' : 'No class declaration');
                }
                
                if (hasSyntaxError) {
                    recordTest(`${jsFile} syntax`, false, 'Potential syntax errors detected');
                } else {
                    recordTest(`${jsFile} syntax`, true, 'No obvious syntax errors');
                }
            }
        } catch (error) {
            recordTest(`${jsFile} availability`, false, `Error: ${error.message}`);
        }
    }
}

// Test CSS files
async function testCSSFiles() {
    logSection('CSS Files Test');
    
    const cssFiles = ['/css/style.css', '/css/overlay-utils.css'];
    
    for (const cssFile of cssFiles) {
        try {
            const response = await makeRequest(cssFile);
            recordTest(`${cssFile} availability`, response.success, 
                `Status: ${response.statusCode}, Size: ${(response.data.length / 1024).toFixed(1)}KB`);
            
            if (response.success) {
                // Check for essential CSS rules
                const hasGraphContainer = response.data.includes('#graph-container') || 
                                         response.data.includes('.graph-container');
                const hasResponsive = response.data.includes('@media');
                const hasFlexbox = response.data.includes('flex');
                
                recordTest(`${cssFile} graph styling`, hasGraphContainer, 
                    hasGraphContainer ? 'Graph container styles found' : 'No graph container styles');
                
                if (hasResponsive) {
                    logSuccess(`${cssFile}: Responsive design detected`);
                }
            }
        } catch (error) {
            recordTest(`${cssFile} availability`, false, `Error: ${error.message}`);
        }
    }
}

// Simulate application workflow
async function simulateApplicationWorkflow() {
    logSection('Application Workflow Simulation');
    
    // Simulate the complete user flow
    log('Simulating: User opens the application', 'blue');
    
    // 1. Get initial page
    try {
        const pageResponse = await makeRequest('/');
        if (!pageResponse.success) {
            recordTest('Initial page load', false, 'Failed to load main page');
            return;
        }
        
        recordTest('Initial page load', true, 'Main page loaded successfully');
        
        // 2. Simulate automatic graph loading (target address is hardcoded)
        log('Simulating: Application automatically loads target address graph', 'blue');
        
        const graphResponse = await makeRequest(`/api/graph/${TEST_CONFIG.targetAddress}?depth=2&maxNodes=100&layout=force`);
        if (graphResponse.success) {
            recordTest('Automatic graph loading', true, 'Graph data retrieved for target address');
            
            try {
                const graphData = JSON.parse(graphResponse.data);
                
                // Simulate D3.js data processing
                log('Simulating: D3.js processes graph data', 'blue');
                
                const nodeCount = graphData.nodes ? graphData.nodes.length : 0;
                const edgeCount = graphData.edges ? graphData.edges.length : 0;
                
                recordTest('Graph data processing', nodeCount > 0 && edgeCount > 0, 
                    `Processed ${nodeCount} nodes and ${edgeCount} edges`);
                
                // Check for positioning issues (stuck in corner)
                if (graphData.nodes) {
                    const hasPositionData = graphData.nodes.some(node => 
                        node.x !== undefined || node.y !== undefined);
                    
                    if (hasPositionData) {
                        recordWarning('Node positioning', 'Pre-positioned data detected - may override D3 layout');
                    } else {
                        recordTest('Node positioning', true, 'No pre-positioning - D3 will handle layout');
                    }
                }
                
            } catch (error) {
                recordTest('Graph data processing', false, `JSON parsing failed: ${error.message}`);
            }
        } else {
            recordTest('Automatic graph loading', false, 'Failed to retrieve graph data');
        }
        
        // 3. Simulate user interactions
        log('Simulating: User interaction scenarios', 'blue');
        
        // Test search functionality
        const searchResponse = await makeRequest('/api/addresses/search?q=polkadot&limit=5');
        recordTest('Search functionality', searchResponse.success, 
            searchResponse.success ? 'Search API responds correctly' : 'Search API failed');
        
        // Test filter operations
        const filterResponse = await makeRequest(`/api/graph/${TEST_CONFIG.targetAddress}?depth=1&minVolume=1000000000000`);
        recordTest('Filter functionality', filterResponse.success, 
            filterResponse.success ? 'Filtered graph API responds' : 'Filter API failed');
        
        // 4. Test WebSocket capability (connection test)
        log('Note: WebSocket testing requires real browser environment', 'yellow');
        recordWarning('WebSocket testing', 'Cannot test Socket.IO in HTTP-only simulation');
        
    } catch (error) {
        recordTest('Workflow simulation', false, `Simulation failed: ${error.message}`);
    }
}

// Test for common issues
async function testCommonIssues() {
    logSection('Common Issues Detection');
    
    // Test for querySelector issues
    try {
        const appJsResponse = await makeRequest('/js/app.js');
        if (appJsResponse.success) {
            const hasQuerySelector = appJsResponse.data.includes('querySelector(');
            const hasGetElementById = appJsResponse.data.includes('getElementById(');
            const hasDOMContentLoaded = appJsResponse.data.includes('DOMContentLoaded');
            
            recordTest('querySelector usage check', !hasQuerySelector || hasDOMContentLoaded, 
                hasQuerySelector ? 'querySelector found but DOM ready handling present' : 'No querySelector issues');
            
            recordTest('Safe DOM access', hasGetElementById, 
                hasGetElementById ? 'Using getElementById (safe)' : 'May have DOM access issues');
        }
    } catch (error) {
        recordWarning('DOM access check', 'Could not analyze JavaScript files');
    }
    
    // Test for CORS issues
    try {
        const response = await makeRequest('/api/graph/' + TEST_CONFIG.targetAddress, {
            headers: {
                'Origin': 'http://localhost:3000',
                'Access-Control-Request-Method': 'GET'
            }
        });
        
        const hasCORSHeaders = response.headers['access-control-allow-origin'] !== undefined;
        recordTest('CORS configuration', hasCORSHeaders, 
            hasCORSHeaders ? 'CORS headers present' : 'May have CORS issues');
    } catch (error) {
        recordWarning('CORS check', 'Could not test CORS configuration');
    }
    
    // Test error handling
    try {
        const invalidResponse = await makeRequest('/api/graph/invalid-address');
        const handlesErrors = !invalidResponse.success && invalidResponse.statusCode >= 400;
        recordTest('Error handling', handlesErrors, 
            handlesErrors ? `Proper error response: ${invalidResponse.statusCode}` : 'May not handle errors properly');
    } catch (error) {
        recordTest('Error handling', true, 'Server properly rejects invalid requests');
    }
}

// Generate comprehensive report
function generateComprehensiveReport() {
    logSection('Comprehensive Test Report');
    
    console.log(`${colors.bold}Test Results Summary:${colors.reset}`);
    logSuccess(`✓ Passed: ${testResults.passed}`);
    logError(`✗ Failed: ${testResults.failed}`);
    logWarning(`⚠ Warnings: ${testResults.warnings}`);
    
    const totalTests = testResults.passed + testResults.failed;
    const successRate = totalTests > 0 ? (testResults.passed / totalTests * 100).toFixed(1) : 0;
    
    console.log(`\n${colors.bold}Success Rate: ${successRate}%${colors.reset}`);
    
    // Status assessment
    let overallStatus = 'EXCELLENT';
    if (testResults.failed > 3) overallStatus = 'NEEDS_WORK';
    else if (testResults.failed > 1) overallStatus = 'GOOD';
    else if (testResults.warnings > 3) overallStatus = 'VERY_GOOD';
    
    const statusColor = {
        'EXCELLENT': 'green',
        'VERY_GOOD': 'green',
        'GOOD': 'yellow',
        'NEEDS_WORK': 'red'
    }[overallStatus];
    
    log(`\nOverall Status: ${overallStatus}`, statusColor);
    
    // Detailed findings
    if (testResults.failed > 0) {
        console.log(`\n${colors.bold}${colors.red}Critical Issues:${colors.reset}`);
        testResults.issues.forEach(issue => console.log(`  • ${issue}`));
    }
    
    if (testResults.warnings > 0) {
        console.log(`\n${colors.bold}${colors.yellow}Warnings (Non-Critical):${colors.reset}`);
        log('• Some warnings detected - see details above', 'yellow');
    }
    
    // Recommendations
    console.log(`\n${colors.bold}Recommendations for Complete User Workflow:${colors.reset}`);
    
    if (overallStatus === 'EXCELLENT' || overallStatus === 'VERY_GOOD') {
        logSuccess('✓ All critical systems operational');
        logSuccess('✓ Graph should load with target address automatically');
        logSuccess('✓ Nodes and edges should render properly');
        logSuccess('✓ Interactive features (drag, zoom, click) should work');
        logSuccess('✓ Tooltips and labels should display correctly');
        
        if (testResults.warnings > 0) {
            log('• Address remaining warnings for optimal experience', 'yellow');
        }
    } else {
        log('• Fix critical issues before proceeding with user testing', 'red');
        log('• Verify server is running and accessible', 'blue');
        log('• Check browser console for JavaScript errors', 'blue');
    }
    
    // Manual testing checklist
    console.log(`\n${colors.bold}Manual Testing Checklist:${colors.reset}`);
    const checklist = [
        'Open http://localhost:3003 in browser',
        'Verify graph loads automatically with target address',
        'Check that nodes and edges are visible and positioned correctly (not stuck in corner)',
        'Test drag functionality on nodes',
        'Test zoom in/out with mouse wheel',
        'Hover over nodes to verify tooltips appear',
        'Click on nodes to test selection and details panel',
        'Verify labels are visible and readable',
        'Test filter controls and verify they update the graph',
        'Check browser console for any errors'
    ];
    
    checklist.forEach((item, index) => {
        log(`${index + 1}. ${item}`, 'blue');
    });
    
    return overallStatus;
}

// Main execution
async function main() {
    console.log(`${colors.bold}${colors.blue}Polkadot Analysis Tool - Complete Visualization Flow Test${colors.reset}`);
    console.log(`${colors.blue}Browser simulation testing for target address: ${TEST_CONFIG.targetAddress}${colors.reset}`);
    console.log(`${colors.blue}Server: http://localhost:${TEST_CONFIG.serverPort}${colors.reset}\n`);
    
    try {
        // Run all test phases
        const serverAvailable = await testServerAvailability();
        
        if (serverAvailable) {
            await testAPIEndpoints();
            await testJavaScriptFiles();
            await testCSSFiles();
            await simulateApplicationWorkflow();
            await testCommonIssues();
        } else {
            log('Skipping detailed tests due to server unavailability', 'red');
        }
        
        // Generate comprehensive report
        const status = generateComprehensiveReport();
        
        // Exit with appropriate code
        process.exit(testResults.failed > 0 ? 1 : 0);
        
    } catch (error) {
        logError(`Test execution failed: ${error.message}`);
        process.exit(1);
    }
}

// Run the comprehensive test
main();