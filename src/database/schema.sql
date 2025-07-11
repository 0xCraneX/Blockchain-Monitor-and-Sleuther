-- Polkadot Analysis Tool Database Schema
-- SQLite implementation adapted from FollowTheDot's PostgreSQL + Neo4j architecture

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT NOT NULL UNIQUE,
    public_key TEXT,
    identity_display TEXT,
    identity_legal TEXT,
    identity_web TEXT,
    identity_email TEXT,
    identity_twitter TEXT,
    identity_riot TEXT,
    identity_verified BOOLEAN DEFAULT FALSE,
    balance TEXT,
    total_transfers_in INTEGER DEFAULT 0,
    total_transfers_out INTEGER DEFAULT 0,
    volume_in TEXT DEFAULT '0',
    volume_out TEXT DEFAULT '0',
    first_seen_block INTEGER,
    last_seen_block INTEGER,
    risk_score REAL DEFAULT 0.0,
    tags TEXT, -- JSON array of tags
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transfers table
CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL UNIQUE,
    block_number INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    value TEXT NOT NULL,
    fee TEXT,
    success BOOLEAN DEFAULT TRUE,
    method TEXT,
    section TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_address) REFERENCES accounts(address),
    FOREIGN KEY (to_address) REFERENCES accounts(address)
);

-- Account relationships table (for graph building)
CREATE TABLE IF NOT EXISTS account_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    transfer_count INTEGER DEFAULT 0,
    total_volume TEXT DEFAULT '0',
    first_transfer_block INTEGER,
    last_transfer_block INTEGER,
    relationship_type TEXT, -- 'direct', 'indirect', etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_address) REFERENCES accounts(address),
    FOREIGN KEY (to_address) REFERENCES accounts(address),
    UNIQUE(from_address, to_address)
);

-- Patterns table (for suspicious activity detection)
CREATE TABLE IF NOT EXISTS patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT NOT NULL,
    pattern_type TEXT NOT NULL, -- 'rapid_movement', 'circular_flow', 'mixing', etc.
    confidence REAL NOT NULL,
    details TEXT, -- JSON with pattern-specific details
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed BOOLEAN DEFAULT FALSE,
    false_positive BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (address) REFERENCES accounts(address)
);

-- Statistics table (for performance tracking)
CREATE TABLE IF NOT EXISTS statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name TEXT NOT NULL,
    metric_value TEXT NOT NULL,
    metric_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(metric_name, metric_date)
);

-- Search history table
CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    query_type TEXT NOT NULL, -- 'address', 'identity', 'pattern'
    results_count INTEGER DEFAULT 0,
    user_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Blockchain sync status
CREATE TABLE IF NOT EXISTS sync_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id TEXT NOT NULL,
    last_processed_block INTEGER NOT NULL,
    last_finalized_block INTEGER,
    sync_started_at TIMESTAMP,
    sync_completed_at TIMESTAMP,
    status TEXT DEFAULT 'idle', -- 'syncing', 'idle', 'error'
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chain_id)
);

-- Watchlist table
CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT NOT NULL,
    label TEXT,
    category TEXT, -- 'suspicious', 'monitored', 'whitelist', etc.
    reason TEXT,
    added_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (address) REFERENCES accounts(address),
    UNIQUE(address)
);

-- Investigation sessions
CREATE TABLE IF NOT EXISTS investigations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    title TEXT,
    description TEXT,
    addresses TEXT, -- JSON array of addresses
    filters TEXT, -- JSON object with applied filters
    graph_state TEXT, -- JSON object with graph configuration
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounts_address ON accounts(address);
CREATE INDEX IF NOT EXISTS idx_accounts_identity ON accounts(identity_display);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_address);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_address);
CREATE INDEX IF NOT EXISTS idx_transfers_block ON transfers(block_number);
CREATE INDEX IF NOT EXISTS idx_transfers_timestamp ON transfers(timestamp);
CREATE INDEX IF NOT EXISTS idx_relationships_from ON account_relationships(from_address);
CREATE INDEX IF NOT EXISTS idx_relationships_to ON account_relationships(to_address);
CREATE INDEX IF NOT EXISTS idx_patterns_address ON patterns(address);
CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(pattern_type);

-- Create views for common queries
CREATE VIEW IF NOT EXISTS account_summary AS
SELECT 
    a.address,
    a.identity_display,
    a.balance,
    a.total_transfers_in + a.total_transfers_out as total_transfers,
    a.risk_score,
    COUNT(DISTINCT r1.to_address) as outgoing_connections,
    COUNT(DISTINCT r2.from_address) as incoming_connections
FROM accounts a
LEFT JOIN account_relationships r1 ON a.address = r1.from_address
LEFT JOIN account_relationships r2 ON a.address = r2.to_address
GROUP BY a.address;

-- Trigger to update account statistics on new transfers
CREATE TRIGGER IF NOT EXISTS update_account_stats_on_transfer
AFTER INSERT ON transfers
BEGIN
    -- Update sender account
    UPDATE accounts 
    SET 
        total_transfers_out = total_transfers_out + 1,
        volume_out = CAST(CAST(volume_out AS INTEGER) + CAST(NEW.value AS INTEGER) AS TEXT),
        last_seen_block = NEW.block_number,
        updated_at = CURRENT_TIMESTAMP
    WHERE address = NEW.from_address;
    
    -- Update receiver account
    UPDATE accounts 
    SET 
        total_transfers_in = total_transfers_in + 1,
        volume_in = CAST(CAST(volume_in AS INTEGER) + CAST(NEW.value AS INTEGER) AS TEXT),
        last_seen_block = NEW.block_number,
        updated_at = CURRENT_TIMESTAMP
    WHERE address = NEW.to_address;
    
    -- Update or insert relationship
    INSERT INTO account_relationships (from_address, to_address, transfer_count, total_volume, first_transfer_block, last_transfer_block)
    VALUES (NEW.from_address, NEW.to_address, 1, NEW.value, NEW.block_number, NEW.block_number)
    ON CONFLICT(from_address, to_address) DO UPDATE SET
        transfer_count = transfer_count + 1,
        total_volume = CAST(CAST(total_volume AS INTEGER) + CAST(NEW.value AS INTEGER) AS TEXT),
        last_transfer_block = NEW.block_number,
        updated_at = CURRENT_TIMESTAMP;
END;