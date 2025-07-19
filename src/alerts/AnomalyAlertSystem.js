import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const AlertManager = require('./AlertManager.js');
// Simple console logger fallback since the main logger has import issues
const monitorLogger = {
  info: (msg, data) => console.log(`[ANOMALY-ALERT] ${msg}`, data || ''),
  error: (msg, error) => console.error(`[ANOMALY-ALERT] ${msg}`, error || ''),
  success: (msg, data) => console.log(`[ANOMALY-ALERT] ✅ ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[ANOMALY-ALERT] ⚠️ ${msg}`, data || '')
};
import fs from 'fs/promises';
import path from 'path';

/**
 * AnomalyAlertSystem - Enhanced alert system with anomaly detection integration
 * Provides multi-channel notifications, alert aggregation, and smart filtering
 */
export class AnomalyAlertSystem extends AlertManager {
  constructor(storage, config = {}) {
    super(storage);
    
    this.config = {
      // Alert filtering
      enableSmartFiltering: config.enableSmartFiltering !== false,
      suppressDuplicatesWindow: config.suppressDuplicatesWindow || 3600000, // 1 hour
      maxAlertsPerHour: config.maxAlertsPerHour || 100,
      
      // Alert aggregation
      enableAggregation: config.enableAggregation !== false,
      aggregationWindow: config.aggregationWindow || 300000, // 5 minutes
      minAlertsToAggregate: config.minAlertsToAggregate || 3,
      
      // Notification channels
      channels: {
        console: config.channels?.console !== false,
        file: config.channels?.file || false,
        webhook: config.channels?.webhook || false,
        email: config.channels?.email || false
      },
      
      // Channel configurations
      fileConfig: {
        path: config.fileConfig?.path || './alerts',
        format: config.fileConfig?.format || 'json', // json, csv, markdown
        rotationSize: config.fileConfig?.rotationSize || 10 * 1024 * 1024, // 10MB
        ...config.fileConfig
      },
      
      webhookConfig: {
        url: config.webhookConfig?.url,
        headers: config.webhookConfig?.headers || {},
        timeout: config.webhookConfig?.timeout || 5000,
        retries: config.webhookConfig?.retries || 3,
        ...config.webhookConfig
      },
      
      // Alert prioritization
      priorityRules: config.priorityRules || {
        CRITICAL: {
          anomalyRiskScore: 0.9,
          amount: 1000000, // 1M DOT
          anomalyTypes: ['COORDINATED_ACTIVITY', 'NETWORK_CLUSTERING', 'WASH_TRADING']
        },
        HIGH: {
          anomalyRiskScore: 0.7,
          amount: 100000, // 100K DOT
          anomalyTypes: ['DORMANT_AWAKENING', 'ROLE_CHANGE', 'VELOCITY_SPIKE']
        },
        MEDIUM: {
          anomalyRiskScore: 0.5,
          amount: 10000, // 10K DOT
          anomalyTypes: ['AMOUNT_OUTLIER', 'PATTERN_BREAK', 'TIMEZONE_SHIFT']
        }
      },
      
      // Alert templates
      templates: config.templates || {},
      
      ...config
    };
    
    // Alert state management
    this.alertQueue = [];
    this.duplicateTracker = new Map(); // hash -> timestamp
    this.aggregationBuffer = new Map(); // type -> alerts[]
    this.alertStats = {
      total: 0,
      byChannel: {},
      bySeverity: {},
      byType: {},
      suppressed: 0,
      aggregated: 0,
      failed: 0
    };
    
    // Notification handlers
    this.notificationHandlers = new Map();
    this.initializeNotificationHandlers();
    
    // Start aggregation timer if enabled
    if (this.config.enableAggregation) {
      this.startAggregationTimer();
    }
    
    monitorLogger.info('AnomalyAlertSystem initialized', {
      channels: Object.entries(this.config.channels)
        .filter(([_, enabled]) => enabled)
        .map(([channel]) => channel)
    });
  }
  
  /**
   * Initialize notification handlers for each channel
   */
  initializeNotificationHandlers() {
    // Console handler (already in parent)
    this.notificationHandlers.set('console', async (alert) => {
      this.displayAlert(alert);
      return true;
    });
    
    // File handler
    if (this.config.channels.file) {
      this.notificationHandlers.set('file', async (alert) => {
        return await this.writeAlertToFile(alert);
      });
    }
    
    // Webhook handler
    if (this.config.channels.webhook && this.config.webhookConfig.url) {
      this.notificationHandlers.set('webhook', async (alert) => {
        return await this.sendWebhookNotification(alert);
      });
    }
    
    // Email handler (placeholder)
    if (this.config.channels.email) {
      this.notificationHandlers.set('email', async (alert) => {
        // Implement email notification
        monitorLogger.debug('Email notification not implemented yet');
        return false;
      });
    }
  }
  
  /**
   * Process an anomaly detection result into alerts
   */
  async processAnomalyResult(address, anomalyResult, additionalContext = {}) {
    if (anomalyResult.riskLevel === 'NONE') {
      return null;
    }
    
    // Create base alert from anomaly result
    const baseAlert = {
      id: `anomaly_${address}_${Date.now()}`,
      type: 'ANOMALY_DETECTED',
      subtype: anomalyResult.anomalies[0].type,
      severity: this.calculateAlertSeverity(anomalyResult),
      timestamp: new Date().toISOString(),
      address,
      message: anomalyResult.summary,
      riskScore: anomalyResult.riskScore,
      riskLevel: anomalyResult.riskLevel,
      anomalies: anomalyResult.anomalies,
      recommendations: anomalyResult.recommendations,
      context: additionalContext
    };
    
    // Apply smart filtering
    if (this.config.enableSmartFiltering && this.shouldSuppressAlert(baseAlert)) {
      this.alertStats.suppressed++;
      monitorLogger.debug(`Suppressed duplicate alert: ${baseAlert.subtype} for ${address.slice(0, 8)}...`);
      return null;
    }
    
    // Check for aggregation
    if (this.config.enableAggregation && this.shouldAggregateAlert(baseAlert)) {
      this.addToAggregationBuffer(baseAlert);
      return null;
    }
    
    // Process the alert
    return await this.processAlert(baseAlert);
  }
  
  /**
   * Process a single alert through all channels
   */
  async processAlert(alert) {
    // Enhance alert with additional data
    const enhancedAlert = await this.enhanceAlert(alert);
    
    // Update statistics
    this.alertStats.total++;
    this.alertStats.bySeverity[enhancedAlert.severity] = 
      (this.alertStats.bySeverity[enhancedAlert.severity] || 0) + 1;
    this.alertStats.byType[enhancedAlert.type] = 
      (this.alertStats.byType[enhancedAlert.type] || 0) + 1;
    
    // Send to all enabled channels
    const results = await this.notifyAllChannels(enhancedAlert);
    
    // Track duplicate for future suppression
    this.trackDuplicate(enhancedAlert);
    
    // Save to storage
    if (this.storage) {
      try {
        await this.storage.saveAlert([enhancedAlert]);
      } catch (error) {
        monitorLogger.error('Failed to save alert to storage', error);
      }
    }
    
    // Add to alert log
    this.alertLog.push(enhancedAlert);
    
    return {
      alert: enhancedAlert,
      notificationResults: results
    };
  }
  
  /**
   * Process multiple alerts (override parent method)
   */
  async processAlerts(alerts) {
    const results = [];
    
    for (const alert of alerts) {
      const result = await this.processAlert(alert);
      if (result) {
        results.push(result);
      }
    }
    
    // Display summary
    this.displayEnhancedSummary(results.map(r => r.alert));
    
    return results;
  }
  
  /**
   * Calculate alert severity based on anomaly data
   */
  calculateAlertSeverity(anomalyResult) {
    const { riskScore, anomalies } = anomalyResult;
    const rules = this.config.priorityRules;
    
    // Check for critical anomaly types
    const hasCriticalType = anomalies.some(a => 
      rules.CRITICAL.anomalyTypes.includes(a.type)
    );
    
    if (riskScore >= rules.CRITICAL.anomalyRiskScore || hasCriticalType) {
      return 'CRITICAL';
    }
    
    // Check for high priority
    const hasHighType = anomalies.some(a => 
      rules.HIGH.anomalyTypes.includes(a.type)
    );
    
    if (riskScore >= rules.HIGH.anomalyRiskScore || hasHighType) {
      return 'IMPORTANT';
    }
    
    // Default to notable for medium risk
    if (riskScore >= rules.MEDIUM.anomalyRiskScore) {
      return 'NOTABLE';
    }
    
    return 'NOTABLE';
  }
  
  /**
   * Check if alert should be suppressed as duplicate
   */
  shouldSuppressAlert(alert) {
    const hash = this.generateAlertHash(alert);
    const lastSeen = this.duplicateTracker.get(hash);
    
    if (lastSeen) {
      const timeSinceLastSeen = Date.now() - lastSeen;
      return timeSinceLastSeen < this.config.suppressDuplicatesWindow;
    }
    
    return false;
  }
  
  /**
   * Check if alert should be aggregated
   */
  shouldAggregateAlert(alert) {
    // Only aggregate lower severity alerts
    if (alert.severity === 'CRITICAL') {
      return false;
    }
    
    // Check if similar alerts exist in buffer
    const buffer = this.aggregationBuffer.get(alert.subtype) || [];
    return buffer.length > 0;
  }
  
  /**
   * Add alert to aggregation buffer
   */
  addToAggregationBuffer(alert) {
    const buffer = this.aggregationBuffer.get(alert.subtype) || [];
    buffer.push(alert);
    this.aggregationBuffer.set(alert.subtype, buffer);
    this.alertStats.aggregated++;
  }
  
  /**
   * Start aggregation timer
   */
  startAggregationTimer() {
    setInterval(() => {
      this.processAggregatedAlerts();
    }, this.config.aggregationWindow);
  }
  
  /**
   * Process aggregated alerts
   */
  async processAggregatedAlerts() {
    for (const [type, alerts] of this.aggregationBuffer) {
      if (alerts.length >= this.config.minAlertsToAggregate) {
        // Create aggregated alert
        const aggregatedAlert = this.createAggregatedAlert(type, alerts);
        await this.processAlert(aggregatedAlert);
      } else if (alerts.length > 0) {
        // Process individually if below threshold
        for (const alert of alerts) {
          await this.processAlert(alert);
        }
      }
    }
    
    // Clear buffer
    this.aggregationBuffer.clear();
  }
  
  /**
   * Create aggregated alert from multiple alerts
   */
  createAggregatedAlert(type, alerts) {
    const addresses = [...new Set(alerts.map(a => a.address))];
    const totalRiskScore = alerts.reduce((sum, a) => sum + a.riskScore, 0) / alerts.length;
    
    return {
      id: `aggregated_${type}_${Date.now()}`,
      type: 'AGGREGATED_ANOMALIES',
      subtype: type,
      severity: this.calculateAggregatedSeverity(alerts),
      timestamp: new Date().toISOString(),
      message: `Multiple ${type} anomalies detected across ${addresses.length} addresses`,
      aggregatedCount: alerts.length,
      addresses: addresses.slice(0, 10), // Limit to 10
      avgRiskScore: totalRiskScore,
      timeWindow: this.config.aggregationWindow,
      individualAlerts: alerts.map(a => ({
        address: a.address,
        riskScore: a.riskScore,
        timestamp: a.timestamp
      }))
    };
  }
  
  /**
   * Calculate severity for aggregated alerts
   */
  calculateAggregatedSeverity(alerts) {
    const severityScores = {
      'CRITICAL': 4,
      'IMPORTANT': 3,
      'NOTABLE': 2
    };
    
    const avgScore = alerts.reduce((sum, a) => 
      sum + (severityScores[a.severity] || 1), 0
    ) / alerts.length;
    
    if (avgScore >= 3.5) return 'CRITICAL';
    if (avgScore >= 2.5) return 'IMPORTANT';
    return 'NOTABLE';
  }
  
  /**
   * Enhance alert with additional context
   */
  async enhanceAlert(alert) {
    const enhanced = { ...alert };
    
    // Add formatted descriptions
    if (alert.anomalies && alert.anomalies.length > 0) {
      enhanced.formattedAnomalies = alert.anomalies.map(a => ({
        type: this.formatAnomalyType(a.type),
        severity: a.severity,
        confidence: `${(a.confidence * 100).toFixed(0)}%`,
        description: a.description
      }));
    }
    
    // Add risk indicators
    enhanced.riskIndicators = this.generateRiskIndicators(alert);
    
    // Add notification priority
    enhanced.notificationPriority = this.calculateNotificationPriority(alert);
    
    return enhanced;
  }
  
  /**
   * Generate risk indicators for an alert
   */
  generateRiskIndicators(alert) {
    const indicators = [];
    
    if (alert.riskScore >= 0.9) {
      indicators.push('🔴 Extreme Risk');
    } else if (alert.riskScore >= 0.7) {
      indicators.push('🟠 High Risk');
    } else if (alert.riskScore >= 0.5) {
      indicators.push('🟡 Medium Risk');
    }
    
    if (alert.anomalies) {
      const types = alert.anomalies.map(a => a.type);
      
      if (types.includes('COORDINATED_ACTIVITY') || types.includes('NETWORK_CLUSTERING')) {
        indicators.push('🔗 Possible Manipulation');
      }
      
      if (types.includes('DORMANT_AWAKENING')) {
        indicators.push('💤 Dormant Activation');
      }
      
      if (types.includes('VELOCITY_SPIKE') || types.includes('TRANSACTION_BURST')) {
        indicators.push('⚡ Rapid Activity');
      }
    }
    
    return indicators;
  }
  
  /**
   * Calculate notification priority
   */
  calculateNotificationPriority(alert) {
    let priority = 0;
    
    // Severity contribution
    const severityScores = { 'CRITICAL': 100, 'IMPORTANT': 50, 'NOTABLE': 10 };
    priority += severityScores[alert.severity] || 0;
    
    // Risk score contribution
    priority += alert.riskScore * 50;
    
    // Amount contribution (if available)
    if (alert.amount) {
      if (alert.amount >= 1000000) priority += 50;
      else if (alert.amount >= 100000) priority += 30;
      else if (alert.amount >= 10000) priority += 10;
    }
    
    // Anomaly count contribution
    if (alert.anomalies) {
      priority += alert.anomalies.length * 10;
    }
    
    return Math.min(priority, 200); // Cap at 200
  }
  
  /**
   * Send alert to all enabled channels
   */
  async notifyAllChannels(alert) {
    const results = {};
    
    for (const [channel, handler] of this.notificationHandlers) {
      if (this.config.channels[channel]) {
        try {
          const success = await handler(alert);
          results[channel] = { success, error: null };
          
          this.alertStats.byChannel[channel] = 
            (this.alertStats.byChannel[channel] || 0) + 1;
        } catch (error) {
          results[channel] = { success: false, error: error.message };
          this.alertStats.failed++;
          monitorLogger.error(`${channel} notification failed`, error);
        }
      }
    }
    
    return results;
  }
  
  /**
   * Write alert to file
   */
  async writeAlertToFile(alert) {
    const { path: basePath, format } = this.config.fileConfig;
    
    // Create directory if needed
    await fs.mkdir(basePath, { recursive: true });
    
    // Generate filename
    const date = new Date();
    const filename = `alerts_${date.toISOString().split('T')[0]}.${format}`;
    const filepath = path.join(basePath, filename);
    
    // Format alert based on file type
    let content;
    switch (format) {
      case 'json':
        content = JSON.stringify(alert, null, 2) + '\n';
        break;
      case 'csv':
        content = this.formatAlertAsCSV(alert) + '\n';
        break;
      case 'markdown':
        content = this.formatAlertAsMarkdown(alert) + '\n---\n';
        break;
      default:
        content = JSON.stringify(alert) + '\n';
    }
    
    // Append to file
    await fs.appendFile(filepath, content);
    
    // Check rotation
    await this.checkFileRotation(filepath);
    
    return true;
  }
  
  /**
   * Send webhook notification
   */
  async sendWebhookNotification(alert) {
    const { url, headers, timeout, retries } = this.config.webhookConfig;
    
    const payload = {
      alert,
      source: 'blockchain-monitor',
      timestamp: new Date().toISOString()
    };
    
    // Implement retry logic
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeout)
        });
        
        if (response.ok) {
          return true;
        }
        
        throw new Error(`Webhook returned ${response.status}`);
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    return false;
  }
  
  /**
   * Format alert as CSV
   */
  formatAlertAsCSV(alert) {
    const fields = [
      alert.timestamp,
      alert.severity,
      alert.type,
      alert.subtype || '',
      alert.address || '',
      alert.riskScore || '',
      alert.riskLevel || '',
      alert.message.replace(/"/g, '""'), // Escape quotes
      alert.recommendations ? alert.recommendations.join('; ') : ''
    ];
    
    return fields.map(f => `"${f}"`).join(',');
  }
  
  /**
   * Format alert as Markdown
   */
  formatAlertAsMarkdown(alert) {
    let md = `## ${alert.severity}: ${alert.type}\n\n`;
    md += `**Time**: ${alert.timestamp}\n`;
    md += `**Address**: ${alert.address || 'Multiple'}\n`;
    
    if (alert.riskScore) {
      md += `**Risk Score**: ${alert.riskScore.toFixed(2)} (${alert.riskLevel})\n`;
    }
    
    md += `\n### Summary\n${alert.message}\n`;
    
    if (alert.anomalies && alert.anomalies.length > 0) {
      md += `\n### Detected Anomalies\n`;
      alert.anomalies.forEach((a, i) => {
        md += `${i + 1}. **${this.formatAnomalyType(a.type)}** (${a.severity})\n`;
        md += `   - Confidence: ${(a.confidence * 100).toFixed(0)}%\n`;
        md += `   - ${a.description}\n`;
      });
    }
    
    if (alert.recommendations && alert.recommendations.length > 0) {
      md += `\n### Recommendations\n`;
      alert.recommendations.forEach(r => {
        md += `- ${r}\n`;
      });
    }
    
    return md;
  }
  
  /**
   * Check and perform file rotation
   */
  async checkFileRotation(filepath) {
    try {
      const stats = await fs.stat(filepath);
      
      if (stats.size > this.config.fileConfig.rotationSize) {
        const rotatedPath = filepath.replace(/\.(\w+)$/, `.${Date.now()}.$1`);
        await fs.rename(filepath, rotatedPath);
        monitorLogger.info(`Rotated alert file: ${path.basename(rotatedPath)}`);
      }
    } catch (error) {
      // File doesn't exist yet, ignore
    }
  }
  
  /**
   * Generate alert hash for duplicate detection
   */
  generateAlertHash(alert) {
    const components = [
      alert.type,
      alert.subtype,
      alert.address,
      alert.severity,
      Math.floor(alert.riskScore * 10) // Round to nearest 0.1
    ];
    
    return components.filter(c => c).join(':');
  }
  
  /**
   * Track alert for duplicate detection
   */
  trackDuplicate(alert) {
    const hash = this.generateAlertHash(alert);
    this.duplicateTracker.set(hash, Date.now());
    
    // Clean old entries
    if (this.duplicateTracker.size > 1000) {
      const cutoff = Date.now() - this.config.suppressDuplicatesWindow;
      for (const [hash, timestamp] of this.duplicateTracker) {
        if (timestamp < cutoff) {
          this.duplicateTracker.delete(hash);
        }
      }
    }
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
   * Display enhanced summary with anomaly statistics
   */
  displayEnhancedSummary(alerts) {
    super.displaySummary(alerts);
    
    // Add anomaly-specific statistics
    const anomalyAlerts = alerts.filter(a => a.type === 'ANOMALY_DETECTED');
    
    if (anomalyAlerts.length > 0) {
      console.log('\n🔍 ANOMALY DETECTION SUMMARY:');
      console.log('─'.repeat(70));
      
      // Risk distribution
      const riskLevels = {};
      anomalyAlerts.forEach(a => {
        riskLevels[a.riskLevel] = (riskLevels[a.riskLevel] || 0) + 1;
      });
      
      console.log('Risk Levels:');
      Object.entries(riskLevels).forEach(([level, count]) => {
        console.log(`  ${level}: ${count}`);
      });
      
      // Top anomaly types
      const anomalyTypes = {};
      anomalyAlerts.forEach(a => {
        if (a.anomalies) {
          a.anomalies.forEach(anomaly => {
            anomalyTypes[anomaly.type] = (anomalyTypes[anomaly.type] || 0) + 1;
          });
        }
      });
      
      console.log('\nTop Anomaly Types:');
      Object.entries(anomalyTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([type, count]) => {
          console.log(`  ${this.formatAnomalyType(type)}: ${count}`);
        });
      
      // Average risk score
      const avgRisk = anomalyAlerts.reduce((sum, a) => sum + (a.riskScore || 0), 0) / anomalyAlerts.length;
      console.log(`\nAverage Risk Score: ${avgRisk.toFixed(2)}`);
      console.log('─'.repeat(70));
    }
  }
  
  /**
   * Get alert system statistics
   */
  getStats() {
    return {
      ...this.alertStats,
      queueSize: this.alertQueue.length,
      duplicateTrackerSize: this.duplicateTracker.size,
      aggregationBufferSize: Array.from(this.aggregationBuffer.values())
        .reduce((sum, buffer) => sum + buffer.length, 0),
      channels: Object.entries(this.config.channels)
        .filter(([_, enabled]) => enabled)
        .map(([channel]) => channel)
    };
  }
  
  /**
   * Clear alert history and caches
   */
  clearHistory() {
    this.alertLog = [];
    this.alertQueue = [];
    this.duplicateTracker.clear();
    this.aggregationBuffer.clear();
    monitorLogger.info('Alert history cleared');
  }
}

export default AnomalyAlertSystem;