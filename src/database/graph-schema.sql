-- Additional schema for graph-specific functionality
-- This supplements the main schema.sql with tables needed for GraphQueries

-- Node metrics cache
CREATE TABLE IF NOT EXISTS node_metrics (
    address VARCHAR(66) PRIMARY KEY,
    degree INTEGER DEFAULT 0,
    in_degree INTEGER DEFAULT 0,
    out_degree INTEGER DEFAULT 0,
    total_volume_in NUMERIC(30,0) DEFAULT 0,
    total_volume_out NUMERIC(30,0) DEFAULT 0,
    clustering_coefficient NUMERIC(5,4),
    betweenness_centrality NUMERIC(7,6),
    pagerank NUMERIC(7,6),
    risk_score INTEGER DEFAULT 0,
    node_type VARCHAR(20) DEFAULT 'regular',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (address) REFERENCES accounts(address)
);

-- Relationship scores
CREATE TABLE IF NOT EXISTS relationship_scores (
    from_address VARCHAR(66) NOT NULL,
    to_address VARCHAR(66) NOT NULL,
    volume_score NUMERIC(5,2) DEFAULT 0,
    frequency_score NUMERIC(5,2) DEFAULT 0,
    temporal_score NUMERIC(5,2) DEFAULT 0,
    network_score NUMERIC(5,2) DEFAULT 0,
    risk_score NUMERIC(5,2) DEFAULT 0,
    total_score NUMERIC(5,2) DEFAULT 0,
    score_details JSON,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (from_address, to_address),
    FOREIGN KEY (from_address) REFERENCES accounts(address),
    FOREIGN KEY (to_address) REFERENCES accounts(address)
);

-- Pre-computed paths for common queries
CREATE TABLE IF NOT EXISTS cached_paths (
    from_address VARCHAR(66) NOT NULL,
    to_address VARCHAR(66) NOT NULL,
    path_length INTEGER NOT NULL,
    path JSON NOT NULL,
    total_volume NUMERIC(30,0),
    computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (from_address, to_address)
);

-- Graph state tracking
CREATE TABLE IF NOT EXISTS graph_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_processed_transfer_id INTEGER DEFAULT 0,
    last_relationship_update TIMESTAMP,
    total_nodes INTEGER DEFAULT 0,
    total_edges INTEGER DEFAULT 0,
    CHECK (id = 1)
);

-- Query performance log
CREATE TABLE IF NOT EXISTS query_performance_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_type VARCHAR(50),
    parameters JSON,
    execution_time_ms INTEGER,
    rows_returned INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add missing columns to account_relationships if they don't exist
ALTER TABLE account_relationships ADD COLUMN first_transfer_time TIMESTAMP;
ALTER TABLE account_relationships ADD COLUMN last_transfer_time TIMESTAMP;

-- Additional indexes for graph queries
CREATE INDEX IF NOT EXISTS idx_account_relationships_volume ON account_relationships(total_volume DESC);
CREATE INDEX IF NOT EXISTS idx_account_relationships_composite ON account_relationships(from_address, to_address, total_volume DESC);
CREATE INDEX IF NOT EXISTS idx_node_metrics_degree ON node_metrics(degree DESC);
CREATE INDEX IF NOT EXISTS idx_node_metrics_risk ON node_metrics(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_relationship_scores_total ON relationship_scores(total_score DESC);

-- Views for graph queries
-- High-degree nodes (hubs)
CREATE VIEW IF NOT EXISTS high_degree_nodes AS
SELECT 
    nm.address,
    nm.degree,
    nm.node_type,
    a.identity_display,
    nm.risk_score
FROM node_metrics nm
JOIN accounts a ON nm.address = a.address
WHERE nm.degree > 50
ORDER BY nm.degree DESC;

-- Two-hop relationships (friend-of-friend)
CREATE VIEW IF NOT EXISTS two_hop_relationships AS
SELECT DISTINCT
    ar1.from_address as origin,
    ar2.to_address as destination,
    ar1.to_address as intermediate,
    2 as hop_count,
    MIN(ar1.total_volume, ar2.total_volume) as bottleneck_volume
FROM account_relationships ar1
JOIN account_relationships ar2 ON ar1.to_address = ar2.from_address
WHERE ar1.from_address != ar2.to_address;

-- Bidirectional relationships
CREATE VIEW IF NOT EXISTS bidirectional_relationships AS
SELECT 
    ar1.from_address,
    ar1.to_address,
    ar1.total_volume as forward_volume,
    ar2.total_volume as reverse_volume,
    ar1.transfer_count as forward_count,
    ar2.transfer_count as reverse_count,
    ar1.total_volume + COALESCE(ar2.total_volume, 0) as total_volume
FROM account_relationships ar1
LEFT JOIN account_relationships ar2 
    ON ar1.from_address = ar2.to_address 
    AND ar1.to_address = ar2.from_address;