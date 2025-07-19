import { BaseAnomalyDetector } from '../BaseAnomalyDetector.js';

/**
 * BehavioralAnomalyDetector - Detects changes in account behavior patterns
 * Focuses on: dormant activation, role changes, activity pattern shifts
 */
export class BehavioralAnomalyDetector extends BaseAnomalyDetector {
  constructor(config = {}) {
    super(config);
    
    this.config = {
      ...this.config,
      dormantThresholdDays: config.dormantThresholdDays || 30,
      extremeDormantDays: config.extremeDormantDays || 180,
      roleChangeThreshold: config.roleChangeThreshold || 0.7, // 70% behavior change
      activityLevelWindow: config.activityLevelWindow || 7 * 24 * 60 * 60 * 1000, // 7 days
      patternSimilarityThreshold: config.patternSimilarityThreshold || 0.3,
      minimumRoleDataPoints: config.minimumRoleDataPoints || 50
    };
    
    // Account role definitions
    this.roleDefinitions = {
      holder: {
        avgTxPerDay: { min: 0, max: 0.1 },
        avgAmount: { min: 10000, max: Infinity },
        uniqueAddresses: { min: 0, max: 5 },
        timeDistribution: 'uniform'
      },
      trader: {
        avgTxPerDay: { min: 1, max: 20 },
        avgAmount: { min: 100, max: 50000 },
        uniqueAddresses: { min: 5, max: 50 },
        timeDistribution: 'business_hours'
      },
      validator: {
        avgTxPerDay: { min: 0.5, max: 5 },
        avgAmount: { min: 0.1, max: 1000 },
        uniqueAddresses: { min: 10, max: 100 },
        timeDistribution: 'regular'
      },
      exchange: {
        avgTxPerDay: { min: 50, max: Infinity },
        avgAmount: { min: 10, max: 100000 },
        uniqueAddresses: { min: 100, max: Infinity },
        timeDistribution: '24/7'
      }
    };
  }
  
  /**
   * Main detection method
   */
  async detect(address, activity, context) {
    const { pattern, recentTransfers } = context;
    
    if (!pattern) {
      return null;
    }
    
    const anomalies = [];
    
    // 1. Dormant account activation
    const dormantAnomaly = await this.detectDormantActivation(
      address,
      activity,
      pattern.behavioral
    );
    if (dormantAnomaly) anomalies.push(dormantAnomaly);
    
    // 2. Role change detection
    if (pattern.dataPoints >= this.config.minimumRoleDataPoints) {
      const roleAnomaly = await this.detectRoleChange(
        address,
        recentTransfers,
        pattern
      );
      if (roleAnomaly) anomalies.push(roleAnomaly);
    }
    
    // 3. Activity level change
    const activityAnomaly = await this.detectActivityLevelChange(
      address,
      recentTransfers,
      pattern.behavioral
    );
    if (activityAnomaly) anomalies.push(activityAnomaly);
    
    // 4. Pattern break detection
    const patternBreak = await this.detectPatternBreak(
      address,
      activity,
      pattern
    );
    if (patternBreak) anomalies.push(patternBreak);
    
    // Return highest severity anomaly
    if (anomalies.length > 0) {
      return anomalies.sort((a, b) => {
        const severityOrder = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      })[0];
    }
    
    return null;
  }
  
  /**
   * Detect dormant account suddenly becoming active
   */
  async detectDormantActivation(address, activity, behavioralPattern) {
    if (!behavioralPattern.lastActivity) {
      // First activity, not an anomaly
      return null;
    }
    
    const lastActivityTime = new Date(behavioralPattern.lastActivity).getTime();
    const currentTime = Date.now();
    const dormantPeriodMs = currentTime - lastActivityTime;
    const dormantDays = Math.floor(dormantPeriodMs / (24 * 60 * 60 * 1000));
    
    if (dormantDays >= this.config.dormantThresholdDays) {
      // Calculate severity based on dormancy length and amount moved
      const severity = this.calculateDormantSeverity(dormantDays, activity.amount);
      
      // Higher confidence for longer dormancy
      const confidence = Math.min(0.99, 0.8 + (dormantDays / 365) * 0.19);
      
      // Check if this matches historical dormant periods
      const isUnusual = this.isDormancyUnusual(dormantDays, behavioralPattern.dormantPeriods);
      
      return this.formatAnomaly(
        'DORMANT_AWAKENING',
        severity,
        {
          dormantDays: dormantDays,
          lastActivityDate: new Date(lastActivityTime).toISOString(),
          amountMoved: activity.amount,
          previousRole: behavioralPattern.role,
          previousActivityLevel: behavioralPattern.activityLevel,
          historicalDormantPeriods: behavioralPattern.dormantPeriods.length,
          isUnusualDormancy: isUnusual,
          accountAge: this.calculateAccountAge(behavioralPattern)
        },
        confidence,
        `Whale active after ${dormantDays} days of dormancy${activity.amount ? `, moving ${this.formatAmount(activity.amount)}` : ''}`
      );
    }
    
    return null;
  }
  
  /**
   * Detect changes in account role/behavior type
   */
  async detectRoleChange(address, recentTransfers, pattern) {
    // Calculate current behavior metrics
    const currentMetrics = this.calculateBehaviorMetrics(recentTransfers);
    const historicalRole = pattern.behavioral.role;
    const currentRole = this.classifyRole(currentMetrics);
    
    if (historicalRole === 'unknown' || currentRole === 'unknown') {
      // Not enough data to determine role change
      return null;
    }
    
    if (historicalRole !== currentRole) {
      // Calculate similarity between roles
      const similarity = this.calculateRoleSimilarity(historicalRole, currentRole, currentMetrics);
      
      if (similarity < this.config.roleChangeThreshold) {
        // Significant role change detected
        const severity = this.calculateRoleChangeSeverity(historicalRole, currentRole);
        
        return this.formatAnomaly(
          'ROLE_CHANGE',
          severity,
          {
            previousRole: historicalRole,
            currentRole: currentRole,
            similarity: similarity,
            behaviorMetrics: currentMetrics,
            indicators: this.getRoleChangeIndicators(historicalRole, currentRole, currentMetrics),
            transitionPeriod: this.detectTransitionPeriod(pattern),
            confidence: this.calculateRoleChangeConfidence(pattern, currentMetrics)
          },
          0.85,
          `Account behavior shifted from ${historicalRole} to ${currentRole} pattern`
        );
      }
    }
    
    return null;
  }
  
  /**
   * Detect significant changes in activity level
   */
  async detectActivityLevelChange(address, recentTransfers, behavioralPattern) {
    // Calculate current activity level
    const currentLevel = this.calculateActivityLevel(recentTransfers);
    const historicalLevel = behavioralPattern.activityLevel;
    
    if (historicalLevel === 'unknown' || currentLevel === historicalLevel) {
      return null;
    }
    
    // Check if change is significant
    const levelOrder = { 'dormant': 0, 'low': 1, 'medium': 2, 'high': 3 };
    const levelChange = Math.abs(levelOrder[currentLevel] - levelOrder[historicalLevel]);
    
    if (levelChange >= 2) {
      // Significant activity level change (e.g., dormant to high)
      const direction = levelOrder[currentLevel] > levelOrder[historicalLevel] ? 'increased' : 'decreased';
      
      return this.formatAnomaly(
        'ACTIVITY_LEVEL_CHANGE',
        levelChange >= 3 ? 'HIGH' : 'MEDIUM',
        {
          previousLevel: historicalLevel,
          currentLevel: currentLevel,
          direction: direction,
          recentTransactionCount: recentTransfers.length,
          avgTransactionsPerDay: behavioralPattern.transactionCount.daily,
          timeWindow: '7_days',
          triggers: this.identifyActivityTriggers(recentTransfers)
        },
        0.8,
        `Activity level ${direction} from ${historicalLevel} to ${currentLevel}`
      );
    }
    
    return null;
  }
  
  /**
   * Detect breaks in established patterns
   */
  async detectPatternBreak(address, activity, pattern) {
    // Check various pattern dimensions
    const breaks = [];
    
    // 1. Time pattern break
    if (pattern.temporal.preferredHours.length > 0) {
      const currentHour = new Date(activity.timestamp || Date.now()).getUTCHours();
      if (!pattern.temporal.preferredHours.includes(currentHour)) {
        const hourlyActivity = pattern.temporal.hourlyDistribution[currentHour];
        const avgHourlyActivity = this.average(pattern.temporal.hourlyDistribution);
        
        if (hourlyActivity < avgHourlyActivity * 0.1) {
          breaks.push({
            type: 'temporal',
            description: `Activity at unusual hour ${currentHour}:00 UTC`,
            severity: 0.3
          });
        }
      }
    }
    
    // 2. Counterparty pattern break
    if (activity.counterparty && pattern.network.coreNetwork.length > 0) {
      if (!pattern.network.coreNetwork.includes(activity.counterparty)) {
        const isNewConnection = !pattern.network.recentConnections.includes(activity.counterparty);
        if (isNewConnection && pattern.network.totalUniqueAddresses > 10) {
          breaks.push({
            type: 'network',
            description: 'Interaction with new address outside core network',
            severity: 0.4
          });
        }
      }
    }
    
    // 3. Amount pattern break
    if (activity.amount && pattern.statistical.transferAmounts.mean > 0) {
      const amountRatio = activity.amount / pattern.statistical.transferAmounts.mean;
      if (amountRatio > 10 || amountRatio < 0.1) {
        breaks.push({
          type: 'amount',
          description: `Amount ${amountRatio > 10 ? 'much larger' : 'much smaller'} than typical`,
          severity: 0.5
        });
      }
    }
    
    // Combine pattern breaks
    if (breaks.length >= 2) {
      const totalSeverity = breaks.reduce((sum, b) => sum + b.severity, 0);
      
      return this.formatAnomaly(
        'PATTERN_BREAK',
        totalSeverity >= 1 ? 'HIGH' : 'MEDIUM',
        {
          breaksDetected: breaks.length,
          patterns: breaks,
          historicalConsistency: this.calculatePatternConsistency(pattern),
          accountMaturity: pattern.dataPoints
        },
        Math.min(0.9, 0.6 + totalSeverity * 0.2),
        `Multiple pattern breaks detected: ${breaks.map(b => b.type).join(', ')}`
      );
    }
    
    return null;
  }
  
  /**
   * Helper methods for behavior analysis
   */
  calculateBehaviorMetrics(transfers) {
    if (!transfers || transfers.length === 0) {
      return {
        avgTxPerDay: 0,
        avgAmount: 0,
        uniqueAddresses: 0,
        timeDistribution: 'unknown',
        totalVolume: 0
      };
    }
    
    // Time range
    const timeRange = this.getTimeRange(transfers);
    const days = Math.max(1, timeRange / (24 * 60 * 60 * 1000));
    
    // Transaction metrics
    const avgTxPerDay = transfers.length / days;
    const amounts = transfers.map(tx => parseFloat(tx.amount || 0));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const totalVolume = amounts.reduce((a, b) => a + b, 0);
    
    // Unique addresses
    const addresses = new Set();
    transfers.forEach(tx => {
      if (tx.from) addresses.add(tx.from);
      if (tx.to) addresses.add(tx.to);
    });
    const uniqueAddresses = addresses.size;
    
    // Time distribution
    const timeDistribution = this.analyzeTimeDistribution(transfers);
    
    return {
      avgTxPerDay,
      avgAmount,
      uniqueAddresses,
      timeDistribution,
      totalVolume,
      days
    };
  }
  
  classifyRole(metrics) {
    let bestMatch = 'unknown';
    let bestScore = 0;
    
    for (const [role, definition] of Object.entries(this.roleDefinitions)) {
      let score = 0;
      let checks = 0;
      
      // Check transaction frequency
      if (metrics.avgTxPerDay >= definition.avgTxPerDay.min &&
          metrics.avgTxPerDay <= definition.avgTxPerDay.max) {
        score += 1;
      }
      checks += 1;
      
      // Check average amount
      if (metrics.avgAmount >= definition.avgAmount.min &&
          metrics.avgAmount <= definition.avgAmount.max) {
        score += 1;
      }
      checks += 1;
      
      // Check unique addresses
      if (metrics.uniqueAddresses >= definition.uniqueAddresses.min &&
          metrics.uniqueAddresses <= definition.uniqueAddresses.max) {
        score += 1;
      }
      checks += 1;
      
      // Check time distribution
      if (this.matchesTimeDistribution(metrics.timeDistribution, definition.timeDistribution)) {
        score += 0.5;
      }
      checks += 0.5;
      
      const matchScore = score / checks;
      if (matchScore > bestScore) {
        bestScore = matchScore;
        bestMatch = role;
      }
    }
    
    // Require at least 60% match
    return bestScore >= 0.6 ? bestMatch : 'unknown';
  }
  
  calculateActivityLevel(transfers) {
    const count = transfers.length;
    const timeRange = this.getTimeRange(transfers);
    const days = Math.max(1, timeRange / (24 * 60 * 60 * 1000));
    const txPerDay = count / days;
    
    if (txPerDay === 0) return 'dormant';
    if (txPerDay < 0.5) return 'low';
    if (txPerDay < 5) return 'medium';
    return 'high';
  }
  
  calculateDormantSeverity(dormantDays, amount) {
    // Longer dormancy = higher severity
    let severity = 'LOW';
    
    if (dormantDays >= this.config.extremeDormantDays) {
      severity = 'CRITICAL';
    } else if (dormantDays >= 90) {
      severity = 'HIGH';
    } else if (dormantDays >= 60) {
      severity = 'MEDIUM';
    }
    
    // Large amount increases severity
    if (amount && amount > 100000) {
      // Upgrade severity for large amounts
      if (severity === 'LOW') severity = 'MEDIUM';
      else if (severity === 'MEDIUM') severity = 'HIGH';
      else if (severity === 'HIGH') severity = 'CRITICAL';
    }
    
    return severity;
  }
  
  calculateRoleSimilarity(oldRole, newRole, metrics) {
    // Predefined role transition similarities
    const transitions = {
      'holder-trader': 0.6,
      'trader-holder': 0.6,
      'holder-exchange': 0.2,
      'exchange-holder': 0.2,
      'trader-exchange': 0.4,
      'exchange-trader': 0.4,
      'validator-holder': 0.7,
      'holder-validator': 0.7,
      'validator-trader': 0.3,
      'trader-validator': 0.3,
      'validator-exchange': 0.1,
      'exchange-validator': 0.1
    };
    
    const key = `${oldRole}-${newRole}`;
    return transitions[key] || 0.5;
  }
  
  calculateRoleChangeSeverity(oldRole, newRole) {
    // Some role changes are more concerning than others
    const concerningChanges = [
      'holder-exchange',
      'validator-exchange',
      'holder-trader' // Especially if sudden
    ];
    
    const change = `${oldRole}-${newRole}`;
    
    if (concerningChanges.includes(change)) {
      return 'HIGH';
    }
    
    return 'MEDIUM';
  }
  
  getRoleChangeIndicators(oldRole, newRole, metrics) {
    const indicators = [];
    
    if (metrics.avgTxPerDay > 10 && oldRole === 'holder') {
      indicators.push('Significant increase in transaction frequency');
    }
    
    if (metrics.uniqueAddresses > 50 && oldRole !== 'exchange') {
      indicators.push('Interacting with many new addresses');
    }
    
    if (metrics.avgAmount < 100 && oldRole === 'holder') {
      indicators.push('Small transaction amounts unlike typical holder behavior');
    }
    
    if (metrics.timeDistribution === '24/7' && oldRole !== 'exchange') {
      indicators.push('Round-the-clock activity pattern');
    }
    
    return indicators;
  }
  
  isDormancyUnusual(currentDormantDays, historicalPeriods) {
    if (historicalPeriods.length === 0) {
      return currentDormantDays > 60; // First long dormancy
    }
    
    const avgDormancy = historicalPeriods.reduce((sum, p) => sum + p.days, 0) / historicalPeriods.length;
    return currentDormantDays > avgDormancy * 2;
  }
  
  calculateAccountAge(behavioralPattern) {
    // Estimate based on data points and activity
    const estimatedDays = behavioralPattern.dataPoints * 
      (behavioralPattern.avgTimeBetweenTransactions || 1);
    return Math.floor(estimatedDays);
  }
  
  analyzeTimeDistribution(transfers) {
    const hours = transfers.map(tx => 
      new Date(tx.timestamp || tx.block_timestamp).getUTCHours()
    );
    
    const hourCounts = new Array(24).fill(0);
    hours.forEach(h => hourCounts[h]++);
    
    // Analyze distribution
    const businessHours = hourCounts.slice(9, 17).reduce((a, b) => a + b, 0);
    const totalActivity = hours.length;
    
    if (totalActivity === 0) return 'unknown';
    
    const businessRatio = businessHours / totalActivity;
    
    if (businessRatio > 0.7) return 'business_hours';
    if (businessRatio < 0.3) return 'off_hours';
    
    // Check for regular patterns
    const variance = this.calculateVariance(hourCounts);
    if (variance < 2) return 'regular';
    
    // Check for 24/7 activity
    const activeHours = hourCounts.filter(c => c > 0).length;
    if (activeHours >= 20) return '24/7';
    
    return 'uniform';
  }
  
  matchesTimeDistribution(observed, expected) {
    if (observed === expected) return true;
    
    // Some distributions are compatible
    const compatible = {
      'uniform': ['regular', '24/7'],
      'regular': ['uniform'],
      'business_hours': ['uniform'],
      '24/7': ['uniform', 'off_hours']
    };
    
    return (compatible[observed] || []).includes(expected);
  }
  
  identifyActivityTriggers(transfers) {
    const triggers = [];
    
    if (transfers.length > 0) {
      // Check for large transfers
      const amounts = transfers.map(tx => parseFloat(tx.amount || 0));
      const maxAmount = Math.max(...amounts);
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      
      if (maxAmount > avgAmount * 10) {
        triggers.push('large_transfer');
      }
      
      // Check for new addresses
      const addresses = new Set();
      transfers.forEach(tx => {
        if (tx.from) addresses.add(tx.from);
        if (tx.to) addresses.add(tx.to);
      });
      
      if (addresses.size > transfers.length * 1.5) {
        triggers.push('multiple_addresses');
      }
    }
    
    return triggers;
  }
  
  detectTransitionPeriod(pattern) {
    // Look for gradual vs sudden changes
    if (pattern.anomalyHistory.length > 0) {
      const recentAnomalies = pattern.anomalyHistory.slice(-10);
      const types = recentAnomalies.map(a => a.type);
      
      if (types.filter(t => t === 'ROLE_CHANGE').length > 1) {
        return 'gradual';
      }
    }
    
    return 'sudden';
  }
  
  calculateRoleChangeConfidence(pattern, currentMetrics) {
    // Higher confidence with more data
    const dataQuality = Math.min(1, pattern.dataPoints / 200);
    const metricReliability = currentMetrics.days >= 7 ? 1 : currentMetrics.days / 7;
    
    return 0.7 + (dataQuality * 0.15) + (metricReliability * 0.15);
  }
  
  calculatePatternConsistency(pattern) {
    // Measure how consistent the account has been historically
    if (pattern.anomalyHistory.length === 0) {
      return 1.0; // No anomalies = perfect consistency
    }
    
    const totalDays = pattern.dataPoints;
    const anomalyDays = pattern.anomalyHistory.length;
    
    return Math.max(0, 1 - (anomalyDays / totalDays));
  }
  
  getTimeRange(transfers) {
    if (transfers.length === 0) return 0;
    
    const timestamps = transfers.map(tx => 
      new Date(tx.timestamp || tx.block_timestamp).getTime()
    );
    
    return Math.max(...timestamps) - Math.min(...timestamps);
  }
  
  average(values) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  
  calculateVariance(values) {
    const avg = this.average(values);
    const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
    return this.average(squaredDiffs);
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