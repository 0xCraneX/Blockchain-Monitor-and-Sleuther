# Database Design Specification

## Overview

This document specifies the database design for the Polkadot Analysis Tool, adapted from FollowTheDot's PostgreSQL + Neo4j architecture to a simplified SQLite implementation optimized for single-user desktop applications.

## Schema Design

### Core Tables

#### 1. accounts
Primary registry of all blockchain addresses with identity information.

```sql
CREATE TABLE accounts (
    address TEXT PRIMARY KEY,
    display_name TEXT,
    legal_name TEXT,
    web TEXT,
    email TEXT,
    twitter TEXT,
    riot TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    is_invalid BOOLEAN DEFAULT FALSE,
    balance TEXT, -- Store as TEXT for BigInt compatibility
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Indexes
CREATE INDEX idx_accounts_display ON accounts(display_name);
CREATE INDEX idx_accounts_balance ON accounts(balance);
CREATE INDEX idx_accounts_verified ON accounts(is_verified) WHERE is_verified = 1;
```

#### 2. sub_identities
Tracks sub-identity relationships (child accounts linked to parent accounts).

```sql
CREATE TABLE sub_identities (
    address TEXT PRIMARY KEY,
    super_address TEXT NOT NULL,
    sub_display TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (address) REFERENCES accounts(address),
    FOREIGN KEY (super_address) REFERENCES accounts(address)
);

CREATE INDEX idx_sub_identities_super ON sub_identities(super_address);
```

#### 3. blocks
Stores blockchain block metadata for synchronization tracking.

```sql
CREATE TABLE blocks (
    number INTEGER PRIMARY KEY,
    hash TEXT UNIQUE NOT NULL,
    parent_hash TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_blocks_processed ON blocks(processed);
CREATE INDEX idx_blocks_timestamp ON blocks(timestamp);
```

#### 4. transfers
Individual transfer records between addresses.

```sql
CREATE TABLE transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_number INTEGER NOT NULL,
    extrinsic_index INTEGER,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    asset_id TEXT DEFAULT 'DOT',
    amount TEXT NOT NULL, -- BigInt as TEXT
    fee TEXT, -- BigInt as TEXT
    timestamp INTEGER NOT NULL,
    hash TEXT UNIQUE,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (block_number) REFERENCES blocks(number),
    FOREIGN KEY (from_address) REFERENCES accounts(address),
    FOREIGN KEY (to_address) REFERENCES accounts(address)
);

-- Composite index for efficient queries
CREATE INDEX idx_transfers_addresses ON transfers(from_address, to_address, timestamp);
CREATE INDEX idx_transfers_block ON transfers(block_number);
CREATE INDEX idx_transfers_timestamp ON transfers(timestamp);
CREATE INDEX idx_transfers_asset ON transfers(asset_id);
```

#### 5. transfer_stats
Pre-calculated transfer statistics for performance (replaces Neo4j graph relationships).

```sql
CREATE TABLE transfer_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    total_volume TEXT NOT NULL, -- BigInt sum
    transfer_count INTEGER NOT NULL,
    first_transfer INTEGER NOT NULL, -- timestamp
    last_transfer INTEGER NOT NULL, -- timestamp
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(from_address, to_address)
);

CREATE INDEX idx_transfer_stats_volume ON transfer_stats(total_volume);
CREATE INDEX idx_transfer_stats_count ON transfer_stats(transfer_count);
```

#### 6. account_stats
Aggregated statistics per account for quick lookups.

```sql
CREATE TABLE account_stats (
    address TEXT PRIMARY KEY,
    total_sent TEXT DEFAULT '0',
    total_received TEXT DEFAULT '0',
    sent_count INTEGER DEFAULT 0,
    received_count INTEGER DEFAULT 0,
    unique_senders INTEGER DEFAULT 0,
    unique_receivers INTEGER DEFAULT 0,
    first_activity INTEGER,
    last_activity INTEGER,
    risk_score INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (address) REFERENCES accounts(address)
);
```

#### 7. patterns
Detected suspicious patterns and their details.

```sql
CREATE TABLE patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_type TEXT NOT NULL, -- 'RAPID_MOVEMENT', 'CIRCULAR', 'MIXER', etc.
    address TEXT NOT NULL,
    severity INTEGER CHECK (severity >= 0 AND severity <= 100),
    details TEXT, -- JSON string with pattern-specific data
    detected_at INTEGER DEFAULT (strftime('%s', 'now')),
    resolved BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (address) REFERENCES accounts(address)
);

CREATE INDEX idx_patterns_address ON patterns(address);
CREATE INDEX idx_patterns_type ON patterns(pattern_type);
CREATE INDEX idx_patterns_severity ON patterns(severity);
```

#### 8. watchlist
User-defined addresses to monitor.

```sql
CREATE TABLE watchlist (
    address TEXT PRIMARY KEY,
    label TEXT,
    category TEXT, -- 'EXCHANGE', 'SUSPICIOUS', 'PERSONAL', etc.
    notes TEXT,
    risk_level TEXT DEFAULT 'UNKNOWN',
    added_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (address) REFERENCES accounts(address)
);
```

#### 9. processing_state
Tracks synchronization and processing state.

```sql
CREATE TABLE processing_state (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Singleton
    last_processed_block INTEGER DEFAULT 0,
    last_update_time INTEGER,
    processed_transfers INTEGER DEFAULT 0,
    chain_id TEXT DEFAULT 'polkadot'
);
```

#### 10. search_index (Virtual FTS5 Table)
Full-text search index for efficient text queries.

```sql
CREATE VIRTUAL TABLE search_index USING fts5(
    address,
    display_name,
    legal_name,
    web,
    email,
    content=accounts,
    content_rowid=rowid,
    tokenize='porter'
);

-- Trigger to keep FTS index updated
CREATE TRIGGER accounts_ai AFTER INSERT ON accounts BEGIN
    INSERT INTO search_index(rowid, address, display_name, legal_name, web, email)
    VALUES (new.rowid, new.address, new.display_name, new.legal_name, new.web, new.email);
END;
```

## Data Type Considerations

### BigInt Handling
JavaScript's BigInt support requires special handling:
- Store as TEXT in SQLite
- Convert to BigInt in JavaScript: `BigInt(row.amount)`
- Convert back for storage: `amount.toString()`

### Timestamps
- Store as Unix timestamps (INTEGER)
- SQLite function: `strftime('%s', 'now')`
- JavaScript: `Date.now() / 1000`

## Query Patterns

### 1. Account Relationship Graph (Replacing Neo4j)
```sql
-- Get all connections for an address
WITH RECURSIVE connections AS (
    -- Direct connections
    SELECT DISTINCT 
        CASE WHEN from_address = ? THEN to_address ELSE from_address END as connected_address,
        1 as depth
    FROM transfer_stats
    WHERE from_address = ? OR to_address = ?
    
    UNION
    
    -- Recursive connections (up to depth N)
    SELECT DISTINCT
        CASE WHEN ts.from_address = c.connected_address THEN ts.to_address 
             ELSE ts.from_address END as connected_address,
        c.depth + 1
    FROM transfer_stats ts
    JOIN connections c ON (
        ts.from_address = c.connected_address OR 
        ts.to_address = c.connected_address
    )
    WHERE c.depth < ? -- max depth parameter
)
SELECT DISTINCT connected_address, MIN(depth) as depth
FROM connections
GROUP BY connected_address;
```

### 2. Transfer Volume Aggregation
```sql
-- Update transfer stats after new transfers
INSERT INTO transfer_stats (from_address, to_address, total_volume, transfer_count, first_transfer, last_transfer)
VALUES (?, ?, ?, 1, ?, ?)
ON CONFLICT(from_address, to_address) DO UPDATE SET
    total_volume = CAST(CAST(total_volume AS INTEGER) + CAST(excluded.total_volume AS INTEGER) AS TEXT),
    transfer_count = transfer_count + 1,
    last_transfer = excluded.last_transfer,
    updated_at = strftime('%s', 'now');
```

### 3. Pattern Detection Queries
```sql
-- Rapid fund movement detection
SELECT 
    address,
    COUNT(*) as tx_count,
    MIN(timestamp) as period_start,
    MAX(timestamp) as period_end
FROM (
    SELECT from_address as address, timestamp FROM transfers
    UNION ALL
    SELECT to_address as address, timestamp FROM transfers
) t
WHERE timestamp > ? -- time window start
GROUP BY address
HAVING tx_count > ? -- threshold
ORDER BY tx_count DESC;
```

## Migration Strategy

### From PostgreSQL
1. Export data using pg_dump in INSERT format
2. Transform data types (numeric → TEXT for BigInt)
3. Import using SQLite transaction batches
4. Rebuild indexes and triggers

### From Neo4j
1. Export relationships as CSV
2. Transform to transfer_stats table format
3. Calculate aggregated values during import
4. Use recursive CTEs for graph queries

## Performance Optimizations

1. **Batch Inserts**: Use transactions for bulk operations
2. **Prepared Statements**: Compile once, execute many
3. **Index Strategy**: Cover common query patterns
4. **Denormalization**: Pre-calculate stats for fast queries
5. **Partitioning**: Archive old transfers by month/year

## Backup and Recovery

### Backup Strategy
```bash
# Online backup
sqlite3 analysis.db ".backup backup.db"

# With compression
sqlite3 analysis.db ".dump" | gzip > backup.sql.gz
```

### Recovery
```bash
# From backup file
cp backup.db analysis.db

# From dump
gunzip -c backup.sql.gz | sqlite3 analysis.db
```

## Storage Estimates

For 1 million transfers:
- accounts: ~10 MB (50K unique addresses)
- transfers: ~200 MB
- transfer_stats: ~50 MB
- Indexes: ~100 MB
- **Total: ~400 MB**

This is significantly smaller than PostgreSQL + Neo4j equivalent.