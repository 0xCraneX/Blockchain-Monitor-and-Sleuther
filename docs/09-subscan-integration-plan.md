# Subscan Real Data Integration Plan

## Executive Summary

This document outlines a comprehensive strategy for integrating Subscan API as the primary real data source for the Polkadot Analysis Tool, respecting rate limits, eliminating mock data, and providing robust error handling with clear user messaging.

## Key Requirements

### 1. **Zero Mock Data Policy**
- **Absolute Rule**: No mock/fallback data under any circumstances
- **Error Handling**: Clear, informative error messages when real data unavailable
- **User Experience**: Transparent communication about data loading states and failures

### 2. **Rate Limiting Compliance**
- **Subscan Free Tier**: 5 requests/second (300 requests/minute)
- **Token Bucket Algorithm**: Already implemented in `TokenBucket.js`
- **Request Queuing**: Priority-based queuing for optimal resource utilization
- **Adaptive Delays**: Configurable intervals between requests

### 3. **Learned Optimizations**
- **Chunked Processing**: Break large requests into manageable chunks
- **Request Prioritization**: Critical data first, enrichment data second
- **Circuit Breaker**: Fail fast on sustained API errors
- **Exponential Backoff**: Smart retry mechanism for transient failures

## Technical Architecture

### Core Components

#### 1. Enhanced SubscanService (`src/services/SubscanService.js`)

```javascript
class SubscanService {
  constructor() {
    // Rate limiting: 5 req/sec = token bucket with 5 capacity, 5 refill rate
    this.rateLimiter = new TokenBucket(5, 5, 1000);
    this.requestQueue = new PriorityQueue();
    this.circuitBreaker = new CircuitBreaker(this.makeRequest.bind(this));
    
    // Configuration from environment
    this.apiKey = process.env.SUBSCAN_API_KEY || '';
    this.endpoint = process.env.SUBSCAN_API_ENDPOINT || 'https://polkadot.api.subscan.io';
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second base delay for exponential backoff
  }

  // Priority levels for request queuing
  static PRIORITY = {
    CRITICAL: 1,    // Core account data needed for basic functionality
    HIGH: 2,        // Transaction data for current view
    MEDIUM: 3,      // Related account enrichment
    LOW: 4          // Background data, analytics
  };
}
```

#### 2. Request Queue System

```javascript
class PriorityQueue {
  constructor() {
    this.queues = new Map();
    this.processing = false;
  }

  add(request, priority = SubscanService.PRIORITY.MEDIUM) {
    if (!this.queues.has(priority)) {
      this.queues.set(priority, []);
    }
    this.queues.get(priority).push(request);
    this.process();
  }

  async process() {
    if (this.processing) return;
    this.processing = true;

    while (this.hasRequests()) {
      const request = this.getNextRequest();
      if (request) {
        await this.executeRequest(request);
      }
    }
    
    this.processing = false;
  }
}
```

#### 3. Circuit Breaker Pattern

```javascript
class CircuitBreaker {
  constructor(requestFunction, {
    failureThreshold = 5,
    recoveryTimeout = 30000,
    monitoringPeriod = 60000
  } = {}) {
    this.request = requestFunction;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeout;
  }

  async execute(requestData) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new SubscanError('Circuit breaker is OPEN - API temporarily unavailable');
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
}
```

### Data Flow Architecture

#### 1. **Request Lifecycle**

```
User Request → Validation → Queue Assignment → Rate Limiting → API Call → Response Processing → Error Handling → User Feedback
```

#### 2. **Priority-Based Data Loading**

1. **CRITICAL Priority**: Core account existence, basic balance
2. **HIGH Priority**: Recent transaction history for current view
3. **MEDIUM Priority**: Extended transaction history, related accounts
4. **LOW Priority**: Statistical data, enrichment information

#### 3. **Error Propagation Strategy**

```javascript
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
      'API_KEY_INVALID': 'API authentication failed. Please check your configuration.'
    };
    
    return messages[this.code] || 'An unexpected error occurred while fetching blockchain data.';
  }
}
```

### Implementation Phases

#### Phase 1: Core Infrastructure (Week 1)
- ✅ **COMPLETED**: TokenBucket rate limiter implementation
- 🔄 **IN PROGRESS**: Enhanced SubscanService with rate limiting integration
- **TODO**: Request queue system implementation
- **TODO**: Circuit breaker pattern implementation
- **TODO**: Error classification and user messaging

#### Phase 2: Data Integration (Week 2)
- **TODO**: Account data retrieval with proper error handling
- **TODO**: Transaction history with chunked loading
- **TODO**: Related account discovery
- **TODO**: Balance and metadata enrichment

#### Phase 3: Advanced Features (Week 3)
- **TODO**: Request prioritization based on user interaction
- **TODO**: Intelligent caching with TTL management
- **TODO**: Background data prefetching
- **TODO**: Performance monitoring and optimization

#### Phase 4: Resilience & Monitoring (Week 4)
- **TODO**: Comprehensive error recovery mechanisms
- **TODO**: API health monitoring
- **TODO**: Performance metrics and alerting
- **TODO**: Graceful degradation strategies

## API Integration Strategy

### Core Endpoints Prioritization

#### 1. **Critical Endpoints** (PRIORITY.CRITICAL)
```javascript
// Account basic information
GET /api/scan/account
// Parameters: address
// Rate: 1 request per address
// Caching: 5 minutes TTL

// Account balance
GET /api/scan/account/tokens
// Parameters: address
// Rate: 1 request per address
// Caching: 1 minute TTL
```

#### 2. **High Priority Endpoints** (PRIORITY.HIGH)
```javascript
// Recent transfers (last 100)
GET /api/scan/transfers
// Parameters: address, page=0, row=100
// Rate: 1 request per page
// Caching: 30 seconds TTL

// Recent extrinsics
GET /api/scan/extrinsics
// Parameters: address, page=0, row=50
// Rate: 1 request per page
// Caching: 30 seconds TTL
```

#### 3. **Medium Priority Endpoints** (PRIORITY.MEDIUM)
```javascript
// Extended transfer history
GET /api/scan/transfers
// Parameters: address, page>0
// Rate: 1 request per page, chunked loading
// Caching: 5 minutes TTL

// Account statistics
GET /api/scan/account/statistics
// Parameters: address
// Rate: 1 request per address
// Caching: 10 minutes TTL
```

### Request Optimization Strategies

#### 1. **Chunked Data Loading**
```javascript
async function loadTransferHistory(address, maxPages = 10) {
  const results = [];
  
  // Load first page with HIGH priority
  const firstPage = await this.queueRequest({
    endpoint: '/api/scan/transfers',
    params: { address, page: 0, row: 100 },
    priority: SubscanService.PRIORITY.HIGH
  });
  
  results.push(...firstPage.data.transfers);
  
  // Load additional pages with MEDIUM priority
  for (let page = 1; page < Math.min(firstPage.data.count / 100, maxPages); page++) {
    const pageData = await this.queueRequest({
      endpoint: '/api/scan/transfers', 
      params: { address, page, row: 100 },
      priority: SubscanService.PRIORITY.MEDIUM
    });
    
    results.push(...pageData.data.transfers);
  }
  
  return results;
}
```

#### 2. **Intelligent Caching Strategy**
```javascript
class DataCache {
  constructor() {
    this.cache = new Map();
    this.TTLs = new Map();
  }

  set(key, data, ttlSeconds) {
    this.cache.set(key, data);
    this.TTLs.set(key, Date.now() + (ttlSeconds * 1000));
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    
    const expiry = this.TTLs.get(key);
    if (Date.now() > expiry) {
      this.cache.delete(key);
      this.TTLs.delete(key);
      return null;
    }
    
    return this.cache.get(key);
  }
}
```

## Error Handling & User Experience

### 1. **Progressive Loading States**
```javascript
const LoadingStates = {
  IDLE: 'idle',
  LOADING_CRITICAL: 'loading_critical',    // "Loading account data..."
  LOADING_TRANSACTIONS: 'loading_transactions', // "Loading transaction history..."
  LOADING_ENRICHMENT: 'loading_enrichment',     // "Loading additional data..."
  ERROR: 'error',
  COMPLETE: 'complete'
};
```

### 2. **Clear Error Messages**
- **Rate Limited**: "API rate limit reached. Automatically retrying in 3 seconds..."
- **Network Error**: "Network connection failed. Please check your internet connection."
- **Invalid Address**: "The address format is invalid for Polkadot network."
- **No Data Found**: "No transaction history found for this address."
- **API Unavailable**: "Subscan API is temporarily unavailable. Retrying automatically..."

### 3. **Graceful Degradation**
```javascript
async function getAccountData(address) {
  try {
    // Attempt to get comprehensive data
    const [account, balance, transfers] = await Promise.allSettled([
      this.getAccount(address),
      this.getBalance(address), 
      this.getRecentTransfers(address)
    ]);

    // Return partial data if some requests fail
    return {
      account: account.status === 'fulfilled' ? account.value : null,
      balance: balance.status === 'fulfilled' ? balance.value : null,
      transfers: transfers.status === 'fulfilled' ? transfers.value : [],
      warnings: this.extractWarnings([account, balance, transfers])
    };
  } catch (error) {
    throw new SubscanError(
      `Failed to load account data for ${address}`,
      'DATA_UNAVAILABLE',
      error
    );
  }
}
```

## Performance Targets

### 1. **Response Time Goals**
- Account data (critical): < 2 seconds
- Transaction history (first page): < 3 seconds  
- Complete data loading: < 10 seconds
- Background enrichment: < 30 seconds

### 2. **Rate Limiting Efficiency**
- **Token utilization**: > 90% of available rate limit
- **Queue processing**: < 1 second average wait time
- **Cache hit ratio**: > 70% for repeated requests

### 3. **Error Recovery**
- **Circuit breaker recovery**: < 30 seconds
- **Retry success rate**: > 95% for transient errors
- **User notification**: < 1 second for error feedback

## Monitoring & Observability

### 1. **Key Metrics**
```javascript
const Metrics = {
  // Performance
  requestLatency: 'subscan_request_duration_seconds',
  queueWaitTime: 'subscan_queue_wait_duration_seconds',
  cacheHitRatio: 'subscan_cache_hit_ratio',
  
  // Reliability  
  errorRate: 'subscan_error_rate',
  rateLimitHits: 'subscan_rate_limit_total',
  circuitBreakerState: 'subscan_circuit_breaker_state',
  
  // Business
  dataCompleteness: 'subscan_data_completeness_ratio',
  userSatisfaction: 'subscan_user_experience_score'
};
```

### 2. **Health Checks**
```javascript
async function healthCheck() {
  const start = Date.now();
  
  try {
    // Simple API test
    await this.rateLimiter.waitAndConsume(1);
    const response = await fetch(`${this.endpoint}/api/scan/metadata`);
    
    return {
      status: 'healthy',
      latency: Date.now() - start,
      rateLimit: this.rateLimiter.getStatus(),
      circuitBreaker: this.circuitBreaker.getState()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      latency: Date.now() - start
    };
  }
}
```

## Risk Mitigation

### 1. **API Rate Limit Exhaustion**
- **Prevention**: Token bucket with 90% utilization target
- **Detection**: Monitor rate limit headers and queue backup
- **Response**: Automatic request spacing and user notification

### 2. **API Service Outages**
- **Prevention**: Circuit breaker with health monitoring
- **Detection**: Failed request pattern analysis
- **Response**: Clear user messaging and retry scheduling

### 3. **Data Quality Issues**
- **Prevention**: Response validation and sanitization
- **Detection**: Data consistency checks
- **Response**: Error logging and graceful fallback

### 4. **User Experience Degradation**
- **Prevention**: Progressive loading and clear status indicators
- **Detection**: Performance monitoring and user feedback
- **Response**: Optimization and communication improvements

## Success Criteria

### 1. **Functional Requirements**
- ✅ Zero mock data in production
- 🎯 100% real Subscan data integration
- 🎯 Comprehensive error handling with user-friendly messages
- 🎯 Rate limit compliance (< 5 req/sec average)

### 2. **Performance Requirements**
- 🎯 < 3 seconds for critical account data
- 🎯 < 10 seconds for complete transaction history
- 🎯 > 95% API success rate
- 🎯 > 70% cache utilization

### 3. **User Experience Requirements**
- 🎯 Clear loading states and progress indicators
- 🎯 Informative error messages with suggested actions
- 🎯 Graceful degradation for partial data failures
- 🎯 No user confusion about data availability

## Implementation Timeline

| Week | Focus | Deliverables |
|------|-------|-------------|
| 1 | Infrastructure | Rate limiting, queuing, circuit breaker |
| 2 | Core Integration | Account data, transactions, error handling |
| 3 | Optimization | Caching, prefetching, performance tuning |
| 4 | Polish | Monitoring, documentation, user testing |

## Conclusion

This comprehensive plan transforms the Polkadot Analysis Tool from a mock-data prototype into a production-ready blockchain investigation tool powered entirely by real Subscan data. The emphasis on rate limiting, error handling, and user experience ensures reliable operation within API constraints while maintaining professional-grade usability.

The phased implementation approach allows for iterative improvement and validation, ensuring each component is robust before building upon it. The zero-mock-data policy ensures users always know they're working with real blockchain data or clear explanations of why data isn't available.