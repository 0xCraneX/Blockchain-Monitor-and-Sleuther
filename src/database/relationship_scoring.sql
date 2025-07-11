-- Relationship Strength Scoring System for Polkadot Analysis Tool
-- Comprehensive scoring system with multiple components

-- Add columns to store relationship scores
ALTER TABLE account_relationships ADD COLUMN IF NOT EXISTS volume_score REAL DEFAULT 0.0;
ALTER TABLE account_relationships ADD COLUMN IF NOT EXISTS frequency_score REAL DEFAULT 0.0;
ALTER TABLE account_relationships ADD COLUMN IF NOT EXISTS temporal_score REAL DEFAULT 0.0;
ALTER TABLE account_relationships ADD COLUMN IF NOT EXISTS network_score REAL DEFAULT 0.0;
ALTER TABLE account_relationships ADD COLUMN IF NOT EXISTS risk_score REAL DEFAULT 0.0;
ALTER TABLE account_relationships ADD COLUMN IF NOT EXISTS total_score REAL DEFAULT 0.0;
ALTER TABLE account_relationships ADD COLUMN IF NOT EXISTS score_updated_at TIMESTAMP;

-- Add columns for temporal analysis
ALTER TABLE account_relationships ADD COLUMN IF NOT EXISTS avg_transfer_size TEXT DEFAULT '0';
ALTER TABLE account_relationships ADD COLUMN IF NOT EXISTS transfer_frequency_per_day REAL DEFAULT 0.0;
ALTER TABLE account_relationships ADD COLUMN IF NOT EXISTS days_active INTEGER DEFAULT 0;
ALTER TABLE account_relationships ADD COLUMN IF NOT EXISTS last_transfer_timestamp TIMESTAMP;

-- Add columns for pattern detection
ALTER TABLE account_relationships ADD COLUMN IF NOT EXISTS rapid_transfer_count INTEGER DEFAULT 0;
ALTER TABLE account_relationships ADD COLUMN IF NOT EXISTS round_number_count INTEGER DEFAULT 0;
ALTER TABLE account_relationships ADD COLUMN IF NOT EXISTS unusual_time_count INTEGER DEFAULT 0;

-- Create a table for network metrics
CREATE TABLE IF NOT EXISTS account_network_metrics (
    address TEXT PRIMARY KEY,
    degree_centrality REAL DEFAULT 0.0,
    betweenness_centrality REAL DEFAULT 0.0,
    closeness_centrality REAL DEFAULT 0.0,
    clustering_coefficient REAL DEFAULT 0.0,
    pagerank REAL DEFAULT 0.0,
    common_neighbors_avg REAL DEFAULT 0.0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (address) REFERENCES accounts(address)
);

-- Create index for network metrics
CREATE INDEX IF NOT EXISTS idx_network_metrics_address ON account_network_metrics(address);

-- Function to calculate volume score (0-100)
-- Considers: total volume, average transfer size, volume relative to account balances
CREATE VIEW volume_score_calculation AS
WITH volume_stats AS (
    SELECT 
        from_address,
        to_address,
        total_volume,
        CAST(total_volume AS REAL) / NULLIF(transfer_count, 0) as avg_transfer_size,
        -- Get sender and receiver balances
        CAST(a1.balance AS REAL) as sender_balance,
        CAST(a2.balance AS REAL) as receiver_balance,
        -- Calculate percentiles for normalization
        PERCENT_RANK() OVER (ORDER BY CAST(total_volume AS REAL)) as volume_percentile,
        PERCENT_RANK() OVER (ORDER BY CAST(total_volume AS REAL) / NULLIF(transfer_count, 0)) as avg_size_percentile
    FROM account_relationships ar
    LEFT JOIN accounts a1 ON ar.from_address = a1.address
    LEFT JOIN accounts a2 ON ar.to_address = a2.address
)
SELECT 
    from_address,
    to_address,
    -- Volume component (0-40 points)
    LEAST(40, volume_percentile * 40) as volume_component,
    -- Average size component (0-30 points)
    LEAST(30, avg_size_percentile * 30) as avg_size_component,
    -- Relative volume component (0-30 points)
    CASE 
        WHEN sender_balance > 0 THEN 
            LEAST(30, (CAST(total_volume AS REAL) / sender_balance) * 100)
        ELSE 15
    END as relative_volume_component,
    -- Total volume score
    LEAST(100, 
        LEAST(40, volume_percentile * 40) +
        LEAST(30, avg_size_percentile * 30) +
        CASE 
            WHEN sender_balance > 0 THEN 
                LEAST(30, (CAST(total_volume AS REAL) / sender_balance) * 100)
            ELSE 15
        END
    ) as total_volume_score
FROM volume_stats;

-- Function to calculate frequency score (0-100)
-- Considers: transfer count, frequency over time, consistency
CREATE VIEW frequency_score_calculation AS
WITH frequency_stats AS (
    SELECT 
        ar.from_address,
        ar.to_address,
        ar.transfer_count,
        -- Calculate days between first and last transfer
        JULIANDAY(datetime(MAX(t.timestamp))) - JULIANDAY(datetime(MIN(t.timestamp))) + 1 as days_active,
        -- Calculate transfers per day
        ar.transfer_count / NULLIF(JULIANDAY(datetime(MAX(t.timestamp))) - JULIANDAY(datetime(MIN(t.timestamp))) + 1, 0) as transfers_per_day,
        -- Calculate variance in daily transfers (consistency)
        COUNT(DISTINCT DATE(t.timestamp)) as unique_days,
        -- Get percentiles
        PERCENT_RANK() OVER (ORDER BY ar.transfer_count) as count_percentile,
        PERCENT_RANK() OVER (ORDER BY ar.transfer_count / NULLIF(JULIANDAY(datetime(MAX(t.timestamp))) - JULIANDAY(datetime(MIN(t.timestamp))) + 1, 0)) as frequency_percentile
    FROM account_relationships ar
    JOIN transfers t ON ar.from_address = t.from_address AND ar.to_address = t.to_address
    GROUP BY ar.from_address, ar.to_address, ar.transfer_count
)
SELECT 
    from_address,
    to_address,
    -- Transfer count component (0-40 points)
    LEAST(40, count_percentile * 40) as count_component,
    -- Frequency component (0-30 points)
    LEAST(30, frequency_percentile * 30) as frequency_component,
    -- Consistency component (0-30 points)
    CASE 
        WHEN days_active > 0 THEN
            LEAST(30, (unique_days / days_active) * 30)
        ELSE 0
    END as consistency_component,
    -- Total frequency score
    LEAST(100,
        LEAST(40, count_percentile * 40) +
        LEAST(30, frequency_percentile * 30) +
        CASE 
            WHEN days_active > 0 THEN
                LEAST(30, (unique_days / days_active) * 30)
            ELSE 0
        END
    ) as total_frequency_score
FROM frequency_stats;

-- Function to calculate temporal score (0-100)
-- Considers: recency, relationship duration, activity patterns
CREATE VIEW temporal_score_calculation AS
WITH temporal_stats AS (
    SELECT 
        ar.from_address,
        ar.to_address,
        -- Days since last transfer
        JULIANDAY('now') - JULIANDAY(datetime(MAX(t.timestamp))) as days_since_last,
        -- Total relationship duration
        JULIANDAY(datetime(MAX(t.timestamp))) - JULIANDAY(datetime(MIN(t.timestamp))) + 1 as relationship_days,
        -- Activity in recent periods
        COUNT(CASE WHEN JULIANDAY('now') - JULIANDAY(datetime(t.timestamp)) <= 7 THEN 1 END) as transfers_last_week,
        COUNT(CASE WHEN JULIANDAY('now') - JULIANDAY(datetime(t.timestamp)) <= 30 THEN 1 END) as transfers_last_month,
        ar.transfer_count
    FROM account_relationships ar
    JOIN transfers t ON ar.from_address = t.from_address AND ar.to_address = t.to_address
    GROUP BY ar.from_address, ar.to_address
)
SELECT 
    from_address,
    to_address,
    -- Recency component (0-40 points) - exponential decay
    CASE 
        WHEN days_since_last <= 1 THEN 40
        WHEN days_since_last <= 7 THEN 35
        WHEN days_since_last <= 30 THEN 25
        WHEN days_since_last <= 90 THEN 15
        WHEN days_since_last <= 365 THEN 5
        ELSE 0
    END as recency_component,
    -- Duration component (0-30 points)
    LEAST(30, (relationship_days / 365.0) * 30) as duration_component,
    -- Activity pattern component (0-30 points)
    CASE 
        WHEN transfer_count > 0 THEN
            LEAST(30, 
                (transfers_last_week * 1.0 / transfer_count * 15) +
                (transfers_last_month * 1.0 / transfer_count * 15)
            )
        ELSE 0
    END as activity_component,
    -- Total temporal score
    CASE 
        WHEN days_since_last <= 1 THEN 40
        WHEN days_since_last <= 7 THEN 35
        WHEN days_since_last <= 30 THEN 25
        WHEN days_since_last <= 90 THEN 15
        WHEN days_since_last <= 365 THEN 5
        ELSE 0
    END +
    LEAST(30, (relationship_days / 365.0) * 30) +
    CASE 
        WHEN transfer_count > 0 THEN
            LEAST(30, 
                (transfers_last_week * 1.0 / transfer_count * 15) +
                (transfers_last_month * 1.0 / transfer_count * 15)
            )
        ELSE 0
    END as total_temporal_score
FROM temporal_stats;

-- Function to calculate network score (0-100)
-- Considers: common connections, centrality, clustering
CREATE VIEW network_score_calculation AS
WITH network_stats AS (
    SELECT 
        ar.from_address,
        ar.to_address,
        -- Common connections (mutual relationships)
        (
            SELECT COUNT(DISTINCT CASE 
                WHEN r1.to_address = r2.from_address THEN r1.to_address 
                WHEN r1.from_address = r2.to_address THEN r1.from_address 
            END)
            FROM account_relationships r1, account_relationships r2
            WHERE r1.from_address = ar.from_address 
            AND r2.to_address = ar.to_address
            AND (r1.to_address = r2.from_address OR r1.from_address = r2.to_address)
        ) as common_connections,
        -- Get network metrics
        COALESCE(nm1.degree_centrality, 0) as from_degree,
        COALESCE(nm2.degree_centrality, 0) as to_degree,
        COALESCE(nm1.pagerank, 0) as from_pagerank,
        COALESCE(nm2.pagerank, 0) as to_pagerank,
        COALESCE(nm1.clustering_coefficient, 0) as from_clustering,
        COALESCE(nm2.clustering_coefficient, 0) as to_clustering
    FROM account_relationships ar
    LEFT JOIN account_network_metrics nm1 ON ar.from_address = nm1.address
    LEFT JOIN account_network_metrics nm2 ON ar.to_address = nm2.address
)
SELECT 
    from_address,
    to_address,
    -- Common connections component (0-40 points)
    LEAST(40, common_connections * 5) as common_connections_component,
    -- Centrality component (0-30 points)
    LEAST(30, ((from_degree + to_degree) / 2.0) * 100) as centrality_component,
    -- Importance component (0-30 points) based on PageRank
    LEAST(30, ((from_pagerank + to_pagerank) / 2.0) * 1000) as importance_component,
    -- Total network score
    LEAST(100,
        LEAST(40, common_connections * 5) +
        LEAST(30, ((from_degree + to_degree) / 2.0) * 100) +
        LEAST(30, ((from_pagerank + to_pagerank) / 2.0) * 1000)
    ) as total_network_score
FROM network_stats;

-- Function to calculate risk indicators (0-100, higher = more risky)
CREATE VIEW risk_score_calculation AS
WITH risk_stats AS (
    SELECT 
        ar.from_address,
        ar.to_address,
        ar.transfer_count,
        -- Rapid sequential transfers (within 5 minutes)
        (
            SELECT COUNT(*)
            FROM transfers t1
            JOIN transfers t2 ON t1.to_address = t2.from_address
            WHERE t1.from_address = ar.from_address
            AND t2.to_address = ar.to_address
            AND ABS(JULIANDAY(t2.timestamp) - JULIANDAY(t1.timestamp)) * 24 * 60 < 5
        ) as rapid_transfers,
        -- Round number patterns
        (
            SELECT COUNT(*)
            FROM transfers t
            WHERE t.from_address = ar.from_address
            AND t.to_address = ar.to_address
            AND (
                CAST(t.value AS REAL) % 1000000000000 = 0 OR  -- Divisible by 1 DOT
                CAST(t.value AS REAL) % 10000000000000 = 0 OR -- Divisible by 10 DOT
                CAST(t.value AS REAL) % 100000000000000 = 0   -- Divisible by 100 DOT
            )
        ) as round_numbers,
        -- Unusual time transfers (2-5 AM UTC)
        (
            SELECT COUNT(*)
            FROM transfers t
            WHERE t.from_address = ar.from_address
            AND t.to_address = ar.to_address
            AND CAST(strftime('%H', t.timestamp) AS INTEGER) BETWEEN 2 AND 5
        ) as unusual_time,
        -- New account interaction (account created within 7 days of first transfer)
        CASE 
            WHEN JULIANDAY(datetime(ar.created_at)) - JULIANDAY(datetime(a.created_at)) < 7 THEN 1
            ELSE 0
        END as new_account_flag
    FROM account_relationships ar
    JOIN accounts a ON ar.to_address = a.address
)
SELECT 
    from_address,
    to_address,
    -- Rapid transfer risk (0-30 points)
    LEAST(30, (rapid_transfers * 1.0 / NULLIF(transfer_count, 1)) * 100) as rapid_transfer_risk,
    -- Round number risk (0-25 points)
    LEAST(25, (round_numbers * 1.0 / NULLIF(transfer_count, 1)) * 50) as round_number_risk,
    -- Time anomaly risk (0-25 points)
    LEAST(25, (unusual_time * 1.0 / NULLIF(transfer_count, 1)) * 50) as time_anomaly_risk,
    -- New account risk (0-20 points)
    new_account_flag * 20 as new_account_risk,
    -- Total risk score
    LEAST(100,
        LEAST(30, (rapid_transfers * 1.0 / NULLIF(transfer_count, 1)) * 100) +
        LEAST(25, (round_numbers * 1.0 / NULLIF(transfer_count, 1)) * 50) +
        LEAST(25, (unusual_time * 1.0 / NULLIF(transfer_count, 1)) * 50) +
        new_account_flag * 20
    ) as total_risk_score
FROM risk_stats;

-- Master scoring function that combines all components
CREATE VIEW relationship_strength_scores AS
WITH all_scores AS (
    SELECT 
        ar.from_address,
        ar.to_address,
        COALESCE(vs.total_volume_score, 0) as volume_score,
        COALESCE(fs.total_frequency_score, 0) as frequency_score,
        COALESCE(ts.total_temporal_score, 0) as temporal_score,
        COALESCE(ns.total_network_score, 0) as network_score,
        COALESCE(rs.total_risk_score, 0) as risk_score
    FROM account_relationships ar
    LEFT JOIN volume_score_calculation vs ON ar.from_address = vs.from_address AND ar.to_address = vs.to_address
    LEFT JOIN frequency_score_calculation fs ON ar.from_address = fs.from_address AND ar.to_address = fs.to_address
    LEFT JOIN temporal_score_calculation ts ON ar.from_address = ts.from_address AND ar.to_address = ts.to_address
    LEFT JOIN network_score_calculation ns ON ar.from_address = ns.from_address AND ar.to_address = ns.to_address
    LEFT JOIN risk_score_calculation rs ON ar.from_address = rs.from_address AND ar.to_address = rs.to_address
)
SELECT 
    from_address,
    to_address,
    volume_score,
    frequency_score,
    temporal_score,
    network_score,
    risk_score,
    -- Weighted total score with risk penalty
    -- Weights: Volume 25%, Frequency 25%, Temporal 20%, Network 30%
    -- Risk acts as a penalty multiplier (0-1 range, where 1 = no risk)
    ROUND(
        (volume_score * 0.25 + 
         frequency_score * 0.25 + 
         temporal_score * 0.20 + 
         network_score * 0.30) * 
        (1 - risk_score / 200.0),  -- Risk penalty: max 50% reduction
        2
    ) as total_strength_score
FROM all_scores;

-- Stored procedure to update relationship scores
CREATE TRIGGER update_relationship_scores
AFTER INSERT ON transfers
BEGIN
    -- Update the relationship scores for the affected relationship
    UPDATE account_relationships
    SET 
        volume_score = (
            SELECT total_volume_score 
            FROM volume_score_calculation 
            WHERE from_address = NEW.from_address AND to_address = NEW.to_address
        ),
        frequency_score = (
            SELECT total_frequency_score 
            FROM frequency_score_calculation 
            WHERE from_address = NEW.from_address AND to_address = NEW.to_address
        ),
        temporal_score = (
            SELECT total_temporal_score 
            FROM temporal_score_calculation 
            WHERE from_address = NEW.from_address AND to_address = NEW.to_address
        ),
        network_score = (
            SELECT total_network_score 
            FROM network_score_calculation 
            WHERE from_address = NEW.from_address AND to_address = NEW.to_address
        ),
        risk_score = (
            SELECT total_risk_score 
            FROM risk_score_calculation 
            WHERE from_address = NEW.from_address AND to_address = NEW.to_address
        ),
        total_score = (
            SELECT total_strength_score 
            FROM relationship_strength_scores 
            WHERE from_address = NEW.from_address AND to_address = NEW.to_address
        ),
        score_updated_at = CURRENT_TIMESTAMP
    WHERE from_address = NEW.from_address AND to_address = NEW.to_address;
END;

-- Example queries to demonstrate the scoring system

-- 1. Get top relationships by strength score
-- SELECT 
--     from_address,
--     to_address,
--     total_score,
--     volume_score,
--     frequency_score,
--     temporal_score,
--     network_score,
--     risk_score
-- FROM account_relationships
-- ORDER BY total_score DESC
-- LIMIT 100;

-- 2. Find suspicious relationships (high volume but high risk)
-- SELECT 
--     from_address,
--     to_address,
--     total_score,
--     volume_score,
--     risk_score,
--     transfer_count,
--     total_volume
-- FROM account_relationships
-- WHERE volume_score > 70 AND risk_score > 50
-- ORDER BY risk_score DESC;

-- 3. Identify strong, consistent relationships
-- SELECT 
--     from_address,
--     to_address,
--     total_score,
--     frequency_score,
--     temporal_score,
--     days_active,
--     transfer_count
-- FROM account_relationships
-- WHERE frequency_score > 80 AND temporal_score > 70
-- ORDER BY total_score DESC;