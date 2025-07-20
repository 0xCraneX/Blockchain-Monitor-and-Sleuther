const PatternAnalysisEngine = require('./PatternAnalysisEngine');
const { monitorLogger } = require('../utils/logger');

class NoiseFilter {
  constructor(config = {}) {
    this.config = {
      dataPath: config.dataPath || './data',
      noiseThreshold: config.noiseThreshold || 0.3, // 0-1 scale, higher = more filtering
      baselineUpdateInterval: config.baselineUpdateInterval || 24 * 60 * 60 * 1000, // 24 hours
      exchangeActivityWeight: config.exchangeActivityWeight || 0.7, // Reduce weight of exchange alerts
      temporalWeight: config.temporalWeight || 0.2, // Weight for time-based filtering
      volumeWeight: config.volumeWeight || 0.1, // Weight for volume-based filtering
      ...config
    };
    
    this.patternEngine = new PatternAnalysisEngine({
      dataPath: this.config.dataPath,
      lookbackDays: 7
    });
    
    this.baseline = null;
    this.lastBaselineUpdate = 0;
    this.filterStats = {
      totalProcessed: 0,
      signalAlerts: 0,
      noiseAlerts: 0,
      filteredByType: {},
      filteredByTime: 0,
      filteredByVolume: 0
    };
  }

  async initialize() {
    monitorLogger.info('Initializing noise filter with pattern analysis...');
    
    try {
      await this.updateBaseline();
      monitorLogger.success('Noise filter initialized', {
        baselineAlerts: this.baseline?.totalAlerts || 0,
        anomalyThresholds: this.baseline?.anomalyThresholds ? 'Set' : 'Not available'
      });
    } catch (error) {
      monitorLogger.error('Failed to initialize noise filter', error);
      throw error;
    }
  }

  async updateBaseline() {
    const now = Date.now();
    if (this.baseline && (now - this.lastBaselineUpdate) < this.config.baselineUpdateInterval) {
      return; // Baseline is still fresh
    }
    
    monitorLogger.info('Updating noise filter baseline...');
    
    try {
      const analysisResults = await this.patternEngine.analyzePatterns();
      this.baseline = {
        patterns: analysisResults.patterns,
        insights: analysisResults.insights,
        totalAlerts: analysisResults.patterns.baseline?.frequency?.totalAlerts || 0,
        anomalyThresholds: analysisResults.patterns.baseline?.anomalyThresholds || null,
        temporalPeaks: analysisResults.patterns.temporal?.peaks || null,
        behaviorTypes: analysisResults.patterns.behavioral?.behaviorTypes || null,
        lastUpdate: now
      };
      
      this.lastBaselineUpdate = now;
      monitorLogger.success('Baseline updated successfully');
    } catch (error) {
      monitorLogger.error('Failed to update baseline', error);
      // Continue with existing baseline if available
    }
  }

  async filterAlerts(alerts) {
    if (!Array.isArray(alerts) || alerts.length === 0) {
      return { signal: [], noise: [] };
    }
    
    // Update baseline if needed
    await this.updateBaseline();
    
    if (!this.baseline) {
      monitorLogger.warn('No baseline available, returning all alerts as signal');
      return { signal: alerts, noise: [] };
    }
    
    const signal = [];
    const noise = [];
    
    for (const alert of alerts) {
      const classification = this.classifyAlert(alert);
      
      if (classification.isSignal) {
        signal.push({
          ...alert,
          noiseScore: classification.noiseScore,
          filterReason: classification.reason,
          confidence: classification.confidence
        });
      } else {
        noise.push({
          ...alert,
          noiseScore: classification.noiseScore,
          filterReason: classification.reason
        });
      }
      
      this.updateStats(alert, classification);
    }
    
    monitorLogger.info(`Filtered ${alerts.length} alerts: ${signal.length} signal, ${noise.length} noise`);
    
    return { signal, noise, stats: this.getFilterStats() };
  }

  classifyAlert(alert) {
    let noiseScore = 0;
    const reasons = [];
    let confidence = 1.0;
    
    // 1. Type-based filtering (largest factor)
    const typeScore = this.calculateTypeNoiseScore(alert);
    noiseScore += typeScore * this.config.exchangeActivityWeight;
    
    if (typeScore > 0.5) {
      reasons.push('routine_exchange_activity');
    }
    
    // 2. Temporal pattern filtering
    const temporalScore = this.calculateTemporalNoiseScore(alert);
    noiseScore += temporalScore * this.config.temporalWeight;
    
    if (temporalScore > 0.7) {
      reasons.push('peak_hour_activity');
    }
    
    // 3. Volume-based filtering
    const volumeScore = this.calculateVolumeNoiseScore(alert);
    noiseScore += volumeScore * this.config.volumeWeight;
    
    if (volumeScore > 0.8) {
      reasons.push('typical_volume_range');
    }
    
    // 4. Behavioral pattern filtering
    const behaviorScore = this.calculateBehaviorNoiseScore(alert);
    noiseScore += behaviorScore * 0.1; // Small weight
    
    if (behaviorScore > 0.6) {
      reasons.push('known_behavior_pattern');
    }
    
    // 5. Check for anomaly indicators that override noise scoring
    const anomalyOverride = this.checkAnomalyOverride(alert);
    if (anomalyOverride.isAnomaly) {
      noiseScore *= 0.3; // Significantly reduce noise score for anomalies
      confidence = 0.9;
      reasons.unshift('anomaly_detected');
    }
    
    // Normalize noise score (0-1)
    noiseScore = Math.min(1, Math.max(0, noiseScore));
    
    const isSignal = noiseScore < this.config.noiseThreshold || anomalyOverride.isAnomaly;
    
    return {
      isSignal,
      noiseScore,
      confidence,
      reason: reasons.length > 0 ? reasons.join(', ') : 'unclassified',
      anomalyDetails: anomalyOverride.details
    };
  }

  calculateTypeNoiseScore(alert) {
    if (!this.baseline.patterns.baseline?.types) return 0;
    
    const alertType = alert.type || 'unknown';
    const typeDistribution = this.baseline.patterns.baseline.types;
    
    // High percentage = more common = higher noise score
    const typeData = typeDistribution[alertType];
    if (!typeData) return 0.2; // Unknown types get low noise score
    
    const percentage = typeData.percentage / 100;
    
    // Exchange activity is most common and gets high noise score
    if (alertType === 'exchange_activity') {
      return Math.min(0.9, percentage * 1.2); // Cap at 0.9, amplify by 1.2
    }
    
    // Large transfers and whale movements are less noisy
    if (alertType === 'large_transfer' || alertType === 'whale_movement') {
      return Math.max(0.1, percentage * 0.5); // Minimum 0.1, reduce by half
    }
    
    // Dormant awakening and new whale are significant
    if (alertType === 'DORMANT_AWAKENING' || alertType === 'NEW_WHALE') {
      return 0.1; // Very low noise score
    }
    
    return percentage;
  }

  calculateTemporalNoiseScore(alert) {
    if (!this.baseline.temporalPeaks?.hourly) return 0;
    
    const hour = new Date(alert.timestamp).getUTCHours();
    const peakHours = this.baseline.temporalPeaks.hourly.map(p => p.hour);
    
    // During peak hours, activity is more "normal" (higher noise score)
    if (peakHours.includes(hour)) {
      return 0.8; // High noise score during peak hours
    }
    
    // During quiet hours, activity is more significant (lower noise score)
    const quietHours = this.baseline.patterns.temporal?.quietPeriods?.hourly || [];
    if (quietHours.includes(hour)) {
      return 0.2; // Low noise score during quiet hours
    }
    
    return 0.5; // Neutral for normal hours
  }

  calculateVolumeNoiseScore(alert) {
    if (!this.baseline.anomalyThresholds?.volume) return 0;
    
    const amount = alert.amount || 0;
    const thresholds = this.baseline.anomalyThresholds.volume;
    
    // Extremely high volumes are significant (low noise)
    if (amount > thresholds.extreme) {
      return 0.1;
    }
    
    // High volumes are somewhat significant
    if (amount > thresholds.high) {
      return 0.3;
    }
    
    // Below median is typical activity (high noise)
    const median = this.baseline.patterns.baseline?.volume?.median || 0;
    if (amount < median) {
      return 0.8;
    }
    
    // Between median and high threshold
    return 0.6;
  }

  calculateBehaviorNoiseScore(alert) {
    if (!this.baseline.behaviorTypes) return 0;
    
    // This is a simplified behavior check
    // In practice, you'd want to track account behavior over time
    
    // If we've seen this address before and it's classified as exchange or regular trader
    // we could increase the noise score, but we don't have that data readily available
    // in the current alert structure
    
    return 0.5; // Neutral for now
  }

  checkAnomalyOverride(alert) {
    if (!this.baseline) return { isAnomaly: false, details: null };
    
    const evaluation = this.patternEngine.evaluateAlert(alert);
    
    return {
      isAnomaly: evaluation.isAnomalous,
      details: {
        anomalyScore: evaluation.anomalyScore,
        reasons: evaluation.reasons
      }
    };
  }

  updateStats(alert, classification) {
    this.filterStats.totalProcessed++;
    
    if (classification.isSignal) {
      this.filterStats.signalAlerts++;
    } else {
      this.filterStats.noiseAlerts++;
      
      // Track noise reasons
      const reason = classification.reason.split(',')[0].trim(); // Take first reason
      this.filterStats.filteredByType[reason] = (this.filterStats.filteredByType[reason] || 0) + 1;
    }
  }

  getFilterStats() {
    const stats = { ...this.filterStats };
    
    if (stats.totalProcessed > 0) {
      stats.signalPercentage = Math.round((stats.signalAlerts / stats.totalProcessed) * 100);
      stats.noisePercentage = Math.round((stats.noiseAlerts / stats.totalProcessed) * 100);
    }
    
    return stats;
  }

  // Method to adjust filter sensitivity
  adjustSensitivity(newThreshold) {
    const oldThreshold = this.config.noiseThreshold;
    this.config.noiseThreshold = Math.max(0, Math.min(1, newThreshold));
    
    monitorLogger.info(`Noise filter sensitivity adjusted from ${oldThreshold} to ${this.config.noiseThreshold}`);
    
    return {
      oldThreshold,
      newThreshold: this.config.noiseThreshold,
      effect: newThreshold > oldThreshold ? 'More filtering (less sensitive)' : 'Less filtering (more sensitive)'
    };
  }

  // Get recommended threshold based on recent performance
  getRecommendedThreshold() {
    if (this.filterStats.totalProcessed < 10) {
      return { threshold: this.config.noiseThreshold, reason: 'Insufficient data' };
    }
    
    const signalRatio = this.filterStats.signalAlerts / this.filterStats.totalProcessed;
    
    // Aim for 20-40% signal alerts
    if (signalRatio > 0.4) {
      return { 
        threshold: Math.min(0.9, this.config.noiseThreshold + 0.1), 
        reason: 'Too many signals, increase filtering' 
      };
    } else if (signalRatio < 0.2) {
      return { 
        threshold: Math.max(0.1, this.config.noiseThreshold - 0.1), 
        reason: 'Too few signals, decrease filtering' 
      };
    }
    
    return { 
      threshold: this.config.noiseThreshold, 
      reason: 'Current threshold optimal' 
    };
  }

  // Export filter configuration and stats for analysis
  exportAnalysis() {
    return {
      config: this.config,
      baseline: this.baseline ? {
        lastUpdate: new Date(this.baseline.lastUpdate).toISOString(),
        totalAlerts: this.baseline.totalAlerts,
        hasAnomalyThresholds: !!this.baseline.anomalyThresholds,
        temporalPeaksCount: this.baseline.temporalPeaks?.hourly?.length || 0
      } : null,
      stats: this.getFilterStats(),
      recommendation: this.getRecommendedThreshold()
    };
  }
}

module.exports = NoiseFilter;