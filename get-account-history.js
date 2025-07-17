#!/usr/bin/env node

const HistoricalIndexer = require('./src/indexer/HistoricalIndexer');
const { monitorLogger } = require('./src/utils/simple-logger');

async function main() {
  const address = process.argv[2];
  
  if (!address) {
    console.log('Usage: node get-account-history.js <address>');
    console.log('Example: node get-account-history.js 16ZL8yLyXv3V3L3z9ofR1ovFLziyXaN1DPq4yffMAZ9czzBD');
    process.exit(1);
  }
  
  try {
    const indexer = new HistoricalIndexer({
      dataPath: './data'
    });
    
    console.log(`\n🔍 Loading history for ${address.slice(0, 8)}...\n`);
    
    const history = await indexer.getAccountHistory(address);
    
    if (!history) {
      console.log('❌ No history found for this address.');
      console.log('   Make sure you have run index-historical-data.js first.');
      return;
    }
    
    // Display account summary
    console.log('📊 Account Summary:');
    console.log(`   Address: ${history.address}`);
    console.log(`   Identity: ${history.identity || 'Unknown'}`);
    console.log(`   Type: ${history.accountType}`);
    console.log(`   Current Balance: ${history.balance.toLocaleString()} DOT`);
    
    console.log('\n📈 Transfer Statistics:');
    console.log(`   Total Transfers: ${history.summary.transferCount}`);
    console.log(`   Total Incoming: ${history.summary.totalIncoming.toLocaleString()} DOT`);
    console.log(`   Total Outgoing: ${history.summary.totalOutgoing.toLocaleString()} DOT`);
    console.log(`   Net Flow: ${(history.summary.totalIncoming - history.summary.totalOutgoing).toLocaleString()} DOT`);
    console.log(`   Average Transfer: ${Math.round(history.summary.averageTransfer).toLocaleString()} DOT`);
    console.log(`   Largest Transfer: ${history.summary.largestTransfer.toLocaleString()} DOT`);
    console.log(`   Unique Counterparties: ${history.summary.uniqueCounterparties}`);
    
    // Show daily activity pattern
    console.log('\n📅 Daily Activity (last 7 days):');
    const dates = Object.keys(history.dailyActivity).sort().slice(-7);
    dates.forEach(date => {
      const activity = history.dailyActivity[date];
      const volume = activity.incoming + activity.outgoing;
      console.log(`   ${date}: ${activity.count} transfers, ${volume.toLocaleString()} DOT volume`);
    });
    
    // Show recent transfers
    console.log('\n🕐 Recent Transfers (last 10):');
    history.transfers.slice(0, 10).forEach((transfer, idx) => {
      const direction = transfer.direction === 'incoming' ? '← IN ' : '→ OUT';
      const counterparty = transfer.counterparty.slice(0, 8) + '...';
      const date = new Date(transfer.timestamp * 1000).toLocaleString();
      console.log(`   ${idx + 1}. ${direction} ${transfer.amount.toLocaleString()} DOT ${transfer.direction === 'incoming' ? 'from' : 'to'} ${counterparty}`);
      console.log(`      ${date} | Block #${transfer.block}`);
    });
    
    // Show counterparty analysis
    console.log('\n🔗 Top Counterparties:');
    const counterpartyCounts = {};
    const counterpartyVolumes = {};
    
    history.transfers.forEach(transfer => {
      const cp = transfer.counterparty;
      counterpartyCounts[cp] = (counterpartyCounts[cp] || 0) + 1;
      counterpartyVolumes[cp] = (counterpartyVolumes[cp] || 0) + transfer.amount;
    });
    
    const topCounterparties = Object.entries(counterpartyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    topCounterparties.forEach(([cp, count]) => {
      const volume = counterpartyVolumes[cp];
      console.log(`   ${cp.slice(0, 8)}...: ${count} transfers, ${volume.toLocaleString()} DOT total`);
    });
    
    console.log('\n✅ Account history loaded successfully');
    
  } catch (error) {
    monitorLogger.error('Failed to load account history', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };