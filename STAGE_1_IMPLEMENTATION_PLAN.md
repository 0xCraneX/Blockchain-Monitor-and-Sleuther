# 🏁 Stage 1 Implementation Plan - Hackathon Day

## Overview
**Goal**: Build a functional Polkadot Whale Monitor in 8-10 hours that detects unusual network patterns in the top 1000 accounts.

**Success Metrics**:
- ✅ <5 minute full monitoring cycle
- ✅ <100MB RAM usage
- ✅ Detect 5+ interesting patterns per hour
- ✅ Zero false positives on critical alerts
- ✅ Compelling 3-minute demo

## Hour-by-Hour Implementation Schedule

### ⏰ Hour 1-2: Foundation & API Integration
**Goal**: Set up project and connect to Subscan API

```bash
# Initialize project
mkdir polkadot-whale-monitor && cd polkadot-whale-monitor
npm init -y
npm install axios limiter p-retry lru-cache dotenv chalk node-cron
```

**Key Files to Create**:
1. `src/api/SubscanClient.js` - API client with rate limiting
2. `.env` - API configuration
3. `src/config/index.js` - Central configuration

**Implementation**:
```javascript
// SubscanClient.js - Core API client
class SubscanClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.limiter = new Limiter({ tokensPerInterval: 5, interval: 'second' });
    this.cache = new LRU({ max: 500, ttl: 1000 * 60 * 5 }); // 5 min cache
  }

  async getTopAccounts(limit = 1000) {
    await this.limiter.removeTokens(1);
    const cacheKey = `top_accounts_${limit}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const response = await axios.post(
      'https://polkadot.api.subscan.io/api/scan/accounts/top',
      { row: limit, page: 0, order: 'desc', order_field: 'balance' },
      { headers: { 'X-API-Key': this.apiKey } }
    );
    
    this.cache.set(cacheKey, response.data.data.list);
    return response.data.data.list;
  }
}
```

### ⏰ Hour 3-4: Data Storage & Fetching
**Goal**: Implement JSON storage system and data fetching

**Directory Structure**:
```
data/
├── snapshots/
│   ├── current.json
│   ├── previous.json
│   └── archive/
├── alerts/
│   └── 2024-01-16.json
└── config/
    └── thresholds.json
```

**Key Implementation**:
```javascript
// src/storage/FileStorage.js
class FileStorage {
  async saveSnapshot(accounts) {
    const timestamp = new Date().toISOString();
    const snapshot = { timestamp, accounts, count: accounts.length };
    
    // Rotate snapshots
    if (fs.existsSync('data/snapshots/current.json')) {
      fs.renameSync('data/snapshots/current.json', 'data/snapshots/previous.json');
    }
    
    // Save with atomic write
    const tempFile = `data/snapshots/current.json.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(snapshot, null, 2));
    fs.renameSync(tempFile, 'data/snapshots/current.json');
    
    // Archive with compression
    const archivePath = `data/snapshots/archive/${timestamp.split('T')[0]}.json.gz`;
    const compressed = zlib.gzipSync(JSON.stringify(snapshot));
    fs.writeFileSync(archivePath, compressed);
  }
}
```

### ⏰ Hour 5-6: Pattern Detection
**Goal**: Implement all 6 core pattern detection algorithms

**Patterns to Implement**:
1. **Dormant Awakening** (>30 days, >180 days)
2. **Large Movements** (>10k DOT, >100k DOT)
3. **Unbonding Detection** (28-day tracking)
4. **New Whale Formation** (entering top 1000)
5. **Coordination Detection** (3+ whales in 1 hour)
6. **Flow Patterns** (consolidation, splitting)

```javascript
// src/patterns/PatternDetector.js
class PatternDetector {
  detectDormantAwakening(current, previous) {
    const alerts = [];
    for (const account of current) {
      const prevAccount = previous.find(p => p.address === account.address);
      if (!prevAccount) continue;
      
      const balanceChanged = Math.abs(account.balance - prevAccount.balance) > 0;
      const daysDormant = this.calculateDormantDays(prevAccount.lastActive);
      
      if (balanceChanged && daysDormant > 30) {
        alerts.push({
          type: 'DORMANT_AWAKENING',
          severity: daysDormant > 180 ? 'CRITICAL' : 'IMPORTANT',
          address: account.address,
          daysDormant,
          amount: Math.abs(account.balance - prevAccount.balance) / 1e10,
          message: `Whale dormant for ${daysDormant} days just moved ${amount} DOT`
        });
      }
    }
    return alerts;
  }
}
```

### ⏰ Hour 7: Alert System & Reporting
**Goal**: Beautiful console alerts and reporting

```javascript
// src/alerts/AlertManager.js
class AlertManager {
  displayAlert(alert) {
    const colors = {
      CRITICAL: chalk.red,
      IMPORTANT: chalk.yellow,
      NOTABLE: chalk.green
    };
    
    const icon = {
      CRITICAL: '🔴',
      IMPORTANT: '🟡',
      NOTABLE: '🟢'
    }[alert.severity];
    
    console.log(chalk.gray('─'.repeat(80)));
    console.log(`${icon} ${colors[alert.severity](alert.severity)} | ${alert.type} | ${alert.timestamp}`);
    console.log(chalk.white.bold(alert.message));
    console.log(chalk.gray(`Address: ${this.truncateAddress(alert.address)}`));
    console.log(chalk.gray('─'.repeat(80)));
  }
  
  async saveAlert(alert) {
    const date = new Date().toISOString().split('T')[0];
    const file = `data/alerts/${date}.json`;
    const alerts = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
    alerts.push(alert);
    fs.writeFileSync(file, JSON.stringify(alerts, null, 2));
  }
}
```

### ⏰ Hour 8: Integration & Testing
**Goal**: Wire everything together and test

```javascript
// src/monitor.js - Main monitoring loop
class WhaleMonitor {
  async runCycle() {
    console.log(chalk.blue('🐋 Starting monitoring cycle...'));
    const startTime = Date.now();
    
    try {
      // 1. Fetch current data
      const accounts = await this.client.getTopAccounts(1000);
      
      // 2. Load previous snapshot
      const previous = await this.storage.loadPreviousSnapshot();
      
      // 3. Detect patterns
      const alerts = [];
      alerts.push(...this.patterns.detectDormantAwakening(accounts, previous));
      alerts.push(...this.patterns.detectLargeMovements(accounts, previous));
      alerts.push(...this.patterns.detectCoordination(accounts, previous));
      
      // 4. Display and save alerts
      for (const alert of alerts) {
        this.alertManager.displayAlert(alert);
        await this.alertManager.saveAlert(alert);
      }
      
      // 5. Save snapshot
      await this.storage.saveSnapshot(accounts);
      
      const duration = (Date.now() - startTime) / 1000;
      console.log(chalk.green(`✅ Cycle complete in ${duration.toFixed(2)}s`));
      console.log(chalk.cyan(`📊 Found ${alerts.length} alerts`));
      
    } catch (error) {
      console.error(chalk.red('❌ Error in monitoring cycle:'), error);
    }
  }
}
```

### ⏰ Hour 9-10: Demo Preparation
**Goal**: Create compelling demo with fallback scenarios

**Demo Scenarios**:
1. **Live Detection**: Real whale movement (if lucky)
2. **Historical Replay**: Replay March 15 whale awakening
3. **Synthetic Drama**: Pre-scripted dormant whale scenario

```javascript
// src/demo/DemoMode.js
class DemoMode {
  async runDramaticDemo() {
    console.log(chalk.magenta('🎭 DEMO MODE - Dramatic Replay'));
    
    // Speed control
    const speed = process.argv.includes('--fast') ? 100 : 1;
    
    // Replay dormant whale awakening
    await this.sleep(2000 / speed);
    this.alertManager.displayAlert({
      severity: 'CRITICAL',
      type: 'DORMANT_AWAKENING',
      address: '1FRMM8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
      daysDormant: 423,
      amount: 1500000,
      message: 'ALERT: Dormant whale awakens after 423 days! Moving 1.5M DOT'
    });
    
    // Show coordination
    await this.sleep(3000 / speed);
    this.alertManager.displayAlert({
      severity: 'IMPORTANT',
      type: 'COORDINATION',
      message: '3 whales moving in sync within 15 minutes - possible coordination'
    });
  }
}
```

## Critical Files to Create

### 1. Main Entry Point
```javascript
// index.js
require('dotenv').config();
const WhaleMonitor = require('./src/monitor');
const cron = require('node-cron');

const monitor = new WhaleMonitor();

// Run immediately
monitor.runCycle();

// Schedule hourly
cron.schedule('0 * * * *', () => {
  monitor.runCycle();
});

console.log('🐋 Polkadot Whale Monitor started - monitoring every hour');
```

### 2. Configuration
```javascript
// config/thresholds.json
{
  "dormantDays": {
    "notable": 30,
    "critical": 180
  },
  "largeMovement": {
    "notable": 10000,
    "important": 100000,
    "critical": 1000000
  },
  "coordinationWindow": 3600,
  "minimumCoordinatedWhales": 3
}
```

### 3. Demo Commands
```bash
# Normal monitoring
node index.js

# Demo mode - normal speed
node index.js --demo

# Demo mode - fast (for presentation)
node index.js --demo --fast

# Benchmark mode
node index.js --benchmark
```

## Performance Optimizations
- **Parallel Processing**: Use worker threads for pattern detection
- **Caching**: LRU cache for API responses (5-minute TTL)
- **Incremental Updates**: Only process accounts with balance changes
- **Memory Management**: Stream processing for large datasets

## Troubleshooting Guide

### Common Issues:
1. **API Rate Limit**: Increase cache TTL, reduce request frequency
2. **Memory Issues**: Enable streaming mode, reduce history retention
3. **No Alerts**: Use demo mode, reduce thresholds temporarily
4. **Slow Performance**: Enable parallel processing, check network

### Emergency Commands:
```bash
# Clear all caches
rm -rf data/snapshots/*.json

# Reset to demo data
npm run reset:demo

# Run offline mode
node index.js --offline
```

## Presentation Script (3 minutes)

**0:00-0:30 - Hook**
"Everyone talks about whale movements after they happen. We show you as they happen."

**0:30-1:30 - Live Demo**
Show dashboard, trigger alert, explain pattern detection

**1:30-2:30 - Technical Deep Dive**
Show code, explain algorithms, demonstrate performance

**2:30-3:00 - Vision**
"This is just Stage 1. Imagine real-time monitoring, AI predictions, governance protection..."

## Success Checklist

Before demo:
- [ ] API key configured
- [ ] Test data generated
- [ ] Demo scenarios ready
- [ ] Offline mode tested
- [ ] Performance benchmarked (<5 min cycle)
- [ ] Alert sounds working
- [ ] Fallback video ready

Remember: **Ship first, perfect later!** Focus on core functionality that works reliably.