/**
 * BaseAnomalyDetector - Abstract base class for all anomaly detectors
 * Provides common functionality and interfaces for anomaly detection
 */
export class BaseAnomalyDetector {
  constructor(config = {}) {
    this.config = {
      minDataPoints: config.minDataPoints || 20,
      learningWindow: config.learningWindow || 30 * 24 * 60 * 60 * 1000, // 30 days
      confidenceThreshold: config.confidenceThreshold || 0.7,
      updateFrequency: config.updateFrequency || 3600000, // 1 hour
      ...config
    };
    
    this.name = this.constructor.name;
    this.enabled = true;
    this.metrics = {
      detectionsCount: 0,
      falsePositives: 0,
      truePositives: 0,
      lastDetection: null,
      avgConfidence: 0
    };
  }
  
  /**
   * Main detection method - must be implemented by subclasses
   * @param {string} address - Whale address to analyze
   * @param {Object} activity - Current activity data
   * @param {Object} context - Additional context (patterns, history, etc)
   * @returns {Object|null} - Anomaly object or null if no anomaly
   */
  async detect(address, activity, context) {
    throw new Error('detect() must be implemented by subclass');
  }
  
  /**
   * Calculate severity based on detector-specific logic
   * @param {Object} anomalyData - Data specific to the anomaly
   * @returns {string} - 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
   */
  calculateSeverity(anomalyData) {
    // Default implementation - can be overridden
    const score = this.calculateSeverityScore(anomalyData);
    
    if (score >= 0.9) return 'CRITICAL';
    if (score >= 0.7) return 'HIGH';
    if (score >= 0.5) return 'MEDIUM';
    return 'LOW';
  }
  
  /**
   * Calculate numerical severity score (0-1)
   */
  calculateSeverityScore(anomalyData) {
    // Default implementation
    return anomalyData.confidence || 0.5;
  }
  
  /**
   * Format anomaly object with standard fields
   */
  formatAnomaly(type, severity, details, confidence, message) {
    const anomaly = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      details,
      confidence: Math.min(1, Math.max(0, confidence)),
      message,
      detectedBy: this.name,
      timestamp: new Date().toISOString(),
      detector: {
        name: this.name,
        version: '1.0.0',
        config: this.getPublicConfig()
      }
    };
    
    // Update metrics
    this.metrics.detectionsCount++;
    this.metrics.lastDetection = anomaly.timestamp;
    this.updateAvgConfidence(confidence);
    
    return anomaly;
  }
  
  /**
   * Get configuration safe for logging (no sensitive data)
   */
  getPublicConfig() {
    return {
      minDataPoints: this.config.minDataPoints,
      learningWindow: this.config.learningWindow,
      confidenceThreshold: this.config.confidenceThreshold
    };
  }
  
  /**
   * Update running average confidence
   */
  updateAvgConfidence(confidence) {
    const count = this.metrics.detectionsCount;
    this.metrics.avgConfidence = 
      (this.metrics.avgConfidence * (count - 1) + confidence) / count;
  }
  
  /**
   * Mark a detection as false positive for learning
   */
  markFalsePositive(anomalyId) {
    this.metrics.falsePositives++;
    // Subclasses can implement learning logic
  }
  
  /**
   * Mark a detection as true positive for learning
   */
  markTruePositive(anomalyId) {
    this.metrics.truePositives++;
    // Subclasses can implement learning logic
  }
  
  /**
   * Get detector performance metrics
   */
  getMetrics() {
    const total = this.metrics.falsePositives + this.metrics.truePositives;
    const accuracy = total > 0 ? this.metrics.truePositives / total : 0;
    
    return {
      ...this.metrics,
      accuracy,
      enabled: this.enabled
    };
  }
  
  /**
   * Enable/disable the detector
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`[${this.name}] Detector ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Check if detector has enough data to make decisions
   */
  hasEnoughData(dataPoints) {
    return dataPoints && dataPoints.length >= this.config.minDataPoints;
  }
  
  /**
   * Calculate standard statistics
   */
  calculateStats(values) {
    if (!values || values.length === 0) {
      return { mean: 0, stdDev: 0, median: 0, min: 0, max: 0 };
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    
    return {
      mean,
      stdDev,
      median,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      sum,
      count: values.length
    };
  }
  
  /**
   * Calculate Z-score
   */
  calculateZScore(value, mean, stdDev) {
    if (stdDev === 0) return 0;
    return Math.abs(value - mean) / stdDev;
  }
  
  /**
   * Get percentile of value in dataset
   */
  getPercentile(value, dataset) {
    const sorted = [...dataset].sort((a, b) => a - b);
    const index = sorted.findIndex(v => v >= value);
    if (index === -1) return 100;
    return (index / sorted.length) * 100;
  }
  
  /**
   * Filter data by time window
   */
  filterByTimeWindow(data, windowMs) {
    const cutoff = Date.now() - windowMs;
    return data.filter(item => 
      new Date(item.timestamp || item.date).getTime() > cutoff
    );
  }
}