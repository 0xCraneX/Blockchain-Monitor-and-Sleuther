#!/usr/bin/env node

// Test script to verify Subscan API integration with real data

const path = require('path');
const fs = require('fs');

// Load environment variables
const dotenvPath = path.join(__dirname, '.env');
if (fs.existsSync(dotenvPath)) {
  require('dotenv').config({ path: dotenvPath });
}

const SubscanClient = require('./src/api/SubscanClient');

async function testRealAPI() {
  console.log('🔍 Testing Real Subscan API Integration...\n');
  
  // Check if API key is configured
  if (!process.env.SUBSCAN_API_KEY || process.env.SUBSCAN_API_KEY === 'your_actual_api_key_here') {
    console.error('❌ SUBSCAN_API_KEY not configured in .env file');
    console.log('Please set your Subscan API key in .env file');
    console.log('Get your API key from: https://support.subscan.io/');
    return;
  }
  
  console.log('✅ API Key configured');
  console.log(`🔗 Using API key: ${process.env.SUBSCAN_API_KEY.substring(0, 8)}...`);
  
  try {
    // Initialize client
    const client = new SubscanClient(process.env.SUBSCAN_API_KEY);
    console.log('✅ SubscanClient initialized');
    
    // Test fetching top 5 accounts first
    console.log('\n📊 Fetching top 5 accounts as test...');
    const testAccounts = await client.getTopAccounts(5);
    
    console.log(`✅ Successfully fetched ${testAccounts.length} accounts`);
    console.log('\n📋 Sample accounts:');
    testAccounts.forEach((acc, i) => {
      console.log(`${i + 1}. ${acc.address.slice(0, 8)}...${acc.address.slice(-6)}`);
      console.log(`   Balance: ${acc.balanceFloat.toFixed(2)} DOT`);
      console.log(`   Identity: ${acc.identity || 'Unknown'}`);
      console.log('');
    });
    
    // Test fetching top 100 accounts
    console.log('📊 Fetching top 100 accounts...');
    const startTime = Date.now();
    const accounts = await client.getAllTopAccounts(100);
    const endTime = Date.now();
    
    console.log(`✅ Successfully fetched ${accounts.length} accounts in ${endTime - startTime}ms`);
    
    // Calculate statistics
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balanceFloat, 0);
    const avgBalance = totalBalance / accounts.length;
    
    console.log('\n📈 Statistics:');
    console.log(`   Total accounts: ${accounts.length}`);
    console.log(`   Total balance: ${totalBalance.toFixed(2)} DOT`);
    console.log(`   Average balance: ${avgBalance.toFixed(2)} DOT`);
    console.log(`   Largest account: ${accounts[0].balanceFloat.toFixed(2)} DOT`);
    console.log(`   Smallest account: ${accounts[accounts.length - 1].balanceFloat.toFixed(2)} DOT`);
    
    // Show API statistics
    const stats = client.getStats();
    console.log('\n🔧 API Statistics:');
    console.log(`   Total requests: ${stats.requests}`);
    console.log(`   Cache hits: ${stats.cacheHits}`);
    console.log(`   Cache misses: ${stats.cacheMisses}`);
    console.log(`   Average response time: ${stats.avgResponseTime}ms`);
    console.log(`   Cache hit rate: ${stats.cacheHitRate}%`);
    
    console.log('\n✅ Real API integration test completed successfully!');
    console.log('🚀 You can now run the monitoring system with real data');
    
  } catch (error) {
    console.error('❌ API test failed:', error.message);
    
    if (error.message.includes('API error')) {
      console.log('\n💡 This might be due to:');
      console.log('   - Invalid API key');
      console.log('   - Rate limiting');
      console.log('   - API service temporarily unavailable');
    } else if (error.message.includes('network')) {
      console.log('\n💡 This might be a network connectivity issue');
    }
    
    console.log('\n🔧 Check your API key and network connection');
  }
}

// Run the test
if (require.main === module) {
  testRealAPI().catch(console.error);
}

module.exports = { testRealAPI };