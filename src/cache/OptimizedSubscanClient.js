import { IncrementalFetcher } from './IncrementalFetcher.js';

/**
 * OptimizedSubscanClient - Wrapper around SubscanClient with intelligent caching
 * Dramatically reduces API calls and data transfer through incremental fetching
 */
export class OptimizedSubscanClient {
  constructor(subscanClient, config = {}) {
    this.client = subscanClient;
    this.config = {
      enableIncremental: config.enableIncremental !== false, // Default true
      enableSmartBatching: config.enableSmartBatching !== false, // Default true
      batchSize: config.batchSize || 20,
      maxConcurrent: config.maxConcurrent || 5,
      ...config
    };
    
    // Initialize incremental fetcher
    this.incrementalFetcher = new IncrementalFetcher(subscanClient, config);
    
    // Track usage patterns for optimization
    this.usageStats = {
      totalRequests: 0,
      incrementalRequests: 0,
      batchRequests: 0,
      cacheHits: 0,
      dataSavedMB: 0,
      avgResponseTime: 0
    };
    
    console.log('[OPTIMIZED-CLIENT] OptimizedSubscanClient initialized', {
      incremental: this.config.enableIncremental,
      smartBatching: this.config.enableSmartBatching,
      batchSize: this.config.batchSize
    });
  }
  
  /**
   * Get top accounts with intelligent caching
   */
  async getTopAccounts(limit = 1000, options = {}) {
    const startTime = Date.now();
    this.usageStats.totalRequests++;
    
    // Check if we have recent cached data
    const cacheKey = `top_accounts:${limit}`;
    const cached = await this.incrementalFetcher.cache.get(cacheKey);
    
    if (cached && !options.forceRefresh) {
      // Check if cache is still fresh (top accounts don't change frequently)
      const cacheAge = Date.now() - (cached.fetchedAt || 0);
      if (cacheAge < 3600000) { // 1 hour
        console.log('[OPTIMIZED-CLIENT] Using cached top accounts');
        this.usageStats.cacheHits++;
        return cached.accounts;
      }
    }
    
    console.log(`[OPTIMIZED-CLIENT] Fetching fresh top ${limit} accounts`);
    
    // Fetch fresh data
    const accounts = await this.client.getAllTopAccounts(limit);
    
    // Cache with timestamp
    await this.incrementalFetcher.cache.setWithClassification(cacheKey, {
      accounts,
      fetchedAt: Date.now(),
      count: accounts.length
    });
    
    const responseTime = Date.now() - startTime;
    this.updateAvgResponseTime(responseTime);
    
    console.log(`[OPTIMIZED-CLIENT] Fetched ${accounts.length} top accounts in ${responseTime}ms`);
    
    return accounts;
  }
  
  /**
   * Get account transfers with incremental fetching
   */
  async getAccountTransfers(address, options = {}) {
    const startTime = Date.now();
    this.usageStats.totalRequests++;
    
    if (this.config.enableIncremental && !options.disableIncremental) {
      this.usageStats.incrementalRequests++;
      
      const transfers = await this.incrementalFetcher.fetchTransfersIncremental(address, options);
      
      const responseTime = Date.now() - startTime;
      this.updateAvgResponseTime(responseTime);
      
      return transfers;
    } else {
      // Fall back to regular client
      const transfers = await this.client.getAccountTransfers(address, options.limit || 100);
      
      const responseTime = Date.now() - startTime;
      this.updateAvgResponseTime(responseTime);
      
      return transfers;
    }
  }
  
  /**
   * Batch get transfers for multiple addresses with smart optimization
   */
  async batchGetAccountTransfers(addresses, options = {}) {
    const startTime = Date.now();
    this.usageStats.totalRequests++;
    this.usageStats.batchRequests++;
    
    console.log(`[OPTIMIZED-CLIENT] Batch fetching transfers for ${addresses.length} addresses`);
    
    if (this.config.enableSmartBatching && this.config.enableIncremental) {
      // Use incremental fetcher for intelligent batching
      const results = await this.incrementalFetcher.batchFetchIncremental(
        addresses, 
        'transfers', 
        options
      );
      
      const responseTime = Date.now() - startTime;
      this.updateAvgResponseTime(responseTime);
      
      console.log(`[OPTIMIZED-CLIENT] Batch fetch complete in ${responseTime}ms`);
      
      return results;
    } else {
      // Simple sequential fetching
      const results = new Map();
      
      for (const address of addresses) {
        try {
          const transfers = await this.getAccountTransfers(address, options);
          results.set(address, transfers);
        } catch (error) {
          console.error(`[OPTIMIZED-CLIENT] Failed to fetch transfers for ${address}:`, error.message);
          results.set(address, []);
        }
      }
      
      const responseTime = Date.now() - startTime;
      this.updateAvgResponseTime(responseTime);
      
      return results;
    }
  }
  
  /**
   * Get account balance with smart caching
   */
  async getAccountBalance(address, options = {}) {
    const cacheKey = `balance:${address}`;
    
    // Balance changes frequently, so use shorter cache TTL
    const cached = await this.incrementalFetcher.cache.get(cacheKey);
    if (cached && !options.forceRefresh) {
      const cacheAge = Date.now() - (cached.fetchedAt || 0);
      if (cacheAge < 300000) { // 5 minutes
        this.usageStats.cacheHits++;
        return cached.balance;
      }
    }
    
    // This would call a balance API endpoint
    // For now, return a placeholder
    const balance = {
      address,
      free: '1000000000000', // Placeholder
      reserved: '0',
      total: '1000000000000',
      fetchedAt: Date.now()
    };
    
    await this.incrementalFetcher.cache.setWithClassification(cacheKey, balance);
    
    return balance;
  }
  
  /**
   * Get account identity with extended caching
   */
  async getAccountIdentity(address, options = {}) {
    const cacheKey = `identity:${address}`;
    
    // Identity changes infrequently, so use longer cache TTL
    const cached = await this.incrementalFetcher.cache.get(cacheKey);
    if (cached && !options.forceRefresh) {
      const cacheAge = Date.now() - (cached.fetchedAt || 0);
      if (cacheAge < 86400000) { // 24 hours
        this.usageStats.cacheHits++;
        return cached.identity;
      }
    }
    
    // This would call an identity API endpoint
    // For now, return a placeholder
    const identity = {
      address,
      display: `Account-${address.slice(0, 8)}`,
      legal: null,
      web: null,
      verified: Math.random() > 0.7,
      fetchedAt: Date.now()
    };
    
    await this.incrementalFetcher.cache.setWithClassification(cacheKey, identity);
    
    return identity;
  }
  
  /**
   * Batch get account data (transfers + balance + identity) with optimization
   */
  async batchGetAccountData(addresses, options = {}) {
    console.log(`[OPTIMIZED-CLIENT] Batch fetching complete account data for ${addresses.length} addresses`);
    
    const results = new Map();
    const batchSize = this.config.batchSize;
    
    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      
      console.log(`[OPTIMIZED-CLIENT] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(addresses.length/batchSize)}`);
      
      // Fetch all data types concurrently for this batch
      const batchPromises = batch.map(async (address) => {
        try {
          const [transfers, balance, identity] = await Promise.all([
            this.getAccountTransfers(address, options),
            this.getAccountBalance(address, options),
            this.getAccountIdentity(address, options)
          ]);
          
          return {
            address,
            transfers,
            balance,
            identity,
            fetchedAt: Date.now()
          };
        } catch (error) {
          console.error(`[OPTIMIZED-CLIENT] Failed to fetch data for ${address}:`, error.message);
          return {
            address,
            transfers: [],
            balance: null,
            identity: null,
            error: error.message
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Add to results
      for (const result of batchResults) {
        results.set(result.address, result);
      }
      
      // Small delay between batches to be nice to the API
      if (i + batchSize < addresses.length) {
        await this.delay(200);
      }
    }
    
    console.log(`[OPTIMIZED-CLIENT] Batch account data fetch complete: ${results.size} addresses`);
    
    return results;
  }
  
  /**
   * Preload data for known whale addresses
   */
  async preloadWhaleData(whaleAddresses) {
    console.log(`[OPTIMIZED-CLIENT] Preloading data for ${whaleAddresses.length} whale addresses`);
    
    // Use incremental fetching to efficiently preload
    await this.incrementalFetcher.batchFetchIncremental(whaleAddresses, 'transfers', {
      limit: 50 // Smaller limit for preloading
    });
    
    console.log('[OPTIMIZED-CLIENT] Whale data preloading complete');
  }
  
  /**
   * Optimize caches and clean up old data
   */
  async optimize() {
    console.log('[OPTIMIZED-CLIENT] Starting optimization...');
    
    await this.incrementalFetcher.optimize();
    
    const stats = this.getStats();
    console.log('[OPTIMIZED-CLIENT] Optimization complete', {
      cacheHitRate: ((stats.usage.cacheHits / stats.usage.totalRequests) * 100).toFixed(1) + '%',
      dataSaved: stats.savings.dataSavedMB + 'MB',
      avgResponseTime: stats.performance.avgResponseTime + 'ms'
    });
  }
  
  /**
   * Get comprehensive performance statistics
   */
  getStats() {
    const incrementalRatio = this.usageStats.totalRequests > 0 ? 
      (this.usageStats.incrementalRequests / this.usageStats.totalRequests * 100).toFixed(1) : '0';
    
    const cacheHitRate = this.usageStats.totalRequests > 0 ?
      (this.usageStats.cacheHits / this.usageStats.totalRequests * 100).toFixed(1) : '0';
    
    const incrementalStats = this.incrementalFetcher.getStats();
    
    return {
      usage: {
        totalRequests: this.usageStats.totalRequests,
        incrementalRequests: this.usageStats.incrementalRequests,
        batchRequests: this.usageStats.batchRequests,
        cacheHits: this.usageStats.cacheHits,
        incrementalRatio: incrementalRatio + '%',
        cacheHitRate: cacheHitRate + '%'
      },
      
      performance: {
        avgResponseTime: Math.round(this.usageStats.avgResponseTime),
        dataSavedMB: (this.usageStats.dataSavedMB + parseFloat(incrementalStats.savings.dataSavedMB)).toFixed(2),
        apiCallsSaved: incrementalStats.savings.apiCallsSaved
      },
      
      incremental: incrementalStats,
      
      efficiency: {
        overallDataSavings: this.calculateOverallSavings(),
        recommendedOptimizations: this.getOptimizationRecommendations()
      }
    };
  }
  
  calculateOverallSavings() {
    const incrementalStats = this.incrementalFetcher.getStats();
    const totalDataSaved = this.usageStats.dataSavedMB + parseFloat(incrementalStats.savings.dataSavedMB);
    const totalApiCallsSaved = incrementalStats.savings.apiCallsSaved;
    
    // Estimate cost savings (rough calculation)
    const estimatedCostSavings = totalApiCallsSaved * 0.001; // $0.001 per API call estimate
    
    return {
      dataSavedMB: totalDataSaved.toFixed(2),
      apiCallsSaved: totalApiCallsSaved,
      estimatedCostSavings: '$' + estimatedCostSavings.toFixed(2),
      efficiency: ((this.usageStats.incrementalRequests / Math.max(1, this.usageStats.totalRequests)) * 100).toFixed(1) + '%'
    };
  }
  
  getOptimizationRecommendations() {
    const recommendations = [];
    
    const cacheHitRate = this.usageStats.totalRequests > 0 ?
      (this.usageStats.cacheHits / this.usageStats.totalRequests) : 0;
    
    if (cacheHitRate < 0.3) {
      recommendations.push('Consider increasing cache TTL for frequently accessed data');
    }
    
    if (this.usageStats.batchRequests / Math.max(1, this.usageStats.totalRequests) < 0.5) {
      recommendations.push('Use batch operations more frequently for better efficiency');
    }
    
    const incrementalRatio = this.usageStats.incrementalRequests / Math.max(1, this.usageStats.totalRequests);
    if (incrementalRatio < 0.7) {
      recommendations.push('Enable incremental fetching for more endpoints');
    }
    
    if (this.usageStats.avgResponseTime > 5000) {
      recommendations.push('Consider reducing batch sizes or increasing concurrency limits');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('System is well optimized!');
    }
    
    return recommendations;
  }
  
  updateAvgResponseTime(responseTime) {
    if (this.usageStats.avgResponseTime === 0) {
      this.usageStats.avgResponseTime = responseTime;
    } else {
      this.usageStats.avgResponseTime = (this.usageStats.avgResponseTime + responseTime) / 2;
    }
  }
  
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Clear all caches and reset statistics
   */
  async clear() {
    await this.incrementalFetcher.clear();
    
    this.usageStats = {
      totalRequests: 0,
      incrementalRequests: 0,
      batchRequests: 0,
      cacheHits: 0,
      dataSavedMB: 0,
      avgResponseTime: 0
    };
    
    console.log('[OPTIMIZED-CLIENT] All caches and statistics cleared');
  }
  
  // Proxy methods to maintain compatibility with original SubscanClient
  async request(endpoint, data, options) {
    return this.client.request(endpoint, data, options);
  }
  
  clearCache() {
    return this.client.clearCache();
  }
  
  getClientStats() {
    return this.client.getStats();
  }
}