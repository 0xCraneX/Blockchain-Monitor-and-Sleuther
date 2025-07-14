import fetch from 'node-fetch';
import { createLogger } from '../utils/logger.js';
import { TokenBucket } from '../utils/TokenBucket.js';

const logger = createLogger('SubscanService');

/**
 * Custom error class for Subscan API errors
 */
class SubscanError extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'SubscanError';
    this.code = code;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }

  toUserMessage() {
    const messages = {
      'RATE_LIMITED': 'API rate limit reached. Please wait before making more requests.',
      'API_UNAVAILABLE': 'Subscan API is temporarily unavailable. Please try again later.',
      'INVALID_ADDRESS': 'The provided address is not valid for the Polkadot network.',
      'NO_DATA': 'No transaction data found for this address.',
      'NETWORK_ERROR': 'Network connection error. Please check your internet connection.',
      'API_KEY_INVALID': 'API authentication failed. Please check your configuration.',
      'CIRCUIT_BREAKER_OPEN': 'API temporarily unavailable due to repeated failures. Retrying automatically.'
    };

    return messages[this.code] || 'An unexpected error occurred while fetching blockchain data.';
  }
}

/**
 * Priority queue for request management
 */
class PriorityQueue {
  constructor() {
    this.queues = new Map();
    this.processing = false;
  }

  add(request, priority) {
    if (!this.queues.has(priority)) {
      this.queues.set(priority, []);
    }
    this.queues.get(priority).push(request);
    this.process();
  }

  async process() {
    if (this.processing) {
      return;
    }
    this.processing = true;

    while (this.hasRequests()) {
      const request = this.getNextRequest();
      if (request) {
        await this.executeRequest(request);
      }
    }

    this.processing = false;
  }

  hasRequests() {
    for (const queue of this.queues.values()) {
      if (queue.length > 0) {
        return true;
      }
    }
    return false;
  }

  getNextRequest() {
    // Process requests in priority order (1 = highest priority)
    const priorities = Array.from(this.queues.keys()).sort((a, b) => a - b);

    for (const priority of priorities) {
      const queue = this.queues.get(priority);
      if (queue.length > 0) {
        return queue.shift();
      }
    }

    return null;
  }

  async executeRequest(request) {
    try {
      const result = await request.execute();
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    }
  }
}

/**
 * Circuit breaker for API resilience
 */
class CircuitBreaker {
  constructor(requestFunction, options = {}) {
    this.request = requestFunction;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 30000;
    this.monitoringPeriod = options.monitoringPeriod || 60000;
  }

  async execute(requestData) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
        logger.info('Circuit breaker transitioning to HALF_OPEN');
      } else {
        throw new SubscanError('Circuit breaker is OPEN - API temporarily unavailable', 'CIRCUIT_BREAKER_OPEN');
      }
    }

    try {
      const result = await this.request(requestData);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      logger.info('Circuit breaker returned to CLOSED state');
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn(`Circuit breaker opened after ${this.failureCount} failures`);
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

export class SubscanService {
  // Priority levels for request queuing
  static PRIORITY = {
    CRITICAL: 1,    // Core account data needed for basic functionality
    HIGH: 2,        // Transaction data for current view
    MEDIUM: 3,      // Related account enrichment
    LOW: 4          // Background data, analytics
  };

  constructor() {
    this.apiKey = process.env.SUBSCAN_API_KEY || '';
    this.endpoint = process.env.SUBSCAN_API_ENDPOINT || 'https://polkadot.api.subscan.io';
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'polkadot-analysis-tool/1.0'
    };

    if (this.apiKey) {
      this.headers['X-API-Key'] = this.apiKey;
    }

    // Rate limiting: 5 req/sec = token bucket with 5 capacity, 5 refill rate
    this.rateLimiter = new TokenBucket(5, 5, 1000);
    this.requestQueue = new PriorityQueue();
    this.circuitBreaker = new CircuitBreaker(this.makeRequest.bind(this));

    // Configuration
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second base delay for exponential backoff
  }

  /**
   * Make a raw API request (used by circuit breaker)
   */
  async makeRequest({ path, data, retryCount = 0 }) {
    const url = `${this.endpoint}${path}`;

    logger.info('Subscan API request', {
      path,
      url,
      hasApiKey: !!this.apiKey,
      retryCount,
      headers: this.headers,
      data: data || {},
      fullUrl: url
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data || {}),
        timeout: 30000 // 30 second timeout
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after')) || 60;
        throw new SubscanError(
          `Rate limited by Subscan API. Retry after ${retryAfter}s`,
          'RATE_LIMITED'
        );
      }

      if (!response.ok) {
        // Classify different HTTP errors
        const errorCode = this.classifyHttpError(response.status);
        throw new SubscanError(
          `Subscan API error: ${response.status} ${response.statusText}`,
          errorCode
        );
      }

      const result = await response.json();

      if (result.code !== 0) {
        logger.error('Subscan API returned error', {
          path,
          code: result.code,
          message: result.message,
          data: result.data,
          fullResponse: result
        });
        const errorCode = this.classifySubscanError(result.code, result.message);
        throw new SubscanError(
          `Subscan API error: ${result.message || 'Unknown error'}`,
          errorCode
        );
      }

      logger.debug('Subscan API response', { path, hasData: !!result.data });
      return result.data;
    } catch (error) {
      // Add context to network errors
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new SubscanError(
          'Network connection failed',
          'NETWORK_ERROR',
          error
        );
      }

      if (error instanceof SubscanError) {
        throw error;
      }

      logger.error('Subscan API request failed', {
        path,
        error: error.message,
        errorType: error.constructor.name,
        errorCode: error.code,
        errorResponse: error.response,
        fullError: error
      });
      throw new SubscanError(
        `Request failed: ${error.message}`,
        'API_UNAVAILABLE',
        error
      );
    }
  }

  /**
   * Queue a request with rate limiting and circuit breaker
   */
  async queueRequest(requestData, priority = SubscanService.PRIORITY.MEDIUM) {
    return new Promise((resolve, reject) => {
      const request = {
        execute: async () => {
          // Wait for rate limiter token
          await this.rateLimiter.waitAndConsume(1);

          // Execute through circuit breaker with retry logic
          return this.executeWithRetry(requestData);
        },
        resolve,
        reject
      };

      this.requestQueue.add(request, priority);
    });
  }

  /**
   * Execute request with exponential backoff retry
   */
  async executeWithRetry(requestData, retryCount = 0) {
    try {
      return await this.circuitBreaker.execute({
        ...requestData,
        retryCount
      });
    } catch (error) {
      if (retryCount < this.maxRetries && this.shouldRetry(error)) {
        const delay = this.calculateBackoffDelay(retryCount);
        logger.info(`Retrying request after ${delay}ms`, {
          path: requestData.path,
          retryCount: retryCount + 1
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.executeWithRetry(requestData, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Determine if an error should trigger a retry
   */
  shouldRetry(error) {
    const retryableCodes = ['NETWORK_ERROR', 'API_UNAVAILABLE', 'RATE_LIMITED'];
    return error instanceof SubscanError && retryableCodes.includes(error.code);
  }

  /**
   * Calculate exponential backoff delay
   */
  calculateBackoffDelay(retryCount) {
    const jitter = Math.random() * 0.3; // Add 0-30% jitter
    return Math.floor(this.baseDelay * Math.pow(2, retryCount) * (1 + jitter));
  }

  /**
   * Classify HTTP errors into user-friendly categories
   */
  classifyHttpError(statusCode) {
    switch (statusCode) {
      case 401:
      case 403:
        return 'API_KEY_INVALID';
      case 404:
        return 'NO_DATA';
      case 429:
        return 'RATE_LIMITED';
      case 500:
      case 502:
      case 503:
      case 504:
        return 'API_UNAVAILABLE';
      default:
        return 'API_UNAVAILABLE';
    }
  }

  /**
   * Classify Subscan-specific error codes
   */
  classifySubscanError(code, message) {
    if (message && message.toLowerCase().includes('invalid address')) {
      return 'INVALID_ADDRESS';
    }
    if (message && message.toLowerCase().includes('not found')) {
      return 'NO_DATA';
    }
    return 'API_UNAVAILABLE';
  }

  /**
   * Legacy request method - now uses the new queue system
   */
  async request(path, data = {}, priority = SubscanService.PRIORITY.MEDIUM) {
    return this.queueRequest({ path, data }, priority);
  }

  /**
   * Get account information including identity
   */
  async getAccountInfo(address) {
    try {
      logger.debug('Getting account info from Subscan', { address });

      // Use v2 search endpoint - it requires 'key' instead of 'address'
      const data = await this.request('/api/v2/scan/search',
        { key: address },
        SubscanService.PRIORITY.CRITICAL
      );

      if (!data) {
        throw new SubscanError(
          `No account data found for address ${address}`,
          'NO_DATA'
        );
      }

      // For v2 search endpoint, account data is nested under 'account'
      const account = data.account || data;

      // Extract identity from the correct nested structure
      let identityDisplay = null;

      // Check for account.display first (direct display name)
      if (account.display && typeof account.display === 'string' && account.display.trim() !== '') {
        identityDisplay = account.display;
        logger.debug('Found identity in account.display', { address, display: identityDisplay });
      }
      // Check for nested account_display.display structure
      else if (account.account_display?.display && typeof account.account_display.display === 'string' && account.account_display.display.trim() !== '') {
        identityDisplay = account.account_display.display;
        logger.debug('Found identity in account.account_display.display', { address, display: identityDisplay });
      }
      // Check for account_display.people.display (some networks use this structure)
      else if (account.account_display?.people?.display && typeof account.account_display.people.display === 'string' && account.account_display.people.display.trim() !== '') {
        identityDisplay = account.account_display.people.display;
        logger.debug('Found identity in account.account_display.people.display', { address, display: identityDisplay });
      }
      // Check for parent account display if this is a sub-account
      else if (account.account_display?.parent?.display && typeof account.account_display.parent.display === 'string' && account.account_display.parent.display.trim() !== '') {
        const parentDisplay = account.account_display.parent.display;
        const subSymbol = account.account_display.parent.sub_symbol || '';
        identityDisplay = subSymbol ? `${parentDisplay}:${subSymbol}` : parentDisplay;
        logger.debug('Found identity in parent account', { address, display: identityDisplay });
      } else {
        logger.debug('No identity found for address', {
          address,
          accountStructure: {
            hasDisplay: !!account.display,
            hasAccountDisplay: !!account.account_display,
            hasAccountDisplayDisplay: !!account.account_display?.display,
            hasPeopleDisplay: !!account.account_display?.people?.display,
            hasParentDisplay: !!account.account_display?.parent?.display
          }
        });
      }

      return {
        address: account.address || address,
        identity: {
          display: identityDisplay,
          legal: account.account_display?.legal || null,
          web: account.account_display?.web || null,
          email: account.account_display?.email || null,
          twitter: account.account_display?.twitter || null,
          verified: account.account_display?.identity === true || false,
          parent: account.account_display?.parent ? {
            address: account.account_display.parent.address,
            display: account.account_display.parent.display,
            sub_symbol: account.account_display.parent.sub_symbol
          } : null
        },
        balance: {
          free: account.balance || '0',
          reserved: account.reserved || '0',
          locked: account.locked || '0'
        },
        nonce: account.nonce || 0,
        role: account.role || 'regular',
        registrar: account.registrar || null,
        merkle: account.account_display?.merkle ? {
          address_type: account.account_display.merkle.address_type,
          tag_type: account.account_display.merkle.tag_type,
          tag_subtype: account.account_display.merkle.tag_subtype,
          tag_name: account.account_display.merkle.tag_name
        } : null
      };
    } catch (error) {
      if (error instanceof SubscanError) {
        logger.warn('Subscan API error', {
          address,
          code: error.code,
          message: error.toUserMessage()
        });
        throw error;
      }

      logger.error('Failed to get account info from Subscan', {
        address,
        error: error.message
      });
      throw new SubscanError(
        'Failed to retrieve account information',
        'API_UNAVAILABLE',
        error
      );
    }
  }

  /**
   * Get transfers for an address
   */
  async getTransfers(address, options = {}) {
    const {
      row = 100,
      page = 0,
      from_block = null,
      to_block = null,
      direction = 'all' // 'all', 'sent', 'received'
    } = options;

    try {
      const params = {
        address,
        row,
        page
      };

      if (from_block) {
        params.from_block = from_block;
      }
      if (to_block) {
        params.to_block = to_block;
      }
      if (direction !== 'all') {
        params.direction = direction;
      }

      // First page gets HIGH priority, subsequent pages get MEDIUM priority
      const priority = page === 0 ? SubscanService.PRIORITY.HIGH : SubscanService.PRIORITY.MEDIUM;

      // Use v2 endpoint
      const data = await this.request('/api/v2/scan/transfers', params, priority);

      return {
        transfers: (data.transfers || []).map(t => ({
          hash: t.hash,
          block_num: t.block_num,
          block_timestamp: t.block_timestamp,
          from: t.from,
          to: t.to,
          amount: t.amount_v2 || t.amount || '0', // Use planck units (amount_v2) instead of formatted amount
          fee: t.fee,
          success: t.success,
          module: t.module,
          nonce: t.nonce,
          asset_type: t.asset_type || 'native'
        })),
        count: data.count || 0
      };
    } catch (error) {
      if (error instanceof SubscanError) {
        logger.warn('Subscan API error getting transfers', {
          address,
          page,
          code: error.code,
          message: error.toUserMessage()
        });
        throw error;
      }

      logger.error('Failed to get transfers from Subscan', {
        address,
        page,
        error: error.message
      });
      throw new SubscanError(
        'Failed to retrieve transfer data',
        'API_UNAVAILABLE',
        error
      );
    }
  }

  /**
   * Get account relationships based on transfers
   */
  async getAccountRelationships(address, options = {}) {
    // Limit to 30 relationships per address to avoid rate limiting
    const { limit = 30 } = options;

    try {
      logger.debug('Getting account relationships via Subscan API', {
        address,
        limit,
        endpoint: this.endpoint,
        hasApiKey: !!this.apiKey
      });

      // Get both sent and received transfers - limit to prevent rate limiting
      const transactionLimit = Math.min(limit * 2, 50); // Fetch 2x limit but max 50 to avoid overwhelming API

      // Make requests sequential to respect 5 req/s rate limit
      let sent = { transfers: [], count: 0 };
      let received = { transfers: [], count: 0 };

      try {
        sent = await this.getTransfers(address, { row: transactionLimit, direction: 'sent' });
      } catch (error) {
        logger.warn('Failed to get sent transfers, continuing with received', { address, error: error.message });
      }

      try {
        received = await this.getTransfers(address, { row: transactionLimit, direction: 'received' });
      } catch (error) {
        logger.warn('Failed to get received transfers, continuing with sent only', { address, error: error.message });
      }

      // If both requests failed, return empty array
      if (sent.transfers.length === 0 && received.transfers.length === 0) {
        logger.warn('No transfers found for address', { address });
        return [];
      }

      // Build relationship map
      const relationships = new Map();

      // Process sent transfers
      sent.transfers.forEach(transfer => {
        const key = transfer.to;
        if (!relationships.has(key)) {
          relationships.set(key, {
            address: key,
            sent_count: 0,
            sent_volume: BigInt(0),
            received_count: 0,
            received_volume: BigInt(0),
            first_interaction: transfer.block_timestamp,
            last_interaction: transfer.block_timestamp
          });
        }
        const rel = relationships.get(key);
        rel.sent_count++;
        rel.sent_volume += BigInt(transfer.amount || 0);
        rel.last_interaction = Math.max(rel.last_interaction, transfer.block_timestamp);
        rel.first_interaction = Math.min(rel.first_interaction, transfer.block_timestamp);
      });

      // Process received transfers
      received.transfers.forEach(transfer => {
        const key = transfer.from;
        if (!relationships.has(key)) {
          relationships.set(key, {
            address: key,
            sent_count: 0,
            sent_volume: BigInt(0),
            received_count: 0,
            received_volume: BigInt(0),
            first_interaction: transfer.block_timestamp,
            last_interaction: transfer.block_timestamp
          });
        }
        const rel = relationships.get(key);
        rel.received_count++;
        rel.received_volume += BigInt(transfer.amount || 0);
        rel.last_interaction = Math.max(rel.last_interaction, transfer.block_timestamp);
        rel.first_interaction = Math.min(rel.first_interaction, transfer.block_timestamp);
      });

      // Convert to array and calculate totals
      const relationshipArray = Array.from(relationships.values()).map(rel => ({
        connected_address: rel.address,
        total_transactions: rel.sent_count + rel.received_count,
        sent_count: rel.sent_count,
        sent_volume: rel.sent_volume.toString(),
        received_count: rel.received_count,
        received_volume: rel.received_volume.toString(),
        total_volume: (rel.sent_volume + rel.received_volume).toString(),
        first_interaction: rel.first_interaction,
        last_interaction: rel.last_interaction,
        relationship_type: rel.sent_count > 0 && rel.received_count > 0 ? 'bidirectional' :
          rel.sent_count > 0 ? 'outgoing' : 'incoming'
      }));

      // Sort by total volume descending
      relationshipArray.sort((a, b) => {
        const volA = BigInt(a.total_volume);
        const volB = BigInt(b.total_volume);
        return volB > volA ? 1 : volB < volA ? -1 : 0;
      });

      return relationshipArray.slice(0, limit);
    } catch (error) {
      logger.error('Failed to get account relationships', {
        address,
        error: error.message,
        errorStack: error.stack,
        errorCode: error.code,
        isSubscanError: error instanceof SubscanError
      });
      return [];
    }
  }

  /**
   * Search for accounts by address or identity
   */
  async searchAccounts(query, _limit = 10) {
    try {
      logger.debug('Searching accounts with query', { query });

      // Try direct address lookup using the search endpoint
      try {
        const accountInfo = await this.getAccountInfo(query);
        if (accountInfo) {
          logger.debug('Found account via direct lookup', { query, hasIdentity: !!accountInfo.identity.display });
          return [accountInfo];
        }
      } catch (error) {
        // If direct lookup fails, log but continue
        logger.debug('Direct lookup failed, this is expected for partial queries', { query, error: error.message });
      }

      // For identity search, we need to use a different approach
      // Subscan doesn't have a direct identity search endpoint in free tier
      // Would need to implement local caching or use paid features

      logger.info('Identity search requires Subscan paid tier or local indexing', { query });
      return [];
    } catch (error) {
      logger.error('Failed to search accounts', { query, error: error.message });
      return [];
    }
  }

  /**
   * Get price info (if available)
   */
  async getPriceInfo() {
    try {
      const data = await this.request('/api/open/price', {}, SubscanService.PRIORITY.LOW);
      return {
        price: parseFloat(data.price || 0),
        price_change: parseFloat(data.price_change || 0),
        market_cap: data.market_cap || '0',
        volume_24h: data.volume_24h || '0'
      };
    } catch (error) {
      if (error instanceof SubscanError) {
        logger.warn('Subscan API error getting price info', {
          code: error.code,
          message: error.toUserMessage()
        });
        throw error;
      }

      logger.error('Failed to get price info', { error: error.message });
      throw new SubscanError(
        'Failed to retrieve price information',
        'API_UNAVAILABLE',
        error
      );
    }
  }

  /**
   * Health check for the Subscan service
   */
  async healthCheck() {
    const start = Date.now();

    try {
      // Simple API test with minimal data
      await this.rateLimiter.waitAndConsume(1);
      const response = await fetch(`${this.endpoint}/api/scan/metadata`);

      return {
        status: 'healthy',
        latency: Date.now() - start,
        rateLimit: this.rateLimiter.getStatus(),
        circuitBreaker: this.circuitBreaker.getState(),
        endpoint: this.endpoint,
        hasApiKey: !!this.apiKey
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        latency: Date.now() - start,
        rateLimit: this.rateLimiter.getStatus(),
        circuitBreaker: this.circuitBreaker.getState(),
        endpoint: this.endpoint,
        hasApiKey: !!this.apiKey
      };
    }
  }

  /**
   * Get current service status
   */
  getStatus() {
    return {
      rateLimiter: this.rateLimiter.getStatus(),
      circuitBreaker: this.circuitBreaker.getState(),
      requestQueue: {
        hasRequests: this.requestQueue.hasRequests(),
        processing: this.requestQueue.processing
      },
      configuration: {
        endpoint: this.endpoint,
        hasApiKey: !!this.apiKey,
        maxRetries: this.maxRetries,
        baseDelay: this.baseDelay
      }
    };
  }

  /**
   * Chunked data loading strategy for large datasets
   */
  async loadTransferHistory(address, maxPages = 10) {
    const results = [];

    try {
      // Load first page with HIGH priority
      const firstPage = await this.getTransfers(address, { page: 0, row: 100 });
      results.push(...firstPage.transfers);

      if (firstPage.count === 0) {
        return results;
      }

      // Calculate total pages needed
      const totalPages = Math.min(Math.ceil(firstPage.count / 100), maxPages);

      // Load additional pages with MEDIUM priority
      const remainingPages = [];
      for (let page = 1; page < totalPages; page++) {
        remainingPages.push(
          this.getTransfers(address, { page, row: 100 })
        );
      }

      // Execute remaining pages in parallel
      const additionalResults = await Promise.allSettled(remainingPages);

      additionalResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(...result.value.transfers);
        } else {
          logger.warn(`Failed to load page ${index + 1} for address ${address}`, {
            error: result.reason?.message
          });
        }
      });

      return results;
    } catch (error) {
      logger.error('Failed to load transfer history', {
        address,
        error: error.message
      });
      throw error;
    }
  }
}

// Singleton instance
export const subscanService = new SubscanService();

// Export error class for use by other modules
export { SubscanError };