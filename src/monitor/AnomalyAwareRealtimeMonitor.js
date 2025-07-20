import RealtimeMonitor from './RealtimeMonitor.js';
import { createAnomalyEngine } from '../anomaly/index.js';
import { SubscanClient } from '../api/SubscanClient.js';
import { monitorLogger } from '../utils/logger.js';

/**
 * AnomalyAwareRealtimeMonitor - Enhanced real-time monitor with anomaly detection
 * Extends the base RealtimeMonitor with ML-powered anomaly detection for whale activity
 */
export class AnomalyAwareRealtimeMonitor extends RealtimeMonitor {
  constructor(config = {}) {
    super(config);
    
    // Extended configuration
    this.config = {
      ...this.config,
      // Anomaly detection settings
      anomalyDetectionEnabled: config.anomalyDetectionEnabled !== false,
      anomalyEngine: config.anomalyEngine || {},
      
      // Transaction history settings
      recentTransferWindow: config.recentTransferWindow || 7 * 24 * 60 * 60 * 1000, // 7 days
      maxRecentTransfers: config.maxRecentTransfers || 100,
      
      // Related address tracking
      trackRelatedAddresses: config.trackRelatedAddresses !== false,
      maxRelatedAddresses: config.maxRelatedAddresses || 20,
      
      // Alert enhancement
      enrichAlerts: config.enrichAlerts !== false,
      alertOnHighRiskOnly: config.alertOnHighRiskOnly || false,
      minRiskScore: config.minRiskScore || 0.5,
      
      // Performance settings
      batchAnomalyDetection: config.batchAnomalyDetection !== false,
      anomalyBatchSize: config.anomalyBatchSize || 10,
      anomalyBatchDelay: config.anomalyBatchDelay || 1000, // 1 second
      
      ...config
    };
    
    // Initialize anomaly engine
    this.anomalyEngine = createAnomalyEngine(this.config.anomalyEngine);
    
    // Initialize Subscan client for fetching historical data
    this.subscanClient = new SubscanClient(config.subscan);
    
    // Transaction history cache
    this.transactionHistory = new Map(); // address -> recent transfers
    
    // Related addresses cache
    this.relatedAddresses = new Map(); // address -> Set of related addresses
    
    // Anomaly detection queue
    this.anomalyQueue = [];
    this.anomalyQueueTimer = null;
    
    // Enhanced statistics
    this.anomalyStats = {
      totalAnomaliesDetected: 0,
      anomaliesByRiskLevel: {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        CRITICAL: 0
      },
      anomaliesByType: {},
      avgRiskScore: 0
    };
  }
  
  /**
   * Override watchAddress to initialize transaction history
   */
  async watchAddress(address, metadata = {}) {
    const result = await super.watchAddress(address, metadata);
    
    if (result && this.config.anomalyDetectionEnabled) {
      // Fetch recent transaction history for anomaly detection
      await this.initializeTransactionHistory(address);
    }
    
    return result;
  }
  
  /**
   * Initialize transaction history for an address
   */
  async initializeTransactionHistory(address) {
    try {
      monitorLogger.debug(`Fetching transaction history for ${address.slice(0, 8)}...`);
      
      // Fetch recent transfers
      const transfers = await this.subscanClient.getTransfers(address, 1, 100);
      
      if (transfers && transfers.data && transfers.data.transfers) {
        const recentTransfers = transfers.data.transfers
          .filter(tx => {
            const txTime = new Date(tx.block_timestamp * 1000).getTime();
            return Date.now() - txTime <= this.config.recentTransferWindow;
          })
          .slice(0, this.config.maxRecentTransfers);
        
        this.transactionHistory.set(address, recentTransfers);
        
        // Extract related addresses
        if (this.config.trackRelatedAddresses) {
          const related = new Set();
          recentTransfers.forEach(tx => {
            if (tx.from !== address && related.size < this.config.maxRelatedAddresses) {
              related.add(tx.from);
            }
            if (tx.to !== address && related.size < this.config.maxRelatedAddresses) {
              related.add(tx.to);
            }
          });
          this.relatedAddresses.set(address, related);
        }
        
        monitorLogger.debug(`Loaded ${recentTransfers.length} recent transfers for ${address.slice(0, 8)}...`);
      }
    } catch (error) {
      monitorLogger.error(`Failed to fetch transaction history for ${address}`, error);
    }
  }
  
  /**
   * Override handleBalanceChange to add anomaly detection
   */
  handleBalanceChange(address, accountInfo, metadata) {
    // Call parent implementation
    super.handleBalanceChange(address, accountInfo, metadata);
    
    if (!this.config.anomalyDetectionEnabled) return;
    
    const sub = this.subscriptions.get(address);
    if (!sub || sub.previousBalance === null) return;
    
    const currentBalance = parseFloat(
      accountInfo.data.free.toString() + '.' + 
      accountInfo.data.free.mod(1e10).toString()
    ) / 1e10;
    
    const change = currentBalance - sub.previousBalance;
    
    // Only analyze significant changes
    if (Math.abs(change) >= this.config.minTransferAmount) {
      this.queueAnomalyDetection({
        address,
        activity: {
          type: 'balance_change',
          amount: Math.abs(change),
          direction: change > 0 ? 'increase' : 'decrease',
          timestamp: new Date().toISOString(),
          balance: currentBalance
        },
        metadata
      });
    }
  }
  
  /**
   * Override handleTransferEvent to add anomaly detection
   */
  handleTransferEvent(address, transfer, metadata) {
    // Call parent implementation
    super.handleTransferEvent(address, transfer, metadata);
    
    if (!this.config.anomalyDetectionEnabled) return;
    
    const amount = parseFloat(transfer.amount) / 1e10;
    
    if (amount >= this.config.minTransferAmount) {
      // Update transaction history
      this.updateTransactionHistory(address, {
        ...transfer,
        amount: amount.toString(),
        block_timestamp: Math.floor(Date.now() / 1000)
      });
      
      // Queue anomaly detection
      this.queueAnomalyDetection({
        address,
        activity: {
          type: 'transfer',
          amount: amount,
          counterparty: transfer.from === address ? transfer.to : transfer.from,
          direction: transfer.from === address ? 'outgoing' : 'incoming',
          timestamp: new Date().toISOString(),
          blockNumber: transfer.blockNumber
        },
        metadata
      });
    }
  }
  
  /**
   * Queue activity for anomaly detection
   */
  queueAnomalyDetection(item) {
    this.anomalyQueue.push(item);
    
    if (this.config.batchAnomalyDetection) {
      // Process in batches
      if (this.anomalyQueue.length >= this.config.anomalyBatchSize) {
        this.processAnomalyQueue();
      } else if (!this.anomalyQueueTimer) {
        // Set timer for batch processing
        this.anomalyQueueTimer = setTimeout(
          () => this.processAnomalyQueue(),
          this.config.anomalyBatchDelay
        );
      }
    } else {
      // Process immediately
      this.processAnomalyQueue();
    }
  }
  
  /**
   * Process queued items for anomaly detection
   */
  async processAnomalyQueue() {
    if (this.anomalyQueue.length === 0) return;
    
    // Clear timer
    if (this.anomalyQueueTimer) {
      clearTimeout(this.anomalyQueueTimer);
      this.anomalyQueueTimer = null;
    }
    
    // Take items from queue
    const items = this.anomalyQueue.splice(0, this.config.anomalyBatchSize);
    
    // Process each item
    for (const item of items) {
      try {
        await this.detectAnomalies(item);
      } catch (error) {
        monitorLogger.error(`Anomaly detection failed for ${item.address}`, error);
      }
    }
    
    // Continue processing if more items
    if (this.anomalyQueue.length > 0) {
      this.anomalyQueueTimer = setTimeout(
        () => this.processAnomalyQueue(),
        this.config.anomalyBatchDelay
      );
    }
  }
  
  /**
   * Run anomaly detection on activity
   */
  async detectAnomalies({ address, activity, metadata }) {
    try {
      // Get recent transfers and related addresses
      const recentTransfers = this.transactionHistory.get(address) || [];
      const relatedAddresses = Array.from(this.relatedAddresses.get(address) || []);
      
      // Run anomaly detection
      const result = await this.anomalyEngine.analyzeActivity(
        address,
        activity,
        recentTransfers,
        relatedAddresses
      );
      
      // Update statistics
      this.updateAnomalyStats(result);
      
      // Check if we should alert
      if (result.riskLevel !== 'NONE' && result.riskScore >= this.config.minRiskScore) {
        if (!this.config.alertOnHighRiskOnly || result.riskLevel === 'HIGH' || result.riskLevel === 'CRITICAL') {
          // Create enhanced alert
          const anomalyAlert = this.createAnomalyAlert(address, activity, result, metadata);
          
          // Trigger alert callback
          this.alertCallback(anomalyAlert);
          
          monitorLogger.warn(`Anomaly detected: ${result.summary}`, {
            address: address.slice(0, 8) + '...',
            riskScore: result.riskScore.toFixed(2),
            riskLevel: result.riskLevel
          });
        }
      }
      
    } catch (error) {
      monitorLogger.error(`Anomaly detection error for ${address}`, error);
    }
  }
  
  /**
   * Create enhanced alert with anomaly information
   */
  createAnomalyAlert(address, activity, anomalyResult, metadata) {
    const primaryAnomaly = anomalyResult.anomalies[0];
    
    return {
      id: `anomaly_${address}_${Date.now()}`,
      type: 'anomaly_detection',
      pattern: primaryAnomaly.type,
      severity: this.mapRiskLevelToSeverity(anomalyResult.riskLevel),
      title: `Anomaly Detected: ${this.formatAnomalyType(primaryAnomaly.type)}`,
      description: anomalyResult.summary,
      message: primaryAnomaly.description,
      timestamp: new Date().toISOString(),
      address,
      amount: activity.amount,
      metadata: {
        ...metadata,
        activityType: activity.type,
        riskScore: anomalyResult.riskScore,
        riskLevel: anomalyResult.riskLevel,
        anomalyCount: anomalyResult.anomalyCount,
        anomalies: anomalyResult.anomalies.map(a => ({
          type: a.type,
          severity: a.severity,
          confidence: a.confidence,
          description: a.description
        })),
        recommendations: anomalyResult.recommendations,
        riskFactors: anomalyResult.riskFactors,
        source: 'anomaly_engine'
      }
    };
  }
  
  /**
   * Update transaction history
   */
  updateTransactionHistory(address, transfer) {
    const history = this.transactionHistory.get(address) || [];
    
    // Add new transfer
    history.unshift(transfer);
    
    // Remove old transfers
    const cutoffTime = Date.now() / 1000 - (this.config.recentTransferWindow / 1000);
    const filtered = history
      .filter(tx => tx.block_timestamp > cutoffTime)
      .slice(0, this.config.maxRecentTransfers);
    
    this.transactionHistory.set(address, filtered);
    
    // Update related addresses
    if (this.config.trackRelatedAddresses) {
      const related = this.relatedAddresses.get(address) || new Set();
      const counterparty = transfer.from === address ? transfer.to : transfer.from;
      
      if (related.size < this.config.maxRelatedAddresses) {
        related.add(counterparty);
        this.relatedAddresses.set(address, related);
      }
    }
  }
  
  /**
   * Update anomaly statistics
   */
  updateAnomalyStats(result) {
    if (result.riskLevel !== 'NONE') {
      this.anomalyStats.totalAnomaliesDetected++;
      this.anomalyStats.anomaliesByRiskLevel[result.riskLevel]++;
      
      // Update average risk score
      const total = this.anomalyStats.totalAnomaliesDetected;
      this.anomalyStats.avgRiskScore = 
        (this.anomalyStats.avgRiskScore * (total - 1) + result.riskScore) / total;
      
      // Count by type
      result.anomalies.forEach(anomaly => {
        this.anomalyStats.anomaliesByType[anomaly.type] = 
          (this.anomalyStats.anomaliesByType[anomaly.type] || 0) + 1;
      });
    }
  }
  
  /**
   * Map risk level to alert severity
   */
  mapRiskLevelToSeverity(riskLevel) {
    const mapping = {
      'CRITICAL': 'critical',
      'HIGH': 'high',
      'MEDIUM': 'medium',
      'LOW': 'low',
      'NONE': 'info'
    };
    return mapping[riskLevel] || 'medium';
  }
  
  /**
   * Format anomaly type for display
   */
  formatAnomalyType(type) {
    return type
      .split('_')
      .map(word => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  /**
   * Get enhanced statistics
   */
  getStats() {
    const baseStats = super.getStats();
    
    return {
      ...baseStats,
      anomalyDetection: {
        enabled: this.config.anomalyDetectionEnabled,
        ...this.anomalyStats,
        queueSize: this.anomalyQueue.length,
        historyCacheSize: this.transactionHistory.size,
        engineStats: this.anomalyEngine.getStats()
      }
    };
  }
  
  /**
   * Clean up resources
   */
  async disconnect() {
    // Clear anomaly queue
    if (this.anomalyQueueTimer) {
      clearTimeout(this.anomalyQueueTimer);
    }
    this.anomalyQueue = [];
    
    // Clear caches
    this.transactionHistory.clear();
    this.relatedAddresses.clear();
    
    // Disconnect parent
    await super.disconnect();
  }
}

export default AnomalyAwareRealtimeMonitor;