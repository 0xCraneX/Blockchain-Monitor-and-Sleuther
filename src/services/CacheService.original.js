import { createLogger } from '../utils/logger.js';

const logger = createLogger('CacheService');

export class CacheService {
  constructor(ttlSeconds = 300) {
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

    logger.info('CacheService initialized', { ttlSeconds });
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
   * Set a value in cache
   */
  set(key, value, ttlOverride = null) {
    const ttl = ttlOverride !== null ? ttlOverride * 1000 : this.ttl;
    const expiry = Date.now() + ttl;

    this.cache.set(key, { value, expiry });
    this.stats.sets++;

    // Limit cache size
    if (this.cache.size > 10000) {
      this.cleanup();
    }
  }

  /**
   * Check if key exists and is not expired
   */
  has(key) {
    const value = this.get(key);
    return value !== null;
  }

  /**
   * Delete a key from cache
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    logger.info('Cache cleared', { entriesRemoved: size });
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.stats.evictions += removed;
      logger.debug('Cache cleanup completed', { removed, remaining: this.cache.size });
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0
    };
  }

  /**
   * Destroy the cache service
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
    logger.info('CacheService destroyed');
  }
}

// Singleton instances for different cache types
export const accountCache = new CacheService(300); // 5 minutes
export const transferCache = new CacheService(600); // 10 minutes
export const graphCache = new CacheService(120); // 2 minutes