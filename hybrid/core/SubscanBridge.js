import fetch from 'node-fetch';
import { EventEmitter } from 'events';

export class SubscanBridge extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      baseURL: 'https://polkadot.api.subscan.io',
      apiKey: config.apiKey || null,
      rateLimit: config.rateLimit || 200, // ms between requests (5 req/s)
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 10000,
      ...config
    };
    
    // Rate limiting
    this.lastRequest = 0;
    this.requestQueue = [];
    this.isProcessingQueue = false;
    
    // Enrichment queue
    this.enrichmentQueue = [];
    this.isProcessingEnrichment = false;
    
    // Metrics
    this.metrics = {
      requestsSent: 0,
      requestsSucceeded: 0,
      requestsFailed: 0,
      rateLimitHits: 0,
      averageResponseTime: 0,
      enrichmentsCompleted: 0
    };
    
    console.log('[SUBSCAN] SubscanBridge initialized', {
      baseURL: this.config.baseURL,
      hasApiKey: !!this.config.apiKey,
      rateLimit: `${1000/this.config.rateLimit} req/s`
    });
  }
  
  async initialize() {
    console.log('[SUBSCAN] Initializing Subscan bridge...');
    
    // Test connection
    try {
      await this.testConnection();
      console.log('[SUBSCAN] Connection test successful');
      
      // Start processing queues
      this.startQueueProcessing();
      this.startEnrichmentProcessing();
      
      console.log('[SUBSCAN] Subscan bridge initialized successfully');
    } catch (error) {
      console.error('[SUBSCAN] Failed to initialize:', error.message);
      throw error;
    }
  }
  
  async testConnection() {
    const response = await this.makeRequest('/api/scan/metadata', {}, 'GET');
    
    if (!response || !response.data) {
      throw new Error('Invalid response from Subscan API');
    }
    
    return response.data;
  }
  
  startQueueProcessing() {
    setInterval(() => {
      if (!this.isProcessingQueue && this.requestQueue.length > 0) {
        this.processRequestQueue();
      }
    }, this.config.rateLimit);
  }
  
  startEnrichmentProcessing() {
    setInterval(() => {
      if (!this.isProcessingEnrichment && this.enrichmentQueue.length > 0) {
        this.processEnrichmentQueue();
      }
    }, 5000); // Process enrichments every 5 seconds
  }
  
  async processRequestQueue() {
    if (this.requestQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    const request = this.requestQueue.shift();
    
    try {
      const result = await this.executeRequest(request);
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    }
    
    this.isProcessingQueue = false;
  }
  
  async processEnrichmentQueue() {
    if (this.enrichmentQueue.length === 0) return;
    
    this.isProcessingEnrichment = true;
    
    const enrichmentRequest = this.enrichmentQueue.shift();
    
    try {
      const enrichedData = await this.enrichAlert(enrichmentRequest.alert);
      this.emit('enriched', {
        alert: enrichmentRequest.alert,
        enrichment: enrichedData
      });
      
      this.metrics.enrichmentsCompleted++;
    } catch (error) {
      console.error('[SUBSCAN] Enrichment failed:', error.message);
      this.emit('enrichmentError', {
        alert: enrichmentRequest.alert,
        error
      });
    }
    
    this.isProcessingEnrichment = false;
  }
  
  async makeRequest(endpoint, data = {}, method = 'POST') {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        endpoint,
        data,
        method,
        resolve,
        reject,
        timestamp: Date.now()
      });
    });
  }
  
  async executeRequest(request) {
    const startTime = Date.now();
    const url = `${this.config.baseURL}${request.endpoint}`;
    
    // Rate limiting
    const timeSinceLastRequest = Date.now() - this.lastRequest;
    if (timeSinceLastRequest < this.config.rateLimit) {
      await new Promise(resolve => 
        setTimeout(resolve, this.config.rateLimit - timeSinceLastRequest)
      );
    }
    
    this.lastRequest = Date.now();
    this.metrics.requestsSent++;
    
    const requestOptions = {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'HybridWhaleMonitor/1.0'
      },
      timeout: this.config.timeout
    };
    
    if (this.config.apiKey) {
      requestOptions.headers['X-API-Key'] = this.config.apiKey;
    }
    
    if (request.method === 'POST' && Object.keys(request.data).length > 0) {
      requestOptions.body = JSON.stringify(request.data);
    }
    
    try {
      const response = await fetch(url, requestOptions);
      
      if (response.status === 429) {
        this.metrics.rateLimitHits++;
        throw new Error('Rate limit exceeded');
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Update metrics
      this.metrics.requestsSucceeded++;
      const responseTime = Date.now() - startTime;
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime + responseTime) / 2;
      
      return result;
      
    } catch (error) {
      this.metrics.requestsFailed++;
      console.error(`[SUBSCAN] Request failed: ${request.endpoint}`, error.message);
      throw error;
    }
  }
  
  async getTopAccounts(limit = 1000) {
    try {
      const response = await this.makeRequest('/api/v2/scan/accounts', {
        row: Math.min(limit, 100), // API limit
        page: 0,
        order: 'desc',
        order_field: 'balance'
      });
      
      if (response && response.data && response.data.list) {
        return response.data.list.map(account => ({
          address: account.address,
          balance: account.balance,
          rank: account.rank
        }));
      }
      
      return [];
    } catch (error) {
      console.error('[SUBSCAN] Failed to get top accounts:', error.message);
      return [];
    }
  }
  
  async getIdentity(address) {
    try {
      const response = await this.makeRequest('/api/v2/scan/account/tokens', {
        address
      });
      
      if (response && response.data && response.data.native) {
        return {
          address,
          display: response.data.native.display || null,
          legal: response.data.native.legal || null,
          web: response.data.native.web || null,
          riot: response.data.native.riot || null,
          email: response.data.native.email || null,
          twitter: response.data.native.twitter || null
        };
      }
      
      return null;
    } catch (error) {
      console.error(`[SUBSCAN] Failed to get identity for ${address}:`, error.message);
      return null;
    }
  }
  
  async getTransfers(address, limit = 10) {
    try {
      const response = await this.makeRequest('/api/v2/scan/transfers', {
        address,
        row: limit,
        page: 0
      });
      
      if (response && response.data && response.data.transfers) {
        return response.data.transfers.map(transfer => ({
          hash: transfer.hash,
          from: transfer.from,
          to: transfer.to,
          amount: transfer.amount,
          block_num: transfer.block_num,
          block_timestamp: transfer.block_timestamp,
          success: transfer.success
        }));
      }
      
      return [];
    } catch (error) {
      console.error(`[SUBSCAN] Failed to get transfers for ${address}:`, error.message);
      return [];
    }
  }
  
  async enrichAlert(alert) {
    const enrichment = {
      timestamp: Date.now(),
      sources: []
    };
    
    try {
      // Get identity information
      if (alert.from) {
        const fromIdentity = await this.getIdentity(alert.from);
        if (fromIdentity) {
          enrichment.fromIdentity = fromIdentity;
          enrichment.sources.push('identity_from');
        }
      }
      
      if (alert.to && alert.to !== alert.from) {
        const toIdentity = await this.getIdentity(alert.to);
        if (toIdentity) {
          enrichment.toIdentity = toIdentity;
          enrichment.sources.push('identity_to');
        }
      }
      
      // Get recent transaction context
      const address = alert.from || alert.address;
      if (address) {
        const recentTransfers = await this.getTransfers(address, 5);
        if (recentTransfers.length > 0) {
          enrichment.recentActivity = recentTransfers;
          enrichment.sources.push('recent_transfers');
          
          // Analyze patterns
          enrichment.patterns = this.analyzeTransferPatterns(recentTransfers);
        }
      }
      
      return enrichment;
      
    } catch (error) {
      console.error('[SUBSCAN] Enrichment error:', error.message);
      return {
        ...enrichment,
        error: error.message
      };
    }
  }
  
  analyzeTransferPatterns(transfers) {
    const patterns = {
      frequency: 'normal',
      volume: 'normal',
      addressDiversity: 'normal'
    };
    
    if (transfers.length >= 5) {
      patterns.frequency = 'high';
    }
    
    const totalVolume = transfers.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    if (totalVolume > 10000000) { // 10M DOT
      patterns.volume = 'high';
    }
    
    const uniqueAddresses = new Set();
    transfers.forEach(t => {
      uniqueAddresses.add(t.from);
      uniqueAddresses.add(t.to);
    });
    
    if (uniqueAddresses.size > transfers.length * 1.5) {
      patterns.addressDiversity = 'high';
    }
    
    return patterns;
  }
  
  scheduleEnrichment(alert) {
    this.enrichmentQueue.push({
      alert,
      scheduledAt: Date.now()
    });
    
    console.log(`[SUBSCAN] Scheduled enrichment for alert ${alert.id} (queue: ${this.enrichmentQueue.length})`);
  }
  
  async cleanup() {
    console.log('[SUBSCAN] Cleaning up Subscan bridge...');
    
    // Clear queues
    this.requestQueue = [];
    this.enrichmentQueue = [];
    
    console.log('[SUBSCAN] Cleanup complete');
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      queueSizes: {
        requests: this.requestQueue.length,
        enrichments: this.enrichmentQueue.length
      },
      isProcessing: {
        requests: this.isProcessingQueue,
        enrichments: this.isProcessingEnrichment
      }
    };
  }
}