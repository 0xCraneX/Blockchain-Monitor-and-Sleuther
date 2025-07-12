/**
 * Validation script for graph container initialization fixes
 * This script can be run in a browser console to validate the fixes
 */

// Test 1: Verify container exists in HTML
function testContainerExists() {
    console.log('=== Test 1: Container Existence ===');
    const container = document.querySelector('#network-graph');
    
    if (container) {
        console.log('✓ Container #network-graph found:', container);
        console.log('  - Tag name:', container.tagName);
        console.log('  - Parent:', container.parentElement?.id || container.parentElement?.tagName);
        return true;
    } else {
        console.error('✗ Container #network-graph not found in DOM');
        return false;
    }
}

// Test 2: Check container dimensions
function testContainerDimensions() {
    console.log('=== Test 2: Container Dimensions ===');
    const container = document.querySelector('#network-graph');
    
    if (!container) {
        console.error('✗ Cannot test dimensions - container not found');
        return false;
    }
    
    const rect = container.getBoundingClientRect();
    console.log('Container rect:', rect);
    
    if (rect.width > 0 && rect.height > 0) {
        console.log(`✓ Container has valid dimensions: ${rect.width}x${rect.height}`);
        return true;
    } else {
        console.warn(`⚠ Container has zero dimensions: ${rect.width}x${rect.height}`);
        
        // Check if parent is visible
        const parent = container.parentElement;
        if (parent) {
            const parentRect = parent.getBoundingClientRect();
            console.log('Parent dimensions:', parentRect);
            
            const computedStyle = window.getComputedStyle(parent);
            console.log('Parent display:', computedStyle.display);
            console.log('Parent visibility:', computedStyle.visibility);
        }
        
        return false;
    }
}

// Test 3: Validate CSS styles
function testContainerStyles() {
    console.log('=== Test 3: Container Styles ===');
    const container = document.querySelector('#network-graph');
    
    if (!container) {
        console.error('✗ Cannot test styles - container not found');
        return false;
    }
    
    const computedStyle = window.getComputedStyle(container);
    console.log('Container styles:');
    console.log('  - Width:', computedStyle.width);
    console.log('  - Height:', computedStyle.height);
    console.log('  - Display:', computedStyle.display);
    console.log('  - Visibility:', computedStyle.visibility);
    console.log('  - Position:', computedStyle.position);
    
    const graphContainer = document.querySelector('#graph-container');
    if (graphContainer) {
        const graphContainerStyle = window.getComputedStyle(graphContainer);
        console.log('Graph container styles:');
        console.log('  - Width:', graphContainerStyle.width);
        console.log('  - Height:', graphContainerStyle.height);
        console.log('  - Display:', graphContainerStyle.display);
    }
    
    return true;
}

// Test 4: Check if visualization section is visible
function testVisualizationSection() {
    console.log('=== Test 4: Visualization Section ===');
    const visualizationSection = document.querySelector('#visualization-section');
    
    if (!visualizationSection) {
        console.error('✗ Visualization section not found');
        return false;
    }
    
    const isVisible = visualizationSection.style.display !== 'none';
    console.log('Visualization section visible:', isVisible);
    
    if (!isVisible) {
        console.log('Making visualization section visible for testing...');
        visualizationSection.style.display = 'block';
        
        // Re-test container dimensions
        setTimeout(() => {
            const container = document.querySelector('#network-graph');
            const rect = container.getBoundingClientRect();
            console.log('Container dimensions after showing section:', rect);
        }, 100);
    }
    
    return true;
}

// Run all tests
function runAllTests() {
    console.log('🔍 Running container validation tests...');
    console.log('Current URL:', window.location.href);
    console.log('Timestamp:', new Date().toISOString());
    
    const results = {
        containerExists: testContainerExists(),
        dimensions: testContainerDimensions(),
        styles: testContainerStyles(),
        section: testVisualizationSection()
    };
    
    console.log('=== Test Summary ===');
    console.log('Results:', results);
    
    const allPassed = Object.values(results).every(result => result === true);
    if (allPassed) {
        console.log('✓ All tests passed! Container should initialize properly.');
    } else {
        console.warn('⚠ Some tests failed. Check the issues above.');
    }
    
    return results;
}

// Export for browser console usage
if (typeof window !== 'undefined') {
    window.validateGraphContainer = runAllTests;
    console.log('💡 Run validateGraphContainer() in the browser console to test the fixes');
}

// Auto-run if in Node.js environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runAllTests, testContainerExists, testContainerDimensions, testContainerStyles, testVisualizationSection };
}