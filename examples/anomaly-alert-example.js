import { AnomalyAwareRealtimeMonitor } from '../src/monitor/AnomalyAwareRealtimeMonitor.js';
import { AnomalyAlertSystem } from '../src/alerts/AnomalyAlertSystem.js';
import { FileStorage } from '../src/storage/FileStorage.js';
import { monitorLogger } from '../src/utils/logger.js';

/**
 * Complete example of anomaly detection with alert system
 * 
 * This example demonstrates:
 * 1. Real-time blockchain monitoring
 * 2. Anomaly detection on whale activity
 * 3. Multi-channel alert notifications
 * 4. Alert aggregation and filtering
 */

async function runCompleteAnomalySystem() {
  monitorLogger.section('🚀 Starting Anomaly Detection System');
  
  // Initialize storage
  const storage = new FileStorage('./data');
  
  // Initialize alert system with multiple channels
  const alertSystem = new AnomalyAlertSystem(storage, {
    // Enable smart filtering
    enableSmartFiltering: true,
    suppressDuplicatesWindow: 3600000, // 1 hour
    maxAlertsPerHour: 50,
    
    // Enable aggregation for lower severity alerts
    enableAggregation: true,
    aggregationWindow: 300000, // 5 minutes
    minAlertsToAggregate: 3,
    
    // Configure notification channels
    channels: {
      console: true,      // Console output
      file: true,         // File logging
      webhook: false,     // Webhook notifications (configure URL below)
      email: false        // Email notifications
    },
    
    // File configuration
    fileConfig: {
      path: './alerts',
      format: 'json',     // Options: json, csv, markdown
      rotationSize: 10 * 1024 * 1024 // 10MB
    },
    
    // Webhook configuration (if enabled)
    webhookConfig: {
      url: process.env.WEBHOOK_URL || 'https://example.com/webhook',
      headers: {
        'Authorization': `Bearer ${process.env.WEBHOOK_TOKEN || 'your-token'}`
      },
      timeout: 5000,
      retries: 3
    },
    
    // Alert prioritization rules
    priorityRules: {
      CRITICAL: {
        anomalyRiskScore: 0.85,
        amount: 500000, // 500K DOT
        anomalyTypes: [
          'COORDINATED_ACTIVITY',
          'NETWORK_CLUSTERING',
          'WASH_TRADING',
          'RAPID_DRAINING'
        ]
      },
      HIGH: {
        anomalyRiskScore: 0.65,
        amount: 50000, // 50K DOT
        anomalyTypes: [
          'DORMANT_AWAKENING',
          'ROLE_CHANGE',
          'VELOCITY_SPIKE',
          'EXCHANGE_INTERACTION'
        ]
      },
      MEDIUM: {
        anomalyRiskScore: 0.45,
        amount: 5000, // 5K DOT
        anomalyTypes: [
          'AMOUNT_OUTLIER',
          'PATTERN_BREAK',
          'TIMEZONE_SHIFT',
          'UNUSUAL_HOUR_ACTIVITY'
        ]
      }
    }
  });
  
  // Initialize anomaly-aware monitor with alert system integration
  const monitor = new AnomalyAwareRealtimeMonitor({
    wsEndpoint: 'wss://rpc.polkadot.io',
    minTransferAmount: 1000, // 1000 DOT minimum
    
    // Anomaly detection settings
    anomalyDetectionEnabled: true,
    alertOnHighRiskOnly: false,
    minRiskScore: 0.3, // Lower threshold to see more anomalies
    
    // Performance settings
    batchAnomalyDetection: true,
    anomalyBatchSize: 5,
    anomalyBatchDelay: 2000,
    
    // Enhanced alert callback that uses our alert system
    onAlert: async (alert) => {
      if (alert.type === 'anomaly_detection') {
        // Process through alert system
        const result = await alertSystem.processAnomalyResult(
          alert.address,
          {
            riskScore: alert.metadata.riskScore,
            riskLevel: alert.metadata.riskLevel,
            anomalies: alert.metadata.anomalies,
            summary: alert.description,
            recommendations: alert.metadata.recommendations,
            anomalyCount: alert.metadata.anomalyCount
          },
          {
            amount: alert.amount,
            activityType: alert.metadata.activityType,
            identity: alert.metadata.identity
          }
        );
        
        if (result) {
          monitorLogger.info('Alert processed successfully', {
            channels: Object.keys(result.notificationResults),
            severity: result.alert.severity
          });
        }
      } else {
        // Regular alerts can also be processed
        await alertSystem.processAlert({
          id: alert.id,
          type: alert.type.toUpperCase(),
          severity: alert.severity === 'high' ? 'IMPORTANT' : 'NOTABLE',
          timestamp: alert.timestamp,
          address: alert.address,
          amount: alert.amount,
          message: alert.description,
          metadata: alert.metadata
        });
      }
    }
  });
  
  // Example whale accounts to monitor
  const targetAccounts = [
    {
      address: '1REAJ1k691g5Eqqg9gL7vvZCBG7FCCZ8zgQkZWd4va5ESih',
      identity: 'Major Whale #1',
      accountType: 'whale'
    },
    {
      address: '14ShUZUYUR35RBZW6uVVt1zXDxmSQddkeDdXf1JkMA6P721N',
      identity: 'Institutional Holder',
      accountType: 'institutional'
    },
    {
      address: '15jv6FMTNMhTKk8kQWTBYktpyK5eZSGqVrJFm5hXDXgwCZs9',
      identity: 'Active Trader',
      accountType: 'trader'
    },
    {
      address: '16ZL8yLyXv3V3L3z9ofR1ovFLziyXaN1DPq4yffMAZ9czzBD',
      identity: 'Exchange Cold Wallet',
      accountType: 'exchange'
    }
  ];
  
  // Connect to network
  const connected = await monitor.connect();
  
  if (!connected) {
    monitorLogger.error('Failed to connect to Polkadot network');
    process.exit(1);
  }
  
  monitorLogger.success('Connected to Polkadot network');
  
  // Start monitoring accounts
  await monitor.watchAccounts(targetAccounts);
  
  // Display initial status
  console.log('\n📊 System Status:');
  console.log('├─ Monitor: Connected');
  console.log('├─ Anomaly Detection: Enabled');
  console.log('├─ Alert Channels:');
  const alertStats = alertSystem.getStats();
  alertStats.channels.forEach(channel => {
    console.log(`│  ├─ ${channel}: ✅`);
  });
  console.log(`├─ Watching: ${targetAccounts.length} accounts`);
  console.log(`└─ Alert Filtering: ${alertSystem.config.enableSmartFiltering ? 'Enabled' : 'Disabled'}\n`);
  
  // Set up periodic status updates
  const statusInterval = setInterval(() => {
    const monitorStats = monitor.getStats();
    const alertStats = alertSystem.getStats();
    
    console.log('\n📈 Live Statistics Update:');
    console.log(`├─ Uptime: ${Math.floor((Date.now() - startTime) / 60000)} minutes`);
    console.log(`├─ Anomalies Detected: ${monitorStats.anomalyDetection.totalAnomaliesDetected}`);
    console.log(`├─ Alerts Generated: ${alertStats.total}`);
    console.log(`├─ Alerts Suppressed: ${alertStats.suppressed}`);
    console.log(`├─ Alerts Aggregated: ${alertStats.aggregated}`);
    console.log('├─ Alert Distribution:');
    Object.entries(alertStats.bySeverity).forEach(([severity, count]) => {
      if (count > 0) {
        console.log(`│  ├─ ${severity}: ${count}`);
      }
    });
    
    if (monitorStats.anomalyDetection.totalAnomaliesDetected > 0) {
      console.log('├─ Risk Levels:');
      Object.entries(monitorStats.anomalyDetection.anomaliesByRiskLevel).forEach(([level, count]) => {
        if (count > 0) {
          console.log(`│  ├─ ${level}: ${count}`);
        }
      });
      
      console.log('└─ Top Anomaly Types:');
      const topTypes = Object.entries(monitorStats.anomalyDetection.anomaliesByType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      
      topTypes.forEach(([type, count], i) => {
        const prefix = i === topTypes.length - 1 ? '   └─' : '   ├─';
        console.log(`${prefix} ${type}: ${count}`);
      });
    } else {
      console.log('└─ No anomalies detected yet');
    }
  }, 60000); // Every minute
  
  const startTime = Date.now();
  
  // Run for 10 minutes then generate report
  setTimeout(async () => {
    clearInterval(statusInterval);
    
    console.log('\n' + '═'.repeat(80));
    console.log('                    FINAL ANOMALY DETECTION REPORT');
    console.log('═'.repeat(80));
    
    const monitorStats = monitor.getStats();
    const alertStats = alertSystem.getStats();
    const runtime = Math.floor((Date.now() - startTime) / 60000);
    
    console.log(`\n📊 Summary (${runtime} minutes runtime):`);
    console.log(`├─ Total Anomalies Detected: ${monitorStats.anomalyDetection.totalAnomaliesDetected}`);
    console.log(`├─ Total Alerts Generated: ${alertStats.total}`);
    console.log(`├─ Alert Efficiency: ${alertStats.suppressed} suppressed, ${alertStats.aggregated} aggregated`);
    console.log(`├─ Average Risk Score: ${monitorStats.anomalyDetection.avgRiskScore.toFixed(3)}`);
    
    // Risk distribution
    console.log('\n📈 Risk Distribution:');
    const riskLevels = monitorStats.anomalyDetection.anomaliesByRiskLevel;
    const total = Object.values(riskLevels).reduce((a, b) => a + b, 0);
    
    Object.entries(riskLevels).forEach(([level, count]) => {
      if (count > 0) {
        const percentage = ((count / total) * 100).toFixed(1);
        const bar = '█'.repeat(Math.round(percentage / 2));
        console.log(`├─ ${level.padEnd(8)}: ${bar} ${percentage}% (${count})`);
      }
    });
    
    // Channel performance
    console.log('\n📡 Notification Channel Performance:');
    Object.entries(alertStats.byChannel).forEach(([channel, count]) => {
      console.log(`├─ ${channel}: ${count} notifications sent`);
    });
    
    if (alertStats.failed > 0) {
      console.log(`└─ Failed notifications: ${alertStats.failed}`);
    }
    
    // Top anomaly patterns
    console.log('\n🔍 Top Anomaly Patterns:');
    Object.entries(monitorStats.anomalyDetection.anomaliesByType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([type, count], i, arr) => {
        const prefix = i === arr.length - 1 ? '└─' : '├─';
        console.log(`${prefix} ${type}: ${count} occurrences`);
      });
    
    // Recent critical alerts
    const recentAlerts = alertSystem.getRecentAlerts(runtime);
    const criticalAlerts = recentAlerts.filter(a => a.severity === 'CRITICAL');
    
    if (criticalAlerts.length > 0) {
      console.log('\n⚠️  Critical Alerts Summary:');
      criticalAlerts.slice(0, 5).forEach((alert, i) => {
        console.log(`${i + 1}. ${alert.message}`);
        console.log(`   Address: ${alert.address || 'Multiple'}`);
        console.log(`   Risk Score: ${alert.riskScore?.toFixed(2) || 'N/A'}`);
        console.log(`   Time: ${new Date(alert.timestamp).toLocaleString()}\n`);
      });
    }
    
    console.log('\n' + '═'.repeat(80));
    console.log('Report generated at:', new Date().toLocaleString());
    console.log('═'.repeat(80) + '\n');
    
    // Disconnect
    await monitor.disconnect();
    console.log('✅ System shutdown complete');
    
    // Save final report
    if (alertSystem.config.channels.file) {
      const report = {
        runtime: runtime,
        stats: {
          monitor: monitorStats,
          alerts: alertStats
        },
        timestamp: new Date().toISOString()
      };
      
      try {
        const fs = await import('fs/promises');
        const reportPath = './alerts/anomaly_report_' + new Date().toISOString().split('T')[0] + '.json';
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        console.log(`📄 Full report saved to: ${reportPath}`);
      } catch (error) {
        console.error('Failed to save report:', error.message);
      }
    }
    
    process.exit(0);
  }, 10 * 60 * 1000); // 10 minutes
}

// Error handling
process.on('unhandledRejection', (error) => {
  monitorLogger.error('Unhandled error:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\n\nShutting down...');
  process.exit(0);
});

// Run the system
runCompleteAnomalySystem().catch(error => {
  monitorLogger.error('System failed:', error);
  process.exit(1);
});