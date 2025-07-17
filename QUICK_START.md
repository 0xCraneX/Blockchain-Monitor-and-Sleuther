# 🚀 QUICK START GUIDE - Polkadot Anomaly Detector

## ⏱️ Total Time: ~45 minutes

### Step 1: Initial Setup (2 minutes)

```bash
# Navigate to the project
cd /workspace/polkadot-analysis-tool/blockchain-monitoring-tool

# Install dependencies (already done if you followed along)
npm install

# Create your environment file
cp .env.example .env
```

### Step 2: Start Data Collection (30-40 minutes) 

**🚨 DO THIS FIRST - IT TAKES TIME!**

```bash
npm run collect
```

This will:
- Connect to Subscan API (rate limited to 5 req/s)
- Collect data for 20 interesting addresses (exchanges, whales, treasury)
- Save transaction history to `data/historical/`
- Show progress with colorful output

**Expected Output:**
```
[2024-01-15T10:30:45.123Z] [INFO] [collector] Starting Subscan historical data collection
[2024-01-15T10:30:45.456Z] [INFO] [collector] Found 20 addresses to analyze
[2024-01-15T10:30:46.789Z] [PROGRESS] [collector] ████████░░ 40% (8/20) Processing Kraken 1
```

### Step 3: Build Behavioral Baselines (2-3 minutes)

**After collection completes:**

```bash
npm run baseline
```

This will:
- Analyze all collected address profiles
- Calculate normal behavior patterns
- Identify dormant whales and unusual patterns
- Save baseline to `data/baselines/`

**Expected Output:**
```
===============================================
Baseline Analysis Complete
===============================================

Addresses analyzed: 20
Total transactions: 15,234
Total volume: 2,345,678 DOT

Activity Distribution:
  Active (< 30 days): 12 (60.0%)
  Semi-active: 3 (15.0%)
  Dormant (> 180 days): 5 (25.0%)
```

### Step 4: Generate Demo Scenarios (1 minute)

```bash
npm run demo
```

This will:
- Find the most interesting anomalies
- Create presentation materials
- Generate demo scripts with talking points

**Check the `demo/` folder for:**
- `scenarios.json` - Raw anomaly data
- `presentation-script.md` - Your demo script
- `quick-reference.md` - Key points cheat sheet

## 🎯 What You'll Find

### Real Anomalies from Polkadot:

1. **Dormant Whales** 🐋
   - Addresses inactive for 180+ days with large balances
   - Perfect for "awakening" demos

2. **Size Anomalies** 📊
   - Addresses that suddenly transact 10x+ their normal amount
   - Great for showing detection capabilities

3. **Activity Patterns** ⚡
   - Burst activity at specific times
   - Exchange-heavy users

## 💡 Demo Tips

### The Narrative
"Polkadot processes thousands of transactions hourly. 99% are normal. We detect the 1% that matter - dormant whales awakening, unusual movements, potential threats."

### Live Demo Flow
1. Show calm dashboard
2. Trigger anomaly detection
3. Highlight specific finding
4. Explain why it matters

### Backup Plan
- Screenshot key findings
- Have example addresses ready
- Use historical data if needed

## 🐛 Troubleshooting

### "No profiles found"
→ Make sure data collection completed successfully
→ Check `data/historical/` folder for JSON files

### "Rate limited by Subscan"
→ The tool handles this automatically
→ Just wait, it will retry

### "Collection taking too long"
→ Reduce `MAX_ADDRESSES` in `.env` to 10
→ Reduce `MAX_PAGES_PER_ADDRESS` to 5

## 📝 Explaining Your Project

**What it does:**
"Monitors Polkadot blockchain for unusual activity patterns using statistical anomaly detection"

**How it works:**
"Builds behavioral baselines from historical data, then detects deviations in real-time"

**Why it matters:**
"Helps exchanges detect suspicious deposits, researchers spot trends, investors see whale movements"

**Technical approach:**
"Subscan API → Historical Analysis → Statistical Baselines → Anomaly Detection → Real-time Alerts"

## 🏁 Final Checklist

- [ ] Data collection complete
- [ ] Baseline analysis done  
- [ ] Demo scenarios generated
- [ ] Reviewed presentation script
- [ ] Tested at least one scenario
- [ ] Have backup plan ready

---

**Good luck! 🚀** Remember: You're showing real anomalies from real Polkadot data. That's powerful.