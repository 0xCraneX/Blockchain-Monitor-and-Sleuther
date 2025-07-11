# Graph Query Performance Analysis for Polkadot Analysis Tool

## Executive Summary

This document provides a comprehensive performance analysis of SQL-based graph queries for the relationship builder in a single-user desktop application using SQLite. Based on the existing schema and typical use cases (100-10,000 nodes with interactive response requirements), we provide specific recommendations for optimization.

## Table of Contents
1. [Performance Characteristics](#performance-characteristics)
2. [Memory Usage Patterns](#memory-usage-patterns)
3. [Query Execution Time Estimates](#query-execution-time-estimates)
4. [Database Size Impact](#database-size-impact)
5. [Optimal Index Configurations](#optimal-index-configurations)
6. [Materialized Views vs Real-time Queries](#materialized-views-vs-real-time-queries)
7. [Caching Strategies](#caching-strategies)
8. [Specific Recommendations](#specific-recommendations)
9. [Implementation Examples](#implementation-examples)

## Performance Characteristics

### 1. Recursive CTE Performance in SQLite

SQLite handles recursive CTEs efficiently for small to medium graphs:

```sql
-- Performance characteristics by depth
-- Depth 1: ~1-10ms (direct connections)
-- Depth 2: ~10-100ms (friends of friends)
-- Depth 3: ~100-1000ms (3-hop connections)
-- Depth 4+: >1000ms (exponential growth)

WITH RECURSIVE graph_traversal AS (
  -- Base case: O(1) with proper index
  SELECT from_address, to_address, 1 as depth, 
         from_address || '->' || to_address as path
  FROM account_relationships
  WHERE from_address = ?
  
  UNION ALL
  
  -- Recursive case: O(n^d) where n=avg connections, d=depth
  SELECT r.from_address, r.to_address, g.depth + 1,
         g.path || '->' || r.to_address
  FROM account_relationships r
  JOIN graph_traversal g ON r.from_address = g.to_address
  WHERE g.depth < 3  -- Critical: Always limit depth
    AND g.path NOT LIKE '%' || r.to_address || '%'  -- Prevent cycles
)
SELECT * FROM graph_traversal;
```

### 2. Query Pattern Performance Comparison

| Query Type | Complexity | 100 nodes | 1K nodes | 10K nodes | 100K nodes |
|------------|------------|-----------|-----------|-----------|------------|
| Direct connections | O(1) | <1ms | <1ms | 1-2ms | 2-5ms |
| 2-hop traversal | O(n²) | 5-10ms | 50-100ms | 500-1000ms | 5-10s |
| 3-hop traversal | O(n³) | 50-100ms | 1-2s | 10-30s | timeout |
| Shortest path | O(n²) | 10-20ms | 100-200ms | 1-2s | 10-20s |
| Subgraph extraction | O(n²) | 20-50ms | 200-500ms | 2-5s | 20-50s |

## Memory Usage Patterns

### 1. Memory Consumption by Query Type

```sql
-- Memory usage formula: 
-- Base: ~100 bytes per row
-- Path storage: +length(path) bytes per row
-- Temporary tables: 2x working set size

-- Example: 2-hop traversal from highly connected node
-- Nodes: 1000, Avg connections: 10
-- Rows generated: ~100 (depth 1) + ~1000 (depth 2) = 1100
-- Memory: 1100 * 200 bytes = ~220KB + overhead
```

### 2. SQLite Memory Configuration

```sql
-- Optimal SQLite pragmas for graph queries
PRAGMA cache_size = -64000;      -- 64MB cache
PRAGMA temp_store = MEMORY;      -- Use memory for temp tables
PRAGMA mmap_size = 268435456;   -- 256MB memory-mapped I/O
PRAGMA page_size = 4096;         -- Optimal for most systems
PRAGMA journal_mode = WAL;       -- Better concurrency
PRAGMA synchronous = NORMAL;     -- Balance safety/performance
```

## Query Execution Time Estimates

### 1. Base Query Times (Single-threaded SQLite)

```typescript
interface QueryTimeEstimates {
  directConnections: {
    100_nodes: '< 1ms',
    1000_nodes: '1-2ms',
    10000_nodes: '2-5ms'
  },
  twoHopTraversal: {
    100_nodes: '5-20ms',
    1000_nodes: '50-200ms',
    10000_nodes: '500-2000ms'
  },
  threeHopTraversal: {
    100_nodes: '50-200ms',
    1000_nodes: '1-5s',
    10000_nodes: '10-60s'
  },
  pathFinding: {
    100_nodes: '10-50ms',
    1000_nodes: '100-500ms',
    10000_nodes: '1-10s'
  }
}
```

### 2. Factors Affecting Performance

1. **Node Connectivity**: Highly connected nodes (hubs) significantly impact performance
2. **Path Length**: Each additional hop multiplies complexity
3. **Cycle Detection**: String-based path checking adds overhead
4. **Result Set Size**: Large result sets increase materialization time

## Database Size Impact

### 1. Storage Requirements

```typescript
// Estimated database sizes
const storageSizes = {
  accounts: {
    perRecord: 500, // bytes (including indexes)
    100_nodes: '50KB',
    1000_nodes: '500KB',
    10000_nodes: '5MB',
    100000_nodes: '50MB'
  },
  relationships: {
    perRecord: 100, // bytes (including indexes)
    avgConnectionsPerNode: 10,
    100_nodes: '100KB',
    1000_nodes: '1MB',
    10000_nodes: '10MB',
    100000_nodes: '100MB'
  },
  transfers: {
    perRecord: 200, // bytes
    avgTransfersPerRelation: 5,
    100_nodes: '500KB',
    1000_nodes: '5MB',
    10000_nodes: '50MB',
    100000_nodes: '500MB'
  }
};
```

### 2. Index Size Overhead

```sql
-- Index space calculation
-- Each index adds ~30-50% of the indexed column size
-- Composite indexes are larger but more efficient

-- Current indexes and their impact:
-- idx_accounts_address: ~32 bytes * row_count
-- idx_relationships_from: ~32 bytes * row_count
-- idx_relationships_to: ~32 bytes * row_count
-- idx_transfers_from: ~32 bytes * row_count
-- idx_transfers_to: ~32 bytes * row_count

-- Total index overhead: ~40-60% of base table size
```

## Optimal Index Configurations

### 1. Essential Indexes for Graph Queries

```sql
-- Critical indexes (already in schema)
CREATE INDEX idx_relationships_from ON account_relationships(from_address);
CREATE INDEX idx_relationships_to ON account_relationships(to_address);

-- Additional recommended indexes
CREATE INDEX idx_relationships_composite ON account_relationships(from_address, to_address, transfer_count);
CREATE INDEX idx_relationships_volume ON account_relationships(from_address, total_volume DESC);
CREATE INDEX idx_accounts_risk ON accounts(risk_score DESC) WHERE risk_score > 0;

-- Covering index for common queries
CREATE INDEX idx_relationships_covering ON account_relationships(
  from_address, to_address, transfer_count, total_volume
);
```

### 2. Index Usage Analysis

```sql
-- Check index usage
EXPLAIN QUERY PLAN
WITH RECURSIVE connections AS (
  SELECT to_address, 1 as depth
  FROM account_relationships
  WHERE from_address = 'ADDRESS'
  UNION ALL
  SELECT r.to_address, c.depth + 1
  FROM account_relationships r
  JOIN connections c ON r.from_address = c.to_address
  WHERE c.depth < 3
)
SELECT * FROM connections;

-- Expected output:
-- SEARCH TABLE account_relationships USING INDEX idx_relationships_from
-- SCAN TABLE connections
-- SEARCH TABLE account_relationships USING INDEX idx_relationships_from
```

## Materialized Views vs Real-time Queries

### 1. When to Use Materialized Views

```sql
-- Create materialized view for expensive computations
CREATE TABLE graph_metrics_cache AS
SELECT 
  address,
  COUNT(DISTINCT r1.to_address) as out_degree,
  COUNT(DISTINCT r2.from_address) as in_degree,
  SUM(r1.transfer_count) as total_out_transfers,
  SUM(r2.transfer_count) as total_in_transfers,
  AVG(CAST(r1.total_volume AS REAL)) as avg_out_volume,
  AVG(CAST(r2.total_volume AS REAL)) as avg_in_volume,
  -- Clustering coefficient (simplified)
  CAST(COUNT(DISTINCT r3.to_address) AS REAL) / 
    NULLIF(COUNT(DISTINCT r1.to_address) * (COUNT(DISTINCT r1.to_address) - 1), 0) as clustering_coefficient
FROM accounts a
LEFT JOIN account_relationships r1 ON a.address = r1.from_address
LEFT JOIN account_relationships r2 ON a.address = r2.to_address
LEFT JOIN account_relationships r3 ON r1.to_address = r3.from_address 
  AND r3.to_address IN (SELECT to_address FROM account_relationships WHERE from_address = a.address)
GROUP BY address;

-- Refresh strategy
CREATE TRIGGER refresh_graph_metrics
AFTER INSERT ON account_relationships
BEGIN
  -- Mark for refresh (async process handles actual refresh)
  INSERT OR REPLACE INTO refresh_queue (table_name, priority)
  VALUES ('graph_metrics_cache', 'low');
END;
```

### 2. Decision Matrix

| Scenario | Real-time Query | Materialized View | Hybrid Approach |
|----------|----------------|-------------------|-----------------|
| Direct connections | ✓ Best | ✗ Overkill | - |
| 2-hop traversal | ✓ Good | ✗ Usually unnecessary | - |
| 3+ hop traversal | ✗ Too slow | ✓ Required | ✓ Best |
| Graph metrics | ✗ Too complex | ✓ Required | - |
| Path finding | ✓ Acceptable | ✗ Too dynamic | ✓ Cache results |
| Clustering analysis | ✗ Too slow | ✓ Required | - |

## Caching Strategies

### 1. Multi-layer Caching Architecture

```typescript
class GraphQueryCache {
  // Layer 1: SQLite page cache (automatic)
  // Configured via PRAGMA cache_size
  
  // Layer 2: Query result cache (application level)
  private queryCache = new LRUCache<string, any>({
    max: 1000,
    ttl: 1000 * 60 * 5, // 5 minutes
    updateAgeOnGet: true
  });
  
  // Layer 3: Computed graph metrics cache
  private metricsCache = new Map<string, GraphMetrics>();
  
  // Layer 4: Persistent cache (SQLite tables)
  private async persistentCache(key: string, data: any) {
    await db.run(`
      INSERT OR REPLACE INTO query_cache (cache_key, data, expires_at)
      VALUES (?, ?, datetime('now', '+1 hour'))
    `, [key, JSON.stringify(data)]);
  }
  
  async executeWithCache(query: string, params: any[], ttl = 300000) {
    const cacheKey = `${query}:${JSON.stringify(params)}`;
    
    // Check memory cache first
    const cached = this.queryCache.get(cacheKey);
    if (cached) return cached;
    
    // Execute query
    const result = await db.all(query, params);
    
    // Cache based on result size
    if (result.length < 1000) {
      this.queryCache.set(cacheKey, result);
    } else {
      // Large results go to persistent cache
      await this.persistentCache(cacheKey, result);
    }
    
    return result;
  }
}
```

### 2. Cache Invalidation Strategy

```typescript
class CacheInvalidator {
  // Invalidate on write operations
  async invalidateOnTransfer(transfer: Transfer) {
    // Clear direct connection caches
    this.queryCache.delete(`connections:${transfer.from_address}`);
    this.queryCache.delete(`connections:${transfer.to_address}`);
    
    // Mark graph metrics for refresh
    this.metricsCache.delete(transfer.from_address);
    this.metricsCache.delete(transfer.to_address);
    
    // Clear persistent cache entries
    await db.run(`
      DELETE FROM query_cache 
      WHERE cache_key LIKE ? OR cache_key LIKE ?
    `, [`%${transfer.from_address}%`, `%${transfer.to_address}%`]);
  }
  
  // Scheduled cache cleanup
  async cleanupExpiredCache() {
    await db.run(`
      DELETE FROM query_cache 
      WHERE expires_at < datetime('now')
    `);
  }
}
```

## Specific Recommendations

### 1. Query Timeout Settings

```typescript
const QUERY_TIMEOUTS = {
  // Interactive queries (user-facing)
  directConnections: 100,      // 100ms
  twoHopTraversal: 1000,      // 1 second
  threeHopTraversal: 5000,    // 5 seconds
  pathFinding: 3000,          // 3 seconds
  
  // Background queries
  graphMetrics: 30000,        // 30 seconds
  bulkAnalysis: 300000,       // 5 minutes
  
  // Default fallback
  default: 10000              // 10 seconds
};

// Implementation
db.run('PRAGMA busy_timeout = 5000'); // 5 second busy timeout

async function executeWithTimeout(query: string, params: any[], timeout: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    // Note: SQLite doesn't support query cancellation
    // This is a wrapper for application-level timeout
    const result = await Promise.race([
      db.all(query, params),
      new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error('Query timeout'));
        });
      })
    ]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
```

### 2. Maximum Safe Recursion Depths

```typescript
const RECURSION_LIMITS = {
  // Based on average node connectivity of 10
  interactive: {
    sparse: 4,      // < 5 connections per node
    normal: 3,      // 5-20 connections per node
    dense: 2        // > 20 connections per node
  },
  
  // Background processing
  batch: {
    sparse: 6,
    normal: 4,
    dense: 3
  },
  
  // Absolute maximum (safety limit)
  absolute: 10
};

// Dynamic depth calculation
function calculateSafeDepth(nodeCount: number, avgConnections: number): number {
  const complexity = Math.pow(avgConnections, 2) * nodeCount;
  
  if (complexity < 10000) return 4;
  if (complexity < 100000) return 3;
  if (complexity < 1000000) return 2;
  return 1;
}
```

### 3. Node/Edge Limits Per Query

```typescript
const QUERY_LIMITS = {
  // Result set limits
  maxNodes: {
    visualization: 500,     // For graph rendering
    analysis: 5000,        // For computations
    export: 50000          // For data export
  },
  
  // Edge limits
  maxEdges: {
    visualization: 1000,   // UI can handle
    analysis: 10000,       // Memory constraints
    export: 100000         // Reasonable file size
  },
  
  // Pagination settings
  defaultPageSize: 100,
  maxPageSize: 1000
};

// Enforce limits in queries
const safeGraphQuery = `
  WITH RECURSIVE limited_graph AS (
    SELECT *, 0 as depth, 1 as node_count
    FROM account_relationships
    WHERE from_address = ?
    
    UNION ALL
    
    SELECT r.*, g.depth + 1, g.node_count + 1
    FROM account_relationships r
    JOIN limited_graph g ON r.from_address = g.to_address
    WHERE g.depth < ?
      AND g.node_count < ?  -- Prevent runaway queries
  )
  SELECT * FROM limited_graph
  LIMIT ?
`;
```

### 4. Database Configuration Optimizations

```sql
-- Optimal SQLite configuration for graph queries
-- Execute these on connection

-- Memory and cache settings
PRAGMA cache_size = -64000;          -- 64MB cache (negative = KB)
PRAGMA temp_store = MEMORY;          -- Keep temp tables in memory
PRAGMA mmap_size = 268435456;       -- 256MB memory-mapped I/O

-- Performance settings
PRAGMA page_size = 4096;             -- 4KB pages (before creating DB)
PRAGMA journal_mode = WAL;           -- Write-Ahead Logging
PRAGMA wal_autocheckpoint = 1000;   -- Checkpoint every 1000 pages
PRAGMA synchronous = NORMAL;         -- Balance durability/speed

-- Query planner settings
PRAGMA optimize;                     -- Run periodically
PRAGMA analysis_limit = 1000;        -- Limit ANALYZE sampling
PRAGMA threads = 4;                  -- Multi-threaded sorting

-- Reliability settings
PRAGMA foreign_keys = ON;            -- Enforce constraints
PRAGMA recursive_triggers = ON;      -- For complex triggers
PRAGMA busy_timeout = 5000;          -- 5 second timeout

-- Development/debugging (disable in production)
-- PRAGMA query_only = ON;           -- Read-only mode
-- PRAGMA reverse_unordered_selects = ON; -- Find order dependencies
```

### 5. Fallback Strategies

```typescript
class QueryFallbackStrategy {
  async executeWithFallback(address: string, preferredDepth: number) {
    const strategies = [
      // Strategy 1: Full recursive query
      {
        depth: preferredDepth,
        query: this.recursiveGraphQuery,
        timeout: 5000
      },
      // Strategy 2: Reduced depth
      {
        depth: Math.max(1, preferredDepth - 1),
        query: this.recursiveGraphQuery,
        timeout: 2000
      },
      // Strategy 3: Direct connections only
      {
        depth: 1,
        query: this.directConnectionsQuery,
        timeout: 500
      },
      // Strategy 4: Pre-computed cache
      {
        depth: 0,
        query: this.cachedMetricsQuery,
        timeout: 100
      }
    ];
    
    for (const strategy of strategies) {
      try {
        const result = await this.executeWithTimeout(
          strategy.query,
          [address, strategy.depth],
          strategy.timeout
        );
        
        if (result.length > 0) {
          // Log fallback usage for monitoring
          await this.logFallback(address, strategy);
          return result;
        }
      } catch (error) {
        console.warn(`Strategy failed: ${error.message}`);
        continue;
      }
    }
    
    throw new Error('All query strategies failed');
  }
}
```

### 6. Monitoring and Alerting Thresholds

```typescript
interface PerformanceThresholds {
  query: {
    warning: 1000,    // 1 second
    critical: 5000,   // 5 seconds
    timeout: 10000    // 10 seconds
  },
  memory: {
    warning: 100 * 1024 * 1024,   // 100MB
    critical: 500 * 1024 * 1024,  // 500MB
    maximum: 1024 * 1024 * 1024   // 1GB
  },
  resultSize: {
    warning: 1000,    // rows
    critical: 10000,  // rows
    maximum: 50000    // rows
  },
  cacheHitRate: {
    poor: 0.3,        // < 30%
    good: 0.7,        // > 70%
    excellent: 0.9    // > 90%
  }
}

class PerformanceMonitor {
  private metrics: Map<string, any> = new Map();
  
  async trackQuery(queryName: string, fn: () => Promise<any>) {
    const start = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    try {
      const result = await fn();
      const duration = performance.now() - start;
      const memoryDelta = process.memoryUsage().heapUsed - startMemory;
      
      // Record metrics
      this.recordMetric(queryName, {
        duration,
        memoryDelta,
        resultSize: Array.isArray(result) ? result.length : 1,
        timestamp: Date.now()
      });
      
      // Check thresholds
      this.checkThresholds(queryName, duration, memoryDelta, result);
      
      return result;
    } catch (error) {
      this.recordError(queryName, error);
      throw error;
    }
  }
  
  private checkThresholds(queryName: string, duration: number, memory: number, result: any) {
    // Duration checks
    if (duration > PerformanceThresholds.query.critical) {
      this.alert('critical', `Query ${queryName} took ${duration}ms`);
    } else if (duration > PerformanceThresholds.query.warning) {
      this.alert('warning', `Query ${queryName} took ${duration}ms`);
    }
    
    // Memory checks
    if (memory > PerformanceThresholds.memory.critical) {
      this.alert('critical', `Query ${queryName} used ${memory / 1024 / 1024}MB`);
    }
    
    // Result size checks
    const size = Array.isArray(result) ? result.length : 1;
    if (size > PerformanceThresholds.resultSize.critical) {
      this.alert('warning', `Query ${queryName} returned ${size} rows`);
    }
  }
  
  async generateReport() {
    const stats = Array.from(this.metrics.entries()).map(([query, metrics]) => ({
      query,
      avgDuration: metrics.durations.reduce((a, b) => a + b) / metrics.durations.length,
      maxDuration: Math.max(...metrics.durations),
      avgMemory: metrics.memory.reduce((a, b) => a + b) / metrics.memory.length,
      callCount: metrics.durations.length,
      errorRate: metrics.errors / metrics.durations.length
    }));
    
    return stats;
  }
}
```

## Implementation Examples

### 1. Optimized Graph Traversal Query

```typescript
class OptimizedGraphQueries {
  // Efficient 2-hop traversal with cycle prevention
  async getTwoHopConnections(address: string, limit = 500): Promise<any[]> {
    const query = `
      WITH RECURSIVE 
      -- First, get direct connections with their metrics
      direct_connections AS (
        SELECT 
          CASE 
            WHEN from_address = ? THEN to_address 
            ELSE from_address 
          END as connected_address,
          transfer_count,
          total_volume,
          1 as hop_count,
          ? as path_start
        FROM account_relationships
        WHERE from_address = ? OR to_address = ?
      ),
      -- Then get second-hop connections
      second_hop AS (
        SELECT DISTINCT
          CASE 
            WHEN r.from_address = dc.connected_address THEN r.to_address 
            ELSE r.from_address 
          END as connected_address,
          r.transfer_count,
          r.total_volume,
          2 as hop_count,
          dc.connected_address as via_address
        FROM direct_connections dc
        JOIN account_relationships r 
          ON (r.from_address = dc.connected_address OR r.to_address = dc.connected_address)
        WHERE 
          -- Exclude original address and direct connections
          (r.from_address != ? AND r.to_address != ?)
          AND NOT EXISTS (
            SELECT 1 FROM direct_connections dc2 
            WHERE dc2.connected_address = CASE 
              WHEN r.from_address = dc.connected_address THEN r.to_address 
              ELSE r.from_address 
            END
          )
      )
      -- Combine and aggregate results
      SELECT 
        connected_address as address,
        MIN(hop_count) as min_hops,
        SUM(transfer_count) as total_transfers,
        MAX(CAST(total_volume AS REAL)) as max_volume,
        COUNT(DISTINCT via_address) as connection_paths
      FROM (
        SELECT connected_address, hop_count, transfer_count, total_volume, path_start as via_address
        FROM direct_connections
        UNION ALL
        SELECT connected_address, hop_count, transfer_count, total_volume, via_address
        FROM second_hop
      )
      GROUP BY connected_address
      ORDER BY min_hops, total_transfers DESC
      LIMIT ?
    `;
    
    return await this.db.all(query, [address, address, address, address, address, address, limit]);
  }
  
  // Shortest path between two addresses
  async findShortestPath(fromAddress: string, toAddress: string, maxDepth = 6): Promise<any> {
    const query = `
      WITH RECURSIVE 
      paths AS (
        -- Base case: direct path
        SELECT 
          from_address,
          to_address,
          1 as depth,
          from_address || '->' || to_address as path,
          transfer_count as weight
        FROM account_relationships
        WHERE from_address = ?
        
        UNION
        
        -- Recursive case: extend paths
        SELECT 
          p.from_address,
          r.to_address,
          p.depth + 1,
          p.path || '->' || r.to_address,
          p.weight + r.transfer_count
        FROM paths p
        JOIN account_relationships r ON p.to_address = r.from_address
        WHERE 
          p.depth < ?
          AND p.path NOT LIKE '%' || r.to_address || '%'  -- Prevent cycles
          AND r.to_address != p.from_address  -- No return to start
      )
      SELECT 
        path,
        depth as hops,
        weight as total_transfers
      FROM paths
      WHERE to_address = ?
      ORDER BY depth, weight DESC
      LIMIT 1
    `;
    
    const result = await this.db.get(query, [fromAddress, maxDepth, toAddress]);
    return result || null;
  }
}
```

### 2. Batch Processing for Large Graphs

```typescript
class BatchGraphProcessor {
  async processLargeGraph(centerAddress: string, maxDepth: number = 3) {
    const batchSize = 100;
    const processedNodes = new Set<string>();
    const nodesToProcess = [{ address: centerAddress, depth: 0 }];
    const results = [];
    
    while (nodesToProcess.length > 0) {
      // Process in batches
      const batch = nodesToProcess.splice(0, batchSize);
      const addresses = batch.map(n => n.address);
      
      // Skip already processed nodes
      const newAddresses = addresses.filter(a => !processedNodes.has(a));
      if (newAddresses.length === 0) continue;
      
      // Batch query for connections
      const placeholders = newAddresses.map(() => '?').join(',');
      const connections = await this.db.all(`
        SELECT DISTINCT
          from_address,
          to_address,
          transfer_count,
          total_volume
        FROM account_relationships
        WHERE from_address IN (${placeholders})
           OR to_address IN (${placeholders})
      `, [...newAddresses, ...newAddresses]);
      
      // Process connections
      for (const conn of connections) {
        const currentDepth = batch.find(
          b => b.address === conn.from_address || b.address === conn.to_address
        )?.depth || 0;
        
        results.push({
          ...conn,
          depth: currentDepth
        });
        
        // Add new nodes to process
        if (currentDepth < maxDepth - 1) {
          const nextAddress = processedNodes.has(conn.from_address) 
            ? conn.to_address 
            : conn.from_address;
            
          if (!processedNodes.has(nextAddress)) {
            nodesToProcess.push({
              address: nextAddress,
              depth: currentDepth + 1
            });
          }
        }
      }
      
      // Mark as processed
      newAddresses.forEach(a => processedNodes.add(a));
      
      // Yield control to prevent blocking
      await new Promise(resolve => setImmediate(resolve));
    }
    
    return results;
  }
}
```

### 3. Real-time Performance Monitoring

```typescript
class GraphQueryProfiler {
  private queryStats = new Map<string, any[]>();
  
  async profile(queryName: string, queryFn: () => Promise<any>) {
    const stats = {
      startTime: Date.now(),
      startMemory: process.memoryUsage(),
      queryPlan: null,
      duration: 0,
      rowsReturned: 0,
      memoryDelta: 0
    };
    
    try {
      // Get query plan
      if (queryFn.toString().includes('WITH RECURSIVE')) {
        stats.queryPlan = await this.getQueryPlan(queryFn);
      }
      
      // Execute query
      const result = await queryFn();
      
      // Calculate stats
      stats.duration = Date.now() - stats.startTime;
      stats.rowsReturned = Array.isArray(result) ? result.length : 1;
      const endMemory = process.memoryUsage();
      stats.memoryDelta = endMemory.heapUsed - stats.startMemory.heapUsed;
      
      // Store stats
      if (!this.queryStats.has(queryName)) {
        this.queryStats.set(queryName, []);
      }
      this.queryStats.get(queryName).push(stats);
      
      // Alert if performance degrades
      this.checkPerformanceTrend(queryName);
      
      return result;
    } catch (error) {
      stats.error = error.message;
      throw error;
    }
  }
  
  private checkPerformanceTrend(queryName: string) {
    const stats = this.queryStats.get(queryName);
    if (!stats || stats.length < 10) return;
    
    // Calculate moving average
    const recent = stats.slice(-10);
    const avgDuration = recent.reduce((sum, s) => sum + s.duration, 0) / recent.length;
    
    // Compare with historical average
    const historical = stats.slice(0, -10);
    if (historical.length > 0) {
      const historicalAvg = historical.reduce((sum, s) => sum + s.duration, 0) / historical.length;
      
      if (avgDuration > historicalAvg * 2) {
        console.warn(`Performance degradation detected for ${queryName}: ${avgDuration}ms vs ${historicalAvg}ms historical`);
      }
    }
  }
  
  generateReport() {
    const report = {};
    
    for (const [queryName, stats] of this.queryStats.entries()) {
      const durations = stats.map(s => s.duration);
      const memories = stats.map(s => s.memoryDelta);
      
      report[queryName] = {
        callCount: stats.length,
        avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        p95Duration: this.percentile(durations, 0.95),
        avgMemory: memories.reduce((a, b) => a + b, 0) / memories.length,
        errors: stats.filter(s => s.error).length
      };
    }
    
    return report;
  }
  
  private percentile(values: number[], p: number): number {
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  }
}
```

## Conclusion

For a single-user desktop application with SQLite handling graphs of 100-10,000 nodes:

1. **Keep recursive queries shallow** (max depth 3 for interactive queries)
2. **Use appropriate indexes** (covering indexes for common patterns)
3. **Implement multi-layer caching** (memory + persistent)
4. **Set reasonable timeouts** (1 second for interactive queries)
5. **Monitor performance continuously** (degrade gracefully)
6. **Pre-compute expensive metrics** (use materialized views strategically)
7. **Batch large operations** (prevent UI blocking)

These optimizations ensure sub-second response times for most common graph operations while maintaining system stability and reasonable resource usage.