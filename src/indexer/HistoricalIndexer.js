const SubscanClient = require('../api/SubscanClient');
const FileStorage = require('../storage/FileStorage');
const { monitorLogger } = require('../utils/simple-logger');
const fs = require('fs').promises;
const path = require('path');

class HistoricalIndexer {
  constructor(config = {}) {
    this.config = {
      subscanApiKey: config.subscanApiKey || process.env.SUBSCAN_API_KEY || '',
      dataPath: config.dataPath || './data',
      lookbackDays: config.lookbackDays || 30,
      batchSize: config.batchSize || 5, // Process 5 accounts at a time
      pageSize: config.pageSize || 100, // Transfers per page
      rateLimitDelay: config.rateLimitDelay || 2000, // 2 seconds between batches
      ...config
    };
    
    this.api = new SubscanClient(this.config.subscanApiKey);
    this.storage = new FileStorage(this.config.dataPath);
    
    this.indexPath = path.join(this.config.dataPath, 'historical-index');
    this.progressFile = path.join(this.indexPath, 'indexing-progress.json');
    
    this.stats = {
      accountsProcessed: 0,
      transfersIndexed: 0,
      startTime: null,
      errors: []
    };
  }

  async initialize() {
    // Create index directory if it doesn't exist
    try {
      await fs.mkdir(this.indexPath, { recursive: true });
      monitorLogger.success('Historical index directory created');
    } catch (error) {
      monitorLogger.error('Failed to create index directory', error);
    }
  }

  async loadProgress() {
    try {
      const data = await fs.readFile(this.progressFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return {
        lastProcessedIndex: -1,
        lastUpdateTime: null,
        stats: {
          accountsProcessed: 0,
          transfersIndexed: 0
        }
      };
    }
  }

  async saveProgress(progress) {
    try {
      await fs.writeFile(this.progressFile, JSON.stringify(progress, null, 2));
    } catch (error) {
      monitorLogger.error('Failed to save progress', error);
    }
  }

  async indexHistoricalData() {
    monitorLogger.section('📚 Starting Historical Data Indexing');
    this.stats.startTime = Date.now();
    
    try {
      await this.initialize();
      
      // Load progress in case we're resuming
      const progress = await this.loadProgress();
      
      // Fetch top 100 accounts
      monitorLogger.info('Fetching top 100 accounts...');
      const accounts = await this.api.getAllTopAccounts(100);
      monitorLogger.success(`Loaded ${accounts.length} accounts`);
      
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - this.config.lookbackDays);
      
      monitorLogger.info(`Indexing period: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      // Process accounts starting from where we left off
      const startIndex = progress.lastProcessedIndex + 1;
      
      for (let i = startIndex; i < accounts.length; i += this.config.batchSize) {
        const batch = accounts.slice(i, Math.min(i + this.config.batchSize, accounts.length));
        
        monitorLogger.section(`Processing batch ${Math.floor(i/this.config.batchSize) + 1}/${Math.ceil(accounts.length/this.config.batchSize)}`);
        
        await this.processBatch(batch, startDate, endDate);
        
        // Update progress
        const newProgress = {
          lastProcessedIndex: Math.min(i + this.config.batchSize - 1, accounts.length - 1),
          lastUpdateTime: new Date().toISOString(),
          stats: this.stats
        };
        await this.saveProgress(newProgress);
        
        // Rate limiting between batches
        if (i + this.config.batchSize < accounts.length) {
          monitorLogger.info(`Rate limiting... waiting ${this.config.rateLimitDelay}ms`);
          await new Promise(resolve => setTimeout(resolve, this.config.rateLimitDelay));
        }
      }
      
      // Generate index summary
      await this.generateIndexSummary(accounts);
      
      const duration = Date.now() - this.stats.startTime;
      monitorLogger.success('Historical indexing completed', {
        duration: `${Math.round(duration / 1000)}s`,
        accountsProcessed: this.stats.accountsProcessed,
        transfersIndexed: this.stats.transfersIndexed,
        errors: this.stats.errors.length
      });
      
      return this.stats;
      
    } catch (error) {
      monitorLogger.error('Historical indexing failed', error);
      throw error;
    }
  }

  async processBatch(accounts, startDate, endDate) {
    const batchPromises = accounts.map(account => 
      this.indexAccountHistory(account, startDate, endDate)
    );
    
    const results = await Promise.allSettled(batchPromises);
    
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        this.stats.accountsProcessed++;
        this.stats.transfersIndexed += result.value.transferCount || 0;
      } else {
        const account = accounts[idx];
        monitorLogger.error(`Failed to index ${account.address.slice(0,8)}...`, result.reason);
        this.stats.errors.push({
          account: account.address,
          error: result.reason.message
        });
      }
    });
  }

  async indexAccountHistory(account, startDate, endDate) {
    const accountData = {
      address: account.address,
      identity: account.identity,
      accountType: account.accountType,
      balance: account.balanceFloat,
      transfers: [],
      dailyActivity: {},
      summary: {
        totalIncoming: 0,
        totalOutgoing: 0,
        transferCount: 0,
        uniqueCounterparties: new Set(),
        largestTransfer: 0,
        averageTransfer: 0
      }
    };
    
    try {
      // Fetch all transfers for the account
      let page = 0;
      let hasMore = true;
      const cutoffTimestamp = Math.floor(startDate.getTime() / 1000);
      
      while (hasMore) {
        const transfers = await this.api.getAccountTransfers(
          account.address, 
          this.config.pageSize,
          page
        );
        
        if (!transfers || transfers.length === 0) {
          hasMore = false;
          break;
        }
        
        // Process transfers
        for (const transfer of transfers) {
          const timestamp = transfer.block_timestamp;
          
          // Stop if we've gone past our lookback period
          if (timestamp < cutoffTimestamp) {
            hasMore = false;
            break;
          }
          
          // Process the transfer
          const processedTransfer = this.processTransfer(transfer, account.address);
          accountData.transfers.push(processedTransfer);
          
          // Update summary statistics
          this.updateAccountSummary(accountData.summary, processedTransfer);
          
          // Track daily activity
          const dateKey = new Date(timestamp * 1000).toISOString().split('T')[0];
          if (!accountData.dailyActivity[dateKey]) {
            accountData.dailyActivity[dateKey] = {
              incoming: 0,
              outgoing: 0,
              count: 0
            };
          }
          
          const daily = accountData.dailyActivity[dateKey];
          daily.count++;
          if (processedTransfer.direction === 'incoming') {
            daily.incoming += processedTransfer.amount;
          } else {
            daily.outgoing += processedTransfer.amount;
          }
        }
        
        page++;
        
        // Small delay to avoid rate limits
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      // Calculate final statistics
      if (accountData.transfers.length > 0) {
        accountData.summary.averageTransfer = 
          (accountData.summary.totalIncoming + accountData.summary.totalOutgoing) / 
          accountData.transfers.length;
      }
      accountData.summary.uniqueCounterparties = accountData.summary.uniqueCounterparties.size;
      
      // Save account index data
      await this.saveAccountIndex(account.address, accountData);
      
      monitorLogger.info(`Indexed ${account.address.slice(0,8)}... - ${accountData.transfers.length} transfers`);
      
      return {
        address: account.address,
        transferCount: accountData.transfers.length
      };
      
    } catch (error) {
      monitorLogger.error(`Failed to index history for ${account.address}`, error);
      throw error;
    }
  }

  processTransfer(transfer, accountAddress) {
    const isIncoming = transfer.to === accountAddress;
    const amount = parseFloat(transfer.amount || 0);
    
    return {
      hash: transfer.hash,
      block: transfer.block_num,
      timestamp: transfer.block_timestamp,
      date: new Date(transfer.block_timestamp * 1000).toISOString(),
      direction: isIncoming ? 'incoming' : 'outgoing',
      counterparty: isIncoming ? transfer.from : transfer.to,
      amount,
      success: transfer.success,
      module: transfer.module,
      eventId: `${transfer.block_num}-${transfer.event_idx}`
    };
  }

  updateAccountSummary(summary, transfer) {
    summary.transferCount++;
    summary.uniqueCounterparties.add(transfer.counterparty);
    
    if (transfer.amount > summary.largestTransfer) {
      summary.largestTransfer = transfer.amount;
    }
    
    if (transfer.direction === 'incoming') {
      summary.totalIncoming += transfer.amount;
    } else {
      summary.totalOutgoing += transfer.amount;
    }
  }

  async saveAccountIndex(address, data) {
    const filename = `${address.slice(0, 12)}.json`;
    const filepath = path.join(this.indexPath, filename);
    
    try {
      await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    } catch (error) {
      monitorLogger.error(`Failed to save index for ${address}`, error);
      throw error;
    }
  }

  async generateIndexSummary(accounts) {
    monitorLogger.info('Generating index summary...');
    
    const summary = {
      indexDate: new Date().toISOString(),
      lookbackDays: this.config.lookbackDays,
      accountsIndexed: this.stats.accountsProcessed,
      totalTransfers: this.stats.transfersIndexed,
      topAccounts: [],
      aggregateStats: {
        totalVolume: 0,
        dailyAverageVolume: 0,
        mostActiveDay: null,
        quietestDay: null
      }
    };
    
    // Load and analyze all indexed accounts
    const dailyVolumes = {};
    
    for (const account of accounts.slice(0, this.stats.accountsProcessed)) {
      try {
        const filename = `${account.address.slice(0, 12)}.json`;
        const filepath = path.join(this.indexPath, filename);
        const data = JSON.parse(await fs.readFile(filepath, 'utf8'));
        
        // Add to top accounts
        summary.topAccounts.push({
          address: account.address,
          identity: account.identity,
          type: account.accountType,
          transferCount: data.summary.transferCount,
          totalVolume: data.summary.totalIncoming + data.summary.totalOutgoing,
          netFlow: data.summary.totalIncoming - data.summary.totalOutgoing
        });
        
        // Aggregate daily volumes
        for (const [date, activity] of Object.entries(data.dailyActivity)) {
          if (!dailyVolumes[date]) {
            dailyVolumes[date] = { volume: 0, count: 0 };
          }
          dailyVolumes[date].volume += activity.incoming + activity.outgoing;
          dailyVolumes[date].count += activity.count;
        }
        
        summary.aggregateStats.totalVolume += 
          data.summary.totalIncoming + data.summary.totalOutgoing;
          
      } catch (error) {
        monitorLogger.warn(`Failed to load summary for ${account.address}`, error);
      }
    }
    
    // Sort top accounts by volume
    summary.topAccounts.sort((a, b) => b.totalVolume - a.totalVolume);
    summary.topAccounts = summary.topAccounts.slice(0, 20); // Keep top 20
    
    // Calculate daily stats
    const dailyEntries = Object.entries(dailyVolumes);
    if (dailyEntries.length > 0) {
      summary.aggregateStats.dailyAverageVolume = 
        summary.aggregateStats.totalVolume / dailyEntries.length;
      
      // Find most and least active days
      dailyEntries.sort((a, b) => b[1].volume - a[1].volume);
      summary.aggregateStats.mostActiveDay = {
        date: dailyEntries[0][0],
        volume: dailyEntries[0][1].volume,
        transfers: dailyEntries[0][1].count
      };
      summary.aggregateStats.quietestDay = {
        date: dailyEntries[dailyEntries.length - 1][0],
        volume: dailyEntries[dailyEntries.length - 1][1].volume,
        transfers: dailyEntries[dailyEntries.length - 1][1].count
      };
    }
    
    // Save summary
    const summaryPath = path.join(this.indexPath, 'index-summary.json');
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    
    monitorLogger.success('Index summary generated');
    
    return summary;
  }

  // Query methods for accessing indexed data
  async getAccountHistory(address) {
    try {
      const filename = `${address.slice(0, 12)}.json`;
      const filepath = path.join(this.indexPath, filename);
      const data = await fs.readFile(filepath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      monitorLogger.error(`Failed to load history for ${address}`, error);
      return null;
    }
  }

  async getIndexSummary() {
    try {
      const summaryPath = path.join(this.indexPath, 'index-summary.json');
      const data = await fs.readFile(summaryPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      monitorLogger.error('Failed to load index summary', error);
      return null;
    }
  }

  async searchTransfers(criteria) {
    // Search indexed transfers based on criteria
    // This is a placeholder for more advanced search functionality
    const results = [];
    
    // Implementation would search through indexed files
    // based on criteria like amount range, date range, counterparty, etc.
    
    return results;
  }
}

module.exports = HistoricalIndexer;