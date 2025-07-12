import { performance } from 'perf_hooks';
import { logger } from '../utils/logger.js';
import os from 'os';
import v8 from 'v8';

export class PerformanceProfiler {
  constructor() {
    this.metrics = new Map();
    this.activeOperations = new Map();
    this.memorySnapshots = [];
    this.cpuSnapshots = [];
    this.queryPerformance = new Map();

    // Performance thresholds (in milliseconds)
    this.thresholds = {
      api_response: 200,
      database_query: 100,
      graph_operation: 300,
      cache_operation: 50,
      websocket_message: 50
    };

    // Start continuous monitoring
    this.startMonitoring();
  }

  /**
   * Start timing an operation
   * @param {string} operationId - Unique identifier for the operation
   * @param {string} type - Type of operation (api_response, database_query, etc.)
   * @param {Object} metadata - Additional metadata about the operation
   */
  startOperation(operationId, type, metadata = {}) {
    const startTime = performance.now();
    const memoryBefore = process.memoryUsage();

    this.activeOperations.set(operationId, {
      type,
      startTime,
      memoryBefore,
      metadata
    });

    return operationId;
  }

  /**
   * End timing an operation and record metrics
   * @param {string} operationId - Operation identifier
   * @param {Object} additionalData - Additional data to record
   */
  endOperation(operationId, additionalData = {}) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      logger.warn({ operationId }, 'Attempted to end unknown operation');
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - operation.startTime;
    const memoryAfter = process.memoryUsage();

    const metrics = {
      operationId,
      type: operation.type,
      duration,
      startTime: operation.startTime,
      endTime,
      memoryUsage: {
        before: operation.memoryBefore,
        after: memoryAfter,
        delta: {
          rss: memoryAfter.rss - operation.memoryBefore.rss,
          heapUsed: memoryAfter.heapUsed - operation.memoryBefore.heapUsed,
          heapTotal: memoryAfter.heapTotal - operation.memoryBefore.heapTotal,
          external: memoryAfter.external - operation.memoryBefore.external
        }
      },
      metadata: { ...operation.metadata, ...additionalData },
      timestamp: new Date().toISOString(),
      isSlowOperation: duration > (this.thresholds[operation.type] || 1000)
    };

    // Store metrics
    if (!this.metrics.has(operation.type)) {
      this.metrics.set(operation.type, []);
    }
    this.metrics.get(operation.type).push(metrics);

    // Keep only last 1000 metrics per type
    const typeMetrics = this.metrics.get(operation.type);
    if (typeMetrics.length > 1000) {
      typeMetrics.shift();
    }

    // Clean up
    this.activeOperations.delete(operationId);

    // Log slow operations
    if (metrics.isSlowOperation) {
      logger.warn({
        operationId,
        type: operation.type,
        duration: duration.toFixed(2),
        threshold: this.thresholds[operation.type],
        metadata: operation.metadata
      }, 'Slow operation detected');
    }

    return metrics;
  }

  /**
   * Profile a database query
   * @param {string} query - SQL query
   * @param {Function} executor - Function that executes the query
   * @param {Object} params - Query parameters
   */
  async profileDatabaseQuery(query, executor, params = {}) {
    const operationId = `db_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queryHash = this._hashQuery(query);

    this.startOperation(operationId, 'database_query', {
      queryHash,
      queryPreview: query.substring(0, 100),
      paramCount: Object.keys(params).length
    });

    try {
      const result = await executor();

      const metrics = this.endOperation(operationId, {
        resultCount: Array.isArray(result) ? result.length : (result ? 1 : 0),
        success: true
      });

      // Track query performance patterns
      this._trackQueryPerformance(queryHash, metrics);

      return result;
    } catch (error) {
      this.endOperation(operationId, {
        error: error.message,
        success: false
      });
      throw error;
    }
  }

  /**
   * Profile an API endpoint
   * @param {Object} req - Express request object
   * @param {Function} handler - Route handler function
   */
  async profileAPIEndpoint(req, handler) {
    const operationId = `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const endpoint = `${req.method} ${req.route?.path || req.path}`;

    this.startOperation(operationId, 'api_response', {
      endpoint,
      method: req.method,
      path: req.path,
      queryParams: Object.keys(req.query).length,
      bodySize: req.get('content-length') || 0,
      userAgent: req.get('user-agent')
    });

    try {
      const result = await handler();

      this.endOperation(operationId, {
        responseSize: typeof result === 'string' ? result.length : JSON.stringify(result).length,
        success: true
      });

      return result;
    } catch (error) {
      this.endOperation(operationId, {
        error: error.message,
        success: false
      });
      throw error;
    }
  }

  /**
   * Get performance statistics for a specific operation type
   * @param {string} type - Operation type
   * @param {number} hours - Hours of data to analyze (default: 1)
   */
  getPerformanceStats(type, hours = 1) {
    const typeMetrics = this.metrics.get(type) || [];
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);

    const recentMetrics = typeMetrics.filter(m =>
      new Date(m.timestamp).getTime() > cutoff
    );

    if (recentMetrics.length === 0) {
      return {
        type,
        period: `${hours}h`,
        count: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        p95Duration: 0,
        p99Duration: 0,
        errorRate: 0,
        slowOperations: 0
      };
    }

    const durations = recentMetrics.map(m => m.duration).sort((a, b) => a - b);
    const errors = recentMetrics.filter(m => !m.metadata.success).length;
    const slowOps = recentMetrics.filter(m => m.isSlowOperation).length;

    return {
      type,
      period: `${hours}h`,
      count: recentMetrics.length,
      avgDuration: this._average(durations),
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      p95Duration: this._percentile(durations, 95),
      p99Duration: this._percentile(durations, 99),
      errorRate: ((errors / recentMetrics.length) * 100).toFixed(2),
      slowOperations: slowOps,
      slowOperationRate: ((slowOps / recentMetrics.length) * 100).toFixed(2)
    };
  }

  /**
   * Get current system performance metrics
   */
  getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const loadAvg = os.loadavg();
    const heapStats = v8.getHeapStatistics();

    return {
      timestamp: new Date().toISOString(),
      memory: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        heapUtilization: ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(2)
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        loadAverage: {
          '1min': loadAvg[0],
          '5min': loadAvg[1],
          '15min': loadAvg[2]
        }
      },
      heap: {
        totalHeapSize: heapStats.total_heap_size,
        totalHeapSizeExecutable: heapStats.total_heap_size_executable,
        totalPhysicalSize: heapStats.total_physical_size,
        totalAvailableSize: heapStats.total_available_size,
        usedHeapSize: heapStats.used_heap_size,
        heapSizeLimit: heapStats.heap_size_limit,
        mallocedMemory: heapStats.malloced_memory,
        peakMallocedMemory: heapStats.peak_malloced_memory
      },
      uptime: process.uptime(),
      platform: os.platform(),
      architecture: os.arch(),
      nodeVersion: process.version
    };
  }

  /**
   * Get comprehensive performance report
   */
  getPerformanceReport(hours = 24) {
    const operationTypes = Array.from(this.metrics.keys());
    const stats = {};

    for (const type of operationTypes) {
      stats[type] = this.getPerformanceStats(type, hours);
    }

    const systemMetrics = this.getSystemMetrics();
    const topSlowQueries = this._getTopSlowQueries(10);
    const recommendations = this._generateRecommendations(stats);

    return {
      timestamp: new Date().toISOString(),
      period: `${hours}h`,
      system: systemMetrics,
      operations: stats,
      queryAnalysis: {
        topSlowQueries,
        uniqueQueries: this.queryPerformance.size,
        totalQueries: Array.from(this.queryPerformance.values()).reduce((sum, q) => sum + q.count, 0)
      },
      recommendations,
      alerts: this._generateAlerts(stats),
      summary: this._generateSummary(stats)
    };
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring() {
    // Collect system metrics every 30 seconds
    this.monitoringInterval = setInterval(() => {
      const metrics = this.getSystemMetrics();

      this.memorySnapshots.push({
        timestamp: metrics.timestamp,
        heapUsed: metrics.memory.heapUsed,
        rss: metrics.memory.rss
      });

      this.cpuSnapshots.push({
        timestamp: metrics.timestamp,
        user: metrics.cpu.user,
        system: metrics.cpu.system,
        loadAvg1: metrics.cpu.loadAverage['1min']
      });

      // Keep only last 2880 snapshots (24 hours at 30s intervals)
      if (this.memorySnapshots.length > 2880) {
        this.memorySnapshots.shift();
      }
      if (this.cpuSnapshots.length > 2880) {
        this.cpuSnapshots.shift();
      }

      // Check for memory leaks
      this._checkMemoryLeaks();

    }, 30000);

    // Clean up old metrics every hour
    this.cleanupInterval = setInterval(() => {
      this._cleanupOldMetrics();
    }, 3600000);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  // Private methods

  _hashQuery(query) {
    // Simple hash function for query strings
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  _trackQueryPerformance(queryHash, metrics) {
    if (!this.queryPerformance.has(queryHash)) {
      this.queryPerformance.set(queryHash, {
        queryPreview: metrics.metadata.queryPreview,
        count: 0,
        totalDuration: 0,
        maxDuration: 0,
        minDuration: Infinity,
        avgDuration: 0,
        errors: 0
      });
    }

    const queryStats = this.queryPerformance.get(queryHash);
    queryStats.count++;
    queryStats.totalDuration += metrics.duration;
    queryStats.maxDuration = Math.max(queryStats.maxDuration, metrics.duration);
    queryStats.minDuration = Math.min(queryStats.minDuration, metrics.duration);
    queryStats.avgDuration = queryStats.totalDuration / queryStats.count;

    if (!metrics.metadata.success) {
      queryStats.errors++;
    }
  }

  _getTopSlowQueries(limit = 10) {
    return Array.from(this.queryPerformance.entries())
      .map(([hash, stats]) => ({ hash, ...stats }))
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, limit);
  }

  _average(numbers) {
    if (numbers.length === 0) {
      return 0;
    }
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  }

  _percentile(sortedNumbers, percentile) {
    if (sortedNumbers.length === 0) {
      return 0;
    }
    const index = Math.ceil((percentile / 100) * sortedNumbers.length) - 1;
    return sortedNumbers[Math.max(0, index)];
  }

  _generateRecommendations(stats) {
    const recommendations = [];

    for (const [type, typeStats] of Object.entries(stats)) {
      if (typeStats.count === 0) {
        continue;
      }

      // High error rate
      if (parseFloat(typeStats.errorRate) > 5) {
        recommendations.push({
          type: 'error_rate',
          severity: 'high',
          message: `High error rate for ${type}: ${typeStats.errorRate}%`,
          suggestion: 'Investigate error patterns and implement better error handling'
        });
      }

      // Slow operations
      if (parseFloat(typeStats.slowOperationRate) > 10) {
        recommendations.push({
          type: 'performance',
          severity: 'medium',
          message: `High percentage of slow operations for ${type}: ${typeStats.slowOperationRate}%`,
          suggestion: 'Consider optimizing slow operations or increasing thresholds'
        });
      }

      // Very high average duration
      if (typeStats.avgDuration > (this.thresholds[type] || 1000) * 2) {
        recommendations.push({
          type: 'performance',
          severity: 'high',
          message: `Average duration for ${type} is very high: ${typeStats.avgDuration.toFixed(2)}ms`,
          suggestion: 'Urgent optimization needed for this operation type'
        });
      }
    }

    return recommendations;
  }

  _generateAlerts(_stats) {
    const alerts = [];
    const systemMetrics = this.getSystemMetrics();

    // Memory alerts
    if (parseFloat(systemMetrics.memory.heapUtilization) > 80) {
      alerts.push({
        type: 'memory',
        severity: 'high',
        message: `High heap utilization: ${systemMetrics.memory.heapUtilization}%`
      });
    }

    // CPU alerts
    if (systemMetrics.cpu.loadAverage['1min'] > os.cpus().length * 0.8) {
      alerts.push({
        type: 'cpu',
        severity: 'high',
        message: `High CPU load average: ${systemMetrics.cpu.loadAverage['1min']}`
      });
    }

    return alerts;
  }

  _generateSummary(stats) {
    const totalOperations = Object.values(stats).reduce((sum, s) => sum + s.count, 0);
    const avgResponseTime = Object.values(stats).reduce((sum, s) => sum + (s.avgDuration * s.count), 0) / totalOperations;
    const totalErrors = Object.values(stats).reduce((sum, s) => sum + (s.count * parseFloat(s.errorRate) / 100), 0);

    return {
      totalOperations,
      avgResponseTime: avgResponseTime.toFixed(2),
      totalErrors: Math.round(totalErrors),
      overallErrorRate: ((totalErrors / totalOperations) * 100).toFixed(2),
      healthScore: this._calculateHealthScore(stats)
    };
  }

  _calculateHealthScore(stats) {
    let score = 100;

    for (const typeStats of Object.values(stats)) {
      if (typeStats.count === 0) {
        continue;
      }

      // Penalize high error rates
      score -= parseFloat(typeStats.errorRate) * 2;

      // Penalize slow operations
      score -= parseFloat(typeStats.slowOperationRate) * 0.5;

      // Penalize high average durations
      const threshold = this.thresholds[typeStats.type] || 1000;
      if (typeStats.avgDuration > threshold) {
        score -= ((typeStats.avgDuration / threshold) - 1) * 10;
      }
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  _checkMemoryLeaks() {
    if (this.memorySnapshots.length < 10) {
      return;
    }

    const recent = this.memorySnapshots.slice(-10);
    const trend = this._calculateTrend(recent.map(s => s.heapUsed));

    if (trend > 0.1) { // 10% increase trend
      logger.warn({
        trend: (trend * 100).toFixed(2),
        currentHeap: recent[recent.length - 1].heapUsed,
        snapshots: recent.length
      }, 'Potential memory leak detected');
    }
  }

  _calculateTrend(values) {
    if (values.length < 2) {
      return 0;
    }

    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, index) => sum + (index * val), 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const firstValue = values[0];

    return firstValue > 0 ? slope / firstValue : 0;
  }

  _cleanupOldMetrics() {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours

    for (const [type, typeMetrics] of this.metrics.entries()) {
      const filtered = typeMetrics.filter(m =>
        new Date(m.timestamp).getTime() > cutoff
      );
      this.metrics.set(type, filtered);
    }

    logger.debug('Cleaned up old performance metrics');
  }
}