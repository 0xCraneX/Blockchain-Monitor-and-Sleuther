#!/usr/bin/env node

/**
 * Monitoring Alerts System
 * Comprehensive alerting for hybrid rollout monitoring
 */

const nodemailer = require('nodemailer');
const https = require('https');

class MonitoringAlerts {
  constructor(config = {}) {
    this.config = {
      email: {
        enabled: config.email?.enabled || false,
        smtp: {
          host: config.email?.smtp?.host || process.env.SMTP_HOST,
          port: config.email?.smtp?.port || 587,
          user: config.email?.smtp?.user || process.env.SMTP_USER,
          pass: config.email?.smtp?.pass || process.env.SMTP_PASS
        },
        recipients: config.email?.recipients || [process.env.ALERT_EMAIL].filter(Boolean)
      },
      webhook: {
        enabled: config.webhook?.enabled || false,
        url: config.webhook?.url || process.env.WEBHOOK_URL,
        slackChannel: config.webhook?.slackChannel || '#alerts'
      },
      console: {
        enabled: config.console?.enabled !== false
      },
      throttling: {
        enabled: true,
        windowMs: 300000, // 5 minutes
        maxAlertsPerWindow: 10
      }
    };
    
    this.alertHistory = [];
    this.throttleMap = new Map();
    this.emailTransporter = null;
    
    this.initializeEmailTransporter();
    console.log('[ALERTS] Monitoring alerts system initialized');
  }
  
  initializeEmailTransporter() {
    if (this.config.email.enabled && this.config.email.smtp.host) {
      try {
        this.emailTransporter = nodemailer.createTransporter({
          host: this.config.email.smtp.host,
          port: this.config.email.smtp.port,
          secure: this.config.email.smtp.port === 465,
          auth: {
            user: this.config.email.smtp.user,
            pass: this.config.email.smtp.pass
          }
        });
        
        console.log('[ALERTS] Email transporter initialized');
      } catch (error) {
        console.error('[ALERTS] Failed to initialize email transporter:', error.message);
      }
    }
  }
  
  async sendAlert(alert) {
    const alertData = {
      id: this.generateAlertId(),
      timestamp: Date.now(),
      ...alert
    };
    
    // Check throttling
    if (this.isThrottled(alertData)) {
      console.log(`[ALERTS] Alert throttled: ${alertData.type}`);
      return;
    }
    
    // Add to history
    this.alertHistory.push(alertData);
    this.cleanupHistory();
    
    // Send through all configured channels
    const promises = [];
    
    if (this.config.console.enabled) {
      promises.push(this.sendConsoleAlert(alertData));
    }
    
    if (this.config.email.enabled && this.emailTransporter) {
      promises.push(this.sendEmailAlert(alertData));
    }
    
    if (this.config.webhook.enabled && this.config.webhook.url) {
      promises.push(this.sendWebhookAlert(alertData));
    }
    
    try {
      await Promise.allSettled(promises);
      console.log(`[ALERTS] Alert sent: ${alertData.type} (${alertData.severity})`);
    } catch (error) {
      console.error('[ALERTS] Error sending alert:', error.message);
    }
    
    return alertData.id;
  }
  
  async sendConsoleAlert(alert) {
    const emoji = this.getSeverityEmoji(alert.severity);
    const timestamp = new Date(alert.timestamp).toLocaleString();
    
    console.log('');
    console.log('🚨 MONITORING ALERT 🚨');
    console.log('=' .repeat(50));
    console.log(`${emoji} Type: ${alert.type}`);
    console.log(`📅 Time: ${timestamp}`);
    console.log(`⚠️  Severity: ${alert.severity.toUpperCase()}`);
    console.log(`📝 Title: ${alert.title}`);
    console.log(`📄 Message: ${alert.message}`);
    
    if (alert.details) {
      console.log('📊 Details:');
      console.log(JSON.stringify(alert.details, null, 2));
    }
    
    if (alert.actions) {
      console.log('🔧 Recommended Actions:');
      alert.actions.forEach((action, index) => {
        console.log(`   ${index + 1}. ${action}`);
      });
    }
    
    console.log('=' .repeat(50));
    console.log('');
  }
  
  async sendEmailAlert(alert) {
    if (!this.emailTransporter || !this.config.email.recipients.length) {
      return;
    }
    
    const subject = `[WHALE MONITOR] ${alert.severity.toUpperCase()}: ${alert.title}`;
    const html = this.generateEmailHTML(alert);
    
    const mailOptions = {
      from: this.config.email.smtp.user,
      to: this.config.email.recipients.join(', '),
      subject,
      html
    };
    
    try {
      await this.emailTransporter.sendMail(mailOptions);
      console.log(`[ALERTS] Email sent to ${this.config.email.recipients.length} recipients`);
    } catch (error) {
      console.error('[ALERTS] Email send failed:', error.message);
    }
  }
  
  async sendWebhookAlert(alert) {
    if (!this.config.webhook.url) {
      return;
    }
    
    const payload = this.isSlackWebhook() ? 
      this.generateSlackPayload(alert) : 
      this.generateGenericWebhookPayload(alert);
    
    const postData = JSON.stringify(payload);
    
    const url = new URL(this.config.webhook.url);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('[ALERTS] Webhook sent successfully');
          resolve();
        } else {
          reject(new Error(`Webhook failed with status ${res.statusCode}`));
        }
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.write(postData);
      req.end();
    });
  }
  
  generateEmailHTML(alert) {
    const emoji = this.getSeverityEmoji(alert.severity);
    const timestamp = new Date(alert.timestamp).toLocaleString();
    const severityColor = this.getSeverityColor(alert.severity);
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: ${severityColor}; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .details { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .actions { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; }
          pre { background: #f4f4f4; padding: 10px; border-radius: 3px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${emoji} Whale Monitor Alert</h1>
            <h2>${alert.title}</h2>
            <p>Severity: ${alert.severity.toUpperCase()}</p>
          </div>
          <div class="content">
            <p><strong>Type:</strong> ${alert.type}</p>
            <p><strong>Time:</strong> ${timestamp}</p>
            <p><strong>Message:</strong> ${alert.message}</p>
            
            ${alert.details ? `
              <div class="details">
                <h3>Details</h3>
                <pre>${JSON.stringify(alert.details, null, 2)}</pre>
              </div>
            ` : ''}
            
            ${alert.actions ? `
              <div class="actions">
                <h3>Recommended Actions</h3>
                <ol>
                  ${alert.actions.map(action => `<li>${action}</li>`).join('')}
                </ol>
              </div>
            ` : ''}
          </div>
          <div class="footer">
            <p>Polkadot Whale Monitor - Hybrid Rollout System</p>
            <p>Alert ID: ${alert.id}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  
  generateSlackPayload(alert) {
    const emoji = this.getSeverityEmoji(alert.severity);
    const color = this.getSeverityColor(alert.severity);
    
    return {
      channel: this.config.webhook.slackChannel,
      username: 'Whale Monitor',
      icon_emoji: ':whale:',
      attachments: [{
        color,
        title: `${emoji} ${alert.title}`,
        text: alert.message,
        fields: [
          {
            title: 'Type',
            value: alert.type,
            short: true
          },
          {
            title: 'Severity',
            value: alert.severity.toUpperCase(),
            short: true
          },
          {
            title: 'Time',
            value: new Date(alert.timestamp).toLocaleString(),
            short: false
          }
        ],
        footer: 'Polkadot Whale Monitor',
        ts: Math.floor(alert.timestamp / 1000)
      }]
    };
  }
  
  generateGenericWebhookPayload(alert) {
    return {
      alert_id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      timestamp: alert.timestamp,
      details: alert.details,
      actions: alert.actions,
      source: 'whale-monitor-hybrid'
    };
  }
  
  getSeverityEmoji(severity) {
    const emojis = {
      critical: '🚨',
      warning: '⚠️',
      info: 'ℹ️',
      success: '✅'
    };
    return emojis[severity] || '📢';
  }
  
  getSeverityColor(severity) {
    const colors = {
      critical: '#dc3545',
      warning: '#ffc107',
      info: '#17a2b8',
      success: '#28a745'
    };
    return colors[severity] || '#6c757d';
  }
  
  isSlackWebhook() {
    return this.config.webhook.url.includes('hooks.slack.com');
  }
  
  isThrottled(alert) {
    if (!this.config.throttling.enabled) {
      return false;
    }
    
    const key = `${alert.type}-${alert.severity}`;
    const now = Date.now();
    const windowStart = now - this.config.throttling.windowMs;
    
    if (!this.throttleMap.has(key)) {
      this.throttleMap.set(key, []);
    }
    
    const timestamps = this.throttleMap.get(key);
    
    // Remove old timestamps
    const recentTimestamps = timestamps.filter(ts => ts > windowStart);
    this.throttleMap.set(key, recentTimestamps);
    
    // Check if throttled
    if (recentTimestamps.length >= this.config.throttling.maxAlertsPerWindow) {
      return true;
    }
    
    // Add current timestamp
    recentTimestamps.push(now);
    
    return false;
  }
  
  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  cleanupHistory() {
    // Keep only last 1000 alerts
    if (this.alertHistory.length > 1000) {
      this.alertHistory = this.alertHistory.slice(-1000);
    }
  }
  
  // Predefined alert types for common scenarios
  async sendCriticalError(error, context = {}) {
    return this.sendAlert({
      type: 'critical_error',
      severity: 'critical',
      title: 'Critical System Error',
      message: `A critical error occurred: ${error.message}`,
      details: {
        error: error.stack || error.message,
        context
      },
      actions: [
        'Check system logs immediately',
        'Verify all components are running',
        'Consider emergency rollback if persistent'
      ]
    });
  }
  
  async sendRolloutPhaseComplete(phase, metrics = {}) {
    return this.sendAlert({
      type: 'rollout_phase_complete',
      severity: 'success',
      title: `Rollout Phase Complete: ${phase}`,
      message: `Successfully completed ${phase} phase of hybrid rollout`,
      details: {
        phase,
        metrics,
        timestamp: new Date().toISOString()
      },
      actions: [
        'Review metrics and validate success',
        'Proceed to next phase if criteria met',
        'Monitor system stability'
      ]
    });
  }
  
  async sendValidationFailure(accuracy, threshold) {
    return this.sendAlert({
      type: 'validation_failure',
      severity: 'critical',
      title: 'Validation Accuracy Below Threshold',
      message: `Validation accuracy (${(accuracy * 100).toFixed(1)}%) below threshold (${(threshold * 100).toFixed(1)}%)`,
      details: {
        currentAccuracy: accuracy,
        requiredThreshold: threshold,
        gap: threshold - accuracy
      },
      actions: [
        'Investigate hybrid system configuration',
        'Check for data synchronization issues',
        'Consider temporary rollback if critical'
      ]
    });
  }
  
  async sendHighErrorRate(system, errorRate, threshold) {
    return this.sendAlert({
      type: 'high_error_rate',
      severity: errorRate > threshold * 2 ? 'critical' : 'warning',
      title: `High Error Rate Detected: ${system}`,
      message: `Error rate (${(errorRate * 100).toFixed(1)}%) exceeds threshold (${(threshold * 100).toFixed(1)}%)`,
      details: {
        system,
        currentErrorRate: errorRate,
        threshold,
        exceededBy: errorRate - threshold
      },
      actions: [
        `Investigate ${system} system logs`,
        'Check resource utilization',
        'Verify external service availability',
        'Consider reducing traffic to affected system'
      ]
    });
  }
  
  async sendEmergencyRollback(reason, details = {}) {
    return this.sendAlert({
      type: 'emergency_rollback',
      severity: 'critical',
      title: 'Emergency Rollback Triggered',
      message: `Emergency rollback initiated: ${reason}`,
      details: {
        reason,
        ...details,
        rollbackTime: new Date().toISOString()
      },
      actions: [
        'Verify legacy system is operational',
        'Investigate root cause of rollback',
        'Plan corrective measures before retry',
        'Update stakeholders on status'
      ]
    });
  }
  
  async sendPerformanceAlert(metric, value, threshold, trend) {
    const severity = value > threshold * 1.5 ? 'critical' : 'warning';
    
    return this.sendAlert({
      type: 'performance_alert',
      severity,
      title: `Performance Alert: ${metric}`,
      message: `${metric} (${value}) exceeds threshold (${threshold})`,
      details: {
        metric,
        currentValue: value,
        threshold,
        trend,
        exceededBy: value - threshold
      },
      actions: [
        'Check system resource utilization',
        'Review recent configuration changes',
        'Monitor for continued degradation',
        'Scale resources if needed'
      ]
    });
  }
  
  // Utility methods
  getAlertHistory(limit = 50) {
    return this.alertHistory.slice(-limit);
  }
  
  getAlertStats() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;
    
    const recentAlerts = this.alertHistory.filter(a => now - a.timestamp < oneHour);
    const dailyAlerts = this.alertHistory.filter(a => now - a.timestamp < oneDay);
    
    return {
      total: this.alertHistory.length,
      lastHour: recentAlerts.length,
      lastDay: dailyAlerts.length,
      bySeverity: {
        critical: dailyAlerts.filter(a => a.severity === 'critical').length,
        warning: dailyAlerts.filter(a => a.severity === 'warning').length,
        info: dailyAlerts.filter(a => a.severity === 'info').length,
        success: dailyAlerts.filter(a => a.severity === 'success').length
      }
    };
  }
  
  testAlerts() {
    console.log('[ALERTS] Testing alert channels...');
    
    return this.sendAlert({
      type: 'test_alert',
      severity: 'info',
      title: 'Alert System Test',
      message: 'This is a test alert to verify the monitoring system is working correctly.',
      details: {
        testTime: new Date().toISOString(),
        configuredChannels: {
          console: this.config.console.enabled,
          email: this.config.email.enabled,
          webhook: this.config.webhook.enabled
        }
      },
      actions: [
        'Verify alert received through all configured channels',
        'Check alert formatting and readability',
        'Confirm throttling is working correctly'
      ]
    });
  }
}

// CLI interface for testing
async function main() {
  const command = process.argv[2];
  
  const alerts = new MonitoringAlerts({
    console: { enabled: true },
    email: { enabled: false }, // Configure if needed
    webhook: { enabled: false } // Configure if needed
  });
  
  switch (command) {
    case 'test':
      await alerts.testAlerts();
      break;
      
    case 'critical':
      await alerts.sendCriticalError(new Error('Test critical error'));
      break;
      
    case 'validation':
      await alerts.sendValidationFailure(0.82, 0.95);
      break;
      
    case 'rollback':
      await alerts.sendEmergencyRollback('Test rollback scenario');
      break;
      
    case 'stats':
      console.log(JSON.stringify(alerts.getAlertStats(), null, 2));
      break;
      
    default:
      console.log('Monitoring Alerts System');
      console.log('Commands: test, critical, validation, rollback, stats');
      break;
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = MonitoringAlerts;