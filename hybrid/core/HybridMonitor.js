import { PolkadotRpcClient } from './RpcClient.js';
import { SubscanBridge } from './SubscanBridge.js';
import { UnifiedAlertEngine } from './UnifiedAlertEngine.js';
import { TieredCache } from '../cache/TieredCache.js';
import { SmartFetcher } from '../cache/SmartFetcher.js';
import { LightIndexer } from '../indexer/LightIndexer.js';
import { TransferCodec } from './TransferCodec.js';
import { EventEmitter } from 'events';

export class HybridWhaleMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Whale detection thresholds (in DOT)
      thresholds: {
        notable: 10000,
        important: 100000,
        critical: 1000000
      },
      
      // Monitoring configuration
      topAccountsLimit: 1000,
      blockScanDepth: 100,
      enableRealTimeMode: true,
      enableHistoricalMode: true,
      
      // Cache configuration
      cacheConfig: {
        l1TTL: 30000,    // 30 seconds
        l2TTL: 300000,   // 5 minutes
        l3TTL: 3600000   // 1 hour
      },
      
      ...config
    };
    
    // Initialize components
    this.rpcClient = new PolkadotRpcClient(this.config.rpc);
    this.subscanBridge = new SubscanBridge(this.config.subscan);
    this.alertEngine = new UnifiedAlertEngine(this.config.alerts);
    this.cacheManager = new TieredCache(this.config.cacheConfig);
    this.smartFetcher = new SmartFetcher(this.config.fetcher);
    this.lightIndexer = new LightIndexer(this.config.indexer);
    this.transferCodec = new TransferCodec(this.config.codec);
    
    // State management
    this.isRunning = false;
    this.monitoredAddresses = new Set();
    this.lastProcessedBlock = 0;
    
    // Metrics
    this.metrics = {
      startTime: null,
      alertsGenerated: 0,
      rpcAlertsGenerated: 0,
      enrichedAlertsGenerated: 0,
      errorsEncountered: 0,
      averageAlertLatency: 0
    };
    
    this.setupEventHandlers();
    
    console.log('[HYBRID] HybridWhaleMonitor initialized', {
      thresholds: this.config.thresholds,
      topAccountsLimit: this.config.topAccountsLimit,
      realTimeMode: this.config.enableRealTimeMode,
      historicalMode: this.config.enableHistoricalMode
    });
  }
  
  setupEventHandlers() {
    // RPC Client events
    this.rpcClient.on('connected', () => {
      console.log('[HYBRID] RPC client connected');
      this.emit('rpcConnected');
    });
    
    this.rpcClient.on('disconnected', () => {
      console.log('[HYBRID] RPC client disconnected');
      this.emit('rpcDisconnected');
    });
    
    this.rpcClient.on('newBlock', (blockInfo) => {
      this.handleNewBlock(blockInfo);
    });
    
    this.rpcClient.on('error', (error) => {
      console.error('[HYBRID] RPC client error:', error.message);
      this.metrics.errorsEncountered++;
      this.emit('error', { source: 'rpc', error });
    });
    
    // Alert Engine events
    this.alertEngine.on('alert', (alert) => {
      this.handleQuickAlert(alert);
    });
    
    this.alertEngine.on('enriched-alert', (alert) => {
      this.handleEnrichedAlert(alert);
    });
    
    // Subscan Bridge events
    this.subscanBridge.on('enriched', (data) => {
      this.alertEngine.processEnrichment(data);
    });
    
    this.subscanBridge.on('error', (error) => {
      console.error('[HYBRID] Subscan bridge error:', error.message);
      this.metrics.errorsEncountered++;
      this.emit('error', { source: 'subscan', error });
    });
    
    // Light Indexer events
    this.lightIndexer.on('blockIndexed', (data) => {
      this.emit('blockIndexed', data);
    });
    
    this.lightIndexer.on('transfer', (transfer) => {
      this.handleIndexedTransfer(transfer);
    });
    
    // Smart Fetcher events
    this.smartFetcher.on('fetchCompleted', (data) => {
      this.handleFetchCompletion(data);
    });
  }
  
  async start() {
    if (this.isRunning) {
      console.log('[HYBRID] Monitor already running');
      return;
    }
    
    console.log('[HYBRID] Starting Hybrid Whale Monitor...');
    this.metrics.startTime = Date.now();
    
    try {
      // 1. Connect to RPC
      await this.rpcClient.connect();
      
      // 2. Initialize Subscan bridge
      await this.subscanBridge.initialize();
      
      // 3. Load top accounts to monitor
      await this.loadTopAccounts();
      
      // 4. Start light indexer
      this.lightIndexer.startIndexing(this.rpcClient);
      
      // 5. Start real-time monitoring
      if (this.config.enableRealTimeMode) {
        await this.startRealTimeMonitoring();
      }
      
      // 6. Start background enrichment
      this.startBackgroundEnrichment();
      
      this.isRunning = true;
      console.log('[HYBRID] Hybrid Whale Monitor started successfully');
      this.emit('started');
      
    } catch (error) {
      console.error('[HYBRID] Failed to start monitor:', error.message);
      this.emit('error', { source: 'startup', error });
      throw error;
    }
  }
  
  async loadTopAccounts() {
    console.log('[HYBRID] Loading top accounts...');
    
    try {
      // Try to get from cache first
      const cachedAccounts = await this.cacheManager.get('top-accounts');
      
      if (cachedAccounts) {
        console.log(`[HYBRID] Loaded ${cachedAccounts.length} accounts from cache`);
        this.monitoredAddresses = new Set(cachedAccounts);
        return;
      }
      
      // Fetch from Subscan if not cached
      const topAccounts = await this.subscanBridge.getTopAccounts(this.config.topAccountsLimit);
      
      if (topAccounts && topAccounts.length > 0) {
        this.monitoredAddresses = new Set(topAccounts.map(acc => acc.address));
        
        // Cache for future use
        await this.cacheManager.set('top-accounts', Array.from(this.monitoredAddresses), 3600000); // 1 hour
        
        console.log(`[HYBRID] Loaded ${this.monitoredAddresses.size} top accounts`);
      } else {
        console.warn('[HYBRID] No top accounts loaded, using fallback list');
        // Fallback to some known whale addresses
        this.monitoredAddresses = new Set([
          '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn', // Treasury
          '1zugcavYA9yCuYwiEYeMHNJm9gXznYjNfXQjZsZukF1Mpow',   // Known whale
        ]);
      }
      
    } catch (error) {
      console.error('[HYBRID] Failed to load top accounts:', error.message);
      // Continue with empty set - we can still monitor transfers from RPC events
      this.monitoredAddresses = new Set();
    }
  }
  
  async startRealTimeMonitoring() {
    console.log('[HYBRID] Starting real-time monitoring...');
    
    // Subscribe to balance changes for monitored addresses
    const subscriptionPromises = Array.from(this.monitoredAddresses).map(async (address) => {
      try {
        await this.rpcClient.subscribeBalance(address, (balance) => {
          this.handleBalanceChange(address, balance);
        });
      } catch (error) {
        console.error(`[HYBRID] Failed to subscribe to ${address}:`, error.message);
      }
    });
    
    await Promise.allSettled(subscriptionPromises);
    
    console.log(`[HYBRID] Real-time monitoring active for ${this.monitoredAddresses.size} addresses`);
  }
  
  startBackgroundEnrichment() {
    console.log('[HYBRID] Starting background enrichment...');
    
    // Schedule periodic enrichment tasks
    setInterval(() => {
      this.performBackgroundEnrichment();
    }, 60000); // Every minute
    
    // Schedule cache cleanup
    setInterval(() => {
      this.cacheManager.cleanup();
    }, 300000); // Every 5 minutes
  }
  
  async handleNewBlock(blockInfo) {
    if (blockInfo.number <= this.lastProcessedBlock) return;
    
    this.lastProcessedBlock = blockInfo.number;
    
    try {
      // Get block events and scan for large transfers
      const events = await this.rpcClient.getBlockEvents(blockInfo.hash);
      
      for (const event of events) {
        if (event.section === 'balances' && event.method === 'Transfer') {
          await this.processTransferEvent(event, blockInfo);
        }
      }
      
    } catch (error) {
      console.error(`[HYBRID] Error processing block ${blockInfo.number}:`, error.message);
      this.metrics.errorsEncountered++;
    }
  }
  
  async processTransferEvent(event, blockInfo) {
    try {
      // Parse transfer data (simplified - real implementation would be more robust)
      const transferData = this.parseTransferEvent(event);
      
      if (!transferData) return;
      
      // Check if it meets whale thresholds
      const threshold = this.classifyTransferAmount(transferData.amount);
      
      if (threshold) {
        const quickAlert = {
          id: `rpc-${blockInfo.number}-${event.phase}`,
          type: 'transfer',
          severity: threshold,
          amount: transferData.amount,
          from: transferData.from,
          to: transferData.to,
          blockNumber: blockInfo.number,
          blockHash: blockInfo.hash,
          timestamp: blockInfo.timestamp,
          source: 'rpc',
          latency: Date.now() - blockInfo.timestamp
        };
        
        this.alertEngine.processRpcAlert(quickAlert);
      }
      
    } catch (error) {
      console.error('[HYBRID] Error processing transfer event:', error.message);
    }
  }
  
  parseTransferEvent(event) {
    return this.transferCodec.parseTransferEvent(event);
  }
  
  classifyTransferAmount(amount) {
    if (amount >= this.config.thresholds.critical) return 'critical';
    if (amount >= this.config.thresholds.important) return 'important';
    if (amount >= this.config.thresholds.notable) return 'notable';
    return null;
  }
  
  handleBalanceChange(address, balance) {
    // This would trigger on any balance change
    // We'd need to determine if it's a significant change
    const change = this.calculateBalanceChange(address, balance);
    
    if (change && Math.abs(change.amount) >= this.config.thresholds.notable) {
      const alert = {
        id: `balance-${address}-${Date.now()}`,
        type: 'balance_change',
        address,
        change: change.amount,
        newBalance: balance.free,
        timestamp: balance.timestamp,
        source: 'rpc-subscription'
      };
      
      this.alertEngine.processRpcAlert(alert);
    }
  }
  
  calculateBalanceChange(address, newBalance) {
    // Would need to compare with previous balance
    // This is simplified for now
    return { amount: 0 };
  }
  
  async handleQuickAlert(alert) {
    this.metrics.rpcAlertsGenerated++;
    this.metrics.alertsGenerated++;
    
    console.log(`[HYBRID] Quick alert: ${alert.type} ${alert.amount} DOT`);
    
    // Emit immediate alert
    this.emit('alert', {
      ...alert,
      enriched: false,
      processingTime: Date.now() - alert.timestamp
    });
    
    // Queue for enrichment
    this.subscanBridge.scheduleEnrichment(alert);
  }
  
  async handleEnrichedAlert(alert) {
    this.metrics.enrichedAlertsGenerated++;
    
    console.log(`[HYBRID] Enriched alert: ${alert.type} ${alert.amount} DOT (${alert.enrichment?.identity?.display || 'Unknown'})`);
    
    // Emit enriched alert
    this.emit('enrichedAlert', {
      ...alert,
      enriched: true,
      totalProcessingTime: Date.now() - alert.originalTimestamp
    });
  }
  
  async performBackgroundEnrichment() {
    // Periodically enrich cached data
    try {
      // Update identity data for monitored addresses
      const addressesToUpdate = Array.from(this.monitoredAddresses).slice(0, 10); // Batch process
      
      for (const address of addressesToUpdate) {
        const identity = await this.subscanBridge.getIdentity(address);
        if (identity) {
          await this.cacheManager.set(`identity-${address}`, identity, 3600000);
        }
      }
      
    } catch (error) {
      console.error('[HYBRID] Background enrichment error:', error.message);
    }
  }
  
  async stop() {
    if (!this.isRunning) return;
    
    console.log('[HYBRID] Stopping Hybrid Whale Monitor...');
    
    try {
      await this.rpcClient.disconnect();
      await this.subscanBridge.cleanup();
      
      this.isRunning = false;
      console.log('[HYBRID] Hybrid Whale Monitor stopped');
      this.emit('stopped');
      
    } catch (error) {
      console.error('[HYBRID] Error during shutdown:', error.message);
      throw error;
    }
  }
  
  getMetrics() {
    const rpcMetrics = this.rpcClient.getMetrics();
    const subscanMetrics = this.subscanBridge.getMetrics();
    const cacheMetrics = this.cacheManager.getMetrics();
    
    return {
      uptime: this.metrics.startTime ? Date.now() - this.metrics.startTime : 0,
      isRunning: this.isRunning,
      monitoredAddresses: this.monitoredAddresses.size,
      lastProcessedBlock: this.lastProcessedBlock,
      
      // Alert metrics
      totalAlerts: this.metrics.alertsGenerated,
      rpcAlerts: this.metrics.rpcAlertsGenerated,
      enrichedAlerts: this.metrics.enrichedAlertsGenerated,
      
      // Component metrics
      rpc: rpcMetrics,
      subscan: subscanMetrics,
      cache: cacheMetrics,
      
      // Error tracking
      errors: this.metrics.errorsEncountered
    };
  }
  
  // Development/testing methods
  async addTestAddress(address) {
    this.monitoredAddresses.add(address);
    
    if (this.isRunning) {
      try {
        await this.rpcClient.subscribeBalance(address, (balance) => {
          this.handleBalanceChange(address, balance);
        });
        console.log(`[HYBRID] Added test address: ${address}`);
      } catch (error) {
        console.error(`[HYBRID] Failed to add test address ${address}:`, error.message);
      }
    }
  }
  
  async simulateAlert(alertData) {
    const simulatedAlert = {
      id: `sim-${Date.now()}`,
      source: 'simulation',
      timestamp: Date.now(),
      ...alertData
    };
    
    await this.handleQuickAlert(simulatedAlert);
  }
}