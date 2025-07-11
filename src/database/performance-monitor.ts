/**
 * Real-time Performance Monitoring for Graph Queries
 * 
 * Provides monitoring, alerting, and automatic query optimization
 * based on runtime performance characteristics.
 */

import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import path from 'path';

interface QueryMetrics {
  queryId: string;
  query: string;
  params: any[];
  startTime: number;
  endTime: number;
  duration: number;
  rowsReturned: number;
  memoryUsed: number;
  cacheHit: boolean;
  error?: string;
}

interface PerformanceAlert {
  severity: 'warning' | 'critical';
  type: 'duration' | 'memory' | 'result_size' | 'error_rate';
  message: string;
  metrics: QueryMetrics;
  timestamp: number;
}

interface PerformanceThresholds {
  query: {
    warning: number;
    critical: number;
    timeout: number;
  };
  memory: {
    warning: number;
    critical: number;
  };
  resultSize: {
    warning: number;
    critical: number;
  };
  errorRate: {
    warning: number;
    critical: number;
  };
}

class PerformanceMonitor extends EventEmitter {
  private db: Database.Database;
  private metrics: Map<string, QueryMetrics[]> = new Map();
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private thresholds: PerformanceThresholds;
  private metricsFile: string;
  private isRecording: boolean = true;

  constructor(db: Database.Database, config?: Partial<PerformanceThresholds>) {
    super();
    this.db = db;
    
    // Default thresholds for interactive desktop app
    this.thresholds = {
      query: {
        warning: config?.query?.warning || 1000,      // 1 second
        critical: config?.query?.critical || 5000,    // 5 seconds
        timeout: config?.query?.timeout || 10000      // 10 seconds
      },
      memory: {
        warning: config?.memory?.warning || 100 * 1024 * 1024,    // 100MB
        critical: config?.memory?.critical || 500 * 1024 * 1024   // 500MB
      },
      resultSize: {
        warning: config?.resultSize?.warning || 1000,    // rows
        critical: config?.resultSize?.critical || 10000   // rows
      },
      errorRate: {
        warning: config?.errorRate?.warning || 0.05,     // 5%
        critical: config?.errorRate?.critical || 0.1      // 10%
      }
    };
    
    this.metricsFile = path.join(process.cwd(), 'query-metrics.json');
    this.loadHistoricalMetrics();
    
    // Periodic cleanup
    setInterval(() => this.cleanupCache(), 60000); // Every minute
    setInterval(() => this.analyzePerformanceTrends(), 300000); // Every 5 minutes
  }

  /**
   * Wrap a query with performance monitoring
   */
  async monitorQuery<T>(
    queryId: string,
    query: string | Database.Statement,
    params: any[] = [],
    options: { cache?: boolean; timeout?: number } = {}
  ): Promise<T> {
    const cacheKey = `${queryId}:${JSON.stringify(params)}`;
    
    // Check cache first
    if (options.cache) {
      const cached = this.getFromCache(cacheKey);
      if (cached !== null) {
        this.recordMetrics({
          queryId,
          query: query.toString(),
          params,
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 0,
          rowsReturned: Array.isArray(cached) ? cached.length : 1,
          memoryUsed: 0,
          cacheHit: true
        });
        return cached;
      }
    }
    
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    const timeout = options.timeout || this.thresholds.query.timeout;
    
    try {
      // Execute with timeout
      const result = await this.executeWithTimeout<T>(query, params, timeout);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      const memoryUsed = process.memoryUsage().heapUsed - startMemory;
      const rowsReturned = Array.isArray(result) ? result.length : 1;
      
      // Record metrics
      const metrics: QueryMetrics = {
        queryId,
        query: query.toString(),
        params,
        startTime: Date.now(),
        endTime: Date.now() + duration,
        duration,
        rowsReturned,
        memoryUsed,
        cacheHit: false
      };
      
      this.recordMetrics(metrics);
      this.checkThresholds(metrics);
      
      // Cache if enabled and result is reasonable size
      if (options.cache && rowsReturned < this.thresholds.resultSize.critical) {
        this.addToCache(cacheKey, result);
      }
      
      return result;
      
    } catch (error) {
      const duration = performance.now() - startTime;
      
      const metrics: QueryMetrics = {
        queryId,
        query: query.toString(),
        params,
        startTime: Date.now(),
        endTime: Date.now() + duration,
        duration,
        rowsReturned: 0,
        memoryUsed: 0,
        cacheHit: false,
        error: error.message
      };
      
      this.recordMetrics(metrics);
      this.checkThresholds(metrics);
      
      throw error;
    }
  }

  /**
   * Execute query with timeout (SQLite doesn't support query cancellation)
   */
  private async executeWithTimeout<T>(
    query: string | Database.Statement,
    params: any[],
    timeout: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Query timeout after ${timeout}ms`));
      }, timeout);
      
      try {
        let result: T;
        
        if (typeof query === 'string') {
          const stmt = this.db.prepare(query);
          result = stmt.all(...params) as T;
        } else {
          result = query.all(...params) as T;
        }
        
        clearTimeout(timer);
        resolve(result);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * Record query metrics
   */
  private recordMetrics(metrics: QueryMetrics) {
    if (!this.isRecording) return;
    
    if (!this.metrics.has(metrics.queryId)) {
      this.metrics.set(metrics.queryId, []);
    }
    
    const queryMetrics = this.metrics.get(metrics.queryId)!;
    queryMetrics.push(metrics);
    
    // Keep only recent metrics (last 1000 per query)
    if (queryMetrics.length > 1000) {
      queryMetrics.shift();
    }
    
    // Emit metrics event for real-time monitoring
    this.emit('metrics', metrics);
  }

  /**
   * Check performance thresholds and emit alerts
   */
  private checkThresholds(metrics: QueryMetrics) {
    const alerts: PerformanceAlert[] = [];
    
    // Duration checks
    if (metrics.duration > this.thresholds.query.critical) {
      alerts.push({
        severity: 'critical',
        type: 'duration',
        message: `Query ${metrics.queryId} took ${metrics.duration.toFixed(0)}ms (critical threshold: ${this.thresholds.query.critical}ms)`,
        metrics,
        timestamp: Date.now()
      });
    } else if (metrics.duration > this.thresholds.query.warning) {
      alerts.push({
        severity: 'warning',
        type: 'duration',
        message: `Query ${metrics.queryId} took ${metrics.duration.toFixed(0)}ms (warning threshold: ${this.thresholds.query.warning}ms)`,
        metrics,
        timestamp: Date.now()
      });
    }
    
    // Memory checks
    if (metrics.memoryUsed > this.thresholds.memory.critical) {
      alerts.push({
        severity: 'critical',
        type: 'memory',
        message: `Query ${metrics.queryId} used ${(metrics.memoryUsed / 1024 / 1024).toFixed(2)}MB memory`,
        metrics,
        timestamp: Date.now()
      });
    } else if (metrics.memoryUsed > this.thresholds.memory.warning) {
      alerts.push({
        severity: 'warning',
        type: 'memory',
        message: `Query ${metrics.queryId} used ${(metrics.memoryUsed / 1024 / 1024).toFixed(2)}MB memory`,
        metrics,
        timestamp: Date.now()
      });
    }
    
    // Result size checks
    if (metrics.rowsReturned > this.thresholds.resultSize.critical) {
      alerts.push({
        severity: 'critical',
        type: 'result_size',
        message: `Query ${metrics.queryId} returned ${metrics.rowsReturned} rows`,
        metrics,
        timestamp: Date.now()
      });
    } else if (metrics.rowsReturned > this.thresholds.resultSize.warning) {
      alerts.push({
        severity: 'warning',
        type: 'result_size',
        message: `Query ${metrics.queryId} returned ${metrics.rowsReturned} rows`,
        metrics,
        timestamp: Date.now()
      });
    }
    
    // Emit alerts
    alerts.forEach(alert => this.emit('alert', alert));
  }

  /**
   * Analyze performance trends
   */
  private analyzePerformanceTrends() {
    const analysis: any = {
      timestamp: Date.now(),
      queries: {}
    };
    
    for (const [queryId, metrics] of this.metrics) {
      if (metrics.length < 10) continue;
      
      const recent = metrics.slice(-50);
      const durations = recent.map(m => m.duration);
      const errors = recent.filter(m => m.error).length;
      const cacheHits = recent.filter(m => m.cacheHit).length;
      
      analysis.queries[queryId] = {
        sampleSize: recent.length,
        avgDuration: this.average(durations),
        medianDuration: this.median(durations),
        p95Duration: this.percentile(durations, 0.95),
        maxDuration: Math.max(...durations),
        errorRate: errors / recent.length,
        cacheHitRate: cacheHits / recent.length,
        trend: this.calculateTrend(durations)
      };
      
      // Check for performance degradation
      if (analysis.queries[queryId].trend > 0.2) {
        this.emit('alert', {
          severity: 'warning',
          type: 'duration',
          message: `Performance degradation detected for ${queryId}: ${(analysis.queries[queryId].trend * 100).toFixed(1)}% increase`,
          metrics: recent[recent.length - 1],
          timestamp: Date.now()
        });
      }
      
      // Check error rates
      if (analysis.queries[queryId].errorRate > this.thresholds.errorRate.critical) {
        this.emit('alert', {
          severity: 'critical',
          type: 'error_rate',
          message: `High error rate for ${queryId}: ${(analysis.queries[queryId].errorRate * 100).toFixed(1)}%`,
          metrics: recent[recent.length - 1],
          timestamp: Date.now()
        });
      }
    }
    
    // Save analysis
    this.saveMetrics();
    
    return analysis;
  }

  /**
   * Get performance report
   */
  getPerformanceReport() {
    const report: any = {
      timestamp: Date.now(),
      summary: {
        totalQueries: 0,
        totalDuration: 0,
        totalErrors: 0,
        cacheHitRate: 0
      },
      queries: {}
    };
    
    let totalCacheHits = 0;
    
    for (const [queryId, metrics] of this.metrics) {
      const durations = metrics.map(m => m.duration);
      const errors = metrics.filter(m => m.error).length;
      const cacheHits = metrics.filter(m => m.cacheHit).length;
      const memoryUsages = metrics.map(m => m.memoryUsed);
      
      report.queries[queryId] = {
        callCount: metrics.length,
        avgDuration: this.average(durations),
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        p50Duration: this.percentile(durations, 0.5),
        p95Duration: this.percentile(durations, 0.95),
        p99Duration: this.percentile(durations, 0.99),
        avgMemory: this.average(memoryUsages),
        maxMemory: Math.max(...memoryUsages),
        errorCount: errors,
        errorRate: errors / metrics.length,
        cacheHitRate: cacheHits / metrics.length,
        lastExecuted: metrics[metrics.length - 1]?.endTime
      };
      
      report.summary.totalQueries += metrics.length;
      report.summary.totalDuration += durations.reduce((a, b) => a + b, 0);
      report.summary.totalErrors += errors;
      totalCacheHits += cacheHits;
    }
    
    report.summary.avgDuration = report.summary.totalDuration / report.summary.totalQueries;
    report.summary.errorRate = report.summary.totalErrors / report.summary.totalQueries;
    report.summary.cacheHitRate = totalCacheHits / report.summary.totalQueries;
    
    return report;
  }

  /**
   * Get query recommendations based on performance data
   */
  getOptimizationRecommendations() {
    const recommendations: any[] = [];
    
    for (const [queryId, metrics] of this.metrics) {
      if (metrics.length < 10) continue;
      
      const recent = metrics.slice(-50);
      const avgDuration = this.average(recent.map(m => m.duration));
      const maxDuration = Math.max(...recent.map(m => m.duration));
      const avgRows = this.average(recent.map(m => m.rowsReturned));
      const cacheHitRate = recent.filter(m => m.cacheHit).length / recent.length;
      
      // Slow queries
      if (avgDuration > this.thresholds.query.warning) {
        recommendations.push({
          queryId,
          type: 'performance',
          severity: avgDuration > this.thresholds.query.critical ? 'high' : 'medium',
          recommendation: 'Consider adding indexes, reducing result set, or implementing pagination',
          metrics: { avgDuration, maxDuration }
        });
      }
      
      // Large result sets
      if (avgRows > this.thresholds.resultSize.warning) {
        recommendations.push({
          queryId,
          type: 'result_size',
          severity: avgRows > this.thresholds.resultSize.critical ? 'high' : 'medium',
          recommendation: 'Implement pagination or add LIMIT clauses',
          metrics: { avgRows }
        });
      }
      
      // Low cache hit rate for frequently called queries
      if (metrics.length > 100 && cacheHitRate < 0.3) {
        recommendations.push({
          queryId,
          type: 'caching',
          severity: 'low',
          recommendation: 'Enable caching for this frequently called query',
          metrics: { callCount: metrics.length, cacheHitRate }
        });
      }
      
      // High variance in execution time
      const durations = recent.map(m => m.duration);
      const variance = this.variance(durations);
      const cv = Math.sqrt(variance) / avgDuration; // Coefficient of variation
      
      if (cv > 1) {
        recommendations.push({
          queryId,
          type: 'stability',
          severity: 'medium',
          recommendation: 'Query has unstable performance, investigate data distribution',
          metrics: { avgDuration, variance, cv }
        });
      }
    }
    
    return recommendations.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Cache management
   */
  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    // Check if cache is expired (5 minutes default)
    if (Date.now() - cached.timestamp > 300000) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  private addToCache(key: string, data: any) {
    // Limit cache size
    if (this.cache.size > 1000) {
      // Remove oldest entries
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      for (let i = 0; i < 100; i++) {
        this.cache.delete(entries[i][0]);
      }
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  private cleanupCache() {
    const now = Date.now();
    const expired: string[] = [];
    
    for (const [key, value] of this.cache) {
      if (now - value.timestamp > 300000) {
        expired.push(key);
      }
    }
    
    expired.forEach(key => this.cache.delete(key));
  }

  /**
   * Persistence
   */
  private saveMetrics() {
    if (!this.isRecording) return;
    
    const data = {
      timestamp: Date.now(),
      metrics: {}
    };
    
    for (const [queryId, metrics] of this.metrics) {
      // Save only summary statistics
      const durations = metrics.map(m => m.duration);
      data.metrics[queryId] = {
        sampleSize: metrics.length,
        avgDuration: this.average(durations),
        p95Duration: this.percentile(durations, 0.95),
        errorRate: metrics.filter(m => m.error).length / metrics.length
      };
    }
    
    try {
      writeFileSync(this.metricsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save metrics:', error);
    }
  }

  private loadHistoricalMetrics() {
    try {
      if (existsSync(this.metricsFile)) {
        const data = JSON.parse(readFileSync(this.metricsFile, 'utf-8'));
        // Could load historical data for trend analysis
      }
    } catch (error) {
      console.error('Failed to load historical metrics:', error);
    }
  }

  /**
   * Statistical utilities
   */
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  private variance(values: number[]): number {
    const avg = this.average(values);
    return this.average(values.map(v => Math.pow(v - avg, 2)));
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    // Simple linear regression
    const n = values.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    
    const sumX = indices.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
    const sumX2 = indices.reduce((sum, x) => sum + x * x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgY = sumY / n;
    
    // Return relative trend (slope as percentage of average)
    return avgY > 0 ? slope / avgY : 0;
  }

  /**
   * Control methods
   */
  startRecording() {
    this.isRecording = true;
  }

  stopRecording() {
    this.isRecording = false;
  }

  clearMetrics() {
    this.metrics.clear();
    this.cache.clear();
  }

  setThresholds(thresholds: Partial<PerformanceThresholds>) {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }
}

export { PerformanceMonitor, QueryMetrics, PerformanceAlert, PerformanceThresholds };