# Quick Start: First 4 Hours Implementation

## Hour 0: Project Setup (30 minutes)

```bash
# Create project structure
mkdir polkadot-anomaly-detector
cd polkadot-anomaly-detector

# Initialize
npm init -y
npm install @polkadot/api dotenv express ws chart.js

# Create structure
mkdir -p src/{collectors,analyzers,detectors,api}
mkdir -p data/{historical,baselines,anomalies}
mkdir -p public/{css,js}

# Environment setup
echo "WS_ENDPOINT=wss://rpc.polkadot.io" > .env
```

## Hour 1-2: Data Collector (Start THIS Immediately!)

```javascript
// src/collectors/historical-collector.js
const { ApiPromise, WsProvider } = require('@polkadot/api');
const fs = require('fs').promises;

class HistoricalCollector {
  constructor() {
    this.BATCH_SIZE = 100;
    this.OUTPUT_DIR = './data/historical';
  }

  async collect() {
    const provider = new WsProvider(process.env.WS_ENDPOINT);
    const api = await ApiPromise.create({ provider });
    
    const currentBlock = await api.rpc.chain.getBlock();
    const currentHeight = currentBlock.block.header.number.toNumber();
    
    // Collect last 7 days (approximately)
    const BLOCKS_PER_DAY = 14400; // ~6 second blocks
    const startHeight = currentHeight - (7 * BLOCKS_PER_DAY);
    
    console.log(`Collecting blocks ${startHeight} to ${currentHeight}`);
    
    // Parallel collection for speed
    const chunks = [];
    for (let i = startHeight; i < currentHeight; i += this.BATCH_SIZE) {
      chunks.push(this.collectChunk(api, i, Math.min(i + this.BATCH_SIZE, currentHeight)));
    }
    
    // Process in batches to avoid overwhelming the node
    const PARALLEL_CHUNKS = 5;
    for (let i = 0; i < chunks.length; i += PARALLEL_CHUNKS) {
      const batch = chunks.slice(i, i + PARALLEL_CHUNKS);
      await Promise.all(batch);
      console.log(`Progress: ${i}/${chunks.length} chunks`);
    }
    
    await api.disconnect();
  }

  async collectChunk(api, start, end) {
    const blocks = [];
    
    for (let height = start; height < end; height++) {
      const hash = await api.rpc.chain.getBlockHash(height);
      const block = await api.rpc.chain.getBlock(hash);
      
      // Extract only what we need
      const simplified = {
        height,
        timestamp: Date.now(), // We'll get real timestamp from extrinsics
        transactions: []
      };
      
      // Parse extrinsics
      block.block.extrinsics.forEach((ex) => {
        if (ex.method.section === 'balances' && ex.method.method === 'transfer') {
          const [dest, amount] = ex.method.args;
          simplified.transactions.push({
            from: ex.signer.toString(),
            to: dest.toString(),
            value: amount.toString(),
            type: 'transfer'
          });
        }
        // Add XCM detection here
      });
      
      blocks.push(simplified);
    }
    
    // Save chunk
    await fs.writeFile(
      `${this.OUTPUT_DIR}/blocks_${start}_${end}.json`,
      JSON.stringify(blocks)
    );
  }
}

// RUN THIS IMMEDIATELY
const collector = new HistoricalCollector();
collector.collect().catch(console.error);
```

## Hour 2-3: Baseline Analyzer (Run While Collecting)

```javascript
// src/analyzers/baseline-builder.js
const fs = require('fs').promises;
const path = require('path');

class BaselineBuilder {
  constructor() {
    this.profiles = {
      addresses: new Map(),
      xcmRoutes: new Map(),
      global: {
        avgBlockSize: 0,
        avgTxValue: 0,
        hourlyPatterns: new Array(24).fill(0)
      }
    };
  }

  async analyze() {
    const files = await fs.readdir('./data/historical');
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const blocks = JSON.parse(
          await fs.readFile(path.join('./data/historical', file), 'utf8')
        );
        
        for (const block of blocks) {
          this.processBlock(block);
        }
      }
    }
    
    // Convert to serializable format
    const baseline = {
      addresses: Object.fromEntries(this.profiles.addresses),
      xcmRoutes: Object.fromEntries(this.profiles.xcmRoutes),
      global: this.profiles.global
    };
    
    await fs.writeFile(
      './data/baselines/baseline.json',
      JSON.stringify(baseline, null, 2)
    );
    
    console.log(`Baseline built: ${this.profiles.addresses.size} addresses profiled`);
  }

  processBlock(block) {
    // Update global metrics
    this.profiles.global.avgBlockSize = 
      (this.profiles.global.avgBlockSize * 0.99) + (block.transactions.length * 0.01);
    
    // Process each transaction
    for (const tx of block.transactions) {
      this.updateAddressProfile(tx.from, tx);
      this.updateAddressProfile(tx.to, { ...tx, value: 0 }); // Receiver profile
    }
  }

  updateAddressProfile(address, tx) {
    let profile = this.profiles.addresses.get(address);
    
    if (!profile) {
      profile = {
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        txCount: 0,
        totalValue: 0,
        avgValue: 0,
        maxValue: 0,
        avgTimeBetweenTx: 0,
        lastTxTime: Date.now()
      };
      this.profiles.addresses.set(address, profile);
    }
    
    // Update profile
    profile.lastSeen = Date.now();
    profile.txCount++;
    profile.totalValue += BigInt(tx.value);
    profile.avgValue = Number(profile.totalValue / BigInt(profile.txCount));
    profile.maxValue = Math.max(profile.maxValue, Number(tx.value));
    
    // Update time between transactions
    const timeSinceLastTx = Date.now() - profile.lastTxTime;
    profile.avgTimeBetweenTx = 
      (profile.avgTimeBetweenTx * (profile.txCount - 1) + timeSinceLastTx) / profile.txCount;
    profile.lastTxTime = Date.now();
  }
}

// Run this after collector has some data
setTimeout(() => {
  const analyzer = new BaselineBuilder();
  analyzer.analyze().catch(console.error);
}, 1000 * 60 * 30); // Run after 30 minutes
```

## Hour 3-4: Basic Anomaly Detector

```javascript
// src/detectors/anomaly-detector.js
class AnomalyDetector {
  constructor(baseline) {
    this.baseline = baseline;
    this.anomalies = [];
  }

  detectAnomalies(transaction) {
    const anomalies = [];
    const profile = this.baseline.addresses[transaction.from];
    
    if (!profile) {
      // New address, not anomalous
      return anomalies;
    }
    
    // 1. Dormant Account Detection
    const hoursSinceLastSeen = (Date.now() - profile.lastSeen) / (1000 * 60 * 60);
    if (hoursSinceLastSeen > 24 * 180) { // 180 days
      anomalies.push({
        type: 'DORMANT_AWAKENING',
        severity: this.calculateDormantSeverity(hoursSinceLastSeen, transaction.value),
        data: {
          address: transaction.from,
          dormantDays: Math.floor(hoursSinceLastSeen / 24),
          value: (BigInt(transaction.value) / BigInt(10**10)).toString() + ' DOT',
          lastSeen: new Date(profile.lastSeen).toISOString()
        }
      });
    }
    
    // 2. Value Anomaly Detection
    const txValue = Number(transaction.value);
    if (txValue > profile.avgValue * 10 && txValue > profile.maxValue * 2) {
      anomalies.push({
        type: 'VALUE_ANOMALY',
        severity: Math.min(txValue / profile.avgValue / 10, 1),
        data: {
          address: transaction.from,
          normalAvg: (profile.avgValue / 10**10).toFixed(2) + ' DOT',
          normalMax: (profile.maxValue / 10**10).toFixed(2) + ' DOT',
          anomalousValue: (txValue / 10**10).toFixed(2) + ' DOT',
          multiplier: (txValue / profile.avgValue).toFixed(1) + 'x average'
        }
      });
    }
    
    // 3. Frequency Anomaly
    const timeSinceLastTx = Date.now() - profile.lastTxTime;
    if (timeSinceLastTx < profile.avgTimeBetweenTx * 0.1) {
      anomalies.push({
        type: 'FREQUENCY_ANOMALY',
        severity: 0.5,
        data: {
          address: transaction.from,
          normalFrequency: this.formatDuration(profile.avgTimeBetweenTx),
          currentGap: this.formatDuration(timeSinceLastTx),
          speedup: (profile.avgTimeBetweenTx / timeSinceLastTx).toFixed(1) + 'x faster'
        }
      });
    }
    
    return anomalies;
  }
  
  calculateDormantSeverity(hours, value) {
    const daysFactor = Math.min(hours / 24 / 365, 1); // Max at 1 year
    const valueFactor = Math.min(Number(value) / (10000 * 10**10), 1); // Max at 10k DOT
    return (daysFactor + valueFactor) / 2;
  }
  
  formatDuration(ms) {
    const hours = ms / (1000 * 60 * 60);
    if (hours > 24) return (hours / 24).toFixed(1) + ' days';
    if (hours > 1) return hours.toFixed(1) + ' hours';
    return (ms / (1000 * 60)).toFixed(1) + ' minutes';
  }
}

module.exports = AnomalyDetector;
```

## Quick Dashboard Setup

```html
<!-- public/index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Polkadot Anomaly Detector</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a1a;
      color: #fff;
      margin: 0;
      padding: 20px;
    }
    
    .anomaly-card {
      background: #2a2a2a;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      border-left: 4px solid #ff0066;
      animation: slideIn 0.3s ease-out;
    }
    
    .anomaly-card.high { border-left-color: #ff0066; }
    .anomaly-card.medium { border-left-color: #ff9900; }
    .anomaly-card.low { border-left-color: #00ff66; }
    
    @keyframes slideIn {
      from { transform: translateX(-100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    
    .anomaly-type {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      opacity: 0.7;
    }
    
    .anomaly-title {
      font-size: 24px;
      margin: 10px 0;
    }
    
    .anomaly-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-top: 15px;
    }
    
    .detail-item {
      background: #1a1a1a;
      padding: 10px;
      border-radius: 4px;
    }
    
    .detail-label {
      font-size: 12px;
      opacity: 0.7;
    }
    
    .detail-value {
      font-size: 18px;
      font-weight: bold;
      color: #ff0066;
    }
  </style>
</head>
<body>
  <h1>🚨 Polkadot Anomaly Detection System</h1>
  <div id="anomaly-feed"></div>
  
  <script>
    const ws = new WebSocket('ws://localhost:3001');
    
    ws.onmessage = (event) => {
      const anomaly = JSON.parse(event.data);
      displayAnomaly(anomaly);
    };
    
    function displayAnomaly(anomaly) {
      const feed = document.getElementById('anomaly-feed');
      const severityClass = anomaly.severity > 0.7 ? 'high' : 
                           anomaly.severity > 0.4 ? 'medium' : 'low';
      
      const card = document.createElement('div');
      card.className = `anomaly-card ${severityClass}`;
      
      card.innerHTML = `
        <div class="anomaly-type">${anomaly.type}</div>
        <div class="anomaly-title">${getAnomalyTitle(anomaly)}</div>
        <div class="anomaly-details">
          ${Object.entries(anomaly.data).map(([key, value]) => `
            <div class="detail-item">
              <div class="detail-label">${formatLabel(key)}</div>
              <div class="detail-value">${value}</div>
            </div>
          `).join('')}
        </div>
      `;
      
      feed.insertBefore(card, feed.firstChild);
      
      // Keep only last 10 anomalies
      while (feed.children.length > 10) {
        feed.removeChild(feed.lastChild);
      }
    }
    
    function getAnomalyTitle(anomaly) {
      switch(anomaly.type) {
        case 'DORMANT_AWAKENING':
          return `Dormant Account Activated After ${anomaly.data.dormantDays} Days`;
        case 'VALUE_ANOMALY':
          return `Unusually Large Transaction: ${anomaly.data.anomalousValue}`;
        case 'FREQUENCY_ANOMALY':
          return `Rapid Transaction Burst Detected`;
        default:
          return 'Anomaly Detected';
      }
    }
    
    function formatLabel(key) {
      return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    }
  </script>
</body>
</html>
```

## Start Script

```javascript
// index.js - Main entry point
require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const { ApiPromise, WsProvider } = require('@polkadot/api');
const AnomalyDetector = require('./src/detectors/anomaly-detector');

const app = express();
app.use(express.static('public'));

const wss = new WebSocket.Server({ port: 3001 });

async function startMonitoring() {
  // Load baseline
  const baseline = require('./data/baselines/baseline.json');
  const detector = new AnomalyDetector(baseline);
  
  // Connect to Polkadot
  const provider = new WsProvider(process.env.WS_ENDPOINT);
  const api = await ApiPromise.create({ provider });
  
  // Monitor new blocks
  api.rpc.chain.subscribeNewHeads(async (header) => {
    const blockHash = await api.rpc.chain.getBlockHash(header.number);
    const block = await api.rpc.chain.getBlock(blockHash);
    
    // Check each transaction
    block.block.extrinsics.forEach((ex) => {
      if (ex.method.section === 'balances' && ex.method.method === 'transfer') {
        const [dest, amount] = ex.method.args;
        const transaction = {
          from: ex.signer.toString(),
          to: dest.toString(),
          value: amount.toString()
        };
        
        const anomalies = detector.detectAnomalies(transaction);
        
        // Broadcast anomalies
        anomalies.forEach(anomaly => {
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(anomaly));
            }
          });
        });
      }
    });
  });
}

app.listen(3000, () => {
  console.log('Dashboard running on http://localhost:3000');
  startMonitoring().catch(console.error);
});
```

---

## CRITICAL: Start THIS Now!

```bash
# Terminal 1: Start data collection immediately
node src/collectors/historical-collector.js

# Terminal 2: Start the dashboard
node index.js

# Terminal 3: After 30 mins, build baseline
node src/analyzers/baseline-builder.js
```

The data collection needs to run for hours. Start it NOW and work on other parts while it runs!