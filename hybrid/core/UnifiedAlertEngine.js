import { EventEmitter } from 'events';

export class UnifiedAlertEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Alert processing configuration
      enrichmentTimeout: config.enrichmentTimeout || 30000, // 30 seconds max wait
      batchEnrichment: config.batchEnrichment || false,
      maxBatchSize: config.maxBatchSize || 10,
      
      // Pattern matching thresholds
      patterns: {
        whaleThreshold: 100000,      // 100k DOT
        coordinationWindow: 3600000, // 1 hour for coordinated movements
        dormantAccountDays: 180,     // Consider account dormant after 180 days
        ...config.patterns
      },
      
      ...config
    };
    
    // Alert state management
    this.pendingAlerts = new Map(); // Alerts waiting for enrichment
    this.processedAlerts = new Map(); // Recently processed alerts for deduplication
    this.alertHistory = [];
    
    // Pattern detection state
    this.recentActivity = new Map(); // Track recent transfers by address
    this.coordinatedMovements = new Map(); // Track potential coordinated activity
    
    // Metrics
    this.metrics = {
      alertsProcessed: 0,
      alertsEnriched: 0,
      patternsDetected: 0,
      duplicatesFiltered: 0,
      processingTimes: []
    };
    
    // Start background processing
    this.startEnrichmentProcessor();
    this.startPatternDetector();
    
    console.log('[ALERT] UnifiedAlertEngine initialized', {
      enrichmentTimeout: this.config.enrichmentTimeout,
      whaleThreshold: this.config.patterns.whaleThreshold
    });
  }
  
  processRpcAlert(rawAlert) {
    const startTime = Date.now();
    
    try {
      // Validate and normalize alert
      const alert = this.normalizeAlert(rawAlert);
      
      if (!alert) {
        console.warn('[ALERT] Invalid alert rejected:', rawAlert);
        return;
      }
      
      // Check for duplicates
      if (this.isDuplicate(alert)) {
        this.metrics.duplicatesFiltered++;
        console.log(`[ALERT] Duplicate alert filtered: ${alert.id}`);
        return;
      }
      
      // Apply immediate pattern detection
      const patterns = this.detectImmediatePatterns(alert);
      alert.patterns = patterns;
      
      // Add to processing pipeline
      this.metrics.alertsProcessed++;
      alert.processingStartTime = startTime;
      
      // Emit immediate alert
      this.emit('alert', {
        ...alert,
        enriched: false,
        confidence: this.calculateInitialConfidence(alert)
      });
      
      // Queue for enrichment if needed
      if (this.shouldEnrich(alert)) {
        this.queueForEnrichment(alert);
      }
      
      // Update tracking
      this.updateActivityTracking(alert);
      this.processedAlerts.set(alert.id, {
        timestamp: Date.now(),
        hash: this.generateAlertHash(alert)
      });
      
      console.log(`[ALERT] Processed RPC alert: ${alert.type} ${alert.amount} DOT (${patterns.length} patterns)`);
      
    } catch (error) {
      console.error('[ALERT] Error processing RPC alert:', error.message);
    }
  }
  
  normalizeAlert(rawAlert) {
    // Standardize alert format
    const alert = {
      id: rawAlert.id || `alert-${Date.now()}-${Math.random()}`,
      type: rawAlert.type || 'unknown',
      timestamp: rawAlert.timestamp || Date.now(),
      source: rawAlert.source || 'unknown',
      
      // Transfer details
      amount: this.parseAmount(rawAlert.amount),
      from: rawAlert.from || rawAlert.address,
      to: rawAlert.to,
      
      // Blockchain details
      blockNumber: rawAlert.blockNumber,
      blockHash: rawAlert.blockHash,
      transactionHash: rawAlert.transactionHash,
      
      // Classification
      severity: rawAlert.severity || this.classifySeverity(rawAlert.amount),
      
      // Metadata
      metadata: rawAlert.metadata || {},
      patterns: [],
      confidence: 0
    };
    
    // Validation
    if (!alert.amount || alert.amount <= 0) {
      return null;
    }
    
    if (!alert.from && !alert.to) {
      return null;
    }
    
    return alert;
  }
  
  parseAmount(amount) {
    if (typeof amount === 'number') return amount;
    if (typeof amount === 'string') {
      const parsed = parseFloat(amount.replace(/,/g, ''));
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }
  
  classifySeverity(amount) {
    const numAmount = this.parseAmount(amount);
    
    if (numAmount >= 1000000) return 'critical';
    if (numAmount >= 100000) return 'important';
    if (numAmount >= 10000) return 'notable';
    return 'normal';
  }
  
  isDuplicate(alert) {
    const hash = this.generateAlertHash(alert);
    
    // Check recent alerts (last 10 minutes)
    const recentThreshold = Date.now() - 600000; // 10 minutes
    
    for (const [id, processed] of this.processedAlerts.entries()) {
      if (processed.timestamp > recentThreshold && processed.hash === hash) {
        return true;
      }
    }
    
    return false;
  }
  
  generateAlertHash(alert) {
    // Create a hash for duplicate detection
    const hashString = `${alert.from}-${alert.to}-${alert.amount}-${alert.blockNumber}`;
    return hashString.replace(/[^a-zA-Z0-9]/g, '_');
  }
  
  detectImmediatePatterns(alert) {
    const patterns = [];
    
    // Large transfer pattern
    if (alert.amount >= this.config.patterns.whaleThreshold) {
      patterns.push({
        type: 'large_transfer',
        confidence: alert.amount >= 1000000 ? 0.9 : 0.7,
        metadata: { threshold: this.config.patterns.whaleThreshold }
      });
    }
    
    // Exchange pattern detection (basic)
    const exchangePattern = this.detectExchangePattern(alert);
    if (exchangePattern) {
      patterns.push(exchangePattern);
    }
    
    // Coordinated movement detection
    const coordinationPattern = this.detectCoordinationPattern(alert);
    if (coordinationPattern) {
      patterns.push(coordinationPattern);
    }
    
    // Add more pattern detection as needed
    
    return patterns;
  }
  
  detectExchangePattern(alert) {
    // Simplified exchange detection - would need a proper address database
    const knownExchanges = [
      'exchange_hot_wallet',
      'exchange_cold_wallet'
      // Add known exchange addresses
    ];
    
    const fromIsExchange = knownExchanges.some(addr => alert.from?.includes(addr));
    const toIsExchange = knownExchanges.some(addr => alert.to?.includes(addr));
    
    if (fromIsExchange || toIsExchange) {
      return {
        type: 'exchange_activity',
        confidence: 0.8,
        metadata: {
          direction: fromIsExchange ? 'withdrawal' : 'deposit',
          fromExchange: fromIsExchange,
          toExchange: toIsExchange
        }
      };
    }
    
    return null;
  }
  
  detectCoordinationPattern(alert) {
    const address = alert.from || alert.to;
    if (!address) return null;
    
    // Check for recent activity from this address
    const recent = this.recentActivity.get(address) || [];
    const timeWindow = Date.now() - this.config.patterns.coordinationWindow;
    
    const recentTransfers = recent.filter(activity => activity.timestamp > timeWindow);
    
    if (recentTransfers.length >= 3) {
      return {
        type: 'coordinated_movement',
        confidence: Math.min(recentTransfers.length / 5, 0.9),
        metadata: {
          recentTransfers: recentTransfers.length,
          timeWindow: this.config.patterns.coordinationWindow
        }
      };
    }
    
    return null;
  }
  
  calculateInitialConfidence(alert) {
    let confidence = 0.5; // Base confidence
    
    // Higher confidence for larger amounts
    if (alert.amount >= 1000000) confidence += 0.3;
    else if (alert.amount >= 100000) confidence += 0.2;
    else if (alert.amount >= 10000) confidence += 0.1;
    
    // Higher confidence for pattern matches
    confidence += alert.patterns.length * 0.1;
    
    // Higher confidence for RPC source (real-time)
    if (alert.source === 'rpc') confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }
  
  shouldEnrich(alert) {
    // Enrich high-value or patterned alerts
    return alert.amount >= 50000 || 
           alert.patterns.length > 0 || 
           alert.severity === 'critical';
  }
  
  queueForEnrichment(alert) {
    this.pendingAlerts.set(alert.id, {
      alert,
      queuedAt: Date.now()
    });
    
    console.log(`[ALERT] Queued for enrichment: ${alert.id} (queue: ${this.pendingAlerts.size})`);
  }
  
  processEnrichment(enrichmentData) {
    const { alert, enrichment } = enrichmentData;
    
    if (!this.pendingAlerts.has(alert.id)) {
      console.warn(`[ALERT] Enrichment received for unknown alert: ${alert.id}`);
      return;
    }
    
    try {
      const enrichedAlert = this.fuseEnrichmentData(alert, enrichment);
      
      this.metrics.alertsEnriched++;
      this.pendingAlerts.delete(alert.id);
      
      // Emit enriched alert
      this.emit('enriched-alert', enrichedAlert);
      
      console.log(`[ALERT] Enriched alert: ${alert.id} (${enrichment.sources?.join(', ') || 'unknown sources'})`);
      
    } catch (error) {
      console.error(`[ALERT] Error processing enrichment for ${alert.id}:`, error.message);
    }
  }
  
  fuseEnrichmentData(alert, enrichment) {
    const enrichedAlert = {
      ...alert,
      enriched: true,
      enrichment: {
        timestamp: enrichment.timestamp,
        sources: enrichment.sources || [],
        
        // Identity data
        fromIdentity: enrichment.fromIdentity,
        toIdentity: enrichment.toIdentity,
        
        // Historical context
        recentActivity: enrichment.recentActivity,
        patterns: enrichment.patterns,
        
        // Additional metadata
        metadata: enrichment.metadata || {}
      },
      
      // Recalculate confidence with enriched data
      confidence: this.calculateEnrichedConfidence(alert, enrichment),
      
      // Update patterns with enriched information
      patterns: this.enhancePatterns(alert.patterns, enrichment),
      
      // Timing information
      totalProcessingTime: Date.now() - alert.processingStartTime
    };
    
    // Record processing time
    this.metrics.processingTimes.push(enrichedAlert.totalProcessingTime);
    
    return enrichedAlert;
  }
  
  calculateEnrichedConfidence(alert, enrichment) {
    let confidence = alert.confidence || 0.5;
    
    // Boost confidence for known identities
    if (enrichment.fromIdentity?.display) confidence += 0.1;
    if (enrichment.toIdentity?.display) confidence += 0.1;
    
    // Boost confidence for rich activity history
    if (enrichment.recentActivity?.length >= 5) confidence += 0.1;
    
    // Boost confidence for pattern consistency
    if (enrichment.patterns) {
      Object.values(enrichment.patterns).forEach(pattern => {
        if (pattern === 'high') confidence += 0.05;
      });
    }
    
    return Math.min(confidence, 1.0);
  }
  
  enhancePatterns(originalPatterns, enrichment) {
    const enhancedPatterns = [...originalPatterns];
    
    // Add patterns based on enrichment
    if (enrichment.patterns?.frequency === 'high') {
      enhancedPatterns.push({
        type: 'high_frequency',
        confidence: 0.8,
        metadata: { source: 'enrichment' }
      });
    }
    
    if (enrichment.patterns?.volume === 'high') {
      enhancedPatterns.push({
        type: 'high_volume',
        confidence: 0.8,
        metadata: { source: 'enrichment' }
      });
    }
    
    return enhancedPatterns;
  }
  
  updateActivityTracking(alert) {
    const address = alert.from || alert.to;
    if (!address) return;
    
    const activity = this.recentActivity.get(address) || [];
    activity.push({
      timestamp: alert.timestamp,
      amount: alert.amount,
      type: alert.type,
      blockNumber: alert.blockNumber
    });
    
    // Keep only recent activity (last 24 hours)
    const dayAgo = Date.now() - 86400000;
    const filtered = activity.filter(a => a.timestamp > dayAgo);
    
    this.recentActivity.set(address, filtered);
  }
  
  startEnrichmentProcessor() {
    setInterval(() => {
      this.processEnrichmentTimeouts();
    }, 5000); // Check every 5 seconds
  }
  
  startPatternDetector() {
    setInterval(() => {
      this.detectGlobalPatterns();
    }, 30000); // Run global pattern detection every 30 seconds
  }
  
  processEnrichmentTimeouts() {
    const now = Date.now();
    const timeoutThreshold = this.config.enrichmentTimeout;
    
    for (const [alertId, pendingAlert] of this.pendingAlerts.entries()) {
      if (now - pendingAlert.queuedAt > timeoutThreshold) {
        console.warn(`[ALERT] Enrichment timeout for alert: ${alertId}`);
        
        // Emit alert without enrichment
        this.emit('enriched-alert', {
          ...pendingAlert.alert,
          enriched: false,
          enrichmentTimeout: true,
          totalProcessingTime: now - pendingAlert.alert.processingStartTime
        });
        
        this.pendingAlerts.delete(alertId);
      }
    }
  }
  
  detectGlobalPatterns() {
    // Analyze recent activity for global patterns
    try {
      this.detectMarketMovementPatterns();
      this.detectCoordinatedWhaleActivity();
    } catch (error) {
      console.error('[ALERT] Error in global pattern detection:', error.message);
    }
  }
  
  detectMarketMovementPatterns() {
    // Look for patterns in recent alert activity
    const recentAlerts = this.alertHistory.filter(
      alert => Date.now() - alert.timestamp < 3600000 // Last hour
    );
    
    if (recentAlerts.length >= 10) {
      const totalVolume = recentAlerts.reduce((sum, alert) => sum + alert.amount, 0);
      
      if (totalVolume >= 10000000) { // 10M DOT in an hour
        this.emit('globalPattern', {
          type: 'high_market_activity',
          confidence: 0.8,
          metadata: {
            alertCount: recentAlerts.length,
            totalVolume,
            timeWindow: '1 hour'
          }
        });
        
        this.metrics.patternsDetected++;
      }
    }
  }
  
  detectCoordinatedWhaleActivity() {
    // Analyze for coordinated movements across multiple addresses
    const timeWindow = 3600000; // 1 hour
    const now = Date.now();
    
    const recentByTime = new Map();
    
    // Group recent activity by time buckets
    for (const [address, activities] of this.recentActivity.entries()) {
      for (const activity of activities) {
        if (now - activity.timestamp < timeWindow) {
          const timeBucket = Math.floor(activity.timestamp / 300000) * 300000; // 5-minute buckets
          
          if (!recentByTime.has(timeBucket)) {
            recentByTime.set(timeBucket, []);
          }
          
          recentByTime.get(timeBucket).push({
            address,
            ...activity
          });
        }
      }
    }
    
    // Look for coordinated activity
    for (const [timeBucket, activities] of recentByTime.entries()) {
      if (activities.length >= 3) { // 3+ whale movements in 5 minutes
        const uniqueAddresses = new Set(activities.map(a => a.address));
        const totalVolume = activities.reduce((sum, a) => sum + a.amount, 0);
        
        if (uniqueAddresses.size >= 3 && totalVolume >= 1000000) {
          this.emit('globalPattern', {
            type: 'coordinated_whale_movement',
            confidence: 0.9,
            metadata: {
              addresses: uniqueAddresses.size,
              totalVolume,
              timeBucket: new Date(timeBucket).toISOString()
            }
          });
          
          this.metrics.patternsDetected++;
        }
      }
    }
  }
  
  getMetrics() {
    const avgProcessingTime = this.metrics.processingTimes.length > 0 ?
      this.metrics.processingTimes.reduce((a, b) => a + b, 0) / this.metrics.processingTimes.length : 0;
    
    return {
      alertsProcessed: this.metrics.alertsProcessed,
      alertsEnriched: this.metrics.alertsEnriched,
      patternsDetected: this.metrics.patternsDetected,
      duplicatesFiltered: this.metrics.duplicatesFiltered,
      
      performance: {
        averageProcessingTime: Math.round(avgProcessingTime),
        pendingEnrichments: this.pendingAlerts.size,
        activeAddresses: this.recentActivity.size
      },
      
      enrichmentRate: this.metrics.alertsProcessed > 0 ?
        ((this.metrics.alertsEnriched / this.metrics.alertsProcessed) * 100).toFixed(1) + '%' : '0%'
    };
  }
}