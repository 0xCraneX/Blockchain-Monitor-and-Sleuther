import v8 from 'v8';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('memory-manager');

/**
 * MemoryManager - Monitor and manage memory usage
 */
export class MemoryManager {
  constructor(maxMemoryMB = 100) {
    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024;
    this.warningThreshold = 0.8; // 80% of max
    this.criticalThreshold = 0.9; // 90% of max
    
    this.monitoring = false;
    this.monitorInterval = null;
    this.gcInterval = null;
    
    this.stats = {
      peakUsage: 0,
      gcCount: 0,
      warningCount: 0,
      criticalCount: 0
    };
    
    this.listeners = new Set();
  }

  /**
   * Start memory monitoring
   */
  startMonitoring(intervalMs = 5000) {
    if (this.monitoring) return;
    
    this.monitoring = true;
    
    // Monitor memory usage
    this.monitorInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, intervalMs);
    
    // Periodic GC if available
    if (global.gc) {
      this.gcInterval = setInterval(() => {
        this.performGarbageCollection();
      }, 30000); // Every 30 seconds
    }
    
    logger.info('Memory monitoring started', {
      maxMemoryMB: Math.round(this.maxMemoryBytes / 1024 / 1024),
      interval: intervalMs
    });
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring() {
    this.monitoring = false;
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }
    
    logger.info('Memory monitoring stopped');
  }

  /**
   * Check current memory usage
   */
  checkMemoryUsage() {
    const usage = process.memoryUsage();
    const currentUsage = usage.heapUsed;
    const usagePercent = currentUsage / this.maxMemoryBytes;
    
    // Update peak usage
    if (currentUsage > this.stats.peakUsage) {
      this.stats.peakUsage = currentUsage;
    }
    
    // Check thresholds
    if (usagePercent > this.criticalThreshold) {
      this.stats.criticalCount++;
      this.handleCriticalMemory(usage);
    } else if (usagePercent > this.warningThreshold) {
      this.stats.warningCount++;
      this.handleWarningMemory(usage);
    }
    
    // Notify listeners
    this.notifyListeners({
      type: 'usage',
      usage,
      percent: usagePercent,
      stats: this.stats
    });
  }

  /**
   * Handle critical memory situation
   */
  handleCriticalMemory(usage) {
    logger.warn('Critical memory usage', {
      heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
      percent: Math.round((usage.heapUsed / this.maxMemoryBytes) * 100)
    });
    
    // Force immediate GC
    this.forceGarbageCollection();
    
    // Notify listeners for emergency cleanup
    this.notifyListeners({
      type: 'critical',
      usage,
      action: 'emergency_cleanup_required'
    });
  }

  /**
   * Handle warning memory situation
   */
  handleWarningMemory(usage) {
    logger.debug('Memory usage warning', {
      heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
      percent: Math.round((usage.heapUsed / this.maxMemoryBytes) * 100)
    });
    
    // Schedule GC
    this.scheduleGarbageCollection();
    
    // Notify listeners
    this.notifyListeners({
      type: 'warning',
      usage
    });
  }

  /**
   * Perform garbage collection
   */
  performGarbageCollection() {
    if (!global.gc) return;
    
    const before = process.memoryUsage();
    const startTime = Date.now();
    
    global.gc();
    
    const after = process.memoryUsage();
    const duration = Date.now() - startTime;
    
    const freed = before.heapUsed - after.heapUsed;
    this.stats.gcCount++;
    
    if (freed > 0) {
      logger.debug('Garbage collection completed', {
        freedMB: Math.round(freed / 1024 / 1024),
        duration,
        totalGCs: this.stats.gcCount
      });
    }
  }

  /**
   * Force immediate garbage collection
   */
  forceGarbageCollection() {
    if (!global.gc) {
      logger.warn('Garbage collection not available (run with --expose-gc)');
      return;
    }
    
    // Multiple GC passes for thorough cleanup
    for (let i = 0; i < 3; i++) {
      global.gc();
    }
  }

  /**
   * Schedule garbage collection
   */
  scheduleGarbageCollection(delayMs = 1000) {
    if (this.gcTimeout) return;
    
    this.gcTimeout = setTimeout(() => {
      this.performGarbageCollection();
      this.gcTimeout = null;
    }, delayMs);
  }

  /**
   * Get current memory usage
   */
  getCurrentUsage() {
    const usage = process.memoryUsage();
    return usage.heapUsed / 1024 / 1024; // Return in MB
  }

  /**
   * Get memory statistics
   */
  getStats() {
    const current = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    
    return {
      current: {
        heapUsedMB: Math.round(current.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(current.heapTotal / 1024 / 1024),
        rssMB: Math.round(current.rss / 1024 / 1024),
        externalMB: Math.round(current.external / 1024 / 1024),
        percent: Math.round((current.heapUsed / this.maxMemoryBytes) * 100)
      },
      heap: {
        totalHeapSizeMB: Math.round(heapStats.total_heap_size / 1024 / 1024),
        totalPhysicalSizeMB: Math.round(heapStats.total_physical_size / 1024 / 1024),
        usedHeapSizeMB: Math.round(heapStats.used_heap_size / 1024 / 1024),
        heapSizeLimitMB: Math.round(heapStats.heap_size_limit / 1024 / 1024)
      },
      stats: {
        peakUsageMB: Math.round(this.stats.peakUsage / 1024 / 1024),
        gcCount: this.stats.gcCount,
        warningCount: this.stats.warningCount,
        criticalCount: this.stats.criticalCount
      },
      limits: {
        maxMemoryMB: Math.round(this.maxMemoryBytes / 1024 / 1024),
        warningThresholdMB: Math.round(this.maxMemoryBytes * this.warningThreshold / 1024 / 1024),
        criticalThresholdMB: Math.round(this.maxMemoryBytes * this.criticalThreshold / 1024 / 1024)
      }
    };
  }

  /**
   * Check if near memory limit
   */
  isNearLimit() {
    const usage = process.memoryUsage();
    const percent = usage.heapUsed / this.maxMemoryBytes;
    return percent > this.warningThreshold;
  }

  /**
   * Check if at critical memory level
   */
  isCritical() {
    const usage = process.memoryUsage();
    const percent = usage.heapUsed / this.maxMemoryBytes;
    return percent > this.criticalThreshold;
  }

  /**
   * Add memory usage listener
   */
  addListener(callback) {
    this.listeners.add(callback);
  }

  /**
   * Remove memory usage listener
   */
  removeListener(callback) {
    this.listeners.delete(callback);
  }

  /**
   * Notify all listeners
   */
  notifyListeners(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        logger.error('Error in memory listener', error);
      }
    }
  }

  /**
   * Estimate object size in memory
   */
  static estimateSize(obj) {
    const seen = new WeakSet();
    
    function sizeOf(obj) {
      if (obj === null || obj === undefined) return 0;
      
      const type = typeof obj;
      
      switch (type) {
        case 'number':
          return 8;
        case 'string':
          return obj.length * 2; // UTF-16
        case 'boolean':
          return 4;
        case 'object':
          if (seen.has(obj)) return 0;
          seen.add(obj);
          
          if (Array.isArray(obj)) {
            return 24 + obj.reduce((sum, item) => sum + sizeOf(item), 0);
          } else if (obj instanceof Date) {
            return 24;
          } else if (obj instanceof Map) {
            let size = 24;
            for (const [key, value] of obj) {
              size += sizeOf(key) + sizeOf(value);
            }
            return size;
          } else if (obj instanceof Set) {
            let size = 24;
            for (const value of obj) {
              size += sizeOf(value);
            }
            return size;
          } else {
            let size = 24;
            for (const key in obj) {
              if (obj.hasOwnProperty(key)) {
                size += sizeOf(key) + sizeOf(obj[key]);
              }
            }
            return size;
          }
        default:
          return 24;
      }
    }
    
    return sizeOf(obj);
  }

  /**
   * Create memory snapshot
   */
  createSnapshot() {
    const snapshot = v8.writeHeapSnapshot();
    const timestamp = new Date().toISOString();
    
    return {
      timestamp,
      snapshot,
      stats: this.getStats()
    };
  }

  /**
   * Optimize memory settings
   */
  optimizeMemorySettings() {
    // Set V8 heap limit based on our max memory
    const heapLimit = Math.floor(this.maxMemoryBytes * 0.9 / 1024 / 1024);
    v8.setFlagsFromString(`--max-old-space-size=${heapLimit}`);
    
    // Enable memory optimization flags
    v8.setFlagsFromString('--optimize-for-size');
    v8.setFlagsFromString('--gc-interval=100');
    
    logger.info('Memory settings optimized', {
      heapLimitMB: heapLimit
    });
  }
}

export default MemoryManager;