#!/usr/bin/env node

// Direct API test without external dependencies
const https = require('https');

const API_KEY = '898d8f14b98d4884b6961b87e73ce3ec';

function makeRequest() {
  const data = JSON.stringify({
    row: 10,
    page: 0,
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

  console.log('🔍 Testing Subscan API with real key...\n');

  const req = https.request(options, (res) => {
    let responseData = '';

    res.on('data', (chunk) => {
      responseData += chunk;
    });

    res.on('end', () => {
      try {
        const response = JSON.parse(responseData);
        
        console.log(`✅ API Response Status: ${res.statusCode}`);
        console.log(`✅ API Response Code: ${response.code}`);
        console.log(`✅ API Message: ${response.message}\n`);
        
        if (response.code === 0 && response.data && response.data.list) {
          console.log(`📊 Successfully fetched ${response.data.list.length} accounts:\n`);
          
          response.data.list.forEach((account, i) => {
            const balance = parseFloat(account.balance);
            console.log(`${i + 1}. ${account.address.slice(0, 8)}...${account.address.slice(-6)}`);
            console.log(`   Balance: ${balance.toFixed(2)} DOT`);
            console.log(`   Identity: ${account.account_display?.merkle?.tag_name || account.account_display?.display || 'Unknown'}`);
            console.log('');
          });
          
          // Calculate total
          const totalBalance = response.data.list.reduce((sum, acc) => {
            return sum + parseFloat(acc.balance);
          }, 0);
          
          console.log(`📈 Total Balance: ${totalBalance.toFixed(2)} DOT`);
          console.log(`📈 Total Count Available: ${response.data.count}`);
          
        } else {
          console.log('❌ Unexpected response format:', response);
        }
      } catch (error) {
        console.error('❌ Failed to parse response:', error.message);
        console.log('Raw response:', responseData);
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Request failed:', error.message);
  });

  req.write(data);
  req.end();
}

makeRequest();