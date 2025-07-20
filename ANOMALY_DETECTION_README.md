# Anomaly Detection Module for Blockchain Whale Monitoring

## Overview

This module provides comprehensive anomaly detection for monitoring the top 1000 Polkadot whales. It uses multiple detection methods to identify suspicious patterns, unusual behaviors, and potential market manipulation.

## Features

### 🔍 Detection Methods

1. **Statistical Anomaly Detection**
   - Z-score analysis for amount outliers
   - Volume anomaly detection
   - Frequency anomaly detection
   - Trend deviation analysis

2. **Behavioral Anomaly Detection**
   - Dormant account awakening (30+ days inactive)
   - Role changes (holder → trader, validator → exchange)
   - Activity level changes
   - Pattern break detection

3. **Velocity Anomaly Detection**
   - Transaction rate spikes (5x normal)
   - Sustained high activity periods
   - Acceleration/deceleration patterns
   - Transaction burst detection

4. **Network Anomaly Detection**
   - New connection expansion
   - Clustering behavior (wash trading, sybil detection)
   - Coordinated activity between addresses
   - Bridge/hub behavior detection
   - Exchange interaction patterns

5. **Temporal Anomaly Detection**
   - Unusual hour activity
   - Weekend/weekday pattern breaks
   - Timezone shift detection
   - Periodic pattern analysis
   - Holiday activity detection
   - Late night burst detection

### 🎯 Integrated Features

- **Risk Scoring**: Weighted combination of all detectors
- **Pattern Learning**: Adaptive baselines for each whale
- **Alert Generation**: Multi-channel notification system
- **Smart Filtering**: Duplicate suppression and aggregation
- **Real-time Integration**: Works with WebSocket monitoring

## Quick Start

```javascript
import { createAnomalyEngine } from './src/anomaly/index.js';

// Initialize the engine
const anomalyEngine = createAnomalyEngine({
  enabled: true,
  updatePatternsEnabled: true,
  learningEnabled: true
});

// Analyze whale activity
const result = await anomalyEngine.analyzeActivity(
  whaleAddress,
  currentActivity,
  recentTransfers,
  relatedAddresses
);

if (result.riskLevel !== 'NONE') {
  console.log(`Anomaly detected: ${result.summary}`);
  console.log(`Risk Score: ${result.riskScore}`);
  console.log(`Recommendations:`, result.recommendations);
}
```

## Architecture

```
src/anomaly/
├── BaseAnomalyDetector.js      # Abstract base class
├── PatternStorage.js           # Pattern management for 1000 whales
├── AnomalyEngine.js           # Integrated detection engine
├── detectors/
│   ├── StatisticalAnomalyDetector.js
│   ├── BehavioralAnomalyDetector.js
│   ├── VelocityAnomalyDetector.js
│   ├── NetworkAnomalyDetector.js
│   └── TemporalAnomalyDetector.js
└── index.js                   # Module exports
```

## Detection Examples

### 1. Dormant Whale Awakening
```
🚨 CRITICAL: Account active after 180 days of dormancy
- Moving 500,000 DOT
- Previous role: Holder
- Risk indicators: 🔴 Extreme Risk, 💤 Dormant Activation
```

### 2. Coordinated Activity
```
⚠️ HIGH: 5 addresses showing coordinated behavior (85% correlation)
- Synchronized transactions within 5-minute windows
- Common counterparties detected
- Risk indicators: 🟠 High Risk, 🔗 Possible Manipulation
```

### 3. Velocity Spike
```
📊 MEDIUM: Transaction rate 10x normal in last hour
- 50 transactions vs normal 5/hour
- Burst pattern detected
- Risk indicators: 🟡 Medium Risk, ⚡ Rapid Activity
```

## Configuration

### Detector Weights
```javascript
weights: {
  statistical: 0.25,   // Amount outliers, volume anomalies
  behavioral: 0.20,    // Role changes, dormancy
  velocity: 0.20,      // Rate spikes, bursts
  network: 0.20,       // Connections, clustering
  temporal: 0.15       // Timing patterns
}
```

### Risk Thresholds
```javascript
riskThresholds: {
  low: 0.3,      // Information only
  medium: 0.5,   // Worth investigating
  high: 0.7,     // Priority investigation
  critical: 0.9  // Immediate action required
}
```

## Pattern Storage

The system maintains behavioral patterns for each of the 1000 whales:

- **Statistical Baselines**: Transfer amounts, daily volumes
- **Behavioral Profiles**: Role classification, activity levels
- **Velocity Patterns**: Transaction rates, spike history
- **Network Graphs**: Connection maps, interaction patterns
- **Temporal Signatures**: Time preferences, timezone estimation

### Storage Structure
```javascript
{
  address: "...",
  statistical: {
    transferAmounts: { mean, stdDev, history },
    dailyVolume: { mean, stdDev, history }
  },
  behavioral: {
    role: "holder|trader|validator|exchange",
    activityLevel: "high|medium|low|dormant",
    lastActivity: "2024-01-19T..."
  },
  velocity: {
    hourlyRate: { current, average, max },
    spikes: [...],
    sustainedPeriods: [...]
  },
  network: {
    totalUniqueAddresses: 150,
    coreNetwork: ["addr1", "addr2", ...],
    recentConnections: [...]
  },
  temporal: {
    timezone: "UTC+8",
    preferredHours: [9, 10, 14, 15],
    hourlyDistribution: [...]
  }
}
```

## Alert Integration

### With Real-time Monitor
```javascript
import { AnomalyAwareRealtimeMonitor } from './src/monitor/AnomalyAwareRealtimeMonitor.js';

const monitor = new AnomalyAwareRealtimeMonitor({
  anomalyDetectionEnabled: true,
  minRiskScore: 0.5,
  onAlert: (alert) => {
    if (alert.type === 'anomaly_detection') {
      console.log('Anomaly:', alert.metadata.anomalies);
      console.log('Risk Score:', alert.metadata.riskScore);
      console.log('Recommendations:', alert.metadata.recommendations);
    }
  }
});
```

### With Alert System
```javascript
import { AnomalyAlertSystem } from './src/alerts/AnomalyAlertSystem.js';

const alertSystem = new AnomalyAlertSystem(storage, {
  channels: {
    console: true,
    file: true,
    webhook: true
  },
  enableSmartFiltering: true,
  enableAggregation: true
});
```

## Performance Considerations

- **Memory Usage**: ~100MB for 1000 whale patterns
- **Detection Time**: <50ms per activity analysis
- **Storage**: ~50MB compressed pattern data
- **Cache Hit Rate**: >90% for active whales

## Anomaly Types Reference

### Statistical
- `AMOUNT_OUTLIER`: Transfer amount >3σ from mean
- `VOLUME_ANOMALY`: Daily volume spike
- `FREQUENCY_ANOMALY`: Transaction rate anomaly
- `TREND_DEVIATION`: Breaks established trend

### Behavioral
- `DORMANT_AWAKENING`: Inactive account becomes active
- `ROLE_CHANGE`: Account behavior pattern shift
- `ACTIVITY_LEVEL_CHANGE`: Significant activity change
- `PATTERN_BREAK`: Multiple pattern violations

### Velocity
- `VELOCITY_SPIKE`: Sudden rate increase
- `SUSTAINED_HIGH_ACTIVITY`: Prolonged high activity
- `VELOCITY_ACCELERATION`: Increasing rate trend
- `TRANSACTION_BURST`: Many transactions quickly

### Network
- `NETWORK_EXPANSION`: Many new connections
- `NETWORK_CLUSTERING`: Tight group behavior
- `COORDINATED_ACTIVITY`: Synchronized actions
- `BRIDGE_BEHAVIOR`: Acting as intermediary
- `EXCHANGE_INTERACTION`: Exchange deposit/withdrawal

### Temporal
- `UNUSUAL_HOUR_ACTIVITY`: Activity at odd hours
- `WEEKEND_PATTERN_BREAK`: Weekend activity anomaly
- `TIMEZONE_SHIFT`: Activity timezone change
- `PERIODIC_PATTERN_BREAK`: Breaks regular pattern
- `LATE_NIGHT_BURST`: Suspicious late activity
- `COORDINATED_TIMING`: Time-correlated activity

## Best Practices

1. **Tuning Thresholds**
   - Start with default values
   - Monitor false positive rate
   - Adjust based on your risk tolerance

2. **Pattern Learning**
   - Allow 30+ days for baseline establishment
   - Review and validate role classifications
   - Monitor pattern drift over time

3. **Alert Management**
   - Use smart filtering to reduce noise
   - Set up appropriate notification channels
   - Regularly review aggregated alerts

4. **Performance Optimization**
   - Enable batch processing for multiple addresses
   - Use caching for frequently accessed patterns
   - Consider sharding for >1000 addresses

## Troubleshooting

### High False Positive Rate
- Increase `minConfidence` threshold
- Adjust detector weights
- Enable smart filtering
- Review pattern baselines

### Missing Anomalies
- Decrease risk thresholds
- Check pattern data quality
- Verify transaction history loading
- Review detector configurations

### Performance Issues
- Enable batch anomaly detection
- Increase cache sizes
- Reduce pattern history length
- Use file-based pattern storage

## Complete Example

See `examples/anomaly-alert-example.js` for a full implementation showing:
- Real-time monitoring with anomaly detection
- Multi-channel alert notifications
- Alert aggregation and filtering
- Performance monitoring and reporting

## Future Enhancements

- Machine learning integration
- Cross-chain anomaly correlation
- Predictive risk scoring
- Automated response actions
- Custom anomaly rules engine