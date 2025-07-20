import { AnomalyAwareRealtimeMonitor } from './AnomalyAwareRealtimeMonitor.js';
import { monitorLogger } from '../utils/logger.js';

/**
 * Example: How to use the Anomaly-Aware Real-time Monitor
 * 
 * This example shows how to monitor Polkadot whales in real-time
 * with integrated anomaly detection
 */

async function runAnomalyMonitor() {
  // Initialize the monitor with anomaly detection
  const monitor = new AnomalyAwareRealtimeMonitor({
    // WebSocket configuration
    wsEndpoint: 'wss://rpc.polkadot.io',
    minTransferAmount: 1000, // 1000 DOT minimum
    
    // Anomaly detection configuration
    anomalyDetectionEnabled: true,
    alertOnHighRiskOnly: false, // Alert on all anomalies
    minRiskScore: 0.5, // Minimum risk score to generate alerts
    
    // Performance settings
    batchAnomalyDetection: true,
    anomalyBatchSize: 5,
    anomalyBatchDelay: 2000, // 2 seconds
    
    // Anomaly engine configuration
    anomalyEngine: {
      weights: {
        statistical: 0.25,
        behavioral: 0.20,
        velocity: 0.20,
        network: 0.20,
        temporal: 0.15
      },
      riskThresholds: {
        low: 0.3,
        medium: 0.5,
        high: 0.7,
        critical: 0.9
      }
    },
    
    // Alert callback
    onAlert: (alert) => {
      monitorLogger.section('🚨 ALERT DETECTED');
      
      if (alert.type === 'anomaly_detection') {
        // Anomaly alert
        console.log(`
╔══════════════════════════════════════════════════════════════════╗
║ ANOMALY ALERT: ${alert.title.padEnd(50)}║
╠══════════════════════════════════════════════════════════════════╣
║ Address: ${alert.address.slice(0, 16)}...${alert.address.slice(-8).padEnd(25)}║
║ Risk Level: ${alert.metadata.riskLevel.padEnd(54)}║
║ Risk Score: ${alert.metadata.riskScore.toFixed(2).padEnd(54)}║
║ Description: ${alert.description.slice(0, 52).padEnd(53)}║
╠══════════════════════════════════════════════════════════════════╣
║ Primary Anomaly: ${alert.pattern.padEnd(49)}║
║ Anomaly Count: ${alert.metadata.anomalyCount.toString().padEnd(51)}║
╠══════════════════════════════════════════════════════════════════╣
║ Recommendations:                                                 ║`);
        
        alert.metadata.recommendations.forEach(rec => {
          console.log(`║ • ${rec.slice(0, 62).padEnd(63)}║`);
        });
        
        console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);
        
        // Log detailed anomalies
        if (alert.metadata.anomalies.length > 0) {
          console.log('Detected Anomalies:');
          alert.metadata.anomalies.forEach((anomaly, i) => {
            console.log(`  ${i + 1}. ${anomaly.type} (${anomaly.severity})
     Confidence: ${(anomaly.confidence * 100).toFixed(0)}%
     ${anomaly.description}\n`);
          });
        }
        
      } else {
        // Regular balance/transfer alert
        console.log(`
┌─────────────────────────────────────────────────────────────────┐
│ ${alert.title.padEnd(64)}│
├─────────────────────────────────────────────────────────────────┤
│ ${alert.description.padEnd(64)}│
│ Amount: ${alert.amount.toLocaleString().padEnd(56)} DOT │
│ Time: ${new Date(alert.timestamp).toLocaleString().padEnd(58)}│
└─────────────────────────────────────────────────────────────────┘\n`);
      }
    }
  });
  
  // Example whale addresses to monitor
  const whaleAccounts = [
    {
      address: '1REAJ1k691g5Eqqg9gL7vvZCBG7FCCZ8zgQkZWd4va5ESih',
      identity: 'Example Whale 1',
      accountType: 'whale'
    },
    {
      address: '14ShUZUYUR35RBZW6uVVt1zXDxmSQddkeDdXf1JkMA6P721N',
      identity: 'Example Whale 2',
      accountType: 'whale'
    },
    {
      address: '15jv6FMTNMhTKk8kQWTBYktpyK5eZSGqVrJFm5hXDXgwCZs9',
      identity: 'Example Exchange',
      accountType: 'exchange'
    }
  ];
  
  // Connect and start monitoring
  const connected = await monitor.connect();
  
  if (connected) {
    monitorLogger.success('Connected to Polkadot network with anomaly detection');
    
    // Start watching accounts
    await monitor.watchAccounts(whaleAccounts);
    
    // Display initial stats
    const stats = monitor.getStats();
    console.log('\n📊 Monitor Statistics:');
    console.log(`├─ Connected: ${stats.connected}`);
    console.log(`├─ Watching: ${stats.watchedAddresses} addresses`);
    console.log(`├─ Anomaly Detection: ${stats.anomalyDetection.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`└─ Engine Detectors: ${stats.anomalyDetection.engineStats.detectorsActive}`);
    
    // Monitor for 5 minutes then show final stats
    setTimeout(() => {
      const finalStats = monitor.getStats();
      console.log('\n📈 Final Statistics:');
      console.log(`├─ Total Anomalies: ${finalStats.anomalyDetection.totalAnomaliesDetected}`);
      console.log(`├─ Average Risk Score: ${finalStats.anomalyDetection.avgRiskScore.toFixed(2)}`);
      console.log(`├─ Risk Levels:`);
      Object.entries(finalStats.anomalyDetection.anomaliesByRiskLevel).forEach(([level, count]) => {
        if (count > 0) {
          console.log(`│  ├─ ${level}: ${count}`);
        }
      });
      console.log(`└─ Top Anomaly Types:`);
      Object.entries(finalStats.anomalyDetection.anomaliesByType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([type, count], i, arr) => {
          const prefix = i === arr.length - 1 ? '   └─' : '   ├─';
          console.log(`${prefix} ${type}: ${count}`);
        });
      
      // Disconnect
      monitor.disconnect().then(() => {
        console.log('\n✅ Monitor disconnected');
        process.exit(0);
      });
    }, 5 * 60 * 1000); // 5 minutes
    
  } else {
    monitorLogger.error('Failed to connect to network');
    process.exit(1);
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  monitorLogger.error('Unhandled error:', error);
  process.exit(1);
});

// Run the monitor
runAnomalyMonitor().catch(error => {
  monitorLogger.error('Monitor failed:', error);
  process.exit(1);
});