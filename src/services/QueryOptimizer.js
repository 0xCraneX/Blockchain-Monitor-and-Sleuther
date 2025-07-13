/**
 * QueryOptimizer - Intelligent query optimization and execution planning
 * 
 * Features:
 * - Query plan caching and reuse
 * - Automatic index usage detection
 * - Query rewriting for better performance
 * - Parallel query execution where possible
 * - Query performance tracking and analysis
 */

import { BaseService } from './BaseService.js';

export class QueryOptimizer extends BaseService {
  constructor(databaseService, dataCacheService) {
    super('QueryOptimizer', { database: databaseService, cache: dataCacheService });
    
    this.queryPlans = new Map();
    this.performanceHistory = new Map();
    
    // Optimization rules
    this.optimizationRules = [
      this.optimizeVolumeFilters.bind(this),
      this.optimizeTimeRangeQueries.bind(this),
      this.optimizeJoinOrder.bind(this),
      this.addIndexHints.bind(this),
      this.rewriteSubqueries.bind(this)
    ];
    
    // Query patterns that benefit from specific optimizations
    this.queryPatterns = {
      graphTraversal: /account_relationships.*WHERE.*depth/i,
      volumeAnalysis: /total_volume.*ORDER BY/i,
      timeSeriesQuery: /timestamp.*BETWEEN/i,
      patternDetection: /patterns.*JOIN.*transfers/i
    };
  }

  /**
   * Execute an optimized query with caching
   */
  async executeQuery(query, params = {}, options = {}) {
    return this.execute('executeQuery', async () => {
      const {
        cache = true,
        cacheTTL = 300,
        timeout = 30000,
        explain = false
      } = options;

      // Generate query fingerprint
      const queryId = this.generateQueryId(query, params);
      
      // Check if we have a cached result
      if (cache) {
        const cached = await this.cache.cacheQuery(query, params, 
          () => this.runOptimizedQuery(query, params, options),
          { ttl: cacheTTL }
        );
        
        if (cached !== null) return cached;
      }

      // Optimize and execute query
      const startTime = Date.now();
      const optimizedQuery = this.optimizeQuery(query, params);
      
      if (explain) {
        return this.explainQuery(optimizedQuery, params);
      }

      const result = await this.runOptimizedQuery(optimizedQuery, params, options);
      
      // Track performance
      this.trackQueryPerformance(queryId, {
        originalQuery: query,
        optimizedQuery,
        executionTime: Date.now() - startTime,
        rowCount: Array.isArray(result) ? result.length : 1
      });

      return result;
    }, this.generateQueryId(query, params));
  }

  /**
   * Run multiple queries in parallel when possible
   */
  async executeParallel(queries, options = {}) {
    return this.execute('executeParallel', async () => {
      // Analyze queries for dependencies
      const groups = this.groupIndependentQueries(queries);
      const results = [];

      for (const group of groups) {
        // Execute independent queries in parallel
        const groupResults = await Promise.all(
          group.map(({ query, params }) => 
            this.executeQuery(query, params, options)
          )
        );
        results.push(...groupResults);
      }

      return results;
    }, queries.length);
  }

  /**
   * Optimize a query based on patterns and rules
   */
  optimizeQuery(query, params) {
    let optimized = query;

    // Apply optimization rules
    for (const rule of this.optimizationRules) {
      optimized = rule(optimized, params);
    }

    // Add query hints based on patterns
    const pattern = this.detectQueryPattern(optimized);
    if (pattern) {
      optimized = this.applyPatternOptimizations(optimized, pattern);
    }

    return optimized;
  }

  /**
   * Optimization Rules
   */

  optimizeVolumeFilters(query, params) {
    // Use indexed volume columns when filtering
    if (query.includes('total_volume') && query.includes('WHERE')) {
      return query.replace(
        /CAST\(total_volume AS (INTEGER|REAL)\)/gi,
        'total_volume'
      ).replace(
        /WHERE (.*?)total_volume/i,
        'WHERE indexed(total_volume) AND $1total_volume'
      );
    }
    return query;
  }

  optimizeTimeRangeQueries(query, params) {
    // Optimize time range queries to use indexes
    const timeRangePattern = /WHERE.*timestamp.*BETWEEN\s*\?\s*AND\s*\?/i;
    if (timeRangePattern.test(query)) {
      // Add index hint for timestamp
      return query.replace(
        /FROM transfers/i,
        'FROM transfers INDEXED BY idx_transfers_timestamp'
      );
    }
    return query;
  }

  optimizeJoinOrder(query, params) {
    // Reorder joins based on selectivity
    if (query.includes('JOIN') && query.includes('account_relationships')) {
      // Put more selective tables first
      const joins = this.extractJoins(query);
      const reordered = this.reorderJoinsBySelectivity(joins);
      return this.reconstructQueryWithJoins(query, reordered);
    }
    return query;
  }

  addIndexHints(query, params) {
    // Add index hints for commonly used indexes
    const hints = {
      'account_relationships': 'idx_relationships_composite',
      'transfers': 'idx_transfers_composite',
      'patterns': 'idx_patterns_composite'
    };

    let optimized = query;
    for (const [table, index] of Object.entries(hints)) {
      if (optimized.includes(table) && !optimized.includes('INDEXED BY')) {
        optimized = optimized.replace(
          new RegExp(`FROM ${table}`, 'i'),
          `FROM ${table} INDEXED BY ${index}`
        );
      }
    }

    return optimized;
  }

  rewriteSubqueries(query, params) {
    // Convert correlated subqueries to joins when possible
    const correlatedPattern = /WHERE.*IN\s*\(\s*SELECT.*WHERE.*=.*\.\w+/i;
    if (correlatedPattern.test(query)) {
      // This is a simplified example - real implementation would be more complex
      return query.replace(
        /WHERE (\w+) IN \(SELECT (\w+) FROM (\w+) WHERE (\w+) = (\w+)\.(\w+)\)/i,
        'JOIN $3 ON $1 = $3.$2 AND $3.$4 = $5.$6'
      );
    }
    return query;
  }

  /**
   * Pattern-specific optimizations
   */
  
  applyPatternOptimizations(query, pattern) {
    switch (pattern) {
      case 'graphTraversal':
        // Use recursive CTEs efficiently
        return this.optimizeGraphTraversal(query);
      
      case 'volumeAnalysis':
        // Use pre-calculated aggregates
        return this.optimizeVolumeAnalysis(query);
      
      case 'timeSeriesQuery':
        // Partition by time ranges
        return this.optimizeTimeSeries(query);
      
      case 'patternDetection':
        // Use specialized indexes
        return this.optimizePatternDetection(query);
      
      default:
        return query;
    }
  }

  optimizeGraphTraversal(query) {
    // Add depth limit hints
    if (!query.includes('LIMIT')) {
      return query.replace(
        /WHERE depth <= (\d+)/i,
        'WHERE depth <= $1 LIMIT 1000'
      );
    }
    return query;
  }

  optimizeVolumeAnalysis(query) {
    // Use materialized views for common aggregations
    if (query.includes('SUM(') || query.includes('AVG(')) {
      return query.replace(
        /FROM account_relationships/i,
        'FROM account_relationships /* USE AGGREGATE CACHE */'
      );
    }
    return query;
  }

  optimizeTimeSeries(query) {
    // Add time-based partitioning hints
    return query.replace(
      /ORDER BY timestamp/i,
      'ORDER BY timestamp /* USE TIME INDEX */'
    );
  }

  optimizePatternDetection(query) {
    // Force use of pattern-specific indexes
    return query.replace(
      /FROM patterns/i,
      'FROM patterns INDEXED BY idx_patterns_confidence'
    );
  }

  /**
   * Query execution
   */
  
  async runOptimizedQuery(query, params, options) {
    const { timeout = 30000 } = options;
    
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), timeout)
    );

    // Prepare statement
    const stmt = this.db.prepare(query);
    
    // Execute with timeout
    try {
      const executePromise = new Promise((resolve) => {
        const result = params ? stmt.all(params) : stmt.all();
        resolve(result);
      });

      return await Promise.race([executePromise, timeoutPromise]);
    } catch (error) {
      this.logger.error('Query execution failed', { query, error: error.message });
      throw error;
    }
  }

  /**
   * Query analysis and planning
   */
  
  async explainQuery(query, params) {
    const explainQuery = `EXPLAIN QUERY PLAN ${query}`;
    const stmt = this.db.prepare(explainQuery);
    const plan = params ? stmt.all(params) : stmt.all();
    
    return {
      query,
      plan,
      optimizations: this.analyzeQueryPlan(plan),
      estimatedCost: this.estimateQueryCost(plan)
    };
  }

  analyzeQueryPlan(plan) {
    const optimizations = [];
    
    for (const step of plan) {
      if (step.detail.includes('SCAN')) {
        optimizations.push({
          type: 'warning',
          message: `Table scan detected: ${step.detail}`,
          suggestion: 'Consider adding an index'
        });
      }
      
      if (step.detail.includes('TEMP B-TREE')) {
        optimizations.push({
          type: 'info',
          message: 'Temporary B-tree for sorting',
          suggestion: 'Consider pre-sorting data or adding ORDER BY index'
        });
      }
    }
    
    return optimizations;
  }

  estimateQueryCost(plan) {
    let cost = 0;
    
    for (const step of plan) {
      if (step.detail.includes('SCAN')) cost += 1000;
      if (step.detail.includes('SEARCH')) cost += 10;
      if (step.detail.includes('SORT')) cost += 100;
      if (step.detail.includes('TEMP')) cost += 500;
    }
    
    return cost;
  }

  /**
   * Performance tracking
   */
  
  trackQueryPerformance(queryId, metrics) {
    // Store in memory
    this.performanceHistory.set(queryId, {
      ...metrics,
      timestamp: Date.now()
    });

    // Store in database for long-term analysis
    this.db.prepare(`
      INSERT INTO query_performance 
      (query_hash, query_type, execution_time_ms, rows_returned)
      VALUES (?, ?, ?, ?)
    `).run(
      queryId,
      this.detectQueryType(metrics.originalQuery),
      metrics.executionTime,
      metrics.rowCount
    );
  }

  /**
   * Utility methods
   */
  
  generateQueryId(query, params) {
    const normalized = query.replace(/\s+/g, ' ').trim().toLowerCase();
    return this.cache.hashData(normalized + JSON.stringify(params));
  }

  detectQueryPattern(query) {
    for (const [pattern, regex] of Object.entries(this.queryPatterns)) {
      if (regex.test(query)) {
        return pattern;
      }
    }
    return null;
  }

  detectQueryType(query) {
    if (query.match(/^SELECT/i)) {
      if (query.includes('account_relationships')) return 'graph';
      if (query.includes('patterns')) return 'pattern';
      if (query.includes('transfers')) return 'transfer';
      return 'select';
    }
    return 'other';
  }

  groupIndependentQueries(queries) {
    // Simple implementation - group queries that don't share tables
    const groups = [];
    const used = new Set();

    for (const query of queries) {
      const tables = this.extractTables(query.query);
      const canGroup = !tables.some(t => used.has(t));
      
      if (canGroup) {
        groups.push([query]);
        tables.forEach(t => used.add(t));
      } else {
        // Start new group
        used.clear();
        groups.push([query]);
        tables.forEach(t => used.add(t));
      }
    }

    return groups;
  }

  extractTables(query) {
    const tables = [];
    const tablePattern = /(?:FROM|JOIN)\s+(\w+)/gi;
    let match;
    
    while ((match = tablePattern.exec(query)) !== null) {
      tables.push(match[1]);
    }
    
    return tables;
  }

  extractJoins(query) {
    // Extract and parse JOIN clauses
    const joins = [];
    const joinPattern = /JOIN\s+(\w+)\s+(?:AS\s+\w+\s+)?ON\s+([^J]+)/gi;
    let match;
    
    while ((match = joinPattern.exec(query)) !== null) {
      joins.push({
        table: match[1],
        condition: match[2].trim()
      });
    }
    
    return joins;
  }

  reorderJoinsBySelectivity(joins) {
    // Estimate selectivity based on join conditions
    return joins.sort((a, b) => {
      const aSelectivity = this.estimateJoinSelectivity(a);
      const bSelectivity = this.estimateJoinSelectivity(b);
      return aSelectivity - bSelectivity;
    });
  }

  estimateJoinSelectivity(join) {
    // Simple heuristic - joins on primary keys are more selective
    if (join.condition.includes('.id =')) return 1;
    if (join.condition.includes('address =')) return 2;
    if (join.condition.includes('volume')) return 3;
    return 4;
  }

  reconstructQueryWithJoins(query, joins) {
    // Rebuild query with reordered joins
    // This is a simplified implementation
    let result = query.substring(0, query.indexOf('JOIN'));
    
    for (const join of joins) {
      result += ` JOIN ${join.table} ON ${join.condition}`;
    }
    
    // Add the rest of the query
    const remainderMatch = query.match(/WHERE.*/is);
    if (remainderMatch) {
      result += ' ' + remainderMatch[0];
    }
    
    return result;
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats() {
    const stats = this.db.prepare(`
      SELECT 
        query_type,
        COUNT(*) as count,
        AVG(execution_time_ms) as avg_time,
        MAX(execution_time_ms) as max_time,
        SUM(rows_returned) as total_rows
      FROM query_performance
      WHERE created_at > datetime('now', '-1 day')
      GROUP BY query_type
    `).all();

    return {
      queryStats: stats,
      cachedPlans: this.queryPlans.size,
      recentQueries: this.performanceHistory.size
    };
  }
}