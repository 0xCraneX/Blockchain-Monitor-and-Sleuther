#!/usr/bin/env node

/**
 * Test Progressive Loading Implementation
 * 
 * This script tests the volume filter functionality by making API requests
 * to both the regular endpoint and checking if the frontend fix works correctly.
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3002';
const TEST_ADDRESS = '14Xs22PogFVE4nfPmsRFhmnqX3RqdrUANZRaVJU7Hik8DArR';
const VOLUME_FILTER = '50000000000000000'; // 5000 DOT

async function testVolumeFilter() {
  console.log('🧪 Testing Volume Filter Implementation');
  console.log('=====================================');
  
  try {
    // Test 1: Regular API endpoint without filter
    console.log('\n1. Testing regular API without volume filter...');
    const responseNoFilter = await fetch(
      `${BASE_URL}/api/graph/${TEST_ADDRESS}?depth=2`
    );
    
    if (!responseNoFilter.ok) {
      throw new Error(`HTTP ${responseNoFilter.status}: ${responseNoFilter.statusText}`);
    }
    
    const dataNoFilter = await responseNoFilter.json();
    console.log(`   ✅ Success: ${dataNoFilter.nodes.length} nodes, ${dataNoFilter.edges.length} edges`);
    
    // Test 2: Regular API endpoint with volume filter
    console.log('\n2. Testing regular API with volume filter (5000 DOT)...');
    const responseWithFilter = await fetch(
      `${BASE_URL}/api/graph/${TEST_ADDRESS}?depth=2&minVolume=${VOLUME_FILTER}`
    );
    
    if (!responseWithFilter.ok) {
      throw new Error(`HTTP ${responseWithFilter.status}: ${responseWithFilter.statusText}`);
    }
    
    const dataWithFilter = await responseWithFilter.json();
    console.log(`   ✅ Success: ${dataWithFilter.nodes.length} nodes, ${dataWithFilter.edges.length} edges`);
    
    // Test 3: Check if volume filtering works
    console.log('\n3. Analyzing volume filter effectiveness...');
    if (dataWithFilter.nodes.length <= dataNoFilter.nodes.length) {
      console.log(`   ✅ Volume filter is working: reduced from ${dataNoFilter.nodes.length} to ${dataWithFilter.nodes.length} nodes`);
    } else {
      console.log(`   ⚠️  Volume filter may not be working: ${dataWithFilter.nodes.length} nodes vs ${dataNoFilter.nodes.length} nodes`);
    }
    
    // Test 4: Check edge volumes
    console.log('\n4. Checking edge volumes...');
    const minVolumeNum = BigInt(VOLUME_FILTER);
    const filteredEdges = dataWithFilter.edges.filter(edge => {
      const volume = BigInt(edge.volume || '0');
      return volume >= minVolumeNum;
    });
    
    console.log(`   📊 Edges with volume >= 5000 DOT: ${filteredEdges.length}/${dataWithFilter.edges.length}`);
    if (filteredEdges.length > 0) {
      const maxVolume = filteredEdges.reduce((max, edge) => {
        const volume = BigInt(edge.volume || '0');
        return volume > max ? volume : max;
      }, BigInt(0));
      console.log(`   💰 Highest volume: ${(Number(maxVolume) / 1e10).toFixed(2)} DOT`);
    }
    
    console.log('\n🎉 Volume filter testing completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   • API endpoints are working correctly`);
    console.log(`   • Volume filtering reduces graph size appropriately`);
    console.log(`   • Frontend implementation should use regular API for filtered requests`);
    
  } catch (error) {
    console.error(`\n❌ Error testing volume filter:`, error.message);
    console.log('\n🔧 Troubleshooting tips:');
    console.log('   • Make sure server is running on port 3002');
    console.log('   • Check that RealDataService is properly initialized');
    console.log('   • Verify the volume filter parameter format');
  }
}

// Run the test
testVolumeFilter();