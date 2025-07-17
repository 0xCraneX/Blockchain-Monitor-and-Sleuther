#!/usr/bin/env node

const HistoricalIndexer = require('./src/indexer/HistoricalIndexer');
const { monitorLogger } = require('./src/utils/simple-logger');

require('dotenv').config();

async function main() {
  monitorLogger.section('🚀 Quick Sample Historical Indexing');
  
  console.log('\n📊 Running quick indexing for top 10 accounts (7 days)...\n');
  
  try {
    // Initialize indexer with smaller parameters
    const indexer = new HistoricalIndexer({
      subscanApiKey: process.env.SUBSCAN_API_KEY || '',
      dataPath: './data',
      lookbackDays: 7, // Only 7 days instead of 30
      batchSize: 2, // Smaller batches
      pageSize: 50, // Less transfers per page
      rateLimitDelay: 1000 // Faster rate limit
    });
    
    // Override to only process first 10 accounts
    const originalMethod = indexer.indexHistoricalData.bind(indexer);
    indexer.indexHistoricalData = async function() {
      monitorLogger.section('📚 Starting Quick Sample Indexing');
      this.stats.startTime = Date.now();
      
      await this.initialize();
      
      // Fetch top 100 but only process first 10
      monitorLogger.info('Fetching accounts...');
      const allAccounts = await this.api.getAllTopAccounts(100);
      const accounts = allAccounts.slice(0, 10); // Only process first 10
      
      monitorLogger.success(`Processing ${accounts.length} accounts (quick sample)`);
      
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - this.config.lookbackDays);
      
      for (let i = 0; i < accounts.length; i += this.config.batchSize) {
        const batch = accounts.slice(i, Math.min(i + this.config.batchSize, accounts.length));
        
        monitorLogger.section(`Processing batch ${Math.floor(i/this.config.batchSize) + 1}/${Math.ceil(accounts.length/this.config.batchSize)}`);
        
        await this.processBatch(batch, startDate, endDate);
        
        if (i + this.config.batchSize < accounts.length) {
          await new Promise(resolve => setTimeout(resolve, this.config.rateLimitDelay));
        }
      }
      
      await this.generateIndexSummary(accounts);
      
      const duration = Date.now() - this.stats.startTime;
      monitorLogger.success('Quick sample indexing completed', {
        duration: `${Math.round(duration / 1000)}s`,
        accountsProcessed: this.stats.accountsProcessed,
        transfersIndexed: this.stats.transfersIndexed
      });
      
      return this.stats;
    };
    
    // Run the indexing
    const stats = await indexer.indexHistoricalData();
    
    // Display results
    console.log('\n' + '='.repeat(60));
    console.log('✅ Quick Sample Indexing Complete!\n');
    console.log(`📈 Statistics:`);
    console.log(`   Accounts processed: ${stats.accountsProcessed}`);
    console.log(`   Transfers indexed: ${stats.transfersIndexed}`);
    console.log(`   Time taken: ${Math.round((Date.now() - stats.startTime) / 1000)}s`);
    
    // Load and display summary
    const summary = await indexer.getIndexSummary();
    if (summary && summary.topAccounts) {
      console.log('\n📊 Sample Results:');
      summary.topAccounts.slice(0, 5).forEach((account, idx) => {
        const identity = account.identity || account.address.slice(0, 8) + '...';
        const volume = (account.totalVolume / 1e6).toFixed(2);
        console.log(`   ${idx + 1}. ${identity}: ${volume}M DOT (${account.transferCount} transfers)`);
      });
    }
    
    console.log('\n💡 This was a quick sample. To index all 100 accounts for 30 days, run:');
    console.log('   node index-historical-data.js');
    
  } catch (error) {
    monitorLogger.error('Quick indexing failed', error);
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };