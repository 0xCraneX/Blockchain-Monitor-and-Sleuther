import { performance } from 'perf_hooks';
import v8 from 'v8';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('performance-optimizer');

/**
 * PerformanceOptimizer - Manages performance optimizations and monitoring
 */
export class PerformanceOptimizer {
  constructor(options = {}) {
    this.options = options;
    this.optimizations = new Map();
    this.benchmarks = new Map();
    
    // Performance thresholds
    this.thresholds = {
      memoryUsagePercent: 80,
      cpuUsagePercent: 90,
      gcFrequencyMs: 10000,
      slowOperationMs: 100
    };
    
    // Optimization strategies
    this.strategies = {
      memory: ['compress', 'evict', 'stream'],
      cpu: ['parallel', 'cache', 'defer'],
      io: ['batch', 'async', 'compress']
    };
    
    this.lastGC = Date.now();
    this.gcCount = 0;
  }

  /**
   * Profile a function execution
   */
  async profile(name, fn, metadata = {}) {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    const startCpu = process.cpuUsage();
    
    try {
      const result = await fn();
      
      const endTime = performance.now();
      const endMemory = process.memoryUsage();
      const endCpu = process.cpuUsage();
      
      const profile = {
        name,
        duration: endTime - startTime,
        memory: {
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          external: endMemory.external - startMemory.external,
          rss: endMemory.rss - startMemory.rss
        },
        cpu: {
          user: (endCpu.user - startCpu.user) / 1000, // Convert to ms
          system: (endCpu.system - startCpu.system) / 1000
        },
        metadata,
        timestamp: Date.now()
      };
      
      this.recordBenchmark(name, profile);
      
      return { result, profile };
      
    } catch (error) {
      logger.error(`Error profiling ${name}`, error);
      throw error;
    }
  }

  /**
   * Record benchmark data
   */
  recordBenchmark(name, profile) {
    if (!this.benchmarks.has(name)) {
      this.benchmarks.set(name, []);
    }
    
    const benchmarks = this.benchmarks.get(name);
    benchmarks.push(profile);
    
    // Keep only last 100 benchmarks
    if (benchmarks.length > 100) {
      benchmarks.shift();
    }
    
    // Check if optimization needed
    this.checkOptimizationNeeded(name, profile);
  }

  /**
   * Check if optimization is needed based on profile
   */
  checkOptimizationNeeded(name, profile) {
    // Check for slow operations
    if (profile.duration > this.thresholds.slowOperationMs) {
      this.suggestOptimization(name, 'cpu', {
        reason: 'slow_operation',
        duration: profile.duration,
        threshold: this.thresholds.slowOperationMs
      });
    }
    
    // Check for high memory allocation
    if (profile.memory.heapUsed > 50 * 1024 * 1024) { // 50MB
      this.suggestOptimization(name, 'memory', {
        reason: 'high_allocation',
        allocated: profile.memory.heapUsed,
        threshold: 50 * 1024 * 1024
      });
    }
  }

  /**
   * Suggest optimization for a specific operation
   */
  suggestOptimization(operation, type, details) {
    const optimization = {
      operation,
      type,
      strategies: this.strategies[type] || [],
      details,
      timestamp: Date.now()
    };
    
    this.optimizations.set(`${operation}:${type}`, optimization);
    
    logger.debug('Optimization suggested', optimization);
  }

  /**
   * Get optimization suggestions
   */
  getOptimizationSuggestions() {
    const suggestions = [];
    
    for (const [key, optimization] of this.optimizations) {
      suggestions.push({
        ...optimization,
        age: Date.now() - optimization.timestamp
      });
    }
    
    return suggestions.sort((a, b) => b.details.duration - a.details.duration);
  }

  /**
   * Apply automatic optimizations
   */
  applyAutomaticOptimizations() {
    const memUsage = process.memoryUsage();
    const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    // Force GC if memory usage is high
    if (heapPercent > this.thresholds.memoryUsagePercent) {
      this.forceGarbageCollection();
    }
    
    // Apply V8 optimizations
    this.applyV8Optimizations();
  }

  /**
   * Force garbage collection
   */
  forceGarbageCollection() {
    const timeSinceLastGC = Date.now() - this.lastGC;
    
    if (global.gc && timeSinceLastGC > this.thresholds.gcFrequencyMs) {
      const before = process.memoryUsage();
      global.gc();
      const after = process.memoryUsage();
      
      const freed = before.heapUsed - after.heapUsed;
      this.lastGC = Date.now();
      this.gcCount++;
      
      logger.debug('Forced garbage collection', {
        freed: Math.round(freed / 1024 / 1024) + 'MB',
        count: this.gcCount
      });
    }
  }

  /**
   * Apply V8-specific optimizations
   */
  applyV8Optimizations() {
    // Set heap size limits based on configuration
    if (this.options.maxMemoryMB) {
      const maxHeap = this.options.maxMemoryMB * 0.8; // Leave 20% buffer
      v8.setFlagsFromString(`--max-old-space-size=${Math.floor(maxHeap)}`);
    }
    
    // Enable optimization for concurrent marking
    v8.setFlagsFromString('--optimize-for-size');
    
    // Optimize for predictable performance
    v8.setFlagsFromString('--predictable-gc-schedule');
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(operation = null) {
    const stats = {};
    
    if (operation) {
      const benchmarks = this.benchmarks.get(operation);
      if (benchmarks && benchmarks.length > 0) {
        stats[operation] = this.calculateStats(benchmarks);
      }
    } else {
      for (const [name, benchmarks] of this.benchmarks) {
        stats[name] = this.calculateStats(benchmarks);
      }
    }
    
    return stats;
  }

  /**
   * Calculate statistics for benchmarks
   */
  calculateStats(benchmarks) {
    const durations = benchmarks.map(b => b.duration);
    const memoryUsage = benchmarks.map(b => b.memory.heapUsed);
    
    return {
      count: benchmarks.length,
      duration: {
        avg: this.average(durations),
        min: Math.min(...durations),
        max: Math.max(...durations),
        p95: this.percentile(durations, 95),
        p99: this.percentile(durations, 99)
      },
      memory: {
        avg: this.average(memoryUsage),
        min: Math.min(...memoryUsage),
        max: Math.max(...memoryUsage)
      }
    };
  }

  /**
   * Optimize array operations
   */
  static optimizeArray(array, operation) {
    // Use typed arrays for numeric data
    if (array.every(item => typeof item === 'number')) {
      if (array.every(item => Number.isInteger(item))) {
        return new Int32Array(array);
      } else {
        return new Float64Array(array);
      }
    }
    
    // Pre-allocate for known sizes
    if (operation === 'map' || operation === 'filter') {
      const result = new Array(array.length);
      return result;
    }
    
    return array;
  }

  /**
   * Optimize object creation
   */
  static createOptimizedObject(template) {
    // Use object pool for frequently created objects
    const proto = Object.create(null);
    for (const key in template) {
      proto[key] = template[key];
    }
    
    return () => Object.create(proto);
  }

  /**
   * Calculate average
   */
  average(numbers) {
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }

  /**
   * Calculate percentile
   */
  percentile(numbers, p) {
    const sorted = numbers.slice().sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Create optimized data structure
   */
  static createOptimizedMap(initialSize = 1000) {
    // Pre-size map for better performance
    const map = new Map();
    
    // V8 optimization: pre-allocate internal storage
    for (let i = 0; i < Math.min(initialSize, 100); i++) {
      map.set(`__temp_${i}`, null);
    }
    
    for (let i = 0; i < Math.min(initialSize, 100); i++) {
      map.delete(`__temp_${i}`);
    }
    
    return map;
  }

  /**
   * Batch operations for better performance
   */
  static batchOperations(items, batchSize, operation) {
    const results = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      results.push(...operation(batch));
    }
    
    return results;
  }

  /**
   * Memoize expensive functions
   */
  static memoize(fn, maxCacheSize = 1000) {
    const cache = new Map();
    
    return (...args) => {
      const key = JSON.stringify(args);
      
      if (cache.has(key)) {
        return cache.get(key);
      }
      
      const result = fn(...args);
      
      // Implement LRU eviction
      if (cache.size >= maxCacheSize) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
      
      cache.set(key, result);
      return result;
    };
  }
}

export default PerformanceOptimizer;