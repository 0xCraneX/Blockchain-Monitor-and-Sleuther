// Try to load real modules, fall back to mocks if not available
let axios, RateLimiter, pRetry, LRU;

try {
  axios = require('axios');
  RateLimiter = require('limiter').RateLimiter;
  pRetry = require('p-retry');
  const { LRUCache } = require('lru-cache');
  LRU = LRUCache;
} catch (error) {
  console.log('⚠️  Some modules not found, using mocks for testing');
  const mocks = require('../utils/mock-modules');
  axios = mocks.axios;
  RateLimiter = mocks.RateLimiter;
  pRetry = mocks.pRetry;
  LRU = mocks.LRU;
}

const { apiLogger } = require('../utils/simple-logger');

class SubscanClient {
  constructor(apiKey = '') {
    this.apiKey = apiKey;
    this.baseURL = 'https://polkadot.api.subscan.io';
    
    // Rate limiter: 5 requests per second (free tier)
    this.limiter = new RateLimiter({ 
      tokensPerInterval: 5, 
      interval: 'second',
      fireImmediately: true 
    });
    
    // LRU cache: 5 minute TTL, max 500 items
    this.cache = new LRU({ 
      max: 500, 
      ttl: 1000 * 60 * 5 // 5 minutes
    });
    
    // Request statistics
    this.stats = {
      requests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      totalResponseTime: 0
    };
    
    // Axios instance with defaults
    this.axios = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // 30 second timeout
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      }
    });
    
    apiLogger.info('SubscanClient initialized', {
      baseURL: this.baseURL,
      hasApiKey: !!this.apiKey,
      rateLimit: '5 req/s',
      cacheSize: 500,
      cacheTTL: '5 min'
    });
  }

  async _makeRequest(endpoint, data = {}, options = {}) {
    const startTime = Date.now();
    const cacheKey = `${endpoint}:${JSON.stringify(data)}`;
    
    apiLogger.debug(`Preparing request to ${endpoint}`, { data, cacheKey });
    
    // Check cache first
    if (!options.skipCache && this.cache.has(cacheKey)) {
      this.stats.cacheHits++;
      apiLogger.debug(`Cache HIT for ${endpoint}`, { cacheKey });
      return this.cache.get(cacheKey);
    }
    
    this.stats.cacheMisses++;
    apiLogger.debug(`Cache MISS for ${endpoint}`, { cacheKey });
    
    // Wait for rate limiter
    apiLogger.debug('Waiting for rate limiter...');
    await this.limiter.removeTokens(1);
    apiLogger.debug('Rate limiter token acquired');
    
    try {
      this.stats.requests++;
      
      apiLogger.info(`Making API request to ${endpoint}`, {
        method: 'POST',
        dataSize: JSON.stringify(data).length,
        requestNumber: this.stats.requests
      });
      
      const response = await this.axios.post(endpoint, data);
      
      const responseTime = Date.now() - startTime;
      this.stats.totalResponseTime += responseTime;
      
      apiLogger.success(`API request successful`, {
        endpoint,
        responseTime: `${responseTime}ms`,
        status: response.status,
        dataCount: response.data?.data?.count || response.data?.data?.list?.length || 0
      });
      
      // Validate response
      if (!response.data || response.data.code !== 0) {
        throw new Error(`API error: ${response.data?.message || 'Unknown error'}`);
      }
      
      // Cache successful response
      if (!options.skipCache) {
        this.cache.set(cacheKey, response.data);
        apiLogger.debug(`Response cached`, { cacheKey, ttl: '5 min' });
      }
      
      return response.data;
      
    } catch (error) {
      this.stats.errors++;
      
      apiLogger.error(`API request failed`, {
        endpoint,
        error: error.message,
        responseTime: `${Date.now() - startTime}ms`,
        errorCount: this.stats.errors
      });
      
      throw error;
    }
  }

  async request(endpoint, data = {}, options = {}) {
    // Retry logic with exponential backoff
    return pRetry(
      () => this._makeRequest(endpoint, data, options),
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 10000,
        onFailedAttempt: error => {
          apiLogger.warn(`Request retry attempt ${error.attemptNumber}/${error.retriesLeft + error.attemptNumber}`, {
            endpoint,
            error: error.message
          });
        }
      }
    );
  }

  async getTopAccounts(limit = 1000, page = 0) {
    apiLogger.section('Fetching Top Accounts');
    apiLogger.info(`Requesting top ${limit} accounts, page ${page}`);
    
    const response = await this.request('/api/v2/scan/accounts', {
      row: Math.min(limit, 100), // API max is 100 per page
      page: page,
      order: 'desc',
      order_field: 'balance'
    });
    
    const accounts = response.data?.list || [];
    
    apiLogger.success(`Fetched ${accounts.length} accounts`, {
      totalCount: response.data?.count,
      page: page,
      hasMore: accounts.length === limit
    });
    
    // Transform account data
    const transformed = accounts.map(account => ({
      address: account.address,
      balance: account.balance,
      balanceFloat: parseFloat(account.balance), // Already in DOT units from API
      nonce: account.count_extrinsic || 0,
      accountDisplay: account.account_display,
      identity: account.account_display?.merkle?.tag_name || null,
      lastActive: new Date().toISOString(), // We'll update this later
      locked: account.lock || "0",
      reserved: account.balance_lock || "0",
      accountType: this._determineAccountType(account)
    }));
    
    apiLogger.table(
      transformed.slice(0, 5).map(a => ({
        address: a.address.slice(0, 8) + '...' + a.address.slice(-6),
        balance: `${a.balanceFloat.toFixed(2)} DOT`,
        identity: a.identity || 'Unknown'
      })),
      'Sample Accounts'
    );
    
    return transformed;
  }

  async getAllTopAccounts(limit = 1000) {
    apiLogger.section(`Fetching All Top ${limit} Accounts`);
    
    const allAccounts = [];
    const pageSize = 100; // API limit
    const totalPages = Math.ceil(limit / pageSize);
    
    for (let page = 0; page < totalPages; page++) {
      apiLogger.progress(page + 1, totalPages, `Fetching page ${page + 1}/${totalPages}`);
      
      const accounts = await this.getTopAccounts(pageSize, page);
      allAccounts.push(...accounts);
      
      if (accounts.length < pageSize) {
        apiLogger.warn('Received fewer accounts than requested, stopping pagination');
        break;
      }
      
      // Small delay between pages to be nice to the API
      if (page < totalPages - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    apiLogger.success(`Fetched total of ${allAccounts.length} accounts`);
    
    // Sort by balance and limit to requested amount
    return allAccounts
      .sort((a, b) => b.balanceFloat - a.balanceFloat)
      .slice(0, limit);
  }

  async getAccountTransfers(address, limit = 100) {
    apiLogger.info(`Fetching transfers for ${address.slice(0, 8)}...${address.slice(-6)}`);
    
    const response = await this.request('/api/v2/scan/transfers', {
      address: address,
      row: limit,
      page: 0
    });
    
    const transfers = response.data?.transfers || [];
    
    apiLogger.debug(`Found ${transfers.length} transfers for address`, {
      address: address.slice(0, 16) + '...',
      oldestBlock: transfers[transfers.length - 1]?.block_num,
      newestBlock: transfers[0]?.block_num
    });
    
    return transfers;
  }

  getStats() {
    const avgResponseTime = this.stats.requests > 0 
      ? Math.round(this.stats.totalResponseTime / this.stats.requests)
      : 0;
    
    const cacheHitRate = this.stats.cacheHits + this.stats.cacheMisses > 0
      ? Math.round((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100)
      : 0;
    
    return {
      ...this.stats,
      avgResponseTime,
      cacheHitRate,
      cacheSize: this.cache.size
    };
  }

  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    apiLogger.info(`Cache cleared, removed ${size} items`);
  }

  _determineAccountType(account) {
    // Check if it's an exchange based on tags
    if (account.account_display?.merkle?.tag_type === 'Exchange') {
      return 'exchange';
    }
    
    // Check if it's a validator (has high locked balance)
    const locked = parseFloat(account.lock || 0);
    const balance = parseFloat(account.balance || 0);
    if (locked > 0 && locked / balance > 0.8) {
      return 'validator';
    }
    
    // Default to whale
    return 'whale';
  }
}

module.exports = SubscanClient;
