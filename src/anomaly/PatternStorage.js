import fs from 'fs/promises';
import path from 'path';
import { PersistentHistoricalCache } from '../cache/PersistentHistoricalCache.js';

/**
 * PatternStorage - Manages behavioral patterns and baselines for 1000 whales
 * Efficiently stores and retrieves patterns for anomaly detection
 */
export class PatternStorage {
  constructor(config = {}) {
    this.config = {
      basePath: config.basePath || './data/anomaly-patterns',
      cacheEnabled: config.cacheEnabled !== false,
      maxPatternsInMemory: config.maxPatternsInMemory || 100,
      autosaveInterval: config.autosaveInterval || 300000, // 5 minutes
      compressionEnabled: config.compressionEnabled !== false,
      ...config
    };
    
    // Use persistent cache for frequently accessed patterns
    this.cache = new PersistentHistoricalCache({
      l4Path: path.join(this.config.basePath, 'cache'),
      maxL4SizeMB: 500, // 500MB for pattern cache
      l1TTL: 300000, // 5 min hot cache
      l2TTL: 3600000, // 1 hour warm cache
    });
    
    // In-memory LRU for hottest patterns
    this.memoryCache = new Map();
    this.accessOrder = [];
    
    // Pattern index for quick lookups
    this.patternIndex = new Map(); // address -> pattern metadata
    
    // Statistics
    this.stats = {
      patternsLoaded: 0,
      patternsSaved: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgLoadTime: 0
    };
    
    // Initialize storage
    this.initialize();
  }
  
  async initialize() {
    try {
      // Create directory structure
      await fs.mkdir(this.config.basePath, { recursive: true });
      await fs.mkdir(path.join(this.config.basePath, 'patterns'), { recursive: true });
      await fs.mkdir(path.join(this.config.basePath, 'baselines'), { recursive: true });
      await fs.mkdir(path.join(this.config.basePath, 'history'), { recursive: true });
      
      // Load pattern index
      await this.loadPatternIndex();
      
      // Start autosave
      if (this.config.autosaveInterval > 0) {
        setInterval(() => this.autosave(), this.config.autosaveInterval);
      }
      
      console.log('[PatternStorage] Initialized with', this.patternIndex.size, 'whale patterns');
    } catch (error) {
      console.error('[PatternStorage] Initialization failed:', error);
    }
  }
  
  /**
   * Get or create pattern for a whale address
   */
  async getPattern(address) {
    const startTime = Date.now();
    
    // Check memory cache first
    if (this.memoryCache.has(address)) {
      this.stats.cacheHits++;
      this.updateAccessOrder(address);
      return this.memoryCache.get(address);
    }
    
    // Check persistent cache
    const cacheKey = `pattern:${address}`;
    const cachedPattern = await this.cache.get(cacheKey);
    if (cachedPattern) {
      this.stats.cacheHits++;
      this.addToMemoryCache(address, cachedPattern);
      return cachedPattern;
    }
    
    // Load from disk
    this.stats.cacheMisses++;
    const pattern = await this.loadPatternFromDisk(address);
    
    if (pattern) {
      // Cache for future use
      await this.cache.setWithClassification(cacheKey, pattern);
      this.addToMemoryCache(address, pattern);
    } else {
      // Create new pattern
      const newPattern = this.createEmptyPattern(address);
      await this.savePattern(address, newPattern);
      return newPattern;
    }
    
    // Update stats
    const loadTime = Date.now() - startTime;
    this.updateAvgLoadTime(loadTime);
    
    return pattern;
  }
  
  /**
   * Save updated pattern
   */
  async savePattern(address, pattern) {
    try {
      // Update in memory
      if (this.memoryCache.has(address)) {
        this.memoryCache.set(address, pattern);
      }
      
      // Update in cache
      const cacheKey = `pattern:${address}`;
      await this.cache.setWithClassification(cacheKey, pattern);
      
      // Save to disk
      const filePath = this.getPatternFilePath(address);
      const data = JSON.stringify(pattern, null, 2);
      
      if (this.config.compressionEnabled) {
        // Patterns are semi-mutable, so compression is beneficial
        await fs.writeFile(filePath + '.gz', await this.compress(data));
      } else {
        await fs.writeFile(filePath, data);
      }
      
      // Update index
      this.patternIndex.set(address, {
        lastUpdated: Date.now(),
        version: pattern.version || 1,
        dataPoints: pattern.dataPoints || 0
      });
      
      this.stats.patternsSaved++;
    } catch (error) {
      console.error(`[PatternStorage] Failed to save pattern for ${address}:`, error);
    }
  }
  
  /**
   * Update specific pattern fields efficiently
   */
  async updatePattern(address, updates) {
    const pattern = await this.getPattern(address);
    
    // Deep merge updates
    Object.keys(updates).forEach(key => {
      if (typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
        pattern[key] = { ...pattern[key], ...updates[key] };
      } else {
        pattern[key] = updates[key];
      }
    });
    
    pattern.lastUpdated = new Date().toISOString();
    pattern.version = (pattern.version || 1) + 1;
    
    await this.savePattern(address, pattern);
    return pattern;
  }
  
  /**
   * Get patterns for multiple addresses efficiently
   */
  async getBatchPatterns(addresses) {
    const patterns = new Map();
    
    // First, check what's in memory/cache
    const toLoad = [];
    for (const address of addresses) {
      if (this.memoryCache.has(address)) {
        patterns.set(address, this.memoryCache.get(address));
      } else {
        toLoad.push(address);
      }
    }
    
    // Load remaining patterns in parallel
    if (toLoad.length > 0) {
      const loadPromises = toLoad.map(addr => 
        this.getPattern(addr).then(pattern => patterns.set(addr, pattern))
      );
      await Promise.all(loadPromises);
    }
    
    return patterns;
  }
  
  /**
   * Create empty pattern structure
   */
  createEmptyPattern(address) {
    return {
      address,
      version: 1,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      dataPoints: 0,
      
      // Statistical baselines
      statistical: {
        transferAmounts: {
          mean: 0,
          stdDev: 0,
          median: 0,
          min: 0,
          max: 0,
          percentiles: [0, 0, 0, 0, 0], // 10, 25, 50, 75, 90
          history: [], // Rolling window of recent amounts
          lastUpdated: null
        },
        dailyVolume: {
          mean: 0,
          stdDev: 0,
          history: []
        }
      },
      
      // Behavioral patterns
      behavioral: {
        role: 'unknown', // 'holder', 'trader', 'validator', 'exchange'
        activityLevel: 'unknown', // 'high', 'medium', 'low', 'dormant'
        lastActivity: null,
        dormantPeriods: [],
        avgTimeBetweenTransactions: null,
        transactionCount: {
          daily: 0,
          weekly: 0,
          monthly: 0
        }
      },
      
      // Velocity patterns
      velocity: {
        hourlyRate: { current: 0, average: 0, max: 0 },
        dailyRate: { current: 0, average: 0, max: 0 },
        weeklyRate: { current: 0, average: 0, max: 0 },
        spikes: [], // Historical velocity spikes
        sustainedPeriods: [] // Periods of sustained high activity
      },
      
      // Network patterns
      network: {
        totalUniqueAddresses: 0,
        coreNetwork: [], // Top 20 frequent counterparties
        recentConnections: [], // Last 50 unique addresses
        networkGrowthRate: 0,
        commonExchanges: [],
        interactionPatterns: {}
      },
      
      // Temporal patterns
      temporal: {
        hourlyDistribution: new Array(24).fill(0), // Activity by hour
        weeklyDistribution: new Array(7).fill(0), // Activity by day
        monthlyDistribution: new Array(31).fill(0), // Activity by day of month
        timezone: null, // Inferred timezone
        preferredHours: [],
        unusualTimings: []
      },
      
      // Anomaly history
      anomalyHistory: [],
      
      // Learning metadata
      learning: {
        lastTrainingDate: null,
        adjustments: [],
        confidence: 0.5,
        reliability: 0.5
      }
    };
  }
  
  /**
   * Load pattern from disk
   */
  async loadPatternFromDisk(address) {
    try {
      const filePath = this.getPatternFilePath(address);
      let data;
      
      try {
        if (this.config.compressionEnabled) {
          const compressed = await fs.readFile(filePath + '.gz');
          data = await this.decompress(compressed);
        } else {
          data = await fs.readFile(filePath, 'utf8');
        }
      } catch (error) {
        // Try uncompressed if compressed fails
        data = await fs.readFile(filePath, 'utf8');
      }
      
      const pattern = JSON.parse(data);
      this.stats.patternsLoaded++;
      return pattern;
    } catch (error) {
      // Pattern doesn't exist yet
      return null;
    }
  }
  
  /**
   * Get file path for pattern
   */
  getPatternFilePath(address) {
    // Use first 6 chars of address for directory sharding (better file system performance)
    const shard = address.substring(0, 6);
    return path.join(this.config.basePath, 'patterns', shard, `${address}.json`);
  }
  
  /**
   * Memory cache management
   */
  addToMemoryCache(address, pattern) {
    if (this.memoryCache.size >= this.config.maxPatternsInMemory) {
      // Evict least recently used
      const lru = this.accessOrder.shift();
      this.memoryCache.delete(lru);
    }
    
    this.memoryCache.set(address, pattern);
    this.updateAccessOrder(address);
  }
  
  updateAccessOrder(address) {
    const index = this.accessOrder.indexOf(address);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(address);
  }
  
  /**
   * Pattern index management
   */
  async loadPatternIndex() {
    try {
      const indexPath = path.join(this.config.basePath, 'pattern-index.json');
      const data = await fs.readFile(indexPath, 'utf8');
      const index = JSON.parse(data);
      
      this.patternIndex = new Map(Object.entries(index));
    } catch (error) {
      // Index doesn't exist, will be created on first save
      console.log('[PatternStorage] No existing pattern index found');
    }
  }
  
  async savePatternIndex() {
    try {
      const indexPath = path.join(this.config.basePath, 'pattern-index.json');
      const index = Object.fromEntries(this.patternIndex);
      await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
    } catch (error) {
      console.error('[PatternStorage] Failed to save pattern index:', error);
    }
  }
  
  /**
   * Autosave modified patterns
   */
  async autosave() {
    // Save pattern index
    await this.savePatternIndex();
    
    // Save any modified patterns in memory cache
    for (const [address, pattern] of this.memoryCache) {
      if (pattern._modified) {
        await this.savePattern(address, pattern);
        pattern._modified = false;
      }
    }
  }
  
  /**
   * Compression utilities
   */
  async compress(data) {
    const { promisify } = await import('util');
    const gzip = promisify((await import('zlib')).gzip);
    return gzip(data);
  }
  
  async decompress(data) {
    const { promisify } = await import('util');
    const gunzip = promisify((await import('zlib')).gunzip);
    const decompressed = await gunzip(data);
    return decompressed.toString();
  }
  
  /**
   * Update average load time
   */
  updateAvgLoadTime(loadTime) {
    const total = this.stats.patternsLoaded + this.stats.cacheHits;
    this.stats.avgLoadTime = 
      (this.stats.avgLoadTime * (total - 1) + loadTime) / total;
  }
  
  /**
   * Get storage statistics
   */
  getStats() {
    const hitRate = (this.stats.cacheHits + this.stats.cacheMisses) > 0
      ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100
      : 0;
    
    return {
      ...this.stats,
      cacheHitRate: hitRate.toFixed(2) + '%',
      patternsIndexed: this.patternIndex.size,
      memoryCacheSize: this.memoryCache.size,
      avgLoadTimeMs: this.stats.avgLoadTime.toFixed(2)
    };
  }
  
  /**
   * Clear all patterns (for testing)
   */
  async clearAll() {
    this.memoryCache.clear();
    this.accessOrder = [];
    this.patternIndex.clear();
    await this.cache.clear();
    
    console.log('[PatternStorage] All patterns cleared');
  }
  
  /**
   * Get pattern summary for dashboard
   */
  async getPatternSummary(address) {
    const pattern = await this.getPattern(address);
    
    return {
      address,
      role: pattern.behavioral.role,
      activityLevel: pattern.behavioral.activityLevel,
      lastActivity: pattern.behavioral.lastActivity,
      avgTransferAmount: pattern.statistical.transferAmounts.mean,
      totalAnomalies: pattern.anomalyHistory.length,
      reliability: pattern.learning.reliability,
      dataPoints: pattern.dataPoints
    };
  }
}