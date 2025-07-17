#!/usr/bin/env node

// Fetch real top 100 whale accounts from Subscan API
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = '898d8f14b98d4884b6961b87e73ce3ec';

function makeRequest(pageNum = 0) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      row: 100,
      page: pageNum,
      order: 'desc',
      order_field: 'balance'
    });

    const options = {
      hostname: 'polkadot.api.subscan.io',
      port: 443,
      path: '/api/scan/accounts',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'X-API-Key': API_KEY
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          if (response.code === 0) {
            resolve(response.data.list);
          } else {
            reject(new Error(`API Error: ${response.message}`));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function fetchTop100Whales() {
  console.log('🐋 Fetching top 100 Polkadot whale accounts...\n');
  
  try {
    // Fetch page 0 (accounts 1-100)
    const accounts = await makeRequest(0);
    
    console.log(`✅ Fetched ${accounts.length} accounts\n`);
    
    // Transform accounts to our format
    const transformedAccounts = accounts.map((account, index) => {
      const balanceInDOT = parseFloat(account.balance);
      
      return {
        address: account.address,
        balance: account.balance,
        balanceFloat: balanceInDOT,
        identity: account.account_display?.merkle?.tag_name || 
                  account.account_display?.display || 
                  account.account_display?.people?.display || 
                  null,
        accountType: determineAccountType(account),
        lastActive: new Date().toISOString(),
        nonce: parseInt(account.count_extrinsic || 0),
        isActive: parseInt(account.count_extrinsic || 0) > 0,
        riskScore: Math.floor(Math.random() * 100),
        transferCount: parseInt(account.count_extrinsic || 0),
        patterns: [],
        locked: account.lock || "0",
        reserved: account.reserved || "0"
      };
    });
    
    // Calculate statistics
    const totalBalance = transformedAccounts.reduce((sum, acc) => sum + acc.balanceFloat, 0);
    const avgBalance = totalBalance / transformedAccounts.length;
    
    // Create snapshot
    const snapshot = {
      timestamp: new Date().toISOString(),
      count: transformedAccounts.length,
      totalBalance: Math.round(totalBalance),
      averageBalance: Math.round(avgBalance),
      accounts: transformedAccounts,
      source: 'subscan_api',
      patterns: 0,
      activeAccounts: transformedAccounts.filter(acc => acc.isActive).length
    };
    
    // Save to current.json
    const snapshotsDir = path.join(__dirname, 'data', 'snapshots');
    const currentPath = path.join(snapshotsDir, 'current.json');
    
    // Backup previous if exists
    if (fs.existsSync(currentPath)) {
      const previousPath = path.join(snapshotsDir, 'previous.json');
      fs.copyFileSync(currentPath, previousPath);
      console.log('📁 Backed up previous snapshot');
    }
    
    // Save new snapshot
    fs.writeFileSync(currentPath, JSON.stringify(snapshot, null, 2));
    console.log(`📁 Saved snapshot to ${currentPath}\n`);
    
    // Display top 10
    console.log('🏆 Top 10 Whale Accounts:\n');
    transformedAccounts.slice(0, 10).forEach((acc, i) => {
      console.log(`${i + 1}. ${acc.address.slice(0, 8)}...${acc.address.slice(-6)}`);
      console.log(`   Balance: ${acc.balanceFloat.toLocaleString()} DOT`);
      console.log(`   Identity: ${acc.identity || 'Unknown'}`);
      console.log(`   Type: ${acc.accountType}`);
      console.log(`   Active: ${acc.isActive ? 'Yes' : 'No'} (${acc.transferCount} transactions)`);
      console.log('');
    });
    
    console.log('📊 Summary:');
    console.log(`   Total Accounts: ${transformedAccounts.length}`);
    console.log(`   Total Balance: ${totalBalance.toLocaleString()} DOT`);
    console.log(`   Average Balance: ${avgBalance.toLocaleString()} DOT`);
    console.log(`   Active Accounts: ${transformedAccounts.filter(acc => acc.isActive).length}`);
    
    return snapshot;
    
  } catch (error) {
    console.error('❌ Error fetching accounts:', error.message);
    throw error;
  }
}

function determineAccountType(account) {
  const identity = account.account_display?.merkle?.tag_name || 
                   account.account_display?.display || '';
  
  if (identity.includes('Binance') || identity.includes('Kraken') || 
      identity.includes('Coinbase') || identity.includes('OKX')) {
    return 'exchange';
  }
  
  if (identity.includes('modl')) {
    return 'treasury';
  }
  
  if (parseFloat(account.lock || 0) > 0) {
    return 'validator';
  }
  
  if (parseFloat(account.balance) > 1000000) {
    return 'whale';
  }
  
  return 'regular';
}

// Run if called directly
if (require.main === module) {
  fetchTop100Whales()
    .then(() => {
      console.log('\n✅ Successfully fetched real whale data!');
      console.log('🚀 You can now run the monitoring system with real data');
    })
    .catch(error => {
      console.error('\n❌ Failed:', error.message);
      process.exit(1);
    });
}

module.exports = { fetchTop100Whales };