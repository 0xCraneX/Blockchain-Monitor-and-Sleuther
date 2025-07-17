# 36-Hour Hackathon MVP: Polkadot Anomaly Detection System

## The Core Concept in One Sentence
"A system that learns what's 'normal' on Polkadot and alerts only when something unusual happens."

## MVP Scope (What We're Actually Building)

### Three Anomaly Types Only
1. **Dormant Account Awakening** - Account inactive >180 days suddenly moves funds
2. **Size Anomaly** - Account that normally sends 10 DOT suddenly sends 10,000
3. **XCM Volume Spike** - Cross-chain route with 10x normal volume

### What We're NOT Building
- Complex ML algorithms
- Real-time baseline learning (we'll pre-compute)
- Multiple chain support (Polkadot only)
- User accounts/authentication
- Historical analysis UI

## Time Breakdown (36 Hours)

### Hours 0-4: Setup & Data Collection
**Goal**: Get blockchain data flowing and understand the baseline

**Tasks**:
1. Set up basic project structure
2. Connect to Polkadot RPC
3. Write script to collect 7 days of historical data
4. Store in simple JSON files (no complex DB needed)

```javascript
// data-collector.js - Run this immediately
const WEEK_OF_BLOCKS = 7 * 24 * 60 * 10; // ~10 blocks/minute
const startBlock = currentBlock - WEEK_OF_BLOCKS;

// Collect in parallel for speed
const collectors = [];
for (let i = 0; i < 10; i++) {
  collectors.push(collectChunk(startBlock + i * chunkSize, chunkSize));
}
```

### Hours 4-12: Baseline Analysis (Can Run While Sleeping)
**Goal**: Build "normal" profiles from historical data

**Key Insight**: Run analysis scripts while you sleep!

```javascript
// baseline-builder.js - Start before sleep
const profiles = {
  addresses: {}, // address -> {avgSize, avgFreq, lastSeen}
  xcmRoutes: {}, // "chain1->chain2" -> {avgVolume, avgCount}
  globalMetrics: {} // hourlyTxCount, etc
};

// Process all historical data
historicalBlocks.forEach(block => {
  processBlockForBaseline(block, profiles);
});

fs.writeFileSync('baseline.json', JSON.stringify(profiles));
```

### Hours 12-20: Core Detection Engine
**Goal**: Build the actual anomaly detection

```javascript
// anomaly-detector.js
class AnomalyDetector {
  constructor(baseline) {
    this.baseline = baseline;
    this.anomalies = [];
  }

  checkTransaction(tx) {
    const anomalies = [];
    
    // 1. Dormant Account Check
    const profile = this.baseline.addresses[tx.from];
    if (profile) {
      const daysSinceActive = (Date.now() - profile.lastSeen) / (1000*60*60*24);
      if (daysSinceActive > 180) {
        anomalies.push({
          type: 'DORMANT_AWAKENING',
          severity: this.calculateSeverity(daysSinceActive, tx.value),
          details: {
            address: tx.from,
            dormantDays: Math.floor(daysSinceActive),
            amount: tx.value / 10**10 + ' DOT',
            lastSeenContext: profile.lastContext // e.g., "crowdloan period"
          }
        });
      }
    }
    
    // 2. Size Anomaly Check
    if (profile && tx.value > profile.avgSize * 10) {
      anomalies.push({
        type: 'SIZE_ANOMALY',
        severity: Math.log10(tx.value / profile.avgSize),
        details: {
          address: tx.from,
          normalSize: profile.avgSize / 10**10 + ' DOT',
          anomalousSize: tx.value / 10**10 + ' DOT',
          multiplier: (tx.value / profile.avgSize).toFixed(1) + 'x'
        }
      });
    }
    
    return anomalies;
  }
  
  calculateSeverity(days, value) {
    // Simple severity: longer dormancy + higher value = higher severity
    const timeFactor = Math.min(days / 365, 2); // Cap at 2 years
    const valueFactor = Math.min(value / (10000 * 10**10), 2); // Cap at 10k DOT
    return (timeFactor + valueFactor) / 2;
  }
}
```

### Hours 20-28: Dashboard & Visualization
**Goal**: Make it look impressive

**Tech Choice**: Simple but effective
- Express.js server
- Single HTML page with WebSocket
- Chart.js for quick graphs
- No React/complex framework

```html
<!-- dashboard.html -->
<div id="anomaly-feed">
  <!-- Real-time alerts appear here -->
</div>

<div id="metrics">
  <div class="metric">
    <h3>Anomalies Detected</h3>
    <div class="number" id="anomaly-count">0</div>
  </div>
  <div class="metric">
    <h3>Dormant Accounts Activated</h3>
    <div class="number" id="dormant-count">0</div>
  </div>
</div>

<script>
  const ws = new WebSocket('ws://localhost:3001');
  ws.onmessage = (event) => {
    const anomaly = JSON.parse(event.data);
    displayAnomaly(anomaly);
  };
</script>
```

### Hours 28-32: Demo Preparation
**Goal**: Ensure smooth presentation

1. **Create Demo Scenarios**
   ```javascript
   // demo-scenarios.js
   const scenarios = [
     {
       name: "Dormant Whale Awakens",
       block: 18234567,
       highlight: "Address dormant since ICO just moved 100k DOT"
     },
     {
       name: "XCM Bridge Spike",
       block: 18234890,
       highlight: "AssetHub->Moonbeam volume 50x normal"
     }
   ];
   ```

2. **Record Backup Demo Video**
   - Screen record each scenario
   - Edit into 3-minute highlight reel

3. **Prepare Narrative**
   - Problem statement (30 sec)
   - Solution overview (30 sec)
   - Live demo (2 min)
   - Impact/future (30 sec)

### Hours 32-36: Polish & Practice
**Goal**: Make it bulletproof

- Test all demo scenarios
- Optimize dashboard performance
- Practice presentation 3x
- Add error handling for live demo
- Prepare answers to likely questions

## Critical Path (Must-Haves)

1. **Dormant account detection working** ✓
2. **Live dashboard showing alerts** ✓
3. **At least 3 real anomalies to show** ✓
4. **Clear explanation of value prop** ✓

## Smart Shortcuts

### 1. Pre-compute Everything Possible
```javascript
// Instead of real-time baseline learning:
const baseline = require('./precomputed-baseline.json');
// Generated from historical analysis
```

### 2. Fake Real-Time for Demo
```javascript
// replay-blocks.js
async function replayForDemo() {
  const interestingBlocks = require('./demo-blocks.json');
  for (const block of interestingBlocks) {
    await processBlock(block);
    await sleep(2000); // Dramatic pause
  }
}
```

### 3. Focus on Specific Addresses
```javascript
// For demo, monitor known interesting addresses
const DEMO_ADDRESSES = [
  '5GrwvaEF...', // Known dormant whale
  '5FHneW46...', // Address with varied behavior
];
```

## Demo Script (3 Minutes)

### 0:00-0:30 - The Problem
"Polkadot processes thousands of transactions per hour. 99% are normal - people staking, voting, transferring. But hidden in that noise are critical signals: dormant whales awakening, unusual cross-chain flows, potential attacks brewing. How do you find them?"

### 0:30-1:00 - The Solution  
"We built an anomaly detection system that learns what's 'normal' and alerts only on the unusual. Let me show you."

### 1:00-2:30 - Live Demo
*Dashboard showing calm state*

"This is Polkadot right now. Everything normal. But watch this..."

*Dormant account alert appears*

"An account dormant for 423 days just moved 50,000 DOT. Our system caught it instantly. This address last moved during the crowdloan period. Could be an early investor exiting."

*XCM spike alert*

"And here - XCM volume from AssetHub to Moonbeam just spiked 50x. This often precedes major arbitrage or bridge activities."

### 2:30-3:00 - The Impact
"Imagine having this running 24/7. Exchanges could detect suspicious deposits. Researchers could spot emerging patterns. Investors could see whale movements before price impacts. The blockchain talks - we just learned to listen for whispers of unusual activity."

## Backup Plans

1. **If RPC connection fails**: Use cached historical data
2. **If live detection breaks**: Show pre-recorded anomalies
3. **If dashboard crashes**: Have static screenshots ready
4. **If no interesting anomalies**: Create synthetic examples

## Judge-Winning Elements

1. **Clear Problem**: Information overload in blockchain
2. **Elegant Solution**: Statistical anomaly detection
3. **Working Demo**: Live alerts are exciting
4. **Real Impact**: Actual users would pay for this
5. **Technical Depth**: Show you understand the domain

## Post-Hackathon Potential

Mention briefly:
- "Could expand to all parachains"
- "ML models for pattern learning"
- "Integration with trading systems"
- "W3F grant for security monitoring"

## Final Advice

1. **Start data collection IMMEDIATELY** - It needs hours to run
2. **Sleep strategically** - Run baseline analysis overnight
3. **Demo first, code second** - Judges see the demo, not the code
4. **Have a story** - Make them feel the problem
5. **Keep it simple** - 3 anomaly types done well beats 10 done poorly

---

Remember: You're not building production software. You're demonstrating an idea. Make it compelling, make it work for the demo, worry about scaling later.