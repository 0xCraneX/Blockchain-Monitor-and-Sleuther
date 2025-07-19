import { BaseAnomalyDetector } from '../BaseAnomalyDetector.js';

/**
 * TemporalAnomalyDetector - Detects anomalies in timing patterns
 * Analyzes: unusual hours, timezone shifts, periodic behaviors, timing correlations
 */
export class TemporalAnomalyDetector extends BaseAnomalyDetector {
  constructor(config = {}) {
    super(config);
    
    this.config = {
      ...this.config,
      // Time window analysis
      unusualHourThreshold: config.unusualHourThreshold || 0.05, // 5% activity threshold
      weekendActivityRatio: config.weekendActivityRatio || 0.3, // Weekend vs weekday
      
      // Timezone detection
      timezoneConsistencyThreshold: config.timezoneConsistencyThreshold || 0.8,
      timezoneShiftWindow: config.timezoneShiftWindow || 30 * 24 * 60 * 60 * 1000, // 30 days
      
      // Periodic pattern detection
      periodicityConfidence: config.periodicityConfidence || 0.7,
      minPeriodicCycles: config.minPeriodicCycles || 3,
      
      // Holiday detection
      holidayActivityThreshold: config.holidayActivityThreshold || 0.2, // 20% of normal
      knownHolidays: config.knownHolidays || [
        // Major global holidays (add more as needed)
        '01-01', // New Year
        '12-25', // Christmas
      ],
      
      // Burst timing
      suspiciousBurstHours: config.suspiciousBurstHours || [0, 1, 2, 3, 4, 5], // Late night
      coordinatedTimingWindow: config.coordinatedTimingWindow || 300000, // 5 minutes
      
      // Analysis windows
      shortTermDays: config.shortTermDays || 7,
      longTermDays: config.longTermDays || 90
    };
    
    // Timezone database (simplified)
    this.timezones = {
      'UTC-12': { offset: -12, name: 'Baker Island' },
      'UTC-11': { offset: -11, name: 'American Samoa' },
      'UTC-10': { offset: -10, name: 'Hawaii' },
      'UTC-9': { offset: -9, name: 'Alaska' },
      'UTC-8': { offset: -8, name: 'Pacific Time' },
      'UTC-7': { offset: -7, name: 'Mountain Time' },
      'UTC-6': { offset: -6, name: 'Central Time' },
      'UTC-5': { offset: -5, name: 'Eastern Time' },
      'UTC-4': { offset: -4, name: 'Atlantic Time' },
      'UTC-3': { offset: -3, name: 'Brazil' },
      'UTC-2': { offset: -2, name: 'Mid-Atlantic' },
      'UTC-1': { offset: -1, name: 'Azores' },
      'UTC+0': { offset: 0, name: 'London/UTC' },
      'UTC+1': { offset: 1, name: 'Central Europe' },
      'UTC+2': { offset: 2, name: 'Eastern Europe' },
      'UTC+3': { offset: 3, name: 'Moscow' },
      'UTC+4': { offset: 4, name: 'Dubai' },
      'UTC+5': { offset: 5, name: 'Pakistan' },
      'UTC+5.5': { offset: 5.5, name: 'India' },
      'UTC+6': { offset: 6, name: 'Bangladesh' },
      'UTC+7': { offset: 7, name: 'Thailand' },
      'UTC+8': { offset: 8, name: 'China/Singapore' },
      'UTC+9': { offset: 9, name: 'Japan/Korea' },
      'UTC+10': { offset: 10, name: 'Sydney' },
      'UTC+11': { offset: 11, name: 'Solomon Islands' },
      'UTC+12': { offset: 12, name: 'New Zealand' }
    };
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
    
    // Current activity timestamp
    const currentTime = new Date(activity.timestamp || Date.now());
    
    // 1. Unusual hour detection
    const unusualHourAnomaly = await this.detectUnusualHour(
      address,
      currentTime,
      pattern.temporal
    );
    if (unusualHourAnomaly) anomalies.push(unusualHourAnomaly);
    
    // 2. Weekend/weekday pattern break
    const weekendAnomaly = await this.detectWeekendAnomaly(
      address,
      currentTime,
      pattern.temporal,
      recentTransfers
    );
    if (weekendAnomaly) anomalies.push(weekendAnomaly);
    
    // 3. Timezone shift detection
    const timezoneAnomaly = await this.detectTimezoneShift(
      address,
      recentTransfers,
      pattern.temporal
    );
    if (timezoneAnomaly) anomalies.push(timezoneAnomaly);
    
    // 4. Periodic pattern break
    const periodicAnomaly = await this.detectPeriodicBreak(
      address,
      currentTime,
      recentTransfers,
      pattern.temporal
    );
    if (periodicAnomaly) anomalies.push(periodicAnomaly);
    
    // 5. Holiday activity detection
    const holidayAnomaly = await this.detectHolidayActivity(
      address,
      currentTime,
      pattern.temporal
    );
    if (holidayAnomaly) anomalies.push(holidayAnomaly);
    
    // 6. Suspicious timing patterns
    const timingAnomaly = await this.detectSuspiciousTiming(
      address,
      recentTransfers,
      pattern
    );
    if (timingAnomaly) anomalies.push(timingAnomaly);
    
    // Return most significant anomaly
    if (anomalies.length > 0) {
      return anomalies.sort((a, b) => {
        const severityOrder = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      })[0];
    }
    
    return null;
  }
  
  /**
   * Detect activity at unusual hours
   */
  async detectUnusualHour(address, currentTime, temporalPattern) {
    const hour = currentTime.getUTCHours();
    const hourlyDistribution = temporalPattern.hourlyDistribution;
    
    // Calculate total activity
    const totalActivity = hourlyDistribution.reduce((sum, count) => sum + count, 0);
    if (totalActivity === 0) return null;
    
    // Get activity ratio for current hour
    const hourActivity = hourlyDistribution[hour];
    const hourRatio = hourActivity / totalActivity;
    
    // Check if this is an unusual hour
    if (hourRatio < this.config.unusualHourThreshold) {
      // Check if there are preferred hours
      const preferredHours = temporalPattern.preferredHours || [];
      const isPreferred = preferredHours.includes(hour);
      
      // Calculate how unusual this is
      const avgHourlyActivity = totalActivity / 24;
      const deviation = Math.abs(hourActivity - avgHourlyActivity) / avgHourlyActivity;
      
      if (!isPreferred && deviation > 2) {
        const severity = this.calculateUnusualHourSeverity(
          hourRatio,
          deviation,
          preferredHours.length
        );
        
        return this.formatAnomaly(
          'UNUSUAL_HOUR_ACTIVITY',
          severity,
          {
            hour: hour,
            hourActivity: hourActivity,
            hourRatio: hourRatio,
            totalActivity: totalActivity,
            preferredHours: preferredHours,
            deviation: deviation,
            historicalActivityAtHour: this.getHistoricalHourActivity(hour, temporalPattern),
            localTime: this.estimateLocalTime(hour, temporalPattern.timezone)
          },
          0.8,
          `Activity at unusual hour ${hour}:00 UTC (${(hourRatio * 100).toFixed(1)}% of historical activity)`
        );
      }
    }
    
    return null;
  }
  
  /**
   * Detect weekend vs weekday pattern anomalies
   */
  async detectWeekendAnomaly(address, currentTime, temporalPattern, recentTransfers) {
    const dayOfWeek = currentTime.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // Calculate weekend vs weekday activity ratios
    const weekdayActivity = temporalPattern.weeklyDistribution.slice(1, 6).reduce((a, b) => a + b, 0);
    const weekendActivity = temporalPattern.weeklyDistribution[0] + temporalPattern.weeklyDistribution[6];
    const totalWeekActivity = weekdayActivity + weekendActivity;
    
    if (totalWeekActivity === 0) return null;
    
    const weekendRatio = weekendActivity / totalWeekActivity;
    const expectedWeekendRatio = 2 / 7; // 2 days out of 7
    
    // Analyze recent activity pattern
    const recentWeekPattern = this.analyzeRecentWeekPattern(recentTransfers);
    
    // Check for anomalies
    if (isWeekend && weekendRatio < expectedWeekendRatio * 0.5) {
      // Unusual weekend activity for normally weekday-only account
      return this.formatAnomaly(
        'WEEKEND_PATTERN_BREAK',
        'MEDIUM',
        {
          dayOfWeek: dayOfWeek,
          dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
          isWeekend: true,
          historicalWeekendRatio: weekendRatio,
          expectedRatio: expectedWeekendRatio,
          recentPattern: recentWeekPattern,
          accountType: weekendRatio < 0.1 ? 'business_hours_only' : 'weekday_dominant'
        },
        0.75,
        `Weekend activity detected on ${weekendRatio < 0.05 ? 'strict business hours account' : 'weekday-dominant account'}`
      );
    }
    
    if (!isWeekend && weekendRatio > 0.5 && recentWeekPattern.weekendDominant) {
      // Weekday activity for weekend-dominant account
      return this.formatAnomaly(
        'WEEKDAY_PATTERN_BREAK',
        'LOW',
        {
          dayOfWeek: dayOfWeek,
          isWeekend: false,
          historicalWeekendRatio: weekendRatio,
          recentPattern: recentWeekPattern
        },
        0.65,
        'Weekday activity on weekend-dominant account'
      );
    }
    
    return null;
  }
  
  /**
   * Detect timezone shifts or inconsistencies
   */
  async detectTimezoneShift(address, recentTransfers, temporalPattern) {
    if (recentTransfers.length < 20) return null;
    
    // Infer timezone from recent activity
    const recentTimezone = this.inferTimezone(recentTransfers);
    const historicalTimezone = temporalPattern.timezone;
    
    if (!historicalTimezone || !recentTimezone) return null;
    
    // Check for timezone shift
    const timezoneShift = Math.abs(
      this.getTimezoneOffset(recentTimezone) - this.getTimezoneOffset(historicalTimezone)
    );
    
    if (timezoneShift >= 3) {
      // Significant timezone shift detected
      const shiftAnalysis = this.analyzeTimezoneShift(
        recentTransfers,
        historicalTimezone,
        recentTimezone
      );
      
      return this.formatAnomaly(
        'TIMEZONE_SHIFT',
        shiftAnalysis.severity,
        {
          previousTimezone: historicalTimezone,
          currentTimezone: recentTimezone,
          shiftHours: timezoneShift,
          pattern: shiftAnalysis.pattern,
          confidence: shiftAnalysis.confidence,
          possibleReasons: shiftAnalysis.reasons,
          activityConsistency: shiftAnalysis.consistency
        },
        shiftAnalysis.confidence,
        `Activity shifted ${timezoneShift} hours from ${historicalTimezone} to ${recentTimezone}`
      );
    }
    
    return null;
  }
  
  /**
   * Detect breaks in periodic patterns
   */
  async detectPeriodicBreak(address, currentTime, recentTransfers, temporalPattern) {
    // Detect periodicity in historical data
    const periodicity = this.detectPeriodicity(temporalPattern);
    
    if (!periodicity || periodicity.confidence < this.config.periodicityConfidence) {
      return null;
    }
    
    // Check if current activity aligns with periodic pattern
    const expectedActivity = this.getExpectedPeriodicActivity(
      currentTime,
      periodicity
    );
    
    if (!expectedActivity.expected) {
      // Activity outside expected periodic window
      return this.formatAnomaly(
        'PERIODIC_PATTERN_BREAK',
        'MEDIUM',
        {
          periodType: periodicity.type,
          periodHours: periodicity.periodHours,
          expectedNext: expectedActivity.nextExpected,
          lastActivity: expectedActivity.lastActivity,
          confidence: periodicity.confidence,
          pattern: periodicity.pattern,
          deviation: expectedActivity.deviation
        },
        periodicity.confidence * 0.9,
        `Activity breaks ${periodicity.type} pattern (expected every ${periodicity.periodHours} hours)`
      );
    }
    
    return null;
  }
  
  /**
   * Detect activity on holidays
   */
  async detectHolidayActivity(address, currentTime, temporalPattern) {
    const dateStr = `${String(currentTime.getUTCMonth() + 1).padStart(2, '0')}-${String(currentTime.getUTCDate()).padStart(2, '0')}`;
    
    if (this.config.knownHolidays.includes(dateStr)) {
      // Check historical holiday activity
      const holidayActivity = this.getHistoricalHolidayActivity(dateStr, temporalPattern);
      
      if (holidayActivity.ratio < this.config.holidayActivityThreshold) {
        return this.formatAnomaly(
          'HOLIDAY_ACTIVITY',
          'LOW',
          {
            holiday: dateStr,
            historicalHolidayActivity: holidayActivity.count,
            normalDayActivity: holidayActivity.avgDaily,
            activityRatio: holidayActivity.ratio,
            unusualForAccount: holidayActivity.ratio < 0.1
          },
          0.7,
          `Activity detected on holiday ${dateStr} (historically ${(holidayActivity.ratio * 100).toFixed(0)}% of normal)`
        );
      }
    }
    
    return null;
  }
  
  /**
   * Detect suspicious timing patterns
   */
  async detectSuspiciousTiming(address, recentTransfers, pattern) {
    // 1. Late night burst detection
    const lateNightBursts = this.detectLateNightBursts(recentTransfers);
    
    if (lateNightBursts.count > 0) {
      const severity = this.calculateBurstSeverity(
        lateNightBursts,
        pattern.temporal.hourlyDistribution
      );
      
      if (severity !== 'NONE') {
        return this.formatAnomaly(
          'LATE_NIGHT_BURST',
          severity,
          {
            burstCount: lateNightBursts.count,
            transactions: lateNightBursts.transactions,
            hours: lateNightBursts.hours,
            volume: lateNightBursts.totalVolume,
            pattern: lateNightBursts.pattern,
            unusualHours: this.config.suspiciousBurstHours
          },
          0.85,
          `${lateNightBursts.count} late night transaction bursts detected`
        );
      }
    }
    
    // 2. Coordinated timing detection
    const coordinatedTiming = this.detectCoordinatedTiming(recentTransfers);
    
    if (coordinatedTiming.detected) {
      return this.formatAnomaly(
        'COORDINATED_TIMING',
        'HIGH',
        {
          clusters: coordinatedTiming.clusters,
          maxClusterSize: coordinatedTiming.maxClusterSize,
          timeWindow: this.config.coordinatedTimingWindow,
          pattern: coordinatedTiming.pattern,
          addresses: coordinatedTiming.involvedAddresses
        },
        0.9,
        `Coordinated timing detected: ${coordinatedTiming.clusters} transaction clusters`
      );
    }
    
    return null;
  }
  
  /**
   * Helper methods for temporal analysis
   */
  inferTimezone(transfers) {
    if (transfers.length < 20) return null;
    
    // Create hourly activity profile
    const hourlyActivity = new Array(24).fill(0);
    transfers.forEach(tx => {
      const hour = new Date(tx.timestamp || tx.block_timestamp).getUTCHours();
      hourlyActivity[hour]++;
    });
    
    // Find peak activity hours
    let maxScore = 0;
    let bestTimezone = null;
    
    // Test each timezone
    for (const [tz, info] of Object.entries(this.timezones)) {
      const score = this.scoreTimezoneMatch(hourlyActivity, info.offset);
      if (score > maxScore) {
        maxScore = score;
        bestTimezone = tz;
      }
    }
    
    return maxScore > this.config.timezoneConsistencyThreshold ? bestTimezone : null;
  }
  
  scoreTimezoneMatch(hourlyActivity, offset) {
    // Shift activity to local time
    const localActivity = new Array(24).fill(0);
    for (let i = 0; i < 24; i++) {
      const localHour = (i - offset + 24) % 24;
      localActivity[localHour] = hourlyActivity[i];
    }
    
    // Score based on business hours activity (9-17 local)
    const businessHours = localActivity.slice(9, 18).reduce((a, b) => a + b, 0);
    const totalActivity = localActivity.reduce((a, b) => a + b, 0);
    
    if (totalActivity === 0) return 0;
    
    // Also consider low activity during sleep hours (0-6 local)
    const sleepHours = localActivity.slice(0, 6).reduce((a, b) => a + b, 0);
    const businessRatio = businessHours / totalActivity;
    const sleepRatio = sleepHours / totalActivity;
    
    // High business hours activity + low sleep hours activity = good match
    return businessRatio * 0.7 + (1 - sleepRatio) * 0.3;
  }
  
  getTimezoneOffset(timezone) {
    return this.timezones[timezone]?.offset || 0;
  }
  
  analyzeTimezoneShift(transfers, oldTz, newTz) {
    const analysis = {
      pattern: 'unknown',
      severity: 'MEDIUM',
      confidence: 0.7,
      reasons: [],
      consistency: 0
    };
    
    // Check if shift is gradual or sudden
    const midPoint = Math.floor(transfers.length / 2);
    const firstHalf = this.inferTimezone(transfers.slice(0, midPoint));
    const secondHalf = this.inferTimezone(transfers.slice(midPoint));
    
    if (firstHalf === oldTz && secondHalf === newTz) {
      analysis.pattern = 'sudden';
      analysis.severity = 'HIGH';
      analysis.reasons.push('Sudden timezone change detected');
    } else {
      analysis.pattern = 'gradual';
      analysis.reasons.push('Gradual timezone drift detected');
    }
    
    // Check consistency within new timezone
    const recentActivity = transfers.slice(-20);
    const consistentCount = recentActivity.filter(tx => {
      const hour = new Date(tx.timestamp || tx.block_timestamp).getUTCHours();
      const localHour = (hour - this.getTimezoneOffset(newTz) + 24) % 24;
      return localHour >= 6 && localHour <= 23; // Reasonable waking hours
    }).length;
    
    analysis.consistency = consistentCount / recentActivity.length;
    
    if (analysis.consistency < 0.5) {
      analysis.reasons.push('Inconsistent activity within new timezone');
      analysis.confidence = 0.5;
    }
    
    return analysis;
  }
  
  detectPeriodicity(temporalPattern) {
    const hourlyData = temporalPattern.hourlyDistribution;
    const dailyData = temporalPattern.weeklyDistribution;
    
    // Try different period lengths
    const periods = [
      { hours: 24, type: 'daily' },
      { hours: 168, type: 'weekly' },
      { hours: 12, type: 'twice_daily' },
      { hours: 48, type: 'every_other_day' }
    ];
    
    let bestPeriod = null;
    let bestScore = 0;
    
    for (const period of periods) {
      const score = this.calculatePeriodicityScore(hourlyData, period.hours);
      if (score > bestScore && score > this.config.periodicityConfidence) {
        bestScore = score;
        bestPeriod = {
          ...period,
          confidence: score,
          pattern: this.describePeriodicPattern(period.type)
        };
      }
    }
    
    return bestPeriod;
  }
  
  calculatePeriodicityScore(data, periodLength) {
    if (data.length < periodLength * this.config.minPeriodicCycles) {
      return 0;
    }
    
    // Simple autocorrelation
    let correlation = 0;
    let count = 0;
    
    for (let i = 0; i < data.length - periodLength; i++) {
      if (data[i] > 0 && data[i + periodLength] > 0) {
        correlation += Math.min(data[i], data[i + periodLength]) / 
                      Math.max(data[i], data[i + periodLength]);
        count++;
      }
    }
    
    return count > 0 ? correlation / count : 0;
  }
  
  getExpectedPeriodicActivity(currentTime, periodicity) {
    // Simplified - would need historical timestamps for accurate calculation
    const hoursSinceEpoch = Math.floor(currentTime.getTime() / (1000 * 60 * 60));
    const positionInCycle = hoursSinceEpoch % periodicity.periodHours;
    
    // Check if we're in expected active window (assuming 2-hour window)
    const expected = positionInCycle < 2;
    
    return {
      expected,
      nextExpected: new Date((hoursSinceEpoch + periodicity.periodHours - positionInCycle) * 60 * 60 * 1000),
      lastActivity: new Date((hoursSinceEpoch - positionInCycle) * 60 * 60 * 1000),
      deviation: positionInCycle
    };
  }
  
  detectLateNightBursts(transfers) {
    const bursts = {
      count: 0,
      transactions: [],
      hours: [],
      totalVolume: 0,
      pattern: 'none'
    };
    
    const lateNightTx = transfers.filter(tx => {
      const hour = new Date(tx.timestamp || tx.block_timestamp).getUTCHours();
      return this.config.suspiciousBurstHours.includes(hour);
    });
    
    if (lateNightTx.length === 0) return bursts;
    
    // Group by time windows
    const windows = {};
    lateNightTx.forEach(tx => {
      const time = new Date(tx.timestamp || tx.block_timestamp).getTime();
      const window = Math.floor(time / 3600000); // Hour window
      
      if (!windows[window]) {
        windows[window] = [];
      }
      windows[window].push(tx);
    });
    
    // Count bursts (3+ transactions in an hour)
    Object.values(windows).forEach(txs => {
      if (txs.length >= 3) {
        bursts.count++;
        bursts.transactions.push(...txs);
        const hour = new Date(txs[0].timestamp || txs[0].block_timestamp).getUTCHours();
        if (!bursts.hours.includes(hour)) {
          bursts.hours.push(hour);
        }
        bursts.totalVolume += txs.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
      }
    });
    
    // Determine pattern
    if (bursts.count > 5) bursts.pattern = 'frequent';
    else if (bursts.count > 2) bursts.pattern = 'occasional';
    else if (bursts.count > 0) bursts.pattern = 'rare';
    
    return bursts;
  }
  
  detectCoordinatedTiming(transfers) {
    const result = {
      detected: false,
      clusters: 0,
      maxClusterSize: 0,
      pattern: 'none',
      involvedAddresses: []
    };
    
    if (transfers.length < 10) return result;
    
    // Sort by timestamp
    const sorted = [...transfers].sort((a, b) => {
      const timeA = new Date(a.timestamp || a.block_timestamp).getTime();
      const timeB = new Date(b.timestamp || b.block_timestamp).getTime();
      return timeA - timeB;
    });
    
    // Find clusters of transactions within coordination window
    const clusters = [];
    let currentCluster = [sorted[0]];
    
    for (let i = 1; i < sorted.length; i++) {
      const timeDiff = new Date(sorted[i].timestamp || sorted[i].block_timestamp).getTime() -
                      new Date(sorted[i-1].timestamp || sorted[i-1].block_timestamp).getTime();
      
      if (timeDiff <= this.config.coordinatedTimingWindow) {
        currentCluster.push(sorted[i]);
      } else {
        if (currentCluster.length >= 3) {
          clusters.push(currentCluster);
        }
        currentCluster = [sorted[i]];
      }
    }
    
    if (currentCluster.length >= 3) {
      clusters.push(currentCluster);
    }
    
    if (clusters.length > 0) {
      result.detected = true;
      result.clusters = clusters.length;
      result.maxClusterSize = Math.max(...clusters.map(c => c.length));
      
      // Analyze pattern
      if (clusters.length > 5) result.pattern = 'systematic';
      else if (clusters.length > 2) result.pattern = 'repeated';
      else result.pattern = 'isolated';
      
      // Get involved addresses
      const addresses = new Set();
      clusters.forEach(cluster => {
        cluster.forEach(tx => {
          if (tx.from) addresses.add(tx.from);
          if (tx.to) addresses.add(tx.to);
        });
      });
      result.involvedAddresses = Array.from(addresses).slice(0, 10);
    }
    
    return result;
  }
  
  getHistoricalHourActivity(hour, temporalPattern) {
    const total = temporalPattern.hourlyDistribution.reduce((a, b) => a + b, 0);
    const hourCount = temporalPattern.hourlyDistribution[hour];
    
    return {
      count: hourCount,
      percentage: total > 0 ? (hourCount / total) * 100 : 0,
      rank: this.getHourRank(hour, temporalPattern.hourlyDistribution)
    };
  }
  
  getHourRank(hour, distribution) {
    const sorted = distribution
      .map((count, h) => ({ hour: h, count }))
      .sort((a, b) => b.count - a.count);
    
    return sorted.findIndex(item => item.hour === hour) + 1;
  }
  
  estimateLocalTime(utcHour, timezone) {
    if (!timezone) return null;
    
    const offset = this.getTimezoneOffset(timezone);
    const localHour = (utcHour + offset + 24) % 24;
    
    return {
      hour: localHour,
      period: localHour < 12 ? 'AM' : 'PM',
      displayHour: localHour === 0 ? 12 : localHour > 12 ? localHour - 12 : localHour,
      timezone: timezone
    };
  }
  
  analyzeRecentWeekPattern(transfers) {
    const weekCounts = new Array(7).fill(0);
    
    transfers.forEach(tx => {
      const day = new Date(tx.timestamp || tx.block_timestamp).getUTCDay();
      weekCounts[day]++;
    });
    
    const weekdayTotal = weekCounts.slice(1, 6).reduce((a, b) => a + b, 0);
    const weekendTotal = weekCounts[0] + weekCounts[6];
    
    return {
      weekdayTotal,
      weekendTotal,
      weekendDominant: weekendTotal > weekdayTotal,
      distribution: weekCounts
    };
  }
  
  getHistoricalHolidayActivity(holiday, temporalPattern) {
    // Simplified - would need historical holiday data
    const avgDaily = temporalPattern.weeklyDistribution.reduce((a, b) => a + b, 0) / 7;
    const holidayActivity = avgDaily * 0.1; // Assume 10% activity on holidays
    
    return {
      count: Math.floor(holidayActivity),
      avgDaily: avgDaily,
      ratio: 0.1
    };
  }
  
  calculateUnusualHourSeverity(hourRatio, deviation, preferredHoursCount) {
    if (hourRatio < 0.01 && deviation > 5) return 'HIGH';
    if (hourRatio < 0.02 && deviation > 3) return 'MEDIUM';
    if (preferredHoursCount > 0 && hourRatio < 0.05) return 'MEDIUM';
    return 'LOW';
  }
  
  calculateBurstSeverity(bursts, hourlyDistribution) {
    // Check if late night activity is normal for this account
    const lateNightNormal = this.config.suspiciousBurstHours
      .map(h => hourlyDistribution[h])
      .reduce((a, b) => a + b, 0);
    
    const totalActivity = hourlyDistribution.reduce((a, b) => a + b, 0);
    const lateNightRatio = totalActivity > 0 ? lateNightNormal / totalActivity : 0;
    
    if (lateNightRatio > 0.3) return 'NONE'; // Normal for this account
    
    if (bursts.count > 5 && lateNightRatio < 0.05) return 'HIGH';
    if (bursts.count > 2 && lateNightRatio < 0.1) return 'MEDIUM';
    if (bursts.count > 0 && lateNightRatio < 0.15) return 'LOW';
    
    return 'NONE';
  }
  
  describePeriodicPattern(type) {
    const descriptions = {
      'daily': 'Activity occurs at same time each day',
      'weekly': 'Activity follows weekly schedule',
      'twice_daily': 'Activity occurs twice per day at regular intervals',
      'every_other_day': 'Activity alternates between days'
    };
    
    return descriptions[type] || 'Unknown periodic pattern';
  }
}