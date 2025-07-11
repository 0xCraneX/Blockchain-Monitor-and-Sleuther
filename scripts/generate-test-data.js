#!/usr/bin/env node

/**
 * Generate test data for development and testing
 * This script populates the database with realistic test data
 */

import { DatabaseService } from '../src/services/DatabaseService.js';
import { logger } from '../src/utils/logger.js';

// Test addresses (real Polkadot addresses for realism)
const TEST_ADDRESSES = [
  // Well-known addresses
  { address: '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn', name: 'Treasury' },
  { address: '14Gn7SEmCgMX8n4AarXpJfbxWaHjwHbpU5sQqYXtUj1y5qr2', name: 'Validator 1' },
  { address: '15cfSaBcTxNr8rV59cbhdMNCRagFr3GE6B3zZRsCp4QHHKPu', name: 'Validator 2' },
  
  // Test accounts with different profiles
  { address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', name: 'Exchange Hot Wallet' },
  { address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty', name: 'High Volume Trader' },
  { address: '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y', name: 'DeFi Protocol' },
  { address: '5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy', name: 'Whale Account' },
  { address: '5GNJqTPyNqANBkUVMN1LPPrxXnFouWXoe2wNSmmEoLctxiZY', name: 'Mining Pool' },
  { address: '5HpG9w8EBLe5XCrbczpwq5TSXvedjrBGCwqxK1iQ7qUsSWFc', name: 'Suspicious Account' },
  { address: '5Ck5SLSHYac6WFt5UZRSsdJjwmpSZq85fd5TRNAdZQVzEAPT', name: 'Regular User' }
];

// Risk scores for different account types
const RISK_PROFILES = {
  'Treasury': 0.1,
  'Validator': 0.2,
  'Exchange': 0.5,
  'Trader': 0.4,
  'DeFi': 0.3,
  'Whale': 0.6,
  'Mining': 0.3,
  'Suspicious': 0.9,
  'Regular': 0.2
};

async function generateTestData() {
  console.log('🚀 Starting test data generation...\n');
  
  const db = new DatabaseService();
  
  try {
    // Initialize database
    await db.initialize();
    console.log('✅ Database initialized');
    
    // Clear existing test data
    console.log('🧹 Clearing existing test data...');
    db.db.exec('DELETE FROM transfers WHERE block_number >= 1000000');
    db.db.exec('DELETE FROM patterns');
    db.db.exec('DELETE FROM account_relationships');
    db.db.exec("DELETE FROM accounts WHERE created_at > datetime('now', '-1 day')");
    
    // Generate accounts
    console.log('\n📝 Creating test accounts...');
    for (const testAccount of TEST_ADDRESSES) {
      const accountType = testAccount.name.split(' ')[0];
      const riskScore = RISK_PROFILES[accountType] || 0.3;
      
      db.createAccount({
        address: testAccount.address,
        publicKey: '0x' + Buffer.from(testAccount.address).toString('hex').padEnd(64, '0'),
        identityDisplay: testAccount.name,
        balance: Math.floor(Math.random() * 1000000000000000).toString(),
        firstSeenBlock: 1000000 + Math.floor(Math.random() * 1000),
        riskScore: riskScore
      });
      
      console.log(`✅ Created account: ${testAccount.name} (${testAccount.address.slice(0, 8)}...)`);
    }
    
    // Generate transfers with different patterns
    console.log('\n💸 Generating transfers...');
    
    // 1. Normal transfers
    console.log('  - Normal transfers');
    for (let i = 0; i < 100; i++) {
      const from = TEST_ADDRESSES[Math.floor(Math.random() * TEST_ADDRESSES.length)];
      const to = TEST_ADDRESSES[Math.floor(Math.random() * TEST_ADDRESSES.length)];
      
      if (from.address !== to.address) {
        db.createTransfer({
          block_number: 1000000 + i * 10,
          hash: '0x' + (i * 2).toString(16).padStart(64, '0'),
          from_address: from.address,
          to_address: to.address,
          value: Math.floor(Math.random() * 10000000000000).toString(),
          success: true,
          timestamp: new Date(Date.now() - i * 3600000).toISOString()
        });
      }
    }
    
    // 2. Circular transfers (suspicious pattern)
    console.log('  - Circular transfer pattern');
    const circularAddresses = TEST_ADDRESSES.slice(3, 7);
    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < circularAddresses.length; i++) {
        const from = circularAddresses[i];
        const to = circularAddresses[(i + 1) % circularAddresses.length];
        
        db.createTransfer({
          block_number: 1001000 + round * 10 + i,
          hash: '0xc' + (round * 20 + i).toString(16).padStart(63, '0'),
          from_address: from.address,
          to_address: to.address,
          value: '1000000000000', // Same amount (suspicious)
          success: true,
          timestamp: new Date(Date.now() - round * 86400000 - i * 3600000).toISOString()
        });
      }
    }
    
    // 3. Rapid transfers (mixing pattern)
    console.log('  - Rapid transfer pattern');
    const mixer = TEST_ADDRESSES[8]; // Suspicious account
    for (let i = 0; i < 20; i++) {
      const target = TEST_ADDRESSES[Math.floor(Math.random() * 8)];
      
      db.createTransfer({
        block_number: 1002000 + i,
        hash: '0xr' + (i * 2).toString(16).padStart(63, '0'),
        from_address: mixer.address,
        to_address: target.address,
        value: '500000000000', // Small, consistent amounts
        success: true,
        timestamp: new Date(Date.now() - i * 60000).toISOString() // 1 minute apart
      });
    }
    
    // 4. Large value transfers
    console.log('  - Large value transfers');
    const whale = TEST_ADDRESSES[6]; // Whale account
    for (let i = 0; i < 10; i++) {
      const target = TEST_ADDRESSES[Math.floor(Math.random() * TEST_ADDRESSES.length)];
      
      if (whale.address !== target.address) {
        db.createTransfer({
          block_number: 1003000 + i * 100,
          hash: '0xw' + (i * 2).toString(16).padStart(63, '0'),
          from_address: whale.address,
          to_address: target.address,
          value: (BigInt(1000000000000) * BigInt(100 + i * 50)).toString(), // Very large amounts
          success: true,
          timestamp: new Date(Date.now() - i * 7200000).toISOString() // 2 hours apart
        });
      }
    }
    
    // Generate patterns
    console.log('\n🔍 Generating suspicious patterns...');
    
    // Circular flow pattern
    db.db.prepare(`
      INSERT INTO patterns (address, pattern_type, confidence, details, detected_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      circularAddresses[0].address,
      'circular_flow',
      0.85,
      JSON.stringify({
        participants: circularAddresses.map(a => a.address),
        totalVolume: '5000000000000',
        rounds: 5
      }),
      new Date().toISOString()
    );
    console.log('✅ Added circular flow pattern');
    
    // Rapid transfer pattern
    db.db.prepare(`
      INSERT INTO patterns (address, pattern_type, confidence, details, detected_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      mixer.address,
      'rapid_transfers',
      0.92,
      JSON.stringify({
        transferCount: 20,
        timeWindow: '20 minutes',
        avgTimeBetween: '1 minute'
      }),
      new Date().toISOString()
    );
    console.log('✅ Added rapid transfer pattern');
    
    // Get statistics
    console.log('\n📊 Getting statistics...');
    const stats = db.db.prepare(`
      SELECT 
        COUNT(DISTINCT address) as total_accounts,
        COUNT(*) as total_transfers
      FROM accounts, transfers
    `).get();
    
    // Summary
    console.log('\n✅ Test data generation complete!\n');
    console.log('📊 Summary:');
    console.log(`  - Accounts created: ${stats.total_accounts}`);
    console.log(`  - Transfers created: ${stats.total_transfers}`);
    console.log(`  - Patterns detected: 2`);
    
    console.log('\n🎉 You can now start the development server with: npm run dev');
    
  } catch (error) {
    console.error('❌ Error generating test data:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run the script
generateTestData();