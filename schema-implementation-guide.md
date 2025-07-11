# SQLite Schema Implementation Guide

## Entity Relationship Diagram (Text Format)

```
┌─────────────────┐
│    accounts     │
├─────────────────┤
│ address (PK)    │
│ display_name    │
│ legal_name      │
│ web             │
│ email           │
│ twitter         │
│ riot            │
│ is_verified     │
│ parent_address  │◄──┐
│ sub_display     │   │ (self-reference)
│ risk_level      │   │
│ tags            │   │
│ notes           │   │
│ first_seen_block│   │
│ last_seen_block │   │
│ created_at      │   │
│ updated_at      │   │
└─────────────────┘───┘
         │
         │ 1:N
         ▼
┌─────────────────┐     ┌──────────────────┐
│   transfers     │     │  transfer_stats  │
├─────────────────┤     ├──────────────────┤
│ id (PK)         │     │ from_address(PK) │◄─┐
│ block_number    │     │ to_address (PK)  │◄─┤
│ block_timestamp │     │ total_amount     │  │
│ from_address ───┼────►│ transfer_count   │  │
│ to_address   ───┼────►│ first_transfer   │  │
│ amount          │     │ last_transfer    │  │
│ from_display    │     │ avg_amount       │  │
│ to_display      │     └──────────────────┘  │
│ transaction_hash│                            │
│ event_index     │     ┌──────────────────┐  │
└─────────────────┘     │  account_stats   │  │
                        ├──────────────────┤  │
                        │ address (PK) ────┼──┘
                        │ total_received   │
                        │ total_sent       │
                        │ receive_count    │
                        │ send_count       │
                        │ unique_senders   │
                        │ unique_receivers │
                        │ first_activity   │
                        │ last_activity    │
                        │ suspicious_count │
                        │ high_risk_count  │
                        └──────────────────┘

┌─────────────────┐     ┌──────────────────┐
│   watchlist     │     │   connections    │
├─────────────────┤     ├──────────────────┤
│ address (PK) ───┼────►│ address1 (PK)    │
│ label           │     │ address2 (PK)    │
│ category        │     │ connection_type  │
│ added_at        │     │ total_volume     │
│ notes           │     │ interaction_count│
│ alert_on_activity     │ common_connections│
└─────────────────┘     │ risk_score       │
                        └──────────────────┘

┌─────────────────────┐  ┌────────────────┐
│ suspicious_patterns │  │ investigations │
├─────────────────────┤  ├────────────────┤
│ id (PK)             │  │ id (PK)        │
│ pattern_type        │  │ name           │
│ addresses (JSON)    │  │ description    │
│ detection_timestamp │  │ root_addresses │
│ confidence_score    │  │ findings       │
│ details (JSON)      │  │ created_at     │
└─────────────────────┘  │ updated_at     │
                         └────────────────┘

┌─────────────────┐      ┌─────────────────┐
│   sync_state    │      │  accounts_fts   │
├─────────────────┤      ├─────────────────┤
│ id (PK)         │      │ address         │
│ last_block      │      │ display_name    │
│ last_sync       │      │ legal_name      │
│ is_syncing      │      │ notes           │
└─────────────────┘      └─────────────────┘
```

## Implementation Phases

### Phase 1: Core Foundation (Week 1)
1. **Basic Tables**:
   - accounts
   - transfers
   - sync_state
   
2. **Core Functionality**:
   - Address import/creation
   - Transfer recording
   - Basic queries

### Phase 2: Analytics Layer (Week 2)
1. **Statistics Tables**:
   - transfer_stats
   - account_stats
   
2. **Automated Updates**:
   - Triggers for stats calculation
   - Batch update procedures

### Phase 3: User Features (Week 3)
1. **User Tables**:
   - watchlist
   - investigations
   
2. **Search Capability**:
   - accounts_fts
   - Search interface

### Phase 4: Advanced Analysis (Week 4)
1. **Pattern Detection**:
   - connections
   - suspicious_patterns
   
2. **Risk Scoring**:
   - Algorithm implementation
   - Real-time updates

## JavaScript Implementation Examples

### 1. Database Setup
```javascript
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';

class PolkadotDB {
  constructor(dbPath = './polkadot-analysis.db') {
    this.db = new Database(dbPath);
    this.setupPragmas();
    this.initializeSchema();
  }

  setupPragmas() {
    // Performance optimizations
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('cache_size = -64000'); // 64MB
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 268435456'); // 256MB
    this.db.pragma('synchronous = NORMAL');
  }

  initializeSchema() {
    const schema = readFileSync('./schema.sql', 'utf8');
    this.db.exec(schema);
  }
}
```

### 2. Account Management
```javascript
class AccountManager {
  constructor(db) {
    this.db = db;
    this.prepareStatements();
  }

  prepareStatements() {
    this.stmts = {
      insertAccount: this.db.prepare(`
        INSERT OR IGNORE INTO accounts (address, display_name, risk_level)
        VALUES (?, ?, ?)
      `),
      
      updateAccount: this.db.prepare(`
        UPDATE accounts SET
          display_name = ?,
          legal_name = ?,
          web = ?,
          email = ?,
          twitter = ?,
          updated_at = strftime('%s', 'now')
        WHERE address = ?
      `),
      
      getAccount: this.db.prepare(`
        SELECT a.*, s.*
        FROM accounts a
        LEFT JOIN account_stats s ON a.address = s.address
        WHERE a.address = ?
      `),
      
      searchAccounts: this.db.prepare(`
        SELECT address, display_name, legal_name, risk_level
        FROM accounts_fts
        WHERE accounts_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `)
    };
  }

  createAccount(address, displayName = null, riskLevel = 'unknown') {
    return this.stmts.insertAccount.run(address, displayName, riskLevel);
  }

  findConnections(address, maxHops = 2) {
    // Graph-like query using recursive CTE
    const query = `
      WITH RECURSIVE connections AS (
        -- Direct connections (1-hop)
        SELECT 
          CASE WHEN from_address = ? THEN to_address ELSE from_address END as address,
          1 as hop_count,
          total_amount,
          transfer_count
        FROM transfer_stats
        WHERE from_address = ? OR to_address = ?
        
        UNION
        
        -- Indirect connections (2+ hops)
        SELECT 
          CASE WHEN ts.from_address = c.address THEN ts.to_address ELSE ts.from_address END as address,
          c.hop_count + 1,
          ts.total_amount,
          ts.transfer_count
        FROM connections c
        JOIN transfer_stats ts ON (ts.from_address = c.address OR ts.to_address = c.address)
        WHERE c.hop_count < ?
          AND address != ?
      )
      SELECT DISTINCT 
        c.address,
        MIN(c.hop_count) as min_hops,
        a.display_name,
        a.risk_level,
        SUM(CAST(c.total_amount AS INTEGER)) as total_volume
      FROM connections c
      LEFT JOIN accounts a ON c.address = a.address
      GROUP BY c.address
      ORDER BY min_hops, total_volume DESC
    `;
    
    return this.db.prepare(query).all(address, address, address, maxHops, address);
  }
}
```

### 3. Transfer Processing
```javascript
class TransferProcessor {
  constructor(db) {
    this.db = db;
    this.prepareStatements();
  }

  prepareStatements() {
    this.stmts = {
      insertTransfer: this.db.prepare(`
        INSERT INTO transfers (
          block_number, block_timestamp, from_address, to_address, 
          amount, from_display, to_display, transaction_hash, event_index
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      
      updateStats: this.db.prepare(`
        INSERT INTO transfer_stats (
          from_address, to_address, total_amount, transfer_count,
          first_transfer_block, last_transfer_block
        ) VALUES (?, ?, ?, 1, ?, ?)
        ON CONFLICT(from_address, to_address) DO UPDATE SET
          total_amount = CAST(CAST(total_amount AS INTEGER) + CAST(excluded.total_amount AS INTEGER) AS TEXT),
          transfer_count = transfer_count + 1,
          last_transfer_block = excluded.last_transfer_block
      `),
      
      updateAccountStats: this.db.prepare(`
        INSERT INTO account_stats (address, total_sent, send_count, first_activity_block)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(address) DO UPDATE SET
          total_sent = CAST(CAST(total_sent AS INTEGER) + CAST(excluded.total_sent AS INTEGER) AS TEXT),
          send_count = send_count + 1,
          last_activity_block = ?
      `)
    };
  }

  processTransferBatch(transfers) {
    const insertMany = this.db.transaction((transfers) => {
      for (const transfer of transfers) {
        // Ensure accounts exist
        this.ensureAccount(transfer.from_address);
        this.ensureAccount(transfer.to_address);
        
        // Insert transfer
        this.stmts.insertTransfer.run(
          transfer.block_number,
          transfer.block_timestamp,
          transfer.from_address,
          transfer.to_address,
          transfer.amount.toString(),
          transfer.from_display || null,
          transfer.to_display || null,
          transfer.transaction_hash,
          transfer.event_index
        );
        
        // Update statistics
        this.updateTransferStats(transfer);
        this.updateAccountStatistics(transfer);
      }
    });
    
    insertMany(transfers);
  }

  updateTransferStats(transfer) {
    this.stmts.updateStats.run(
      transfer.from_address,
      transfer.to_address,
      transfer.amount.toString(),
      transfer.block_number,
      transfer.block_number
    );
  }
}
```

### 4. Pattern Detection
```javascript
class PatternDetector {
  constructor(db) {
    this.db = db;
  }

  detectRapidDispersion(address, timeWindow = 100, minRecipients = 5) {
    const query = `
      WITH dispersions AS (
        SELECT 
          t1.from_address,
          t1.block_number as start_block,
          COUNT(DISTINCT t2.to_address) as recipient_count,
          SUM(CAST(t2.amount AS INTEGER)) as total_dispersed,
          GROUP_CONCAT(DISTINCT t2.to_address) as recipients
        FROM transfers t1
        JOIN transfers t2 ON t1.to_address = t2.from_address
        WHERE t1.from_address = ?
          AND t2.block_number BETWEEN t1.block_number AND t1.block_number + ?
          AND t1.to_address != t2.to_address
        GROUP BY t1.from_address, t1.block_number
        HAVING recipient_count >= ?
      )
      INSERT INTO suspicious_patterns (pattern_type, addresses, confidence_score, details)
      SELECT 
        'rapid_dispersion',
        json_array(from_address, recipients),
        MIN(0.5 + (recipient_count / 20.0), 1.0),
        json_object(
          'start_block', start_block,
          'recipient_count', recipient_count,
          'total_dispersed', total_dispersed
        )
      FROM dispersions
    `;
    
    return this.db.prepare(query).run(address, timeWindow, minRecipients);
  }

  detectCircularFlow(address, maxHops = 3) {
    // Detect if funds eventually return to the original address
    const query = `
      WITH RECURSIVE flow AS (
        SELECT 
          from_address,
          to_address,
          amount,
          block_number,
          from_address || '->' || to_address as path,
          1 as hop_count
        FROM transfers
        WHERE from_address = ?
        
        UNION ALL
        
        SELECT 
          t.from_address,
          t.to_address,
          t.amount,
          t.block_number,
          f.path || '->' || t.to_address,
          f.hop_count + 1
        FROM flow f
        JOIN transfers t ON f.to_address = t.from_address
        WHERE f.hop_count < ?
          AND t.block_number > f.block_number
          AND f.path NOT LIKE '%' || t.to_address || '%'
      )
      SELECT * FROM flow
      WHERE to_address = ?
        AND hop_count > 1
    `;
    
    return this.db.prepare(query).all(address, maxHops, address);
  }
}
```

### 5. Risk Scoring
```javascript
class RiskAnalyzer {
  constructor(db) {
    this.db = db;
  }

  calculateAddressRisk(address) {
    const factors = {
      highRiskConnections: this.getHighRiskConnections(address),
      suspiciousPatterns: this.getSuspiciousPatterns(address),
      velocityScore: this.getVelocityScore(address),
      networkCentrality: this.getNetworkCentrality(address)
    };
    
    // Weighted risk calculation
    const riskScore = 
      factors.highRiskConnections * 0.4 +
      factors.suspiciousPatterns * 0.3 +
      factors.velocityScore * 0.2 +
      factors.networkCentrality * 0.1;
    
    // Update account risk level
    const riskLevel = 
      riskScore > 0.7 ? 'high' :
      riskScore > 0.4 ? 'medium' : 
      'low';
    
    this.updateAccountRisk(address, riskLevel, riskScore);
    
    return { riskScore, riskLevel, factors };
  }

  getHighRiskConnections(address) {
    const query = `
      SELECT COUNT(*) as count, SUM(CAST(total_amount AS INTEGER)) as volume
      FROM transfer_stats ts
      JOIN accounts a ON (
        CASE WHEN ts.from_address = ? THEN ts.to_address ELSE ts.from_address END = a.address
      )
      WHERE (ts.from_address = ? OR ts.to_address = ?)
        AND a.risk_level = 'high'
    `;
    
    const result = this.db.prepare(query).get(address, address, address);
    // Normalize to 0-1 scale
    return Math.min(result.count / 10, 1.0);
  }
}
```

## Query Optimization Tips

### 1. Index Usage
```sql
-- Verify index usage
EXPLAIN QUERY PLAN
SELECT * FROM transfers
WHERE from_address = ? AND block_number > ?;

-- Create covering indexes for common queries
CREATE INDEX idx_transfers_covering ON transfers(
  from_address, block_number, to_address, amount
);
```

### 2. Statistics Maintenance
```javascript
// Regular statistics update job
class MaintenanceJob {
  async updateStatistics() {
    // Vacuum and analyze
    this.db.exec('VACUUM');
    this.db.exec('ANALYZE');
    
    // Update aggregate tables
    this.updateTransferVolumes();
    this.updateAccountStatistics();
    this.detectNewPatterns();
  }
}
```

### 3. Memory Management
```javascript
// For large result sets
const stmt = db.prepare('SELECT * FROM transfers WHERE block_number > ?');
const iterator = stmt.iterate(lastBlock);

for (const row of iterator) {
  // Process one row at a time
  processTransfer(row);
}
```

## Performance Benchmarks

Expected performance on modern desktop (SSD, 16GB RAM):
- Account lookup: < 1ms
- Transfer insertion: ~10,000/second (batch)
- Connection search (2-hop): < 100ms
- Pattern detection: < 500ms per address
- Full-text search: < 50ms

## Data Size Estimates

For 1 million transfers:
- accounts: ~100,000 rows × 1KB = 100MB
- transfers: 1,000,000 rows × 200B = 200MB
- transfer_stats: ~500,000 rows × 100B = 50MB
- account_stats: ~100,000 rows × 200B = 20MB
- Total database size: ~400-500MB

With indexes and WAL: ~1GB total disk usage