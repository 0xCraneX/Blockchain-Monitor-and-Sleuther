/**
 * DataCacheService - Hybrid memory/database caching with intelligent invalidation
 *
 * Features:
 * - Two-tier caching: in-memory (L1) and database (L2)
 * - Automatic cache warming for frequently accessed data
 * - Smart invalidation based on data changes
 * - Query result caching with dependency tracking
 * - Compression for large cache entries
 */

import { BaseService } from './BaseService.js';
import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export class DataCacheService extends BaseService {
  constructor(databaseService, cacheService) {
    super('DataCacheService', { database: databaseService, cache: cacheService });

    // L1 cache (in-memory) is managed by CacheService
    this.l1Cache = cacheService;

    // Configuration
    this.config = {
      l1TTL: 300, // 5 minutes for memory cache
      l2TTL: 3600, // 1 hour for database cache
      compressionThreshold: 1024, // Compress entries larger than 1KB
      maxL1Size: 1000, // Maximum entries in L1 cache
      warmupBatchSize: 100,
      invalidationBatchSize: 50
    };

    // Cache statistics
    this.stats = {
      l1Hits: 0,
      l2Hits: 0,
      misses: 0,
      compressionSaves: 0,
      invalidations: 0
    };

    // Dependency tracking for smart invalidation
    this.dependencies = new Map(); // cacheKey -> Set of table names

    // Start background tasks
    this.startWarmupTask();
    this.startCleanupTask();
  }

  /**
   * Get data from cache with automatic fallback
   */
  async get(key, fetcher, options = {}) {
    return this.execute('get', async () => {
      const {
        ttl = this.config.l1TTL,
        compress = true,
        dependencies = [],
        forceRefresh = false
      } = options;

      if (!forceRefresh) {
        // Check L1 cache first
        const l1Result = await this.l1Cache.get(key);
        if (l1Result !== null) {
          this.stats.l1Hits++;
          return l1Result;
        }

        // Check L2 cache (database)
        const l2Result = await this.getFromL2(key);
        if (l2Result !== null) {
          this.stats.l2Hits++;
          // Promote to L1
          await this.l1Cache.set(key, l2Result, ttl);
          return l2Result;
        }
      }

      // Cache miss - fetch data
      this.stats.misses++;
      const data = await fetcher();

      if (data !== null && data !== undefined) {
        // Store in both caches
        await this.set(key, data, { ttl, compress, dependencies });
      }

      return data;
    }, key);
  }

  /**
   * Set data in both cache tiers
   */
  async set(key, value, options = {}) {
    return this.execute('set', async () => {
      const {
        ttl = this.config.l1TTL,
        compress = true,
        dependencies = []
      } = options;

      // Track dependencies for invalidation
      if (dependencies.length > 0) {
        this.dependencies.set(key, new Set(dependencies));
      }

      // Store in L1 cache
      await this.l1Cache.set(key, value, ttl);

      // Store in L2 cache with optional compression
      await this.setInL2(key, value, {
        ttl: ttl * 2, // L2 has longer TTL
        compress: compress && JSON.stringify(value).length > this.config.compressionThreshold
      });

      return true;
    }, key);
  }

  /**
   * Invalidate cache entries based on table changes
   */
  async invalidateByTable(tableName) {
    return this.execute('invalidateByTable', async () => {
      const keysToInvalidate = [];

      // Find all cache keys that depend on this table
      for (const [key, deps] of this.dependencies.entries()) {
        if (deps.has(tableName)) {
          keysToInvalidate.push(key);
        }
      }

      // Batch invalidation
      const batches = this.chunk(keysToInvalidate, this.config.invalidationBatchSize);
      let invalidated = 0;

      for (const batch of batches) {
        await Promise.all(batch.map(async (key) => {
          await this.l1Cache.delete(key);
          await this.deleteFromL2(key);
          this.dependencies.delete(key);
          invalidated++;
        }));
      }

      this.stats.invalidations += invalidated;

      return { invalidated, tableName };
    }, tableName);
  }

  /**
   * Cache a query result with automatic key generation
   */
  async cacheQuery(query, params, fetcher, options = {}) {
    const key = this.generateQueryKey(query, params);
    return this.get(key, fetcher, options);
  }

  /**
   * Get cached graph data with smart invalidation
   */
  async getCachedGraph(address, depth, filters, fetcher) {
    const key = `graph:${address}:${depth}:${this.hashObject(filters)}`;

    return this.get(key, fetcher, {
      ttl: 600, // 10 minutes for graph data
      compress: true,
      dependencies: ['accounts', 'account_relationships', 'transfers']
    });
  }

  /**
   * Get cached pattern detection results
   */
  async getCachedPatterns(address, patternType, fetcher) {
    const key = `patterns:${address}:${patternType}`;

    return this.get(key, fetcher, {
      ttl: 1800, // 30 minutes for pattern results
      compress: false,
      dependencies: ['transfers', 'patterns']
    });
  }

  /**
   * Get cached scoring results
   */
  async getCachedScore(fromAddress, toAddress, scoreType, fetcher) {
    const key = `score:${fromAddress}:${toAddress}:${scoreType}`;

    // Check scoring cache table first
    const cached = await this.getFromScoringCache(fromAddress, toAddress, scoreType);
    if (cached) {
      return cached;
    }

    // Fetch and cache
    const score = await fetcher();
    if (score) {
      await this.setScoringCache(fromAddress, toAddress, scoreType, score);
    }

    return score;
  }

  // L2 Cache (Database) Operations

  async getFromL2(key) {
    const query = this.db.prepare(`
      SELECT data_hash, size_bytes, hit_count
      FROM cache_metadata
      WHERE cache_key = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `);

    const metadata = query.get(key);
    if (!metadata) {
      return null;
    }

    // Update hit count
    this.db.prepare('UPDATE cache_metadata SET hit_count = hit_count + 1, last_accessed = CURRENT_TIMESTAMP WHERE cache_key = ?').run(key);

    // Retrieve actual data (would be from a separate blob storage in production)
    // For now, we'll use a simple cache_data table
    const dataQuery = this.db.prepare('SELECT data FROM cache_data WHERE cache_key = ?');
    const result = dataQuery.get(key);

    if (!result) {
      return null;
    }

    // Decompress if needed
    if (metadata.size_bytes > this.config.compressionThreshold) {
      const buffer = Buffer.from(result.data, 'base64');
      const decompressed = await gunzip(buffer);
      return JSON.parse(decompressed.toString());
    }

    return JSON.parse(result.data);
  }

  async setInL2(key, value, options) {
    const { ttl, compress } = options;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    let dataToStore = JSON.stringify(value);
    const sizeBytes = dataToStore.length;

    // Compress if needed
    if (compress) {
      const compressed = await gzip(dataToStore);
      dataToStore = compressed.toString('base64');
      const savedBytes = sizeBytes - dataToStore.length;
      this.stats.compressionSaves += savedBytes;
    }

    const dataHash = this.hashData(dataToStore);

    // Store metadata
    this.db.prepare(`
      INSERT OR REPLACE INTO cache_metadata (cache_key, data_hash, size_bytes, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(key, dataHash, sizeBytes, expiresAt);

    // Store data (would use blob storage in production)
    this.db.prepare(`
      INSERT OR REPLACE INTO cache_data (cache_key, data)
      VALUES (?, ?)
    `).run(key, dataToStore);
  }

  async deleteFromL2(key) {
    this.db.prepare('DELETE FROM cache_metadata WHERE cache_key = ?').run(key);
    this.db.prepare('DELETE FROM cache_data WHERE cache_key = ?').run(key);
  }

  // Scoring Cache Operations

  async getFromScoringCache(fromAddress, toAddress, scoreType) {
    const query = this.db.prepare(`
      SELECT score, details
      FROM scoring_cache
      WHERE from_address = ? AND to_address = ? AND score_type = ?
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `);

    const result = query.get(fromAddress, toAddress, scoreType);
    if (!result) {
      return null;
    }

    return {
      score: result.score,
      details: result.details ? JSON.parse(result.details) : {}
    };
  }

  async setScoringCache(fromAddress, toAddress, scoreType, scoreData) {
    const expiresAt = new Date(Date.now() + this.config.l2TTL * 1000).toISOString();

    this.db.prepare(`
      INSERT OR REPLACE INTO scoring_cache 
      (from_address, to_address, score_type, score, details, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      fromAddress,
      toAddress,
      scoreType,
      scoreData.score,
      JSON.stringify(scoreData.details || {}),
      expiresAt
    );
  }

  // Cache Warming

  async warmupCache() {
    return this.execute('warmupCache', async () => {
      // Get frequently accessed cache keys
      const frequentKeys = this.db.prepare(`
        SELECT cache_key, hit_count
        FROM cache_metadata
        WHERE hit_count > 5
        ORDER BY hit_count DESC
        LIMIT ?
      `).all(this.config.warmupBatchSize);

      let warmed = 0;
      for (const { cache_key } of frequentKeys) {
        const data = await this.getFromL2(cache_key);
        if (data) {
          await this.l1Cache.set(cache_key, data, this.config.l1TTL);
          warmed++;
        }
      }

      return { warmedKeys: warmed };
    });
  }

  // Background Tasks

  startWarmupTask() {
    // Warm up cache every 5 minutes
    setInterval(async () => {
      try {
        await this.warmupCache();
      } catch (error) {
        this.logger.error('Cache warmup failed', error);
      }
    }, 5 * 60 * 1000);
  }

  startCleanupTask() {
    // Clean up expired entries every 15 minutes
    setInterval(async () => {
      try {
        const deleted = this.db.prepare('DELETE FROM cache_metadata WHERE expires_at < CURRENT_TIMESTAMP').run();
        this.logger.debug(`Cleaned up ${deleted.changes} expired cache entries`);
      } catch (error) {
        this.logger.error('Cache cleanup failed', error);
      }
    }, 15 * 60 * 1000);
  }

  // Utility Methods

  generateQueryKey(query, params) {
    const normalized = query.replace(/\s+/g, ' ').trim();
    return `query:${this.hashData(normalized + JSON.stringify(params))}`;
  }

  hashData(data) {
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  hashObject(obj) {
    return this.hashData(JSON.stringify(obj, Object.keys(obj).sort()));
  }

  chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // Metrics

  getMetrics() {
    const baseMetrics = super.getMetrics();

    return {
      ...baseMetrics,
      cacheStats: {
        ...this.stats,
        hitRate: this.calculateHitRate(),
        compressionRatio: this.calculateCompressionRatio()
      },
      dependencies: this.dependencies.size,
      l1CacheMetrics: this.l1Cache.getMetrics()
    };
  }

  calculateHitRate() {
    const total = this.stats.l1Hits + this.stats.l2Hits + this.stats.misses;
    if (total === 0) {
      return 0;
    }
    return ((this.stats.l1Hits + this.stats.l2Hits) / total * 100).toFixed(2);
  }

  calculateCompressionRatio() {
    // Would calculate based on actual compression stats
    return '65%'; // Placeholder
  }
}

// Create cache_data table if it doesn't exist
export function createCacheDataTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS cache_data (
      cache_key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      FOREIGN KEY (cache_key) REFERENCES cache_metadata(cache_key) ON DELETE CASCADE
    )
  `).run();
}