import { createLogger } from '../utils/logger.js';

const logger = createLogger('cache-manager');

/**
 * CacheManager - High-performance LRU cache with memory management
 */
export class CacheManager {
  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = new Map(); // Track access times for LRU
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0
    };
    
    // Memory estimation
    this.estimatedMemoryUsage = 0;
    this.maxMemoryBytes = 100 * 1024 * 1024; // 100MB default
  }

  /**
   * Initialize cache
   */
  async initialize() {
    logger.info('Initializing cache manager', {
      maxSize: this.maxSize,
      maxMemoryMB: Math.round(this.maxMemoryBytes / 1024 / 1024)
    });
    
    // Pre-warm cache structure for better performance
    this.cache = new Map();
    this.accessOrder = new Map();
    
    return true;
  }

  /**
   * Get value from cache
   */
  get(key) {
    if (this.cache.has(key)) {
      // Update access time
      this.accessOrder.set(key, Date.now());
      this.stats.hits++;
      
      return this.cache.get(key);
    }
    
    this.stats.misses++;
    return null;
  }

  /**
   * Set value in cache
   */
  set(key, value) {
    const size = this.estimateSize(value);
    
    // Check if we need to evict
    if (this.cache.size >= this.maxSize || 
        this.estimatedMemoryUsage + size > this.maxMemoryBytes) {
      this.evictLRU();
    }
    
    this.cache.set(key, value);
    this.accessOrder.set(key, Date.now());
    this.estimatedMemoryUsage += size;
    this.stats.sets++;
  }

  /**
   * Check if key exists
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Delete from cache
   */
  delete(key) {
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      const size = this.estimateSize(value);
      
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.estimatedMemoryUsage -= size;
      
      return true;
    }
    
    return false;
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.accessOrder.clear();
    this.estimatedMemoryUsage = 0;
    
    logger.info('Cache cleared');
  }

  /**
   * Get cache size
   */
  size() {
    return this.cache.size;
  }

  /**
   * Get all keys
   */
  keys() {
    return this.cache.keys();
  }

  /**
   * Evict least recently used items
   */
  evictLRU(count = 1) {
    // Sort by access time
    const sorted = Array.from(this.accessOrder.entries())
      .sort((a, b) => a[1] - b[1]);
    
    let evicted = 0;
    for (let i = 0; i < Math.min(count, sorted.length); i++) {
      const [key] = sorted[i];
      
      const value = this.cache.get(key);
      const size = this.estimateSize(value);
      
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.estimatedMemoryUsage -= size;
      
      evicted++;
      this.stats.evictions++;
    }
    
    if (evicted > 0) {
      logger.debug(`Evicted ${evicted} items from cache`);
    }
  }

  /**
   * Estimate memory size of value
   */
  estimateSize(value) {
    if (value === null || value === undefined) {
      return 8;
    }
    
    const type = typeof value;
    
    switch (type) {
      case 'number':
        return 8;
      case 'string':
        return value.length * 2; // UTF-16
      case 'boolean':
        return 4;
      case 'object':
        if (Array.isArray(value)) {
          return value.reduce((sum, item) => sum + this.estimateSize(item), 24);
        } else if (value instanceof Date) {
          return 24;
        } else {
          // Estimate object size
          let size = 24; // Object overhead
          for (const key in value) {
            size += this.estimateSize(key);
            size += this.estimateSize(value[key]);
          }
          return size;
        }
      default:
        return 24;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 ?
      (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) : 0;
    
    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      size: this.cache.size,
      memoryUsageMB: (this.estimatedMemoryUsage / 1024 / 1024).toFixed(2),
      memoryLimitMB: (this.maxMemoryBytes / 1024 / 1024).toFixed(2)
    };
  }

  /**
   * Batch get multiple keys
   */
  getBatch(keys) {
    const results = new Map();
    
    for (const key of keys) {
      const value = this.get(key);
      if (value !== null) {
        results.set(key, value);
      }
    }
    
    return results;
  }

  /**
   * Batch set multiple key-value pairs
   */
  setBatch(entries) {
    for (const [key, value] of entries) {
      this.set(key, value);
    }
  }

  /**
   * Get cache entries by pattern
   */
  getByPattern(pattern) {
    const results = new Map();
    const regex = new RegExp(pattern);
    
    for (const [key, value] of this.cache) {
      if (regex.test(key)) {
        results.set(key, value);
        // Update access time
        this.accessOrder.set(key, Date.now());
      }
    }
    
    return results;
  }

  /**
   * Warm cache with initial data
   */
  async warmCache(dataLoader, keys) {
    logger.info(`Warming cache with ${keys.length} keys`);
    
    const batchSize = 100;
    let loaded = 0;
    
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      const data = await dataLoader(batch);
      
      for (const [key, value] of data) {
        this.set(key, value);
        loaded++;
      }
      
      logger.debug(`Loaded ${loaded}/${keys.length} cache entries`);
    }
    
    return loaded;
  }

  /**
   * Create partitioned cache for better performance
   */
  static createPartitionedCache(partitions = 4, maxSizePerPartition = 2500) {
    const caches = [];
    
    for (let i = 0; i < partitions; i++) {
      caches.push(new CacheManager(maxSizePerPartition));
    }
    
    return {
      get(key) {
        const partition = this.getPartition(key);
        return caches[partition].get(key);
      },
      
      set(key, value) {
        const partition = this.getPartition(key);
        return caches[partition].set(key, value);
      },
      
      getPartition(key) {
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
          hash = ((hash << 5) - hash) + key.charCodeAt(i);
          hash = hash & hash;
        }
        return Math.abs(hash) % partitions;
      },
      
      getStats() {
        const aggregated = {
          hits: 0,
          misses: 0,
          evictions: 0,
          sets: 0,
          size: 0,
          memoryUsageMB: 0
        };
        
        for (const cache of caches) {
          const stats = cache.getStats();
          aggregated.hits += stats.hits;
          aggregated.misses += stats.misses;
          aggregated.evictions += stats.evictions;
          aggregated.sets += stats.sets;
          aggregated.size += stats.size;
          aggregated.memoryUsageMB += parseFloat(stats.memoryUsageMB);
        }
        
        const hitRate = aggregated.hits + aggregated.misses > 0 ?
          (aggregated.hits / (aggregated.hits + aggregated.misses) * 100).toFixed(2) : 0;
        
        return {
          ...aggregated,
          hitRate: `${hitRate}%`,
          partitions: partitions
        };
      },
      
      clear() {
        for (const cache of caches) {
          cache.clear();
        }
      }
    };
  }

  /**
   * Time-based cache entries
   */
  setWithTTL(key, value, ttlMs) {
    const expiry = Date.now() + ttlMs;
    
    this.set(key, {
      value,
      expiry,
      ttl: ttlMs
    });
    
    // Schedule cleanup
    setTimeout(() => {
      if (this.cache.has(key)) {
        const entry = this.cache.get(key);
        if (entry && entry.expiry <= Date.now()) {
          this.delete(key);
        }
      }
    }, ttlMs);
  }

  /**
   * Get value with TTL check
   */
  getWithTTL(key) {
    const entry = this.get(key);
    
    if (entry && entry.expiry) {
      if (entry.expiry > Date.now()) {
        return entry.value;
      } else {
        // Expired
        this.delete(key);
        return null;
      }
    }
    
    return entry;
  }
}

export default CacheManager;