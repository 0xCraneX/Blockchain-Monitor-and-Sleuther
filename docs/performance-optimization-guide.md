# Performance Optimization Guide for SQLite Implementation

## Identified Bottlenecks and Solutions

### 1. Large Number Handling (BigInt)

**Challenge**: Polkadot uses very large numbers (up to 128-bit) for token amounts.

**Solutions**:
```javascript
// Store as TEXT in SQLite
CREATE TABLE transfers (
  amount TEXT NOT NULL -- Store as string
);

// JavaScript handling
class AmountHandler {
  // Convert for storage
  static serialize(amount) {
    return amount.toString();
  }
  
  // Convert for calculations
  static deserialize(amountStr) {
    return BigInt(amountStr);
  }
  
  // Aggregate operations
  static sum(amounts) {
    return amounts.reduce((acc, val) => acc + BigInt(val), 0n);
  }
  
  // Format for display
  static format(amount, decimals = 10) {
    const divisor = BigInt(10 ** decimals);
    const whole = amount / divisor;
    const fraction = amount % divisor;
    return `${whole}.${fraction.toString().padStart(decimals, '0')}`;
  }
}
```

### 2. Graph Queries Without Neo4j

**Challenge**: Implementing multi-hop connection queries efficiently.

**Solutions**:
```sql
-- Use recursive CTEs for graph traversal
CREATE TEMP TABLE IF NOT EXISTS connection_cache AS
WITH RECURSIVE paths AS (
  -- Base case: direct connections
  SELECT 
    from_address as start,
    to_address as end,
    1 as depth,
    from_address || '->' || to_address as path,
    total_amount as volume
  FROM transfer_stats
  WHERE from_address = ?
  
  UNION ALL
  
  -- Recursive case: extend paths
  SELECT 
    p.start,
    ts.to_address as end,
    p.depth + 1,
    p.path || '->' || ts.to_address,
    p.volume + ts.total_amount
  FROM paths p
  JOIN transfer_stats ts ON p.end = ts.from_address
  WHERE p.depth < 3
    AND p.path NOT LIKE '%' || ts.to_address || '%' -- Avoid cycles
)
SELECT * FROM paths;

-- Create materialized view for frequent queries
CREATE TABLE connection_summary AS
SELECT 
  start,
  end,
  MIN(depth) as min_depth,
  COUNT(*) as path_count,
  MAX(volume) as max_volume
FROM connection_cache
GROUP BY start, end;
```

### 3. Real-time Pattern Detection

**Challenge**: Detecting suspicious patterns as data streams in.

**Solutions**:
```javascript
class StreamingPatternDetector {
  constructor(db) {
    this.db = db;
    this.windowSize = 1000; // blocks
    this.cache = new Map();
  }
  
  async processTransfer(transfer) {
    // Update sliding window cache
    this.updateCache(transfer);
    
    // Check patterns asynchronously
    setImmediate(() => {
      this.checkRapidDispersion(transfer.from_address);
      this.checkLayering(transfer);
      this.checkVelocity(transfer.from_address);
    });
  }
  
  updateCache(transfer) {
    const key = transfer.from_address;
    if (!this.cache.has(key)) {
      this.cache.set(key, []);
    }
    
    const transfers = this.cache.get(key);
    transfers.push(transfer);
    
    // Maintain window size
    const cutoff = transfer.block_number - this.windowSize;
    this.cache.set(key, transfers.filter(t => t.block_number > cutoff));
  }
  
  checkRapidDispersion(address) {
    const transfers = this.cache.get(address) || [];
    const recentBlock = transfers[transfers.length - 1]?.block_number || 0;
    
    // Group by time windows
    const windows = new Map();
    for (const t of transfers) {
      const window = Math.floor((recentBlock - t.block_number) / 10);
      if (!windows.has(window)) windows.set(window, new Set());
      windows.get(window).add(t.to_address);
    }
    
    // Detect rapid dispersion
    for (const [window, addresses] of windows) {
      if (addresses.size > 10) {
        this.flagPattern('rapid_dispersion', address, {
          window,
          recipient_count: addresses.size,
          addresses: Array.from(addresses)
        });
      }
    }
  }
}
```

### 4. Full-Text Search Performance

**Challenge**: Searching across multiple text fields efficiently.

**Solutions**:
```sql
-- Use FTS5 with custom tokenizer
CREATE VIRTUAL TABLE accounts_fts USING fts5(
  address, display_name, legal_name, notes,
  tokenize = 'porter unicode61',
  content = 'accounts',
  content_rowid = 'rowid'
);

-- Optimize search queries
CREATE VIEW search_view AS
SELECT 
  a.*,
  snippet(accounts_fts, 1, '<b>', '</b>', '...', 20) as display_snippet,
  snippet(accounts_fts, 2, '<b>', '</b>', '...', 20) as legal_snippet
FROM accounts a
JOIN accounts_fts ON a.rowid = accounts_fts.rowid;

-- Compound searches
SELECT * FROM search_view
WHERE accounts_fts MATCH 'display_name:john OR legal_name:doe'
ORDER BY rank;
```

### 5. Batch Processing Optimization

**Challenge**: Importing millions of transfers efficiently.

**Solutions**:
```javascript
class BatchProcessor {
  constructor(db) {
    this.db = db;
    this.batchSize = 10000;
    this.prepareBatchStatements();
  }
  
  prepareBatchStatements() {
    // Prepare all statements once
    this.stmts = {
      insertTransfer: this.db.prepare(`
        INSERT INTO transfers (block_number, from_address, to_address, amount)
        VALUES (?, ?, ?, ?)
      `),
      
      updateStats: this.db.prepare(`
        INSERT INTO transfer_stats (from_address, to_address, total_amount, transfer_count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(from_address, to_address) DO UPDATE SET
          total_amount = CAST(CAST(total_amount AS INTEGER) + CAST(excluded.total_amount AS INTEGER) AS TEXT),
          transfer_count = transfer_count + 1
      `)
    };
  }
  
  async processBatch(transfers) {
    // Disable autocommit for batch
    this.db.exec('BEGIN EXCLUSIVE');
    
    try {
      // Process in chunks
      for (let i = 0; i < transfers.length; i += this.batchSize) {
        const chunk = transfers.slice(i, i + this.batchSize);
        
        // Use transaction for atomic updates
        const insertMany = this.db.transaction((items) => {
          for (const item of items) {
            this.stmts.insertTransfer.run(
              item.block_number,
              item.from_address,
              item.to_address,
              item.amount
            );
            
            this.stmts.updateStats.run(
              item.from_address,
              item.to_address,
              item.amount
            );
          }
        });
        
        insertMany(chunk);
      }
      
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
```

### 6. Memory Management

**Challenge**: Handling large result sets without exhausting memory.

**Solutions**:
```javascript
class MemoryEfficientQuery {
  constructor(db) {
    this.db = db;
  }
  
  // Use iterators for large results
  *streamTransfers(fromBlock) {
    const stmt = this.db.prepare(`
      SELECT * FROM transfers
      WHERE block_number >= ?
      ORDER BY block_number
    `);
    
    const iterator = stmt.iterate(fromBlock);
    
    for (const row of iterator) {
      // Process one row at a time
      yield this.processRow(row);
    }
  }
  
  // Paginated queries
  async getTransfersPaginated(page = 1, pageSize = 1000) {
    const offset = (page - 1) * pageSize;
    
    const countStmt = this.db.prepare('SELECT COUNT(*) as total FROM transfers');
    const total = countStmt.get().total;
    
    const dataStmt = this.db.prepare(`
      SELECT * FROM transfers
      ORDER BY block_number DESC
      LIMIT ? OFFSET ?
    `);
    
    const data = dataStmt.all(pageSize, offset);
    
    return {
      data,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    };
  }
}
```

### 7. Index Strategy

**Challenge**: Balancing query performance with write speed.

**Solutions**:
```sql
-- Critical indexes only
CREATE INDEX idx_transfers_lookup ON transfers(from_address, to_address, block_number);
CREATE INDEX idx_accounts_search ON accounts(address, display_name);

-- Partial indexes for common queries
CREATE INDEX idx_high_risk ON accounts(address) WHERE risk_level = 'high';
CREATE INDEX idx_recent_transfers ON transfers(block_number) WHERE block_number > 10000000;

-- Drop indexes during bulk import
DROP INDEX IF EXISTS idx_transfers_lookup;
-- ... perform import ...
CREATE INDEX idx_transfers_lookup ON transfers(from_address, to_address, block_number);
```

### 8. Query Optimization Techniques

```javascript
class QueryOptimizer {
  constructor(db) {
    this.db = db;
    this.queryCache = new Map();
  }
  
  // Cache prepared statements
  getPreparedStatement(sql) {
    if (!this.queryCache.has(sql)) {
      this.queryCache.set(sql, this.db.prepare(sql));
    }
    return this.queryCache.get(sql);
  }
  
  // Use covering indexes
  getAccountSummary(address) {
    // This query uses only indexed columns
    const stmt = this.getPreparedStatement(`
      SELECT 
        a.address,
        a.display_name,
        a.risk_level,
        s.total_sent,
        s.total_received,
        s.last_activity_block
      FROM accounts a
      JOIN account_stats s ON a.address = s.address
      WHERE a.address = ?
    `);
    
    return stmt.get(address);
  }
  
  // Optimize JOIN order
  getHighValueConnections(minAmount) {
    const stmt = this.getPreparedStatement(`
      SELECT 
        ts.from_address,
        ts.to_address,
        ts.total_amount,
        a1.display_name as from_name,
        a2.display_name as to_name
      FROM transfer_stats ts
      INNER JOIN accounts a1 ON ts.from_address = a1.address
      INNER JOIN accounts a2 ON ts.to_address = a2.address
      WHERE CAST(ts.total_amount AS INTEGER) > ?
      ORDER BY CAST(ts.total_amount AS INTEGER) DESC
      LIMIT 100
    `);
    
    return stmt.all(minAmount);
  }
}
```

## Performance Benchmarks and Targets

### Target Performance Metrics:
- **Account lookup**: < 1ms
- **Transfer insertion**: 10,000+ per second (batch mode)
- **Pattern detection**: < 100ms per address
- **Complex graph query (3-hop)**: < 500ms
- **Full-text search**: < 50ms for 1M records

### Optimization Checklist:
1. ✅ Use WAL mode for better concurrency
2. ✅ Implement connection pooling
3. ✅ Cache prepared statements
4. ✅ Use transactions for batch operations
5. ✅ Create covering indexes for hot queries
6. ✅ Implement query result caching
7. ✅ Use partial indexes where applicable
8. ✅ Regular VACUUM and ANALYZE
9. ✅ Monitor query plans with EXPLAIN
10. ✅ Implement pagination for large results

### Memory Usage Guidelines:
- Cache size: 64MB for typical usage
- Temp store: Memory for better sort performance
- Page size: Default (4096) is usually optimal
- Mmap size: 256MB for better I/O performance

This optimization guide ensures the SQLite implementation can handle the scale and complexity of Polkadot data analysis while maintaining excellent performance on desktop hardware.