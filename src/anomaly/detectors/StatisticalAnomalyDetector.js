import { BaseAnomalyDetector } from '../BaseAnomalyDetector.js';

/**
 * StatisticalAnomalyDetector - Detects anomalies using statistical methods
 * Primary method: Z-score analysis for identifying outliers
 */
export class StatisticalAnomalyDetector extends BaseAnomalyDetector {
  constructor(config = {}) {
    super(config);
    
    this.config = {
      ...this.config,
      zScoreThreshold: config.zScoreThreshold || 3.0, // 3 standard deviations
      percentileThreshold: config.percentileThreshold || 99, // 99th percentile
      rollingWindowDays: config.rollingWindowDays || 30,
      minStdDev: config.minStdDev || 0.01, // Minimum std dev to avoid division issues
      volumeAnalysis: config.volumeAnalysis !== false,
      trendAnalysis: config.trendAnalysis !== false,
      adaptiveThresholds: config.adaptiveThresholds !== false
    };
    
    this.detectionMethods = [
      'amountOutlier',
      'volumeAnomaly',
      'frequencyAnomaly',
      'trendDeviation'
    ];
  }
  
  /**
   * Main detection method
   */
  async detect(address, activity, context) {
    const { pattern, recentTransfers } = context;
    
    if (!pattern || !recentTransfers || recentTransfers.length === 0) {
      return null;
    }
    
    const anomalies = [];
    
    // 1. Amount outlier detection
    if (activity.type === 'transfer' && activity.amount) {
      const amountAnomaly = await this.detectAmountOutlier(
        address, 
        activity.amount, 
        pattern.statistical.transferAmounts
      );
      if (amountAnomaly) anomalies.push(amountAnomaly);
    }
    
    // 2. Volume anomaly detection
    if (this.config.volumeAnalysis && recentTransfers.length > 0) {
      const volumeAnomaly = await this.detectVolumeAnomaly(
        address,
        recentTransfers,
        pattern.statistical.dailyVolume
      );
      if (volumeAnomaly) anomalies.push(volumeAnomaly);
    }
    
    // 3. Frequency anomaly detection
    const frequencyAnomaly = await this.detectFrequencyAnomaly(
      address,
      recentTransfers,
      pattern.behavioral.transactionCount
    );
    if (frequencyAnomaly) anomalies.push(frequencyAnomaly);
    
    // 4. Trend deviation detection
    if (this.config.trendAnalysis && pattern.statistical.transferAmounts.history.length >= 10) {
      const trendAnomaly = await this.detectTrendDeviation(
        address,
        activity,
        pattern.statistical.transferAmounts.history
      );
      if (trendAnomaly) anomalies.push(trendAnomaly);
    }
    
    // Return highest confidence anomaly
    if (anomalies.length > 0) {
      return anomalies.sort((a, b) => b.confidence - a.confidence)[0];
    }
    
    return null;
  }
  
  /**
   * Detect amount outliers using Z-score
   */
  async detectAmountOutlier(address, amount, amountStats) {
    // Need sufficient data
    if (!this.hasEnoughData(amountStats.history)) {
      return null;
    }
    
    const stats = this.calculateStats(amountStats.history);
    
    // Avoid division by zero
    if (stats.stdDev < this.config.minStdDev) {
      return null;
    }
    
    const zScore = this.calculateZScore(amount, stats.mean, stats.stdDev);
    
    if (zScore >= this.config.zScoreThreshold) {
      const percentile = this.getPercentile(amount, amountStats.history);
      const direction = amount > stats.mean ? 'above' : 'below';
      
      // Calculate severity based on Z-score
      const severity = this.calculateAmountSeverity(zScore, amount, stats);
      
      // Adaptive confidence based on data quality
      const dataQuality = Math.min(1, amountStats.history.length / 100);
      const baseConfidence = Math.min(0.99, 0.7 + (zScore - 3) * 0.1);
      const confidence = baseConfidence * dataQuality;
      
      return this.formatAnomaly(
        'AMOUNT_OUTLIER',
        severity,
        {
          amount: amount,
          mean: stats.mean,
          stdDev: stats.stdDev,
          zScore: zScore,
          percentile: percentile,
          direction: direction,
          histogram: this.generateHistogramBins(amountStats.history, amount),
          dataPoints: amountStats.history.length,
          range: { min: stats.min, max: stats.max }
        },
        confidence,
        `Transfer of ${this.formatAmount(amount)} is ${zScore.toFixed(1)}σ ${direction} normal (avg: ${this.formatAmount(stats.mean)})`
      );
    }
    
    return null;
  }
  
  /**
   * Detect volume anomalies over time periods
   */
  async detectVolumeAnomaly(address, recentTransfers, volumeStats) {
    // Calculate daily volumes for recent period
    const dailyVolumes = this.calculateDailyVolumes(recentTransfers, 7); // Last 7 days
    const todayVolume = dailyVolumes[dailyVolumes.length - 1] || 0;
    
    if (volumeStats.history.length < this.config.minDataPoints) {
      return null;
    }
    
    const stats = this.calculateStats(volumeStats.history);
    
    if (stats.stdDev < this.config.minStdDev) {
      return null;
    }
    
    const zScore = this.calculateZScore(todayVolume, stats.mean, stats.stdDev);
    
    if (zScore >= this.config.zScoreThreshold) {
      const volumeRatio = todayVolume / Math.max(1, stats.mean);
      
      return this.formatAnomaly(
        'VOLUME_ANOMALY',
        this.calculateVolumeSeverity(zScore, volumeRatio),
        {
          todayVolume: todayVolume,
          avgDailyVolume: stats.mean,
          stdDev: stats.stdDev,
          zScore: zScore,
          volumeRatio: volumeRatio,
          recentVolumes: dailyVolumes,
          transactionCount: recentTransfers.filter(tx => 
            this.isToday(tx.timestamp || tx.block_timestamp)
          ).length
        },
        Math.min(0.95, 0.7 + (zScore - 3) * 0.08),
        `Daily volume of ${this.formatAmount(todayVolume)} is ${volumeRatio.toFixed(1)}x normal average`
      );
    }
    
    return null;
  }
  
  /**
   * Detect frequency anomalies (transaction rate)
   */
  async detectFrequencyAnomaly(address, recentTransfers, transactionCounts) {
    // Count transactions in different time windows
    const hourlyCount = this.countTransactionsInWindow(recentTransfers, 3600000); // 1 hour
    const dailyCount = this.countTransactionsInWindow(recentTransfers, 86400000); // 24 hours
    
    // Compare with historical averages
    const avgHourly = transactionCounts.daily / 24;
    const avgDaily = transactionCounts.daily;
    
    // Check hourly rate
    if (avgHourly > 0 && hourlyCount > avgHourly * 10) {
      return this.formatAnomaly(
        'FREQUENCY_ANOMALY',
        'HIGH',
        {
          currentHourlyRate: hourlyCount,
          avgHourlyRate: avgHourly,
          multiplier: hourlyCount / avgHourly,
          timeWindow: '1_hour',
          transactions: recentTransfers.slice(0, hourlyCount)
        },
        0.85,
        `${hourlyCount} transactions in 1 hour (${(hourlyCount / avgHourly).toFixed(1)}x normal rate)`
      );
    }
    
    // Check daily rate
    if (avgDaily > 0 && dailyCount > avgDaily * 5) {
      return this.formatAnomaly(
        'FREQUENCY_ANOMALY',
        'MEDIUM',
        {
          currentDailyRate: dailyCount,
          avgDailyRate: avgDaily,
          multiplier: dailyCount / avgDaily,
          timeWindow: '24_hours',
          peakHour: this.findPeakHour(recentTransfers)
        },
        0.80,
        `${dailyCount} transactions in 24 hours (${(dailyCount / avgDaily).toFixed(1)}x normal rate)`
      );
    }
    
    return null;
  }
  
  /**
   * Detect deviations from established trends
   */
  async detectTrendDeviation(address, activity, amountHistory) {
    if (amountHistory.length < 20) {
      return null;
    }
    
    // Calculate trend using simple moving averages
    const recentAvg = this.calculateMovingAverage(amountHistory.slice(-10));
    const olderAvg = this.calculateMovingAverage(amountHistory.slice(-20, -10));
    
    if (olderAvg === 0) return null;
    
    const trendDirection = recentAvg > olderAvg ? 'increasing' : 'decreasing';
    const trendStrength = Math.abs(recentAvg - olderAvg) / olderAvg;
    
    // Check if current activity deviates from trend
    if (activity.amount) {
      const expectedRange = this.calculateExpectedRange(recentAvg, trendDirection, trendStrength);
      
      if (activity.amount < expectedRange.min || activity.amount > expectedRange.max) {
        const deviation = trendDirection === 'increasing' 
          ? (activity.amount < recentAvg ? 'below' : 'above')
          : (activity.amount > recentAvg ? 'above' : 'below');
        
        return this.formatAnomaly(
          'TREND_DEVIATION',
          'MEDIUM',
          {
            amount: activity.amount,
            expectedRange: expectedRange,
            trendDirection: trendDirection,
            trendStrength: trendStrength,
            deviation: deviation,
            recentAverage: recentAvg,
            historicalAverage: olderAvg
          },
          0.75,
          `Amount ${this.formatAmount(activity.amount)} deviates from ${trendDirection} trend (expected: ${this.formatAmount(expectedRange.min)}-${this.formatAmount(expectedRange.max)})`
        );
      }
    }
    
    return null;
  }
  
  /**
   * Calculate severity for amount anomalies
   */
  calculateAmountSeverity(zScore, amount, stats) {
    // Consider both statistical significance and absolute amount
    const relativeScore = Math.min(1, zScore / 5); // Normalize z-score
    const absoluteScore = Math.min(1, amount / (stats.mean * 10)); // Large absolute amounts
    
    const combinedScore = (relativeScore * 0.7 + absoluteScore * 0.3);
    
    if (combinedScore >= 0.9) return 'CRITICAL';
    if (combinedScore >= 0.7) return 'HIGH';
    if (combinedScore >= 0.5) return 'MEDIUM';
    return 'LOW';
  }
  
  /**
   * Calculate severity for volume anomalies
   */
  calculateVolumeSeverity(zScore, volumeRatio) {
    if (zScore > 4 && volumeRatio > 10) return 'CRITICAL';
    if (zScore > 3.5 && volumeRatio > 5) return 'HIGH';
    if (zScore > 3 && volumeRatio > 3) return 'MEDIUM';
    return 'LOW';
  }
  
  /**
   * Helper methods
   */
  calculateDailyVolumes(transfers, days) {
    const volumes = new Array(days).fill(0);
    const now = Date.now();
    
    transfers.forEach(tx => {
      const txTime = new Date(tx.timestamp || tx.block_timestamp).getTime();
      const daysAgo = Math.floor((now - txTime) / 86400000);
      
      if (daysAgo >= 0 && daysAgo < days) {
        volumes[days - 1 - daysAgo] += parseFloat(tx.amount || 0);
      }
    });
    
    return volumes;
  }
  
  countTransactionsInWindow(transfers, windowMs) {
    const cutoff = Date.now() - windowMs;
    return transfers.filter(tx => 
      new Date(tx.timestamp || tx.block_timestamp).getTime() > cutoff
    ).length;
  }
  
  calculateMovingAverage(values) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  
  calculateExpectedRange(baseline, direction, strength) {
    const buffer = baseline * 0.5; // 50% buffer
    
    if (direction === 'increasing') {
      return {
        min: baseline * (1 - buffer),
        max: baseline * (1 + buffer + strength)
      };
    } else {
      return {
        min: baseline * (1 - buffer - strength),
        max: baseline * (1 + buffer)
      };
    }
  }
  
  generateHistogramBins(values, currentValue) {
    if (values.length < 10) return null;
    
    const sorted = [...values].sort((a, b) => a - b);
    const binCount = Math.min(10, Math.ceil(Math.sqrt(values.length)));
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const binWidth = (max - min) / binCount;
    
    const bins = new Array(binCount).fill(0);
    const binLabels = [];
    
    for (let i = 0; i < binCount; i++) {
      const binMin = min + i * binWidth;
      const binMax = min + (i + 1) * binWidth;
      binLabels.push(`${this.formatAmount(binMin)}-${this.formatAmount(binMax)}`);
      
      values.forEach(v => {
        if (v >= binMin && v < binMax) {
          bins[i]++;
        }
      });
    }
    
    // Find which bin the current value falls into
    const currentBin = Math.floor((currentValue - min) / binWidth);
    
    return {
      bins,
      labels: binLabels,
      currentBin: Math.max(0, Math.min(binCount - 1, currentBin)),
      binWidth
    };
  }
  
  findPeakHour(transfers) {
    const hourCounts = new Array(24).fill(0);
    
    transfers.forEach(tx => {
      const hour = new Date(tx.timestamp || tx.block_timestamp).getUTCHours();
      hourCounts[hour]++;
    });
    
    let maxCount = 0;
    let peakHour = 0;
    
    hourCounts.forEach((count, hour) => {
      if (count > maxCount) {
        maxCount = count;
        peakHour = hour;
      }
    });
    
    return { hour: peakHour, count: maxCount };
  }
  
  isToday(timestamp) {
    const txDate = new Date(timestamp);
    const today = new Date();
    return txDate.toDateString() === today.toDateString();
  }
  
  formatAmount(amount) {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(2)}M DOT`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(2)}K DOT`;
    }
    return `${amount.toFixed(2)} DOT`;
  }
}