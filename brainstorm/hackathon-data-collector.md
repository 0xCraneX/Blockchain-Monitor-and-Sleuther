# Hackathon Data Collector - Using Existing SubscanService

## Good News!

The polkadot-analysis-tool already has a `SubscanService` with:
- ✅ Built-in rate limiting (5 req/s)
- ✅ Token bucket implementation
- ✅ Circuit breaker for resilience
- ✅ All the methods we need

## Quick Data Collection Script

```javascript
// src/collectors/subscan-historical-collector.js
import { subscanService } from '../../../polkadot-analysis-tool/src/services/SubscanService.js';
import fs from 'fs/promises';
import path from 'path';

class SubscanHistoricalCollector {
  constructor() {
    this.OUTPUT_DIR = './data/historical';
    this.BASELINE_DIR = './data/baselines';
  }

  async collectTopAddresses() {
    console.log('🚀 Starting Subscan data collection...');
    
    // Step 1: Get interesting addresses from Subscan
    const interestingAddresses = [
      // Known exchanges
      '12xtAYsRUrmbniiziKXqWKDLbkAShg2aZPBFQyPpJBBHHqHo', // Binance 1
      '12qTx8hbS3M6tPrWWJjQCKPWEtQjkPwuGSnTycTF3dqQxnPq', // Binance 2
      '14Vxs7UB9CqcvJGMXbkxNHFQs9TXEuUfUC5hjUwNMp3KHhUG', // Kraken 1
      
      // Known whales (you can find these on Subscan's rich list)
      '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn', // Treasury
      '16ZL8yLyXv3V3L3z9ofR1ovFLziyXaN1DPq4yffMAZ9czzBD', // Web3 Foundation
      
      // Active traders (add more from Subscan)
    ];

    // Add more addresses by searching for high-activity accounts
    // This is where you'd normally query Subscan's rich list API
    // but that might require paid tier
    
    return interestingAddresses;
  }

  async collectAddressHistory(address) {
    const profile = {
      address,
      firstSeen: null,
      lastSeen: null,
      transactionCount: 0,
      totalVolume: BigInt(0),
      avgTransactionSize: BigInt(0),
      maxTransaction: BigInt(0),
      counterparties: new Set(),
      dailyActivity: {},
      transfers: []
    };

    try {
      console.log(`📊 Collecting data for ${address.slice(0, 8)}...`);
      
      // Get account info first
      const accountInfo = await subscanService.getAccountInfo(address);
      console.log(`  ✓ Account: ${accountInfo.identity?.display || 'Unknown'}`);
      
      // Collect transfers (with rate limiting built in!)
      let page = 0;
      let hasMore = true;
      
      while (hasMore && page < 10) { // Limit to 10 pages for hackathon
        const result = await subscanService.getTransfers(address, {
          row: 100,
          page: page
        });
        
        if (!result.transfers || result.transfers.length === 0) {
          hasMore = false;
          break;
        }
        
        // Process transfers
        for (const transfer of result.transfers) {
          const value = BigInt(transfer.amount || '0');
          const timestamp = transfer.block_timestamp * 1000; // Convert to ms
          
          // Update profile
          profile.transactionCount++;
          profile.totalVolume += value;
          
          if (value > profile.maxTransaction) {
            profile.maxTransaction = value;
          }
          
          if (!profile.firstSeen || timestamp < profile.firstSeen) {
            profile.firstSeen = timestamp;
          }
          
          if (!profile.lastSeen || timestamp > profile.lastSeen) {
            profile.lastSeen = timestamp;
          }
          
          // Track counterparties
          const counterparty = transfer.from === address ? transfer.to : transfer.from;
          profile.counterparties.add(counterparty);
          
          // Track daily activity
          const date = new Date(timestamp).toISOString().split('T')[0];
          profile.dailyActivity[date] = (profile.dailyActivity[date] || 0) + 1;
          
          // Store transfer for analysis
          profile.transfers.push({
            hash: transfer.hash,
            from: transfer.from,
            to: transfer.to,
            value: value.toString(),
            timestamp,
            block: transfer.block_num
          });
        }
        
        console.log(`  ✓ Page ${page + 1}: ${result.transfers.length} transfers`);
        page++;
        
        if (result.transfers.length < 100) {
          hasMore = false;
        }
      }
      
      // Calculate averages
      if (profile.transactionCount > 0) {
        profile.avgTransactionSize = profile.totalVolume / BigInt(profile.transactionCount);
      }
      
      // Convert BigInt to string for JSON
      profile.totalVolume = profile.totalVolume.toString();
      profile.avgTransactionSize = profile.avgTransactionSize.toString();
      profile.maxTransaction = profile.maxTransaction.toString();
      profile.counterparties = Array.from(profile.counterparties);
      
      return profile;
      
    } catch (error) {
      console.error(`  ❌ Error collecting ${address}: ${error.message}`);
      return null;
    }
  }

  async buildBaseline(profiles) {
    console.log('🔨 Building baseline from collected data...');
    
    const baseline = {
      addresses: {},
      globalStats: {
        totalAddresses: 0,
        totalTransactions: 0,
        avgTransactionsPerAddress: 0,
        activeAddresses30d: 0,
        dormantAddresses180d: 0
      }
    };
    
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    const halfYearAgo = now - (180 * 24 * 60 * 60 * 1000);
    
    for (const profile of profiles) {
      if (!profile) continue;
      
      baseline.addresses[profile.address] = {
        avgSize: profile.avgTransactionSize,
        maxSize: profile.maxTransaction,
        avgFrequency: profile.transactionCount > 1 ? 
          (profile.lastSeen - profile.firstSeen) / (profile.transactionCount - 1) : 
          0,
        lastSeen: profile.lastSeen,
        firstSeen: profile.firstSeen,
        txCount: profile.transactionCount,
        commonCounterparties: profile.counterparties.slice(0, 10) // Top 10
      };
      
      baseline.globalStats.totalAddresses++;
      baseline.globalStats.totalTransactions += profile.transactionCount;
      
      if (profile.lastSeen > thirtyDaysAgo) {
        baseline.globalStats.activeAddresses30d++;
      }
      
      if (profile.lastSeen < halfYearAgo) {
        baseline.globalStats.dormantAddresses180d++;
      }
    }
    
    baseline.globalStats.avgTransactionsPerAddress = 
      baseline.globalStats.totalTransactions / baseline.globalStats.totalAddresses;
    
    return baseline;
  }

  async collectXCMRoutes() {
    // For MVP, hardcode common routes
    const xcmRoutes = {
      'polkadot->assetHub': { avgDailyVolume: '1000000000000000', avgTxCount: 50 },
      'polkadot->moonbeam': { avgDailyVolume: '500000000000000', avgTxCount: 30 },
      'polkadot->acala': { avgDailyVolume: '300000000000000', avgTxCount: 20 },
      'assetHub->moonbeam': { avgDailyVolume: '200000000000000', avgTxCount: 15 }
    };
    
    return xcmRoutes;
  }

  async run() {
    // Create directories
    await fs.mkdir(this.OUTPUT_DIR, { recursive: true });
    await fs.mkdir(this.BASELINE_DIR, { recursive: true });
    
    // Step 1: Get interesting addresses
    const addresses = await this.collectTopAddresses();
    console.log(`Found ${addresses.length} addresses to analyze`);
    
    // Step 2: Collect history for each address
    const profiles = [];
    for (const address of addresses) {
      const profile = await this.collectAddressHistory(address);
      if (profile) {
        profiles.push(profile);
        
        // Save individual profile
        await fs.writeFile(
          path.join(this.OUTPUT_DIR, `${address}.json`),
          JSON.stringify(profile, null, 2)
        );
      }
      
      // Be nice to Subscan's servers
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Step 3: Build baseline
    const baseline = await this.buildBaseline(profiles);
    baseline.xcmRoutes = await this.collectXCMRoutes();
    
    // Save baseline
    await fs.writeFile(
      path.join(this.BASELINE_DIR, 'baseline.json'),
      JSON.stringify(baseline, null, 2)
    );
    
    console.log('✅ Data collection complete!');
    console.log(`📁 Profiles saved in: ${this.OUTPUT_DIR}`);
    console.log(`📊 Baseline saved in: ${this.BASELINE_DIR}`);
    
    // Print summary
    console.log('\n📈 Summary:');
    console.log(`- Addresses analyzed: ${baseline.globalStats.totalAddresses}`);
    console.log(`- Total transactions: ${baseline.globalStats.totalTransactions}`);
    console.log(`- Active (30d): ${baseline.globalStats.activeAddresses30d}`);
    console.log(`- Dormant (180d): ${baseline.globalStats.dormantAddresses180d}`);
  }
}

// Run immediately
const collector = new SubscanHistoricalCollector();
collector.run().catch(console.error);
```

## Smart Shortcuts for Hackathon

### 1. Focus on Known Interesting Addresses
Instead of collecting ALL data, focus on:
- Exchange wallets (high volume)
- Treasury accounts (governance interest)
- Known whales (from Subscan rich list)
- Recently active dormant accounts

### 2. Pre-identify Anomalies
Look for addresses on Subscan that:
- Haven't moved in 6+ months but have large balances
- Have interesting transaction patterns
- Are involved in recent big movements

### 3. Create Demo Scenarios
```javascript
// demo-addresses.js
export const DEMO_SCENARIOS = {
  dormantWhale: {
    address: '1234...', // Find a real dormant whale on Subscan
    story: "ICO participant from 2020, dormant for 800 days",
    lastActive: "2021-03-15",
    balance: "250000 DOT"
  },
  
  washTrading: {
    addresses: ['addr1', 'addr2', 'addr3'], // Find circular patterns
    story: "Circular transfers between 3 addresses",
    pattern: "A→B→C→A repeatedly"
  },
  
  bridgeSpike: {
    route: "polkadot->moonbeam",
    normalVolume: "50000 DOT/day",
    spikeVolume: "2500000 DOT",
    story: "50x normal bridge volume detected"
  }
};
```

## Quick Win: Use Subscan's UI

For the hackathon, you can also:
1. **Manually find interesting addresses** on Subscan's website
2. **Screenshot their history** for demo
3. **Use the API to monitor them** during your presentation

Example addresses to check:
- Rich list addresses that haven't moved recently
- Exchange wallets with unusual patterns
- Bridge addresses with volume spikes

## Running the Collector

```bash
# Set up environment
cd /workspace/polkadot-analysis-tool/blockchain-monitoring-tool
npm init -y
npm install dotenv

# Create .env file
echo "SUBSCAN_API_KEY=your_key_if_you_have_one" > .env

# Run collector
node src/collectors/subscan-historical-collector.js
```

This will:
1. Collect data for ~10-20 interesting addresses
2. Build baseline profiles
3. Save everything for your anomaly detector
4. Respect Subscan's rate limits automatically

The beauty: You're reusing tested, production code with built-in rate limiting!