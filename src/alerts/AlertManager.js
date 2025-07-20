const { alertLogger } = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class AlertManager {
  constructor(storage) {
    this.storage = storage;
    this.alertLog = [];
    this.severityEmojis = {
      CRITICAL: '🚨',
      IMPORTANT: '⚠️',
      NOTABLE: '📊'
    };
    
    this.severityColors = {
      CRITICAL: '\x1b[91m',  // Bright red
      IMPORTANT: '\x1b[93m', // Bright yellow
      NOTABLE: '\x1b[96m'    // Bright cyan
    };
    
    alertLogger.info('AlertManager initialized');
  }

  // Format alert for console display
  formatAlert(alert) {
    const emoji = this.severityEmojis[alert.severity] || '📌';
    const color = this.severityColors[alert.severity] || '\x1b[0m';
    const reset = '\x1b[0m';
    
    // Truncate address for display
    const shortAddress = alert.address ? 
      `${alert.address.slice(0, 8)}...${alert.address.slice(-6)}` : 
      'Multiple';
    
    // Format amount
    const amountStr = alert.amount ? 
      `${alert.amount.toLocaleString()} DOT` : 
      alert.totalVolume ? 
      `${alert.totalVolume.toLocaleString()} DOT` : 
      'N/A';
    
    // Build detailed message based on alert type
    let details = '';
    switch (alert.type) {
      case 'DORMANT_AWAKENING':
        details = `after ${alert.daysDormant} days`;
        break;
      case 'LARGE_MOVEMENT':
        details = `${alert.direction} ${alert.percentChange}%`;
        break;
      case 'UNBONDING_DETECTED':
        const unbondDate = new Date(alert.unbondingCompleteDate);
        details = `completes ${unbondDate.toLocaleDateString()}`;
        break;
      case 'NEW_WHALE':
        details = `rank #${alert.rank || 'N/A'}`;
        break;
      case 'WHALE_EXIT':
        details = 'dropped from top list';
        break;
      case 'COORDINATION_DETECTED':
        details = `${alert.whaleCount} whales`;
        break;
      case 'CONSOLIDATION':
      case 'RAPID_DRAINING':
        details = `${alert.percentChange.toFixed(1)}% change`;
        break;
    }
    
    return {
      emoji,
      color,
      reset,
      shortAddress,
      amountStr,
      details,
      formatted: `${color}${emoji} [${alert.severity}] ${alert.type}${reset}\n` +
                 `   Address: ${shortAddress}\n` +
                 `   Amount: ${amountStr}\n` +
                 `   ${alert.message}\n` +
                 `   ${details ? `Details: ${details}` : ''}`
    };
  }

  // Display alert in console
  displayAlert(alert) {
    const formatted = this.formatAlert(alert);
    console.log(formatted.formatted);
    console.log('   ' + '─'.repeat(60));
  }

  // Display alert summary
  displaySummary(alerts) {
    if (alerts.length === 0) {
      alertLogger.info('No alerts detected in this monitoring cycle');
      return;
    }
    
    // Group by severity
    const critical = alerts.filter(a => a.severity === 'CRITICAL');
    const important = alerts.filter(a => a.severity === 'IMPORTANT');
    const notable = alerts.filter(a => a.severity === 'NOTABLE');
    
    console.log('\n' + '═'.repeat(70));
    console.log('                    ALERT SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Total Alerts: ${alerts.length}`);
    console.log(`🚨 Critical: ${critical.length} | ⚠️  Important: ${important.length} | 📊 Notable: ${notable.length}`);
    console.log('═'.repeat(70) + '\n');
    
    // Display critical alerts first
    if (critical.length > 0) {
      console.log('\x1b[91m🚨 CRITICAL ALERTS:\x1b[0m');
      console.log('─'.repeat(70));
      critical.forEach(alert => this.displayAlert(alert));
    }
    
    // Then important
    if (important.length > 0) {
      console.log('\n\x1b[93m⚠️  IMPORTANT ALERTS:\x1b[0m');
      console.log('─'.repeat(70));
      important.forEach(alert => this.displayAlert(alert));
    }
    
    // Finally notable
    if (notable.length > 0) {
      console.log('\n\x1b[96m📊 NOTABLE ALERTS:\x1b[0m');
      console.log('─'.repeat(70));
      notable.forEach(alert => this.displayAlert(alert));
    }
    
    console.log('\n' + '═'.repeat(70) + '\n');
  }

  // Process and handle alerts
  async processAlerts(alerts) {
    alertLogger.info(`Processing ${alerts.length} alerts`);
    
    // Add to internal log
    this.alertLog.push(...alerts);
    
    // Save to storage
    if (this.storage && alerts.length > 0) {
      try {
        await this.storage.saveAlert(alerts);
        alertLogger.success(`Saved ${alerts.length} alerts to storage`);
      } catch (error) {
        alertLogger.error('Failed to save alerts', error);
      }
    }
    
    // Display summary
    this.displaySummary(alerts);
    
    // Check for critical alerts that need immediate attention
    const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL');
    if (criticalAlerts.length > 0) {
      this.notifyCriticalAlerts(criticalAlerts);
    }
    
    return alerts;
  }

  // Special handling for critical alerts
  notifyCriticalAlerts(criticalAlerts) {
    console.log('\n\x1b[91m' + '!'.repeat(70) + '\x1b[0m');
    console.log('\x1b[91m!!!                  CRITICAL ALERTS DETECTED                    !!!\x1b[0m');
    console.log('\x1b[91m' + '!'.repeat(70) + '\x1b[0m\n');
    
    criticalAlerts.forEach(alert => {
      console.log(`\x1b[91m🚨 ${alert.type}: ${alert.message}\x1b[0m`);
      if (alert.address) {
        console.log(`   Address: ${alert.address}`);
      }
      if (alert.amount) {
        console.log(`   Amount: ${alert.amount.toLocaleString()} DOT`);
      }
    });
    
    console.log('\n\x1b[91m' + '!'.repeat(70) + '\x1b[0m\n');
  }

  // Get recent alerts
  getRecentAlerts(minutes = 60) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return this.alertLog.filter(alert => 
      new Date(alert.timestamp).getTime() > cutoff
    );
  }

  // Get alerts by severity
  getAlertsBySeverity(severity) {
    return this.alertLog.filter(alert => alert.severity === severity);
  }

  // Get alerts by type
  getAlertsByType(type) {
    return this.alertLog.filter(alert => alert.type === type);
  }

  // Clear old alerts from memory
  clearOldAlerts(hours = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const beforeCount = this.alertLog.length;
    
    this.alertLog = this.alertLog.filter(alert =>
      new Date(alert.timestamp).getTime() > cutoff
    );
    
    const removed = beforeCount - this.alertLog.length;
    if (removed > 0) {
      alertLogger.info(`Cleared ${removed} old alerts from memory`);
    }
  }

  // Get statistics
  getStats() {
    const stats = {
      total: this.alertLog.length,
      bySeverity: {
        CRITICAL: this.getAlertsBySeverity('CRITICAL').length,
        IMPORTANT: this.getAlertsBySeverity('IMPORTANT').length,
        NOTABLE: this.getAlertsBySeverity('NOTABLE').length
      },
      byType: {}
    };
    
    // Count by type
    this.alertLog.forEach(alert => {
      stats.byType[alert.type] = (stats.byType[alert.type] || 0) + 1;
    });
    
    return stats;
  }
}

module.exports = AlertManager;