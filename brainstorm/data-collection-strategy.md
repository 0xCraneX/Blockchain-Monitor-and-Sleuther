# Data Collection Strategy Explained

## The Problem We're Solving

To detect anomalies, we need to know what "normal" looks like. That means:
- What's the average transaction size for each address?
- How often does each address transact?
- What's normal XCM volume between chains?
- When are addresses typically active?

## The Collection Approach

### Why Historical Data?

```
Present ← Can't detect anomalies without baseline
   ↑
Need 7 days of history to build profiles
   ↑
Must collect BEFORE we can detect anything
```

### What We're Collecting

```javascript
// For each block in the last 7 days:
{
  "height": 18234567,
  "timestamp": 1673456789,
  "transactions": [
    {
      "from": "5GrwvaEF...",
      "to": "5FHneW46...",
      "value": "10000000000000", // 1000 DOT
      "type": "transfer"
    },
    {
      "from": "5FHneW46...",
      "to": "14Gn7fy...", // Cross-chain
      "value": "50000000000000",
      "type": "xcm",
      "destination": "moonbeam"
    }
  ]
}
```

### The Collection Process

```javascript
// STEP 1: Calculate block range
Current block: 18,234,567
Blocks per day: ~14,400 (6-second blocks)
7 days back: 18,234,567 - (7 × 14,400) = 18,134,167

// STEP 2: Fetch in chunks (to not overwhelm the node)
Chunk 1: Blocks 18,134,167 - 18,134,267
Chunk 2: Blocks 18,134,267 - 18,134,367
... (1,000 chunks total)

// STEP 3: Parallel processing
Instead of: Block 1 → Block 2 → Block 3 (sequential, slow)
We do: [Block 1-100] + [Block 101-200] + [Block 201-300] (parallel, fast)
```

## Why This Takes Hours

```
100,000 blocks to fetch
× 0.1 seconds per block (RPC latency)
= 10,000 seconds
= 2.7 hours minimum

With parallel fetching (5 concurrent):
= ~30-45 minutes realistically
```

## The Smart Part: What We IGNORE

We're NOT collecting:
- System/utility transactions
- Staking rewards (too common)
- Small transfers (<1 DOT)
- Failed transactions

This reduces data by ~80% while keeping the interesting stuff.

## Storage Strategy

```
data/
  historical/
    blocks_18134167_18134267.json
    blocks_18134267_18134367.json
    ... (1000 files)
```

Why multiple files?
- Can process in parallel
- Won't lose everything if one fails
- Easier to debug

## The Baseline Building Process

Once we have the data:

```javascript
// For each address we saw:
"5GrwvaEF...": {
  avgTransactionSize: 50 DOT,
  avgTimeBetweenTx: 7 days,
  lastSeen: "2024-01-08",
  totalTransactions: 45,
  maxTransaction: 500 DOT,
  activeHours: [9, 10, 11, 14, 15], // UTC
  commonCounterparties: ["5FHneW46...", "5CBqFJ1..."]
}

// For XCM routes:
"polkadot->moonbeam": {
  avgDailyVolume: 50,000 DOT,
  avgTransactionCount: 25,
  peakHours: [14, 15, 16]
}
```

## Why Can't We Do This Real-Time?

**Option 1: Real-time only** ❌
- See address move 10,000 DOT
- Is that normal? 🤷 (No history to compare)

**Option 2: Build history first** ✅
- See address move 10,000 DOT
- Check: Usually moves 10 DOT
- Alert: "1000x normal size!" 🚨

## The Clever Shortcut for Hackathon

Instead of collecting EVERYTHING:

```javascript
// Focus on interesting addresses
const INTERESTING_ADDRESSES = [
  // Known exchange wallets
  "5Gw3s7q...", // Binance
  "5K3qFJ1...", // Kraken
  
  // Known whale addresses
  "5GrwvaEF...", // ICO participant
  
  // Active traders
  // (Find these from Subscan)
];

// Only collect their history = 100x faster
```

## What Happens During Collection

```
Terminal 1:
> node historical-collector.js
Connecting to wss://rpc.polkadot.io...
Current block: 18234567
Starting collection from block 18134167
Progress: 100/1000 chunks [===>      ] 10%
Progress: 200/1000 chunks [====>     ] 20%
...
```

Meanwhile, you can:
- Build the UI
- Write the anomaly detection logic
- Prepare demo scenarios

## The Final Product

After collection completes:
```
✅ 100,000 blocks analyzed
✅ 50,000 unique addresses profiled
✅ 500 XCM routes mapped
✅ Ready to detect anomalies!
```

Now when we see:
- Dormant address from 2021 suddenly active → ALERT!
- Address that sends 10 DOT sending 10,000 → ALERT!
- Quiet XCM route suddenly busy → ALERT!

## Pro Tips

1. **Start collection IMMEDIATELY** - It's your longest task
2. **Use multiple RPC endpoints** - Fallback if one fails
3. **Save progress frequently** - Don't lose 2 hours of work
4. **Focus on transfers only** - Ignore staking/governance for MVP
5. **Pre-identify interesting addresses** - Makes demo more impressive

---

The key insight: We're building a "memory" of normal behavior. Once we have that memory, detecting abnormal behavior becomes trivial - it's just comparing current behavior to historical patterns.