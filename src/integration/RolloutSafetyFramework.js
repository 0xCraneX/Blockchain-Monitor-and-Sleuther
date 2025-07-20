/**
 * Rollout Safety Framework
 * Comprehensive safety monitoring and automated protection for hybrid rollout
 */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class RolloutSafetyFramework extends EventEmitter {
  constructor(bridge, config = {}) {
    super();
    
    this.bridge = bridge;
    this.config = {
      safetyLimits: {
        maxErrorRate: 0.05, // 5%
        minValidationAccuracy: 0.95, // 95%
        maxLatencyMs: 30000, // 30 seconds
        maxMemoryMB: 2048, // 2GB
        maxCpuPercent: 80, // 80%
        minUptimePercent: 99.9 // 99.9%
      },
      monitoringConfig: {
        healthCheckInterval: 60000, // 1 minute
        metricsCollectionInterval: 30000, // 30 seconds
        alertThrottleMs: 300000, // 5 minutes
        historyRetentionHours: 168 // 1 week
      },
      rollbackConfig: {
        autoRollbackEnabled: true,
        consecutiveFailuresThreshold: 3,
        criticalErrorThreshold: 10, // errors per minute
        validationFailureThreshold: 0.85 // 85% minimum
      },
      ...config
    };
    
    // Safety state
    this.safetyState = {
      isActive: false,
      lastHealthCheck: null,
      consecutiveFailures: 0,
      alertHistory: [],
      emergencyMode: false,
      rollbackInProgress: false
    };
    
    // Metrics storage
    this.metrics = {
      performance: [],
      health: [],
      errors: [],
      validation: [],
      system: []
    };
    
    // Intervals
    this.intervals = {
      healthCheck: null,
      metricsCollection: null,
      alertThrottle: new Map()
    };
    
    this.setupSafetyFramework();
    
    console.log('[SAFETY] Rollout Safety Framework initialized');
  }
  
  setupSafetyFramework() {
    // Bridge event handlers
    this.bridge.on('error', (error) => {
      this.handleBridgeError(error);
    });
    
    this.bridge.on('validationFailure', (event) => {
      this.handleValidationFailure(event);
    });
    
    this.bridge.on('highErrorRate', (event) => {
      this.handleHighErrorRate(event);
    });
    
    this.bridge.on('emergencyRollbackCompleted', () => {
      this.handleEmergencyRollbackCompleted();
    });
    
    // Process monitoring
    process.on('uncaughtException', (error) => {
      this.handleCriticalError('uncaughtException', error);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      this.handleCriticalError('unhandledRejection', { reason, promise });
    });
  }
  
  start() {
    if (this.safetyState.isActive) {
      console.log('[SAFETY] Safety framework already active');
      return;
    }
    
    console.log('[SAFETY] Starting rollout safety framework...');
    
    // Start health monitoring
    this.intervals.healthCheck = setInterval(() => {
      this.performHealthCheck();
    }, this.config.monitoringConfig.healthCheckInterval);
    
    // Start metrics collection
    this.intervals.metricsCollection = setInterval(() => {
      this.collectMetrics();
    }, this.config.monitoringConfig.metricsCollectionInterval);
    
    this.safetyState.isActive = true;
    this.emit('safetyFrameworkStarted');
    
    console.log('[SAFETY] Safety framework started successfully');
  }
  
  stop() {
    if (!this.safetyState.isActive) return;
    
    console.log('[SAFETY] Stopping rollout safety framework...');
    
    // Clear intervals
    if (this.intervals.healthCheck) {
      clearInterval(this.intervals.healthCheck);
    }
    
    if (this.intervals.metricsCollection) {
      clearInterval(this.intervals.metricsCollection);
    }
    
    this.safetyState.isActive = false;
    this.emit('safetyFrameworkStopped');
    
    console.log('[SAFETY] Safety framework stopped');
  }
  
  performHealthCheck() {
    try {
      const healthCheck = {
        timestamp: Date.now(),
        bridge: this.checkBridgeHealth(),
        system: this.checkSystemHealth(),
        performance: this.checkPerformanceHealth(),
        validation: this.checkValidationHealth()
      };
      
      healthCheck.overall = healthCheck.bridge.healthy && 
                           healthCheck.system.healthy && 
                           healthCheck.performance.healthy && 
                           healthCheck.validation.healthy;
      
      this.metrics.health.push(healthCheck);
      this.cleanupMetrics();
      
      this.safetyState.lastHealthCheck = healthCheck;
      
      // Check for safety violations
      if (!healthCheck.overall) {
        this.handleHealthCheckFailure(healthCheck);
      } else {
        this.safetyState.consecutiveFailures = 0;
      }
      
      // Emit health status
      this.emit('healthCheck', healthCheck);
      
    } catch (error) {
      console.error('[SAFETY] Health check error:', error.message);
      this.handleHealthCheckError(error);
    }
  }
  
  checkBridgeHealth() {
    try {
      const bridgeHealth = this.bridge.getHealthStatus();
      const metrics = this.bridge.getMetrics();
      
      return {
        healthy: bridgeHealth.overall,
        details: bridgeHealth.details,
        isRunning: this.bridge.isRunning,
        uptime: metrics.bridge.uptime,
        activeSystem: metrics.bridge.activeSystem
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
  
  checkSystemHealth() {
    const memUsage = process.memoryUsage();
    const memUsageMB = memUsage.heapUsed / 1024 / 1024;
    
    // Check CPU usage (simplified - would use external library in production)
    const cpuUsage = this.estimateCpuUsage();
    
    const health = {
      healthy: true,
      memory: {
        usedMB: memUsageMB,
        limitMB: this.config.safetyLimits.maxMemoryMB,
        percentage: (memUsageMB / this.config.safetyLimits.maxMemoryMB) * 100,
        healthy: memUsageMB < this.config.safetyLimits.maxMemoryMB
      },
      cpu: {
        percentage: cpuUsage,
        limit: this.config.safetyLimits.maxCpuPercent,
        healthy: cpuUsage < this.config.safetyLimits.maxCpuPercent
      },
      uptime: process.uptime() * 1000
    };
    
    health.healthy = health.memory.healthy && health.cpu.healthy;
    
    return health;
  }
  
  checkPerformanceHealth() {
    try {
      const metrics = this.bridge.getMetrics();
      
      const legacyLatency = metrics.performance.legacy.avgLatency || 0;
      const hybridLatency = metrics.performance.hybrid.avgLatency || 0;
      
      const health = {
        healthy: true,
        latency: {
          legacy: legacyLatency,
          hybrid: hybridLatency,
          limit: this.config.safetyLimits.maxLatencyMs,
          improvementFactor: metrics.performance.improvementFactor || 0
        },
        errorRates: {},
        alerts: {
          total: metrics.alerts.total,
          legacy: metrics.alerts.legacy,
          hybrid: metrics.alerts.hybrid
        }
      };
      
      // Check error rates
      Object.entries(metrics.errors).forEach(([system, errors]) => {
        const samples = metrics.performance[system]?.samples || 1;
        const errorRate = errors / samples;
        
        health.errorRates[system] = {
          rate: errorRate,
          limit: this.config.safetyLimits.maxErrorRate,
          healthy: errorRate < this.config.safetyLimits.maxErrorRate
        };
        
        if (!health.errorRates[system].healthy) {
          health.healthy = false;
        }
      });
      
      // Check latency
      if (hybridLatency > this.config.safetyLimits.maxLatencyMs) {
        health.healthy = false;
      }
      
      return health;
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
  
  checkValidationHealth() {
    try {
      const metrics = this.bridge.getMetrics();
      
      if (!metrics.validation.latest) {
        return {
          healthy: true,
          message: 'No validation data available'
        };
      }
      
      const accuracy = metrics.validation.latest.accuracy;
      const averageAccuracy = metrics.validation.averageAccuracy;
      
      return {
        healthy: accuracy >= this.config.safetyLimits.minValidationAccuracy,
        latest: {
          accuracy,
          timestamp: metrics.validation.latest.timestamp,
          matches: metrics.validation.latest.matches,
          total: metrics.validation.latest.legacyCount
        },
        average: {
          accuracy: averageAccuracy,
          samples: metrics.validation.totalValidations
        },
        limit: this.config.safetyLimits.minValidationAccuracy
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
  
  estimateCpuUsage() {
    // Simplified CPU estimation using event loop lag
    const start = process.hrtime.bigint();
    
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
      
      // Rough estimation: higher lag = higher CPU usage
      return Math.min(lag * 10, 100); // Cap at 100%
    });
    
    // Return a placeholder value for synchronous operation
    return 0;
  }
  
  handleHealthCheckFailure(healthCheck) {
    this.safetyState.consecutiveFailures++;
    
    console.log(`[SAFETY] Health check failure #${this.safetyState.consecutiveFailures}:`, {
      bridge: healthCheck.bridge.healthy,
      system: healthCheck.system.healthy,
      performance: healthCheck.performance.healthy,
      validation: healthCheck.validation.healthy
    });
    
    // Check for automatic rollback conditions
    if (this.shouldTriggerAutoRollback(healthCheck)) {
      this.triggerEmergencyRollback('Automated safety rollback', healthCheck);
    }
    
    // Emit safety alert
    this.emitSafetyAlert('healthCheckFailure', {
      consecutiveFailures: this.safetyState.consecutiveFailures,
      healthCheck
    });
  }
  
  shouldTriggerAutoRollback(healthCheck) {
    if (!this.config.rollbackConfig.autoRollbackEnabled) {
      return false;
    }
    
    // Check consecutive failures
    if (this.safetyState.consecutiveFailures >= this.config.rollbackConfig.consecutiveFailuresThreshold) {
      return true;
    }
    
    // Check critical validation failure
    if (healthCheck.validation.healthy === false && 
        healthCheck.validation.latest?.accuracy < this.config.rollbackConfig.validationFailureThreshold) {
      return true;
    }
    
    // Check critical system failure
    if (!healthCheck.system.healthy && 
        (healthCheck.system.memory?.percentage > 95 || healthCheck.system.cpu?.percentage > 95)) {
      return true;
    }
    
    return false;
  }
  
  collectMetrics() {
    try {
      const timestamp = Date.now();
      
      // Collect bridge metrics
      const bridgeMetrics = this.bridge.getMetrics();
      
      // Collect system metrics
      const systemMetrics = {
        timestamp,
        memory: process.memoryUsage(),
        uptime: process.uptime() * 1000,
        cpuEstimate: this.estimateCpuUsage()
      };
      
      this.metrics.system.push(systemMetrics);
      this.metrics.performance.push({
        timestamp,
        ...bridgeMetrics.performance
      });
      
      if (bridgeMetrics.validation.latest) {
        this.metrics.validation.push({
          timestamp,
          ...bridgeMetrics.validation.latest
        });
      }
      
      this.cleanupMetrics();
      
    } catch (error) {
      console.error('[SAFETY] Metrics collection error:', error.message);
    }
  }
  
  handleBridgeError(error) {
    this.metrics.errors.push({
      timestamp: Date.now(),
      source: error.source || 'bridge',
      error: error.error?.message || error.message,
      severity: 'error'
    });
    
    this.emitSafetyAlert('bridgeError', error);
  }
  
  handleValidationFailure(event) {
    console.log(`[SAFETY] Validation failure detected: ${(event.accuracy * 100).toFixed(1)}% accuracy`);
    
    this.metrics.errors.push({
      timestamp: Date.now(),
      source: 'validation',
      accuracy: event.accuracy,
      details: event.details,
      severity: event.accuracy < 0.85 ? 'critical' : 'warning'
    });
    
    // Critical validation failure
    if (event.accuracy < this.config.rollbackConfig.validationFailureThreshold) {
      this.triggerEmergencyRollback('Critical validation failure', event);
    }
    
    this.emitSafetyAlert('validationFailure', event);
  }
  
  handleHighErrorRate(event) {
    console.log(`[SAFETY] High error rate detected in ${event.system}: ${(event.errorRate * 100).toFixed(1)}%`);
    
    this.metrics.errors.push({
      timestamp: Date.now(),
      source: event.system,
      errorRate: event.errorRate,
      severity: event.errorRate > 0.1 ? 'critical' : 'warning'
    });
    
    this.emitSafetyAlert('highErrorRate', event);
  }
  
  handleCriticalError(type, error) {
    console.log(`[SAFETY] Critical error detected: ${type}`, error);
    
    this.safetyState.emergencyMode = true;
    
    this.metrics.errors.push({
      timestamp: Date.now(),
      source: 'system',
      type,
      error: error.message || error.reason || 'Unknown error',
      severity: 'critical'
    });
    
    // Immediate emergency rollback for critical errors
    this.triggerEmergencyRollback(`Critical system error: ${type}`, error);
    
    this.emitSafetyAlert('criticalError', { type, error });
  }
  
  handleHealthCheckError(error) {
    console.error('[SAFETY] Health check system error:', error.message);
    
    this.metrics.errors.push({
      timestamp: Date.now(),
      source: 'healthCheck',
      error: error.message,
      severity: 'error'
    });
    
    this.emitSafetyAlert('healthCheckError', error);
  }
  
  handleEmergencyRollbackCompleted() {
    console.log('[SAFETY] Emergency rollback completed - entering safe mode');
    
    this.safetyState.rollbackInProgress = false;
    this.safetyState.emergencyMode = false;
    this.safetyState.consecutiveFailures = 0;
    
    this.emit('safeMode');
  }
  
  triggerEmergencyRollback(reason, details = {}) {
    if (this.safetyState.rollbackInProgress) {
      console.log('[SAFETY] Rollback already in progress, skipping');
      return;
    }
    
    console.log(`[SAFETY] 🚨 TRIGGERING EMERGENCY ROLLBACK: ${reason}`);
    
    this.safetyState.rollbackInProgress = true;
    this.safetyState.emergencyMode = true;
    
    // Log the rollback event
    this.metrics.errors.push({
      timestamp: Date.now(),
      source: 'safety',
      type: 'emergencyRollback',
      reason,
      details,
      severity: 'critical'
    });
    
    // Trigger the rollback
    this.bridge.emergencyRollback(reason).catch(error => {
      console.error('[SAFETY] Emergency rollback failed:', error.message);
      this.safetyState.rollbackInProgress = false;
    });
    
    this.emitSafetyAlert('emergencyRollback', { reason, details });
  }
  
  emitSafetyAlert(type, data) {
    const alert = {
      timestamp: Date.now(),
      type,
      data,
      severity: this.getSeverity(type, data)
    };
    
    // Check throttling
    const alertKey = `${type}-${JSON.stringify(data)}`;
    const lastAlert = this.intervals.alertThrottle.get(alertKey);
    
    if (lastAlert && Date.now() - lastAlert < this.config.monitoringConfig.alertThrottleMs) {
      return; // Throttled
    }
    
    this.intervals.alertThrottle.set(alertKey, Date.now());
    
    // Add to history
    this.safetyState.alertHistory.push(alert);
    this.safetyState.alertHistory = this.safetyState.alertHistory.slice(-100); // Keep last 100
    
    this.emit('safetyAlert', alert);
    
    console.log(`[SAFETY] Alert: ${type} (${alert.severity})`, data);
  }
  
  getSeverity(type, data) {
    switch (type) {
      case 'criticalError':
      case 'emergencyRollback':
        return 'critical';
      case 'validationFailure':
        return data.accuracy < 0.85 ? 'critical' : 'warning';
      case 'highErrorRate':
        return data.errorRate > 0.1 ? 'critical' : 'warning';
      case 'healthCheckFailure':
        return this.safetyState.consecutiveFailures >= 3 ? 'critical' : 'warning';
      default:
        return 'info';
    }
  }
  
  cleanupMetrics() {
    const cutoff = Date.now() - (this.config.monitoringConfig.historyRetentionHours * 60 * 60 * 1000);
    
    Object.keys(this.metrics).forEach(key => {
      this.metrics[key] = this.metrics[key].filter(item => item.timestamp > cutoff);
    });
  }
  
  // Public API
  getSafetyStatus() {
    return {
      isActive: this.safetyState.isActive,
      emergencyMode: this.safetyState.emergencyMode,
      consecutiveFailures: this.safetyState.consecutiveFailures,
      lastHealthCheck: this.safetyState.lastHealthCheck,
      rollbackInProgress: this.safetyState.rollbackInProgress,
      recentAlerts: this.safetyState.alertHistory.slice(-10)
    };
  }
  
  getMetricsSummary() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    const recentHealth = this.metrics.health.filter(h => now - h.timestamp < oneHour);
    const recentErrors = this.metrics.errors.filter(e => now - e.timestamp < oneHour);
    
    return {
      health: {
        total: this.metrics.health.length,
        recent: recentHealth.length,
        recentSuccess: recentHealth.filter(h => h.overall).length,
        successRate: recentHealth.length > 0 ? 
          recentHealth.filter(h => h.overall).length / recentHealth.length : 1
      },
      errors: {
        total: this.metrics.errors.length,
        recent: recentErrors.length,
        bySeverity: {
          critical: recentErrors.filter(e => e.severity === 'critical').length,
          warning: recentErrors.filter(e => e.severity === 'warning').length,
          error: recentErrors.filter(e => e.severity === 'error').length
        }
      },
      validation: {
        total: this.metrics.validation.length,
        recentAverage: this.calculateRecentValidationAverage()
      },
      performance: this.calculatePerformanceTrends()
    };
  }
  
  calculateRecentValidationAverage() {
    const oneHour = 60 * 60 * 1000;
    const recent = this.metrics.validation.filter(v => Date.now() - v.timestamp < oneHour);
    
    if (recent.length === 0) return null;
    
    return recent.reduce((sum, v) => sum + v.accuracy, 0) / recent.length;
  }
  
  calculatePerformanceTrends() {
    const oneHour = 60 * 60 * 1000;
    const recent = this.metrics.performance.filter(p => Date.now() - p.timestamp < oneHour);
    
    if (recent.length === 0) return null;
    
    const avgImprovement = recent.reduce((sum, p) => sum + (p.improvementFactor || 0), 0) / recent.length;
    
    return {
      samples: recent.length,
      averageImprovement: avgImprovement,
      trend: recent.length > 1 ? this.calculateTrend(recent) : 'stable'
    };
  }
  
  calculateTrend(data) {
    if (data.length < 2) return 'stable';
    
    const recent = data.slice(-5); // Last 5 samples
    const older = data.slice(-10, -5); // Previous 5 samples
    
    if (older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((sum, p) => sum + (p.improvementFactor || 0), 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + (p.improvementFactor || 0), 0) / older.length;
    
    const change = (recentAvg - olderAvg) / olderAvg;
    
    if (change > 0.1) return 'improving';
    if (change < -0.1) return 'degrading';
    return 'stable';
  }
  
  // Emergency controls
  enableEmergencyMode() {
    this.safetyState.emergencyMode = true;
    this.emit('emergencyModeEnabled');
    console.log('[SAFETY] Emergency mode enabled');
  }
  
  disableEmergencyMode() {
    this.safetyState.emergencyMode = false;
    this.emit('emergencyModeDisabled');
    console.log('[SAFETY] Emergency mode disabled');
  }
  
  manualRollback(reason = 'Manual safety rollback') {
    this.triggerEmergencyRollback(reason);
  }
  
  // Configuration updates
  updateSafetyLimits(newLimits) {
    this.config.safetyLimits = { ...this.config.safetyLimits, ...newLimits };
    console.log('[SAFETY] Safety limits updated:', newLimits);
    this.emit('safetyLimitsUpdated', this.config.safetyLimits);
  }
  
  resetConsecutiveFailures() {
    this.safetyState.consecutiveFailures = 0;
    console.log('[SAFETY] Consecutive failures counter reset');
  }
}

module.exports = RolloutSafetyFramework;