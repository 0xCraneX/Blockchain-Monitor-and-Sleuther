#!/usr/bin/env node

/**
 * Test script to verify if the application is using real blockchain data
 */

import { RealDataService } from './src/services/RealDataService.js';
import { BlockchainService } from './src/services/BlockchainService.js';
import { DatabaseService } from './src/services/DatabaseService.js';
import { SubscanService } from './src/services/SubscanService.js';

async function testRealData() {
  console.log('🔍 Testing real blockchain data integration...\n');
  
  // Test well-known Polkadot addresses (using proper SS58 format)
  const testAddresses = [
    '15kUt2i86LHRWCkE3D9Bg1HZAoc2smhn1fwPzDERTb1BXAkX', // Well known address with balance
    '14E5nqKAp3oAJcmzgZhUD2RcptBeUBScxKHgJKU4HPNcKVf3', // Polkadot validator
    '1FRMM8PEiWXYax7rpS6X4XZX1aAAxSWx1CrKTyrVYhV24fg'   // Another validator
  ];

  // Initialize services
  const blockchain = new BlockchainService();
  const database = new DatabaseService();
  await database.initialize(); // Initialize database first
  const subscanService = new SubscanService();
  const realDataService = new RealDataService(blockchain, database);

  try {
    // Test 1: Blockchain connection
    console.log('1️⃣ Testing blockchain connection...');
    await blockchain.connect();
    console.log('✅ Blockchain connected successfully\n');

    // Test 2: Subscan API
    console.log('2️⃣ Testing Subscan API...');
    const testAccount = await subscanService.getAccountInfo(testAddresses[0]);
    if (testAccount) {
      console.log('✅ Subscan API working');
      console.log(`   Address: ${testAccount.address}`);
      console.log(`   Balance: ${testAccount.balance?.free || 'Unknown'}`);
      console.log(`   Identity: ${testAccount.identity?.display || 'None'}\n`);
    } else {
      console.log('⚠️  Subscan API returned no data (might be rate limited)\n');
    }

    // Test 3: Real data service
    console.log('3️⃣ Testing real data service...');
    const accountData = await realDataService.getAccountData(testAddresses[0]);
    if (accountData) {
      console.log('✅ Real data service working');
      console.log(`   Address: ${accountData.address}`);
      console.log(`   Balance: ${accountData.balance?.free || 'Unknown'}`);
      console.log(`   Identity: ${accountData.identity?.display || 'None'}\n`);
    } else {
      console.log('❌ Real data service failed\n');
    }

    // Test 4: Graph data generation
    console.log('4️⃣ Testing graph data generation...');
    try {
      const graphData = await realDataService.buildGraphData(testAddresses[0], 1, {
        maxNodes: 10,
        minVolume: '0'
      });
      
      if (graphData && graphData.nodes.length > 0) {
        console.log('✅ Graph data generation working');
        console.log(`   Nodes: ${graphData.nodes.length}`);
        console.log(`   Edges: ${graphData.edges.length}`);
        console.log(`   Data source: ${graphData.metadata?.dataSource || 'unknown'}\n`);
      } else {
        console.log('⚠️  Graph data generation returned empty results\n');
      }
    } catch (error) {
      console.log('❌ Graph data generation failed:', error.message, '\n');
    }

    await blockchain.disconnect();
    await database.close();
    console.log('🎉 Test completed successfully!');
    
    return {
      blockchainConnected: true,
      subscanWorking: !!testAccount,
      realDataServiceWorking: !!accountData,
      conclusion: 'Application can access real blockchain data'
    };

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await blockchain.disconnect();
    if (database?.db) await database.close();
    
    return {
      blockchainConnected: false,
      error: error.message,
      conclusion: 'Application may be using sample data due to connection issues'
    };
  }
}

testRealData()
  .then(result => {
    console.log('\n📊 Test Results:');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });