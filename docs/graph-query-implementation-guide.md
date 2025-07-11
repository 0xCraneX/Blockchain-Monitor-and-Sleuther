# Graph Query Implementation Guide

## Quick Reference for Relationship Builder

This guide provides practical implementation patterns for optimal graph query performance in the Polkadot Analysis Tool.

## 1. Query Templates by Use Case

### Direct Connections (Fast: <10ms)
```typescript
// Get all accounts directly connected to a target
const getDirectConnections = db.prepare(`
  SELECT 
    CASE 
      WHEN from_address = ? THEN to_address 
      ELSE from_address 
    END as connected_address,
    transfer_count,
    total_volume,
    CASE 
      WHEN from_address = ? THEN 'outgoing' 
      ELSE 'incoming' 
    END as direction
  FROM account_relationships
  WHERE from_address = ? OR to_address = ?
  ORDER BY transfer_count DESC
  LIMIT ?
`);

// Usage
const connections = getDirectConnections.all(address, address, address, address, 100);
```

### Two-Hop Connections (Moderate: 50-500ms)
```typescript
// Get connections up to 2 hops away without recursion
const getTwoHopConnections = db.prepare(`
  WITH first_hop AS (
    SELECT DISTINCT
      CASE 
        WHEN from_address = ? THEN to_address 
        ELSE from_address 
      END as address,
      1 as hop
    FROM account_relationships
    WHERE from_address = ? OR to_address = ?
  ),
  second_hop AS (
    SELECT DISTINCT
      CASE 
        WHEN r.from_address = f.address THEN r.to_address 
        ELSE r.from_address 
      END as address,
      2 as hop
    FROM first_hop f
    JOIN account_relationships r 
      ON (r.from_address = f.address OR r.to_address = f.address)
    WHERE 
      r.from_address != ? AND r.to_address != ?
  )
  SELECT 
    address,
    MIN(hop) as distance,
    COUNT(*) as path_count
  FROM (
    SELECT address, hop FROM first_hop
    UNION ALL
    SELECT address, hop FROM second_hop
  )
  WHERE address != ?
  GROUP BY address
  ORDER BY distance, path_count DESC
  LIMIT ?
`);
```

### Path Finding (Slow: 100-5000ms)
```typescript
// Find shortest path between two addresses
const findShortestPath = db.prepare(`
  WITH RECURSIVE paths(from_addr, to_addr, path, depth) AS (
    -- Start from source
    SELECT 
      from_address,
      to_address,
      from_address || ' → ' || to_address as path,
      1
    FROM account_relationships
    WHERE from_address = ?
    
    UNION
    
    -- Extend paths
    SELECT 
      p.from_addr,
      r.to_address,
      p.path || ' → ' || r.to_address,
      p.depth + 1
    FROM paths p
    JOIN account_relationships r ON p.to_addr = r.from_address
    WHERE 
      p.depth < 6  -- Maximum depth
      AND p.path NOT LIKE '%' || r.to_address || '%'  -- No cycles
  )
  SELECT path, depth
  FROM paths
  WHERE to_addr = ?
  ORDER BY depth
  LIMIT 1
`);
```

### Subgraph Extraction (Moderate: 100-1000ms)
```typescript
// Extract subgraph around an address
const extractSubgraph = db.prepare(`
  WITH RECURSIVE subgraph AS (
    -- Center node
    SELECT ? as address, 0 as depth
    
    UNION
    
    -- Connected nodes
    SELECT DISTINCT
      CASE 
        WHEN r.from_address = s.address THEN r.to_address 
        ELSE r.from_address 
      END,
      s.depth + 1
    FROM subgraph s
    JOIN account_relationships r 
      ON (r.from_address = s.address OR r.to_address = s.address)
    WHERE s.depth < ?
  ),
  nodes AS (
    SELECT DISTINCT s.address, s.depth, a.*
    FROM subgraph s
    JOIN accounts a ON s.address = a.address
  ),
  edges AS (
    SELECT r.*
    FROM account_relationships r
    WHERE EXISTS (SELECT 1 FROM nodes WHERE address = r.from_address)
      AND EXISTS (SELECT 1 FROM nodes WHERE address = r.to_address)
  )
  SELECT 
    (SELECT json_group_array(json_object(
      'address', address,
      'depth', depth,
      'identity_display', identity_display,
      'risk_score', risk_score,
      'balance', balance
    )) FROM nodes) as nodes,
    (SELECT json_group_array(json_object(
      'from', from_address,
      'to', to_address,
      'transfers', transfer_count,
      'volume', total_volume
    )) FROM edges) as edges
`);
```

## 2. Performance Optimization Patterns

### Pattern 1: Cached Metrics View
```typescript
// Create materialized view for expensive calculations
async function createGraphMetricsCache(db: Database) {
  db.exec(`
    DROP TABLE IF EXISTS graph_metrics_cache;
    
    CREATE TABLE graph_metrics_cache AS
    SELECT 
      address,
      -- Degree centrality
      (SELECT COUNT(*) FROM account_relationships WHERE from_address = a.address) as out_degree,
      (SELECT COUNT(*) FROM account_relationships WHERE to_address = a.address) as in_degree,
      
      -- Volume metrics
      (SELECT SUM(CAST(total_volume AS REAL)) 
       FROM account_relationships 
       WHERE from_address = a.address) as total_out_volume,
       
      (SELECT SUM(CAST(total_volume AS REAL)) 
       FROM account_relationships 
       WHERE to_address = a.address) as total_in_volume,
       
      -- Activity metrics
      total_transfers_in + total_transfers_out as total_activity,
      
      -- Clustering coefficient (simplified)
      (SELECT COUNT(DISTINCT r2.to_address)
       FROM account_relationships r1
       JOIN account_relationships r2 ON r1.to_address = r2.from_address
       WHERE r1.from_address = a.address
         AND r2.to_address IN (
           SELECT to_address 
           FROM account_relationships 
           WHERE from_address = a.address
         )
      ) as triangles,
      
      CURRENT_TIMESTAMP as calculated_at
    FROM accounts a;
    
    CREATE INDEX idx_metrics_out_degree ON graph_metrics_cache(out_degree DESC);
    CREATE INDEX idx_metrics_in_degree ON graph_metrics_cache(in_degree DESC);
    CREATE INDEX idx_metrics_activity ON graph_metrics_cache(total_activity DESC);
  `);
}

// Refresh periodically or on significant changes
async function refreshGraphMetrics(db: Database) {
  const lastRefresh = db.prepare(
    'SELECT MAX(calculated_at) as last FROM graph_metrics_cache'
  ).get();
  
  const timeSinceRefresh = Date.now() - new Date(lastRefresh.last).getTime();
  
  // Refresh if older than 5 minutes
  if (timeSinceRefresh > 300000) {
    await createGraphMetricsCache(db);
  }
}
```

### Pattern 2: Query with Fallback
```typescript
class AdaptiveGraphQuery {
  constructor(private db: Database, private monitor: PerformanceMonitor) {}
  
  async getConnectedSubgraph(
    centerAddress: string, 
    requestedDepth: number = 3
  ): Promise<GraphData> {
    // Try strategies in order of preference
    const strategies = [
      { depth: requestedDepth, timeout: 1000 },
      { depth: Math.min(2, requestedDepth), timeout: 500 },
      { depth: 1, timeout: 100 }
    ];
    
    for (const strategy of strategies) {
      try {
        return await this.monitor.monitorQuery(
          'connected_subgraph',
          this.subgraphQuery,
          [centerAddress, strategy.depth],
          { timeout: strategy.timeout, cache: true }
        );
      } catch (error) {
        console.warn(`Strategy failed (depth=${strategy.depth}):`, error.message);
        continue;
      }
    }
    
    // Final fallback: return cached metrics only
    return this.getCachedNodeInfo(centerAddress);
  }
  
  private subgraphQuery = this.db.prepare(`
    WITH RECURSIVE graph AS (
      SELECT ? as address, 0 as depth
      UNION
      SELECT DISTINCT
        CASE 
          WHEN r.from_address = g.address THEN r.to_address 
          ELSE r.from_address 
        END,
        g.depth + 1
      FROM graph g
      JOIN account_relationships r 
        ON (r.from_address = g.address OR r.to_address = g.address)
      WHERE g.depth < ?
    )
    SELECT * FROM graph
  `);
  
  private getCachedNodeInfo(address: string): GraphData {
    const metrics = this.db.prepare(`
      SELECT * FROM graph_metrics_cache WHERE address = ?
    `).get(address);
    
    return {
      nodes: [{ address, ...metrics }],
      edges: []
    };
  }
}
```

### Pattern 3: Incremental Loading
```typescript
class IncrementalGraphLoader {
  private loadedNodes = new Set<string>();
  private loadedEdges = new Set<string>();
  
  async loadGraphIncremental(
    centerAddress: string,
    onUpdate: (data: GraphData) => void
  ) {
    // Load center node immediately
    const centerNode = await this.loadNode(centerAddress);
    onUpdate({ nodes: [centerNode], edges: [] });
    
    // Load direct connections
    const directConnections = await this.loadDirectConnections(centerAddress);
    onUpdate(directConnections);
    
    // Load second hop in background
    setTimeout(async () => {
      const secondHop = await this.loadSecondHop(centerAddress);
      onUpdate(secondHop);
    }, 100);
    
    // Load additional details in background
    setTimeout(async () => {
      await this.enrichNodeData(this.loadedNodes);
      onUpdate(this.getFullGraph());
    }, 500);
  }
  
  private async loadNode(address: string): Promise<NodeData> {
    if (this.loadedNodes.has(address)) return null;
    
    const node = this.db.prepare(`
      SELECT a.*, m.*
      FROM accounts a
      LEFT JOIN graph_metrics_cache m ON a.address = m.address
      WHERE a.address = ?
    `).get(address);
    
    this.loadedNodes.add(address);
    return node;
  }
  
  private async loadDirectConnections(address: string): Promise<GraphData> {
    const connections = this.db.prepare(`
      SELECT 
        from_address,
        to_address,
        transfer_count,
        total_volume
      FROM account_relationships
      WHERE from_address = ? OR to_address = ?
      LIMIT 50
    `).all(address, address);
    
    const nodes = [];
    const edges = [];
    
    for (const conn of connections) {
      const edgeId = `${conn.from_address}-${conn.to_address}`;
      if (!this.loadedEdges.has(edgeId)) {
        edges.push(conn);
        this.loadedEdges.add(edgeId);
      }
      
      // Load connected nodes
      const otherAddress = conn.from_address === address 
        ? conn.to_address 
        : conn.from_address;
        
      if (!this.loadedNodes.has(otherAddress)) {
        const node = await this.loadNode(otherAddress);
        if (node) nodes.push(node);
      }
    }
    
    return { nodes, edges };
  }
}
```

## 3. SQLite Configuration Checklist

```typescript
// Initialize database with optimal settings
function initializeDatabase(dbPath: string): Database {
  const db = new Database(dbPath);
  
  // Essential pragmas for graph queries
  db.pragma('journal_mode = WAL');        // Better concurrency
  db.pragma('synchronous = NORMAL');      // Balance safety/speed
  db.pragma('cache_size = -64000');       // 64MB cache
  db.pragma('temp_store = MEMORY');       // Memory for temp tables
  db.pragma('mmap_size = 268435456');    // 256MB memory mapping
  db.pragma('page_size = 4096');          // 4KB pages
  db.pragma('busy_timeout = 5000');       // 5 second timeout
  db.pragma('foreign_keys = ON');         // Enforce constraints
  
  // Run optimizer periodically
  setInterval(() => {
    db.pragma('optimize');
    db.pragma('wal_checkpoint(TRUNCATE)');
  }, 3600000); // Every hour
  
  return db;
}
```

## 4. Monitoring Integration

```typescript
// Complete example with monitoring
import { PerformanceMonitor } from './performance-monitor';

class MonitoredGraphDatabase {
  private db: Database;
  private monitor: PerformanceMonitor;
  
  constructor(dbPath: string) {
    this.db = initializeDatabase(dbPath);
    this.monitor = new PerformanceMonitor(this.db);
    
    // Set up alert handlers
    this.monitor.on('alert', (alert) => {
      console.warn('Performance alert:', alert);
      
      // Auto-adjust based on alerts
      if (alert.type === 'duration' && alert.severity === 'critical') {
        this.adjustQueryStrategy(alert.metrics.queryId);
      }
    });
    
    // Periodic reporting
    setInterval(() => {
      const report = this.monitor.getPerformanceReport();
      console.log('Performance summary:', report.summary);
      
      const recommendations = this.monitor.getOptimizationRecommendations();
      if (recommendations.length > 0) {
        console.log('Optimization recommendations:', recommendations);
      }
    }, 300000); // Every 5 minutes
  }
  
  async getGraphData(address: string, depth: number = 2): Promise<any> {
    return this.monitor.monitorQuery(
      'graph_data',
      this.graphQuery,
      [address, depth],
      { cache: true, timeout: 1000 }
    );
  }
  
  private adjustQueryStrategy(queryId: string) {
    // Implement automatic strategy adjustment
    console.log(`Adjusting strategy for slow query: ${queryId}`);
  }
}
```

## 5. Best Practices Summary

### DO:
- ✅ Always limit recursion depth (max 3 for interactive)
- ✅ Use covering indexes for common query patterns
- ✅ Implement query timeouts and fallbacks
- ✅ Cache expensive computations
- ✅ Monitor performance continuously
- ✅ Use incremental loading for large graphs
- ✅ Batch operations when possible

### DON'T:
- ❌ Use unbounded recursive queries
- ❌ Load entire graph into memory
- ❌ Ignore performance alerts
- ❌ Use string concatenation for cycle detection in production
- ❌ Assume linear performance scaling

### Performance Targets:
- Direct connections: < 10ms
- 2-hop traversal: < 200ms  
- 3-hop traversal: < 1000ms
- Graph metrics: < 50ms (cached)
- Path finding: < 500ms (up to depth 4)

## 6. Troubleshooting Common Issues

### Issue: Query timeout on large graphs
```typescript
// Solution: Implement sampling
const sampleLargeGraph = db.prepare(`
  WITH sampled_relationships AS (
    SELECT * FROM account_relationships
    WHERE from_address = ?
    ORDER BY transfer_count DESC
    LIMIT 20  -- Top 20 connections only
  )
  -- Continue with normal query on sampled data
`);
```

### Issue: Memory spikes during traversal
```typescript
// Solution: Stream results
async function* streamGraphTraversal(centerAddress: string, maxDepth: number) {
  for (let depth = 0; depth <= maxDepth; depth++) {
    const nodes = await getNodesAtDepth(centerAddress, depth);
    yield { depth, nodes };
    
    // Allow garbage collection between depths
    await new Promise(resolve => setImmediate(resolve));
  }
}
```

### Issue: Slow first query (cold cache)
```typescript
// Solution: Warm up cache on startup
async function warmupCache(db: Database) {
  const importantNodes = db.prepare(`
    SELECT address FROM accounts 
    ORDER BY risk_score DESC 
    LIMIT 100
  `).all();
  
  for (const node of importantNodes) {
    // Pre-load metrics
    db.prepare('SELECT * FROM graph_metrics_cache WHERE address = ?')
      .get(node.address);
  }
}
```