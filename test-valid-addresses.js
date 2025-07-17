import fetch from 'node-fetch';

// Test with addresses we know work from the parent project
async function testValidAddresses() {
  const endpoint = 'https://polkadot.api.subscan.io';
  
  // These addresses worked in the parent project's tests
  const testAddresses = [
    // From the parent project's test data
    '13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk',
    '14E5nqKAp3oAJcmzgZhUD2RcptBeUBScxKHgJKU4HPNcKVf3', // Example validator
    '1zugcag7cJVBtVRnFxv5Qftn7xKAnR6YJ9x4x3XLgGgmNnS', // Example account
  ];
  
  console.log('Testing with known valid addresses...\n');
  
  for (const address of testAddresses) {
    console.log(`\nTesting address: ${address}`);
    
    try {
      const response = await fetch(`${endpoint}/api/v2/scan/transfers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: address,
          row: 5,
          page: 0
        })
      });
      
      console.log('Status:', response.status);
      
      if (response.status === 200) {
        const data = await response.json();
        console.log('Success! Found transfers:', data.data?.count || 0);
        if (data.data?.transfers && data.data.transfers.length > 0) {
          console.log('First transfer:', {
            from: data.data.transfers[0].from,
            to: data.data.transfers[0].to,
            amount: data.data.transfers[0].amount,
            block: data.data.transfers[0].block_num
          });
        }
      } else {
        const data = await response.json();
        console.log('Error:', data.message);
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
    
    // Rate limit ourselves
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

testValidAddresses();