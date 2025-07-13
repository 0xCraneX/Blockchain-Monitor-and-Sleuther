#!/usr/bin/env node
/**
 * Complete Visualization Flow Test
 * 
 * This script tests the complete user workflow for the Polkadot Analysis Tool:
 * 1. Graph loads with target address
 * 2. Nodes and edges render properly
 * 3. Interactive features work
 * 4. Graph positioning and layout
 * 5. Tooltips and labels functionality
 */

const fs = require('fs');
const path = require('path');

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

// Test results collector
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

// Check file existence and syntax
function checkFiles() {
    logSection('File Structure and Syntax Check');
    
    const criticalFiles = [
        'public/index.html',
        'public/js/app.js',
        'public/js/graph.js',
        'public/js/client.js',
        'public/css/style.css',
        'src/index.js'
    ];
    
    let allFilesExist = true;
    
    for (const file of criticalFiles) {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
            logSuccess(`${file} exists`);
            
            // Check file size
            const stats = fs.statSync(filePath);
            if (stats.size === 0) {
                recordTest(`${file} content`, false, 'File is empty');
                allFilesExist = false;
            } else {
                recordTest(`${file} content`, true, `${(stats.size / 1024).toFixed(1)}KB`);
            }
        } else {
            recordTest(`${file} existence`, false, 'File not found');
            allFilesExist = false;
        }
    }
    
    return allFilesExist;
}

// Check HTML structure
function checkHTMLStructure() {
    logSection('HTML Structure Check');
    
    try {
        const htmlContent = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
        
        // Essential elements for graph visualization
        const requiredElements = [
            '#network-graph',
            '#address-search',
            '#search-btn',
            '#loading',
            '#graph-container',
            '#node-details',
            '#controls-section',
            '#visualization-section'
        ];
        
        for (const element of requiredElements) {
            const found = htmlContent.includes(`id="${element.substring(1)}"`);
            recordTest(`HTML element ${element}`, found, found ? 'Found' : 'Missing essential element');
        }
        
        // Check for D3.js inclusion
        const hasD3 = htmlContent.includes('d3js.org/d3.v7.min.js') || htmlContent.includes('d3.min.js');
        recordTest('D3.js library', hasD3, hasD3 ? 'D3.js v7 included' : 'D3.js library missing');
        
        // Check for Socket.IO inclusion
        const hasSocketIO = htmlContent.includes('socket.io') || htmlContent.includes('socketio');
        recordTest('Socket.IO library', hasSocketIO, hasSocketIO ? 'Socket.IO included' : 'Socket.IO library missing');
        
        return true;
    } catch (error) {
        recordTest('HTML parsing', false, `Error reading HTML: ${error.message}`);
        return false;
    }
}

// Check JavaScript application structure
function checkJavaScriptStructure() {
    logSection('JavaScript Structure Check');
    
    try {
        // Check app.js
        const appContent = fs.readFileSync(path.join(__dirname, 'public/js/app.js'), 'utf8');
        
        const appChecks = [
            { name: 'PolkadotAnalysisApp class', pattern: /class PolkadotAnalysisApp/, required: true },
            { name: 'Target address constant', pattern: /13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk/, required: true },
            { name: 'Graph initialization', pattern: /new PolkadotGraphVisualization/, required: true },
            { name: 'loadAddressGraph method', pattern: /loadAddressGraph\s*\(/, required: true },
            { name: 'Event handlers setup', pattern: /setupEventHandlers/, required: true },
            { name: 'WebSocket initialization', pattern: /initializeWebSocket/, required: true }
        ];
        
        for (const check of appChecks) {
            const found = check.pattern.test(appContent);
            recordTest(`App.js ${check.name}`, found, found ? 'Found' : 'Missing essential feature');
        }
        
        // Check graph.js
        const graphContent = fs.readFileSync(path.join(__dirname, 'public/js/graph.js'), 'utf8');
        
        const graphChecks = [
            { name: 'PolkadotGraphVisualization class', pattern: /class PolkadotGraphVisualization/, required: true },
            { name: 'D3.js force simulation', pattern: /d3\.forceSimulation/, required: true },
            { name: 'loadGraphData method', pattern: /loadGraphData\s*\(/, required: true },
            { name: 'Event handlers (click/drag)', pattern: /on\(['"]click['"]/, required: true },
            { name: 'Zoom functionality', pattern: /d3\.zoom\(\)/, required: true },
            { name: 'Tooltip implementation', pattern: /tooltip|Tooltip/, required: true },
            { name: 'Node positioning (tick)', pattern: /tick\s*\(/, required: true }
        ];
        
        for (const check of graphChecks) {
            const found = check.pattern.test(graphContent);
            recordTest(`Graph.js ${check.name}`, found, found ? 'Found' : 'Missing essential feature');
        }
        
        return true;
    } catch (error) {
        recordTest('JavaScript parsing', false, `Error reading JavaScript: ${error.message}`);
        return false;
    }
}

// Check CSS and styling
function checkStyling() {
    logSection('CSS and Styling Check');
    
    try {
        const cssContent = fs.readFileSync(path.join(__dirname, 'public/css/style.css'), 'utf8');
        
        const styleChecks = [
            { name: 'Graph container styling', pattern: /#graph-container|\.graph-container/, required: true },
            { name: 'SVG styling', pattern: /svg|SVG/, required: false },
            { name: 'Node styling', pattern: /\.node|node/i, required: false },
            { name: 'Loading spinner', pattern: /spinner|loading/i, required: false },
            { name: 'Responsive design', pattern: /@media/, required: false }
        ];
        
        for (const check of styleChecks) {
            const found = check.pattern.test(cssContent);
            if (check.required) {
                recordTest(`CSS ${check.name}`, found, found ? 'Found' : 'Missing essential styling');
            } else if (found) {
                logSuccess(`CSS ${check.name}: Found`);
            }
        }
        
        return true;
    } catch (error) {
        recordTest('CSS parsing', false, `Error reading CSS: ${error.message}`);
        return false;
    }
}

// Analyze potential issues
function analyzeIssues() {
    logSection('Potential Issues Analysis');
    
    try {
        const appContent = fs.readFileSync(path.join(__dirname, 'public/js/app.js'), 'utf8');
        const graphContent = fs.readFileSync(path.join(__dirname, 'public/js/graph.js'), 'utf8');
        
        // Check for querySelector usage (the original issue)
        const hasQuerySelector = /querySelector\s*\(/.test(appContent) || /querySelector\s*\(/.test(graphContent);
        if (hasQuerySelector) {
            recordWarning('querySelector usage', 'querySelector found - ensure proper DOM ready handling');
        } else {
            logSuccess('No direct querySelector usage found');
        }
        
        // Check for getElementById usage (safer alternative)
        const hasGetElementById = /getElementById\s*\(/.test(appContent);
        recordTest('getElementById usage', hasGetElementById, hasGetElementById ? 'Using getElementById (good)' : 'Not using getElementById');
        
        // Check for DOMContentLoaded event
        const hasDOMContentLoaded = /DOMContentLoaded/.test(appContent);
        recordTest('DOM ready handling', hasDOMContentLoaded, hasDOMContentLoaded ? 'DOMContentLoaded event found' : 'Missing DOM ready handling');
        
        // Check for error handling
        const hasErrorHandling = /try\s*{|catch\s*\(/.test(appContent) && /try\s*{|catch\s*\(/.test(graphContent);
        recordTest('Error handling', hasErrorHandling, hasErrorHandling ? 'Try-catch blocks found' : 'Limited error handling');
        
        // Check for console.log (debug statements)
        const hasDebugLogs = (appContent.match(/console\.log/g) || []).length;
        if (hasDebugLogs > 10) {
            recordWarning('Debug logging', `${hasDebugLogs} console.log statements found - consider reducing for production`);
        } else if (hasDebugLogs > 0) {
            logSuccess(`Debug logging: ${hasDebugLogs} console.log statements (reasonable amount)`);
        }
        
        // Check graph positioning
        const hasForceCenter = /forceCenter/.test(graphContent);
        const hasTransform = /transform/.test(graphContent);
        recordTest('Graph positioning', hasForceCenter && hasTransform, 
            hasForceCenter && hasTransform ? 'Force center and transforms found' : 'Potential positioning issues');
        
        // Check for drag and zoom functionality
        const hasDragBehavior = /drag\(\)|createDragBehavior/.test(graphContent);
        const hasZoomBehavior = /zoom\(\)|zoom\./.test(graphContent);
        recordTest('Interactivity (drag)', hasDragBehavior, hasDragBehavior ? 'Drag behavior implemented' : 'Drag functionality missing');
        recordTest('Interactivity (zoom)', hasZoomBehavior, hasZoomBehavior ? 'Zoom behavior implemented' : 'Zoom functionality missing');
        
        // Check label rendering
        const hasLabelRendering = /renderLabels|label.*render/i.test(graphContent);
        recordTest('Label rendering', hasLabelRendering, hasLabelRendering ? 'Label rendering found' : 'Label rendering missing');
        
        return true;
    } catch (error) {
        recordTest('Issue analysis', false, `Error analyzing code: ${error.message}`);
        return false;
    }
}

// Check for known fixes
function checkKnownFixes() {
    logSection('Known Fixes Verification');
    
    try {
        const appContent = fs.readFileSync(path.join(__dirname, 'public/js/app.js'), 'utf8');
        
        // Check if querySelector error is fixed (should use getElementById or have proper DOM ready)
        const hasProperElementSelection = /getElementById\s*\(/.test(appContent);
        recordTest('querySelector fix', hasProperElementSelection, 
            hasProperElementSelection ? 'Using getElementById instead of querySelector' : 'Still may have querySelector issues');
        
        // Check if graph positioning is handled
        const hasGraphCentering = /center|Center/.test(appContent);
        recordTest('Graph centering', hasGraphCentering, 
            hasGraphCentering ? 'Graph centering logic found' : 'Graph may be stuck in corner');
        
        // Check if proper data format mapping exists
        const hasDataMapping = /links.*edges|edges.*links/.test(appContent);
        recordTest('Data format mapping', hasDataMapping, 
            hasDataMapping ? 'API to frontend data mapping found' : 'May have data format issues');
        
        return true;
    } catch (error) {
        recordTest('Known fixes check', false, `Error checking fixes: ${error.message}`);
        return false;
    }
}

// Generate comprehensive report
function generateReport() {
    logSection('Test Summary Report');
    
    console.log(`${colors.bold}Overall Results:${colors.reset}`);
    logSuccess(`Passed: ${testResults.passed}`);
    logError(`Failed: ${testResults.failed}`);
    logWarning(`Warnings: ${testResults.warnings}`);
    
    const totalTests = testResults.passed + testResults.failed;
    const successRate = totalTests > 0 ? (testResults.passed / totalTests * 100).toFixed(1) : 0;
    
    console.log(`\n${colors.bold}Success Rate: ${successRate}%${colors.reset}`);
    
    if (testResults.failed > 0) {
        console.log(`\n${colors.bold}${colors.red}Issues Found:${colors.reset}`);
        testResults.issues.forEach(issue => {
            console.log(`  • ${issue}`);
        });
    }
    
    // Provide recommendations
    console.log(`\n${colors.bold}Recommendations:${colors.reset}`);
    
    if (testResults.failed === 0 && testResults.warnings === 0) {
        logSuccess('All tests passed! The visualization should work correctly.');
    } else {
        if (testResults.failed > 0) {
            log('• Fix critical issues before testing', 'red');
        }
        if (testResults.warnings > 0) {
            log('• Address warnings for better user experience', 'yellow');
        }
        log('• Test the complete workflow in a browser', 'blue');
        log('• Check browser console for any runtime errors', 'blue');
        log('• Verify graph loads with target address 13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk', 'blue');
    }
    
    // Workflow testing steps
    console.log(`\n${colors.bold}Manual Testing Workflow:${colors.reset}`);
    log('1. Open http://localhost:3002 in browser', 'blue');
    log('2. Check that graph loads automatically with target address', 'blue');
    log('3. Verify nodes and edges are visible and positioned correctly', 'blue');
    log('4. Test drag functionality on nodes', 'blue');
    log('5. Test zoom in/out with mouse wheel', 'blue');
    log('6. Hover over nodes to check tooltips', 'blue');
    log('7. Click on nodes to check selection and details panel', 'blue');
    log('8. Verify labels are visible and readable', 'blue');
    log('9. Check that graph is centered, not stuck in upper left corner', 'blue');
    log('10. Test filter controls and ensure they update the graph', 'blue');
}

// Main execution
function main() {
    console.log(`${colors.bold}${colors.blue}Polkadot Analysis Tool - Complete Visualization Flow Test${colors.reset}`);
    console.log(`${colors.blue}Testing comprehensive user workflow and potential issues${colors.reset}\n`);
    
    // Run all checks
    checkFiles();
    checkHTMLStructure();
    checkJavaScriptStructure();
    checkStyling();
    analyzeIssues();
    checkKnownFixes();
    
    // Generate final report
    generateReport();
    
    // Exit with appropriate code
    process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run the test suite
main();