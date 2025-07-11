import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GraphCache } from '../../../src/services/GraphCache.js';
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('GraphCache', () => {
  let graphCache;
  let mockDb;
  let mockDatabaseService;
  let testDbPath;

  beforeEach(async () => {
    // Create temporary database for testing
    testDbPath = ':memory:';
    mockDb = new Database(testDbPath);
    
    mockDatabaseService = {
      db: mockDb
    };
    
    graphCache = new GraphCache(mockDatabaseService);
    await new Promise(resolve => setTimeout(resolve, 10)); // Allow initialization
  });

  afterEach(async () => {
    if (mockDb) {
      mockDb.close();
    }
    if (graphCache) {
      await graphCache.cleanup();
    }
  });

  describe('initialization', () => {
    it('should initialize with database service', () => {
      expect(graphCache.databaseService).toBe(mockDatabaseService);
      expect(graphCache.db).toBe(mockDb);
    });

    it('should initialize without database service', () => {
      const cache = new GraphCache(null);
      expect(cache.databaseService).toBeNull();
      expect(cache.db).toBeNull();
    });

    it('should create cache table in database', () => {
      const tables = mockDb.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='graph_cache'
      `).all();
      
      expect(tables).toHaveLength(1);
    });

    it('should initialize with default configuration', () => {
      expect(graphCache.maxMemoryItems).toBe(1000);
      expect(graphCache.defaultTTL.interactiveQuery).toBe(300);
      expect(graphCache.defaultTTL.graphData).toBe(900);
      expect(graphCache.defaultTTL.metrics).toBe(1800);
      expect(graphCache.defaultTTL.scores).toBe(3600);
    });
  });

  describe('cacheGraph', () => {
    it('should cache small graph in memory', async () => {
      const smallGraph = {
        nodes: new Array(500).fill().map((_, i) => ({ id: i, label: `Node ${i}` })),
        edges: []
      };

      const result = await graphCache.cacheGraph('test:small', smallGraph, 300);
      
      expect(result).toBe(true);
      expect(graphCache.memoryCache.has('test:small')).toBe(true);
      expect(graphCache.stats.writes).toBe(1);
    });

    it('should cache large graph in persistent storage', async () => {
      const largeGraph = {
        nodes: new Array(1500).fill().map((_, i) => ({ id: i, label: `Node ${i}` })),
        edges: []
      };

      const result = await graphCache.cacheGraph('test:large', largeGraph, 300);
      
      expect(result).toBe(true);
      expect(graphCache.memoryCache.has('test:large')).toBe(false);
      
      // Check persistent storage
      const cached = mockDb.prepare('SELECT * FROM graph_cache WHERE key = ?').get('test:large');
      expect(cached).toBeTruthy();
      expect(graphCache.stats.writes).toBe(1);
    });

    it('should include metadata in cached entry', async () => {
      const graph = { nodes: [{ id: 1 }], edges: [] };
      const metadata = { source: 'test', version: '1.0' };

      await graphCache.cacheGraph('test:meta', graph, 300, metadata);
      
      const cached = await graphCache.getCachedGraph('test:meta');
      expect(cached).toEqual(graph);
    });

    it('should handle caching errors gracefully', async () => {
      // Mock database error
      const errorDb = {
        exec: vi.fn(),
        prepare: vi.fn(() => ({
          run: vi.fn(() => { throw new Error('Database error'); })
        }))
      };
      
      const errorCache = new GraphCache({ db: errorDb });
      const result = await errorCache.cacheGraph('test:error', { nodes: [], edges: [] });
      
      expect(result).toBe(false);
    });
  });

  describe('getCachedGraph', () => {
    it('should retrieve cached graph from memory', async () => {
      const graph = { nodes: [{ id: 1 }], edges: [] };
      
      await graphCache.cacheGraph('test:memory', graph, 300);
      const retrieved = await graphCache.getCachedGraph('test:memory');
      
      expect(retrieved).toEqual(graph);
      expect(graphCache.stats.hits).toBe(1);
    });

    it('should retrieve cached graph from persistent storage', async () => {
      const graph = {
        nodes: new Array(1500).fill().map((_, i) => ({ id: i })),
        edges: []
      };
      
      await graphCache.cacheGraph('test:persistent', graph, 300);
      const retrieved = await graphCache.getCachedGraph('test:persistent');
      
      expect(retrieved).toEqual(graph);
      expect(graphCache.stats.hits).toBe(1);
    });

    it('should promote small persistent cache entries to memory', async () => {
      // Manually insert small graph into persistent cache
      const graph = { nodes: [{ id: 1 }], edges: [] };
      const now = Date.now();
      
      mockDb.prepare(`
        INSERT INTO graph_cache (key, data, metadata, created_at, expires_at, access_count, last_accessed)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test:promote',
        JSON.stringify(graph),
        JSON.stringify({ nodeCount: 1 }),
        now,
        now + 300000,
        0,
        now
      );
      
      const retrieved = await graphCache.getCachedGraph('test:promote');
      
      expect(retrieved).toEqual(graph);
      expect(graphCache.memoryCache.has('test:promote')).toBe(true);
    });

    it('should return null for non-existent key', async () => {
      const retrieved = await graphCache.getCachedGraph('test:nonexistent');
      
      expect(retrieved).toBeNull();
      expect(graphCache.stats.misses).toBe(1);
    });

    it('should return null for expired entries', async () => {
      const graph = { nodes: [], edges: [] };
      
      // Cache with very short TTL
      await graphCache.cacheGraph('test:expired', graph, -1);
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const retrieved = await graphCache.getCachedGraph('test:expired');
      expect(retrieved).toBeNull();
    });

    it('should handle retrieval errors gracefully', async () => {
      // Create cache without database
      const noDbCache = new GraphCache(null);
      
      const retrieved = await noDbCache.getCachedGraph('test:error');
      expect(retrieved).toBeNull();
      expect(noDbCache.stats.misses).toBe(1);
    });
  });

  describe('cacheQuery', () => {
    it('should cache query results', async () => {
      const query = 'SELECT * FROM accounts WHERE address = ?';
      const result = { data: [{ address: '1abc', balance: 1000 }] };
      
      const success = await graphCache.cacheQuery(query, result, 300);
      
      expect(success).toBe(true);
      expect(graphCache.stats.writes).toBe(1);
    });

    it('should generate consistent cache key for queries', async () => {
      const query = 'SELECT * FROM accounts';
      const result = { data: [] };
      
      await graphCache.cacheQuery(query, result);
      
      const key = graphCache.generateCacheKey({ type: 'query', query });
      const cached = await graphCache.getCachedGraph(key);
      
      expect(cached).toEqual(result);
    });
  });

  describe('invalidateAddress', () => {
    beforeEach(async () => {
      // Set up test data
      const testAddress = '1abc123';
      
      await graphCache.cacheGraph(`graph:${testAddress}:connections`, { nodes: [], edges: [] });
      await graphCache.cacheGraph(`metrics:${testAddress}:score`, { score: 85 });
      await graphCache.cacheQuery(`path:${testAddress}:to:1def456`, { path: [] });
      await graphCache.cacheGraph('unrelated:key', { data: 'test' });
    });

    it('should invalidate all cache entries for address', async () => {
      const count = await graphCache.invalidateAddress('1abc123');
      
      expect(count).toBeGreaterThan(0);
      
      // Check that address-related entries are gone
      expect(await graphCache.getCachedGraph('graph:1abc123:connections')).toBeNull();
      expect(await graphCache.getCachedGraph('metrics:1abc123:score')).toBeNull();
      
      // Check that unrelated entries remain
      expect(await graphCache.getCachedGraph('unrelated:key')).toBeTruthy();
    });

    it('should handle invalidation errors gracefully', async () => {
      const count = await graphCache.invalidateAddress('nonexistent');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generateCacheKey', () => {
    it('should generate consistent keys for same parameters', () => {
      const params1 = { type: 'graph', address: '1abc', depth: 2 };
      const params2 = { type: 'graph', address: '1abc', depth: 2 };
      
      const key1 = graphCache.generateCacheKey(params1);
      const key2 = graphCache.generateCacheKey(params2);
      
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different parameters', () => {
      const params1 = { type: 'graph', address: '1abc', depth: 2 };
      const params2 = { type: 'graph', address: '1abc', depth: 3 };
      
      const key1 = graphCache.generateCacheKey(params1);
      const key2 = graphCache.generateCacheKey(params2);
      
      expect(key1).not.toBe(key2);
    });

    it('should handle complex query parameters', () => {
      const params = {
        type: 'query',
        query: 'SELECT * FROM accounts WHERE balance > ? AND created_at > ?',
        address: '1abc123'
      };
      
      const key = graphCache.generateCacheKey(params);
      expect(key).toContain('query');
      expect(key).toContain('1abc123');
    });

    it('should sort options for consistent key generation', () => {
      const params1 = { type: 'graph', address: '1abc', limit: 100, depth: 2 };
      const params2 = { type: 'graph', address: '1abc', depth: 2, limit: 100 };
      
      const key1 = graphCache.generateCacheKey(params1);
      const key2 = graphCache.generateCacheKey(params2);
      
      expect(key1).toBe(key2);
    });
  });

  describe('LRU eviction', () => {
    beforeEach(() => {
      // Set small cache size for testing
      graphCache.maxMemoryItems = 3;
    });

    it('should evict least recently used items', async () => {
      // Fill cache
      await graphCache.cacheGraph('key1', { nodes: [], edges: [] });
      await new Promise(resolve => setTimeout(resolve, 5)); // Small delay
      await graphCache.cacheGraph('key2', { nodes: [], edges: [] });
      await new Promise(resolve => setTimeout(resolve, 5)); // Small delay
      await graphCache.cacheGraph('key3', { nodes: [], edges: [] });
      
      // Access key1 and key3 to make them recently used
      await new Promise(resolve => setTimeout(resolve, 5)); // Small delay
      await graphCache.getCachedGraph('key1');
      await graphCache.getCachedGraph('key3');
      
      // Add new item, should evict key2 (least recently used)
      await new Promise(resolve => setTimeout(resolve, 5)); // Small delay
      await graphCache.cacheGraph('key4', { nodes: [], edges: [] });
      
      expect(graphCache.memoryCache.has('key1')).toBe(true);
      expect(graphCache.memoryCache.has('key2')).toBe(false);
      expect(graphCache.memoryCache.has('key3')).toBe(true);
      expect(graphCache.memoryCache.has('key4')).toBe(true);
      expect(graphCache.stats.evictions).toBe(1);
    });
  });

  describe('cache warming', () => {
    it('should add and remove warm addresses', () => {
      graphCache.addWarmAddress('1abc123');
      graphCache.addWarmAddress('1def456');
      
      expect(graphCache.warmAddresses.has('1abc123')).toBe(true);
      expect(graphCache.warmAddresses.has('1def456')).toBe(true);
      
      graphCache.removeWarmAddress('1abc123');
      expect(graphCache.warmAddresses.has('1abc123')).toBe(false);
    });

    it('should warm cache for popular addresses', async () => {
      const mockDataLoader = vi.fn();
      mockDataLoader.mockResolvedValue({ nodes: [{ id: 1 }], edges: [] });
      
      graphCache.addWarmAddress('1abc123');
      graphCache.addWarmAddress('1def456');
      
      await graphCache.warmCache(mockDataLoader);
      
      expect(mockDataLoader).toHaveBeenCalledTimes(2);
      expect(mockDataLoader).toHaveBeenCalledWith('1abc123');
      expect(mockDataLoader).toHaveBeenCalledWith('1def456');
    });

    it('should skip warming for already cached addresses', async () => {
      const mockDataLoader = vi.fn();
      
      // Pre-cache data
      await graphCache.cacheGraph('graph:1abc123', { nodes: [], edges: [] });
      graphCache.addWarmAddress('1abc123');
      
      await graphCache.warmCache(mockDataLoader);
      
      expect(mockDataLoader).not.toHaveBeenCalled();
    });
  });

  describe('getCacheStats', () => {
    it('should return comprehensive cache statistics', async () => {
      // Add some test data
      await graphCache.cacheGraph('test1', { nodes: [], edges: [] });
      await graphCache.cacheGraph('test2', { nodes: new Array(1500).fill({ id: 1 }), edges: [] });
      await graphCache.getCachedGraph('test1'); // Create a hit
      await graphCache.getCachedGraph('nonexistent'); // Create a miss
      
      const stats = await graphCache.getCacheStats();
      
      expect(stats).toHaveProperty('performance');
      expect(stats).toHaveProperty('memory');
      expect(stats).toHaveProperty('persistent');
      expect(stats).toHaveProperty('warming');
      
      expect(stats.performance.hits).toBe(1);
      expect(stats.performance.misses).toBe(1);
      expect(stats.performance.hitRate).toBe('50%');
      expect(stats.performance.writes).toBe(2);
      
      expect(stats.memory.entries).toBeGreaterThan(0);
      expect(stats.persistent.entries).toBeGreaterThan(0);
    });

    it('should handle stats errors gracefully', async () => {
      // Create cache without database
      const noDbCache = new GraphCache(null);
      
      const stats = await noDbCache.getCacheStats();
      
      expect(stats.memory.entries).toBe(0);
      expect(stats.persistent.entries).toBe(0);
    });
  });

  describe('cleanExpiredEntries', () => {
    it('should remove expired entries from persistent cache', async () => {
      // Manually insert expired entry
      const now = Date.now();
      mockDb.prepare(`
        INSERT INTO graph_cache (key, data, metadata, created_at, expires_at, access_count, last_accessed)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'expired:key',
        JSON.stringify({ data: 'test' }),
        JSON.stringify({}),
        now - 1000,
        now - 500, // Expired 500ms ago
        0,
        now - 1000
      );
      
      const cleaned = await graphCache.cleanExpiredEntries();
      
      expect(cleaned).toBeGreaterThan(0);
      
      const remaining = mockDb.prepare('SELECT * FROM graph_cache WHERE key = ?').get('expired:key');
      expect(remaining).toBeFalsy();
    });
  });

  describe('cleanup', () => {
    it('should clear memory cache and clean expired entries', async () => {
      await graphCache.cacheGraph('test', { nodes: [], edges: [] });
      expect(graphCache.memoryCache.size).toBeGreaterThan(0);
      
      await graphCache.cleanup();
      
      expect(graphCache.memoryCache.size).toBe(0);
      expect(graphCache.accessOrder.size).toBe(0);
    });
  });

  describe('pattern matching', () => {
    it('should match wildcard patterns correctly', () => {
      expect(graphCache._matchPattern('graph:1abc:connections', 'graph:*:connections')).toBe(true);
      expect(graphCache._matchPattern('graph:1abc:connections', 'metrics:*:connections')).toBe(false);
      expect(graphCache._matchPattern('query:path:1abc:to:1def', '*:*:1abc:*')).toBe(true);
    });
  });

  describe('string hashing', () => {
    it('should generate consistent hashes', () => {
      const str = 'test string for hashing';
      const hash1 = graphCache._hashString(str);
      const hash2 = graphCache._hashString(str);
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
    });

    it('should generate different hashes for different strings', () => {
      const hash1 = graphCache._hashString('string1');
      const hash2 = graphCache._hashString('string2');
      
      expect(hash1).not.toBe(hash2);
    });
  });
});