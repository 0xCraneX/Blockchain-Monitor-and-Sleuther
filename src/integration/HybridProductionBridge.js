/**
 * Hybrid Production Bridge
 * Safely integrates legacy and hybrid monitoring systems with zero-downtime rollout
 */

const { EventEmitter } = require('events');
const { getFeatureFlags } = require('./FeatureFlags');
const WhaleMonitor = require('../monitor'); // Legacy system

// Import hybrid system components
const path = require('path');
const hybridPath = path.join(__dirname, '../../hybrid');
const { HybridWhaleMonitor } = require(path.join(hybridPath, 'core/HybridMonitor.js'));
const { hybridConfig } = require(path.join(hybridPath, 'config/hybrid.config.js'));

class HybridProductionBridge extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      legacyConfig: config.legacy || {},
      hybridConfig: {
        ...hybridConfig,
        ...config.hybrid,
        environment: 'production'
      },
      validationConfig: {
        alertComparisonEnabled: true,
        performanceTrackingEnabled: true,
        maxAllowedLatencyMs: 30000,
        maxErrorRate: 0.05, // 5%
        ...config.validation
      }
    };
    
    // Feature flags management
    this.featureFlags = getFeatureFlags();
    
    // System instances
    this.legacyMonitor = null;
    this.hybridMonitor = null;
    
    // Bridge state
    this.isRunning = false;
    this.activeSystem = 'legacy';
    this.validationMode = false;
    
    // Metrics and tracking
    this.metrics = {
      startTime: null,
      legacyAlerts: 0,
      hybridAlerts: 0,
      validationResults: [],
      errorCounts: {
        legacy: 0,
        hybrid: 0
      },
      performanceComparison: {
        legacy: { avgLatency: 0, samples: 0 },
        hybrid: { avgLatency: 0, samples: 0 }
      }
    };
    
    // Alert buffers for comparison
    this.alertBuffer = {
      legacy: [],
      hybrid: [],
      maxAge: 300000 // 5 minutes
    };
    
    this.setupEventHandlers();
    
    console.log('[BRIDGE] HybridProductionBridge initialized', {
      activeSystem: this.activeSystem,
      rolloutPhase: this.featureFlags.get('rolloutPhase')
    });
  }
  
  setupEventHandlers() {
    // Feature flag change handlers
    this.featureFlags.on('flagChanged', (change) => {
      this.handleFeatureFlagChange(change);
    });
    
    this.featureFlags.on('emergencyRollback', (event) => {
      this.handleEmergencyRollback(event);
    });
    
    // Error handling
    this.on('error', (error) => {
      console.error('[BRIDGE] Bridge error:', error);
      this.metrics.errorCounts.bridge = (this.metrics.errorCounts.bridge || 0) + 1;
    });
  }
  
  async start() {
    if (this.isRunning) {
      console.log('[BRIDGE] Bridge already running');
      return;
    }
    
    console.log('[BRIDGE] Starting Hybrid Production Bridge...');
    this.metrics.startTime = Date.now();
    
    try {
      // Always start legacy system first
      await this.startLegacySystem();
      
      // Start hybrid system if enabled
      if (this.featureFlags.isHybridEnabled()) {
        await this.startHybridSystem();
        
        if (this.featureFlags.isParallelMode()) {
          this.enableValidationMode();
        }
      }
      
      this.isRunning = true;
      this.emit('started');
      
      console.log('[BRIDGE] Bridge started successfully', {
        activeSystem: this.activeSystem,
        hybridEnabled: this.featureFlags.isHybridEnabled(),
        parallelMode: this.featureFlags.isParallelMode()
      });
      
    } catch (error) {
      console.error('[BRIDGE] Failed to start bridge:', error.message);
      await this.emergencyRollback('Bridge startup failure');
      throw error;
    }
  }
  
  async startLegacySystem() {
    console.log('[BRIDGE] Starting legacy whale monitor...');
    
    try {
      this.legacyMonitor = new WhaleMonitor(this.config.legacyConfig);
      
      // Set up legacy system event handlers
      this.setupLegacyEventHandlers();
      
      // Start legacy monitoring
      await this.legacyMonitor.startMonitoring();
      
      console.log('[BRIDGE] Legacy system started successfully');
      
    } catch (error) {
      console.error('[BRIDGE] Failed to start legacy system:', error.message);
      this.metrics.errorCounts.legacy++;
      throw error;
    }
  }
  
  async startHybridSystem() {
    console.log('[BRIDGE] Starting hybrid whale monitor...');
    
    try {
      this.hybridMonitor = new HybridWhaleMonitor(this.config.hybridConfig);
      
      // Set up hybrid system event handlers
      this.setupHybridEventHandlers();
      
      // Start hybrid monitoring
      await this.hybridMonitor.start();
      
      console.log('[BRIDGE] Hybrid system started successfully');
      
    } catch (error) {
      console.error('[BRIDGE] Failed to start hybrid system:', error.message);
      this.metrics.errorCounts.hybrid++;
      
      // Don't fail the entire bridge if hybrid fails
      this.featureFlags.set('enableHybridSystem', false);
      throw error;
    }
  }
  
  setupLegacyEventHandlers() {
    // Note: Legacy system doesn't have event emitters, so we'll wrap its cycle
    const originalRunCycle = this.legacyMonitor.runCycle.bind(this.legacyMonitor);
    
    this.legacyMonitor.runCycle = async () => {
      const startTime = Date.now();
      
      try {
        const result = await originalRunCycle();
        
        // Track performance
        const latency = Date.now() - startTime;
        this.updatePerformanceMetrics('legacy', latency);
        
        // Process alerts
        if (result.alerts && result.alerts.length > 0) {
          this.handleLegacyAlerts(result.alerts);
        }
        
        return result;
        
      } catch (error) {
        this.metrics.errorCounts.legacy++;
        console.error('[BRIDGE] Legacy system error:', error.message);
        
        // Check error rate
        if (this.getErrorRate('legacy') > this.config.validationConfig.maxErrorRate) {
          this.emit('highErrorRate', { system: 'legacy', errorRate: this.getErrorRate('legacy') });
        }
        
        throw error;
      }
    };
  }
  
  setupHybridEventHandlers() {
    this.hybridMonitor.on('alert', (alert) => {
      this.handleHybridAlert(alert);
    });
    
    this.hybridMonitor.on('enrichedAlert', (alert) => {
      this.handleHybridAlert(alert, true);
    });
    
    this.hybridMonitor.on('error', (error) => {
      this.metrics.errorCounts.hybrid++;
      console.error('[BRIDGE] Hybrid system error:', error.source, error.error.message);
      
      // Check error rate
      if (this.getErrorRate('hybrid') > this.config.validationConfig.maxErrorRate) {
        this.emit('highErrorRate', { system: 'hybrid', errorRate: this.getErrorRate('hybrid') });
      }
    });
    
    this.hybridMonitor.on('started', () => {
      console.log('[BRIDGE] Hybrid monitor started');
    });
    
    this.hybridMonitor.on('stopped', () => {
      console.log('[BRIDGE] Hybrid monitor stopped');
    });
  }
  
  handleLegacyAlerts(alerts) {
    this.metrics.legacyAlerts += alerts.length;
    
    // Add to alert buffer for comparison
    const timestamp = Date.now();
    alerts.forEach(alert => {
      this.alertBuffer.legacy.push({
        ...alert,
        timestamp,
        source: 'legacy'
      });
    });
    
    this.cleanupAlertBuffer();
    
    // Emit alerts if legacy is active system
    if (this.activeSystem === 'legacy' || !this.featureFlags.isHybridEnabled()) {
      this.emit('alerts', alerts.map(alert => ({ ...alert, source: 'legacy' })));
    }
    
    // Run validation if in parallel mode
    if (this.validationMode) {
      this.performAlertValidation();
    }
  }
  
  handleHybridAlert(alert, enriched = false) {
    this.metrics.hybridAlerts++;
    
    // Track performance
    if (alert.processingTime) {
      this.updatePerformanceMetrics('hybrid', alert.processingTime);
    }
    
    // Add to alert buffer for comparison
    this.alertBuffer.hybrid.push({
      ...alert,
      timestamp: Date.now(),
      source: 'hybrid',
      enriched
    });
    
    this.cleanupAlertBuffer();
    
    // Emit alerts if hybrid is active or in traffic split mode
    if (this.shouldEmitHybridAlert(alert)) {
      this.emit('alerts', [{ ...alert, source: 'hybrid' }]);
    }
    
    // Run validation if in parallel mode
    if (this.validationMode) {
      this.performAlertValidation();
    }
  }
  
  shouldEmitHybridAlert(alert) {
    // Don't emit if in shadow mode
    if (this.featureFlags.isShadowMode()) {
      return false;
    }
    
    // Emit if hybrid is active system
    if (this.activeSystem === 'hybrid') {
      return true;
    }
    
    // Check traffic split
    const trafficPercent = this.featureFlags.getTrafficPercent();
    if (trafficPercent > 0) {
      return this.featureFlags.shouldUseHybrid(alert.from || alert.address);
    }
    
    return false;
  }
  
  performAlertValidation() {
    // Compare recent alerts between systems
    const recentCutoff = Date.now() - 60000; // 1 minute
    
    const recentLegacy = this.alertBuffer.legacy.filter(a => a.timestamp > recentCutoff);
    const recentHybrid = this.alertBuffer.hybrid.filter(a => a.timestamp > recentCutoff);
    
    const validation = {
      timestamp: Date.now(),
      legacyCount: recentLegacy.length,
      hybridCount: recentHybrid.length,
      matches: 0,
      hybridOnly: 0,
      legacyOnly: 0
    };
    
    // Simple matching logic (could be more sophisticated)
    recentHybrid.forEach(hybridAlert => {
      const match = recentLegacy.find(legacyAlert => 
        this.alertsMatch(legacyAlert, hybridAlert)
      );
      
      if (match) {
        validation.matches++;
      } else {
        validation.hybridOnly++;
      }
    });
    
    validation.legacyOnly = recentLegacy.length - validation.matches;
    validation.accuracy = recentLegacy.length > 0 ? validation.matches / recentLegacy.length : 1;
    
    this.metrics.validationResults.push(validation);
    
    // Keep only recent validations
    this.metrics.validationResults = this.metrics.validationResults.slice(-100);
    
    // Check validation thresholds
    if (validation.accuracy < 0.95 && recentLegacy.length > 0) {
      this.emit('validationFailure', {
        accuracy: validation.accuracy,
        details: validation
      });
    }
    
    console.log('[BRIDGE] Alert validation:', validation);
  }
  
  alertsMatch(legacyAlert, hybridAlert) {
    // Simple matching criteria - could be enhanced
    return legacyAlert.address === hybridAlert.from || 
           legacyAlert.address === hybridAlert.to ||
           (Math.abs(legacyAlert.amount - hybridAlert.amount) < 1000 &&
            Math.abs(legacyAlert.timestamp - hybridAlert.timestamp) < 60000);
  }
  
  updatePerformanceMetrics(system, latency) {
    const metrics = this.metrics.performanceComparison[system];
    
    if (metrics.samples === 0) {
      metrics.avgLatency = latency;
    } else {
      metrics.avgLatency = (metrics.avgLatency * metrics.samples + latency) / (metrics.samples + 1);
    }
    
    metrics.samples++;
  }
  
  getErrorRate(system) {
    const totalOperations = this.metrics.performanceComparison[system].samples;
    const errors = this.metrics.errorCounts[system];
    
    return totalOperations > 0 ? errors / totalOperations : 0;
  }
  
  cleanupAlertBuffer() {
    const cutoff = Date.now() - this.alertBuffer.maxAge;
    
    this.alertBuffer.legacy = this.alertBuffer.legacy.filter(a => a.timestamp > cutoff);
    this.alertBuffer.hybrid = this.alertBuffer.hybrid.filter(a => a.timestamp > cutoff);
  }
  
  enableValidationMode() {
    this.validationMode = true;
    console.log('[BRIDGE] Validation mode enabled - comparing legacy and hybrid outputs');
  }
  
  disableValidationMode() {
    this.validationMode = false;
    console.log('[BRIDGE] Validation mode disabled');
  }
  
  handleFeatureFlagChange(change) {
    console.log(`[BRIDGE] Feature flag changed: ${change.flagName} = ${change.newValue}`);
    
    switch (change.flagName) {
      case 'emergencyRollback':
        if (change.newValue) {
          this.emergencyRollback('Feature flag emergency rollback');
        }
        break;
        
      case 'enableHybridSystem':
        if (change.newValue && !this.hybridMonitor) {
          this.startHybridSystem().catch(error => {
            console.error('[BRIDGE] Failed to start hybrid system:', error.message);
          });
        } else if (!change.newValue && this.hybridMonitor) {
          this.stopHybridSystem();
        }
        break;
        
      case 'enableParallelMode':
        if (change.newValue) {
          this.enableValidationMode();
        } else {
          this.disableValidationMode();
        }
        break;
        
      case 'hybridTrafficPercent':
        console.log(`[BRIDGE] Traffic split updated: ${change.newValue}% to hybrid`);
        break;
    }
  }
  
  async handleEmergencyRollback(event) {
    console.log(`[BRIDGE] EMERGENCY ROLLBACK TRIGGERED: ${event.reason}`);
    
    try {
      // Immediately switch to legacy only
      this.activeSystem = 'legacy';
      
      // Stop hybrid system if running
      if (this.hybridMonitor) {
        await this.stopHybridSystem();
      }
      
      // Disable validation mode
      this.disableValidationMode();
      
      console.log('[BRIDGE] Emergency rollback completed - running legacy only');
      this.emit('emergencyRollbackCompleted', event);
      
    } catch (error) {
      console.error('[BRIDGE] Error during emergency rollback:', error.message);
      this.emit('emergencyRollbackFailed', error);
    }
  }
  
  async emergencyRollback(reason) {
    this.featureFlags.emergencyRollback(reason);
  }
  
  async stopHybridSystem() {
    if (this.hybridMonitor) {
      try {
        await this.hybridMonitor.stop();
        this.hybridMonitor = null;
        console.log('[BRIDGE] Hybrid system stopped');
      } catch (error) {
        console.error('[BRIDGE] Error stopping hybrid system:', error.message);
      }
    }
  }
  
  async stop() {
    if (!this.isRunning) return;
    
    console.log('[BRIDGE] Stopping Hybrid Production Bridge...');
    
    try {
      // Stop hybrid system
      await this.stopHybridSystem();
      
      // Stop legacy system
      if (this.legacyMonitor) {
        this.legacyMonitor.stopMonitoring();
      }
      
      // Stop feature flag watching
      this.featureFlags.stopWatching();
      
      this.isRunning = false;
      this.emit('stopped');
      
      console.log('[BRIDGE] Bridge stopped');
      
    } catch (error) {
      console.error('[BRIDGE] Error stopping bridge:', error.message);
      throw error;
    }
  }
  
  // Get comprehensive metrics
  getMetrics() {
    const uptime = this.metrics.startTime ? Date.now() - this.metrics.startTime : 0;
    
    const latestValidation = this.metrics.validationResults.length > 0 ?
      this.metrics.validationResults[this.metrics.validationResults.length - 1] : null;
    
    return {
      bridge: {
        uptime,
        isRunning: this.isRunning,
        activeSystem: this.activeSystem,
        validationMode: this.validationMode
      },
      
      alerts: {
        legacy: this.metrics.legacyAlerts,
        hybrid: this.metrics.hybridAlerts,
        total: this.metrics.legacyAlerts + this.metrics.hybridAlerts
      },
      
      performance: {
        legacy: this.metrics.performanceComparison.legacy,
        hybrid: this.metrics.performanceComparison.hybrid,
        improvementFactor: this.metrics.performanceComparison.legacy.avgLatency > 0 ?
          this.metrics.performanceComparison.legacy.avgLatency / 
          Math.max(this.metrics.performanceComparison.hybrid.avgLatency, 1) : 0
      },
      
      errors: this.metrics.errorCounts,
      
      validation: {
        latest: latestValidation,
        totalValidations: this.metrics.validationResults.length,
        averageAccuracy: this.metrics.validationResults.length > 0 ?
          this.metrics.validationResults.reduce((sum, v) => sum + v.accuracy, 0) /
          this.metrics.validationResults.length : 0
      },
      
      featureFlags: this.featureFlags.getRolloutStatus(),
      
      // Component metrics
      legacy: this.legacyMonitor ? this.legacyMonitor.getStats() : null,
      hybrid: this.hybridMonitor ? this.hybridMonitor.getMetrics() : null
    };
  }
  
  // Admin controls
  async switchToLegacy(reason = 'Manual switch') {
    console.log(`[BRIDGE] Switching to legacy system: ${reason}`);
    
    this.activeSystem = 'legacy';
    this.featureFlags.update({
      hybridTrafficPercent: 0,
      enableParallelMode: false
    });
    
    this.emit('systemSwitched', { to: 'legacy', reason });
  }
  
  async switchToHybrid(reason = 'Manual switch') {
    console.log(`[BRIDGE] Switching to hybrid system: ${reason}`);
    
    if (!this.hybridMonitor) {
      throw new Error('Hybrid system is not running');
    }
    
    this.activeSystem = 'hybrid';
    this.featureFlags.update({
      hybridTrafficPercent: 100,
      enableHybridSystem: true
    });
    
    this.emit('systemSwitched', { to: 'hybrid', reason });
  }
  
  // Health check
  getHealthStatus() {
    const legacyHealthy = this.legacyMonitor && this.getErrorRate('legacy') < 0.1;
    const hybridHealthy = !this.hybridMonitor || this.getErrorRate('hybrid') < 0.1;
    
    const latestValidation = this.metrics.validationResults.length > 0 ?
      this.metrics.validationResults[this.metrics.validationResults.length - 1] : null;
    
    const validationHealthy = !latestValidation || latestValidation.accuracy > 0.9;
    
    return {
      overall: legacyHealthy && hybridHealthy && validationHealthy,
      components: {
        legacy: legacyHealthy,
        hybrid: hybridHealthy,
        validation: validationHealthy
      },
      details: {
        legacyErrorRate: this.getErrorRate('legacy'),
        hybridErrorRate: this.getErrorRate('hybrid'),
        validationAccuracy: latestValidation ? latestValidation.accuracy : null
      }
    };
  }
}

module.exports = HybridProductionBridge;