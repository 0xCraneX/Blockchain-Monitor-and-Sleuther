/**
 * CacheService - In-memory cache with TTL support
 * Refactored to use BaseService for common functionality
 */

import { BaseService } from './BaseService.js';

export class CacheService extends BaseService {
  constructor(ttlSeconds = 300) {
    super('CacheService');
    
    this.cache = new Map();
    this.ttl = ttlSeconds * 1000; // Convert to milliseconds
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };

    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get a value from cache
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in cache with automatic error handling
   */
  async set(key, value, ttlOverride = null) {
    return this.execute('set', async () => {
      const ttl = ttlOverride !== null ? ttlOverride * 1000 : this.ttl;
      const expiry = Date.now() + ttl;

      this.cache.set(key, {
        value,
        expiry,
        createdAt: Date.now()
      });

      this.stats.sets++;
      return true;
    }, key, ttlOverride);
  }

  /**
   * Delete a key from cache with logging
   */
  async delete(key) {
    return this.execute('delete', async () => {
      const existed = this.cache.has(key);
      this.cache.delete(key);
      
      if (existed) {
        this.stats.evictions++;
      }
      
      return existed;
    }, key);
  }

  /**
   * Clear all cache entries with logging
   */
  async clear() {
    return this.execute('clear', async () => {
      const size = this.cache.size;
      this.cache.clear();
      this.stats.evictions += size;
      
      return { cleared: size };
    });
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.stats.evictions += cleaned;
      this.logger.debug(`Cleaned up ${cleaned} expired cache entries`);
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics() {
    const metrics = super.getMetrics();
    
    return {
      ...metrics,
      cacheSize: this.cache.size,
      stats: { ...this.stats },
      hitRate: this.stats.hits + this.stats.misses > 0 
        ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmUp(frequentKeys, dataLoader) {
    return this.execute('warmUp', async () => {
      const results = {
        loaded: 0,
        failed: 0,
        errors: []
      };

      for (const key of frequentKeys) {
        try {
          const value = await dataLoader(key);
          if (value !== null && value !== undefined) {
            await this.set(key, value);
            results.loaded++;
          }
        } catch (error) {
          results.failed++;
          results.errors.push({ key, error: error.message });
        }
      }

      return results;
    }, frequentKeys.length);
  }

  /**
   * Get multiple values at once
   */
  async getMany(keys) {
    return this.execute('getMany', async () => {
      const results = {};
      
      for (const key of keys) {
        results[key] = this.get(key);
      }
      
      return results;
    }, keys.length);
  }

  /**
   * Set multiple values at once
   */
  async setMany(entries, ttlOverride = null) {
    return this.execute('setMany', async () => {
      const results = {
        success: 0,
        failed: 0,
        errors: []
      };

      for (const [key, value] of Object.entries(entries)) {
        try {
          await this.set(key, value, ttlOverride);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({ key, error: error.message });
        }
      }

      return results;
    }, Object.keys(entries).length);
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    await super.cleanup();
  }
}