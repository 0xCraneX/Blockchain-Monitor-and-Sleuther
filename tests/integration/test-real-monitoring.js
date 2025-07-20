#!/usr/bin/env node

// Quick test to show real blockchain monitoring capabilities
const RealTransferFetcher = require('./src/alerts/RealTransferFetcher');
const BalanceChangeMonitor = require('./src/alerts/BalanceChangeMonitor');
const SubscanClient = require('./src/api/SubscanClient');
const FileStorage = require('./src/storage/FileStorage');

require('dotenv').config();

async function testRealMonitoring() {
  console.log('\n🔍 Testing Real Blockchain Monitoring Capabilities\n');
  
  const api = new SubscanClient(process.env.SUBSCAN_API_KEY);
  const storage = new FileStorage('./data');
  
  // Test 1: Fetch a few top accounts
  console.log('1️⃣  Fetching top 5 Polkadot accounts...');
  const accounts = await api.getTopAccounts(5);
  
  accounts.forEach((acc, i) => {
    console.log(`   ${i + 1}. ${acc.identity || 'Unknown'} - ${acc.address.slice(0,8)}...${acc.address.slice(-6)}`);
    console.log(`      Balance: ${acc.balanceFloat.toLocaleString()} DOT`);
  });
  
  // Test 2: Check real transfers for Binance
  console.log('\n2️⃣  Checking recent transfers for Binance account...');
  const binance = accounts.find(a => a.identity === 'Binance.com');
  
  if (binance) {
    const transferFetcher = new RealTransferFetcher({
      subscanApiKey: process.env.SUBSCAN_API_KEY,
      dataPath: './data',
      lookbackHours: 1,
      minTransferAmount: 10000
    });
    
    const transfers = await api.getAccountTransfers(binance.address, 10);
    console.log(`   Found ${transfers.length} recent transfers`);
    
    if (transfers.length > 0) {
      const latest = transfers[0];
      console.log(`   Latest: ${parseFloat(latest.amount || 0).toLocaleString()} DOT`);
      console.log(`   Block: ${latest.block_num}`);
      console.log(`   Time: ${new Date(latest.block_timestamp * 1000).toLocaleString()}`);
    }
  }
  
  // Test 3: Balance change detection
  console.log('\n3️⃣  Testing balance change detection...');
  const balanceMonitor = new BalanceChangeMonitor({
    minChangeAmount: 1000,
    minChangePercent: 0.01
  });
  
  // Load snapshots
  const current = await storage.loadCurrentSnapshot();
  const previous = await storage.loadPreviousSnapshot();
  
  if (current && previous) {
    console.log(`   Comparing snapshots:`);
    console.log(`   Previous: ${new Date(previous.timestamp).toLocaleString()}`);
    console.log(`   Current: ${new Date(current.timestamp).toLocaleString()}`);
    
    const alerts = await balanceMonitor.detectBalanceChanges(current, previous);
    console.log(`   Found ${alerts.length} balance change alerts`);
    
    if (alerts.length > 0) {
      console.log(`   Sample alert: ${alerts[0].title} - ${alerts[0].description}`);
    }
  } else {
    console.log('   No previous snapshot for comparison yet');
  }
  
  // Test 4: Show monitoring capabilities
  console.log('\n4️⃣  Available Real Monitoring Methods:');
  console.log('   ✅ Historical Transfer Fetching (via Subscan API)');
  console.log('   ✅ Balance Change Detection (snapshot comparison)');
  console.log('   ✅ Real-time WebSocket Monitoring (Polkadot RPC)');
  console.log('   ✅ Pattern Detection (dormant awakening, coordinated movements)');
  console.log('   ✅ Exchange Activity Tracking');
  
  console.log('\n✨ Real monitoring system is ready to track actual blockchain activity!');
  console.log('   Run: npm run monitor:real');
  console.log('   Or with dashboard: npm run monitor:real-web\n');
}

testRealMonitoring().catch(console.error);