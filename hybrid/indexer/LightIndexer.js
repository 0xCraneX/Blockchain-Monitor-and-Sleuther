import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

export class LightIndexer extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Indexing configuration
      maxBlocksInMemory: config.maxBlocksInMemory || 1000,
      persistenceInterval: config.persistenceInterval || 300000, // 5 minutes
      indexPath: config.indexPath || './hybrid/indexer/data',
      
      // Performance tuning
      batchSize: config.batchSize || 10,
      maxConcurrentBlocks: config.maxConcurrentBlocks || 5,
      
      // Storage optimization
      compressionEnabled: config.compressionEnabled || true,
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB
      
      ...config
    };
    
    // In-memory indexes
    this.transferIndex = new Map(); // address -> transfers[]
    this.blockIndex = new Map();    // blockNumber -> block data
    this.eventIndex = new Map();    // blockNumber -> events[]
    
    // Processing state
    this.lastIndexedBlock = 0;
    this.isIndexing = false;
    this.indexingQueue = [];
    this.processingBlocks = new Set();
    
    // Performance metrics
    this.metrics = {
      blocksIndexed: 0,
      eventsIndexed: 0,
      transfersIndexed: 0,
      indexingRate: 0,
      averageBlockTime: 0,
      lastIndexTime: null,
      diskWrites: 0,
      diskReads: 0
    };
    
    // Address tracking for whale monitoring
    this.monitoredAddresses = new Set();
    this.addressActivity = new Map(); // address -> recent activity
    
    this.initializeIndexer();
    
    console.log('[INDEXER] LightIndexer initialized', {
      maxBlocksInMemory: this.config.maxBlocksInMemory,
      persistenceInterval: this.config.persistenceInterval,
      indexPath: this.config.indexPath
    });
  }
  
  async initializeIndexer() {
    try {
      await fs.mkdir(this.config.indexPath, { recursive: true });
      await this.loadLastIndexedBlock();
      this.startPersistenceTimer();
      this.startMetricsCalculation();
    } catch (error) {
      console.error('[INDEXER] Failed to initialize:', error.message);
    }
  }
  
  async loadLastIndexedBlock() {
    try {
      const statePath = path.join(this.config.indexPath, 'indexer-state.json');
      const stateData = await fs.readFile(statePath, 'utf8');
      const state = JSON.parse(stateData);
      
      this.lastIndexedBlock = state.lastIndexedBlock || 0;
      
      console.log(`[INDEXER] Resumed from block ${this.lastIndexedBlock}`);
    } catch (error) {
      console.log('[INDEXER] Starting fresh indexing from current block');
      this.lastIndexedBlock = 0;
    }
  }
  
  async saveIndexerState() {
    try {
      const statePath = path.join(this.config.indexPath, 'indexer-state.json');
      const state = {
        lastIndexedBlock: this.lastIndexedBlock,
        timestamp: Date.now(),
        metrics: this.metrics
      };
      
      await fs.writeFile(statePath, JSON.stringify(state, null, 2));
      this.metrics.diskWrites++;
    } catch (error) {
      console.error('[INDEXER] Failed to save state:', error.message);
    }
  }
  
  startIndexing(rpcClient) {
    if (this.isIndexing) {
      console.log('[INDEXER] Already indexing');
      return;
    }
    
    this.isIndexing = true;
    this.rpcClient = rpcClient;
    
    console.log('[INDEXER] Starting blockchain indexing...');
    
    // Subscribe to new blocks
    this.rpcClient.on('newBlock', (blockInfo) => {
      this.queueBlockForIndexing(blockInfo);
    });
    
    // Start processing queue
    this.startQueueProcessor();
    
    console.log('[INDEXER] Blockchain indexing started');
  }
  
  queueBlockForIndexing(blockInfo) {
    if (blockInfo.number <= this.lastIndexedBlock) {
      return; // Already indexed
    }
    
    if (this.processingBlocks.has(blockInfo.number)) {
      return; // Already processing
    }
    
    this.indexingQueue.push(blockInfo);
    
    // Keep queue sorted by block number
    this.indexingQueue.sort((a, b) => a.number - b.number);
    
    console.log(`[INDEXER] Queued block ${blockInfo.number} (queue: ${this.indexingQueue.length})`);
  }
  
  startQueueProcessor() {
    setInterval(() => {
      this.processIndexingQueue();
    }, 1000); // Process every second
  }
  
  async processIndexingQueue() {
    if (this.indexingQueue.length === 0) return;
    if (this.processingBlocks.size >= this.config.maxConcurrentBlocks) return;
    
    const blockInfo = this.indexingQueue.shift();
    if (!blockInfo) return;
    
    this.processingBlocks.add(blockInfo.number);
    
    try {
      await this.indexBlock(blockInfo);
    } catch (error) {
      console.error(`[INDEXER] Error indexing block ${blockInfo.number}:`, error.message);
    } finally {
      this.processingBlocks.delete(blockInfo.number);
    }
  }
  
  async indexBlock(blockInfo) {
    const startTime = Date.now();
    
    try {
      // Get block events
      const events = await this.rpcClient.getBlockEvents(blockInfo.hash);
      
      // Process events
      const processedEvents = await this.processBlockEvents(events, blockInfo);
      
      // Store in memory indexes
      this.storeBlockData(blockInfo, processedEvents);
      
      // Update metrics
      this.updateIndexingMetrics(blockInfo, events.length, Date.now() - startTime);
      
      // Emit indexing event
      this.emit('blockIndexed', {
        blockNumber: blockInfo.number,
        eventCount: events.length,
        processingTime: Date.now() - startTime
      });
      
      console.log(`[INDEXER] Indexed block ${blockInfo.number} (${events.length} events, ${Date.now() - startTime}ms)`);
      
    } catch (error) {
      console.error(`[INDEXER] Failed to index block ${blockInfo.number}:`, error.message);
      throw error;
    }
  }
  
  async processBlockEvents(events, blockInfo) {
    const processedEvents = [];
    const transfers = [];
    
    for (const event of events) {
      const processedEvent = {
        blockNumber: blockInfo.number,
        blockHash: blockInfo.hash,
        section: event.section,
        method: event.method,
        data: event.data,
        phase: event.phase,
        timestamp: blockInfo.timestamp
      };
      
      processedEvents.push(processedEvent);
      
      // Extract transfer information
      if (event.section === 'balances' && event.method === 'Transfer') {
        const transfer = await this.parseTransferEvent(processedEvent);
        if (transfer) {
          transfers.push(transfer);
          this.indexTransfer(transfer);
        }
      }
      
      // Index other relevant events
      if (this.isRelevantEvent(event)) {
        await this.indexRelevantEvent(processedEvent);
      }
    }
    
    return {
      events: processedEvents,
      transfers,
      blockInfo
    };
  }
  
  async parseTransferEvent(event) {
    try {
      // Parse transfer data from event
      // This is simplified - real implementation would use proper codec
      const data = event.data;
      
      // For now, return a placeholder structure
      // Real implementation would decode the actual transfer data
      return {
        blockNumber: event.blockNumber,
        blockHash: event.blockHash,
        from: 'decoded_from_address',
        to: 'decoded_to_address',
        amount: 0, // decoded_amount
        timestamp: event.timestamp,
        hash: `${event.blockHash}-${event.phase}`,
        success: true
      };
    } catch (error) {
      console.error('[INDEXER] Failed to parse transfer event:', error.message);
      return null;
    }
  }
  
  indexTransfer(transfer) {
    this.metrics.transfersIndexed++;
    
    // Index by from address
    if (transfer.from) {
      this.addToAddressIndex(transfer.from, transfer);
    }
    
    // Index by to address
    if (transfer.to) {
      this.addToAddressIndex(transfer.to, transfer);
    }
    
    // Update address activity tracking
    this.updateAddressActivity(transfer);
    
    // Emit transfer event for real-time monitoring
    this.emit('transfer', transfer);
  }
  
  addToAddressIndex(address, transfer) {
    if (!this.transferIndex.has(address)) {
      this.transferIndex.set(address, []);
    }
    
    const transfers = this.transferIndex.get(address);
    transfers.push(transfer);
    
    // Keep only recent transfers in memory (last 1000 per address)
    if (transfers.length > 1000) {
      transfers.splice(0, transfers.length - 1000);
    }
    
    // Sort by block number (newest first)
    transfers.sort((a, b) => b.blockNumber - a.blockNumber);
  }
  
  updateAddressActivity(transfer) {
    const addresses = [transfer.from, transfer.to].filter(Boolean);
    
    for (const address of addresses) {
      if (!this.addressActivity.has(address)) {
        this.addressActivity.set(address, {
          lastActivity: transfer.timestamp,
          transferCount: 0,
          totalVolume: 0,
          patterns: new Set()
        });
      }
      
      const activity = this.addressActivity.get(address);
      activity.lastActivity = transfer.timestamp;
      activity.transferCount++;
      activity.totalVolume += transfer.amount;
      
      // Update patterns
      if (transfer.amount > 100000) {
        activity.patterns.add('whale_transfer');
      }
      
      if (this.monitoredAddresses.has(address)) {
        activity.patterns.add('monitored_whale');
      }
    }
  }
  
  isRelevantEvent(event) {
    const relevantEvents = [
      'balances.Transfer',
      'balances.Deposit',
      'balances.Withdraw',
      'staking.Bonded',
      'staking.Unbonded',
      'democracy.Voted'
    ];
    
    return relevantEvents.includes(`${event.section}.${event.method}`);
  }
  
  async indexRelevantEvent(event) {
    // Index other relevant events for pattern detection
    this.metrics.eventsIndexed++;
    
    // Could be extended for other event types
  }
  
  storeBlockData(blockInfo, processedData) {
    // Store in memory
    this.blockIndex.set(blockInfo.number, {
      ...blockInfo,
      eventCount: processedData.events.length,
      transferCount: processedData.transfers.length
    });
    
    this.eventIndex.set(blockInfo.number, processedData.events);
    
    // Update last indexed block
    this.lastIndexedBlock = Math.max(this.lastIndexedBlock, blockInfo.number);
    
    // Memory management
    this.manageMemoryUsage();
  }
  
  manageMemoryUsage() {
    // Remove old blocks from memory if we exceed limits
    if (this.blockIndex.size > this.config.maxBlocksInMemory) {
      const blocksToRemove = this.blockIndex.size - this.config.maxBlocksInMemory;
      const oldestBlocks = Array.from(this.blockIndex.keys())
        .sort((a, b) => a - b)
        .slice(0, blocksToRemove);
      
      for (const blockNumber of oldestBlocks) {
        this.blockIndex.delete(blockNumber);
        this.eventIndex.delete(blockNumber);
      }
      
      console.log(`[INDEXER] Cleaned up ${blocksToRemove} old blocks from memory`);
    }
  }
  
  updateIndexingMetrics(blockInfo, eventCount, processingTime) {
    this.metrics.blocksIndexed++;
    this.metrics.eventsIndexed += eventCount;
    this.metrics.lastIndexTime = Date.now();
    
    // Calculate average block processing time
    if (this.metrics.averageBlockTime === 0) {
      this.metrics.averageBlockTime = processingTime;
    } else {
      this.metrics.averageBlockTime = (this.metrics.averageBlockTime + processingTime) / 2;
    }
  }
  
  startPersistenceTimer() {
    setInterval(() => {
      this.persistIndexData();
    }, this.config.persistenceInterval);
  }
  
  startMetricsCalculation() {
    setInterval(() => {
      this.calculateIndexingRate();
    }, 30000); // Every 30 seconds
  }
  
  calculateIndexingRate() {
    const now = Date.now();
    const timeSinceStart = now - (this.metrics.lastIndexTime || now);
    
    if (timeSinceStart > 0) {
      this.metrics.indexingRate = (this.metrics.blocksIndexed * 1000) / timeSinceStart;
    }
  }
  
  async persistIndexData() {
    if (this.blockIndex.size === 0) return;
    
    try {
      console.log('[INDEXER] Persisting index data to disk...');
      
      // Save recent transfer data
      await this.persistTransferIndex();
      
      // Save indexer state
      await this.saveIndexerState();
      
      console.log(`[INDEXER] Persisted data for ${this.blockIndex.size} blocks`);
      
    } catch (error) {
      console.error('[INDEXER] Failed to persist data:', error.message);
    }
  }
  
  async persistTransferIndex() {
    const transferData = {};
    
    // Only persist transfers for monitored addresses
    for (const address of this.monitoredAddresses) {
      const transfers = this.transferIndex.get(address);
      if (transfers && transfers.length > 0) {
        transferData[address] = transfers.slice(0, 100); // Keep last 100 transfers
      }
    }
    
    const filePath = path.join(this.config.indexPath, `transfers-${Date.now()}.json`);
    await fs.writeFile(filePath, JSON.stringify(transferData, null, 2));
    
    this.metrics.diskWrites++;
  }
  
  // Query methods
  getAccountHistory(address, days = 7) {
    const transfers = this.transferIndex.get(address) || [];
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    return transfers.filter(transfer => transfer.timestamp > cutoffTime);
  }
  
  getRecentTransfers(limit = 100) {
    const allTransfers = [];
    
    for (const transfers of this.transferIndex.values()) {
      allTransfers.push(...transfers);
    }
    
    return allTransfers
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
  
  getBlockData(blockNumber) {
    return {
      block: this.blockIndex.get(blockNumber),
      events: this.eventIndex.get(blockNumber)
    };
  }
  
  addMonitoredAddress(address) {
    this.monitoredAddresses.add(address);
    console.log(`[INDEXER] Added monitored address: ${address}`);
  }
  
  removeMonitoredAddress(address) {
    this.monitoredAddresses.delete(address);
    console.log(`[INDEXER] Removed monitored address: ${address}`);
  }
  
  getAddressActivity(address) {
    return this.addressActivity.get(address) || null;
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      isIndexing: this.isIndexing,
      lastIndexedBlock: this.lastIndexedBlock,
      queueSize: this.indexingQueue.length,
      processingBlocks: this.processingBlocks.size,
      memoryUsage: {
        blocks: this.blockIndex.size,
        addresses: this.transferIndex.size,
        monitoredAddresses: this.monitoredAddresses.size
      },
      indexingRate: this.metrics.indexingRate.toFixed(2) + ' blocks/sec'
    };
  }
  
  async stop() {
    console.log('[INDEXER] Stopping indexer...');
    
    this.isIndexing = false;
    
    // Persist any remaining data
    await this.persistIndexData();
    
    console.log('[INDEXER] Indexer stopped');
  }
}