/**
 * Base Service Class
 * 
 * Provides common functionality for all services to eliminate code duplication
 */

import { createLogger, logMethodEntry, logMethodExit, logError, startPerformanceTimer, endPerformanceTimer } from '../utils/logger.js';

export class BaseService {
  constructor(name, dependencies = {}) {
    this.name = name;
    this.logger = createLogger(name);
    this.dependencies = dependencies;
    
    // Extract common dependencies
    this.db = dependencies.db || dependencies.database || dependencies.databaseService;
    this.cache = dependencies.cache || dependencies.cacheService;
    this.blockchain = dependencies.blockchain || dependencies.blockchainService;
    
    // Performance tracking
    this.performanceTrackers = new Map();
    
    // Initialize
    this.logger.info(`${name} initialized`, { 
      hasDatabaseConnection: !!this.db,
      hasCacheService: !!this.cache,
      hasBlockchainConnection: !!this.blockchain
    });
  }

  /**
   * Execute a method with automatic logging, error handling, and performance tracking
   */
  async execute(methodName, operation, ...args) {
    const trackerId = logMethodEntry(this.name, methodName, args[0]);
    const timer = startPerformanceTimer(`${this.name}_${methodName}`);
    
    try {
      const result = await operation.call(this, ...args);
      
      endPerformanceTimer(timer, `${this.name}_${methodName}`);
      logMethodExit(this.name, methodName, trackerId);
      
      return result;
    } catch (error) {
      logError(error, {
        service: this.name,
        method: methodName,
        args: args[0]
      });
      
      // Re-throw with context
      error.service = this.name;
      error.method = methodName;
      throw error;
    }
  }

  /**
   * Execute a database query with logging and error handling
   */
  async executeQuery(queryName, query, params = {}) {
    if (!this.db) {
      throw new Error(`Database not available in ${this.name}`);
    }
    
    const timer = startPerformanceTimer(`query_${queryName}`);
    
    try {
      this.logger.debug(`Executing query: ${queryName}`, { params });
      
      let result;
      if (typeof query === 'string') {
        // Raw SQL query
        const stmt = this.db.prepare ? this.db.prepare(query) : this.db.db.prepare(query);
        result = params ? stmt.all(params) : stmt.all();
      } else if (typeof query === 'function') {
        // Query builder function
        result = await query(params);
      } else {
        // Prepared statement
        result = params ? query.all(params) : query.all();
      }
      
      const duration = endPerformanceTimer(timer, `query_${queryName}`);
      
      this.logger.debug(`Query completed: ${queryName}`, {
        duration: `${duration}ms`,
        rowCount: Array.isArray(result) ? result.length : 1
      });
      
      return result;
    } catch (error) {
      this.logger.error(`Query failed: ${queryName}`, { error: error.message, params });
      throw error;
    }
  }

  /**
   * Get or set cache with automatic serialization
   */
  async cacheOperation(key, operation, options = {}) {
    if (!this.cache) {
      // No cache available, execute operation directly
      return await operation();
    }
    
    const { ttl = 300, force = false } = options;
    
    // Check cache first unless forced
    if (!force) {
      try {
        const cached = await this.cache.get(key);
        if (cached !== null && cached !== undefined) {
          this.logger.debug(`Cache hit: ${key}`);
          return cached;
        }
      } catch (error) {
        this.logger.warn(`Cache get error for ${key}:`, error.message);
      }
    }
    
    // Execute operation
    const result = await operation();
    
    // Cache the result
    try {
      await this.cache.set(key, result, ttl);
      this.logger.debug(`Cache set: ${key}`, { ttl });
    } catch (error) {
      this.logger.warn(`Cache set error for ${key}:`, error.message);
    }
    
    return result;
  }

  /**
   * Batch operation with chunking
   */
  async batchOperation(items, operation, options = {}) {
    const { batchSize = 100, concurrency = 5 } = options;
    
    const results = [];
    const errors = [];
    
    // Process in batches
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      // Process batch with limited concurrency
      const batchPromises = batch.map((item, index) => 
        operation(item, i + index)
          .then(result => ({ success: true, result, index: i + index }))
          .catch(error => ({ success: false, error, index: i + index, item }))
      );
      
      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Separate successes and failures
      batchResults.forEach(result => {
        if (result.success) {
          results[result.index] = result.result;
        } else {
          errors.push(result);
        }
      });
      
      // Log progress
      this.logger.debug(`Batch progress: ${i + batch.length}/${items.length}`);
    }
    
    if (errors.length > 0) {
      this.logger.warn(`Batch operation completed with ${errors.length} errors`);
    }
    
    return { results, errors };
  }

  /**
   * Validate input using a schema
   */
  validate(data, schema) {
    try {
      return schema.parse(data);
    } catch (error) {
      this.logger.warn('Validation failed', { 
        error: error.message,
        data: JSON.stringify(data).substring(0, 200) 
      });
      throw error;
    }
  }

  /**
   * Check if service is properly initialized
   */
  ensureInitialized() {
    if (this.db && !this.db.isInitialized) {
      throw new Error(`${this.name}: Database not initialized`);
    }
    
    if (this.blockchain && !this.blockchain.isConnected) {
      throw new Error(`${this.name}: Blockchain not connected`);
    }
    
    return true;
  }

  /**
   * Get service metrics
   */
  getMetrics() {
    const metrics = {
      service: this.name,
      performanceTrackers: this.performanceTrackers.size,
      hasDatabaseConnection: !!this.db,
      hasCacheService: !!this.cache,
      hasBlockchainConnection: !!this.blockchain
    };
    
    // Add cache metrics if available
    if (this.cache && typeof this.cache.getMetrics === 'function') {
      metrics.cache = this.cache.getMetrics();
    }
    
    return metrics;
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    this.logger.info(`Cleaning up ${this.name}`);
    
    // Clear performance trackers
    this.performanceTrackers.clear();
    
    // Close database connections if owned by this service
    if (this.db && typeof this.db.close === 'function') {
      try {
        await this.db.close();
      } catch (error) {
        this.logger.warn('Error closing database connection', error);
      }
    }
    
    // Disconnect from blockchain if owned by this service
    if (this.blockchain && typeof this.blockchain.disconnect === 'function') {
      try {
        await this.blockchain.disconnect();
      } catch (error) {
        this.logger.warn('Error disconnecting from blockchain', error);
      }
    }
  }
}