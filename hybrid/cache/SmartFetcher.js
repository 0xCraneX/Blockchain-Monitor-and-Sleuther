import { EventEmitter } from 'events';

export class SmartFetcher extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Predictive fetching configuration
      predictionWindow: config.predictionWindow || 3600000, // 1 hour
      maxPredictiveRequests: config.maxPredictiveRequests || 50,
      learningWindow: config.learningWindow || 7 * 24 * 60 * 60 * 1000, // 7 days
      
      // Priority queue configuration
      highPriorityThreshold: config.highPriorityThreshold || 100000, // 100k DOT
      mediumPriorityThreshold: config.mediumPriorityThreshold || 10000, // 10k DOT
      
      // Performance tuning
      batchSize: config.batchSize || 10,
      fetchInterval: config.fetchInterval || 5000, // 5 seconds
      maxConcurrentFetches: config.maxConcurrentFetches || 5,
      
      ...config
    };
    
    // Priority queue for fetching requests
    this.priorityQueue = new PriorityQueue();
    
    // Activity prediction engine
    this.activityPredictor = new ActivityPredictor(this.config);
    
    // Request tracking
    this.pendingRequests = new Map();
    this.completedRequests = new Map();
    this.failedRequests = new Map();
    
    // Performance metrics
    this.metrics = {
      requestsQueued: 0,
      requestsCompleted: 0,
      requestsFailed: 0,
      predictiveHits: 0,
      predictiveMisses: 0,
      averageFetchTime: 0,
      cacheHitRate: 0
    };
    
    // Fetching state
    this.isFetching = false;
    this.activeFetches = new Set();
    
    this.startFetchProcessor();
    this.startPredictiveEngine();
    
    console.log('[FETCHER] SmartFetcher initialized', {
      predictionWindow: this.config.predictionWindow,
      maxPredictiveRequests: this.config.maxPredictiveRequests
    });
  }
  
  // Main scheduling method
  scheduleFetch(request) {
    const priority = this.calculatePriority(request);
    const fetchRequest = {
      id: this.generateRequestId(),
      ...request,
      priority,
      scheduledAt: Date.now(),
      attempts: 0
    };
    
    this.priorityQueue.enqueue(fetchRequest, priority);
    this.metrics.requestsQueued++;
    
    console.log(`[FETCHER] Scheduled ${request.type} fetch for ${request.address || request.identifier} (priority: ${priority})`);
    
    return fetchRequest.id;
  }
  
  // Schedule immediate high-priority fetch
  scheduleUrgentFetch(request) {
    return this.scheduleFetch({
      ...request,
      urgent: true,
      priority: 'critical'
    });
  }
  
  // Schedule preemptive fetch based on prediction
  schedulePreemptiveFetch(address, reason = 'predicted') {
    return this.scheduleFetch({
      type: 'identity',
      address,
      preemptive: true,
      reason,
      priority: 'low'
    });
  }
  
  calculatePriority(request) {
    let score = 50; // Base priority
    
    // Urgent requests get highest priority
    if (request.urgent) {
      return 100;
    }
    
    // Amount-based priority
    if (request.amount) {
      if (request.amount >= this.config.highPriorityThreshold) {
        score += 40;
      } else if (request.amount >= this.config.mediumPriorityThreshold) {
        score += 20;
      }
    }
    
    // Type-based priority
    switch (request.type) {
      case 'identity':
        score += 15;
        break;
      case 'transfers':
        score += 10;
        break;
      case 'balance':
        score += 5;
        break;
    }
    
    // Recent activity boost
    if (request.recentActivity) {
      score += 10;
    }
    
    // Preemptive requests get lower priority
    if (request.preemptive) {
      score -= 20;
    }
    
    // Time-sensitive boost
    const age = Date.now() - (request.timestamp || Date.now());
    if (age < 60000) { // Less than 1 minute old
      score += 15;
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  startFetchProcessor() {
    setInterval(() => {
      this.processFetchQueue();
    }, this.config.fetchInterval);
  }
  
  async processFetchQueue() {
    if (this.activeFetches.size >= this.config.maxConcurrentFetches) {
      return;
    }
    
    if (this.priorityQueue.isEmpty()) {
      return;
    }
    
    const fetchRequest = this.priorityQueue.dequeue();
    if (!fetchRequest) return;
    
    this.activeFetches.add(fetchRequest.id);
    
    try {
      await this.executeFetch(fetchRequest);
    } catch (error) {
      console.error(`[FETCHER] Fetch failed: ${fetchRequest.id}`, error.message);
      await this.handleFetchFailure(fetchRequest, error);
    } finally {
      this.activeFetches.delete(fetchRequest.id);
    }
  }
  
  async executeFetch(fetchRequest) {
    const startTime = Date.now();
    
    try {
      console.log(`[FETCHER] Executing ${fetchRequest.type} fetch: ${fetchRequest.id}`);
      
      let result;
      
      switch (fetchRequest.type) {
        case 'identity':
          result = await this.fetchIdentity(fetchRequest);
          break;
        case 'transfers':
          result = await this.fetchTransfers(fetchRequest);
          break;
        case 'balance':
          result = await this.fetchBalance(fetchRequest);
          break;
        case 'account':
          result = await this.fetchAccountData(fetchRequest);
          break;
        default:
          throw new Error(`Unknown fetch type: ${fetchRequest.type}`);
      }
      
      const fetchTime = Date.now() - startTime;
      
      // Update metrics
      this.metrics.requestsCompleted++;
      this.updateAverageTime(fetchTime);
      
      // Track completion
      this.completedRequests.set(fetchRequest.id, {
        request: fetchRequest,
        result,
        completedAt: Date.now(),
        fetchTime
      });
      
      // Update predictor
      this.activityPredictor.recordActivity(fetchRequest.address, fetchRequest.type, result);
      
      // Emit completion event
      this.emit('fetchCompleted', {
        requestId: fetchRequest.id,
        type: fetchRequest.type,
        result,
        fetchTime
      });
      
      console.log(`[FETCHER] Completed ${fetchRequest.type} fetch: ${fetchRequest.id} (${fetchTime}ms)`);
      
      return result;
      
    } catch (error) {
      this.metrics.requestsFailed++;
      throw error;
    }
  }
  
  async fetchIdentity(request) {
    // This would integrate with SubscanBridge
    // For now, simulate the fetch
    await this.simulateDelay(200);
    
    return {
      address: request.address,
      display: `Identity-${request.address.slice(0, 8)}`,
      legal: null,
      web: null,
      verified: Math.random() > 0.7
    };
  }
  
  async fetchTransfers(request) {
    // This would integrate with SubscanBridge  
    await this.simulateDelay(300);
    
    const transferCount = Math.floor(Math.random() * 20) + 1;
    const transfers = [];
    
    for (let i = 0; i < transferCount; i++) {
      transfers.push({
        hash: `transfer-${i}-${Date.now()}`,
        from: request.address,
        to: `random-address-${i}`,
        amount: Math.floor(Math.random() * 1000000),
        timestamp: Date.now() - (i * 3600000)
      });
    }
    
    return transfers;
  }
  
  async fetchBalance(request) {
    await this.simulateDelay(150);
    
    return {
      address: request.address,
      free: Math.floor(Math.random() * 10000000),
      reserved: Math.floor(Math.random() * 1000000),
      total: 0, // calculated
      timestamp: Date.now()
    };
  }
  
  async fetchAccountData(request) {
    await this.simulateDelay(400);
    
    return {
      address: request.address,
      balance: await this.fetchBalance(request),
      identity: await this.fetchIdentity(request),
      transfers: await this.fetchTransfers({ ...request, limit: 5 })
    };
  }
  
  async simulateDelay(ms) {
    // Simulate network delay
    const delay = ms + Math.random() * ms * 0.5;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  async handleFetchFailure(fetchRequest, error) {
    fetchRequest.attempts++;
    
    this.failedRequests.set(fetchRequest.id, {
      request: fetchRequest,
      error: error.message,
      failedAt: Date.now()
    });
    
    // Retry logic
    if (fetchRequest.attempts < 3 && !fetchRequest.preemptive) {
      // Reduce priority and re-queue
      fetchRequest.priority = Math.max(1, fetchRequest.priority - 20);
      
      setTimeout(() => {
        this.priorityQueue.enqueue(fetchRequest, fetchRequest.priority);
        console.log(`[FETCHER] Retrying fetch: ${fetchRequest.id} (attempt ${fetchRequest.attempts})`);
      }, fetchRequest.attempts * 1000); // Exponential backoff
    } else {
      console.error(`[FETCHER] Gave up on fetch: ${fetchRequest.id} after ${fetchRequest.attempts} attempts`);
    }
    
    this.emit('fetchFailed', {
      requestId: fetchRequest.id,
      error: error.message,
      attempts: fetchRequest.attempts
    });
  }
  
  startPredictiveEngine() {
    setInterval(() => {
      this.runPredictiveAnalysis();
    }, 60000); // Every minute
  }
  
  async runPredictiveAnalysis() {
    try {
      const predictions = await this.activityPredictor.predictActivity();
      
      for (const prediction of predictions) {
        if (this.shouldPreemptivelyFetch(prediction)) {
          this.schedulePreemptiveFetch(prediction.address, prediction.reason);
        }
      }
      
      console.log(`[FETCHER] Processed ${predictions.length} activity predictions`);
      
    } catch (error) {
      console.error('[FETCHER] Predictive analysis failed:', error.message);
    }
  }
  
  shouldPreemptivelyFetch(prediction) {
    // Check if we already have recent data
    const recentFetch = this.findRecentFetch(prediction.address, prediction.type);
    if (recentFetch && Date.now() - recentFetch.completedAt < 300000) { // 5 minutes
      return false;
    }
    
    // Check prediction confidence
    if (prediction.confidence < 0.7) {
      return false;
    }
    
    // Check queue capacity
    if (this.priorityQueue.size() > this.config.maxPredictiveRequests) {
      return false;
    }
    
    return true;
  }
  
  findRecentFetch(address, type) {
    for (const [id, completed] of this.completedRequests.entries()) {
      if (completed.request.address === address && 
          completed.request.type === type) {
        return completed;
      }
    }
    return null;
  }
  
  updateAverageTime(fetchTime) {
    if (this.metrics.averageFetchTime === 0) {
      this.metrics.averageFetchTime = fetchTime;
    } else {
      this.metrics.averageFetchTime = (this.metrics.averageFetchTime + fetchTime) / 2;
    }
  }
  
  generateRequestId() {
    return `fetch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  getMetrics() {
    const successRate = this.metrics.requestsCompleted > 0 ? 
      (this.metrics.requestsCompleted / (this.metrics.requestsCompleted + this.metrics.requestsFailed)) * 100 : 0;
    
    return {
      ...this.metrics,
      queueSize: this.priorityQueue.size(),
      activeFetches: this.activeFetches.size,
      successRate: successRate.toFixed(2) + '%',
      averageFetchTime: Math.round(this.metrics.averageFetchTime) + 'ms',
      predictiveEfficiency: this.calculatePredictiveEfficiency()
    };
  }
  
  calculatePredictiveEfficiency() {
    const totalPredictive = this.metrics.predictiveHits + this.metrics.predictiveMisses;
    if (totalPredictive === 0) return '0%';
    
    return ((this.metrics.predictiveHits / totalPredictive) * 100).toFixed(1) + '%';
  }
  
  // Public API methods
  async fetchNow(request) {
    // For urgent synchronous fetching
    request.urgent = true;
    const requestId = this.scheduleFetch(request);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Fetch timeout'));
      }, 30000); // 30 second timeout
      
      this.once('fetchCompleted', (event) => {
        if (event.requestId === requestId) {
          clearTimeout(timeout);
          resolve(event.result);
        }
      });
      
      this.once('fetchFailed', (event) => {
        if (event.requestId === requestId) {
          clearTimeout(timeout);
          reject(new Error(event.error));
        }
      });
    });
  }
  
  getQueueStatus() {
    return {
      size: this.priorityQueue.size(),
      activeFetches: this.activeFetches.size,
      pendingByPriority: this.priorityQueue.getByPriority()
    };
  }
  
  clearQueue() {
    this.priorityQueue.clear();
    console.log('[FETCHER] Fetch queue cleared');
  }
}

// Activity prediction engine
class ActivityPredictor {
  constructor(config) {
    this.config = config;
    this.activityHistory = new Map(); // address -> activity patterns
    this.patterns = new Map(); // detected patterns
  }
  
  recordActivity(address, type, data) {
    if (!this.activityHistory.has(address)) {
      this.activityHistory.set(address, []);
    }
    
    const history = this.activityHistory.get(address);
    history.push({
      type,
      timestamp: Date.now(),
      data: this.extractFeatures(data)
    });
    
    // Keep only recent history
    const cutoff = Date.now() - this.config.learningWindow;
    const filtered = history.filter(item => item.timestamp > cutoff);
    this.activityHistory.set(address, filtered);
  }
  
  extractFeatures(data) {
    // Extract relevant features for prediction
    if (Array.isArray(data)) {
      return { count: data.length, hasActivity: data.length > 0 };
    }
    
    return { hasData: !!data };
  }
  
  async predictActivity() {
    const predictions = [];
    
    for (const [address, history] of this.activityHistory.entries()) {
      const prediction = this.analyzePredictability(address, history);
      if (prediction.confidence > 0.6) {
        predictions.push(prediction);
      }
    }
    
    return predictions.slice(0, 20); // Limit predictions
  }
  
  analyzePredictability(address, history) {
    // Simple pattern analysis
    const recentActivity = history.filter(
      item => Date.now() - item.timestamp < 3600000 // Last hour
    );
    
    let confidence = 0.5;
    let reason = 'baseline';
    
    if (recentActivity.length > 3) {
      confidence += 0.3;
      reason = 'high_recent_activity';
    }
    
    if (history.length > 10) {
      confidence += 0.2;
      reason = 'established_pattern';
    }
    
    return {
      address,
      type: 'identity', // Default prediction type
      confidence: Math.min(confidence, 1.0),
      reason,
      expectedAt: Date.now() + 1800000 // 30 minutes from now
    };
  }
}

// Priority Queue implementation
class PriorityQueue {
  constructor() {
    this.items = [];
  }
  
  enqueue(item, priority) {
    const queueElement = { item, priority };
    let added = false;
    
    for (let i = 0; i < this.items.length; i++) {
      if (queueElement.priority > this.items[i].priority) {
        this.items.splice(i, 0, queueElement);
        added = true;
        break;
      }
    }
    
    if (!added) {
      this.items.push(queueElement);
    }
  }
  
  dequeue() {
    return this.items.shift()?.item;
  }
  
  isEmpty() {
    return this.items.length === 0;
  }
  
  size() {
    return this.items.length;
  }
  
  clear() {
    this.items = [];
  }
  
  getByPriority() {
    const byPriority = {};
    
    for (const item of this.items) {
      const bucket = Math.floor(item.priority / 10) * 10;
      if (!byPriority[bucket]) byPriority[bucket] = 0;
      byPriority[bucket]++;
    }
    
    return byPriority;
  }
}