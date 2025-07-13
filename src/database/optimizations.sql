-- Polkadot Analysis Tool - Database Optimizations
-- Phase 4: Data Layer Improvements

-- Additional indexes for common query patterns

-- Composite indexes for relationship queries
CREATE INDEX IF NOT EXISTS idx_relationships_composite ON account_relationships(from_address, to_address, total_volume);
CREATE INDEX IF NOT EXISTS idx_relationships_volume ON account_relationships(total_volume);
CREATE INDEX IF NOT EXISTS idx_relationships_time ON account_relationships(last_transfer_time);

-- Composite indexes for transfer queries
CREATE INDEX IF NOT EXISTS idx_transfers_composite ON transfers(from_address, to_address, timestamp);
CREATE INDEX IF NOT EXISTS idx_transfers_value ON transfers(value);
CREATE INDEX IF NOT EXISTS idx_transfers_hash_lookup ON transfers(hash);

-- Indexes for pattern detection
CREATE INDEX IF NOT EXISTS idx_patterns_composite ON patterns(address, pattern_type, confidence);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON patterns(confidence);
CREATE INDEX IF NOT EXISTS idx_patterns_detection_time ON patterns(detected_at);

-- Indexes for account queries
CREATE INDEX IF NOT EXISTS idx_accounts_balance ON accounts(balance);
CREATE INDEX IF NOT EXISTS idx_accounts_risk ON accounts(risk_score);
CREATE INDEX IF NOT EXISTS idx_accounts_volume ON accounts(volume_in, volume_out);
CREATE INDEX IF NOT EXISTS idx_accounts_activity ON accounts(last_seen_block);

-- Materialized view for high-degree nodes
CREATE TABLE IF NOT EXISTS node_metrics (
    address TEXT PRIMARY KEY,
    degree INTEGER DEFAULT 0,
    in_degree INTEGER DEFAULT 0,
    out_degree INTEGER DEFAULT 0,
    betweenness_centrality REAL DEFAULT 0.0,
    closeness_centrality REAL DEFAULT 0.0,
    clustering_coefficient REAL DEFAULT 0.0,
    total_volume TEXT DEFAULT '0',
    risk_score REAL DEFAULT 0.0,
    node_type TEXT, -- 'hub', 'bridge', 'peripheral', 'mixer', 'exchange'
    last_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (address) REFERENCES accounts(address)
);

CREATE INDEX IF NOT EXISTS idx_node_metrics_degree ON node_metrics(degree);
CREATE INDEX IF NOT EXISTS idx_node_metrics_risk ON node_metrics(risk_score);
CREATE INDEX IF NOT EXISTS idx_node_metrics_type ON node_metrics(node_type);

-- Performance tracking table
CREATE TABLE IF NOT EXISTS query_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_hash TEXT NOT NULL,
    query_type TEXT NOT NULL,
    execution_time_ms INTEGER NOT NULL,
    rows_returned INTEGER DEFAULT 0,
    cache_hit BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_query_performance_hash ON query_performance(query_hash);
CREATE INDEX IF NOT EXISTS idx_query_performance_time ON query_performance(created_at);

-- Cache metadata table
CREATE TABLE IF NOT EXISTS cache_metadata (
    cache_key TEXT PRIMARY KEY,
    data_hash TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    hit_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cache_metadata_expires ON cache_metadata(expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_metadata_accessed ON cache_metadata(last_accessed);

-- Scoring cache table
CREATE TABLE IF NOT EXISTS scoring_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    score_type TEXT NOT NULL, -- 'volume', 'frequency', 'temporal', 'network', 'risk', 'total'
    score REAL NOT NULL,
    details TEXT, -- JSON details
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    FOREIGN KEY (from_address) REFERENCES accounts(address),
    FOREIGN KEY (to_address) REFERENCES accounts(address),
    UNIQUE(from_address, to_address, score_type)
);

CREATE INDEX IF NOT EXISTS idx_scoring_cache_lookup ON scoring_cache(from_address, to_address, score_type);
CREATE INDEX IF NOT EXISTS idx_scoring_cache_expires ON scoring_cache(expires_at);

-- Triggers for maintaining node metrics

-- Update node metrics on new relationship
CREATE TRIGGER IF NOT EXISTS update_node_metrics_on_relationship
AFTER INSERT ON account_relationships
BEGIN
    -- Update or insert metrics for from_address
    INSERT INTO node_metrics (address, out_degree, total_volume)
    VALUES (NEW.from_address, 1, NEW.total_volume)
    ON CONFLICT(address) DO UPDATE SET
        out_degree = out_degree + 1,
        total_volume = CAST(CAST(total_volume AS INTEGER) + CAST(NEW.total_volume AS INTEGER) AS TEXT),
        degree = in_degree + out_degree + 1,
        last_calculated = CURRENT_TIMESTAMP;
    
    -- Update or insert metrics for to_address
    INSERT INTO node_metrics (address, in_degree, total_volume)
    VALUES (NEW.to_address, 1, NEW.total_volume)
    ON CONFLICT(address) DO UPDATE SET
        in_degree = in_degree + 1,
        total_volume = CAST(CAST(total_volume AS INTEGER) + CAST(NEW.total_volume AS INTEGER) AS TEXT),
        degree = in_degree + out_degree + 1,
        last_calculated = CURRENT_TIMESTAMP;
END;

-- Trigger to clean expired cache entries
CREATE TRIGGER IF NOT EXISTS clean_expired_cache
AFTER INSERT ON cache_metadata
WHEN (SELECT COUNT(*) FROM cache_metadata WHERE expires_at < CURRENT_TIMESTAMP) > 100
BEGIN
    DELETE FROM cache_metadata WHERE expires_at < CURRENT_TIMESTAMP;
    DELETE FROM scoring_cache WHERE expires_at < CURRENT_TIMESTAMP;
END;

-- Analytical functions as views

-- View for finding high-risk relationships
CREATE VIEW IF NOT EXISTS high_risk_relationships AS
SELECT 
    ar.from_address,
    ar.to_address,
    ar.total_volume,
    ar.transfer_count,
    a1.risk_score as from_risk_score,
    a2.risk_score as to_risk_score,
    (a1.risk_score + a2.risk_score) / 2 as avg_risk_score
FROM account_relationships ar
JOIN accounts a1 ON ar.from_address = a1.address
JOIN accounts a2 ON ar.to_address = a2.address
WHERE a1.risk_score > 0.5 OR a2.risk_score > 0.5
ORDER BY avg_risk_score DESC;

-- View for volume statistics
CREATE VIEW IF NOT EXISTS volume_statistics AS
SELECT 
    'total' as metric,
    SUM(CAST(total_volume AS INTEGER)) as value
FROM account_relationships
UNION ALL
SELECT 
    'average' as metric,
    AVG(CAST(total_volume AS INTEGER)) as value
FROM account_relationships
UNION ALL
SELECT 
    'median' as metric,
    CAST(total_volume AS INTEGER) as value
FROM account_relationships
ORDER BY CAST(total_volume AS INTEGER)
LIMIT 1 OFFSET (SELECT COUNT(*) FROM account_relationships) / 2;

-- ANALYZE to update query planner statistics
ANALYZE;