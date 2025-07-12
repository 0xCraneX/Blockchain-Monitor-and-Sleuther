import { logger } from '../utils/logger.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class GraphCache {
  constructor(databaseService) {
    this.databaseService = databaseService || null;
    this.db = databaseService?.db || null;

    // Memory cache with LRU eviction
    this.memoryCache = new Map();
    this.accessOrder = new Map(); // Track access times for LRU
    this.maxMemoryItems = 1000;

    // Cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      writes: 0
    };

    // Default TTL values (in seconds)
    this.defaultTTL = {
      interactiveQuery: 300,    // 5 minutes
      graphData: 900,           // 15 minutes
      metrics: 1800,            // 30 minutes
      scores: 3600              // 1 hour
    };

    // Cache warming set - popular addresses to keep warm
    this.warmAddresses = new Set();

    // Initialize persistent cache table if database is available
    if (this.db) {
      this.initializePersistentCache();
    }
  }

  async initializePersistentCache() {
    try {
      // Create cache table for persistent storage
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS graph_cache (
          key TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          access_count INTEGER DEFAULT 0,
          last_accessed INTEGER
        )
      `);

      // Create index for expiration cleanup
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cache_expires 
        ON graph_cache(expires_at)
      `);

      // Create index for access patterns
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cache_access 
        ON graph_cache(last_accessed, access_count)
      `);

      // Prepare statements for better performance
      this.prepareStatements();

      // Clean expired entries on startup
      await this.cleanExpiredEntries();

      logger.info('GraphCache persistent storage initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize persistent cache');
      throw error;
    }
  }

  prepareStatements() {
    this.statements = {
      get: this.db.prepare(`
        SELECT data, metadata, expires_at 
        FROM graph_cache 
        WHERE key = ? AND expires_at > ?
      `),

      set: this.db.prepare(`
        INSERT OR REPLACE INTO graph_cache 
        (key, data, metadata, created_at, expires_at, access_count, last_accessed)
        VALUES (?, ?, ?, ?, ?, COALESCE((SELECT access_count FROM graph_cache WHERE key = ?), 0), ?)
      `),

      updateAccess: this.db.prepare(`
        UPDATE graph_cache 
        SET access_count = access_count + 1, last_accessed = ?
        WHERE key = ?
      `),

      delete: this.db.prepare(`
        DELETE FROM graph_cache WHERE key = ?
      `),

      deletePattern: this.db.prepare(`
        DELETE FROM graph_cache WHERE key LIKE ?
      `),

      cleanExpired: this.db.prepare(`
        DELETE FROM graph_cache WHERE expires_at <= ?
      `),

      getStats: this.db.prepare(`
        SELECT 
          COUNT(*) as total_entries,
          SUM(LENGTH(data)) as total_size,
          AVG(access_count) as avg_access_count
        FROM graph_cache
      `)
    };
  }

  /**
   * Cache graph data with specified TTL
   * @param {string} key - Cache key
   * @param {Object} graph - Graph data to cache
   * @param {number} ttl - Time to live in seconds
   * @param {Object} metadata - Optional metadata
   */
  async cacheGraph(key, graph, ttl = this.defaultTTL.graphData, metadata = {}) {
    try {
      const now = Date.now();
      const expiresAt = now + (ttl * 1000);

      const cacheEntry = {
        data: graph,
        metadata: {
          ...metadata,
          type: 'graph',
          nodeCount: graph.nodes?.length || 0,
          edgeCount: graph.edges?.length || 0,
          cached_at: now
        },
        expiresAt
      };

      // Determine storage strategy based on graph size
      const nodeCount = graph.nodes?.length || 0;

      if (nodeCount < 1000) {
        // Store in memory cache for small graphs
        this._setMemoryCache(key, cacheEntry);
      } else {
        // Store in persistent cache for large graphs
        const success = await this._setPersistentCache(key, cacheEntry);
        if (!success) {
          return false;
        }
      }

      this.stats.writes++;
      logger.debug({ key, nodeCount, ttl }, 'Graph cached');

      return true;
    } catch (error) {
      logger.error({ error, key }, 'Failed to cache graph');
      return false;
    }
  }

  /**
   * Retrieve cached graph data
   * @param {string} key - Cache key
   * @returns {Object|null} Cached graph or null if not found/expired
   */
  async getCachedGraph(key) {
    try {
      // Check memory cache first
      let entry = this._getMemoryCache(key);

      if (!entry && this.db) {
        // Check persistent cache
        entry = await this._getPersistentCache(key);

        // If found in persistent cache and small enough, promote to memory
        if (entry && entry.metadata?.nodeCount < 1000) {
          this._setMemoryCache(key, entry);
        }
      }

      if (entry) {
        this.stats.hits++;
        logger.debug({ key }, 'Cache hit');
        return entry.data;
      }

      this.stats.misses++;
      logger.debug({ key }, 'Cache miss');
      return null;
    } catch (error) {
      logger.error({ error, key }, 'Failed to retrieve cached graph');
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Cache query results
   * @param {string} query - Query string or identifier
   * @param {Object} result - Query result
   * @param {number} ttl - Time to live in seconds
   */
  async cacheQuery(query, result, ttl = this.defaultTTL.interactiveQuery) {
    const key = this.generateCacheKey({ type: 'query', query });

    const metadata = {
      type: 'query',
      query,
      resultSize: JSON.stringify(result).length
    };

    return this.cacheGraph(key, result, ttl, metadata);
  }

  /**
   * Invalidate all cache entries for a specific address
   * @param {string} address - Address to invalidate
   */
  async invalidateAddress(address) {
    try {
      const patterns = [
        `*:${address}:*`,
        `*:*:${address}`,
        `query:*${address}*`,
        `graph:${address}:*`,
        `metrics:${address}:*`,
        `path:*${address}*`
      ];

      let invalidatedCount = 0;

      // Clear from memory cache
      for (const [key, _entry] of this.memoryCache.entries()) {
        if (patterns.some(pattern => this._matchPattern(key, pattern))) {
          this.memoryCache.delete(key);
          this.accessOrder.delete(key);
          invalidatedCount++;
        }
      }

      // Clear from persistent cache
      if (this.db) {
        for (const pattern of patterns) {
          const sqlPattern = pattern.replace(/\*/g, '%');
          const result = this.statements.deletePattern.run(sqlPattern);
          invalidatedCount += result.changes;
        }
      }

      logger.info({ address, invalidatedCount }, 'Cache invalidated for address');
      return invalidatedCount;
    } catch (error) {
      logger.error({ error, address }, 'Failed to invalidate cache for address');
      return 0;
    }
  }

  /**
   * Generate consistent cache key from parameters
   * @param {Object} params - Parameters to generate key from
   * @returns {string} Generated cache key
   */
  generateCacheKey(params) {
    const { type, address, query, metric, path, ...options } = params;

    // Sort options for consistent key generation
    const sortedOptions = Object.keys(options)
      .sort()
      .map(key => `${key}:${options[key]}`)
      .join(',');

    const keyParts = [type];

    if (address) {
      keyParts.push(address);
    }
    if (query) {
      keyParts.push(this._hashString(query));
    }
    if (metric) {
      keyParts.push(metric);
    }
    if (path) {
      keyParts.push(this._hashString(JSON.stringify(path)));
    }
    if (sortedOptions) {
      keyParts.push(this._hashString(sortedOptions));
    }

    return keyParts.join(':');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  async getCacheStats() {
    try {
      const memoryStats = {
        entries: this.memoryCache.size,
        maxEntries: this.maxMemoryItems,
        utilizationPercent: Math.round((this.memoryCache.size / this.maxMemoryItems) * 100)
      };

      let persistentStats = {
        entries: 0,
        totalSize: 0,
        avgAccessCount: 0
      };

      if (this.db) {
        const dbStats = this.statements.getStats.get();
        persistentStats = {
          entries: dbStats.total_entries || 0,
          totalSize: dbStats.total_size || 0,
          avgAccessCount: Math.round(dbStats.avg_access_count || 0)
        };
      }

      const hitRate = this.stats.hits + this.stats.misses > 0
        ? Math.round((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100)
        : 0;

      return {
        performance: {
          hits: this.stats.hits,
          misses: this.stats.misses,
          hitRate: `${hitRate}%`,
          evictions: this.stats.evictions,
          writes: this.stats.writes
        },
        memory: memoryStats,
        persistent: persistentStats,
        warming: {
          addresses: this.warmAddresses.size
        }
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get cache stats');
      return null;
    }
  }

  /**
   * Add address to cache warming set
   * @param {string} address - Address to keep warm
   */
  addWarmAddress(address) {
    this.warmAddresses.add(address);
  }

  /**
   * Remove address from cache warming set
   * @param {string} address - Address to remove from warming
   */
  removeWarmAddress(address) {
    this.warmAddresses.delete(address);
  }

  /**
   * Warm cache for popular addresses
   * @param {Function} dataLoader - Function to load data for warming
   */
  async warmCache(dataLoader) {
    if (!dataLoader || this.warmAddresses.size === 0) {
      return;
    }

    logger.info({ count: this.warmAddresses.size }, 'Starting cache warming');

    for (const address of this.warmAddresses) {
      try {
        // Check if already cached
        const key = this.generateCacheKey({ type: 'graph', address });
        const cached = await this.getCachedGraph(key);

        if (!cached) {
          // Load and cache data
          const data = await dataLoader(address);
          if (data) {
            await this.cacheGraph(key, data, this.defaultTTL.graphData * 2); // Longer TTL for warmed data
          }
        }
      } catch (error) {
        logger.error({ error, address }, 'Failed to warm cache for address');
      }
    }

    logger.info('Cache warming completed');
  }

  /**
   * Clean expired entries from persistent cache
   */
  async cleanExpiredEntries() {
    if (!this.db) {
      return 0;
    }

    try {
      const now = Date.now();
      const result = this.statements.cleanExpired.run(now);

      if (result.changes > 0) {
        logger.info({ count: result.changes }, 'Cleaned expired cache entries');
      }

      return result.changes;
    } catch (error) {
      logger.error({ error }, 'Failed to clean expired cache entries');
      return 0;
    }
  }

  // Private methods

  _setMemoryCache(key, entry) {
    // Implement LRU eviction
    if (this.memoryCache.size >= this.maxMemoryItems) {
      this._evictLRU();
    }

    this.memoryCache.set(key, entry);
    this.accessOrder.set(key, Date.now());
  }

  _getMemoryCache(key) {
    const entry = this.memoryCache.get(key);

    if (entry) {
      // Check expiration
      if (Date.now() > entry.expiresAt) {
        this.memoryCache.delete(key);
        this.accessOrder.delete(key);
        return null;
      }

      // Update access time for LRU
      this.accessOrder.set(key, Date.now());
      return entry;
    }

    return null;
  }

  async _setPersistentCache(key, entry) {
    if (!this.db || !this.statements) {
      return false;
    }

    try {
      const now = Date.now();
      this.statements.set.run(
        key,
        JSON.stringify(entry.data),
        JSON.stringify(entry.metadata),
        now,
        entry.expiresAt,
        key, // For COALESCE in access_count
        now
      );
      return true;
    } catch (error) {
      logger.error({ error, key }, 'Failed to set persistent cache');
      return false;
    }
  }

  async _getPersistentCache(key) {
    if (!this.db) {
      return null;
    }

    try {
      const now = Date.now();
      const row = this.statements.get.get(key, now);

      if (row) {
        // Update access statistics
        this.statements.updateAccess.run(now, key);

        return {
          data: JSON.parse(row.data),
          metadata: JSON.parse(row.metadata || '{}'),
          expiresAt: row.expires_at
        };
      }

      return null;
    } catch (error) {
      logger.error({ error, key }, 'Failed to get persistent cache');
      return null;
    }
  }

  _evictLRU() {
    // Find least recently used entry
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, time] of this.accessOrder.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  _matchPattern(str, pattern) {
    const regex = pattern.replace(/\*/g, '.*');
    return new RegExp(`^${regex}$`).test(str);
  }

  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async cleanup() {
    try {
      // Clean expired entries one last time
      await this.cleanExpiredEntries();

      // Clear memory cache
      this.memoryCache.clear();
      this.accessOrder.clear();

      logger.info('GraphCache cleanup completed');
    } catch (error) {
      logger.error({ error }, 'Error during cache cleanup');
    }
  }
}