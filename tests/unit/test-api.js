require('dotenv').config();
const SubscanClient = require('../api/SubscanClient');
const { mainLogger } = require('../utils/simple-logger');

async function testSubscanAPI() {
  mainLogger.section('Testing Subscan API Client');
  
  // Initialize client
  const apiKey = process.env.SUBSCAN_API_KEY || '';
  
  mainLogger.info('Initializing Subscan client', {
    hasApiKey: !!apiKey,
    apiKeyLength: apiKey.length
  });
  
  const client = new SubscanClient(apiKey);
  
  try {
    // Test 1: Fetch top 10 accounts
    mainLogger.section('Test 1: Fetch Top 10 Accounts');
    
    const top10 = await client.getTopAccounts(10, 0);
    
    mainLogger.success(`Successfully fetched ${top10.length} accounts`);
    mainLogger.info('Top 3 accounts:');
    
    top10.slice(0, 3).forEach((account, index) => {
      mainLogger.info(`#${index + 1} Account`, {
        address: account.address.slice(0, 16) + '...',
        balance: `${account.balanceFloat.toFixed(2)} DOT`,
        identity: account.identity || 'No identity'
      });
    });
    
    // Test 2: Check cache
    mainLogger.section('Test 2: Cache Functionality');
    
    mainLogger.info('Making same request again (should hit cache)...');
    const cachedResult = await client.getTopAccounts(10, 0);
    
    const stats1 = client.getStats();
    mainLogger.table([stats1], 'API Statistics After Cache Test');
    
    // Test 3: Fetch transfers for top account
    if (top10.length > 0) {
      mainLogger.section('Test 3: Fetch Transfers for Top Account');
      
      const topAddress = top10[0].address;
      mainLogger.info(`Fetching transfers for ${topAddress.slice(0, 16)}...`);
      
      const transfers = await client.getAccountTransfers(topAddress, 10);
      
      mainLogger.success(`Found ${transfers.length} transfers`);
      
      if (transfers.length > 0) {
        mainLogger.info('Latest transfer:', {
          from: transfers[0].from.slice(0, 16) + '...',
          to: transfers[0].to.slice(0, 16) + '...',
          amount: `${parseFloat(transfers[0].amount) / 1e10} DOT`,
          block: transfers[0].block_num,
          timestamp: new Date(transfers[0].block_timestamp * 1000).toISOString()
        });
      }
    }
    
    // Test 4: Pagination test
    mainLogger.section('Test 4: Pagination Test');
    
    mainLogger.info('Fetching 250 accounts (will paginate)...');
    const many = await client.getAllTopAccounts(250);
    
    mainLogger.success(`Fetched ${many.length} accounts across multiple pages`);
    
    // Final statistics
    mainLogger.section('Final API Statistics');
    const finalStats = client.getStats();
    
    mainLogger.table([{
      'Total Requests': finalStats.requests,
      'Cache Hits': finalStats.cacheHits,
      'Cache Misses': finalStats.cacheMisses,
      'Cache Hit Rate': `${finalStats.cacheHitRate}%`,
      'Errors': finalStats.errors,
      'Avg Response Time': `${finalStats.avgResponseTime}ms`
    }], 'Performance Summary');
    
    mainLogger.success('All API tests completed successfully! ✅');
    
  } catch (error) {
    mainLogger.error('API test failed', error);
    
    if (error.response?.status === 401) {
      mainLogger.warn('Authentication failed - check your SUBSCAN_API_KEY in .env file');
    } else if (error.code === 'ECONNREFUSED') {
      mainLogger.warn('Connection refused - check your internet connection');
    } else if (error.response?.status === 429) {
      mainLogger.warn('Rate limit exceeded - slow down requests');
    }
    
    process.exit(1);
  }
}

// Run the test
testSubscanAPI().catch(error => {
  mainLogger.error('Uncaught error in test', error);
  process.exit(1);
});