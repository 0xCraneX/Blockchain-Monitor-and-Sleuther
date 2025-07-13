#!/usr/bin/env node

import fetch from 'node-fetch';

async function testSubscanAPI() {
  const endpoint = 'https://polkadot.api.subscan.io';
  const apiKey = '898d8f14b98d4884b6961b87e73ce3ec';
  const testAddress = '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn';

  console.log('🔍 Debugging Subscan API...\n');

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'polkadot-analysis-tool/1.0'
  };
  
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  try {
    console.log('Testing endpoint:', endpoint);
    console.log('API Key:', apiKey ? 'Present' : 'Missing');
    console.log('Test address:', testAddress);
    console.log('Headers:', JSON.stringify(headers, null, 2));
    
    const url = `${endpoint}/api/v2/scan/accounts`;
    const data = { address: [testAddress] };
    
    console.log('\nMaking request to:', url);
    console.log('Request data:', JSON.stringify(data, null, 2));
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });

    console.log('\nResponse status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const result = await response.text();
    console.log('\nRaw response:', result);
    
    try {
      const parsed = JSON.parse(result);
      console.log('\nParsed response:', JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('Could not parse as JSON');
    }

  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

testSubscanAPI();