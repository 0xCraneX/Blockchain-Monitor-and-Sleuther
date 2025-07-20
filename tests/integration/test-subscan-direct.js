import fetch from 'node-fetch';

// Test Subscan API directly without our wrapper
async function testDirectAPI() {
  const endpoint = 'https://polkadot.api.subscan.io';
  
  console.log('Testing Subscan API directly...\n');
  
  // Test 1: Basic transfers endpoint
  console.log('1. Testing transfers endpoint...');
  try {
    const response = await fetch(`${endpoint}/api/v2/scan/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn', // Treasury
        row: 10,
        page: 0
      })
    });
    
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  // Test 2: Try with different parameters
  console.log('\n2. Testing with minimal parameters...');
  try {
    const response = await fetch(`${endpoint}/api/scan/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        row: 10,
        page: 0,
        address: '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn'
      })
    });
    
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2).slice(0, 500) + '...');
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  // Test 3: Account endpoint
  console.log('\n3. Testing account/search endpoint...');
  try {
    const response = await fetch(`${endpoint}/api/v2/scan/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn'
      })
    });
    
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2).slice(0, 500) + '...');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testDirectAPI();