# Relationship Strength Scoring System Documentation

## Overview

The relationship strength scoring system provides a comprehensive evaluation of connections between Polkadot accounts. It combines multiple scoring components to produce an interpretable score on a 0-100 scale that is comparable across different relationships and resistant to manipulation.

## Scoring Components

### 1. Volume-Based Scoring (0-100 points)

The volume score evaluates the financial significance of the relationship.

#### Components:
- **Total Volume (0-40 points)**: Based on percentile ranking of total transfer volume
- **Average Transfer Size (0-30 points)**: Based on percentile ranking of average transfer size
- **Relative Volume (0-30 points)**: Volume relative to sender's balance

#### Mathematical Formula:
```
Volume Score = min(100, 
    Volume_Percentile × 40 + 
    Avg_Size_Percentile × 30 + 
    min(30, (Total_Volume / Sender_Balance) × 100)
)
```

#### Example:
- Account A transfers 1000 DOT to Account B across 10 transfers
- A's balance: 5000 DOT
- Volume percentile: 0.85 (85th percentile)
- Average size percentile: 0.70

```
Volume component = 0.85 × 40 = 34 points
Average size component = 0.70 × 30 = 21 points
Relative volume = min(30, (1000/5000) × 100) = 20 points
Total Volume Score = 34 + 21 + 20 = 75 points
```

### 2. Frequency-Based Scoring (0-100 points)

The frequency score measures the consistency and regularity of interactions.

#### Components:
- **Transfer Count (0-40 points)**: Based on percentile ranking of total transfers
- **Transfer Frequency (0-30 points)**: Transfers per day percentile
- **Consistency (0-30 points)**: Ratio of unique days to total active days

#### Mathematical Formula:
```
Frequency Score = min(100,
    Count_Percentile × 40 +
    Frequency_Percentile × 30 +
    (Unique_Days / Total_Days) × 30
)
```

#### Example:
- 50 transfers over 100 days
- Transfers occurred on 40 unique days
- Count percentile: 0.90
- Frequency percentile: 0.75

```
Count component = 0.90 × 40 = 36 points
Frequency component = 0.75 × 30 = 22.5 points
Consistency = (40/100) × 30 = 12 points
Total Frequency Score = 36 + 22.5 + 12 = 70.5 points
```

### 3. Temporal Scoring (0-100 points)

The temporal score evaluates the recency and longevity of the relationship.

#### Components:
- **Recency (0-40 points)**: Exponential decay based on days since last transfer
  - ≤1 day: 40 points
  - ≤7 days: 35 points
  - ≤30 days: 25 points
  - ≤90 days: 15 points
  - ≤365 days: 5 points
  - >365 days: 0 points
- **Duration (0-30 points)**: Relationship length in years × 30
- **Activity Pattern (0-30 points)**: Recent activity relative to total

#### Mathematical Formula:
```
Temporal Score = 
    Recency_Points +
    min(30, (Relationship_Days / 365) × 30) +
    min(30, (Recent_Week_Ratio × 15) + (Recent_Month_Ratio × 15))
```

#### Example:
- Last transfer: 5 days ago (35 points)
- Relationship duration: 180 days
- 5 transfers in last week out of 100 total
- 20 transfers in last month

```
Recency = 35 points
Duration = (180/365) × 30 = 14.8 points
Activity = (5/100 × 15) + (20/100 × 15) = 0.75 + 3 = 3.75 points
Total Temporal Score = 35 + 14.8 + 3.75 = 53.55 points
```

### 4. Network-Based Scoring (0-100 points)

The network score evaluates the structural importance of the relationship.

#### Components:
- **Common Connections (0-40 points)**: 5 points per mutual connection (max 40)
- **Centrality (0-30 points)**: Average degree centrality of both nodes
- **Importance (0-30 points)**: Average PageRank × 1000

#### Mathematical Formula:
```
Network Score = min(100,
    min(40, Common_Connections × 5) +
    min(30, ((From_Degree + To_Degree) / 2) × 100) +
    min(30, ((From_PageRank + To_PageRank) / 2) × 1000)
)
```

#### Example:
- 6 common connections
- From degree centrality: 0.15
- To degree centrality: 0.20
- Average PageRank: 0.02

```
Common connections = min(40, 6 × 5) = 30 points
Centrality = ((0.15 + 0.20) / 2) × 100 = 17.5 points
Importance = 0.02 × 1000 = 20 points
Total Network Score = 30 + 17.5 + 20 = 67.5 points
```

### 5. Risk Indicators (0-100 points, acts as penalty)

The risk score identifies potentially suspicious patterns.

#### Components:
- **Rapid Transfers (0-30 points)**: Sequential transfers within 5 minutes
- **Round Numbers (0-25 points)**: Transfers divisible by 1, 10, or 100 DOT
- **Time Anomalies (0-25 points)**: Transfers between 2-5 AM UTC
- **New Account (0-20 points)**: Interaction with account < 7 days old

#### Mathematical Formula:
```
Risk Score = min(100,
    min(30, (Rapid_Count / Total_Count) × 100) +
    min(25, (Round_Count / Total_Count) × 50) +
    min(25, (Unusual_Time_Count / Total_Count) × 50) +
    New_Account_Flag × 20
)
```

#### Example:
- 2 rapid transfers out of 50 total
- 10 round number transfers
- 3 unusual time transfers
- Not a new account

```
Rapid risk = (2/50) × 100 = 4 points
Round number risk = (10/50) × 50 = 10 points
Time anomaly risk = (3/50) × 50 = 3 points
New account risk = 0 points
Total Risk Score = 4 + 10 + 3 + 0 = 17 points
```

## Final Score Calculation

The total relationship strength score combines all components with risk acting as a penalty multiplier.

### Weighting Strategy:
- Volume: 25%
- Frequency: 25%
- Temporal: 20%
- Network: 30%
- Risk penalty: Up to 50% reduction

### Mathematical Formula:
```
Total Score = (
    Volume_Score × 0.25 +
    Frequency_Score × 0.25 +
    Temporal_Score × 0.20 +
    Network_Score × 0.30
) × (1 - Risk_Score / 200)
```

### Complete Example:
Using the scores from above examples:
- Volume Score: 75
- Frequency Score: 70.5
- Temporal Score: 53.55
- Network Score: 67.5
- Risk Score: 17

```
Base Score = (75 × 0.25) + (70.5 × 0.25) + (53.55 × 0.20) + (67.5 × 0.30)
           = 18.75 + 17.625 + 10.71 + 20.25
           = 67.335

Risk Multiplier = 1 - (17 / 200) = 0.915

Total Relationship Strength = 67.335 × 0.915 = 61.61
```

## Incremental Updates

The scoring system supports incremental updates through database triggers:

1. When a new transfer is inserted, the trigger automatically:
   - Updates volume and frequency counts
   - Recalculates all score components
   - Updates the total score with timestamp

2. Network metrics are updated separately through batch processes:
   - Calculate centrality metrics using graph algorithms
   - Update clustering coefficients
   - Recompute network scores for affected relationships

## Score Interpretation

- **0-20**: Very weak relationship (minimal interaction)
- **21-40**: Weak relationship (occasional interaction)
- **41-60**: Moderate relationship (regular interaction)
- **61-80**: Strong relationship (frequent, consistent interaction)
- **81-100**: Very strong relationship (high volume, frequent, well-connected)

## Resistance to Gaming

The scoring system includes several features to prevent manipulation:

1. **Percentile-based normalization**: Prevents inflation through volume manipulation
2. **Risk penalties**: Detects and penalizes suspicious patterns
3. **Multiple components**: Requires genuine activity across all dimensions
4. **Time-based decay**: Recent activity weighted appropriately
5. **Network effects**: Cannot be faked without genuine connections

## SQL Implementation Examples

### Get relationship strength for specific accounts:
```sql
SELECT 
    from_address,
    to_address,
    total_score,
    volume_score,
    frequency_score,
    temporal_score,
    network_score,
    risk_score
FROM account_relationships
WHERE from_address = '1YourAccountAddressHere'
ORDER BY total_score DESC;
```

### Find strongest relationships in the network:
```sql
SELECT 
    ar.*,
    a1.identity_display as from_identity,
    a2.identity_display as to_identity
FROM account_relationships ar
LEFT JOIN accounts a1 ON ar.from_address = a1.address
LEFT JOIN accounts a2 ON ar.to_address = a2.address
WHERE ar.total_score > 80
ORDER BY ar.total_score DESC
LIMIT 100;
```

### Identify suspicious high-value relationships:
```sql
SELECT 
    from_address,
    to_address,
    total_score,
    volume_score,
    risk_score,
    total_volume,
    transfer_count
FROM account_relationships
WHERE volume_score > 70 
AND risk_score > 30
ORDER BY risk_score DESC;
```

### Monitor relationship strength changes over time:
```sql
-- This would require a history table to track score changes
CREATE TABLE relationship_score_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    total_score REAL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_address, to_address) 
        REFERENCES account_relationships(from_address, to_address)
);
```

## Performance Considerations

1. **Indexing**: All score calculations use indexed columns
2. **View materialization**: Consider materializing views for large datasets
3. **Batch updates**: Network metrics should be updated in batches
4. **Incremental computation**: Only affected relationships are recalculated

## Future Enhancements

1. **Machine learning integration**: Use historical patterns to adjust weights
2. **Dynamic thresholds**: Adapt scoring based on network-wide statistics
3. **Multi-chain support**: Adjust scoring for cross-chain relationships
4. **Behavioral clustering**: Group similar relationship patterns
5. **Anomaly detection**: Real-time alerts for score changes