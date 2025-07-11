# SQL-Based Graph Implementation Specification

## Overview

This document provides the complete specification for implementing graph functionality using SQL in the Polkadot Analysis Tool, replacing Neo4j while providing enhanced capabilities.

## Database Schema

### 1. Core Graph Tables

```sql
-- Aggregated relationship data (edges in the graph)
CREATE TABLE IF NOT EXISTS account_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_address VARCHAR(66) NOT NULL,
    to_address VARCHAR(66) NOT NULL,
    total_volume NUMERIC(30,0) DEFAULT 0,
    transfer_count INTEGER DEFAULT 0,
    first_transfer_block INTEGER,
    last_transfer_block INTEGER,
    first_transfer_time TIMESTAMP,
    last_transfer_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_address, to_address),
    FOREIGN KEY (from_address) REFERENCES accounts(address),
    FOREIGN KEY (to_address) REFERENCES accounts(address)
);

-- Indexes for graph queries
CREATE INDEX idx_account_relationships_from ON account_relationships(from_address);
CREATE INDEX idx_account_relationships_to ON account_relationships(to_address);
CREATE INDEX idx_account_relationships_volume ON account_relationships(total_volume DESC);
CREATE INDEX idx_account_relationships_composite ON account_relationships(from_address, to_address, total_volume DESC);

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
```

### 2. Materialized Views for Performance

```sql
-- High-degree nodes (hubs)
CREATE VIEW high_degree_nodes AS
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
CREATE VIEW two_hop_relationships AS
SELECT DISTINCT
    ar1.from_address as origin,
    ar2.to_address as destination,
    ar1.to_address as intermediate,
    2 as hop_count,
    LEAST(ar1.total_volume, ar2.total_volume) as bottleneck_volume
FROM account_relationships ar1
JOIN account_relationships ar2 ON ar1.to_address = ar2.from_address
WHERE ar1.from_address != ar2.to_address;

-- Bidirectional relationships
CREATE VIEW bidirectional_relationships AS
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
```

## Core Graph Queries

### 1. Direct Connections (1-hop)

```sql
-- Get all direct connections for an address
WITH account_data AS (
    SELECT id, address FROM accounts WHERE address = ?
)
SELECT 
    CASE 
        WHEN ar.from_address = ad.address THEN 'outgoing'
        ELSE 'incoming'
    END as direction,
    CASE 
        WHEN ar.from_address = ad.address THEN ar.to_address
        ELSE ar.from_address
    END as connected_address,
    CASE 
        WHEN ar.from_address = ad.address THEN a2.identity_display
        ELSE a1.identity_display
    END as connected_identity,
    ar.total_volume,
    ar.transfer_count,
    ar.last_transfer_time,
    COALESCE(rs.total_score, 0) as relationship_score,
    COALESCE(nm.risk_score, 0) as connected_risk_score,
    COALESCE(nm.node_type, 'regular') as connected_node_type
FROM account_data ad
JOIN account_relationships ar ON ar.from_address = ad.address OR ar.to_address = ad.address
JOIN accounts a1 ON a1.address = ar.from_address
JOIN accounts a2 ON a2.address = ar.to_address
LEFT JOIN relationship_scores rs ON rs.from_address = ar.from_address AND rs.to_address = ar.to_address
LEFT JOIN node_metrics nm ON nm.address = CASE 
    WHEN ar.from_address = ad.address THEN ar.to_address
    ELSE ar.from_address
END
WHERE ar.total_volume >= COALESCE(?, 0) -- minimum volume filter
ORDER BY ar.total_volume DESC
LIMIT ?;
```

### 2. Multi-hop Traversal (2-3 hops)

```sql
-- 2-hop connections with path details
WITH RECURSIVE graph_traversal AS (
    -- Base case: direct connections
    SELECT 
        from_address,
        to_address,
        1 as hop_count,
        CAST(from_address || ' -> ' || to_address AS TEXT) as path,
        total_volume,
        transfer_count,
        CAST(total_volume AS DECIMAL) as path_min_volume
    FROM account_relationships
    WHERE from_address = ?
        AND total_volume >= COALESCE(?, 0)
    
    UNION ALL
    
    -- Recursive case: extend paths
    SELECT 
        gt.from_address,
        ar.to_address,
        gt.hop_count + 1,
        gt.path || ' -> ' || ar.to_address,
        ar.total_volume,
        ar.transfer_count,
        LEAST(gt.path_min_volume, CAST(ar.total_volume AS DECIMAL)) as path_min_volume
    FROM account_relationships ar
    INNER JOIN graph_traversal gt ON ar.from_address = gt.to_address
    WHERE gt.hop_count < ?  -- max depth parameter
        AND gt.path NOT LIKE '%' || ar.to_address || '%'  -- prevent cycles
        AND ar.total_volume >= COALESCE(?, 0)  -- minimum volume filter
),
aggregated_paths AS (
    SELECT 
        to_address,
        MIN(hop_count) as min_hops,
        COUNT(*) as path_count,
        MAX(path_min_volume) as best_path_volume,
        GROUP_CONCAT(path, ' | ') as all_paths
    FROM graph_traversal
    WHERE to_address != ? -- exclude starting address
    GROUP BY to_address
)
SELECT 
    ap.*,
    a.identity_display,
    nm.risk_score,
    nm.node_type
FROM aggregated_paths ap
JOIN accounts a ON a.address = ap.to_address
LEFT JOIN node_metrics nm ON nm.address = ap.to_address
ORDER BY min_hops, best_path_volume DESC
LIMIT ?;
```

### 3. Shortest Path Finding

```sql
-- Find shortest path between two addresses using bidirectional search
WITH RECURSIVE 
forward_search AS (
    SELECT 
        from_address, 
        to_address, 
        1 as hop_count, 
        CAST(from_address AS TEXT) as path,
        total_volume
    FROM account_relationships
    WHERE from_address = ?
    
    UNION ALL
    
    SELECT 
        fs.from_address, 
        ar.to_address, 
        fs.hop_count + 1, 
        fs.path || ' -> ' || ar.to_address,
        LEAST(fs.total_volume, ar.total_volume) as total_volume
    FROM account_relationships ar
    JOIN forward_search fs ON ar.from_address = fs.to_address
    WHERE fs.hop_count < 4
        AND fs.path NOT LIKE '%' || ar.to_address || '%'
),
backward_search AS (
    SELECT 
        from_address, 
        to_address, 
        1 as hop_count, 
        CAST(to_address AS TEXT) as path,
        total_volume
    FROM account_relationships
    WHERE to_address = ?
    
    UNION ALL
    
    SELECT 
        ar.from_address, 
        bs.to_address, 
        bs.hop_count + 1, 
        ar.from_address || ' -> ' || bs.path,
        LEAST(bs.total_volume, ar.total_volume) as total_volume
    FROM account_relationships ar
    JOIN backward_search bs ON ar.to_address = bs.from_address
    WHERE bs.hop_count < 4
        AND bs.path NOT LIKE '%' || ar.from_address || '%'
)
SELECT 
    f.path || ' -> ' || b.path as full_path,
    f.hop_count + b.hop_count as total_hops,
    LEAST(f.total_volume, b.total_volume) as path_volume
FROM forward_search f
INNER JOIN backward_search b ON f.to_address = b.from_address
ORDER BY total_hops, path_volume DESC
LIMIT 1;
```

### 4. Subgraph Extraction

```sql
-- Extract complete subgraph around an address
WITH RECURSIVE subgraph_nodes AS (
    -- Start with the center node
    SELECT ? as address, 0 as depth
    
    UNION
    
    -- Add connected nodes up to specified depth
    SELECT 
        CASE 
            WHEN ar.from_address = sn.address THEN ar.to_address
            ELSE ar.from_address
        END as address,
        sn.depth + 1
    FROM account_relationships ar
    JOIN subgraph_nodes sn ON ar.from_address = sn.address OR ar.to_address = sn.address
    WHERE sn.depth < ?  -- max depth
),
subgraph_edges AS (
    SELECT DISTINCT
        ar.*,
        rs.total_score as edge_score
    FROM account_relationships ar
    JOIN subgraph_nodes sn1 ON ar.from_address = sn1.address
    JOIN subgraph_nodes sn2 ON ar.to_address = sn2.address
    LEFT JOIN relationship_scores rs ON rs.from_address = ar.from_address AND rs.to_address = ar.to_address
)
SELECT 
    'nodes' as result_type,
    json_object(
        'address', a.address,
        'identity', a.identity_display,
        'balance', a.balance,
        'node_type', COALESCE(nm.node_type, 'regular'),
        'risk_score', COALESCE(nm.risk_score, 0),
        'degree', COALESCE(nm.degree, 0)
    ) as data
FROM subgraph_nodes sn
JOIN accounts a ON a.address = sn.address
LEFT JOIN node_metrics nm ON nm.address = a.address

UNION ALL

SELECT 
    'edges' as result_type,
    json_object(
        'from', from_address,
        'to', to_address,
        'volume', total_volume,
        'count', transfer_count,
        'score', COALESCE(edge_score, 0)
    ) as data
FROM subgraph_edges;
```

### 5. Pattern Detection Queries

```sql
-- Detect circular flows (money returning to origin)
WITH RECURSIVE circular_paths AS (
    SELECT 
        from_address as origin,
        to_address as current,
        1 as depth,
        CAST(from_address || '->' || to_address AS TEXT) as path,
        total_volume,
        false as is_circular
    FROM account_relationships
    WHERE from_address = ?
    
    UNION ALL
    
    SELECT 
        cp.origin,
        ar.to_address,
        cp.depth + 1,
        cp.path || '->' || ar.to_address,
        LEAST(cp.total_volume, ar.total_volume),
        ar.to_address = cp.origin as is_circular
    FROM account_relationships ar
    JOIN circular_paths cp ON ar.from_address = cp.current
    WHERE cp.depth < 5
        AND NOT cp.is_circular
        AND cp.path NOT LIKE '%' || ar.to_address || '%'
)
SELECT 
    path || ' (circular)',
    depth as path_length,
    total_volume as min_volume_in_path
FROM circular_paths
WHERE is_circular
ORDER BY depth, total_volume DESC;

-- Detect rapid sequential transfers (potential layering)
WITH transfer_sequences AS (
    SELECT 
        t1.from_address,
        t1.to_address as hop1,
        t2.to_address as hop2,
        t1.timestamp as start_time,
        t2.timestamp as end_time,
        (julianday(t2.timestamp) - julianday(t1.timestamp)) * 24 * 60 as minutes_elapsed,
        t1.value as amount1,
        t2.value as amount2
    FROM transfers t1
    JOIN transfers t2 ON t1.to_address = t2.from_address
    WHERE t1.from_address = ?
        AND t2.timestamp > t1.timestamp
        AND (julianday(t2.timestamp) - julianday(t1.timestamp)) * 24 * 60 < 60  -- within 1 hour
        AND ABS(t1.value - t2.value) / t1.value < 0.1  -- similar amounts (10% tolerance)
)
SELECT 
    from_address || ' -> ' || hop1 || ' -> ' || hop2 as rapid_path,
    minutes_elapsed,
    amount1,
    amount2,
    'RAPID_SEQUENTIAL' as pattern_type
FROM transfer_sequences
ORDER BY minutes_elapsed;
```

## Update Triggers

```sql
-- Trigger to update account_relationships on new transfer
CREATE TRIGGER update_relationships_on_transfer
AFTER INSERT ON transfers
BEGIN
    -- Update or create relationship
    INSERT INTO account_relationships (
        from_address, to_address, total_volume, transfer_count,
        first_transfer_block, last_transfer_block,
        first_transfer_time, last_transfer_time
    )
    VALUES (
        NEW.from_address, NEW.to_address, NEW.value, 1,
        NEW.block_number, NEW.block_number,
        NEW.timestamp, NEW.timestamp
    )
    ON CONFLICT(from_address, to_address) DO UPDATE SET
        total_volume = total_volume + NEW.value,
        transfer_count = transfer_count + 1,
        last_transfer_block = NEW.block_number,
        last_transfer_time = NEW.timestamp,
        updated_at = CURRENT_TIMESTAMP;
    
    -- Update node metrics
    INSERT INTO node_metrics (address, out_degree, total_volume_out)
    VALUES (NEW.from_address, 1, NEW.value)
    ON CONFLICT(address) DO UPDATE SET
        out_degree = out_degree + 
            CASE WHEN NOT EXISTS (
                SELECT 1 FROM account_relationships 
                WHERE from_address = NEW.from_address 
                AND to_address = NEW.to_address
                AND transfer_count > 1
            ) THEN 1 ELSE 0 END,
        total_volume_out = total_volume_out + NEW.value,
        updated_at = CURRENT_TIMESTAMP;
        
    INSERT INTO node_metrics (address, in_degree, total_volume_in)
    VALUES (NEW.to_address, 1, NEW.value)
    ON CONFLICT(address) DO UPDATE SET
        in_degree = in_degree + 
            CASE WHEN NOT EXISTS (
                SELECT 1 FROM account_relationships 
                WHERE from_address = NEW.from_address 
                AND to_address = NEW.to_address
                AND transfer_count > 1
            ) THEN 1 ELSE 0 END,
        total_volume_in = total_volume_in + NEW.value,
        updated_at = CURRENT_TIMESTAMP;
END;

-- Trigger to calculate relationship scores periodically
CREATE TRIGGER calculate_relationship_score
AFTER UPDATE OF total_volume, transfer_count ON account_relationships
WHEN NEW.total_volume != OLD.total_volume OR NEW.transfer_count != OLD.transfer_count
BEGIN
    INSERT INTO relationship_scores (
        from_address, to_address,
        volume_score, frequency_score, temporal_score,
        network_score, risk_score, total_score
    )
    SELECT
        NEW.from_address,
        NEW.to_address,
        -- Volume score (0-100)
        MIN(100, (CAST(NEW.total_volume AS REAL) / 
            (SELECT MAX(total_volume) FROM account_relationships)) * 100),
        -- Frequency score (0-100)
        MIN(100, (CAST(NEW.transfer_count AS REAL) / 
            (SELECT MAX(transfer_count) FROM account_relationships)) * 100),
        -- Temporal score (0-100, with recency decay)
        CASE 
            WHEN NEW.last_transfer_time > datetime('now', '-7 days') THEN 100
            WHEN NEW.last_transfer_time > datetime('now', '-30 days') THEN 70
            WHEN NEW.last_transfer_time > datetime('now', '-90 days') THEN 40
            ELSE 20
        END,
        -- Network score (placeholder, would be calculated separately)
        50,
        -- Risk score (placeholder, would be calculated by pattern detection)
        0,
        -- Total score (weighted average)
        0
    ON CONFLICT(from_address, to_address) DO UPDATE SET
        volume_score = excluded.volume_score,
        frequency_score = excluded.frequency_score,
        temporal_score = excluded.temporal_score,
        updated_at = CURRENT_TIMESTAMP;
        
    -- Update total score
    UPDATE relationship_scores
    SET total_score = (
        volume_score * 0.25 + 
        frequency_score * 0.25 + 
        temporal_score * 0.20 + 
        network_score * 0.30
    ) * (1 - risk_score / 200)
    WHERE from_address = NEW.from_address AND to_address = NEW.to_address;
END;
```

## Performance Optimizations

### 1. Query Hints

```sql
-- Force index usage for large tables
SELECT /*+ INDEX(ar idx_account_relationships_from) */ 
    * FROM account_relationships ar
WHERE from_address = ?;

-- Limit recursive depth with query governor
SET max_recursive_depth = 4;

-- Use temporary tables for complex operations
CREATE TEMP TABLE temp_subgraph AS
SELECT DISTINCT address FROM (
    SELECT from_address as address FROM account_relationships WHERE ...
    UNION
    SELECT to_address as address FROM account_relationships WHERE ...
);
```

### 2. Batch Operations

```sql
-- Batch insert relationships
INSERT INTO account_relationships (from_address, to_address, total_volume, transfer_count)
VALUES 
    (?, ?, ?, ?),
    (?, ?, ?, ?),
    (?, ?, ?, ?)
ON CONFLICT(from_address, to_address) DO UPDATE SET
    total_volume = total_volume + excluded.total_volume,
    transfer_count = transfer_count + excluded.transfer_count;
```

### 3. Monitoring Queries

```sql
-- Monitor query performance
CREATE TABLE query_performance_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_type VARCHAR(50),
    parameters JSON,
    execution_time_ms INTEGER,
    rows_returned INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Check graph statistics
SELECT 
    (SELECT COUNT(*) FROM accounts WHERE address IN 
        (SELECT DISTINCT from_address FROM account_relationships 
         UNION 
         SELECT DISTINCT to_address FROM account_relationships)) as node_count,
    (SELECT COUNT(*) FROM account_relationships) as edge_count,
    (SELECT AVG(degree) FROM node_metrics) as avg_degree,
    (SELECT MAX(degree) FROM node_metrics) as max_degree;
```

This specification provides a complete SQL-based implementation for graph functionality, offering multi-hop traversal, pattern detection, and performance optimizations while maintaining compatibility with the existing database structure.