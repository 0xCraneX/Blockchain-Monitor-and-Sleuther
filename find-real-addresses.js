import fetch from 'node-fetch';

// Find real exchange addresses from Subscan
async function findRealAddresses() {
  const endpoint = 'https://polkadot.api.subscan.io';
  
  console.log('Finding real Polkadot addresses...\n');
  
  // Test some known exchange tags
  const searchTerms = ['binance', 'kraken', 'treasury'];
  
  for (const term of searchTerms) {
    console.log(`\nSearching for "${term}"...`);
    
    try {
      // Try the account list endpoint
      const response = await fetch(`${endpoint}/api/scan/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          row: 5,
          page: 0,
          order: 'desc',
          order_field: 'balance'
        })
      });
      
      if (response.status === 200) {
        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2).slice(0, 500));
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Let's try to get some high-balance accounts
  console.log('\n\nTrying to get rich list...');
  try {
    const response = await fetch(`${endpoint}/api/scan/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        row: 10,
        page: 0,
        order: 'desc',
        order_field: 'balance',
        filter: 'validator'  // Try different filters
      })
    });
    
    if (response.status === 200) {
      const data = await response.json();
      if (data.data?.list) {
        console.log('\nFound high-balance accounts:');
        data.data.list.slice(0, 5).forEach(account => {
          console.log(`- ${account.address} (${account.balance} DOT)`);
        });
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

findRealAddresses();