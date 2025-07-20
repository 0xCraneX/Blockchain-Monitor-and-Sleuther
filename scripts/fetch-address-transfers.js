#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = '898d8f14b98d4884b6961b87e73ce3ec';
const TARGET_ADDRESS = '16fttU3nadc7KgFwxUqLyyryUiqW5VMbVMpTQ18GzNtbK9Tz';

function makeRequest(data, endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'polkadot.api.subscan.io',
      port: 443,
      path: endpoint,
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
            resolve(response.data);
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

async function fetchTransfers(address, days = 2) {
  console.log(`\n🔍 Fetching transfers for ${address.slice(0, 8)}...${address.slice(-6)}`);
  console.log(`📅 Looking back ${days} days\n`);

  try {
    // Get transfers
    const transferData = JSON.stringify({
      address: address,
      row: 100,
      page: 0
    });

    const transfers = await makeRequest(transferData, '/api/v2/scan/transfers');
    
    console.log(`Found ${transfers.transfers ? transfers.transfers.length : 0} transfers\n`);

    // Filter transfers from last 2 days
    const twoDaysAgo = Date.now() - (days * 24 * 60 * 60 * 1000);
    const recentTransfers = transfers.transfers?.filter(t => {
      const timestamp = parseInt(t.block_timestamp) * 1000;
      return timestamp > twoDaysAgo;
    }) || [];

    console.log(`Recent transfers (last ${days} days): ${recentTransfers.length}\n`);

    // Display transfers
    recentTransfers.forEach((transfer, index) => {
      const date = new Date(parseInt(transfer.block_timestamp) * 1000);
      const amount = parseFloat(transfer.amount);
      const direction = transfer.from === address ? 'OUT' : 'IN';
      
      console.log(`Transfer ${index + 1}:`);
      console.log(`  Block: ${transfer.block_num}`);
      console.log(`  Time: ${date.toISOString()}`);
      console.log(`  Direction: ${direction}`);
      console.log(`  Amount: ${amount.toLocaleString()} DOT`);
      console.log(`  From: ${transfer.from.slice(0, 8)}...${transfer.from.slice(-6)}`);
      console.log(`  To: ${transfer.to.slice(0, 8)}...${transfer.to.slice(-6)}`);
      console.log(`  Hash: ${transfer.hash}`);
      console.log('');
    });

    // Create alerts for large transfers
    const alerts = [];
    recentTransfers.forEach(transfer => {
      const amount = parseFloat(transfer.amount);
      if (amount > 100000) { // Only alert for transfers > 100k DOT
        const direction = transfer.from === address ? 'outgoing' : 'incoming';
        alerts.push({
          id: `transfer_${transfer.hash}`,
          timestamp: new Date(parseInt(transfer.block_timestamp) * 1000).toISOString(),
          type: 'large_transfer',
          pattern: 'large_transfer',
          severity: amount > 500000 ? 'CRITICAL' : 'IMPORTANT',
          address: address,
          amount: amount,
          description: `Large ${direction} transfer of ${Math.floor(amount).toLocaleString()} DOT`,
          metadata: {
            from: transfer.from,
            to: transfer.to,
            blockNumber: transfer.block_num,
            hash: transfer.hash,
            direction: direction
          }
        });
      }
    });

    if (alerts.length > 0) {
      // Save alerts
      const alertsDir = path.join(process.cwd(), 'data/alerts');
      const today = new Date().toISOString().split('T')[0];
      const alertsFile = path.join(alertsDir, `${today}.json`);
      
      let existingAlerts = [];
      if (fs.existsSync(alertsFile)) {
        existingAlerts = JSON.parse(fs.readFileSync(alertsFile, 'utf8'));
      }
      
      // Add new alerts (avoid duplicates)
      const existingIds = new Set(existingAlerts.map(a => a.id));
      const newAlerts = alerts.filter(a => !existingIds.has(a.id));
      
      if (newAlerts.length > 0) {
        const allAlerts = [...existingAlerts, ...newAlerts];
        fs.writeFileSync(alertsFile, JSON.stringify(allAlerts, null, 2));
        console.log(`\n✅ Added ${newAlerts.length} new alerts to ${alertsFile}`);
      }
    }

    return { transfers: recentTransfers, alerts };

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const address = args[0] || TARGET_ADDRESS;
  const days = parseInt(args[1]) || 2;

  fetchTransfers(address, days)
    .then(result => {
      console.log(`\n📊 Summary:`);
      console.log(`   Total transfers found: ${result.transfers.length}`);
      console.log(`   Alerts generated: ${result.alerts.length}`);
    })
    .catch(error => {
      console.error('\n❌ Failed:', error.message);
      process.exit(1);
    });
}

module.exports = { fetchTransfers };