#!/usr/bin/env node

const HistoricalIndexer = require('./src/indexer/HistoricalIndexer');
const { monitorLogger } = require('./src/utils/simple-logger');
const readline = require('readline');

require('dotenv').config();

// Create readline interface for user confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  monitorLogger.section('🗄️ Polkadot Historical Data Indexer');
  
  try {
    // Initialize indexer
    const indexer = new HistoricalIndexer({
      subscanApiKey: process.env.SUBSCAN_API_KEY || '',
      dataPath: './data',
      lookbackDays: 30,
      batchSize: 5,
      pageSize: 100,
      rateLimitDelay: 2000
    });
    
    // Check for existing progress
    const progress = await indexer.loadProgress();
    
    if (progress.lastProcessedIndex >= 0) {
      console.log(`\n⚠️  Found existing indexing progress:`);
      console.log(`   Last processed account: #${progress.lastProcessedIndex + 1}`);
      console.log(`   Accounts processed: ${progress.stats.accountsProcessed}`);
      console.log(`   Transfers indexed: ${progress.stats.transfersIndexed}`);
      console.log(`   Last update: ${progress.lastUpdateTime || 'Unknown'}`);
      
      const answer = await askQuestion('\nDo you want to continue from where you left off? (y/n): ');
      
      if (answer.toLowerCase() !== 'y') {
        const resetAnswer = await askQuestion('Reset and start from beginning? (y/n): ');
        if (resetAnswer.toLowerCase() === 'y') {
          // Reset progress
          await indexer.saveProgress({
            lastProcessedIndex: -1,
            lastUpdateTime: null,
            stats: {
              accountsProcessed: 0,
              transfersIndexed: 0
            }
          });
          console.log('✅ Progress reset. Starting from beginning.');
        } else {
          console.log('❌ Indexing cancelled.');
          rl.close();
          return;
        }
      }
    } else {
      console.log('\n📊 Indexing Configuration:');
      console.log(`   Lookback period: 30 days`);
      console.log(`   Accounts to index: Top 100`);
      console.log(`   Batch size: 5 accounts`);
      console.log(`   Rate limit: 2 seconds between batches`);
      
      console.log('\n⚠️  This process will:');
      console.log('   1. Fetch transfer history for top 100 Polkadot accounts');
      console.log('   2. Index approximately 30 days of historical data');
      console.log('   3. May take 30-60 minutes to complete');
      console.log('   4. Use approximately 50-100 MB of disk space');
      
      const answer = await askQuestion('\nProceed with indexing? (y/n): ');
      
      if (answer.toLowerCase() !== 'y') {
        console.log('❌ Indexing cancelled.');
        rl.close();
        return;
      }
    }
    
    rl.close();
    
    console.log('\n🚀 Starting historical indexing...\n');
    
    // Run the indexing process
    const stats = await indexer.indexHistoricalData();
    
    // Display final summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ Historical Indexing Complete!\n');
    console.log(`📈 Statistics:`);
    console.log(`   Accounts processed: ${stats.accountsProcessed}`);
    console.log(`   Transfers indexed: ${stats.transfersIndexed}`);
    console.log(`   Errors encountered: ${stats.errors.length}`);
    console.log(`   Time taken: ${Math.round((Date.now() - stats.startTime) / 1000)}s`);
    
    if (stats.errors.length > 0) {
      console.log('\n⚠️  Errors:');
      stats.errors.slice(0, 5).forEach(error => {
        console.log(`   ${error.account.slice(0,8)}... - ${error.error}`);
      });
      if (stats.errors.length > 5) {
        console.log(`   ... and ${stats.errors.length - 5} more`);
      }
    }
    
    // Load and display summary
    const summary = await indexer.getIndexSummary();
    if (summary) {
      console.log('\n📊 Top 10 Most Active Accounts (by volume):');
      summary.topAccounts.slice(0, 10).forEach((account, idx) => {
        const identity = account.identity || account.address.slice(0, 8) + '...';
        const volume = (account.totalVolume / 1e6).toFixed(2);
        console.log(`   ${idx + 1}. ${identity}: ${volume}M DOT (${account.transferCount} transfers)`);
      });
      
      console.log('\n📅 Activity Summary:');
      console.log(`   Total volume: ${(summary.aggregateStats.totalVolume / 1e6).toFixed(2)}M DOT`);
      console.log(`   Daily average: ${(summary.aggregateStats.dailyAverageVolume / 1e6).toFixed(2)}M DOT`);
      
      if (summary.aggregateStats.mostActiveDay) {
        console.log(`   Most active: ${summary.aggregateStats.mostActiveDay.date} (${(summary.aggregateStats.mostActiveDay.volume / 1e6).toFixed(2)}M DOT)`);
      }
      if (summary.aggregateStats.quietestDay) {
        console.log(`   Quietest: ${summary.aggregateStats.quietestDay.date} (${(summary.aggregateStats.quietestDay.volume / 1e6).toFixed(2)}M DOT)`);
      }
    }
    
    console.log('\n💡 Next steps:');
    console.log('   - Use analyze-patterns.js to analyze the indexed data');
    console.log('   - Query specific accounts with get-account-history.js');
    console.log('   - View the full summary in data/historical-index/index-summary.json');
    
  } catch (error) {
    monitorLogger.error('Indexing failed', error);
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Indexing interrupted. Progress has been saved.');
  console.log('Run this script again to continue from where you left off.');
  process.exit(0);
});

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };