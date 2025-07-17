# Unusual Network Patterns to Monitor

## Core Monitoring Scope
- **Top 1000 wallets** (holding ~80% of total supply)
- **Hourly snapshots** with change detection
- **Pattern recognition** across multiple dimensions

## 1. Dormancy Patterns 😴→😳
- **Dormant Awakening**: No activity >30 days → sudden movement
- **Zombie Accounts**: >180 days dormant (these are the real alerts)
- **Partial Awakening**: Moving just 10% after long sleep (testing waters?)
- **Sequential Awakening**: Multiple related dormant accounts wake in sequence

## 2. Activity Velocity Changes 📈📉
- **Hyperactivity**: 10x normal transaction count in 24h
- **Sudden Silence**: Active account (daily txs) → complete stop
- **Burst Patterns**: Quiet → 50 txs → quiet (automated behavior?)
- **Time-based Activity**: Only active at specific hours (bot patterns)

## 3. Unbonding & Staking Flows 🔓
- **Mass Unbonding**: >100k DOT entering 28-day unlock
- **Validator Rotation**: Large stakes switching validators
- **Commission Gaming**: Moving stakes when validators change rates
- **Cascading Unbonds**: One whale triggers others to unbond

## 4. New Whale Formation 🐋
- **Rapid Accumulation**: Unknown address receiving from multiple top 1000
- **Graduation Day**: Address crosses into top 1000 threshold
- **Feeder Patterns**: Small accounts consistently feeding one address
- **Exchange Withdrawal Accumulation**: Multiple withdrawals to fresh address

## 5. Flow Patterns (Not Just Size) 🌊
- **Death by 1000 Cuts**: 50+ small transactions draining account
- **Accumulation Drip**: Many small inflows over time
- **Dispersion Pattern**: One whale → 20+ addresses (distribution/sale?)
- **Consolidation Pattern**: 20+ addresses → one whale (accumulation)

## 6. Coordination Signals 🤝
- **Synchronized Movement**: 3+ whales moving within same hour
- **Follow-the-Leader**: One whale moves, others follow within 24h
- **Mirror Patterns**: Accounts moving exact same amounts
- **Network Effects**: Movement clusters in the connection graph

## 7. Splitting & Mixing Behaviors 🔀
- **Privacy Splits**: 1 account → 10 equal parts
- **Onion Routing**: A→B→C→D in quick succession
- **Circular Flows**: A→B→C→A (wash trading or obfuscation)
- **Hot Potato**: Funds bouncing between addresses rapidly

## 8. Pre-Event Behaviors 📊
- **Pre-Governance Positioning**: Stake movements 48h before proposals
- **Pre-Parachain Auction**: Consolidation before crowdloan
- **Pre-Unlock Preparation**: Activity before major unlock events
- **Weekend Warriors**: Friday accumulation, Monday distribution

## 9. Exchange Interaction Patterns 🏦
- **Exchange Hopping**: Binance→Private→Kraken in <24h
- **Arbitrage Patterns**: Quick exchange movements during volatility
- **OTC Indicators**: Large round numbers to unknown addresses
- **Exchange Run**: Multiple whales withdrawing from same exchange

## 10. Anomalous Transaction Patterns 🚨
- **Fee Overpayment**: Paying 10x normal fees (urgency/mistake?)
- **Failed Transaction Spam**: Multiple failed attempts (what's the goal?)
- **Dust Attacks**: Receiving many tiny amounts (tracking attempt?)
- **Test Transactions**: Small amount → wait → large amount

## 11. Behavioral Changes 🔄
- **Validator to Trader**: Staking whale becomes active trader
- **Trader to Holder**: Active account becomes dormant
- **Solo to Social**: Isolated account starts interacting with many
- **Social to Solo**: Connected account isolates itself

## 12. Risk Indicators ⚠️
- **Liquidation Patterns**: Rapid selling across multiple venues
- **Panic Movements**: All funds moved in single transaction
- **Bridge Runs**: Mass movements to Ethereum/Bitcoin bridges
- **Blacklist Bouncing**: Funds from flagged addresses

## Implementation Priority

### Phase 1 (Must Have)
1. Dormant awakening
2. Large movements (>10k DOT)
3. Unbonding tracking
4. Basic flow detection

### Phase 2 (Should Have)
5. New whale formation
6. Coordination detection
7. Exchange patterns
8. Splitting behaviors

### Phase 3 (Nice to Have)
9. Pre-event detection
10. Behavioral analysis
11. Anomaly patterns
12. Risk indicators

## Detection Thresholds

### Critical Alerts 🔴
- Dormant >180 days moving >100k DOT
- 5+ whales moving in coordination
- Exchange run (10+ withdrawals in 1h)
- Circular flow >1M DOT

### Important Alerts 🟡
- Dormant >30 days moving >10k DOT
- Unbonding >100k DOT
- New whale formed (>50k DOT)
- Unusual splitting patterns

### Notable Alerts 🟢
- Activity velocity changes
- Small coordination (2-3 whales)
- Test transaction patterns
- Fee anomalies

## Why These Matter

1. **Market Impact**: These patterns often precede price movements
2. **Security**: Detect potential attacks or exploits early
3. **Governance**: Prevent manipulation of voting power
4. **Transparency**: Make whale games visible to everyone
5. **Education**: Help users understand network dynamics

## Future Considerations

### Failed Pattern Detection
Track what whales attempt but fail to do:
- Multiple failed transactions (revealing intentions)
- Rejected governance proposals after positioning
- Failed bridge attempts during high congestion
- Reverted smart contract interactions

### Advanced Pattern Recognition
- Machine learning for pattern clustering
- Anomaly scoring based on historical behavior
- Network graph analysis for hidden relationships
- Cross-chain correlation (DOT movements vs ETH/BTC)

### Behavioral Profiling
- Classify whale personalities (trader, holder, validator, governer)
- Predict likely next actions based on history
- Identify style changes that might indicate account compromise

## Notes
This document will be revisited after Stage 1 implementation to prioritize Stage 2 features based on what patterns we actually observe in the wild.