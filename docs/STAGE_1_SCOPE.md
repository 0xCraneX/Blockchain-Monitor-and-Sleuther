# Stage 1: MVP Scope Definition

## Timeline: 1 Day (8-10 hours)

## Core Features

### 1. Data Collection (2 hours)
- Fetch top 1000 accounts from Subscan API
- Store in JSON files:
  - `data/accounts/current.json` - Latest snapshot
  - `data/accounts/previous.json` - Previous hour snapshot
  - `data/accounts/history/YYYY-MM-DD-HH.json` - Hourly archives

### 2. Change Detection (2 hours)
- Compare current vs previous snapshots
- Detect:
  - **Balance changes** (any delta)
  - **New accounts** entering top 1000
  - **Dropped accounts** leaving top 1000
- Calculate change percentages and absolute values

### 3. Activity Tracking (3 hours)
Track these specific patterns:

#### Unbonding Activity
- Detect when account balance decreases by >1000 DOT
- Flag as potential unbonding start
- Track 28-day window for completion
- Alert when unbonding period ends

#### Large Movements
- Transfers >10,000 DOT (0.0006% of supply)
- Transfers >100,000 DOT (0.006% of supply) - CRITICAL
- Multiple transfers within 1 hour from same account

#### Dormant Awakening
- Track last activity timestamp
- Flag accounts inactive >30 days
- High priority alert when dormant account moves

#### Exchange Activity
- Pre-identify exchange addresses:
  - Binance: Known addresses
  - Kraken: Known addresses
  - Gate.io: Known addresses
- Track large deposits/withdrawals

### 4. Simple Alerting (1 hour)
- Console output with color coding:
  - 🔴 RED: Critical (>100k DOT movement, dormant >100 days)
  - 🟡 YELLOW: Important (>10k DOT, dormant >30 days)
  - 🟢 GREEN: Notable (>1k DOT, new patterns)
- Write to `data/alerts/YYYY-MM-DD.json`

### 5. Basic Reporting (2 hours)
- Generate hourly summary:
  - Total balance changes
  - Number of active accounts
  - Top 10 movers
  - New whales detected
  - Dormant activations
- Output as markdown file

## What We're NOT Doing in Stage 1
- ❌ Web interface
- ❌ Real-time monitoring
- ❌ Database
- ❌ Visualizations
- ❌ Transaction details
- ❌ Multi-chain tracking
- ❌ Governance monitoring
- ❌ Price correlation

## Success Metrics for Stage 1
1. Successfully fetch and store top 1000 accounts
2. Detect at least 5 balance changes per hour
3. Identify at least 1 interesting pattern per day
4. Zero false positives in critical alerts
5. Complete hourly cycle in <5 minutes

## Data Structure

```javascript
// Account snapshot
{
  "timestamp": "2024-01-15T10:00:00Z",
  "accounts": [
    {
      "address": "1ABC...",
      "balance": "1234567890000000000", // in planck
      "balance_dot": 123456.789, // human readable
      "rank": 1,
      "category": "exchange|whale|validator|unknown",
      "last_active": "2024-01-15T09:45:00Z",
      "is_validator": false,
      "is_nominator": true
    }
  ]
}

// Alert structure
{
  "timestamp": "2024-01-15T10:00:00Z",
  "level": "critical|important|notable",
  "type": "large_movement|dormant_awakening|unbonding|exchange",
  "details": {
    "address": "1ABC...",
    "amount": 150000,
    "percentage_change": 45.2,
    "dormant_days": 156,
    "description": "Dormant whale moved 150,000 DOT after 156 days"
  }
}
```

## Implementation Order
1. Set up Subscan API client with rate limiting
2. Implement account fetching and storage
3. Build delta detection logic
4. Add pattern detection for each type
5. Create alert system
6. Generate reports
7. Set up cron job
8. Test with historical data

## Demo Scenarios for Hackathon
Even in Stage 1, we need compelling demos:
1. **Live Detection**: Show real balance change during demo
2. **Historical Replay**: Pre-recorded interesting events
3. **Synthetic Alert**: Trigger fake whale movement if needed