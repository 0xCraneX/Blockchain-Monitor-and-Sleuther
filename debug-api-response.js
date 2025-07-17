#!/usr/bin/env node

const SubscanClient = require('./src/api/SubscanClient');
require('dotenv').config();

async function debugApiResponse() {
  const api = new SubscanClient(process.env.SUBSCAN_API_KEY);
  
  console.log('🔍 Debugging Subscan API Response\n');
  
  // Make raw request to see full response
  const response = await api.request('/api/v2/scan/accounts', {
    row: 3,
    page: 0,
    order: 'desc',
    order_field: 'balance'
  });
  
  console.log('📦 Raw API Response:');
  console.log(JSON.stringify(response, null, 2));
  
  if (response.data?.list?.[0]) {
    const firstAccount = response.data.list[0];
    console.log('\n🔢 First Account Analysis:');
    console.log(`Address: ${firstAccount.address}`);
    console.log(`Raw Balance: ${firstAccount.balance}`);
    console.log(`Balance / 1e10: ${parseFloat(firstAccount.balance) / 1e10} DOT`);
    console.log(`All fields:`, Object.keys(firstAccount));
  }
}

debugApiResponse().catch(console.error);