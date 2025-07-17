// Mock implementations for missing modules to allow testing

// Mock axios
const mockAxios = {
  create: (config) => {
    console.log('[MOCK] Creating axios instance with config:', config.baseURL);
    return {
      post: async (endpoint, data) => {
        console.log(`[MOCK] POST request to ${endpoint}`, data);
        
        // Mock response for top accounts endpoint
        if (endpoint.includes('/api/scan/accounts/top')) {
          return {
            status: 200,
            data: {
              code: 0,
              message: 'Success',
              data: {
                count: 1000,
                list: [
                  {
                    address: '1FRMM8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
                    balance: '15000000000000000',
                    nonce: 42,
                    account_display: { account_index: '1' },
                    identity_display: 'Mock Whale 1'
                  },
                  {
                    address: '14ShUZUYUSPFLBBaKipQKbEoPEfPPaKBEta721NdXP721N',
                    balance: '9500000000000000',
                    nonce: 10,
                    account_display: { account_index: '2' },
                    identity_display: 'Mock Whale 2'
                  },
                  {
                    address: '15cfSaBcTxNr8rV59cbhdMNCRagFr3GE6B3zZRsCp4QHHKPu',
                    balance: '7200000000000000',
                    nonce: 5,
                    account_display: { account_index: '3' },
                    identity_display: null
                  }
                ]
              }
            }
          };
        }
        
        // Mock response for transfers endpoint
        if (endpoint.includes('/api/v2/scan/transfers')) {
          return {
            status: 200,
            data: {
              code: 0,
              message: 'Success',
              data: {
                transfers: [
                  {
                    from: data.address,
                    to: '12xtAYsRUrmbniiziKXqWKDLbkAShg2aZPBFQyPpJBBHHqHo',
                    amount: '1000000000000',
                    block_num: 15234567,
                    block_timestamp: Date.now() / 1000 - 3600
                  }
                ]
              }
            }
          };
        }
        
        return { status: 200, data: { code: 0, message: 'Success', data: {} } };
      }
    };
  }
};

// Mock limiter
class MockRateLimiter {
  constructor(options) {
    console.log('[MOCK] RateLimiter created with:', options);
  }
  
  async removeTokens(count) {
    // Simulate rate limiting with small delay
    await new Promise(resolve => setTimeout(resolve, 50));
    return count;
  }
}

// Mock p-retry
const mockPRetry = async (fn, options) => {
  try {
    return await fn();
  } catch (error) {
    console.log('[MOCK] p-retry would retry here, but returning error');
    throw error;
  }
};

// Mock lru-cache
class MockLRU {
  constructor(options) {
    console.log('[MOCK] LRU cache created with:', options);
    this.cache = new Map();
    this.maxSize = options.max || 500;
  }
  
  has(key) {
    return this.cache.has(key);
  }
  
  get(key) {
    return this.cache.get(key);
  }
  
  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
  
  clear() {
    this.cache.clear();
  }
  
  get size() {
    return this.cache.size;
  }
}

// Mock node-cron
const mockCron = {
  schedule: (pattern, callback) => {
    console.log(`[MOCK] Cron scheduled for pattern: ${pattern}`);
    // For testing, just run immediately
    setTimeout(callback, 1000);
    return {
      stop: () => console.log('[MOCK] Cron stopped')
    };
  }
};

module.exports = {
  axios: mockAxios,
  RateLimiter: MockRateLimiter,
  pRetry: mockPRetry,
  LRU: MockLRU,
  cron: mockCron
};