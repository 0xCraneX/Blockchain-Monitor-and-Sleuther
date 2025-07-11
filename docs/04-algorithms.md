# Core Algorithms Documentation

## Overview

This document details the core algorithms used in the Polkadot Analysis Tool, providing JavaScript implementations for identity resolution, graph building, pattern detection, and more.

## 1. Identity Resolution Algorithm

### Purpose
Resolve on-chain identities and link sub-identities to their parent accounts, enabling human-readable account identification.

### Implementation

```javascript
class IdentityResolver {
  constructor(dbConnection) {
    this.db = dbConnection;
    this.cache = new Map();
  }

  /**
   * Resolve and save identities from blockchain
   * @param {Array} identities - Raw identity data from chain
   * @param {Array} subIdentities - Raw sub-identity data from chain
   */
  async resolveIdentities(identities, subIdentities) {
    const batch = [];
    
    // Process main identities
    for (const identity of identities) {
      const processed = this.processIdentity(identity);
      batch.push(processed);
      this.cache.set(processed.address, processed);
    }
    
    // Batch insert main identities
    await this.db.run('BEGIN TRANSACTION');
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO accounts 
        (address, display_name, legal_name, web, email, twitter, riot, is_verified, is_invalid)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const identity of batch) {
        stmt.run(
          identity.address,
          identity.display_name,
          identity.legal_name,
          identity.web,
          identity.email,
          identity.twitter,
          identity.riot,
          identity.is_verified ? 1 : 0,
          identity.is_invalid ? 1 : 0
        );
      }
      
      stmt.finalize();
      await this.db.run('COMMIT');
    } catch (error) {
      await this.db.run('ROLLBACK');
      throw error;
    }
    
    // Process sub-identities
    await this.processSubIdentities(subIdentities);
  }

  processIdentity(identity) {
    return {
      address: identity.address,
      display_name: this.extractData(identity.info?.display),
      legal_name: this.extractData(identity.info?.legal),
      web: this.extractData(identity.info?.web),
      email: this.extractData(identity.info?.email),
      twitter: this.extractData(identity.info?.twitter),
      riot: this.extractData(identity.info?.riot),
      is_verified: this.checkVerification(identity.judgements),
      is_invalid: this.checkInvalid(identity.judgements)
    };
  }

  extractData(field) {
    if (!field) return null;
    
    // Handle different data formats from chain
    if (field.isRaw) return field.asRaw.toHuman();
    if (field.isBlakeTwo256) return field.asBlakeTwo256.toHex();
    if (field.isSha256) return field.asSha256.toHex();
    if (field.isKeccak256) return field.asKeccak256.toHex();
    
    return field.toString();
  }

  checkVerification(judgements) {
    if (!judgements || !Array.isArray(judgements)) return false;
    
    return judgements.some(([_, judgement]) => {
      return judgement.isReasonable || judgement.isKnownGood;
    });
  }

  checkInvalid(judgements) {
    if (!judgements || !Array.isArray(judgements)) return false;
    
    return judgements.some(([_, judgement]) => {
      return judgement.isErroneous || judgement.isBad;
    });
  }

  /**
   * Search identities with fuzzy matching
   * @param {string} query - Search query
   * @param {number} limit - Result limit
   */
  async searchIdentities(query, limit = 50) {
    // Use FTS5 for efficient full-text search
    const results = await this.db.all(`
      SELECT 
        a.*,
        si.super_address,
        si.sub_display,
        CASE 
          WHEN a.display_name LIKE ? THEN 1
          WHEN a.display_name LIKE ? THEN 2
          ELSE 3
        END as relevance
      FROM accounts a
      LEFT JOIN sub_identities si ON a.address = si.address
      WHERE a.address IN (
        SELECT address FROM search_index 
        WHERE search_index MATCH ?
      )
      ORDER BY relevance, a.display_name
      LIMIT ?
    `, [`${query}%`, `%${query}%`, query, limit]);
    
    return results;
  }

  /**
   * Build identity hierarchy
   * @param {string} address - Root address
   */
  async getIdentityHierarchy(address) {
    const hierarchy = {
      address,
      identity: null,
      sub_identities: []
    };
    
    // Get main identity
    hierarchy.identity = await this.db.get(
      'SELECT * FROM accounts WHERE address = ?',
      [address]
    );
    
    // Get sub-identities
    const subs = await this.db.all(`
      SELECT a.*, si.sub_display 
      FROM sub_identities si
      JOIN accounts a ON si.address = a.address
      WHERE si.super_address = ?
    `, [address]);
    
    hierarchy.sub_identities = subs;
    
    return hierarchy;
  }
}
```

## 2. Graph Building Algorithm

### Purpose
Build a network graph from blockchain transfers, creating weighted edges between accounts.

### Implementation

```javascript
class GraphBuilder {
  constructor(dbConnection) {
    this.db = dbConnection;
    this.graphCache = new Map();
  }

  /**
   * Build graph for an address with configurable depth
   * @param {string} centerAddress - Starting address
   * @param {Object} options - Graph building options
   */
  async buildGraph(centerAddress, options = {}) {
    const {
      depth = 2,
      minVolume = 0n,
      maxNodes = 100,
      timeRange = null
    } = options;
    
    const graph = {
      nodes: new Map(),
      edges: new Map(),
      metadata: {
        center: centerAddress,
        depth: 0,
        totalVolume: 0n
      }
    };
    
    // Add center node
    graph.nodes.set(centerAddress, {
      address: centerAddress,
      depth: 0,
      isCenter: true
    });
    
    // Build graph iteratively
    await this.expandGraph(graph, [centerAddress], depth, minVolume, maxNodes, timeRange);
    
    // Convert to serializable format
    return this.serializeGraph(graph);
  }

  async expandGraph(graph, addresses, remainingDepth, minVolume, maxNodes, timeRange) {
    if (remainingDepth <= 0 || graph.nodes.size >= maxNodes) return;
    
    const nextAddresses = new Set();
    
    for (const address of addresses) {
      // Get connections for this address
      const connections = await this.getConnections(address, minVolume, timeRange);
      
      for (const conn of connections) {
        const otherAddress = conn.from_address === address ? 
          conn.to_address : conn.from_address;
        
        // Add node if not exists
        if (!graph.nodes.has(otherAddress)) {
          graph.nodes.set(otherAddress, {
            address: otherAddress,
            depth: graph.metadata.depth + 1,
            isCenter: false
          });
          nextAddresses.add(otherAddress);
        }
        
        // Add or update edge
        const edgeKey = this.getEdgeKey(conn.from_address, conn.to_address);
        const existingEdge = graph.edges.get(edgeKey);
        
        if (existingEdge) {
          existingEdge.volume = (BigInt(existingEdge.volume) + BigInt(conn.total_volume)).toString();
          existingEdge.count += conn.transfer_count;
        } else {
          graph.edges.set(edgeKey, {
            from: conn.from_address,
            to: conn.to_address,
            volume: conn.total_volume,
            count: conn.transfer_count
          });
        }
        
        // Stop if we've reached max nodes
        if (graph.nodes.size >= maxNodes) break;
      }
    }
    
    // Update metadata
    graph.metadata.depth++;
    
    // Recursive expansion
    if (nextAddresses.size > 0) {
      await this.expandGraph(
        graph, 
        Array.from(nextAddresses), 
        remainingDepth - 1, 
        minVolume, 
        maxNodes, 
        timeRange
      );
    }
  }

  async getConnections(address, minVolume, timeRange) {
    let query = `
      SELECT 
        from_address,
        to_address,
        total_volume,
        transfer_count,
        first_transfer,
        last_transfer
      FROM transfer_stats
      WHERE (from_address = ? OR to_address = ?)
    `;
    
    const params = [address, address];
    
    // Add volume filter
    if (minVolume > 0n) {
      query += ' AND CAST(total_volume AS INTEGER) >= ?';
      params.push(minVolume.toString());
    }
    
    // Add time filter
    if (timeRange) {
      const cutoff = this.getTimeCutoff(timeRange);
      query += ' AND last_transfer >= ?';
      params.push(cutoff);
    }
    
    query += ' ORDER BY total_volume DESC LIMIT 50';
    
    return await this.db.all(query, params);
  }

  getTimeCutoff(timeRange) {
    const now = Math.floor(Date.now() / 1000);
    
    switch (timeRange) {
      case 'week':
        return now - (7 * 24 * 60 * 60);
      case 'month':
        return now - (30 * 24 * 60 * 60);
      case 'year':
        return now - (365 * 24 * 60 * 60);
      default:
        return 0;
    }
  }

  getEdgeKey(from, to) {
    // Ensure consistent edge keys regardless of direction
    return from < to ? `${from}-${to}` : `${to}-${from}`;
  }

  serializeGraph(graph) {
    // Get account details for all nodes
    const nodeAddresses = Array.from(graph.nodes.keys());
    
    return {
      accounts: Array.from(graph.nodes.values()),
      connections: Array.from(graph.edges.values()),
      metadata: {
        ...graph.metadata,
        totalNodes: graph.nodes.size,
        totalEdges: graph.edges.size,
        totalVolume: Array.from(graph.edges.values())
          .reduce((sum, edge) => sum + BigInt(edge.volume), 0n)
          .toString()
      }
    };
  }

  /**
   * Calculate graph metrics
   * @param {Object} graph - Serialized graph
   */
  calculateMetrics(graph) {
    const metrics = {
      density: 0,
      averageDegree: 0,
      centralityScores: new Map(),
      clusters: []
    };
    
    // Calculate density
    const n = graph.accounts.length;
    const e = graph.connections.length;
    metrics.density = (2 * e) / (n * (n - 1));
    
    // Calculate degree centrality
    const degrees = new Map();
    
    for (const edge of graph.connections) {
      degrees.set(edge.from, (degrees.get(edge.from) || 0) + 1);
      degrees.set(edge.to, (degrees.get(edge.to) || 0) + 1);
    }
    
    metrics.averageDegree = Array.from(degrees.values())
      .reduce((sum, deg) => sum + deg, 0) / degrees.size;
    
    // Normalize centrality scores
    for (const [address, degree] of degrees) {
      metrics.centralityScores.set(address, degree / (n - 1));
    }
    
    return metrics;
  }
}
```

## 3. Suspicious Pattern Detection

### Purpose
Identify potentially suspicious transaction patterns including rapid fund movement, circular flows, and mixing behavior.

### Implementation

```javascript
class PatternDetector {
  constructor(dbConnection) {
    this.db = dbConnection;
    
    // Pattern thresholds
    this.thresholds = {
      rapidMovement: {
        timeWindow: 3600, // 1 hour
        minTransactions: 10,
        minUniqueAddresses: 5
      },
      circularFlow: {
        maxDepth: 5,
        minCycleValue: 1000000000000n, // 1000 units
        minCycleLength: 3
      },
      layering: {
        minLayers: 3,
        maxTimeBetweenLayers: 300, // 5 minutes
        minSplitRatio: 0.8
      },
      unusualVolume: {
        volumeMultiplier: 10,
        timeWindow: 86400 // 24 hours
      }
    };
  }

  /**
   * Detect all patterns for an address
   * @param {string} address - Address to analyze
   * @param {Object} options - Detection options
   */
  async detectPatterns(address, options = {}) {
    const patterns = [];
    
    // Run all detectors in parallel
    const [rapid, circular, layering, mixing, unusual] = await Promise.all([
      this.detectRapidMovement(address, options),
      this.detectCircularFlow(address, options),
      this.detectLayering(address, options),
      this.detectMixingBehavior(address, options),
      this.detectUnusualVolume(address, options)
    ]);
    
    // Aggregate results
    if (rapid.detected) patterns.push(rapid);
    if (circular.detected) patterns.push(circular);
    if (layering.detected) patterns.push(layering);
    if (mixing.detected) patterns.push(mixing);
    if (unusual.detected) patterns.push(unusual);
    
    // Calculate overall risk score
    const riskScore = this.calculateRiskScore(patterns);
    
    return {
      address,
      patterns,
      riskScore,
      analyzedAt: Date.now()
    };
  }

  /**
   * Detect rapid fund movement pattern
   */
  async detectRapidMovement(address, options = {}) {
    const timeWindow = options.timeWindow || this.thresholds.rapidMovement.timeWindow;
    const startTime = Math.floor(Date.now() / 1000) - timeWindow;
    
    // Get recent transfers
    const transfers = await this.db.all(`
      SELECT 
        from_address,
        to_address,
        amount,
        timestamp,
        block_number
      FROM transfers
      WHERE (from_address = ? OR to_address = ?)
        AND timestamp >= ?
      ORDER BY timestamp
    `, [address, address, startTime]);
    
    if (transfers.length < this.thresholds.rapidMovement.minTransactions) {
      return { detected: false };
    }
    
    // Analyze transfer patterns
    const uniqueAddresses = new Set();
    let totalVolume = 0n;
    const timeBuckets = new Map();
    
    for (const transfer of transfers) {
      const otherAddress = transfer.from_address === address ? 
        transfer.to_address : transfer.from_address;
      uniqueAddresses.add(otherAddress);
      totalVolume += BigInt(transfer.amount);
      
      // Group by time buckets (5-minute intervals)
      const bucket = Math.floor(transfer.timestamp / 300) * 300;
      if (!timeBuckets.has(bucket)) {
        timeBuckets.set(bucket, []);
      }
      timeBuckets.get(bucket).push(transfer);
    }
    
    // Check for burst patterns
    const maxBucketSize = Math.max(...Array.from(timeBuckets.values()).map(b => b.length));
    const burstDetected = maxBucketSize >= 5;
    
    if (uniqueAddresses.size >= this.thresholds.rapidMovement.minUniqueAddresses || burstDetected) {
      return {
        detected: true,
        type: 'RAPID_MOVEMENT',
        severity: this.calculateSeverity(transfers.length, uniqueAddresses.size),
        confidence: 0.85,
        details: {
          transferCount: transfers.length,
          uniqueAddresses: uniqueAddresses.size,
          totalVolume: totalVolume.toString(),
          timeWindow,
          burstDetected,
          maxTransfersPerBucket: maxBucketSize
        }
      };
    }
    
    return { detected: false };
  }

  /**
   * Detect circular flow patterns using DFS
   */
  async detectCircularFlow(address, options = {}) {
    const maxDepth = options.maxDepth || this.thresholds.circularFlow.maxDepth;
    const minValue = options.minCycleValue || this.thresholds.circularFlow.minCycleValue;
    
    const cycles = [];
    const visited = new Map();
    
    // Depth-first search for cycles
    const findCycles = async (current, path = [], pathValue = 0n, depth = 0) => {
      if (depth > maxDepth) return;
      
      // Check if we've found a cycle
      const cycleIndex = path.indexOf(current);
      if (cycleIndex !== -1) {
        const cycle = path.slice(cycleIndex);
        if (cycle.length >= this.thresholds.circularFlow.minCycleLength && 
            pathValue >= minValue) {
          cycles.push({
            path: cycle,
            value: pathValue.toString(),
            length: cycle.length
          });
        }
        return;
      }
      
      // Mark as visited in this path
      path.push(current);
      
      // Get outgoing transfers
      const transfers = await this.db.all(`
        SELECT DISTINCT 
          to_address,
          SUM(CAST(amount AS TEXT)) as total_amount
        FROM transfers
        WHERE from_address = ?
        GROUP BY to_address
        ORDER BY total_amount DESC
        LIMIT 10
      `, [current]);
      
      // Explore each connection
      for (const transfer of transfers) {
        const nextValue = pathValue + BigInt(transfer.total_amount);
        await findCycles(
          transfer.to_address,
          [...path],
          nextValue,
          depth + 1
        );
      }
    };
    
    await findCycles(address);
    
    if (cycles.length > 0) {
      // Sort by value and take top cycles
      cycles.sort((a, b) => {
        const diff = BigInt(b.value) - BigInt(a.value);
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      });
      
      return {
        detected: true,
        type: 'CIRCULAR_FLOW',
        severity: Math.min(cycles.length * 20, 100),
        confidence: 0.9,
        details: {
          cyclesFound: cycles.length,
          topCycles: cycles.slice(0, 3),
          totalValue: cycles.reduce((sum, c) => sum + BigInt(c.value), 0n).toString()
        }
      };
    }
    
    return { detected: false };
  }

  /**
   * Detect layering pattern (splitting funds across multiple addresses)
   */
  async detectLayering(address, options = {}) {
    // Get outgoing transfers
    const transfers = await this.db.all(`
      SELECT 
        to_address,
        amount,
        timestamp,
        block_number
      FROM transfers
      WHERE from_address = ?
      ORDER BY timestamp DESC
      LIMIT 100
    `, [address]);
    
    if (transfers.length < 3) {
      return { detected: false };
    }
    
    // Group transfers by time proximity
    const layers = [];
    let currentLayer = [transfers[0]];
    
    for (let i = 1; i < transfers.length; i++) {
      const timeDiff = Math.abs(transfers[i].timestamp - transfers[i-1].timestamp);
      
      if (timeDiff <= this.thresholds.layering.maxTimeBetweenLayers) {
        currentLayer.push(transfers[i]);
      } else {
        if (currentLayer.length >= 2) {
          layers.push(currentLayer);
        }
        currentLayer = [transfers[i]];
      }
    }
    
    if (currentLayer.length >= 2) {
      layers.push(currentLayer);
    }
    
    // Analyze layers for splitting pattern
    const splittingLayers = layers.filter(layer => {
      const totalAmount = layer.reduce((sum, t) => sum + BigInt(t.amount), 0n);
      const avgAmount = totalAmount / BigInt(layer.length);
      
      // Check if amounts are roughly equal (indicating splitting)
      const variance = layer.reduce((sum, t) => {
        const diff = BigInt(t.amount) - avgAmount;
        return sum + (diff * diff);
      }, 0n) / BigInt(layer.length);
      
      return variance < (avgAmount * avgAmount / 4n); // Low variance indicates splitting
    });
    
    if (splittingLayers.length >= this.thresholds.layering.minLayers) {
      return {
        detected: true,
        type: 'LAYERING',
        severity: Math.min(splittingLayers.length * 25, 100),
        confidence: 0.8,
        details: {
          layersDetected: splittingLayers.length,
          totalLayers: layers.length,
          addresses: [...new Set(transfers.map(t => t.to_address))].length,
          exampleLayer: splittingLayers[0].map(t => ({
            to: t.to_address.slice(0, 8) + '...',
            amount: t.amount
          }))
        }
      };
    }
    
    return { detected: false };
  }

  /**
   * Detect mixing service behavior
   */
  async detectMixingBehavior(address, options = {}) {
    // Characteristics of mixing:
    // 1. Many inputs from different addresses
    // 2. Many outputs to different addresses
    // 3. Similar amounts (common denominations)
    // 4. Time clustering
    
    const [inputs, outputs] = await Promise.all([
      this.db.all(`
        SELECT 
          from_address,
          amount,
          timestamp
        FROM transfers
        WHERE to_address = ?
        ORDER BY timestamp DESC
        LIMIT 50
      `, [address]),
      
      this.db.all(`
        SELECT 
          to_address,
          amount,
          timestamp
        FROM transfers
        WHERE from_address = ?
        ORDER BY timestamp DESC
        LIMIT 50
      `, [address])
    ]);
    
    if (inputs.length < 5 || outputs.length < 5) {
      return { detected: false };
    }
    
    // Check for common mixing amounts
    const amounts = new Map();
    [...inputs, ...outputs].forEach(t => {
      const amount = t.amount;
      amounts.set(amount, (amounts.get(amount) || 0) + 1);
    });
    
    // Find amounts that appear multiple times
    const commonAmounts = Array.from(amounts.entries())
      .filter(([_, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1]);
    
    // Check time clustering
    const timeWindows = new Map();
    [...inputs, ...outputs].forEach(t => {
      const window = Math.floor(t.timestamp / 3600) * 3600; // 1-hour windows
      timeWindows.set(window, (timeWindows.get(window) || 0) + 1);
    });
    
    const maxCluster = Math.max(...timeWindows.values());
    
    if (commonAmounts.length > 0 && maxCluster >= 10) {
      return {
        detected: true,
        type: 'MIXING_BEHAVIOR',
        severity: 70,
        confidence: 0.75,
        details: {
          uniqueInputs: new Set(inputs.map(i => i.from_address)).size,
          uniqueOutputs: new Set(outputs.map(o => o.to_address)).size,
          commonAmounts: commonAmounts.slice(0, 3).map(([amt, count]) => ({
            amount: amt,
            occurrences: count
          })),
          maxTransactionsPerHour: maxCluster
        }
      };
    }
    
    return { detected: false };
  }

  /**
   * Detect unusual volume patterns
   */
  async detectUnusualVolume(address, options = {}) {
    const timeWindow = options.timeWindow || this.thresholds.unusualVolume.timeWindow;
    
    // Get historical average
    const historical = await this.db.get(`
      SELECT 
        AVG(daily_volume) as avg_volume,
        MAX(daily_volume) as max_volume
      FROM (
        SELECT 
          DATE(timestamp, 'unixepoch') as day,
          SUM(CAST(amount AS REAL)) as daily_volume
        FROM transfers
        WHERE from_address = ? OR to_address = ?
        GROUP BY day
        ORDER BY day DESC
        LIMIT 30
      )
    `, [address, address]);
    
    if (!historical.avg_volume) {
      return { detected: false };
    }
    
    // Get recent volume
    const recentVolume = await this.db.get(`
      SELECT 
        SUM(CAST(amount AS REAL)) as volume,
        COUNT(*) as count
      FROM transfers
      WHERE (from_address = ? OR to_address = ?)
        AND timestamp >= ?
    `, [address, address, Math.floor(Date.now() / 1000) - timeWindow]);
    
    if (!recentVolume.volume) {
      return { detected: false };
    }
    
    const ratio = recentVolume.volume / historical.avg_volume;
    
    if (ratio >= this.thresholds.unusualVolume.volumeMultiplier) {
      return {
        detected: true,
        type: 'UNUSUAL_VOLUME',
        severity: Math.min(ratio * 10, 100),
        confidence: 0.85,
        details: {
          recentVolume: recentVolume.volume.toString(),
          historicalAverage: historical.avg_volume.toString(),
          ratio: ratio.toFixed(2),
          transactionCount: recentVolume.count,
          timeWindow
        }
      };
    }
    
    return { detected: false };
  }

  /**
   * Calculate overall risk score from detected patterns
   */
  calculateRiskScore(patterns) {
    if (patterns.length === 0) return 0;
    
    // Weight different pattern types
    const weights = {
      RAPID_MOVEMENT: 0.3,
      CIRCULAR_FLOW: 0.25,
      LAYERING: 0.25,
      MIXING_BEHAVIOR: 0.35,
      UNUSUAL_VOLUME: 0.2
    };
    
    let weightedSum = 0;
    let totalWeight = 0;
    
    for (const pattern of patterns) {
      const weight = weights[pattern.type] || 0.2;
      weightedSum += pattern.severity * weight * pattern.confidence;
      totalWeight += weight;
    }
    
    return Math.min(Math.round(weightedSum / totalWeight), 100);
  }

  calculateSeverity(count, uniqueAddresses) {
    // Logarithmic scaling for severity
    const countScore = Math.log10(count) * 20;
    const addressScore = Math.log10(uniqueAddresses) * 30;
    
    return Math.min(countScore + addressScore, 100);
  }
}
```

## 4. Search Algorithm

### Purpose
Provide efficient search across addresses, identities, and patterns with fuzzy matching and relevance ranking.

### Implementation

```javascript
class SearchEngine {
  constructor(dbConnection) {
    this.db = dbConnection;
    this.searchCache = new LRUCache({ max: 1000, ttl: 300000 }); // 5 min TTL
  }

  /**
   * Unified search across all data types
   * @param {string} query - Search query
   * @param {Object} options - Search options
   */
  async search(query, options = {}) {
    const {
      types = ['address', 'identity', 'pattern'],
      limit = 50,
      offset = 0,
      sortBy = 'relevance'
    } = options;
    
    // Check cache
    const cacheKey = JSON.stringify({ query, types, limit, offset, sortBy });
    const cached = this.searchCache.get(cacheKey);
    if (cached) return cached;
    
    const results = {
      addresses: [],
      identities: [],
      patterns: [],
      total: 0
    };
    
    // Prepare search pattern
    const searchPattern = this.prepareSearchPattern(query);
    
    // Execute searches in parallel
    const searches = [];
    
    if (types.includes('address')) {
      searches.push(this.searchAddresses(searchPattern, limit, offset));
    }
    
    if (types.includes('identity')) {
      searches.push(this.searchIdentities(searchPattern, limit, offset));
    }
    
    if (types.includes('pattern')) {
      searches.push(this.searchPatterns(searchPattern, limit, offset));
    }
    
    const searchResults = await Promise.all(searches);
    
    // Merge results
    let resultIndex = 0;
    if (types.includes('address')) {
      results.addresses = searchResults[resultIndex++];
    }
    if (types.includes('identity')) {
      results.identities = searchResults[resultIndex++];
    }
    if (types.includes('pattern')) {
      results.patterns = searchResults[resultIndex++];
    }
    
    // Calculate total
    results.total = results.addresses.length + 
                   results.identities.length + 
                   results.patterns.length;
    
    // Merge and rank
    results.merged = this.mergeAndRank(results, query, sortBy);
    
    // Cache results
    this.searchCache.set(cacheKey, results);
    
    return results;
  }

  prepareSearchPattern(query) {
    // Escape special characters for LIKE queries
    const escaped = query.replace(/[%_]/g, '\\$&');
    
    return {
      exact: escaped,
      prefix: `${escaped}%`,
      contains: `%${escaped}%`,
      fts: query.toLowerCase() // For full-text search
    };
  }

  async searchAddresses(pattern, limit, offset) {
    // Direct address search
    const results = await this.db.all(`
      SELECT DISTINCT 
        a.address,
        a.display_name,
        a.is_verified,
        a.balance,
        ast.risk_score,
        ast.total_sent,
        ast.total_received,
        ast.unique_connections
      FROM accounts a
      LEFT JOIN account_stats ast ON a.address = ast.address
      WHERE a.address LIKE ?
         OR a.address LIKE ?
      ORDER BY 
        CASE 
          WHEN a.address = ? THEN 1
          WHEN a.address LIKE ? THEN 2
          ELSE 3
        END,
        ast.total_sent + ast.total_received DESC
      LIMIT ? OFFSET ?
    `, [
      pattern.prefix,
      pattern.contains,
      pattern.exact,
      pattern.prefix,
      limit,
      offset
    ]);
    
    return results.map(r => ({
      type: 'address',
      ...r,
      relevance: this.calculateAddressRelevance(r, pattern.exact)
    }));
  }

  async searchIdentities(pattern, limit, offset) {
    // Search using FTS5
    const results = await this.db.all(`
      SELECT 
        a.*,
        ast.risk_score,
        highlight(search_index, 1, '<mark>', '</mark>') as highlighted_name
      FROM search_index
      JOIN accounts a ON search_index.rowid = a.rowid
      LEFT JOIN account_stats ast ON a.address = ast.address
      WHERE search_index MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `, [pattern.fts, limit, offset]);
    
    return results.map(r => ({
      type: 'identity',
      ...r,
      relevance: this.calculateIdentityRelevance(r, pattern.exact)
    }));
  }

  async searchPatterns(pattern, limit, offset) {
    // Search addresses with detected patterns
    const results = await this.db.all(`
      SELECT DISTINCT
        p.address,
        a.display_name,
        p.pattern_type,
        p.severity,
        p.detected_at,
        COUNT(DISTINCT p.pattern_type) as pattern_count,
        MAX(p.severity) as max_severity
      FROM patterns p
      JOIN accounts a ON p.address = a.address
      WHERE p.address LIKE ?
         OR a.display_name LIKE ?
      GROUP BY p.address
      ORDER BY max_severity DESC, pattern_count DESC
      LIMIT ? OFFSET ?
    `, [pattern.contains, pattern.contains, limit, offset]);
    
    return results.map(r => ({
      type: 'pattern',
      ...r,
      relevance: r.max_severity
    }));
  }

  calculateAddressRelevance(result, query) {
    let score = 0;
    
    // Exact match
    if (result.address === query) score += 100;
    // Prefix match
    else if (result.address.startsWith(query)) score += 50;
    // Contains match
    else if (result.address.includes(query)) score += 25;
    
    // Boost for verified accounts
    if (result.is_verified) score += 20;
    
    // Boost for high activity
    const activity = Number(result.total_sent || 0) + Number(result.total_received || 0);
    if (activity > 0) {
      score += Math.min(Math.log10(activity) * 5, 20);
    }
    
    return score;
  }

  calculateIdentityRelevance(result, query) {
    let score = 0;
    const name = (result.display_name || '').toLowerCase();
    const queryLower = query.toLowerCase();
    
    // Exact match
    if (name === queryLower) score += 100;
    // Prefix match
    else if (name.startsWith(queryLower)) score += 70;
    // Word boundary match
    else if (name.split(/\s+/).some(word => word.startsWith(queryLower))) score += 50;
    // Contains match
    else if (name.includes(queryLower)) score += 30;
    
    // Boost for verified
    if (result.is_verified) score += 25;
    
    // Penalty for high risk
    if (result.risk_score > 50) score -= 10;
    
    return score;
  }

  mergeAndRank(results, query, sortBy) {
    const merged = [];
    
    // Combine all results
    results.addresses.forEach(r => merged.push({ ...r, resultType: 'address' }));
    results.identities.forEach(r => merged.push({ ...r, resultType: 'identity' }));
    results.patterns.forEach(r => merged.push({ ...r, resultType: 'pattern' }));
    
    // Sort based on criteria
    switch (sortBy) {
      case 'relevance':
        merged.sort((a, b) => b.relevance - a.relevance);
        break;
      
      case 'risk':
        merged.sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
        break;
      
      case 'activity':
        merged.sort((a, b) => {
          const activityA = Number(a.total_sent || 0) + Number(a.total_received || 0);
          const activityB = Number(b.total_sent || 0) + Number(b.total_received || 0);
          return activityB - activityA;
        });
        break;
      
      default:
        merged.sort((a, b) => b.relevance - a.relevance);
    }
    
    return merged;
  }

  /**
   * Search suggestions for autocomplete
   */
  async getSuggestions(query, limit = 10) {
    if (query.length < 2) return [];
    
    const pattern = this.prepareSearchPattern(query);
    
    // Get top matches from each category
    const [addresses, identities] = await Promise.all([
      this.db.all(`
        SELECT address, balance
        FROM accounts
        WHERE address LIKE ?
        ORDER BY balance DESC
        LIMIT ?
      `, [pattern.prefix, Math.ceil(limit / 2)]),
      
      this.db.all(`
        SELECT address, display_name
        FROM accounts
        WHERE display_name LIKE ?
        AND display_name IS NOT NULL
        ORDER BY LENGTH(display_name)
        LIMIT ?
      `, [pattern.contains, Math.ceil(limit / 2)])
    ]);
    
    // Combine and format
    const suggestions = [];
    
    addresses.forEach(a => {
      suggestions.push({
        type: 'address',
        value: a.address,
        label: this.truncateAddress(a.address),
        secondary: `Balance: ${this.formatBalance(a.balance)}`
      });
    });
    
    identities.forEach(i => {
      suggestions.push({
        type: 'identity',
        value: i.address,
        label: i.display_name,
        secondary: this.truncateAddress(i.address)
      });
    });
    
    return suggestions.slice(0, limit);
  }

  truncateAddress(address) {
    if (address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  }

  formatBalance(balance) {
    if (!balance) return '0';
    const num = Number(BigInt(balance) / 10_000_000_000n);
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}

// LRU Cache implementation
class LRUCache {
  constructor({ max = 100, ttl = 0 }) {
    this.max = max;
    this.ttl = ttl;
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (this.ttl > 0 && Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, item);
    
    return item.value;
  }

  set(key, value) {
    // Remove oldest if at capacity
    if (this.cache.size >= this.max && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }
}
```

## 5. Data Processing Pipeline

### Purpose
Efficiently process blockchain data with batching, state management, and error recovery.

### Implementation

```javascript
class DataProcessor {
  constructor(dbConnection, blockchainClient) {
    this.db = dbConnection;
    this.blockchain = blockchainClient;
    
    this.config = {
      batchSize: 100,
      checkpointInterval: 1000,
      maxRetries: 3,
      retryDelay: 5000
    };
    
    this.stats = {
      blocksProcessed: 0,
      transfersProcessed: 0,
      errors: 0,
      startTime: null
    };
  }

  /**
   * Main processing loop
   */
  async startProcessing(startBlock = null, endBlock = null) {
    this.stats.startTime = Date.now();
    
    // Get starting point
    const lastProcessed = await this.getLastProcessedBlock();
    const actualStart = startBlock || lastProcessed + 1;
    const actualEnd = endBlock || await this.blockchain.getLatestBlock();
    
    console.log(`Processing blocks ${actualStart} to ${actualEnd}`);
    
    // Process in batches
    for (let batchStart = actualStart; batchStart <= actualEnd; batchStart += this.config.batchSize) {
      const batchEnd = Math.min(batchStart + this.config.batchSize - 1, actualEnd);
      
      try {
        await this.processBatch(batchStart, batchEnd);
        
        // Checkpoint progress
        if ((batchEnd - actualStart) % this.config.checkpointInterval === 0) {
          await this.checkpoint(batchEnd);
        }
      } catch (error) {
        console.error(`Error processing batch ${batchStart}-${batchEnd}:`, error);
        this.stats.errors++;
        
        // Retry logic
        const success = await this.retryBatch(batchStart, batchEnd);
        if (!success) {
          throw new Error(`Failed to process batch after ${this.config.maxRetries} retries`);
        }
      }
    }
    
    // Final checkpoint
    await this.checkpoint(actualEnd);
    
    // Update statistics and derived data
    await this.updateDerivedData();
    
    return this.getProcessingStats();
  }

  async processBatch(startBlock, endBlock) {
    console.log(`Processing batch: blocks ${startBlock}-${endBlock}`);
    
    // Fetch blocks in parallel
    const blockPromises = [];
    for (let i = startBlock; i <= endBlock; i++) {
      blockPromises.push(this.blockchain.getBlock(i));
    }
    
    const blocks = await Promise.all(blockPromises);
    
    // Begin transaction
    await this.db.run('BEGIN TRANSACTION');
    
    try {
      for (const block of blocks) {
        await this.processBlock(block);
      }
      
      await this.db.run('COMMIT');
      this.stats.blocksProcessed += blocks.length;
    } catch (error) {
      await this.db.run('ROLLBACK');
      throw error;
    }
  }

  async processBlock(block) {
    // Save block metadata
    await this.db.run(`
      INSERT OR REPLACE INTO blocks 
      (number, hash, parent_hash, timestamp, processed)
      VALUES (?, ?, ?, ?, ?)
    `, [
      block.number,
      block.hash,
      block.parentHash,
      block.timestamp,
      true
    ]);
    
    // Process extrinsics
    for (const [index, extrinsic] of block.extrinsics.entries()) {
      await this.processExtrinsic(extrinsic, block.number, index);
    }
  }

  async processExtrinsic(extrinsic, blockNumber, extrinsicIndex) {
    // Extract events
    const events = extrinsic.events || [];
    
    for (const event of events) {
      if (this.isTransferEvent(event)) {
        await this.processTransfer(event, blockNumber, extrinsicIndex, extrinsic.hash);
      }
    }
  }

  isTransferEvent(event) {
    // Check for various transfer event types
    return (
      (event.section === 'balances' && event.method === 'Transfer') ||
      (event.section === 'assets' && event.method === 'Transferred') ||
      (event.section === 'tokens' && event.method === 'Transfer')
    );
  }

  async processTransfer(event, blockNumber, extrinsicIndex, extrinsicHash) {
    const { from, to, amount, assetId } = this.extractTransferData(event);
    
    // Ensure accounts exist
    await this.ensureAccount(from);
    await this.ensureAccount(to);
    
    // Insert transfer
    await this.db.run(`
      INSERT INTO transfers 
      (block_number, extrinsic_index, from_address, to_address, 
       asset_id, amount, hash, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      blockNumber,
      extrinsicIndex,
      from,
      to,
      assetId || 'DOT',
      amount.toString(),
      extrinsicHash,
      Math.floor(Date.now() / 1000)
    ]);
    
    // Update transfer statistics
    await this.updateTransferStats(from, to, amount);
    
    this.stats.transfersProcessed++;
  }

  extractTransferData(event) {
    // Handle different event formats
    if (event.section === 'balances') {
      return {
        from: event.data[0].toString(),
        to: event.data[1].toString(),
        amount: event.data[2].toBigInt(),
        assetId: null
      };
    } else if (event.section === 'assets') {
      return {
        from: event.data[1].toString(),
        to: event.data[2].toString(),
        amount: event.data[3].toBigInt(),
        assetId: event.data[0].toString()
      };
    }
    
    throw new Error(`Unknown transfer event format: ${event.section}.${event.method}`);
  }

  async ensureAccount(address) {
    await this.db.run(`
      INSERT OR IGNORE INTO accounts (address) VALUES (?)
    `, [address]);
  }

  async updateTransferStats(from, to, amount) {
    // Update sender stats
    await this.db.run(`
      INSERT INTO account_stats (address, total_sent, sent_count)
      VALUES (?, ?, 1)
      ON CONFLICT(address) DO UPDATE SET
        total_sent = CAST(CAST(total_sent AS INTEGER) + ? AS TEXT),
        sent_count = sent_count + 1,
        last_activity = strftime('%s', 'now')
    `, [from, amount.toString(), amount.toString()]);
    
    // Update receiver stats
    await this.db.run(`
      INSERT INTO account_stats (address, total_received, received_count)
      VALUES (?, ?, 1)
      ON CONFLICT(address) DO UPDATE SET
        total_received = CAST(CAST(total_received AS INTEGER) + ? AS TEXT),
        received_count = received_count + 1,
        last_activity = strftime('%s', 'now')
    `, [to, amount.toString(), amount.toString()]);
    
    // Update transfer relationship
    await this.db.run(`
      INSERT INTO transfer_stats 
      (from_address, to_address, total_volume, transfer_count, first_transfer, last_transfer)
      VALUES (?, ?, ?, 1, strftime('%s', 'now'), strftime('%s', 'now'))
      ON CONFLICT(from_address, to_address) DO UPDATE SET
        total_volume = CAST(CAST(total_volume AS INTEGER) + ? AS TEXT),
        transfer_count = transfer_count + 1,
        last_transfer = strftime('%s', 'now')
    `, [from, to, amount.toString(), amount.toString()]);
  }

  async checkpoint(blockNumber) {
    await this.db.run(`
      INSERT OR REPLACE INTO processing_state 
      (id, last_processed_block, last_update_time, processed_transfers)
      VALUES (1, ?, ?, ?)
    `, [blockNumber, Math.floor(Date.now() / 1000), this.stats.transfersProcessed]);
    
    console.log(`Checkpoint: block ${blockNumber}, transfers: ${this.stats.transfersProcessed}`);
  }

  async getLastProcessedBlock() {
    const state = await this.db.get(
      'SELECT last_processed_block FROM processing_state WHERE id = 1'
    );
    return state?.last_processed_block || 0;
  }

  async retryBatch(startBlock, endBlock, retryCount = 0) {
    if (retryCount >= this.config.maxRetries) {
      return false;
    }
    
    console.log(`Retrying batch ${startBlock}-${endBlock} (attempt ${retryCount + 1})`);
    
    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
    
    try {
      await this.processBatch(startBlock, endBlock);
      return true;
    } catch (error) {
      return this.retryBatch(startBlock, endBlock, retryCount + 1);
    }
  }

  async updateDerivedData() {
    console.log('Updating derived data...');
    
    // Update account statistics
    await this.db.run(`
      UPDATE account_stats
      SET unique_senders = (
        SELECT COUNT(DISTINCT from_address)
        FROM transfers
        WHERE to_address = account_stats.address
      ),
      unique_receivers = (
        SELECT COUNT(DISTINCT to_address)
        FROM transfers
        WHERE from_address = account_stats.address
      )
    `);
    
    // Update risk scores
    const patternDetector = new PatternDetector(this.db);
    const accounts = await this.db.all(
      'SELECT address FROM account_stats WHERE last_activity > ?',
      [Math.floor(Date.now() / 1000) - 86400] // Last 24 hours
    );
    
    for (const account of accounts) {
      const patterns = await patternDetector.detectPatterns(account.address);
      if (patterns.riskScore > 0) {
        await this.db.run(
          'UPDATE account_stats SET risk_score = ? WHERE address = ?',
          [patterns.riskScore, account.address]
        );
      }
    }
  }

  getProcessingStats() {
    const duration = Date.now() - this.stats.startTime;
    const blocksPerSecond = this.stats.blocksProcessed / (duration / 1000);
    const transfersPerSecond = this.stats.transfersProcessed / (duration / 1000);
    
    return {
      ...this.stats,
      duration,
      blocksPerSecond: blocksPerSecond.toFixed(2),
      transfersPerSecond: transfersPerSecond.toFixed(2)
    };
  }
}
```

## Summary

These algorithms provide a comprehensive foundation for blockchain analysis:

1. **Identity Resolution**: Links addresses to human-readable identities
2. **Graph Building**: Creates network visualizations from transfer data
3. **Pattern Detection**: Identifies suspicious behavior using multiple heuristics
4. **Search Engine**: Provides fast, fuzzy search across all data types
5. **Data Processing**: Efficiently processes blockchain data with error recovery

Each algorithm is designed to work with SQLite for simplicity while maintaining good performance through proper indexing and caching strategies.