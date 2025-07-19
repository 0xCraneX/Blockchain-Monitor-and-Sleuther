import { PatternStorage } from './PatternStorage.js';
import { StatisticalAnomalyDetector } from './detectors/StatisticalAnomalyDetector.js';
import { BehavioralAnomalyDetector } from './detectors/BehavioralAnomalyDetector.js';
import { VelocityAnomalyDetector } from './detectors/VelocityAnomalyDetector.js';
import { NetworkAnomalyDetector } from './detectors/NetworkAnomalyDetector.js';
import { TemporalAnomalyDetector } from './detectors/TemporalAnomalyDetector.js';

/**
 * AnomalyEngine - Integrated anomaly detection system for blockchain whale monitoring
 * Orchestrates multiple detection methods and provides unified risk scoring
 */
export class AnomalyEngine {
  constructor(config = {}) {
    this.config = {
      // Engine settings
      enabled: config.enabled !== false,
      updatePatternsEnabled: config.updatePatternsEnabled !== false,
      learningEnabled: config.learningEnabled !== false,
      
      // Risk scoring weights
      weights: {
        statistical: config.weights?.statistical || 0.25,
        behavioral: config.weights?.behavioral || 0.20,
        velocity: config.weights?.velocity || 0.20,
        network: config.weights?.network || 0.20,
        temporal: config.weights?.temporal || 0.15
      },
      
      // Risk thresholds
      riskThresholds: {
        low: config.riskThresholds?.low || 0.3,
        medium: config.riskThresholds?.medium || 0.5,
        high: config.riskThresholds?.high || 0.7,
        critical: config.riskThresholds?.critical || 0.9
      },
      
      // Detection settings
      minConfidence: config.minConfidence || 0.6,
      maxAnomaliesPerAddress: config.maxAnomaliesPerAddress || 5,
      correlationWindow: config.correlationWindow || 3600000, // 1 hour
      
      // Pattern update settings
      patternUpdateThreshold: config.patternUpdateThreshold || 0.7,
      minDataPointsForUpdate: config.minDataPointsForUpdate || 10,
      
      // Performance settings
      concurrentDetections: config.concurrentDetections || 10,
      cacheResults: config.cacheResults !== false,
      resultCacheTTL: config.resultCacheTTL || 300000, // 5 minutes
      
      ...config
    };
    
    // Initialize components
    this.patternStorage = new PatternStorage(config.patternStorage);
    
    // Initialize detectors
    this.detectors = {
      statistical: new StatisticalAnomalyDetector(config.statistical),
      behavioral: new BehavioralAnomalyDetector(config.behavioral),
      velocity: new VelocityAnomalyDetector(config.velocity),
      network: new NetworkAnomalyDetector(config.network),
      temporal: new TemporalAnomalyDetector(config.temporal)
    };
    
    // Results cache
    this.resultsCache = new Map();
    
    // Statistics
    this.stats = {
      totalDetections: 0,
      detectionsByType: {},
      detectionsBySeverity: {},
      avgDetectionTime: 0,
      patternsUpdated: 0,
      falsePositives: 0
    };
    
    // Start cache cleanup interval
    if (this.config.cacheResults) {
      setInterval(() => this.cleanupCache(), this.config.resultCacheTTL);
    }
    
    console.log('[AnomalyEngine] Initialized with', Object.keys(this.detectors).length, 'detectors');
  }
  
  /**
   * Analyze activity for anomalies
   */
  async analyzeActivity(address, activity, recentTransfers = [], relatedAddresses = []) {
    if (!this.config.enabled) {
      return null;
    }
    
    const startTime = Date.now();
    
    // Check cache
    const cacheKey = this.getCacheKey(address, activity);
    if (this.config.cacheResults && this.resultsCache.has(cacheKey)) {
      const cached = this.resultsCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.config.resultCacheTTL) {
        return cached.result;
      }
    }
    
    try {
      // Get or create pattern for this address
      const pattern = await this.patternStorage.getPattern(address);
      
      // Prepare context for detectors
      const context = {
        pattern,
        recentTransfers,
        relatedAddresses,
        activity
      };
      
      // Run all detectors
      const detectionResults = await this.runDetectors(address, activity, context);
      
      // Filter by confidence
      const validResults = detectionResults.filter(r => 
        r && r.confidence >= this.config.minConfidence
      );
      
      // Calculate aggregate risk score
      const riskAssessment = this.calculateRiskScore(validResults);
      
      // Update patterns if learning is enabled
      if (this.config.learningEnabled && this.config.updatePatternsEnabled) {
        await this.updatePatterns(address, activity, validResults, pattern);
      }
      
      // Format final result
      const result = this.formatResult(address, validResults, riskAssessment);
      
      // Update statistics
      this.updateStats(result, Date.now() - startTime);
      
      // Cache result
      if (this.config.cacheResults) {
        this.resultsCache.set(cacheKey, {
          result,
          timestamp: Date.now()
        });
      }
      
      return result;
      
    } catch (error) {
      console.error(`[AnomalyEngine] Error analyzing ${address}:`, error);
      return this.formatErrorResult(address, error);
    }
  }
  
  /**
   * Analyze multiple addresses in batch
   */
  async analyzeBatch(activities) {
    const results = [];
    
    // Process in chunks for performance
    const chunks = this.chunkArray(activities, this.config.concurrentDetections);
    
    for (const chunk of chunks) {
      const chunkPromises = chunk.map(({ address, activity, recentTransfers, relatedAddresses }) =>
        this.analyzeActivity(address, activity, recentTransfers, relatedAddresses)
          .then(result => results.push(result))
          .catch(error => console.error(`[AnomalyEngine] Batch error for ${address}:`, error))
      );
      
      await Promise.all(chunkPromises);
    }
    
    return results;
  }
  
  /**
   * Run all detectors on the activity
   */
  async runDetectors(address, activity, context) {
    const detectorPromises = Object.entries(this.detectors).map(async ([name, detector]) => {
      try {
        const result = await detector.detect(address, activity, context);
        if (result) {
          result.detector = name;
        }
        return result;
      } catch (error) {
        console.error(`[AnomalyEngine] ${name} detector error:`, error);
        return null;
      }
    });
    
    const results = await Promise.all(detectorPromises);
    return results.filter(r => r !== null);
  }
  
  /**
   * Calculate aggregate risk score from multiple anomalies
   */
  calculateRiskScore(anomalies) {
    if (anomalies.length === 0) {
      return {
        score: 0,
        level: 'NONE',
        factors: {}
      };
    }
    
    // Calculate weighted score for each detector type
    const detectorScores = {};
    const factors = {};
    
    // Group anomalies by detector
    const byDetector = {};
    anomalies.forEach(anomaly => {
      if (!byDetector[anomaly.detector]) {
        byDetector[anomaly.detector] = [];
      }
      byDetector[anomaly.detector].push(anomaly);
    });
    
    // Calculate score for each detector
    Object.entries(byDetector).forEach(([detector, detectorAnomalies]) => {
      // Use highest severity anomaly from each detector
      const severityScores = {
        'CRITICAL': 1.0,
        'HIGH': 0.8,
        'MEDIUM': 0.5,
        'LOW': 0.3
      };
      
      const maxSeverity = detectorAnomalies.reduce((max, a) => {
        const score = severityScores[a.severity] || 0;
        return score > max ? score : max;
      }, 0);
      
      // Weight by confidence
      const avgConfidence = detectorAnomalies.reduce((sum, a) => sum + a.confidence, 0) / detectorAnomalies.length;
      
      detectorScores[detector] = maxSeverity * avgConfidence;
      factors[detector] = {
        score: detectorScores[detector],
        count: detectorAnomalies.length,
        types: detectorAnomalies.map(a => a.type)
      };
    });
    
    // Calculate weighted total
    let totalScore = 0;
    let totalWeight = 0;
    
    Object.entries(detectorScores).forEach(([detector, score]) => {
      const weight = this.config.weights[detector] || 0.2;
      totalScore += score * weight;
      totalWeight += weight;
    });
    
    // Normalize
    const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    
    // Apply correlation bonus if multiple detectors agree
    const correlationBonus = this.calculateCorrelationBonus(anomalies);
    const adjustedScore = Math.min(1.0, finalScore * (1 + correlationBonus));
    
    // Determine risk level
    let level = 'NONE';
    if (adjustedScore >= this.config.riskThresholds.critical) {
      level = 'CRITICAL';
    } else if (adjustedScore >= this.config.riskThresholds.high) {
      level = 'HIGH';
    } else if (adjustedScore >= this.config.riskThresholds.medium) {
      level = 'MEDIUM';
    } else if (adjustedScore >= this.config.riskThresholds.low) {
      level = 'LOW';
    }
    
    return {
      score: adjustedScore,
      level,
      factors,
      correlationBonus,
      anomalyCount: anomalies.length
    };
  }
  
  /**
   * Calculate correlation bonus when multiple detectors agree
   */
  calculateCorrelationBonus(anomalies) {
    if (anomalies.length < 2) return 0;
    
    // Check for correlated anomaly types
    const correlatedTypes = [
      ['DORMANT_AWAKENING', 'VELOCITY_SPIKE', 'UNUSUAL_HOUR_ACTIVITY'],
      ['AMOUNT_OUTLIER', 'VOLUME_ANOMALY', 'TRANSACTION_BURST'],
      ['NETWORK_EXPANSION', 'ROLE_CHANGE', 'COORDINATED_ACTIVITY'],
      ['TIMEZONE_SHIFT', 'BEHAVIORAL_CHANGE', 'PATTERN_BREAK']
    ];
    
    let maxCorrelation = 0;
    const types = anomalies.map(a => a.type);
    
    correlatedTypes.forEach(group => {
      const matches = group.filter(type => types.includes(type)).length;
      if (matches >= 2) {
        maxCorrelation = Math.max(maxCorrelation, (matches - 1) * 0.1);
      }
    });
    
    // Time correlation - anomalies detected close together
    const timeCorrelation = this.calculateTimeCorrelation(anomalies);
    
    return Math.min(0.3, maxCorrelation + timeCorrelation);
  }
  
  /**
   * Calculate time correlation between anomalies
   */
  calculateTimeCorrelation(anomalies) {
    const timestamps = anomalies
      .map(a => a.timestamp || Date.now())
      .sort((a, b) => a - b);
    
    if (timestamps.length < 2) return 0;
    
    // Check if anomalies occurred within correlation window
    let correlatedPairs = 0;
    
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] - timestamps[i-1] < this.config.correlationWindow) {
        correlatedPairs++;
      }
    }
    
    return Math.min(0.1, correlatedPairs * 0.05);
  }
  
  /**
   * Update patterns based on activity and detections
   */
  async updatePatterns(address, activity, anomalies, pattern) {
    // Only update if we have enough confidence
    const hasHighConfidenceAnomaly = anomalies.some(a => 
      a.confidence >= this.config.patternUpdateThreshold
    );
    
    if (!hasHighConfidenceAnomaly && pattern.dataPoints >= this.config.minDataPointsForUpdate) {
      // Normal activity - update baselines
      const updates = this.generatePatternUpdates(activity, pattern);
      
      if (Object.keys(updates).length > 0) {
        await this.patternStorage.updatePattern(address, updates);
        this.stats.patternsUpdated++;
      }
    }
    
    // Record anomalies in pattern history
    if (anomalies.length > 0) {
      const anomalyHistory = pattern.anomalyHistory || [];
      
      // Add new anomalies (limit history size)
      anomalies.forEach(anomaly => {
        anomalyHistory.push({
          timestamp: Date.now(),
          type: anomaly.type,
          severity: anomaly.severity,
          confidence: anomaly.confidence
        });
      });
      
      // Keep last 100 anomalies
      if (anomalyHistory.length > 100) {
        anomalyHistory.splice(0, anomalyHistory.length - 100);
      }
      
      await this.patternStorage.updatePattern(address, {
        anomalyHistory,
        dataPoints: pattern.dataPoints + 1
      });
    }
  }
  
  /**
   * Generate pattern updates from normal activity
   */
  generatePatternUpdates(activity, pattern) {
    const updates = {};
    
    // Update transfer amount statistics
    if (activity.type === 'transfer' && activity.amount) {
      const amounts = pattern.statistical.transferAmounts;
      const newHistory = [...(amounts.history || []), activity.amount].slice(-100);
      
      updates['statistical.transferAmounts.history'] = newHistory;
      updates['statistical.transferAmounts.mean'] = this.calculateMean(newHistory);
      updates['statistical.transferAmounts.stdDev'] = this.calculateStdDev(newHistory);
    }
    
    // Update activity timestamps
    updates['behavioral.lastActivity'] = activity.timestamp || new Date().toISOString();
    
    // Update transaction counts
    const now = Date.now();
    const dayAgo = now - 86400000;
    const weekAgo = now - 604800000;
    
    if (pattern.behavioral.transactionCount) {
      updates['behavioral.transactionCount.daily'] = pattern.behavioral.transactionCount.daily * 0.95 + 0.05;
      updates['behavioral.transactionCount.weekly'] = pattern.behavioral.transactionCount.weekly * 0.95 + 0.05;
    }
    
    return updates;
  }
  
  /**
   * Format final result
   */
  formatResult(address, anomalies, riskAssessment) {
    // Sort anomalies by severity and confidence
    const sortedAnomalies = anomalies.sort((a, b) => {
      const severityOrder = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      return severityDiff !== 0 ? severityDiff : b.confidence - a.confidence;
    });
    
    // Take top anomalies
    const topAnomalies = sortedAnomalies.slice(0, this.config.maxAnomaliesPerAddress);
    
    return {
      address,
      timestamp: Date.now(),
      riskScore: riskAssessment.score,
      riskLevel: riskAssessment.level,
      anomalyCount: anomalies.length,
      anomalies: topAnomalies,
      summary: this.generateSummary(topAnomalies, riskAssessment),
      riskFactors: riskAssessment.factors,
      correlationBonus: riskAssessment.correlationBonus,
      recommendations: this.generateRecommendations(topAnomalies, riskAssessment)
    };
  }
  
  /**
   * Generate human-readable summary
   */
  generateSummary(anomalies, riskAssessment) {
    if (anomalies.length === 0) {
      return 'No anomalies detected';
    }
    
    const primary = anomalies[0];
    let summary = `${riskAssessment.level} risk: ${primary.description}`;
    
    if (anomalies.length > 1) {
      summary += ` (${anomalies.length - 1} additional anomal${anomalies.length - 1 === 1 ? 'y' : 'ies'} detected)`;
    }
    
    return summary;
  }
  
  /**
   * Generate actionable recommendations
   */
  generateRecommendations(anomalies, riskAssessment) {
    const recommendations = [];
    
    if (riskAssessment.level === 'CRITICAL') {
      recommendations.push('Immediate investigation required');
      recommendations.push('Consider freezing or flagging account');
    } else if (riskAssessment.level === 'HIGH') {
      recommendations.push('Priority investigation recommended');
      recommendations.push('Monitor closely for next 24 hours');
    }
    
    // Specific recommendations based on anomaly types
    const types = anomalies.map(a => a.type);
    
    if (types.includes('DORMANT_AWAKENING')) {
      recommendations.push('Verify account ownership and authorization');
    }
    
    if (types.includes('COORDINATED_ACTIVITY') || types.includes('NETWORK_CLUSTERING')) {
      recommendations.push('Investigate related addresses for wash trading or manipulation');
    }
    
    if (types.includes('VELOCITY_SPIKE') || types.includes('TRANSACTION_BURST')) {
      recommendations.push('Check for automated trading or bot activity');
    }
    
    return recommendations;
  }
  
  /**
   * Format error result
   */
  formatErrorResult(address, error) {
    return {
      address,
      timestamp: Date.now(),
      error: true,
      errorMessage: error.message,
      riskScore: 0,
      riskLevel: 'UNKNOWN',
      anomalies: []
    };
  }
  
  /**
   * Update statistics
   */
  updateStats(result, detectionTime) {
    this.stats.totalDetections++;
    
    // Update detection time average
    this.stats.avgDetectionTime = 
      (this.stats.avgDetectionTime * (this.stats.totalDetections - 1) + detectionTime) / 
      this.stats.totalDetections;
    
    // Count by type and severity
    result.anomalies.forEach(anomaly => {
      this.stats.detectionsByType[anomaly.type] = 
        (this.stats.detectionsByType[anomaly.type] || 0) + 1;
      
      this.stats.detectionsBySeverity[anomaly.severity] = 
        (this.stats.detectionsBySeverity[anomaly.severity] || 0) + 1;
    });
  }
  
  /**
   * Get cache key for result caching
   */
  getCacheKey(address, activity) {
    return `${address}:${activity.type}:${activity.amount || 0}:${activity.timestamp || Date.now()}`;
  }
  
  /**
   * Clean up expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    const expired = [];
    
    for (const [key, value] of this.resultsCache) {
      if (now - value.timestamp > this.config.resultCacheTTL) {
        expired.push(key);
      }
    }
    
    expired.forEach(key => this.resultsCache.delete(key));
  }
  
  /**
   * Utility methods
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  
  calculateMean(values) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  
  calculateStdDev(values) {
    if (values.length < 2) return 0;
    const mean = this.calculateMean(values);
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(variance);
  }
  
  /**
   * Get engine statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.resultsCache.size,
      detectorsActive: Object.keys(this.detectors).length,
      patternStorageStats: this.patternStorage.getStats()
    };
  }
  
  /**
   * Set detector weight
   */
  setDetectorWeight(detector, weight) {
    if (this.config.weights[detector] !== undefined) {
      this.config.weights[detector] = Math.max(0, Math.min(1, weight));
      
      // Normalize weights
      const total = Object.values(this.config.weights).reduce((a, b) => a + b, 0);
      if (total > 0) {
        Object.keys(this.config.weights).forEach(key => {
          this.config.weights[key] /= total;
        });
      }
    }
  }
  
  /**
   * Enable/disable specific detector
   */
  setDetectorEnabled(detector, enabled) {
    if (this.detectors[detector]) {
      this.detectors[detector].config.enabled = enabled;
    }
  }
  
  /**
   * Report false positive for learning
   */
  reportFalsePositive(address, anomalyType) {
    this.stats.falsePositives++;
    
    // Could implement more sophisticated learning here
    console.log(`[AnomalyEngine] False positive reported: ${address} - ${anomalyType}`);
  }
  
  /**
   * Clear all caches
   */
  clearCaches() {
    this.resultsCache.clear();
    console.log('[AnomalyEngine] Caches cleared');
  }
}