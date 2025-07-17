import 'dotenv/config';
import { subscanService } from '../src/services/SubscanService.js';

console.log('Testing Subscan API...');
console.log('Endpoint:', process.env.SUBSCAN_API_ENDPOINT || 'https://polkadot.api.subscan.io');
console.log('Has API Key:', !!process.env.SUBSCAN_API_KEY);

// Test with a known good address (treasury)
const testAddress = '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn';

async function test() {
  try {
    // First test account info
    console.log('\n1. Testing getAccountInfo...');
    const accountInfo = await subscanService.getAccountInfo(testAddress);
    console.log('Account info success:', {
      address: accountInfo.address,
      identity: accountInfo.identity?.display || 'None',
      hasBalance: !!accountInfo.balance
    });
  } catch (error) {
    console.error('Account info failed:', error.message);
    console.error('Error code:', error.code);
  }

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    // Test transfers
    console.log('\n2. Testing getTransfers...');
    const transfers = await subscanService.getTransfers(testAddress, {
      row: 10,
      page: 0
    });
    console.log('Transfers success:', {
      count: transfers.count,
      transfersReturned: transfers.transfers.length
    });
  } catch (error) {
    console.error('Transfers failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Full error:', error);
  }

  // Check service status
  console.log('\n3. Service status:');
  console.log(JSON.stringify(subscanService.getStatus(), null, 2));
}

test().catch(console.error);