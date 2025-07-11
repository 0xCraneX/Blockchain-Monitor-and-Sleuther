# SQLite Schema Design for Polkadot Analysis Tool

## 1. Complete Schema Analysis from FollowTheDot

### Current PostgreSQL Schema Structure:

#### Core Tables:
1. **ftd_account** - Base account registry
   - address (VARCHAR(64), PK)
   - created_at, updated_at (timestamps)
   - Index: GIN trigram on address for fuzzy search

2. **ftd_block** - Blockchain block data
   - hash (VARCHAR(64), PK)
   - number (BIGINT)
   - timestamp (BIGINT)
   - parent_hash (VARCHAR(66))
   - created_at
   - Indexes: number, timestamp

3. **ftd_transfer** - Individual transfer transactions
   - id (SERIAL, PK)
   - block_hash, block_number, timestamp
   - extrinsic_index, extrinsic_event_index, event_index
   - from_address, to_address (VARCHAR(64))
   - amount (VARCHAR(128) - for handling large numbers)
   - created_at
   - Unique constraint on (block_hash, extrinsic_index, event_index)
   - FKs to ftd_block and ftd_account
   - Indexes: block_hash, block_number, from_address, to_address, (from_address, to_address)

4. **ftd_transfer_volume** - Aggregated transfer statistics
   - from_address, to_address (composite PK)
   - volume (VARCHAR(128))
   - count (INTEGER)
   - created_at, updated_at
   - FKs to ftd_account
   - Indexes: from_address, to_address

5. **ftd_identity** - On-chain identity information
   - address (VARCHAR(64), PK, FK to ftd_account)
   - display, legal, web (VARCHAR(256))
   - riot, email, twitter (VARCHAR(128))
   - is_confirmed, is_invalid (BOOLEAN)
   - created_at, updated_at
   - Indexes on all identity fields

6. **ftd_sub_identity** - Sub-account relationships
   - address (VARCHAR(64), PK, FK to ftd_account)
   - super_address (VARCHAR(64), FK to ftd_account)
   - sub_display (VARCHAR(256))
   - created_at, updated_at
   - Indexes: super_address, sub_display

7. **ftd_subscan_account** - External data from Subscan
   - id (SERIAL, PK)
   - address (VARCHAR(64), UNIQUE)
   - display, account_index, account_display (VARCHAR(2048))
   - account_identity, parent_identity (BOOLEAN)
   - parent_address, parent_display, parent_sub_symbol
   - merkle_science_* fields for risk analysis
   - created_at, updated_at

#### State Tables:
8. **ftd_transfer_volume_updater_state** - Processing state
9. **ftd_identity_transfer_updater_state** - Identity update tracking

### Neo4j Graph Schema:
- **Account** nodes with address property
- **TRANSFER** relationships with volume and count properties
- **SUB_OF** relationships for sub-accounts

## 2. Simplified SQLite Schema Design

### Design Principles:
1. Merge graph relationships into relational tables
2. Optimize for single-user desktop application
3. Use TEXT for all large numbers (JavaScript BigInt compatibility)
4. Denormalize where it improves query performance
5. Focus on address analysis and connection tracking

### Proposed SQLite Schema:

```sql
-- Core account table with denormalized identity data
CREATE TABLE accounts (
    address TEXT PRIMARY KEY,
    -- Identity fields (denormalized from ftd_identity)
    display_name TEXT,
    legal_name TEXT,
    web TEXT,
    email TEXT,
    twitter TEXT,
    riot TEXT,
    is_verified INTEGER DEFAULT 0, -- Boolean: verified identity
    -- Sub-account relationship
    parent_address TEXT,
    sub_display TEXT,
    -- Risk/tag data from external sources
    risk_level TEXT, -- 'high', 'medium', 'low', 'unknown'
    tags TEXT, -- JSON array of tags
    notes TEXT, -- User notes
    -- Metadata
    first_seen_block INTEGER,
    last_seen_block INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (parent_address) REFERENCES accounts(address)
);

-- Simplified transfers table (essential fields only)
CREATE TABLE transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_number INTEGER NOT NULL,
    block_timestamp INTEGER NOT NULL,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    amount TEXT NOT NULL, -- Store as string for BigInt
    -- Denormalized account data for faster queries
    from_display TEXT,
    to_display TEXT,
    -- Transaction context
    transaction_hash TEXT,
    event_index INTEGER,
    FOREIGN KEY (from_address) REFERENCES accounts(address),
    FOREIGN KEY (to_address) REFERENCES accounts(address)
);

-- Pre-calculated transfer statistics
CREATE TABLE transfer_stats (
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    total_amount TEXT NOT NULL, -- Sum of all transfers
    transfer_count INTEGER NOT NULL,
    first_transfer_block INTEGER,
    last_transfer_block INTEGER,
    avg_amount TEXT, -- Average transfer amount
    PRIMARY KEY (from_address, to_address),
    FOREIGN KEY (from_address) REFERENCES accounts(address),
    FOREIGN KEY (to_address) REFERENCES accounts(address)
);

-- Account statistics (denormalized for performance)
CREATE TABLE account_stats (
    address TEXT PRIMARY KEY,
    total_received TEXT DEFAULT '0',
    total_sent TEXT DEFAULT '0',
    receive_count INTEGER DEFAULT 0,
    send_count INTEGER DEFAULT 0,
    unique_senders INTEGER DEFAULT 0,
    unique_receivers INTEGER DEFAULT 0,
    first_activity_block INTEGER,
    last_activity_block INTEGER,
    -- Risk indicators
    suspicious_pattern_count INTEGER DEFAULT 0,
    high_risk_interaction_count INTEGER DEFAULT 0,
    FOREIGN KEY (address) REFERENCES accounts(address)
);

-- Connection analysis cache
CREATE TABLE connections (
    address1 TEXT NOT NULL,
    address2 TEXT NOT NULL,
    connection_type TEXT NOT NULL, -- 'direct', '1-hop', '2-hop'
    total_volume TEXT,
    interaction_count INTEGER,
    common_connections INTEGER, -- Number of shared connections
    risk_score REAL, -- Calculated risk score
    PRIMARY KEY (address1, address2, connection_type)
);

-- Suspicious patterns detection
CREATE TABLE suspicious_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_type TEXT NOT NULL, -- 'rapid_dispersion', 'circular_flow', etc.
    addresses TEXT NOT NULL, -- JSON array of involved addresses
    detection_timestamp INTEGER DEFAULT (strftime('%s', 'now')),
    confidence_score REAL,
    details TEXT -- JSON object with pattern-specific data
);

-- User watchlist
CREATE TABLE watchlist (
    address TEXT PRIMARY KEY,
    label TEXT,
    category TEXT, -- 'suspect', 'victim', 'exchange', etc.
    added_at INTEGER DEFAULT (strftime('%s', 'now')),
    notes TEXT,
    alert_on_activity INTEGER DEFAULT 1,
    FOREIGN KEY (address) REFERENCES accounts(address)
);

-- Analysis sessions/investigations
CREATE TABLE investigations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    root_addresses TEXT, -- JSON array of starting addresses
    findings TEXT, -- JSON object with investigation results
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Sync state tracking
CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_processed_block INTEGER DEFAULT 0,
    last_sync_timestamp INTEGER,
    is_syncing INTEGER DEFAULT 0
);

-- Essential indexes for performance
CREATE INDEX idx_accounts_parent ON accounts(parent_address);
CREATE INDEX idx_accounts_risk ON accounts(risk_level);
CREATE INDEX idx_transfers_from ON transfers(from_address, block_number);
CREATE INDEX idx_transfers_to ON transfers(to_address, block_number);
CREATE INDEX idx_transfers_block ON transfers(block_number);
CREATE INDEX idx_transfer_stats_from ON transfer_stats(from_address);
CREATE INDEX idx_transfer_stats_to ON transfer_stats(to_address);
CREATE INDEX idx_connections_addr1 ON connections(address1);
CREATE INDEX idx_connections_addr2 ON connections(address2);
CREATE INDEX idx_watchlist_category ON watchlist(category);

-- Full-text search indexes
CREATE VIRTUAL TABLE accounts_fts USING fts5(
    address, display_name, legal_name, notes,
    content=accounts
);

-- Triggers for maintaining FTS
CREATE TRIGGER accounts_fts_insert AFTER INSERT ON accounts BEGIN
    INSERT INTO accounts_fts(address, display_name, legal_name, notes)
    VALUES (new.address, new.display_name, new.legal_name, new.notes);
END;

CREATE TRIGGER accounts_fts_update AFTER UPDATE ON accounts BEGIN
    UPDATE accounts_fts SET 
        display_name = new.display_name,
        legal_name = new.legal_name,
        notes = new.notes
    WHERE address = new.address;
END;

CREATE TRIGGER accounts_fts_delete AFTER DELETE ON accounts BEGIN
    DELETE FROM accounts_fts WHERE address = old.address;
END;

-- Update timestamp triggers
CREATE TRIGGER accounts_update_timestamp AFTER UPDATE ON accounts BEGIN
    UPDATE accounts SET updated_at = strftime('%s', 'now') WHERE address = new.address;
END;
```

## 3. Migration Strategy from PostgreSQL to SQLite

### Data Type Conversions:
- `VARCHAR(n)` → `TEXT`
- `BIGINT` → `INTEGER` or `TEXT` (for amounts)
- `SERIAL` → `INTEGER PRIMARY KEY AUTOINCREMENT`
- `TIMESTAMP` → `INTEGER` (Unix timestamp)
- `BOOLEAN` → `INTEGER` (0/1)

### Key Adaptations:
1. **No foreign key constraints by default** - Enable with `PRAGMA foreign_keys = ON`
2. **Simplified indexing** - No GIN/trigram indexes, use FTS5 for text search
3. **Denormalization** - Merge identity tables into accounts
4. **Pre-calculated statistics** - Update via triggers or batch jobs
5. **JSON storage** - Store complex data as JSON text

## 4. Common Query Patterns

### Address Analysis Queries:

```sql
-- Get account overview with stats
SELECT a.*, s.*
FROM accounts a
LEFT JOIN account_stats s ON a.address = s.address
WHERE a.address = ?;

-- Find connected addresses
SELECT 
    CASE WHEN from_address = ? THEN to_address ELSE from_address END as connected_address,
    SUM(CAST(total_amount AS INTEGER)) as total_volume,
    SUM(transfer_count) as total_transfers
FROM transfer_stats
WHERE from_address = ? OR to_address = ?
GROUP BY connected_address
ORDER BY total_volume DESC;

-- Detect suspicious patterns
SELECT DISTINCT t1.from_address, t2.to_address
FROM transfers t1
JOIN transfers t2 ON t1.to_address = t2.from_address
WHERE t1.from_address = ?
  AND t2.block_number - t1.block_number < 100
  AND t1.to_address != t2.to_address;

-- Search accounts by name
SELECT address, display_name, legal_name, risk_level
FROM accounts_fts
WHERE accounts_fts MATCH ?
ORDER BY rank;
```

## 5. Performance Optimizations

### Design Decisions:
1. **Denormalized account data** in transfers for faster queries
2. **Pre-calculated statistics** to avoid expensive aggregations
3. **Connection cache** for graph-like queries
4. **FTS5 virtual table** for efficient text search
5. **Minimal indexes** focused on common access patterns

### Data Retention:
- Keep detailed transfers for recent blocks (e.g., last 1M blocks)
- Aggregate older data into statistics tables
- Archive investigation results separately

## 6. JavaScript Implementation Considerations

### BigInt Handling:
```javascript
// Store as TEXT in SQLite, convert in JavaScript
const amount = BigInt(row.amount);
const totalVolume = BigInt(row.total_amount);

// For aggregations
const sum = amounts.reduce((acc, val) => acc + BigInt(val), 0n);
```

### Query Builders:
```javascript
// Use parameterized queries
const getAccount = db.prepare(`
    SELECT * FROM accounts WHERE address = ?
`);

// Batch operations
const insertTransfers = db.prepare(`
    INSERT INTO transfers (block_number, from_address, to_address, amount)
    VALUES (?, ?, ?, ?)
`);
const insertMany = db.transaction((transfers) => {
    for (const transfer of transfers) {
        insertTransfers.run(transfer);
    }
});
```

### Connection Management:
```javascript
// Use WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Optimize for desktop application
db.pragma('cache_size = -64000'); // 64MB cache
db.pragma('temp_store = MEMORY');
```

## 7. Essential vs Nice-to-Have Tables

### Essential (Core Functionality):
- `accounts` - Base requirement
- `transfers` - Transaction history
- `transfer_stats` - Performance optimization
- `account_stats` - Quick lookups
- `watchlist` - User tracking

### Nice-to-Have (Enhanced Features):
- `connections` - Advanced analysis
- `suspicious_patterns` - Automated detection
- `investigations` - Case management
- `accounts_fts` - Search functionality

### Can Be Omitted Initially:
- Block data (just store block numbers)
- External enrichment data (Subscan, etc.)
- Detailed identity verification status

This schema provides a solid foundation for a JavaScript/SQLite implementation while maintaining the core functionality of the original system with significant simplifications for desktop use.