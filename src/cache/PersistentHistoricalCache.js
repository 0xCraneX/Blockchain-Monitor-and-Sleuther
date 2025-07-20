import fs from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { TieredCache } from '../../hybrid/cache/TieredCache.js';

/**
 * PersistentHistoricalCache - Extends TieredCache with L4 persistent layer
 * Optimized for blockchain data with immutability awareness
 */
export class PersistentHistoricalCache extends TieredCache {
  constructor(config = {}) {
    super(config);
    
    this.config = {
      ...this.config,
      // L4: Persistent historical cache configuration
      l4Path: config.l4Path || './data/historical-cache',
      l4Compression: config.l4Compression !== false, // Default true
      l4Deduplication: config.l4Deduplication !== false, // Default true
      l4IndexPath: config.l4IndexPath || './data/historical-cache/index.json',
      maxL4SizeMB: config.maxL4SizeMB || 1000, // 1GB default
      
      // Data classification
      immutableBlockConfirmations: config.immutableBlockConfirmations || 6,
      checkpointInterval: config.checkpointInterval || 3600000, // 1 hour
      
      ...config
    };
    
    // L4: Persistent storage with index
    this.l4Index = new Map(); // key -> {file, compressed, hash, size, created}
    this.l4Stats = {
      reads: 0,
      writes: 0,
      compressionSavings: 0,
      deduplicationSavings: 0,
      totalSizeMB: 0
    };
    
    // Fetch checkpoints for incremental loading
    this.checkpoints = new Map(); // address:type -> {lastBlock, lastTimestamp, lastHash}
    
    this.initializeL4();
    
    console.log('[CACHE] PersistentHistoricalCache initialized', {
      l4Path: this.config.l4Path,
      compression: this.config.l4Compression,
      deduplication: this.config.l4Deduplication,
      maxSizeMB: this.config.maxL4SizeMB
    });
  }
  
  async initializeL4() {
    try {
      await fs.mkdir(this.config.l4Path, { recursive: true });
      await this.loadL4Index();
      await this.loadCheckpoints();
      console.log('[CACHE] L4 persistent cache initialized');
    } catch (error) {
      console.error('[CACHE] Failed to initialize L4 cache:', error.message);
    }
  }
  
  async loadL4Index() {
    try {
      const indexData = await fs.readFile(this.config.l4IndexPath, 'utf8');
      const index = JSON.parse(indexData);
      
      for (const [key, entry] of Object.entries(index)) {
        this.l4Index.set(key, entry);
      }
      
      this.l4Stats.totalSizeMB = Array.from(this.l4Index.values())
        .reduce((sum, entry) => sum + (entry.size || 0), 0) / (1024 * 1024);
      
      console.log(`[CACHE] Loaded L4 index with ${this.l4Index.size} entries (${this.l4Stats.totalSizeMB.toFixed(2)}MB)`);
    } catch (error) {
      // Index doesn't exist yet
      console.log('[CACHE] Creating new L4 index');
    }
  }
  
  async saveL4Index() {
    try {
      const index = Object.fromEntries(this.l4Index);
      await fs.writeFile(this.config.l4IndexPath, JSON.stringify(index, null, 2));
    } catch (error) {
      console.error('[CACHE] Failed to save L4 index:', error.message);
    }
  }
  
  async loadCheckpoints() {
    try {
      const checkpointPath = path.join(this.config.l4Path, 'checkpoints.json');
      const data = await fs.readFile(checkpointPath, 'utf8');
      const checkpoints = JSON.parse(data);
      
      for (const [key, checkpoint] of Object.entries(checkpoints)) {
        this.checkpoints.set(key, checkpoint);
      }
      
      console.log(`[CACHE] Loaded ${this.checkpoints.size} fetch checkpoints`);
    } catch (error) {
      console.log('[CACHE] No existing checkpoints found');
    }
  }
  
  async saveCheckpoints() {
    try {
      const checkpointPath = path.join(this.config.l4Path, 'checkpoints.json');
      const checkpoints = Object.fromEntries(this.checkpoints);
      await fs.writeFile(checkpointPath, JSON.stringify(checkpoints, null, 2));
    } catch (error) {
      console.error('[CACHE] Failed to save checkpoints:', error.message);
    }
  }
  
  // Enhanced get with L4 support
  async get(key, fetchFn = null) {
    this.metrics.totalGets++;
    
    // Try L1, L2, L3 first (existing tiered cache)
    const result = await super.get(key, null); // Don't use fetchFn yet
    if (result) {
      return result;
    }
    
    // Try L4 persistent cache
    const l4Value = await this.getL4(key);
    if (l4Value) {
      this.metrics.l3Hits++; // Count as cache hit
      
      // Promote to hot caches if recently accessed
      if (this.shouldPromoteToHotCache(key)) {
        this.setL1(key, l4Value, this.config.l1TTL);
        this.setL2(key, l4Value, this.config.l2TTL);
      }
      
      return l4Value;
    }
    
    // Cache miss - fetch if function provided
    if (fetchFn) {
      try {
        const data = await fetchFn();
        if (data !== null && data !== undefined) {
          await this.setWithClassification(key, data);
          return data;
        }
      } catch (error) {
        console.error(`[CACHE] Fetch function failed for key ${key}:`, error.message);
      }
    }
    
    return null;
  }
  
  // Intelligent set based on data classification
  async setWithClassification(key, data) {
    const classification = this.classifyData(key, data);
    
    switch (classification.type) {
      case 'IMMUTABLE':
        // Historical blockchain data - store permanently in L4
        await this.setL4(key, data, { permanent: true, compress: true });
        
        // Also set in hot caches for immediate access
        this.setL1(key, data, this.config.l1TTL);
        this.setL2(key, data, this.config.l2TTL);
        break;
        
      case 'SEMI_MUTABLE':
        // Store in all tiers with longer TTL
        await this.set(key, data, classification.ttl);
        break;
        
      case 'VOLATILE':
        // Only store in hot caches
        this.setL1(key, data, classification.ttl);
        this.setL2(key, data, classification.ttl);
        break;
    }
    
    // Update checkpoint if this is fetchable data
    this.updateCheckpoint(key, data);
  }
  
  classifyData(key, data) {
    // Extract data type from key
    const keyParts = key.split(':');
    const dataType = keyParts[0];
    
    // Classification rules for blockchain data
    if (dataType.includes('transfer') || dataType.includes('historical')) {
      // Check if data is from confirmed blocks
      if (this.isConfirmedBlockchainData(data)) {
        return { type: 'IMMUTABLE', ttl: null };
      }
    }
    
    if (dataType.includes('identity') || dataType.includes('validator')) {
      return { type: 'SEMI_MUTABLE', ttl: 86400000 }; // 24 hours
    }
    
    if (dataType.includes('balance') || dataType.includes('pending')) {
      return { type: 'VOLATILE', ttl: this.config.l1TTL };
    }
    
    // Default to semi-mutable
    return { type: 'SEMI_MUTABLE', ttl: this.config.l2TTL };
  }
  
  isConfirmedBlockchainData(data) {
    // Check if data contains block numbers and if they're sufficiently confirmed
    if (Array.isArray(data)) {
      const blocks = data
        .map(item => item.block_num || item.blockNumber)
        .filter(block => block);
      
      if (blocks.length > 0) {
        const latestBlock = Math.max(...blocks);
        // Assume current block is roughly known (you'd get this from your blockchain client)
        const currentBlock = this.estimateCurrentBlock();
        return (currentBlock - latestBlock) >= this.config.immutableBlockConfirmations;
      }
    }
    
    return false;
  }
  
  estimateCurrentBlock() {
    // Polkadot produces ~1 block per 6 seconds
    // This is a rough estimate - in production you'd get this from your node
    const genesisTime = 1590507378; // Polkadot mainnet genesis timestamp
    const secondsSinceGenesis = Math.floor(Date.now() / 1000) - genesisTime;
    return Math.floor(secondsSinceGenesis / 6);
  }
  
  async getL4(key) {
    try {
      const entry = this.l4Index.get(key);
      if (!entry) return null;
      
      const filePath = path.join(this.config.l4Path, entry.file);
      let data = await fs.readFile(filePath);
      
      // Decompress if needed
      if (entry.compressed) {
        data = zlib.gunzipSync(data);
      }
      
      this.l4Stats.reads++;
      return JSON.parse(data.toString());
      
    } catch (error) {
      console.error(`[CACHE] L4 read failed for key ${key}:`, error.message);
      return null;
    }
  }
  
  async setL4(key, data, options = {}) {
    try {
      const dataString = JSON.stringify(data);
      const hash = crypto.createHash('sha256').update(dataString).digest('hex');
      
      // Check for deduplication
      if (this.config.l4Deduplication) {
        const existingEntry = Array.from(this.l4Index.values())
          .find(entry => entry.hash === hash);
        
        if (existingEntry) {
          // Data already exists, just update the index
          this.l4Index.set(key, existingEntry);
          this.l4Stats.deduplicationSavings += dataString.length;
          console.log(`[CACHE] L4 deduplication hit for ${key}`);
          return;
        }
      }
      
      let dataBuffer = Buffer.from(dataString);
      const originalSize = dataBuffer.length;
      let compressed = false;
      
      // Compress if enabled and beneficial
      if (this.config.l4Compression && originalSize > 1024) {
        const compressedBuffer = zlib.gzipSync(dataBuffer);
        if (compressedBuffer.length < originalSize * 0.9) { // Only if >10% savings
          dataBuffer = compressedBuffer;
          compressed = true;
          this.l4Stats.compressionSavings += (originalSize - compressedBuffer.length);
        }
      }
      
      // Generate filename
      const filename = `${hash.substring(0, 16)}_${Date.now()}.${compressed ? 'gz' : 'json'}`;
      const filePath = path.join(this.config.l4Path, filename);
      
      // Write file
      await fs.writeFile(filePath, dataBuffer);
      
      // Update index
      const entry = {
        file: filename,
        compressed,
        hash,
        size: dataBuffer.length,
        created: Date.now(),
        permanent: options.permanent || false
      };
      
      this.l4Index.set(key, entry);
      this.l4Stats.writes++;
      this.l4Stats.totalSizeMB += dataBuffer.length / (1024 * 1024);
      
      // Save index periodically
      if (this.l4Stats.writes % 10 === 0) {
        await this.saveL4Index();
      }
      
      console.log(`[CACHE] L4 write: ${key} -> ${filename} (${(dataBuffer.length/1024).toFixed(1)}KB, compressed: ${compressed})`);
      
      // Check size limits
      await this.cleanupL4IfNeeded();
      
    } catch (error) {
      console.error(`[CACHE] L4 write failed for key ${key}:`, error.message);
    }
  }
  
  async cleanupL4IfNeeded() {
    if (this.l4Stats.totalSizeMB > this.config.maxL4SizeMB) {
      console.log(`[CACHE] L4 cache size (${this.l4Stats.totalSizeMB.toFixed(1)}MB) exceeds limit (${this.config.maxL4SizeMB}MB), cleaning up...`);
      
      // Remove oldest non-permanent entries
      const entries = Array.from(this.l4Index.entries())
        .filter(([key, entry]) => !entry.permanent)
        .sort((a, b) => a[1].created - b[1].created);
      
      let cleaned = 0;
      let freedMB = 0;
      
      for (const [key, entry] of entries) {
        if (this.l4Stats.totalSizeMB <= this.config.maxL4SizeMB * 0.8) break;
        
        try {
          const filePath = path.join(this.config.l4Path, entry.file);
          await fs.unlink(filePath);
          
          this.l4Index.delete(key);
          freedMB += entry.size / (1024 * 1024);
          this.l4Stats.totalSizeMB -= entry.size / (1024 * 1024);
          cleaned++;
        } catch (error) {
          console.error(`[CACHE] Failed to delete L4 file ${entry.file}:`, error.message);
        }
      }
      
      console.log(`[CACHE] L4 cleanup complete: removed ${cleaned} entries, freed ${freedMB.toFixed(1)}MB`);
      await this.saveL4Index();
    }
  }
  
  shouldPromoteToHotCache(key) {
    // Promote recently accessed or frequently accessed data
    const now = Date.now();
    const recentThreshold = 300000; // 5 minutes
    
    // Simple heuristic: promote if key suggests recent data
    return key.includes('current') || key.includes('recent') || key.includes('latest');
  }
  
  // Checkpoint management for incremental fetching
  updateCheckpoint(key, data) {
    if (!Array.isArray(data) || data.length === 0) return;
    
    // Extract checkpoint info from data
    const blocks = data.map(item => item.block_num || item.blockNumber).filter(b => b);
    const timestamps = data.map(item => item.timestamp || item.block_timestamp).filter(t => t);
    
    if (blocks.length === 0) return;
    
    const checkpointKey = this.getCheckpointKey(key);
    const latestBlock = Math.max(...blocks);
    const latestTimestamp = timestamps.length > 0 ? Math.max(...timestamps.map(t => new Date(t).getTime())) : Date.now();
    
    const checkpoint = {
      lastBlock: latestBlock,
      lastTimestamp: latestTimestamp,
      lastHash: crypto.createHash('sha256').update(JSON.stringify(data[0])).digest('hex'),
      updatedAt: Date.now()
    };
    
    this.checkpoints.set(checkpointKey, checkpoint);
    
    // Save checkpoints periodically
    if (this.checkpoints.size % 5 === 0) {
      this.saveCheckpoints();
    }
  }
  
  getCheckpointKey(cacheKey) {
    // Extract address and data type from cache key for checkpoint tracking
    const parts = cacheKey.split(':');
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}`; // e.g., "transfers:15f1R..."
    }
    return cacheKey;
  }
  
  getCheckpoint(dataType, address) {
    const key = `${dataType}:${address}`;
    return this.checkpoints.get(key) || { lastBlock: 0, lastTimestamp: 0, lastHash: null };
  }
  
  // Enhanced metrics including L4
  getMetrics() {
    const baseMetrics = super.getMetrics();
    
    const compressionRatio = this.l4Stats.writes > 0 ? 
      (this.l4Stats.compressionSavings / (this.l4Stats.writes * 1024)).toFixed(2) : '0';
    
    return {
      ...baseMetrics,
      
      l4: {
        reads: this.l4Stats.reads,
        writes: this.l4Stats.writes,
        sizeMB: this.l4Stats.totalSizeMB.toFixed(2),
        entries: this.l4Index.size,
        compressionSavingsMB: (this.l4Stats.compressionSavings / (1024 * 1024)).toFixed(2),
        deduplicationSavingsMB: (this.l4Stats.deduplicationSavings / (1024 * 1024)).toFixed(2)
      },
      
      checkpoints: {
        count: this.checkpoints.size,
        dataTypes: Array.from(this.checkpoints.keys()).map(k => k.split(':')[0])
      },
      
      efficiency: {
        totalCacheHitRate: baseMetrics.performance.hitRate,
        l4CompressionRatio: compressionRatio + '%',
        estimatedDataSavings: this.calculateDataSavings()
      }
    };
  }
  
  calculateDataSavings() {
    const totalSavings = this.l4Stats.compressionSavings + this.l4Stats.deduplicationSavings;
    return `${(totalSavings / (1024 * 1024)).toFixed(1)}MB`;
  }
  
  // Clear all caches including L4
  async clear() {
    await super.clear();
    
    // Clear L4 files
    try {
      const files = await fs.readdir(this.config.l4Path);
      for (const file of files) {
        if (file.endsWith('.json') || file.endsWith('.gz')) {
          await fs.unlink(path.join(this.config.l4Path, file));
        }
      }
      
      this.l4Index.clear();
      this.checkpoints.clear();
      this.l4Stats = {
        reads: 0,
        writes: 0,
        compressionSavings: 0,
        deduplicationSavings: 0,
        totalSizeMB: 0
      };
      
      console.log('[CACHE] L4 persistent cache cleared');
    } catch (error) {
      console.error('[CACHE] Error clearing L4 cache:', error.message);
    }
  }
}