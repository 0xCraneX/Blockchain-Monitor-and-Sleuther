import { PersistentHistoricalCache } from './PersistentHistoricalCache.js';

/**
 * IncrementalFetcher - Fetches only NEW data since last checkpoint
 * Dramatically reduces API calls and data transfer for historical blockchain data
 */
export class IncrementalFetcher {
  constructor(subscanClient, config = {}) {
    this.client = subscanClient;
    this.config = {
      batchSize: config.batchSize || 100,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      safetyBlocks: config.safetyBlocks || 10, // Re-fetch last N blocks for safety
      maxIncrementalGap: config.maxIncrementalGap || 50000, // Max blocks to fetch incrementally
      ...config
    };
    
    // Initialize persistent cache
    this.cache = new PersistentHistoricalCache({
      l4Path: './data/incremental-cache',
      l4Compression: true,
      l4Deduplication: true,
      ...config.cache
    });
    
    // Track fetch statistics
    this.stats = {
      totalFetches: 0,
      incrementalFetches: 0,
      fullFetches: 0,
      dataSavedMB: 0,
      apiCallsSaved: 0,
      averageIncrementalSize: 0
    };
    
    console.log('[FETCHER] IncrementalFetcher initialized', {
      batchSize: this.config.batchSize,
      safetyBlocks: this.config.safetyBlocks,
      maxGap: this.config.maxIncrementalGap
    });
  }
  
  /**
   * Fetch transfers incrementally - only new transfers since last fetch
   */
  async fetchTransfersIncremental(address, options = {}) {
    console.log(`[INCREMENTAL] Fetching transfers for ${address.slice(0, 8)}...`);
    
    const checkpoint = this.cache.getCheckpoint('transfers', address);
    const cacheKey = `transfers:${address}`;
    
    this.stats.totalFetches++;
    
    // Check if we have cached data
    const cachedTransfers = await this.cache.get(cacheKey);
    
    if (!cachedTransfers || this.shouldDoFullRefresh(checkpoint, options)) {
      console.log('[INCREMENTAL] Performing full fetch (no cache or forced refresh)');
      return await this.fetchTransfersFull(address, options);
    }
    
    console.log(`[INCREMENTAL] Found checkpoint at block ${checkpoint.lastBlock}`);
    
    // Fetch only new transfers since checkpoint
    const newTransfers = await this.fetchNewTransfersSince(address, checkpoint);
    
    if (newTransfers.length === 0) {
      console.log('[INCREMENTAL] No new transfers found');
      this.stats.incrementalFetches++;
      this.stats.apiCallsSaved++;
      return cachedTransfers;
    }
    
    console.log(`[INCREMENTAL] Found ${newTransfers.length} new transfers`);
    
    // Merge with cached data
    const mergedTransfers = this.mergeTransfers(cachedTransfers, newTransfers);
    
    // Update cache
    await this.cache.setWithClassification(cacheKey, mergedTransfers);
    
    this.stats.incrementalFetches++;
    this.stats.averageIncrementalSize = 
      (this.stats.averageIncrementalSize * (this.stats.incrementalFetches - 1) + newTransfers.length) / this.stats.incrementalFetches;
    
    console.log(`[INCREMENTAL] Merged transfers: ${cachedTransfers.length} cached + ${newTransfers.length} new = ${mergedTransfers.length} total`);
    
    return mergedTransfers;
  }
  
  /**
   * Fetch account balances incrementally
   */
  async fetchBalanceHistoryIncremental(address, options = {}) {
    console.log(`[INCREMENTAL] Fetching balance history for ${address.slice(0, 8)}...`);
    
    const checkpoint = this.cache.getCheckpoint('balance_history', address);
    const cacheKey = `balance_history:${address}`;
    
    const cachedHistory = await this.cache.get(cacheKey);
    
    if (!cachedHistory || this.shouldDoFullRefresh(checkpoint, options)) {
      console.log('[INCREMENTAL] Performing full balance history fetch');
      return await this.fetchBalanceHistoryFull(address, options);
    }
    
    // For balance history, we might want to check recent blocks for changes
    const recentChanges = await this.fetchRecentBalanceChanges(address, checkpoint);
    
    if (recentChanges.length === 0) {
      this.stats.incrementalFetches++;
      this.stats.apiCallsSaved++;
      return cachedHistory;
    }
    
    const mergedHistory = this.mergeBalanceHistory(cachedHistory, recentChanges);
    await this.cache.setWithClassification(cacheKey, mergedHistory);
    
    this.stats.incrementalFetches++;
    return mergedHistory;
  }
  
  /**
   * Batch fetch multiple addresses incrementally
   */
  async batchFetchIncremental(addresses, dataType = 'transfers', options = {}) {
    console.log(`[INCREMENTAL] Batch fetching ${dataType} for ${addresses.length} addresses`);
    
    const results = new Map();
    const batchSize = this.config.batchSize;
    
    // Group addresses by their checkpoint status
    const addressGroups = this.groupAddressesByCheckpoint(addresses, dataType);
    
    console.log(`[INCREMENTAL] Address groups: ${addressGroups.incremental.length} incremental, ${addressGroups.full.length} full fetch`);
    
    // Process incremental fetches first (faster)
    for (let i = 0; i < addressGroups.incremental.length; i += batchSize) {
      const batch = addressGroups.incremental.slice(i, i + batchSize);
      
      for (const address of batch) {
        try {
          const data = await this.fetchTransfersIncremental(address, options);
          results.set(address, data);
        } catch (error) {
          console.error(`[INCREMENTAL] Failed to fetch ${dataType} for ${address}:`, error.message);
          results.set(address, []);
        }
      }
      
      // Small delay between batches
      if (i + batchSize < addressGroups.incremental.length) {
        await this.delay(100);
      }
    }
    
    // Process full fetches
    for (let i = 0; i < addressGroups.full.length; i += batchSize) {
      const batch = addressGroups.full.slice(i, i + batchSize);
      
      for (const address of batch) {
        try {
          const data = await this.fetchTransfersFull(address, options);
          results.set(address, data);
        } catch (error) {
          console.error(`[INCREMENTAL] Failed to fetch ${dataType} for ${address}:`, error.message);
          results.set(address, []);
        }
      }
      
      // Longer delay for full fetches (more API intensive)
      if (i + batchSize < addressGroups.full.length) {
        await this.delay(500);
      }
    }
    
    console.log(`[INCREMENTAL] Batch fetch complete: ${results.size} addresses processed`);
    
    return results;
  }
  
  groupAddressesByCheckpoint(addresses, dataType) {
    const groups = {
      incremental: [],
      full: []
    };
    
    for (const address of addresses) {
      const checkpoint = this.cache.getCheckpoint(dataType, address);
      
      if (checkpoint.lastBlock > 0 && 
          Date.now() - checkpoint.updatedAt < 86400000) { // Less than 24 hours old
        groups.incremental.push(address);
      } else {
        groups.full.push(address);
      }
    }
    
    return groups;
  }
  
  async fetchNewTransfersSince(address, checkpoint) {
    try {
      // Build incremental query parameters
      const params = {
        address: address,
        row: 100,
        page: 0,
        // Include safety margin - re-fetch last few blocks to ensure no gaps
        after_block: Math.max(0, checkpoint.lastBlock - this.config.safetyBlocks)
      };
      
      const response = await this.client.request('/api/v2/scan/transfers', params);
      const allTransfers = response.data?.transfers || [];
      
      // Filter out transfers we already have (based on block number and hash)
      const newTransfers = allTransfers.filter(transfer => {
        if (transfer.block_num <= checkpoint.lastBlock - this.config.safetyBlocks) {
          return false; // Definitely already have this
        }
        
        if (transfer.block_num > checkpoint.lastBlock) {
          return true; // Definitely new
        }
        
        // In safety margin - check hash to avoid duplicates
        const transferHash = this.hashTransfer(transfer);
        return transferHash !== checkpoint.lastHash;
      });
      
      console.log(`[INCREMENTAL] API returned ${allTransfers.length} transfers, ${newTransfers.length} are new`);
      
      // Calculate data savings
      const savedTransfers = allTransfers.length - newTransfers.length;
      if (savedTransfers > 0) {
        this.stats.dataSavedMB += (savedTransfers * 0.5) / 1024; // Rough estimate: 0.5KB per transfer
        this.stats.apiCallsSaved += Math.floor(savedTransfers / 100); // Rough estimate of saved API calls
      }
      
      return newTransfers;
      
    } catch (error) {
      console.error(`[INCREMENTAL] Failed to fetch new transfers:`, error.message);
      
      // Fallback to full fetch on error
      console.log('[INCREMENTAL] Falling back to full fetch due to error');
      return await this.fetchTransfersFull(address);
    }
  }
  
  async fetchTransfersFull(address, options = {}) {
    console.log(`[INCREMENTAL] Performing full transfer fetch for ${address.slice(0, 8)}...`);
    
    this.stats.fullFetches++;
    
    // Use existing client method
    const transfers = await this.client.getAccountTransfers(address, options.limit || 200);
    
    // Cache the result
    const cacheKey = `transfers:${address}`;
    await this.cache.setWithClassification(cacheKey, transfers);
    
    console.log(`[INCREMENTAL] Full fetch complete: ${transfers.length} transfers`);
    
    return transfers;
  }
  
  async fetchBalanceHistoryFull(address, options = {}) {
    // This would integrate with a balance history API endpoint
    // For now, return empty array as placeholder
    console.log(`[INCREMENTAL] Full balance history fetch not implemented yet for ${address.slice(0, 8)}`);
    return [];
  }
  
  async fetchRecentBalanceChanges(address, checkpoint) {
    // This would check recent blocks for balance changes
    // For now, return empty array as placeholder
    console.log(`[INCREMENTAL] Recent balance change check not implemented yet for ${address.slice(0, 8)}`);
    return [];
  }
  
  mergeTransfers(cachedTransfers, newTransfers) {
    // Combine and deduplicate transfers
    const transferMap = new Map();
    
    // Add cached transfers
    for (const transfer of cachedTransfers) {
      const key = `${transfer.hash || transfer.extrinsic_hash}_${transfer.block_num}`;
      transferMap.set(key, transfer);
    }
    
    // Add new transfers (will overwrite duplicates)
    for (const transfer of newTransfers) {
      const key = `${transfer.hash || transfer.extrinsic_hash}_${transfer.block_num}`;
      transferMap.set(key, transfer);
    }
    
    // Convert back to array and sort by block number (descending)
    const merged = Array.from(transferMap.values())
      .sort((a, b) => (b.block_num || 0) - (a.block_num || 0));
    
    return merged;
  }
  
  mergeBalanceHistory(cachedHistory, recentChanges) {
    // Similar to transfers but for balance history
    const historyMap = new Map();
    
    for (const entry of cachedHistory) {
      const key = `${entry.block_num}_${entry.timestamp}`;
      historyMap.set(key, entry);
    }
    
    for (const entry of recentChanges) {
      const key = `${entry.block_num}_${entry.timestamp}`;
      historyMap.set(key, entry);
    }
    
    return Array.from(historyMap.values())
      .sort((a, b) => (b.block_num || 0) - (a.block_num || 0));
  }
  
  shouldDoFullRefresh(checkpoint, options = {}) {
    // Force full refresh if requested
    if (options.forceRefresh) {
      return true;
    }
    
    // No checkpoint means first fetch
    if (!checkpoint.lastBlock) {
      return true;
    }
    
    // Check if checkpoint is too old
    const checkpointAge = Date.now() - checkpoint.updatedAt;
    if (checkpointAge > 7 * 24 * 60 * 60 * 1000) { // 7 days
      console.log('[INCREMENTAL] Checkpoint too old, doing full refresh');
      return true;
    }
    
    // Check if gap is too large
    const currentBlock = this.cache.estimateCurrentBlock();
    const blockGap = currentBlock - checkpoint.lastBlock;
    if (blockGap > this.config.maxIncrementalGap) {
      console.log(`[INCREMENTAL] Block gap too large (${blockGap}), doing full refresh`);
      return true;
    }
    
    return false;
  }
  
  hashTransfer(transfer) {
    // Create a simple hash of transfer for deduplication
    const key = `${transfer.hash || transfer.extrinsic_hash}_${transfer.block_num}_${transfer.from}_${transfer.to}_${transfer.amount}`;
    return key;
  }
  
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get performance statistics
   */
  getStats() {
    const incrementalRatio = this.stats.totalFetches > 0 ? 
      (this.stats.incrementalFetches / this.stats.totalFetches * 100).toFixed(1) : '0';
    
    return {
      fetches: {
        total: this.stats.totalFetches,
        incremental: this.stats.incrementalFetches,
        full: this.stats.fullFetches,
        incrementalRatio: incrementalRatio + '%'
      },
      
      savings: {
        dataSavedMB: this.stats.dataSavedMB.toFixed(2),
        apiCallsSaved: this.stats.apiCallsSaved,
        averageIncrementalSize: Math.round(this.stats.averageIncrementalSize)
      },
      
      cache: this.cache.getMetrics()
    };
  }
  
  /**
   * Clear all caches and reset checkpoints
   */
  async clear() {
    await this.cache.clear();
    this.stats = {
      totalFetches: 0,
      incrementalFetches: 0,
      fullFetches: 0,
      dataSavedMB: 0,
      apiCallsSaved: 0,
      averageIncrementalSize: 0
    };
    
    console.log('[INCREMENTAL] All caches and statistics cleared');
  }
  
  /**
   * Optimize cache - clean up old data and compress
   */
  async optimize() {
    console.log('[INCREMENTAL] Starting cache optimization...');
    
    await this.cache.cleanupL4IfNeeded();
    await this.cache.saveL4Index();
    await this.cache.saveCheckpoints();
    
    const stats = this.getStats();
    console.log('[INCREMENTAL] Cache optimization complete', {
      totalSizeMB: stats.cache.l4.sizeMB,
      compressionSavings: stats.cache.l4.compressionSavingsMB + 'MB',
      deduplicationSavings: stats.cache.l4.deduplicationSavingsMB + 'MB'
    });
  }
}