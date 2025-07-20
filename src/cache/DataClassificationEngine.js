/**
 * DataClassificationEngine - Smart classification system for blockchain data
 * Determines optimal caching strategy based on data mutability and access patterns
 */
export class DataClassificationEngine {
  constructor(config = {}) {
    this.config = {
      // Blockchain-specific parameters
      finalityBlocks: config.finalityBlocks || 6, // Blocks until finality
      estimatedBlockTime: config.estimatedBlockTime || 6000, // 6 seconds for Polkadot
      currentBlockEstimate: config.currentBlockEstimate || null,
      
      // Classification thresholds
      staleDataThreshold: config.staleDataThreshold || 86400000, // 24 hours
      hotDataThreshold: config.hotDataThreshold || 300000, // 5 minutes
      
      ...config
    };
    
    // Data classification rules
    this.classificationRules = new Map([
      // IMMUTABLE data - never changes once confirmed
      ['confirmed_transfers', { 
        type: 'IMMUTABLE', 
        ttl: 'FOREVER', 
        storage: 'persistent',
        compression: true,
        deduplication: true 
      }],
      ['finalized_blocks', { 
        type: 'IMMUTABLE', 
        ttl: 'FOREVER', 
        storage: 'persistent',
        compression: true,
        deduplication: true 
      }],
      ['historical_balances', { 
        type: 'IMMUTABLE', 
        ttl: 'FOREVER', 
        storage: 'persistent',
        compression: true,
        deduplication: false 
      }],
      ['extrinsic_data', { 
        type: 'IMMUTABLE', 
        ttl: 'FOREVER', 
        storage: 'persistent',
        compression: true,
        deduplication: true 
      }],
      
      // SEMI_MUTABLE data - changes infrequently
      ['account_identity', { 
        type: 'SEMI_MUTABLE', 
        ttl: 86400000, // 24 hours
        storage: 'tiered',
        compression: false,
        deduplication: false 
      }],
      ['validator_info', { 
        type: 'SEMI_MUTABLE', 
        ttl: 3600000, // 1 hour
        storage: 'tiered',
        compression: false,
        deduplication: false 
      }],
      ['top_accounts', { 
        type: 'SEMI_MUTABLE', 
        ttl: 3600000, // 1 hour
        storage: 'tiered',
        compression: false,
        deduplication: false 
      }],
      ['exchange_info', { 
        type: 'SEMI_MUTABLE', 
        ttl: 43200000, // 12 hours
        storage: 'tiered',
        compression: false,
        deduplication: false 
      }],
      
      // VOLATILE data - changes frequently
      ['current_balance', { 
        type: 'VOLATILE', 
        ttl: 300000, // 5 minutes
        storage: 'memory',
        compression: false,
        deduplication: false 
      }],
      ['pending_transfers', { 
        type: 'VOLATILE', 
        ttl: 30000, // 30 seconds
        storage: 'memory',
        compression: false,
        deduplication: false 
      }],
      ['mempool_data', { 
        type: 'VOLATILE', 
        ttl: 15000, // 15 seconds
        storage: 'memory',
        compression: false,
        deduplication: false 
      }],
      ['real_time_price', { 
        type: 'VOLATILE', 
        ttl: 60000, // 1 minute
        storage: 'memory',
        compression: false,
        deduplication: false 
      }]
    ]);
    
    // Access pattern tracking
    this.accessPatterns = new Map(); // key -> {accessCount, lastAccess, avgFrequency}
    
    // Classification statistics
    this.stats = {
      immutableClassifications: 0,
      semiMutableClassifications: 0,
      volatileClassifications: 0,
      reclassifications: 0,
      totalClassifications: 0
    };
    
    console.log('[CLASSIFIER] DataClassificationEngine initialized', {
      finalityBlocks: this.config.finalityBlocks,
      rules: this.classificationRules.size
    });
  }
  
  /**
   * Classify data and return optimal caching strategy
   */
  classifyData(key, data, metadata = {}) {
    this.stats.totalClassifications++;
    
    // Extract data type from key
    const dataType = this.extractDataType(key);
    
    // Get base classification from rules
    let classification = this.classificationRules.get(dataType) || this.getDefaultClassification();
    
    // Apply dynamic adjustments based on data content
    classification = this.applyDynamicClassification(classification, data, metadata);
    
    // Apply access pattern optimizations
    classification = this.applyAccessPatternOptimization(classification, key);
    
    // Track access for pattern learning
    this.trackAccess(key);
    
    // Update statistics
    this.updateStats(classification.type);
    
    console.log(`[CLASSIFIER] Classified ${key} as ${classification.type} (TTL: ${this.formatTTL(classification.ttl)})`);
    
    return classification;
  }
  
  extractDataType(key) {
    // Parse key to determine data type
    const parts = key.split(':');
    const baseType = parts[0];
    
    // Handle compound keys
    if (baseType === 'transfers' && parts.length > 1) {
      return 'confirmed_transfers'; // Most transfers are historical
    }
    
    if (baseType === 'balance' && parts.length > 1) {
      return 'current_balance';
    }
    
    if (baseType === 'identity' && parts.length > 1) {
      return 'account_identity';
    }
    
    return baseType;
  }
  
  applyDynamicClassification(baseClassification, data, metadata) {
    const classification = { ...baseClassification };
    
    // Check for blockchain finality
    if (this.isBlockchainData(data)) {
      const finalityStatus = this.checkFinality(data);
      
      if (finalityStatus.isFinalized) {
        // Finalized blockchain data becomes immutable
        classification.type = 'IMMUTABLE';
        classification.ttl = 'FOREVER';
        classification.storage = 'persistent';
        classification.compression = true;
        
        console.log(`[CLASSIFIER] Upgraded to IMMUTABLE due to finality (${finalityStatus.confirmations} confirmations)`);
      } else if (finalityStatus.confirmations > 0) {
        // Partially confirmed but not finalized
        classification.type = 'SEMI_MUTABLE';
        classification.ttl = Math.max(300000, (this.config.finalityBlocks - finalityStatus.confirmations) * this.config.estimatedBlockTime);
        
        console.log(`[CLASSIFIER] Set as SEMI_MUTABLE with dynamic TTL based on confirmations`);
      }
    }
    
    // Check for staleness
    if (metadata.timestamp) {
      const age = Date.now() - new Date(metadata.timestamp).getTime();
      
      if (age > this.config.staleDataThreshold) {
        // Old data is likely stable
        if (classification.type === 'VOLATILE') {
          classification.type = 'SEMI_MUTABLE';
          classification.ttl = 3600000; // 1 hour
          console.log('[CLASSIFIER] Upgraded VOLATILE to SEMI_MUTABLE due to age');
        }
      }
    }
    
    // Check data size for compression decisions
    const dataSize = this.estimateDataSize(data);
    if (dataSize > 10240) { // 10KB
      classification.compression = true;
      console.log('[CLASSIFIER] Enabled compression for large data');
    }
    
    // Check for repetitive patterns for deduplication
    if (this.hasRepetitivePatterns(data)) {
      classification.deduplication = true;
      console.log('[CLASSIFIER] Enabled deduplication for repetitive data');
    }
    
    return classification;
  }
  
  applyAccessPatternOptimization(classification, key) {
    const pattern = this.accessPatterns.get(key);
    
    if (pattern) {
      const frequency = pattern.accessCount / Math.max(1, (Date.now() - pattern.firstAccess) / 3600000); // accesses per hour
      const recency = Date.now() - pattern.lastAccess;
      
      // Frequently accessed data should stay in hot cache longer
      if (frequency > 10 && classification.type !== 'IMMUTABLE') {
        classification.hotCacheTTL = Math.max(classification.ttl, 1800000); // 30 minutes
        console.log(`[CLASSIFIER] Extended hot cache TTL for frequently accessed data (${frequency.toFixed(1)}/hr)`);
      }
      
      // Recently accessed data should be promoted
      if (recency < this.config.hotDataThreshold && classification.storage === 'persistent') {
        classification.promoteToHot = true;
        console.log('[CLASSIFIER] Marked for hot cache promotion due to recent access');
      }
      
      // Rarely accessed data can use more aggressive compression
      if (frequency < 1 && classification.type === 'IMMUTABLE') {
        classification.aggressiveCompression = true;
        console.log('[CLASSIFIER] Enabled aggressive compression for rarely accessed data');
      }
    }
    
    return classification;
  }
  
  isBlockchainData(data) {
    // Check if data contains blockchain-specific fields
    if (Array.isArray(data)) {
      return data.some(item => 
        item.block_num || 
        item.blockNumber || 
        item.block_hash ||
        item.extrinsic_hash ||
        item.transaction_hash
      );
    }
    
    if (typeof data === 'object' && data !== null) {
      return !!(data.block_num || 
               data.blockNumber || 
               data.block_hash ||
               data.extrinsic_hash ||
               data.transaction_hash);
    }
    
    return false;
  }
  
  checkFinality(data) {
    const currentBlock = this.getCurrentBlockEstimate();
    
    if (Array.isArray(data)) {
      const blocks = data
        .map(item => item.block_num || item.blockNumber)
        .filter(block => block && !isNaN(block));
      
      if (blocks.length > 0) {
        const latestBlock = Math.max(...blocks);
        const confirmations = currentBlock - latestBlock;
        
        return {
          isFinalized: confirmations >= this.config.finalityBlocks,
          confirmations: Math.max(0, confirmations),
          latestBlock
        };
      }
    }
    
    if (typeof data === 'object' && data !== null) {
      const blockNum = data.block_num || data.blockNumber;
      if (blockNum && !isNaN(blockNum)) {
        const confirmations = currentBlock - blockNum;
        
        return {
          isFinalized: confirmations >= this.config.finalityBlocks,
          confirmations: Math.max(0, confirmations),
          latestBlock: blockNum
        };
      }
    }
    
    return { isFinalized: false, confirmations: 0, latestBlock: null };
  }
  
  getCurrentBlockEstimate() {
    if (this.config.currentBlockEstimate) {
      return this.config.currentBlockEstimate;
    }
    
    // Rough estimate based on Polkadot genesis and block time
    const genesisTime = 1590507378; // Polkadot mainnet genesis timestamp
    const secondsSinceGenesis = Math.floor(Date.now() / 1000) - genesisTime;
    return Math.floor(secondsSinceGenesis / (this.config.estimatedBlockTime / 1000));
  }
  
  estimateDataSize(data) {
    return JSON.stringify(data).length;
  }
  
  hasRepetitivePatterns(data) {
    if (!Array.isArray(data) || data.length < 2) {
      return false;
    }
    
    // Simple check for repetitive structures
    const sampleItems = data.slice(0, Math.min(10, data.length));
    const structures = sampleItems.map(item => Object.keys(item || {}).sort().join(','));
    
    // If all items have the same structure, enable deduplication
    const uniqueStructures = new Set(structures);
    return uniqueStructures.size === 1 && structures.length > 1;
  }
  
  trackAccess(key) {
    const now = Date.now();
    const existing = this.accessPatterns.get(key);
    
    if (existing) {
      existing.accessCount++;
      existing.lastAccess = now;
      
      // Update average frequency
      const totalTime = now - existing.firstAccess;
      existing.avgFrequency = existing.accessCount / Math.max(1, totalTime / 3600000); // per hour
    } else {
      this.accessPatterns.set(key, {
        accessCount: 1,
        firstAccess: now,
        lastAccess: now,
        avgFrequency: 0
      });
    }
  }
  
  updateStats(classificationType) {
    switch (classificationType) {
      case 'IMMUTABLE':
        this.stats.immutableClassifications++;
        break;
      case 'SEMI_MUTABLE':
        this.stats.semiMutableClassifications++;
        break;
      case 'VOLATILE':
        this.stats.volatileClassifications++;
        break;
    }
  }
  
  getDefaultClassification() {
    return {
      type: 'SEMI_MUTABLE',
      ttl: 3600000, // 1 hour
      storage: 'tiered',
      compression: false,
      deduplication: false
    };
  }
  
  formatTTL(ttl) {
    if (ttl === 'FOREVER' || ttl === null) {
      return 'FOREVER';
    }
    
    if (ttl < 60000) {
      return `${Math.round(ttl / 1000)}s`;
    }
    
    if (ttl < 3600000) {
      return `${Math.round(ttl / 60000)}m`;
    }
    
    return `${Math.round(ttl / 3600000)}h`;
  }
  
  /**
   * Update current block estimate for finality calculations
   */
  updateCurrentBlock(blockNumber) {
    this.config.currentBlockEstimate = blockNumber;
    console.log(`[CLASSIFIER] Updated current block estimate to ${blockNumber}`);
  }
  
  /**
   * Add or update classification rule
   */
  addRule(dataType, classification) {
    this.classificationRules.set(dataType, classification);
    console.log(`[CLASSIFIER] Added/updated rule for ${dataType}: ${classification.type}`);
  }
  
  /**
   * Get access pattern for a key
   */
  getAccessPattern(key) {
    return this.accessPatterns.get(key) || null;
  }
  
  /**
   * Get classification statistics
   */
  getStats() {
    const total = this.stats.totalClassifications;
    
    return {
      classifications: {
        total: total,
        immutable: this.stats.immutableClassifications,
        semiMutable: this.stats.semiMutableClassifications,
        volatile: this.stats.volatileClassifications,
        reclassifications: this.stats.reclassifications
      },
      
      distribution: {
        immutablePct: total > 0 ? (this.stats.immutableClassifications / total * 100).toFixed(1) + '%' : '0%',
        semiMutablePct: total > 0 ? (this.stats.semiMutableClassifications / total * 100).toFixed(1) + '%' : '0%',
        volatilePct: total > 0 ? (this.stats.volatileClassifications / total * 100).toFixed(1) + '%' : '0%'
      },
      
      accessPatterns: {
        trackedKeys: this.accessPatterns.size,
        topAccessed: this.getTopAccessedKeys(5)
      },
      
      rules: {
        total: this.classificationRules.size,
        byType: this.getRulesByType()
      }
    };
  }
  
  getTopAccessedKeys(limit = 10) {
    return Array.from(this.accessPatterns.entries())
      .sort((a, b) => b[1].accessCount - a[1].accessCount)
      .slice(0, limit)
      .map(([key, pattern]) => ({
        key: key.length > 30 ? key.slice(0, 30) + '...' : key,
        accessCount: pattern.accessCount,
        frequency: pattern.avgFrequency.toFixed(2) + '/hr'
      }));
  }
  
  getRulesByType() {
    const byType = { IMMUTABLE: 0, SEMI_MUTABLE: 0, VOLATILE: 0 };
    
    for (const rule of this.classificationRules.values()) {
      byType[rule.type] = (byType[rule.type] || 0) + 1;
    }
    
    return byType;
  }
  
  /**
   * Clear access patterns (useful for testing)
   */
  clearAccessPatterns() {
    this.accessPatterns.clear();
    console.log('[CLASSIFIER] Access patterns cleared');
  }
  
  /**
   * Optimize rules based on access patterns
   */
  optimizeRules() {
    console.log('[CLASSIFIER] Optimizing classification rules based on access patterns...');
    
    let optimizations = 0;
    
    for (const [key, pattern] of this.accessPatterns.entries()) {
      const dataType = this.extractDataType(key);
      const currentRule = this.classificationRules.get(dataType);
      
      if (currentRule && pattern.accessCount > 100) {
        // Frequently accessed data might benefit from different classification
        if (currentRule.type === 'SEMI_MUTABLE' && pattern.avgFrequency > 50) {
          // Very frequently accessed, consider promoting
          const optimizedRule = {
            ...currentRule,
            ttl: Math.max(currentRule.ttl, 3600000), // At least 1 hour
            hotCacheTTL: 1800000 // 30 minutes in hot cache
          };
          
          this.classificationRules.set(dataType, optimizedRule);
          optimizations++;
        }
      }
    }
    
    this.stats.reclassifications += optimizations;
    console.log(`[CLASSIFIER] Rule optimization complete: ${optimizations} rules updated`);
    
    return optimizations;
  }
}