import { EventEmitter } from 'events';

export class CircuitBreaker extends EventEmitter {
  constructor(name, config = {}) {
    super();
    
    this.name = name;
    this.config = {
      // Failure thresholds
      failureThreshold: config.failureThreshold || 5,
      successThreshold: config.successThreshold || 3,
      timeout: config.timeout || 60000, // 1 minute
      
      // Monitoring windows
      monitoringWindow: config.monitoringWindow || 300000, // 5 minutes
      halfOpenRetryDelay: config.halfOpenRetryDelay || 30000, // 30 seconds
      
      // Advanced settings
      volumeThreshold: config.volumeThreshold || 10, // Minimum calls before circuit can trip
      errorRate: config.errorRate || 0.5, // 50% error rate threshold
      
      ...config
    };
    
    // Circuit states: CLOSED, OPEN, HALF_OPEN
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = 0;
    
    // Request tracking
    this.requestLog = [];
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    
    // Metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      circuitOpens: 0,
      circuitCloses: 0,
      timeouts: 0,
      rejectedRequests: 0
    };
    
    console.log(`[CIRCUIT] CircuitBreaker '${this.name}' initialized`, {
      failureThreshold: this.config.failureThreshold,
      timeout: this.config.timeout,
      state: this.state
    });
  }
  
  async execute(fn, fallbackFn = null) {
    this.metrics.totalRequests++;
    
    // Check circuit state
    if (!this.canExecute()) {
      this.metrics.rejectedRequests++;
      
      if (fallbackFn) {
        try {
          return await fallbackFn();
        } catch (fallbackError) {
          throw new Error(`Circuit breaker open and fallback failed: ${fallbackError.message}`);
        }
      } else {
        throw new Error(`Circuit breaker '${this.name}' is OPEN`);
      }
    }
    
    const startTime = Date.now();
    
    try {
      // Set timeout for the operation
      const result = await this.executeWithTimeout(fn, this.config.timeout);
      
      // Record success
      this.onSuccess(Date.now() - startTime);
      
      return result;
      
    } catch (error) {
      // Record failure
      this.onFailure(error, Date.now() - startTime);
      throw error;
    }
  }
  
  async executeWithTimeout(fn, timeout) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {\n        this.metrics.timeouts++;\n        reject(new Error(`Operation timed out after ${timeout}ms`));\n      }, timeout);\n      \n      try {\n        const result = await fn();\n        clearTimeout(timeoutId);\n        resolve(result);\n      } catch (error) {\n        clearTimeout(timeoutId);\n        reject(error);\n      }\n    });\n  }\n  \n  canExecute() {\n    const now = Date.now();\n    \n    switch (this.state) {\n      case 'CLOSED':\n        return true;\n        \n      case 'OPEN':\n        if (now >= this.nextAttempt) {\n          this.transitionToHalfOpen();\n          return true;\n        }\n        return false;\n        \n      case 'HALF_OPEN':\n        return true;\n        \n      default:\n        return false;\n    }\n  }\n  \n  onSuccess(duration) {\n    this.metrics.successfulRequests++;\n    this.lastSuccessTime = Date.now();\n    \n    this.recordRequest(true, duration);\n    \n    if (this.state === 'HALF_OPEN') {\n      this.successCount++;\n      \n      if (this.successCount >= this.config.successThreshold) {\n        this.transitionToClosed();\n      }\n    } else if (this.state === 'CLOSED') {\n      // Reset failure count on success\n      this.failureCount = 0;\n    }\n  }\n  \n  onFailure(error, duration) {\n    this.metrics.failedRequests++;\n    this.lastFailureTime = Date.now();\n    \n    this.recordRequest(false, duration, error.message);\n    \n    if (this.state === 'CLOSED') {\n      this.failureCount++;\n      \n      if (this.shouldTripCircuit()) {\n        this.transitionToOpen();\n      }\n    } else if (this.state === 'HALF_OPEN') {\n      // Go back to open on any failure in half-open state\n      this.transitionToOpen();\n    }\n  }\n  \n  shouldTripCircuit() {\n    // Check if we have enough volume\n    if (this.metrics.totalRequests < this.config.volumeThreshold) {\n      return false;\n    }\n    \n    // Check failure threshold\n    if (this.failureCount >= this.config.failureThreshold) {\n      return true;\n    }\n    \n    // Check error rate within monitoring window\n    const recentRequests = this.getRecentRequests();\n    if (recentRequests.length >= this.config.volumeThreshold) {\n      const errorRate = recentRequests.filter(r => !r.success).length / recentRequests.length;\n      return errorRate >= this.config.errorRate;\n    }\n    \n    return false;\n  }\n  \n  getRecentRequests() {\n    const cutoff = Date.now() - this.config.monitoringWindow;\n    return this.requestLog.filter(req => req.timestamp > cutoff);\n  }\n  \n  recordRequest(success, duration, error = null) {\n    this.requestLog.push({\n      timestamp: Date.now(),\n      success,\n      duration,\n      error\n    });\n    \n    // Keep only recent requests\n    const cutoff = Date.now() - this.config.monitoringWindow * 2;\n    this.requestLog = this.requestLog.filter(req => req.timestamp > cutoff);\n  }\n  \n  transitionToClosed() {\n    const previousState = this.state;\n    this.state = 'CLOSED';\n    this.failureCount = 0;\n    this.successCount = 0;\n    this.nextAttempt = 0;\n    \n    this.metrics.circuitCloses++;\n    \n    console.log(`[CIRCUIT] '${this.name}' transitioned to CLOSED`);\n    this.emit('stateChange', {\n      from: previousState,\n      to: 'CLOSED',\n      reason: 'Success threshold reached'\n    });\n  }\n  \n  transitionToOpen() {\n    const previousState = this.state;\n    this.state = 'OPEN';\n    this.nextAttempt = Date.now() + this.config.halfOpenRetryDelay;\n    this.successCount = 0;\n    \n    this.metrics.circuitOpens++;\n    \n    console.log(`[CIRCUIT] '${this.name}' transitioned to OPEN (next attempt: ${new Date(this.nextAttempt).toISOString()})`);\n    this.emit('stateChange', {\n      from: previousState,\n      to: 'OPEN',\n      reason: 'Failure threshold exceeded',\n      nextAttempt: this.nextAttempt\n    });\n  }\n  \n  transitionToHalfOpen() {\n    const previousState = this.state;\n    this.state = 'HALF_OPEN';\n    this.successCount = 0;\n    \n    console.log(`[CIRCUIT] '${this.name}' transitioned to HALF_OPEN`);\n    this.emit('stateChange', {\n      from: previousState,\n      to: 'HALF_OPEN',\n      reason: 'Retry attempt'\n    });\n  }\n  \n  // Manual control methods\n  forceOpen(reason = 'Manual intervention') {\n    this.transitionToOpen();\n    console.log(`[CIRCUIT] '${this.name}' manually forced OPEN: ${reason}`);\n  }\n  \n  forceClosed(reason = 'Manual intervention') {\n    this.transitionToClosed();\n    console.log(`[CIRCUIT] '${this.name}' manually forced CLOSED: ${reason}`);\n  }\n  \n  reset() {\n    this.state = 'CLOSED';\n    this.failureCount = 0;\n    this.successCount = 0;\n    this.nextAttempt = 0;\n    this.requestLog = [];\n    \n    console.log(`[CIRCUIT] '${this.name}' reset to initial state`);\n    this.emit('reset');\n  }\n  \n  // Status and metrics\n  getStatus() {\n    const recentRequests = this.getRecentRequests();\n    const recentErrorRate = recentRequests.length > 0 ? \n      (recentRequests.filter(r => !r.success).length / recentRequests.length) : 0;\n    \n    const avgDuration = recentRequests.length > 0 ?\n      recentRequests.reduce((sum, r) => sum + r.duration, 0) / recentRequests.length : 0;\n    \n    return {\n      name: this.name,\n      state: this.state,\n      failureCount: this.failureCount,\n      successCount: this.successCount,\n      nextAttempt: this.nextAttempt,\n      \n      // Recent metrics\n      recentRequests: recentRequests.length,\n      recentErrorRate: (recentErrorRate * 100).toFixed(1) + '%',\n      averageDuration: Math.round(avgDuration) + 'ms',\n      \n      // Overall metrics\n      ...this.metrics,\n      \n      // Health indicators\n      isHealthy: this.state === 'CLOSED' && recentErrorRate < 0.1,\n      lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,\n      lastSuccess: this.lastSuccessTime ? new Date(this.lastSuccessTime).toISOString() : null\n    };\n  }\n  \n  getMetrics() {\n    return {\n      ...this.metrics,\n      state: this.state,\n      uptime: this.calculateUptime(),\n      errorRate: this.calculateErrorRate()\n    };\n  }\n  \n  calculateUptime() {\n    const recentRequests = this.getRecentRequests();\n    if (recentRequests.length === 0) return '100%';\n    \n    const successfulRequests = recentRequests.filter(r => r.success).length;\n    return ((successfulRequests / recentRequests.length) * 100).toFixed(1) + '%';\n  }\n  \n  calculateErrorRate() {\n    if (this.metrics.totalRequests === 0) return '0%';\n    \n    return ((this.metrics.failedRequests / this.metrics.totalRequests) * 100).toFixed(1) + '%';\n  }\n}\n\n// Circuit Breaker Manager\nexport class CircuitBreakerManager {\n  constructor() {\n    this.breakers = new Map();\n    this.globalMetrics = {\n      totalBreakers: 0,\n      openBreakers: 0,\n      halfOpenBreakers: 0,\n      closedBreakers: 0\n    };\n  }\n  \n  create(name, config = {}) {\n    if (this.breakers.has(name)) {\n      console.warn(`[CIRCUIT] Circuit breaker '${name}' already exists`);\n      return this.breakers.get(name);\n    }\n    \n    const breaker = new CircuitBreaker(name, config);\n    \n    // Set up monitoring\n    breaker.on('stateChange', (event) => {\n      this.updateGlobalMetrics();\n      console.log(`[CIRCUIT] Global state change: ${name} ${event.from} → ${event.to}`);\n    });\n    \n    this.breakers.set(name, breaker);\n    this.globalMetrics.totalBreakers++;\n    this.updateGlobalMetrics();\n    \n    console.log(`[CIRCUIT] Created circuit breaker: ${name}`);\n    return breaker;\n  }\n  \n  get(name) {\n    return this.breakers.get(name);\n  }\n  \n  remove(name) {\n    const breaker = this.breakers.get(name);\n    if (breaker) {\n      this.breakers.delete(name);\n      this.globalMetrics.totalBreakers--;\n      this.updateGlobalMetrics();\n      console.log(`[CIRCUIT] Removed circuit breaker: ${name}`);\n    }\n  }\n  \n  updateGlobalMetrics() {\n    this.globalMetrics.openBreakers = 0;\n    this.globalMetrics.halfOpenBreakers = 0;\n    this.globalMetrics.closedBreakers = 0;\n    \n    for (const breaker of this.breakers.values()) {\n      switch (breaker.state) {\n        case 'OPEN':\n          this.globalMetrics.openBreakers++;\n          break;\n        case 'HALF_OPEN':\n          this.globalMetrics.halfOpenBreakers++;\n          break;\n        case 'CLOSED':\n          this.globalMetrics.closedBreakers++;\n          break;\n      }\n    }\n  }\n  \n  getAllStatus() {\n    const status = {};\n    \n    for (const [name, breaker] of this.breakers.entries()) {\n      status[name] = breaker.getStatus();\n    }\n    \n    return {\n      global: this.globalMetrics,\n      breakers: status\n    };\n  }\n  \n  getHealthSummary() {\n    const unhealthyBreakers = [];\n    \n    for (const [name, breaker] of this.breakers.entries()) {\n      const status = breaker.getStatus();\n      if (!status.isHealthy) {\n        unhealthyBreakers.push({\n          name,\n          state: status.state,\n          errorRate: status.recentErrorRate,\n          lastFailure: status.lastFailure\n        });\n      }\n    }\n    \n    return {\n      totalBreakers: this.globalMetrics.totalBreakers,\n      healthyBreakers: this.globalMetrics.closedBreakers,\n      unhealthyBreakers: unhealthyBreakers.length,\n      details: unhealthyBreakers\n    };\n  }\n  \n  // Bulk operations\n  resetAll() {\n    for (const breaker of this.breakers.values()) {\n      breaker.reset();\n    }\n    console.log('[CIRCUIT] All circuit breakers reset');\n  }\n  \n  forceCloseAll() {\n    for (const breaker of this.breakers.values()) {\n      if (breaker.state !== 'CLOSED') {\n        breaker.forceClosed('Bulk force close');\n      }\n    }\n    console.log('[CIRCUIT] All circuit breakers forced closed');\n  }\n}\n\n// Global instance\nexport const circuitBreakerManager = new CircuitBreakerManager();"