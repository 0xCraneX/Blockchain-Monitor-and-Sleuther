/**
 * Unit Tests for Anomaly Detection Algorithms
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Mock anomaly detection functions
class AnomalyDetector {
  constructor() {
    this.thresholds = {
      dormantDays: 180,
      sizeMultiplier: 10,
      timeDeviation: 4, // hours
      exchangeImbalance: 0.3,
      validatorCluster: 3
    };
  }

  /**
   * Detect dormant whale awakening
   */
  detectDormantWhale(lastActivity, currentActivity) {
    const dormantDays = (currentActivity - lastActivity) / (1000 * 60 * 60 * 24);
    
    if (dormantDays >= this.thresholds.dormantDays) {
      return {
        detected: true,
        type: 'DORMANT_WHALE_ACTIVATION',
        severity: dormantDays > 365 ? 'CRITICAL' : 'HIGH',
        dormantDays: Math.floor(dormantDays),
        confidence: Math.min(0.99, 0.5 + (dormantDays / 1000))
      };
    }
    
    return { detected: false };
  }

  /**
   * Detect behavioral anomalies
   */
  detectBehavioralAnomaly(historicalPattern, currentTransaction) {
    const { avgSize, avgHour, consistency } = historicalPattern;
    const { amount, timestamp } = currentTransaction;
    
    const sizeMultiple = amount / avgSize;
    const currentHour = new Date(timestamp).getUTCHours();
    const timeDeviation = Math.abs(currentHour - avgHour);
    
    const anomalies = [];
    
    if (sizeMultiple >= this.thresholds.sizeMultiplier) {
      anomalies.push('SIZE_ANOMALY');
    }
    
    if (timeDeviation >= this.thresholds.timeDeviation) {
      anomalies.push('TIME_ANOMALY');
    }
    
    if (amount % 100000 === 0 && amount > avgSize * 5) {
      anomalies.push('ROUND_NUMBER');
    }
    
    if (anomalies.length > 0) {
      return {
        detected: true,
        type: 'BEHAVIORAL_ANOMALY',
        severity: anomalies.length >= 3 ? 'HIGH' : 'MEDIUM',
        anomalies,
        sizeMultiple,
        timeDeviation,
        confidence: consistency > 90 ? 0.95 : 0.80
      };
    }
    
    return { detected: false };
  }

  /**
   * Detect exchange imbalance
   */
  detectExchangeImbalance(withdrawals, deposits, normalVolume) {
    const totalWithdrawals = withdrawals.reduce((sum, w) => sum + w.amount, 0);
    const totalDeposits = deposits.reduce((sum, d) => sum + d.amount, 0);
    const netOutflow = totalWithdrawals - totalDeposits;
    const imbalanceRatio = netOutflow / normalVolume;
    
    if (Math.abs(imbalanceRatio) >= this.thresholds.exchangeImbalance) {
      const isOutflow = imbalanceRatio > 0;
      return {
        detected: true,
        type: 'EXCHANGE_IMBALANCE',
        severity: Math.abs(imbalanceRatio) > 0.5 ? 'CRITICAL' : 'HIGH',
        direction: isOutflow ? 'OUTFLOW' : 'INFLOW',
        netAmount: Math.abs(netOutflow),
        imbalanceRatio: Math.abs(imbalanceRatio),
        withdrawalCount: withdrawals.length,
        depositCount: deposits.length
      };
    }
    
    return { detected: false };
  }

  /**
   * Detect coordinated movements
   */
  detectCoordinatedMovement(transactions) {
    const addressGroups = {};
    
    // Group by time windows (2 hours)
    transactions.forEach(tx => {
      const timeWindow = Math.floor(tx.timestamp / (2 * 60 * 60 * 1000));
      if (!addressGroups[timeWindow]) {
        addressGroups[timeWindow] = [];
      }
      addressGroups[timeWindow].push(tx);
    });
    
    // Find coordinated patterns
    for (const [window, txs] of Object.entries(addressGroups)) {
      if (txs.length >= this.thresholds.validatorCluster) {
        // Check if they share common characteristics
        const destinations = new Set(txs.map(tx => tx.to));
        const avgAmount = txs.reduce((sum, tx) => sum + tx.amount, 0) / txs.length;
        
        if (destinations.size === 1 || destinations.size < txs.length / 2) {
          return {
            detected: true,
            type: 'COORDINATED_MOVEMENT',
            severity: 'CRITICAL',
            participants: txs.length,
            commonDestination: destinations.size === 1,
            timeWindow: parseInt(window),
            totalVolume: txs.reduce((sum, tx) => sum + tx.amount, 0),
            confidence: 0.85 + (txs.length - 3) * 0.05
          };
        }
      }
    }
    
    return { detected: false };
  }

  /**
   * Calculate risk score for an address
   */
  calculateRiskScore(address, activity) {
    let score = 50; // Base score
    
    // Balance impact
    if (address.balance > 1000000) score += 20;
    if (address.balance > 5000000) score += 15;
    
    // Activity patterns
    if (activity.dormantDays > 180) score += 15;
    if (activity.dormantDays > 365) score += 10;
    
    // Transaction characteristics
    if (activity.largeTransactions > 5) score += 10;
    if (activity.roundNumbers > 3) score += 5;
    
    // Network position
    if (address.isValidator) score += 10;
    if (address.isExchange) score += 15;
    
    return Math.min(100, score);
  }
}

describe('Anomaly Detection Tests', () => {
  let detector;
  
  beforeEach(() => {
    detector = new AnomalyDetector();
  });
  
  describe('Dormant Whale Detection', () => {
    it('should detect whale awakening after 180+ days', () => {
      const lastActivity = Date.now() - (200 * 24 * 60 * 60 * 1000); // 200 days ago
      const currentActivity = Date.now();
      
      const result = detector.detectDormantWhale(lastActivity, currentActivity);
      
      expect(result.detected).toBe(true);
      expect(result.type).toBe('DORMANT_WHALE_ACTIVATION');
      expect(result.severity).toBe('HIGH');
      expect(result.dormantDays).toBe(200);
    });
    
    it('should mark as CRITICAL for 365+ days dormancy', () => {
      const lastActivity = Date.now() - (400 * 24 * 60 * 60 * 1000);
      const currentActivity = Date.now();
      
      const result = detector.detectDormantWhale(lastActivity, currentActivity);
      
      expect(result.severity).toBe('CRITICAL');
    });
    
    it('should not detect for recent activity', () => {
      const lastActivity = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const currentActivity = Date.now();
      
      const result = detector.detectDormantWhale(lastActivity, currentActivity);
      
      expect(result.detected).toBe(false);
    });
  });
  
  describe('Behavioral Anomaly Detection', () => {
    it('should detect size anomaly', () => {
      const historicalPattern = {
        avgSize: 50000,
        avgHour: 22,
        consistency: 95
      };
      
      const currentTransaction = {
        amount: 600000, // 12x normal
        timestamp: new Date().setUTCHours(22, 0, 0, 0)
      };
      
      const result = detector.detectBehavioralAnomaly(historicalPattern, currentTransaction);
      
      expect(result.detected).toBe(true);
      expect(result.anomalies).toContain('SIZE_ANOMALY');
      expect(result.sizeMultiple).toBe(12);
    });
    
    it('should detect time anomaly', () => {
      const historicalPattern = {
        avgSize: 50000,
        avgHour: 22,
        consistency: 95
      };
      
      const currentTransaction = {
        amount: 50000,
        timestamp: new Date().setUTCHours(10, 0, 0, 0) // 12 hours early
      };
      
      const result = detector.detectBehavioralAnomaly(historicalPattern, currentTransaction);
      
      expect(result.detected).toBe(true);
      expect(result.anomalies).toContain('TIME_ANOMALY');
      expect(result.timeDeviation).toBe(12);
    });
    
    it('should detect multiple anomalies', () => {
      const historicalPattern = {
        avgSize: 50000,
        avgHour: 22,
        consistency: 95
      };
      
      const currentTransaction = {
        amount: 1000000, // 20x normal, round number
        timestamp: new Date().setUTCHours(10, 0, 0, 0)
      };
      
      const result = detector.detectBehavioralAnomaly(historicalPattern, currentTransaction);
      
      expect(result.detected).toBe(true);
      expect(result.anomalies).toContain('SIZE_ANOMALY');
      expect(result.anomalies).toContain('TIME_ANOMALY');
      expect(result.anomalies).toContain('ROUND_NUMBER');
      expect(result.severity).toBe('HIGH');
    });
  });
  
  describe('Exchange Imbalance Detection', () => {
    it('should detect significant outflow', () => {
      const withdrawals = [
        { amount: 1000000 },
        { amount: 1500000 },
        { amount: 2000000 }
      ];
      
      const deposits = [
        { amount: 500000 },
        { amount: 300000 }
      ];
      
      const normalVolume = 5000000;
      
      const result = detector.detectExchangeImbalance(withdrawals, deposits, normalVolume);
      
      expect(result.detected).toBe(true);
      expect(result.type).toBe('EXCHANGE_IMBALANCE');
      expect(result.direction).toBe('OUTFLOW');
      expect(result.netAmount).toBe(3700000);
      expect(result.severity).toBe('CRITICAL');
    });
    
    it('should not detect for balanced flow', () => {
      const withdrawals = [
        { amount: 1000000 },
        { amount: 1000000 }
      ];
      
      const deposits = [
        { amount: 900000 },
        { amount: 950000 }
      ];
      
      const normalVolume = 5000000;
      
      const result = detector.detectExchangeImbalance(withdrawals, deposits, normalVolume);
      
      expect(result.detected).toBe(false);
    });
  });
  
  describe('Coordinated Movement Detection', () => {
    it('should detect multiple whales moving together', () => {
      const baseTime = Date.now();
      const transactions = [
        { from: 'whale1', to: 'target', amount: 1000000, timestamp: baseTime },
        { from: 'whale2', to: 'target', amount: 1500000, timestamp: baseTime + 30 * 60 * 1000 },
        { from: 'whale3', to: 'target', amount: 2000000, timestamp: baseTime + 60 * 60 * 1000 }
      ];
      
      const result = detector.detectCoordinatedMovement(transactions);
      
      expect(result.detected).toBe(true);
      expect(result.type).toBe('COORDINATED_MOVEMENT');
      expect(result.participants).toBe(3);
      expect(result.commonDestination).toBe(true);
      expect(result.totalVolume).toBe(4500000);
    });
    
    it('should not detect for unrelated transactions', () => {
      const baseTime = Date.now();
      const transactions = [
        { from: 'addr1', to: 'target1', amount: 100000, timestamp: baseTime },
        { from: 'addr2', to: 'target2', amount: 200000, timestamp: baseTime + 4 * 60 * 60 * 1000 }, // 4 hours later
        { from: 'addr3', to: 'target3', amount: 300000, timestamp: baseTime + 8 * 60 * 60 * 1000 }  // 8 hours later
      ];
      
      const result = detector.detectCoordinatedMovement(transactions);
      
      expect(result.detected).toBe(false);
    });
  });
  
  describe('Risk Score Calculation', () => {
    it('should calculate high risk for large dormant whale', () => {
      const address = {
        balance: 10000000,
        isValidator: false,
        isExchange: false
      };
      
      const activity = {
        dormantDays: 400,
        largeTransactions: 8,
        roundNumbers: 5
      };
      
      const score = detector.calculateRiskScore(address, activity);
      
      expect(score).toBeGreaterThan(90);
    });
    
    it('should calculate moderate risk for active small account', () => {
      const address = {
        balance: 50000,
        isValidator: false,
        isExchange: false
      };
      
      const activity = {
        dormantDays: 30,
        largeTransactions: 1,
        roundNumbers: 0
      };
      
      const score = detector.calculateRiskScore(address, activity);
      
      expect(score).toBeLessThan(60);
    });
    
    it('should add risk for validators and exchanges', () => {
      const validatorAddress = {
        balance: 1000000,
        isValidator: true,
        isExchange: false
      };
      
      const exchangeAddress = {
        balance: 1000000,
        isValidator: false,
        isExchange: true
      };
      
      const activity = {
        dormantDays: 0,
        largeTransactions: 0,
        roundNumbers: 0
      };
      
      const validatorScore = detector.calculateRiskScore(validatorAddress, activity);
      const exchangeScore = detector.calculateRiskScore(exchangeAddress, activity);
      
      expect(validatorScore).toBeGreaterThan(70);
      expect(exchangeScore).toBeGreaterThan(75);
    });
  });
});