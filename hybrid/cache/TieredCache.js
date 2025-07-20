import fs from 'fs/promises';
import path from 'path';

export class TieredCache {
  constructor(config = {}) {
    this.config = {
      l1TTL: config.l1TTL || 30000,    // 30 seconds
      l2TTL: config.l2TTL || 300000,   // 5 minutes  
      l3TTL: config.l3TTL || 3600000,  // 1 hour
      l2MaxSize: config.l2MaxSize || 5000,
      l3Path: config.l3Path || './hybrid/cache/data',
      ...config
    };
    
    // L1: Hot cache - fastest access, shortest TTL
    this.l1 = new Map();
    
    // L2: Warm cache - medium access, medium TTL
    this.l2 = new LRUCache(this.config.l2MaxSize);
    
    // L3: Cold cache - file-based, longest TTL
    this.l3Path = this.config.l3Path;
    
    // Metrics
    this.metrics = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
      l3Hits: 0,
      l3Misses: 0,
      totalGets: 0,
      totalSets: 0,
      evictions: 0
    };
    
    this.initializeFileCache();
    this.startCleanupTimer();
    
    console.log('[CACHE] TieredCache initialized', {
      l1TTL: this.config.l1TTL,
      l2TTL: this.config.l2TTL,
      l3TTL: this.config.l3TTL,
      l2MaxSize: this.config.l2MaxSize
    });
  }
  
  async initializeFileCache() {
    try {
      await fs.mkdir(this.l3Path, { recursive: true });
    } catch (error) {
      console.error('[CACHE] Failed to create cache directory:', error.message);
    }
  }
  
  startCleanupTimer() {
    // Clean up expired entries every minute
    setInterval(() => {
      this.cleanup();
    }, 60000);
  }
  
  async get(key, fetchFn = null) {
    this.metrics.totalGets++;
    
    // Try L1 first (hottest)
    const l1Value = this.l1.get(key);
    if (l1Value && !this.isExpired(l1Value)) {
      this.metrics.l1Hits++;
      return l1Value.data;
    } else if (l1Value) {
      this.l1.delete(key);
    }
    
    // Try L2 (warm)
    const l2Value = this.l2.get(key);
    if (l2Value && !this.isExpired(l2Value)) {
      this.metrics.l2Hits++;
      
      // Promote to L1
      this.setL1(key, l2Value.data, this.config.l1TTL);
      
      return l2Value.data;
    } else if (l2Value) {
      this.l2.delete(key);
    }
    
    // Try L3 (cold/file-based)
    const l3Value = await this.getL3(key);
    if (l3Value && !this.isExpired(l3Value)) {
      this.metrics.l3Hits++;
      
      // Promote to L2 and L1
      this.setL2(key, l3Value.data, this.config.l2TTL);
      this.setL1(key, l3Value.data, this.config.l1TTL);
      
      return l3Value.data;
    }
    
    // Cache miss - fetch if function provided
    if (fetchFn) {
      try {
        const data = await fetchFn();
        if (data !== null && data !== undefined) {
          await this.set(key, data);
          return data;
        }
      } catch (error) {
        console.error(`[CACHE] Fetch function failed for key ${key}:`, error.message);
      }
    }
    
    // Record misses
    this.metrics.l1Misses++;
    this.metrics.l2Misses++;
    this.metrics.l3Misses++;
    
    return null;
  }
  
  async set(key, data, ttl = null) {
    this.metrics.totalSets++;
    
    const l1TTL = ttl || this.config.l1TTL;
    const l2TTL = ttl || this.config.l2TTL;
    const l3TTL = ttl || this.config.l3TTL;
    
    // Set in all tiers
    this.setL1(key, data, l1TTL);
    this.setL2(key, data, l2TTL);
    await this.setL3(key, data, l3TTL);
  }
  
  setL1(key, data, ttl) {
    this.l1.set(key, {
      data,
      expiry: Date.now() + ttl,
      tier: 'L1'
    });
  }
  
  setL2(key, data, ttl) {
    this.l2.set(key, {
      data,
      expiry: Date.now() + ttl,
      tier: 'L2'
    });
  }
  
  async setL3(key, data, ttl) {
    try {
      const cacheEntry = {
        data,
        expiry: Date.now() + ttl,
        tier: 'L3',
        created: Date.now()
      };
      
      const filePath = this.getL3FilePath(key);
      await fs.writeFile(filePath, JSON.stringify(cacheEntry), 'utf8');
    } catch (error) {
      console.error(`[CACHE] Failed to write L3 cache for key ${key}:`, error.message);
    }
  }
  
  async getL3(key) {
    try {
      const filePath = this.getL3FilePath(key);
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      // File doesn't exist or can't be read
      return null;
    }
  }
  
  getL3FilePath(key) {
    // Create safe filename from cache key
    const safeKey = key.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.l3Path, `${safeKey}.json`);
  }
  
  isExpired(cacheEntry) {
    return cacheEntry.expiry < Date.now();
  }
  
  async delete(key) {
    // Remove from all tiers
    this.l1.delete(key);
    this.l2.delete(key);
    
    try {
      const filePath = this.getL3FilePath(key);
      await fs.unlink(filePath);
    } catch (error) {
      // File might not exist
    }
  }
  
  cleanup() {
    let cleaned = 0;
    
    // Clean L1
    for (const [key, value] of this.l1.entries()) {
      if (this.isExpired(value)) {
        this.l1.delete(key);
        cleaned++;
      }
    }
    
    // Clean L2
    for (const [key, value] of this.l2.entries()) {
      if (this.isExpired(value)) {
        this.l2.delete(key);
        cleaned++;
      }
    }
    
    // Clean L3 files
    this.cleanupL3Files();
    
    if (cleaned > 0) {
      console.log(`[CACHE] Cleaned up ${cleaned} expired entries`);
      this.metrics.evictions += cleaned;
    }
  }
  
  async cleanupL3Files() {
    try {
      const files = await fs.readdir(this.l3Path);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.l3Path, file);
          
          try {
            const content = await fs.readFile(filePath, 'utf8');
            const cacheEntry = JSON.parse(content);
            
            if (this.isExpired(cacheEntry)) {
              await fs.unlink(filePath);
            }
          } catch (error) {
            // Invalid file, remove it
            await fs.unlink(filePath);
          }
        }
      }
    } catch (error) {
      console.error('[CACHE] Error during L3 cleanup:', error.message);
    }
  }
  
  getMetrics() {
    const l1Size = this.l1.size;
    const l2Size = this.l2.size();
    
    const hitRate = this.metrics.totalGets > 0 ? 
      ((this.metrics.l1Hits + this.metrics.l2Hits + this.metrics.l3Hits) / this.metrics.totalGets) * 100 : 0;
    
    return {
      sizes: {
        l1: l1Size,
        l2: l2Size,
        l3: 'file-based'
      },
      
      hits: {
        l1: this.metrics.l1Hits,
        l2: this.metrics.l2Hits,
        l3: this.metrics.l3Hits,
        total: this.metrics.l1Hits + this.metrics.l2Hits + this.metrics.l3Hits
      },
      
      misses: {
        l1: this.metrics.l1Misses,
        l2: this.metrics.l2Misses,
        l3: this.metrics.l3Misses,
        total: this.metrics.l1Misses + this.metrics.l2Misses + this.metrics.l3Misses
      },
      
      operations: {
        gets: this.metrics.totalGets,
        sets: this.metrics.totalSets,
        evictions: this.metrics.evictions
      },
      
      performance: {
        hitRate: hitRate.toFixed(2) + '%',
        l1HitRate: this.metrics.totalGets > 0 ? 
          ((this.metrics.l1Hits / this.metrics.totalGets) * 100).toFixed(2) + '%' : '0%'
      }
    };
  }
  
  // Utility method for cache warming
  async warmup(keyValuePairs) {
    console.log(`[CACHE] Warming up cache with ${keyValuePairs.length} entries`);
    
    for (const [key, value] of keyValuePairs) {
      await this.set(key, value);
    }
    
    console.log('[CACHE] Cache warmup complete');
  }
  
  // Clear all caches (useful for testing)
  async clear() {
    this.l1.clear();
    this.l2.clear();
    
    try {
      const files = await fs.readdir(this.l3Path);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(this.l3Path, file));
        }
      }
    } catch (error) {
      console.error('[CACHE] Error clearing L3 cache:', error.message);
    }
  }
}

// Simple LRU Cache implementation
class LRUCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }
  
  get(key) {
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }
  
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, value);
  }
  
  delete(key) {
    return this.cache.delete(key);
  }
  
  clear() {
    this.cache.clear();
  }
  
  size() {
    return this.cache.size;
  }
  
  entries() {
    return this.cache.entries();
  }
}