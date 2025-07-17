# Polkadot Anomaly Detection System - "The Unusual Activity Monitor"

## Core Concept: Find the Signal in the Noise

**The Philosophy**: A blockchain is like a city. 99% is normal daily activity - people going to work, buying coffee. We don't care about that. We care about the fire truck racing down the street, the crowd gathering, the unusual midnight activity.

## What Makes Something "Interesting"?

### 1. Dormant Accounts Awakening
```javascript
// Account that hasn't moved in 180+ days suddenly active
if (daysSinceLastActivity > 180 && currentActivity > 0) {
  flag("DORMANT_AWAKENING", {
    address,
    dormantDays: daysSinceLastActivity,
    newActivity: currentActivity
  });
}
```

### 2. Unusual Transaction Patterns
- **Size anomalies**: Address that usually sends 10 DOT suddenly moves 10,000
- **Frequency changes**: 1 tx/month account doing 50 tx/hour
- **Time anomalies**: Account only active during specific hours changes pattern

### 3. XCM Anomalies
```javascript
// Detect unusual cross-chain patterns
const normalXCMVolume = getAverageXCMVolume(sourceChain, destChain);
if (currentVolume > normalXCMVolume * 5) {
  flag("XCM_SPIKE", {
    route: `${sourceChain} -> ${destChain}`,
    normal: normalXCMVolume,
    current: currentVolume,
    multiplier: currentVolume / normalXCMVolume
  });
}
```

### 4. Network Effect Anomalies
- Multiple related addresses becoming active simultaneously
- Funds splitting into many addresses (potential wash trading prep)
- Many addresses converging funds (potential exit scam)

## The Technical Approach

### Baseline Learning
```javascript
class BaselineTracker {
  constructor() {
    this.accountProfiles = new Map();
    this.xcmRoutes = new Map();
    this.hourlyVolumes = [];
  }

  updateProfile(address, transaction) {
    const profile = this.accountProfiles.get(address) || {
      avgTxSize: 0,
      avgTxPerDay: 0,
      activeHours: new Set(),
      commonCounterparties: new Set(),
      lastActive: null
    };
    
    // Update rolling averages
    profile.avgTxSize = (profile.avgTxSize * 0.9) + (transaction.value * 0.1);
    profile.activeHours.add(new Date().getHours());
    profile.lastActive = Date.now();
    
    this.accountProfiles.set(address, profile);
  }

  isAnomaly(address, transaction) {
    const profile = this.accountProfiles.get(address);
    if (!profile) return false; // New addresses aren't anomalies
    
    const anomalies = [];
    
    // Size anomaly
    if (transaction.value > profile.avgTxSize * 10) {
      anomalies.push({
        type: 'SIZE_ANOMALY',
        severity: Math.log10(transaction.value / profile.avgTxSize)
      });
    }
    
    // Dormant account
    const daysDormant = (Date.now() - profile.lastActive) / (1000 * 60 * 60 * 24);
    if (daysDormant > 180) {
      anomalies.push({
        type: 'DORMANT_AWAKENING',
        severity: Math.log10(daysDormant)
      });
    }
    
    return anomalies;
  }
}
```

### Real-time Detection Engine
```javascript
class AnomalyDetector {
  constructor() {
    this.baseline = new BaselineTracker();
    this.alerts = [];
  }

  async processBlock(block) {
    const blockAnomalies = [];
    
    for (const tx of block.transactions) {
      // Check for individual anomalies
      const anomalies = this.baseline.isAnomaly(tx.from, tx);
      if (anomalies.length > 0) {
        blockAnomalies.push({ tx, anomalies });
      }
      
      // Update baseline
      this.baseline.updateProfile(tx.from, tx);
    }
    
    // Check for network-wide anomalies
    const networkAnomalies = this.detectNetworkAnomalies(block);
    
    return [...blockAnomalies, ...networkAnomalies];
  }

  detectNetworkAnomalies(block) {
    // Sudden spike in transaction count
    if (block.transactions.length > this.avgBlockSize * 3) {
      return [{
        type: 'NETWORK_CONGESTION',
        severity: 'medium',
        details: `Block size ${block.transactions.length} vs normal ${this.avgBlockSize}`
      }];
    }
    
    return [];
  }
}
```

## Hackathon Demo Flow

### The Setup
"Imagine Polkadot as a city. Most of the time, everything is normal - people going about their business. But sometimes, unusual things happen. Our system detects these anomalies in real-time."

### Live Demo

1. **Normal Activity** (30 seconds)
   - Show dashboard with calm metrics
   - "This is Polkadot on a normal day"

2. **Dormant Account Awakening** (1 minute)
   - Alert flashes: "Account dormant for 423 days just moved 50,000 DOT"
   - Show account history graph with long flat line, then spike
   - "This could be a hacked account or someone exiting"

3. **XCM Anomaly** (1 minute)
   - Alert: "Unusual XCM volume: AssetHub → Moonbeam (10x normal)"
   - Show route visualization with thick red line
   - "Possible arbitrage or bridge preparation"

4. **Network Effect** (1 minute)
   - Alert: "Cluster activity detected - 15 related addresses active"
   - Show network graph lighting up
   - "This pattern often precedes major moves"

## Implementation Priorities

### Must Have (Day 1)
- [ ] Basic anomaly detection (size, dormancy)
- [ ] Real-time alert system
- [ ] Simple dashboard

### Should Have (Day 2)
- [ ] XCM anomaly detection
- [ ] Historical baseline learning
- [ ] Alert severity scoring

### Nice to Have (Day 3)
- [ ] Network effect detection
- [ ] Beautiful visualizations
- [ ] Configurable thresholds

## Why This Wins

1. **Clear Value**: "See what matters, ignore the noise"
2. **Impressive Demo**: Real-time alerts are exciting
3. **Practical**: Every trader/researcher wants this
4. **Extensible**: Can add more patterns easily

## Sample Alert Format

```json
{
  "timestamp": "2024-01-15T10:23:45Z",
  "severity": "HIGH",
  "type": "DORMANT_AWAKENING",
  "details": {
    "address": "5GrwvaEF...",
    "dormant_days": 423,
    "amount_moved": "50000 DOT",
    "destination": "AssetHub",
    "context": "Last active during crowdloan period"
  },
  "suggested_action": "Monitor for potential sell pressure"
}
```

## The One-Liner

"We built a system that watches Polkadot 24/7 and only tells you when something unusual happens - like a security guard who only calls when there's actually a problem."