const fs = require('fs').promises;
const path = require('path');
const { monitorLogger } = require('../utils/logger');

class PatternAnalysisEngine {
  constructor(config = {}) {
    this.config = {
      dataPath: config.dataPath || './data',
      lookbackDays: config.lookbackDays || 7,
      minSignificanceThreshold: config.minSignificanceThreshold || 0.2,
      ...config
    };
    
    this.patterns = {
      temporal: {},
      behavioral: {},
      baseline: {}
    };
  }

  async analyzePatterns() {
    monitorLogger.section('Starting Pattern Analysis Engine');
    
    try {
      // Load historical alerts data
      const alertsData = await this.loadHistoricalAlerts();
      
      if (alertsData.length === 0) {
        monitorLogger.warn('No historical data found for pattern analysis');
        return this.patterns;
      }
      
      monitorLogger.info(`Analyzing ${alertsData.length} alerts from ${this.config.lookbackDays} days`);
      
      // Run all pattern analysis modules
      await Promise.all([
        this.analyzeTemporalPatterns(alertsData),
        this.analyzeBehavioralPatterns(alertsData),
        this.calculateBaselines(alertsData)
      ]);
      
      // Generate pattern insights
      const insights = this.generateInsights();
      
      monitorLogger.success('Pattern analysis completed', {
        temporalPatterns: Object.keys(this.patterns.temporal).length,
        behavioralProfiles: Object.keys(this.patterns.behavioral).length,
        insights: insights.length
      });
      
      return {
        patterns: this.patterns,
        insights,
        summary: this.generateSummary()
      };
      
    } catch (error) {
      monitorLogger.error('Pattern analysis failed', error);
      throw error;
    }
  }

  async loadHistoricalAlerts() {
    const alerts = [];
    const alertsDir = path.join(this.config.dataPath, 'alerts');
    
    try {
      const files = await fs.readdir(alertsDir);
      const dateFiles = files.filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.json$/));
      
      // Load recent files within lookback period
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.lookbackDays);
      
      for (const file of dateFiles) {
        const fileDate = new Date(file.replace('.json', ''));
        if (fileDate >= cutoffDate) {
          const filePath = path.join(alertsDir, file);
          const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
          alerts.push(...(Array.isArray(data) ? data : []));
        }
      }
      
      return alerts;
    } catch (error) {
      monitorLogger.warn('Error loading historical alerts', error);
      return [];
    }
  }

  async analyzeTemporalPatterns(alerts) {
    monitorLogger.info('Analyzing temporal patterns...');
    
    // Initialize pattern buckets
    const hourlyPattern = new Array(24).fill(0);
    const dailyPattern = new Array(7).fill(0);
    const hourlyVolume = new Array(24).fill(0);
    const dailyVolume = new Array(7).fill(0);
    
    // Process each alert
    for (const alert of alerts) {
      const timestamp = new Date(alert.timestamp);
      const hour = timestamp.getUTCHours();
      const day = timestamp.getUTCDay(); // 0=Sunday, 1=Monday, etc.
      const amount = alert.amount || 0;
      
      hourlyPattern[hour]++;
      dailyPattern[day]++;
      hourlyVolume[hour] += amount;
      dailyVolume[day] += amount;
    }
    
    // Calculate normalized patterns
    const totalAlerts = alerts.length;
    const totalVolume = alerts.reduce((sum, a) => sum + (a.amount || 0), 0);
    
    this.patterns.temporal = {
      hourly: {
        frequency: hourlyPattern.map(count => count / totalAlerts),
        volume: hourlyVolume.map(vol => vol / totalVolume),
        raw: hourlyPattern
      },
      daily: {
        frequency: dailyPattern.map(count => count / totalAlerts),
        volume: dailyVolume.map(vol => vol / totalVolume),
        raw: dailyPattern
      },
      peaks: this.identifyPeaks(hourlyPattern, dailyPattern),
      quietPeriods: this.identifyQuietPeriods(hourlyPattern, dailyPattern)
    };
  }

  async analyzeBehavioralPatterns(alerts) {
    monitorLogger.info('Analyzing behavioral patterns...');
    
    // Group alerts by account type and address
    const accountProfiles = {};
    
    for (const alert of alerts) {
      const address = alert.address;
      if (!accountProfiles[address]) {
        accountProfiles[address] = {
          alerts: [],
          totalVolume: 0,
          frequency: 0,
          types: {},
          timePattern: new Array(24).fill(0)
        };
      }
      
      const profile = accountProfiles[address];
      profile.alerts.push(alert);
      profile.totalVolume += alert.amount || 0;
      profile.frequency++;
      
      // Track alert types
      const type = alert.type || 'unknown';
      profile.types[type] = (profile.types[type] || 0) + 1;
      
      // Track time pattern
      const hour = new Date(alert.timestamp).getUTCHours();
      profile.timePattern[hour]++;
    }
    
    // Classify account behaviors
    const behaviorTypes = {};
    
    for (const [address, profile] of Object.entries(accountProfiles)) {
      const behavior = this.classifyAccountBehavior(profile, alerts.length);
      
      if (!behaviorTypes[behavior.type]) {
        behaviorTypes[behavior.type] = [];
      }
      behaviorTypes[behavior.type].push({
        address: address.slice(0, 8) + '...',
        ...behavior
      });
    }
    
    this.patterns.behavioral = {
      accountProfiles: Object.keys(accountProfiles).length,
      behaviorTypes,
      topActive: this.getTopActiveAccounts(accountProfiles),
      suspiciousPatterns: this.identifySuspiciousPatterns(accountProfiles)
    };
  }

  classifyAccountBehavior(profile, totalAlerts) {
    const avgVolume = profile.totalVolume / profile.frequency;
    const relativeFrequency = profile.frequency / totalAlerts;
    
    // Determine primary alert type
    const primaryType = Object.keys(profile.types).reduce((a, b) => 
      profile.types[a] > profile.types[b] ? a : b
    );
    
    // Check time distribution (concentrated vs distributed)
    const maxHourActivity = Math.max(...profile.timePattern);
    const avgHourActivity = profile.timePattern.reduce((sum, h) => sum + h, 0) / 24;
    const timeConcentration = maxHourActivity / (avgHourActivity || 1);
    
    // Classify behavior
    let behaviorType;
    if (timeConcentration > 5 && primaryType === 'exchange_activity') {
      behaviorType = 'scheduled_exchange';
    } else if (relativeFrequency > 0.1) {
      behaviorType = 'high_frequency_trader';
    } else if (avgVolume > 100000) {
      behaviorType = 'whale';
    } else if (timeConcentration < 2) {
      behaviorType = 'distributed_activity';
    } else {
      behaviorType = 'regular_trader';
    }
    
    return {
      type: behaviorType,
      frequency: profile.frequency,
      avgVolume: Math.round(avgVolume),
      timeConcentration: Math.round(timeConcentration * 100) / 100,
      primaryType
    };
  }

  async calculateBaselines(alerts) {
    monitorLogger.info('Calculating activity baselines...');
    
    // Calculate various baseline metrics
    const amounts = alerts.map(a => a.amount || 0).filter(a => a > 0);
    const timeIntervals = this.calculateTimeIntervals(alerts);
    
    this.patterns.baseline = {
      volume: {
        total: amounts.reduce((sum, a) => sum + a, 0),
        average: amounts.reduce((sum, a) => sum + a, 0) / amounts.length,
        median: this.calculatePercentile(amounts, 0.5),
        p90: this.calculatePercentile(amounts, 0.9),
        p95: this.calculatePercentile(amounts, 0.95),
        p99: this.calculatePercentile(amounts, 0.99)
      },
      frequency: {
        totalAlerts: alerts.length,
        avgPerDay: alerts.length / this.config.lookbackDays,
        avgInterval: timeIntervals.reduce((sum, i) => sum + i, 0) / timeIntervals.length
      },
      types: this.calculateTypeDistribution(alerts),
      anomalyThresholds: this.calculateAnomalyThresholds(amounts, timeIntervals)
    };
  }

  identifyPeaks(hourlyPattern, dailyPattern) {
    const peaks = {
      hourly: [],
      daily: []
    };
    
    // Find hourly peaks (above average + 1 std dev)
    const hourlyAvg = hourlyPattern.reduce((sum, h) => sum + h, 0) / 24;
    const hourlyStd = Math.sqrt(
      hourlyPattern.reduce((sum, h) => sum + Math.pow(h - hourlyAvg, 2), 0) / 24
    );
    
    hourlyPattern.forEach((count, hour) => {
      if (count > hourlyAvg + hourlyStd) {
        peaks.hourly.push({ hour, count, significance: (count - hourlyAvg) / hourlyStd });
      }
    });
    
    // Find daily peaks
    const dailyAvg = dailyPattern.reduce((sum, d) => sum + d, 0) / 7;
    const dailyStd = Math.sqrt(
      dailyPattern.reduce((sum, d) => sum + Math.pow(d - dailyAvg, 2), 0) / 7
    );
    
    dailyPattern.forEach((count, day) => {
      if (count > dailyAvg + dailyStd) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        peaks.daily.push({ 
          day: dayNames[day], 
          count, 
          significance: (count - dailyAvg) / dailyStd 
        });
      }
    });
    
    return peaks;
  }

  identifyQuietPeriods(hourlyPattern, dailyPattern) {
    const quiet = {
      hourly: [],
      daily: []
    };
    
    const hourlyAvg = hourlyPattern.reduce((sum, h) => sum + h, 0) / 24;
    const dailyAvg = dailyPattern.reduce((sum, d) => sum + d, 0) / 7;
    
    hourlyPattern.forEach((count, hour) => {
      if (count < hourlyAvg * 0.3) {
        quiet.hourly.push(hour);
      }
    });
    
    dailyPattern.forEach((count, day) => {
      if (count < dailyAvg * 0.3) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        quiet.daily.push(dayNames[day]);
      }
    });
    
    return quiet;
  }

  getTopActiveAccounts(accountProfiles) {
    return Object.entries(accountProfiles)
      .sort((a, b) => b[1].frequency - a[1].frequency)
      .slice(0, 10)
      .map(([address, profile]) => ({
        address: address.slice(0, 8) + '...',
        frequency: profile.frequency,
        totalVolume: Math.round(profile.totalVolume)
      }));
  }

  identifySuspiciousPatterns(accountProfiles) {
    const suspicious = [];
    
    for (const [address, profile] of Object.entries(accountProfiles)) {
      // Check for unusual patterns
      const maxHourActivity = Math.max(...profile.timePattern);
      const avgHourActivity = profile.timePattern.reduce((sum, h) => sum + h, 0) / 24;
      const concentration = maxHourActivity / (avgHourActivity || 1);
      
      // Flag if extremely concentrated activity (possible bot)
      if (concentration > 10 && profile.frequency > 5) {
        suspicious.push({
          address: address.slice(0, 8) + '...',
          reason: 'Extremely concentrated activity pattern',
          concentration: Math.round(concentration * 100) / 100,
          frequency: profile.frequency
        });
      }
      
      // Flag if very high frequency with uniform amounts (possible automated trading)
      const amounts = profile.alerts.map(a => a.amount || 0);
      const uniqueAmounts = new Set(amounts).size;
      if (profile.frequency > 10 && uniqueAmounts < 3) {
        suspicious.push({
          address: address.slice(0, 8) + '...',
          reason: 'High frequency with uniform amounts',
          frequency: profile.frequency,
          uniqueAmounts
        });
      }
    }
    
    return suspicious;
  }

  calculateTimeIntervals(alerts) {
    if (alerts.length < 2) return [];
    
    const sortedAlerts = alerts.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const intervals = [];
    
    for (let i = 1; i < sortedAlerts.length; i++) {
      const interval = new Date(sortedAlerts[i].timestamp) - new Date(sortedAlerts[i-1].timestamp);
      intervals.push(interval / (1000 * 60)); // Convert to minutes
    }
    
    return intervals;
  }

  calculatePercentile(arr, percentile) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.floor(sorted.length * percentile);
    return sorted[index] || 0;
  }

  calculateTypeDistribution(alerts) {
    const types = {};
    alerts.forEach(alert => {
      const type = alert.type || 'unknown';
      types[type] = (types[type] || 0) + 1;
    });
    
    const total = alerts.length;
    const distribution = {};
    for (const [type, count] of Object.entries(types)) {
      distribution[type] = {
        count,
        percentage: Math.round((count / total) * 100 * 100) / 100
      };
    }
    
    return distribution;
  }

  calculateAnomalyThresholds(amounts, intervals) {
    return {
      volume: {
        high: this.calculatePercentile(amounts, 0.95),
        extreme: this.calculatePercentile(amounts, 0.99)
      },
      frequency: {
        rapidFire: this.calculatePercentile(intervals, 0.05), // 5th percentile = very fast
        burst: this.calculatePercentile(intervals, 0.1)
      }
    };
  }

  generateInsights() {
    const insights = [];
    
    // Temporal insights
    if (this.patterns.temporal.peaks) {
      if (this.patterns.temporal.peaks.hourly.length > 0) {
        const peakHours = this.patterns.temporal.peaks.hourly.map(p => `${p.hour}:00`).join(', ');
        insights.push({
          type: 'temporal',
          category: 'peak_hours',
          message: `Peak activity hours: ${peakHours}`,
          significance: 'medium'
        });
      }
      
      if (this.patterns.temporal.quietPeriods.hourly.length > 3) {
        insights.push({
          type: 'temporal',
          category: 'quiet_period',
          message: `Extended quiet period detected: ${this.patterns.temporal.quietPeriods.hourly.length} low-activity hours`,
          significance: 'low'
        });
      }
    }
    
    // Behavioral insights
    if (this.patterns.behavioral.suspiciousPatterns?.length > 0) {
      insights.push({
        type: 'behavioral',
        category: 'suspicious',
        message: `${this.patterns.behavioral.suspiciousPatterns.length} accounts showing suspicious patterns`,
        significance: 'high'
      });
    }
    
    // Volume insights
    if (this.patterns.baseline.volume) {
      const { average, p95 } = this.patterns.baseline.volume;
      if (p95 > average * 10) {
        insights.push({
          type: 'volume',
          category: 'high_variance',
          message: `High volume variance detected (95th percentile: ${Math.round(p95)} vs avg: ${Math.round(average)})`,
          significance: 'medium'
        });
      }
    }
    
    return insights;
  }

  generateSummary() {
    return {
      analysisDate: new Date().toISOString(),
      lookbackDays: this.config.lookbackDays,
      patternsIdentified: {
        temporal: Object.keys(this.patterns.temporal).length,
        behavioral: Object.keys(this.patterns.behavioral).length,
        baseline: Object.keys(this.patterns.baseline).length
      },
      keyFindings: this.generateInsights().map(i => i.message)
    };
  }

  // Method to evaluate if an alert is unusual based on patterns
  evaluateAlert(alert) {
    if (!this.patterns.baseline.volume) {
      return { isAnomalous: false, reason: 'No baseline established' };
    }
    
    const amount = alert.amount || 0;
    const timestamp = new Date(alert.timestamp);
    const hour = timestamp.getUTCHours();
    
    // Check volume anomaly
    const isHighVolume = amount > this.patterns.baseline.anomalyThresholds.volume.high;
    const isExtremeVolume = amount > this.patterns.baseline.anomalyThresholds.volume.extreme;
    
    // Check temporal anomaly
    const expectedHourlyFreq = this.patterns.temporal.hourly?.frequency[hour] || 0;
    const isUnusualTime = expectedHourlyFreq < 0.02; // Less than 2% of usual activity
    
    let anomalyScore = 0;
    const reasons = [];
    
    if (isExtremeVolume) {
      anomalyScore += 3;
      reasons.push('Extreme volume (>99th percentile)');
    } else if (isHighVolume) {
      anomalyScore += 2;
      reasons.push('High volume (>95th percentile)');
    }
    
    if (isUnusualTime) {
      anomalyScore += 1;
      reasons.push('Unusual timing');
    }
    
    return {
      isAnomalous: anomalyScore >= 2,
      anomalyScore,
      reasons: reasons.join(', ') || 'Normal activity'
    };
  }
}

module.exports = PatternAnalysisEngine;