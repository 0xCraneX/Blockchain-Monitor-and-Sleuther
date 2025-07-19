import { BaseAnomalyDetector } from '../BaseAnomalyDetector.js';

/**
 * VelocityAnomalyDetector - Detects sudden changes in transaction velocity
 * Identifies spikes, sustained high activity, and unusual acceleration patterns
 */
export class VelocityAnomalyDetector extends BaseAnomalyDetector {
  constructor(config = {}) {
    super(config);
    
    this.config = {
      ...this.config,
      // Velocity thresholds
      spikeMultiplier: config.spikeMultiplier || 5, // 5x normal rate
      sustainedMultiplier: config.sustainedMultiplier || 3, // 3x for sustained
      sustainedDuration: config.sustainedDuration || 3600000, // 1 hour
      
      // Time windows for analysis
      windows: config.windows || {
        minute: 60000,
        hour: 3600000,
        day: 86400000,
        week: 604800000
      },
      
      // Acceleration detection
      accelerationThreshold: config.accelerationThreshold || 2, // 2x increase per period
      decelerationThreshold: config.decelerationThreshold || 0.5, // 50% decrease
      
      // Burst detection
      burstMinTransactions: config.burstMinTransactions || 10,
      burstTimeWindow: config.burstTimeWindow || 300000, // 5 minutes
      
      // Pattern analysis
      velocityHistorySize: config.velocityHistorySize || 100,
      adaptiveBaseline: config.adaptiveBaseline !== false
    };
    
    // Velocity tracking
    this.velocityCache = new Map(); // address -> velocity history
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
    
    // Calculate current velocities across time windows
    const velocities = this.calculateVelocities(recentTransfers);
    const historicalVelocities = pattern.velocity;
    
    // 1. Velocity spike detection
    const spikeAnomaly = await this.detectVelocitySpike(
      address,
      velocities,
      historicalVelocities
    );
    if (spikeAnomaly) anomalies.push(spikeAnomaly);
    
    // 2. Sustained high activity detection
    const sustainedAnomaly = await this.detectSustainedActivity(
      address,
      recentTransfers,
      historicalVelocities
    );
    if (sustainedAnomaly) anomalies.push(sustainedAnomaly);
    
    // 3. Acceleration/deceleration detection
    const accelerationAnomaly = await this.detectAcceleration(
      address,
      velocities,
      this.getVelocityHistory(address)
    );
    if (accelerationAnomaly) anomalies.push(accelerationAnomaly);
    
    // 4. Transaction burst detection
    const burstAnomaly = await this.detectTransactionBurst(
      address,
      recentTransfers
    );
    if (burstAnomaly) anomalies.push(burstAnomaly);
    
    // Update velocity history
    this.updateVelocityHistory(address, velocities);
    
    // Return most significant anomaly
    if (anomalies.length > 0) {
      return anomalies.sort((a, b) => b.confidence - a.confidence)[0];
    }
    
    return null;
  }
  
  /**
   * Detect sudden spikes in transaction velocity
   */
  async detectVelocitySpike(address, currentVelocities, historicalVelocities) {
    const anomalies = [];
    
    // Check each time window
    for (const [window, currentRate] of Object.entries(currentVelocities)) {
      const historicalRate = historicalVelocities[`${window}Rate`];
      
      if (!historicalRate || !historicalRate.average || historicalRate.average === 0) {
        continue; // Not enough historical data
      }
      
      const multiplier = currentRate / historicalRate.average;
      
      if (multiplier >= this.config.spikeMultiplier) {
        // Calculate spike characteristics
        const spikeData = this.analyzeSpikeCharacteristics(
          currentRate,
          historicalRate,
          window
        );
        
        anomalies.push({
          window,
          multiplier,
          severity: this.calculateSpikeSeverity(multiplier, window),
          confidence: this.calculateSpikeConfidence(multiplier, historicalRate),
          ...spikeData
        });
      }
    }
    
    if (anomalies.length > 0) {
      // Select most significant spike
      const primarySpike = anomalies.sort((a, b) => b.multiplier - a.multiplier)[0];
      
      return this.formatAnomaly(
        'VELOCITY_SPIKE',
        primarySpike.severity,
        {
          timeWindow: primarySpike.window,
          currentRate: currentVelocities[primarySpike.window],
          normalRate: historicalVelocities[`${primarySpike.window}Rate`].average,
          multiplier: primarySpike.multiplier,
          allSpikes: anomalies,
          pattern: primarySpike.pattern,
          duration: primarySpike.duration,
          transactionCount: this.countTransactionsInWindow(
            primarySpike.window,
            primarySpike.duration
          )
        },
        primarySpike.confidence,
        `Transaction rate ${primarySpike.multiplier.toFixed(1)}x normal in ${this.formatTimeWindow(primarySpike.window)}`
      );
    }
    
    return null;
  }
  
  /**
   * Detect sustained periods of high activity
   */
  async detectSustainedActivity(address, recentTransfers, historicalVelocities) {
    // Create time buckets for sustained activity analysis
    const buckets = this.createTimeBuckets(
      recentTransfers,
      this.config.sustainedDuration
    );
    
    if (buckets.length < 2) {
      return null; // Not enough data for sustained activity
    }
    
    // Check for sustained high activity
    const avgHourlyRate = historicalVelocities.hourlyRate.average || 0;
    
    if (avgHourlyRate === 0) {
      return null; // No baseline
    }
    
    let sustainedBuckets = 0;
    let totalTransactions = 0;
    let peakRate = 0;
    
    for (const bucket of buckets) {
      const bucketRate = bucket.count / (this.config.sustainedDuration / 3600000); // Convert to hourly
      
      if (bucketRate >= avgHourlyRate * this.config.sustainedMultiplier) {
        sustainedBuckets++;
        totalTransactions += bucket.count;
        peakRate = Math.max(peakRate, bucketRate);
      }
    }
    
    if (sustainedBuckets >= 2) {
      const duration = sustainedBuckets * this.config.sustainedDuration;
      const avgSustainedRate = totalTransactions / (duration / 3600000);
      
      return this.formatAnomaly(
        'SUSTAINED_HIGH_ACTIVITY',
        this.calculateSustainedSeverity(sustainedBuckets, avgSustainedRate / avgHourlyRate),
        {
          duration: duration,
          durationHours: duration / 3600000,
          periodsDetected: sustainedBuckets,
          totalTransactions: totalTransactions,
          averageRate: avgSustainedRate,
          normalRate: avgHourlyRate,
          peakRate: peakRate,
          multiplier: avgSustainedRate / avgHourlyRate,
          buckets: buckets.slice(0, sustainedBuckets),
          pattern: this.identifySustainedPattern(buckets)
        },
        Math.min(0.95, 0.8 + sustainedBuckets * 0.05),
        `Sustained high activity for ${(duration / 3600000).toFixed(1)} hours (${(avgSustainedRate / avgHourlyRate).toFixed(1)}x normal)`
      );
    }
    
    return null;
  }
  
  /**
   * Detect rapid acceleration or deceleration in activity
   */
  async detectAcceleration(address, currentVelocities, velocityHistory) {
    if (!velocityHistory || velocityHistory.length < 3) {
      return null; // Need history for acceleration
    }
    
    // Calculate acceleration across different time scales
    const accelerations = {};
    
    for (const window of ['hour', 'day']) {
      const history = velocityHistory
        .slice(-5)
        .map(v => v[window] || 0);
      
      if (history.length >= 3) {
        const acceleration = this.calculateAcceleration(history);
        
        if (Math.abs(acceleration.rate) >= 
            (acceleration.rate > 0 ? this.config.accelerationThreshold : 1 - this.config.decelerationThreshold)) {
          accelerations[window] = acceleration;
        }
      }
    }
    
    if (Object.keys(accelerations).length > 0) {
      // Find most significant acceleration
      const primaryWindow = Object.keys(accelerations).sort(
        (a, b) => Math.abs(accelerations[b].rate) - Math.abs(accelerations[a].rate)
      )[0];
      
      const acceleration = accelerations[primaryWindow];
      const isAccelerating = acceleration.rate > 0;
      
      return this.formatAnomaly(
        isAccelerating ? 'VELOCITY_ACCELERATION' : 'VELOCITY_DECELERATION',
        this.calculateAccelerationSeverity(acceleration.rate, isAccelerating),
        {
          timeWindow: primaryWindow,
          accelerationRate: acceleration.rate,
          direction: isAccelerating ? 'increasing' : 'decreasing',
          fromRate: acceleration.from,
          toRate: acceleration.to,
          periods: acceleration.periods,
          trend: acceleration.trend,
          projectedRate: acceleration.projected,
          allAccelerations: accelerations
        },
        0.85,
        `Activity ${isAccelerating ? 'accelerating' : 'decelerating'} ${Math.abs(acceleration.rate).toFixed(1)}x per ${primaryWindow}`
      );
    }
    
    return null;
  }
  
  /**
   * Detect transaction bursts (many transactions in short time)
   */
  async detectTransactionBurst(address, recentTransfers) {
    // Look for bursts in recent activity
    const now = Date.now();
    const bursts = [];
    
    // Sliding window approach
    for (let i = 0; i < recentTransfers.length; i++) {
      const windowStart = new Date(
        recentTransfers[i].timestamp || recentTransfers[i].block_timestamp
      ).getTime();
      
      if (now - windowStart > this.config.burstTimeWindow * 2) {
        break; // Too old for burst detection
      }
      
      let count = 0;
      let volume = 0;
      let endIndex = i;
      
      // Count transactions within burst window
      for (let j = i; j < recentTransfers.length; j++) {
        const txTime = new Date(
          recentTransfers[j].timestamp || recentTransfers[j].block_timestamp
        ).getTime();
        
        if (txTime - windowStart <= this.config.burstTimeWindow) {
          count++;
          volume += parseFloat(recentTransfers[j].amount || 0);
          endIndex = j;
        } else {
          break;
        }
      }
      
      if (count >= this.config.burstMinTransactions) {
        bursts.push({
          startTime: windowStart,
          endTime: new Date(
            recentTransfers[endIndex].timestamp || recentTransfers[endIndex].block_timestamp
          ).getTime(),
          count,
          volume,
          duration: new Date(
            recentTransfers[endIndex].timestamp || recentTransfers[endIndex].block_timestamp
          ).getTime() - windowStart,
          transactions: recentTransfers.slice(i, endIndex + 1)
        });
        
        i = endIndex; // Skip processed transactions
      }
    }
    
    if (bursts.length > 0) {
      // Select most significant burst
      const primaryBurst = bursts.sort((a, b) => b.count - a.count)[0];
      const burstRate = primaryBurst.count / (primaryBurst.duration / 60000); // Per minute
      
      return this.formatAnomaly(
        'TRANSACTION_BURST',
        this.calculateBurstSeverity(primaryBurst.count, primaryBurst.duration),
        {
          transactionCount: primaryBurst.count,
          duration: primaryBurst.duration,
          durationMinutes: primaryBurst.duration / 60000,
          volume: primaryBurst.volume,
          rate: burstRate,
          avgAmount: primaryBurst.volume / primaryBurst.count,
          startTime: new Date(primaryBurst.startTime).toISOString(),
          endTime: new Date(primaryBurst.endTime).toISOString(),
          pattern: this.analyzeBurstPattern(primaryBurst.transactions),
          allBursts: bursts.length
        },
        Math.min(0.9, 0.7 + primaryBurst.count / 50),
        `Burst of ${primaryBurst.count} transactions in ${(primaryBurst.duration / 60000).toFixed(1)} minutes`
      );
    }
    
    return null;
  }
  
  /**
   * Helper methods for velocity analysis
   */
  calculateVelocities(transfers) {
    const velocities = {};
    const now = Date.now();
    
    for (const [windowName, windowMs] of Object.entries(this.config.windows)) {
      const count = transfers.filter(tx => {
        const txTime = new Date(tx.timestamp || tx.block_timestamp).getTime();
        return now - txTime <= windowMs;
      }).length;
      
      // Convert to rate per hour for consistency
      const hoursInWindow = windowMs / 3600000;
      velocities[windowName] = count / hoursInWindow;
    }
    
    return velocities;
  }
  
  createTimeBuckets(transfers, bucketSize) {
    if (transfers.length === 0) return [];
    
    const buckets = [];
    const sortedTransfers = [...transfers].sort((a, b) => {
      const timeA = new Date(a.timestamp || a.block_timestamp).getTime();
      const timeB = new Date(b.timestamp || b.block_timestamp).getTime();
      return timeA - timeB;
    });
    
    const startTime = new Date(
      sortedTransfers[0].timestamp || sortedTransfers[0].block_timestamp
    ).getTime();
    
    const endTime = new Date(
      sortedTransfers[sortedTransfers.length - 1].timestamp || 
      sortedTransfers[sortedTransfers.length - 1].block_timestamp
    ).getTime();
    
    const bucketCount = Math.ceil((endTime - startTime) / bucketSize) + 1;
    
    // Initialize buckets
    for (let i = 0; i < bucketCount; i++) {
      buckets.push({
        startTime: startTime + i * bucketSize,
        endTime: startTime + (i + 1) * bucketSize,
        count: 0,
        volume: 0,
        transactions: []
      });
    }
    
    // Fill buckets
    sortedTransfers.forEach(tx => {
      const txTime = new Date(tx.timestamp || tx.block_timestamp).getTime();
      const bucketIndex = Math.floor((txTime - startTime) / bucketSize);
      
      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        buckets[bucketIndex].count++;
        buckets[bucketIndex].volume += parseFloat(tx.amount || 0);
        buckets[bucketIndex].transactions.push(tx);
      }
    });
    
    return buckets;
  }
  
  calculateAcceleration(velocityHistory) {
    const n = velocityHistory.length;
    if (n < 2) return { rate: 0, from: 0, to: 0 };
    
    // Calculate rate of change
    const changes = [];
    for (let i = 1; i < n; i++) {
      if (velocityHistory[i - 1] > 0) {
        changes.push(velocityHistory[i] / velocityHistory[i - 1]);
      }
    }
    
    if (changes.length === 0) return { rate: 0, from: 0, to: 0 };
    
    // Average rate of change
    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    
    // Linear regression for trend
    const xValues = Array.from({ length: n }, (_, i) => i);
    const yValues = velocityHistory;
    
    const xMean = xValues.reduce((a, b) => a + b, 0) / n;
    const yMean = yValues.reduce((a, b) => a + b, 0) / n;
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
      denominator += Math.pow(xValues[i] - xMean, 2);
    }
    
    const slope = denominator !== 0 ? numerator / denominator : 0;
    
    return {
      rate: avgChange,
      from: velocityHistory[0],
      to: velocityHistory[n - 1],
      periods: n,
      trend: slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable',
      projected: velocityHistory[n - 1] * avgChange
    };
  }
  
  analyzeSpikeCharacteristics(currentRate, historicalRate, window) {
    // Determine spike pattern
    let pattern = 'sudden';
    let duration = this.config.windows[window];
    
    // Check if spike is isolated or part of a pattern
    if (historicalRate.max && currentRate > historicalRate.max * 1.5) {
      pattern = 'unprecedented';
    } else if (historicalRate.spikes && historicalRate.spikes.length > 0) {
      // Check if similar to previous spikes
      const similarSpikes = historicalRate.spikes.filter(
        s => Math.abs(s.multiplier - (currentRate / historicalRate.average)) < 1
      );
      
      if (similarSpikes.length > 0) {
        pattern = 'recurring';
      }
    }
    
    return { pattern, duration };
  }
  
  identifySustainedPattern(buckets) {
    // Analyze pattern of sustained activity
    const rates = buckets.map(b => b.count);
    
    // Check for increasing/decreasing/stable
    let increasing = 0;
    let decreasing = 0;
    
    for (let i = 1; i < rates.length; i++) {
      if (rates[i] > rates[i - 1] * 1.1) increasing++;
      else if (rates[i] < rates[i - 1] * 0.9) decreasing++;
    }
    
    if (increasing > decreasing * 2) return 'escalating';
    if (decreasing > increasing * 2) return 'declining';
    
    // Check for periodic pattern
    if (this.hasPeriodicPattern(rates)) return 'periodic';
    
    return 'steady';
  }
  
  analyzeBurstPattern(transactions) {
    // Analyze characteristics of the burst
    const amounts = transactions.map(tx => parseFloat(tx.amount || 0));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    
    // Check if amounts are similar (potential spam/wash)
    const variance = this.calculateVariance(amounts);
    const cv = Math.sqrt(variance) / avgAmount; // Coefficient of variation
    
    if (cv < 0.1) return 'uniform_amounts';
    
    // Check addresses
    const addresses = new Set();
    transactions.forEach(tx => {
      if (tx.from) addresses.add(tx.from);
      if (tx.to) addresses.add(tx.to);
    });
    
    if (addresses.size < transactions.length * 0.5) return 'limited_addresses';
    
    return 'diverse';
  }
  
  hasPeriodicPattern(values) {
    // Simple periodicity check
    if (values.length < 4) return false;
    
    for (let period = 2; period <= Math.floor(values.length / 2); period++) {
      let matches = 0;
      
      for (let i = period; i < values.length; i++) {
        if (Math.abs(values[i] - values[i - period]) < values[i] * 0.2) {
          matches++;
        }
      }
      
      if (matches > (values.length - period) * 0.7) {
        return true;
      }
    }
    
    return false;
  }
  
  calculateSpikeSeverity(multiplier, window) {
    // Longer time windows with high multipliers are more severe
    const windowWeight = {
      'minute': 0.7,
      'hour': 1.0,
      'day': 1.2,
      'week': 1.5
    }[window] || 1.0;
    
    const score = Math.log(multiplier) * windowWeight;
    
    if (score >= 5) return 'CRITICAL';
    if (score >= 3.5) return 'HIGH';
    if (score >= 2) return 'MEDIUM';
    return 'LOW';
  }
  
  calculateSpikeConfidence(multiplier, historicalRate) {
    // Higher confidence with more historical data
    const dataPoints = historicalRate.dataPoints || 0;
    const dataConfidence = Math.min(1, dataPoints / 100);
    
    // Higher confidence for extreme spikes
    const spikeConfidence = Math.min(1, (multiplier - this.config.spikeMultiplier) / 10 + 0.7);
    
    return spikeConfidence * (0.5 + dataConfidence * 0.5);
  }
  
  calculateSustainedSeverity(periods, multiplier) {
    if (periods >= 6 && multiplier >= 5) return 'CRITICAL';
    if (periods >= 4 && multiplier >= 3) return 'HIGH';
    if (periods >= 2 && multiplier >= 2) return 'MEDIUM';
    return 'LOW';
  }
  
  calculateAccelerationSeverity(rate, isAccelerating) {
    const absRate = Math.abs(rate);
    
    if (isAccelerating) {
      if (absRate >= 5) return 'HIGH';
      if (absRate >= 3) return 'MEDIUM';
      return 'LOW';
    } else {
      // Deceleration might indicate problems
      if (absRate <= 0.2) return 'HIGH';
      if (absRate <= 0.5) return 'MEDIUM';
      return 'LOW';
    }
  }
  
  calculateBurstSeverity(count, duration) {
    const rate = count / (duration / 60000); // Per minute
    
    if (count >= 50 || rate >= 20) return 'HIGH';
    if (count >= 20 || rate >= 10) return 'MEDIUM';
    return 'LOW';
  }
  
  getVelocityHistory(address) {
    return this.velocityCache.get(address) || [];
  }
  
  updateVelocityHistory(address, velocities) {
    let history = this.velocityCache.get(address) || [];
    
    history.push({
      timestamp: Date.now(),
      ...velocities
    });
    
    // Keep limited history
    if (history.length > this.config.velocityHistorySize) {
      history = history.slice(-this.config.velocityHistorySize);
    }
    
    this.velocityCache.set(address, history);
  }
  
  countTransactionsInWindow(windowName, duration) {
    // Estimate based on velocity
    const windowMs = this.config.windows[windowName] || duration;
    const hoursInWindow = windowMs / 3600000;
    
    return Math.round(hoursInWindow * 10); // Rough estimate
  }
  
  formatTimeWindow(window) {
    const formatters = {
      'minute': 'last minute',
      'hour': 'last hour',
      'day': 'last 24 hours',
      'week': 'last week'
    };
    
    return formatters[window] || window;
  }
  
  calculateVariance(values) {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }
}