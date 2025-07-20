# Implementation Notes

## Pattern Detection Priority for Stage 1

Focus on the highest signal patterns that are:
1. Easy to detect programmatically
2. Likely to occur during demo
3. Visually compelling
4. Genuinely useful

## Key Insight: It's Not Just Size, It's Pattern
A single 100k DOT transaction might be less interesting than:
- Ten 10k DOT transactions in an hour
- Fifty 2k DOT transactions over 24 hours  
- A complex multi-hop journey through 5 addresses

## Technical Considerations

### Data Structures Needed
```javascript
// Enhanced account tracking
{
  address: "...",
  balance: 12345678,
  lastActive: "2024-01-15T10:00:00Z",
  dormantDays: 0,
  
  // New tracking fields
  recentTransactionCount: 5,      // Last 24h
  avgDailyTransactions: 0.5,      // 30-day average
  interactionAddresses: Set(),    // Who they transact with
  behaviorProfile: "holder",      // trader|holder|validator|mixed
  
  // Pattern flags
  patterns: {
    isDormantAwakening: false,
    isCoordinatedMover: false,
    isSplitting: false,
    isConsolidating: false,
    isExchangeHopping: false
  }
}
```

### Pattern Detection Algorithms

1. **Coordination Detection**
   - Time window: 1 hour
   - Threshold: 3+ whales
   - Must move >10k DOT each
   - Bonus: Similar amounts or destinations

2. **Flow Pattern Detection**
   - Track transaction sequences
   - Build directed graph of movements
   - Detect cycles (A→B→C→A)
   - Flag rapid multi-hop transfers

3. **Behavioral Change Detection**
   - Compare 7-day average to current
   - Flag >5x activity increase
   - Flag complete stops after regular activity
   - Track interaction diversity changes

## Questions to Revisit

1. Should we track failed transactions? They reveal intent.
2. How do we handle privacy while maintaining transparency?
3. What's the optimal time window for pattern detection?
4. How do we distinguish legitimate from suspicious patterns?

## Stage 2 Enhancements
- Machine learning for pattern recognition
- Historical pattern database
- Community-sourced pattern definitions
- Real-time pattern matching with alerts