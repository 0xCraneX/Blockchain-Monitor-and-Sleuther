#!/usr/bin/env node

/**
 * Test Data Generator for Blockchain Monitoring Tool
 * Generates realistic test data for demos and testing
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Realistic Polkadot addresses (format validated)
const WHALE_ADDRESSES = [
  '15Q7LRbAKrVExHs9xtrhDKuNmPApo4iBQdJp3k11YMDjTF2f',
  '16ZL8yLyXv3V3L3z9ofR1ovFLziyXaN1DPq4yffMAZ9czzBD',
  '13fqhWQCqTHTPbU1fyvbz9Ua3NC47fVVexYuNQRBwpSeZyKM',
  '16GDRhRYxk42paoK6TfHAqWej8PdDDUwdDazjv4bAn4KGNeb',
  '13Ybj8CPEArUee78DxUAP9yX3ABmFNVQME1ZH4w8HVncHGzc'
];

const EXCHANGE_ADDRESSES = [
  '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn',
  '146HpE8rjRwvjFQpHPg3z83EGg7MFEJBwd4PUW3R2jTJT7Cp',
  '14FAmBCRfHvxqjXDugPMpxNf2t6ZphUEHKBEwUnqRnqSqYGV'
];

const VALIDATOR_ADDRESSES = [
  '14E5nqKAp3oAJcmzgZhUD2RcptBeUBScxKHgJKU4HPNcKVf3',
  '153YD8ZHD9dRh82U419bSCB5SzWhbdAFzjj4NtA5pMazR2yC',
  '14Vxs7UB9CqcvJGMXbkxNHFQs9TXEuUfUC5hjUwNMp3KHhUG'
];

class TestDataGenerator {
  constructor() {
    this.baseTime = Date.now();
    this.blockHeight = 14268787; // Real Polkadot block height
  }

  /**
   * Generate a dormant whale awakening scenario
   */
  generateDormantWhaleScenario() {
    const whaleAddress = WHALE_ADDRESSES[0];
    const dormantDays = 423;
    const balance = 2470695.5;
    const transactions = [];

    // Generate dormant period (no transactions)
    const dormantStart = this.baseTime - (dormantDays * 24 * 60 * 60 * 1000);
    
    // Awakening event - burst of transactions
    const awakeningTime = this.baseTime - (2 * 60 * 60 * 1000); // 2 hours ago
    
    for (let i = 0; i < 14; i++) {
      transactions.push({
        hash: this.generateTxHash(),
        from: whaleAddress,
        to: this.generateRandomAddress(),
        amount: Math.floor(balance * 0.07), // ~7% each
        timestamp: awakeningTime + (i * 60 * 1000), // 1 minute apart
        block: this.blockHeight + i,
        fee: 0.0125,
        success: true,
        type: 'transfer'
      });
    }

    return {
      scenario: 'dormant_whale_awakening',
      address: whaleAddress,
      dormantPeriod: {
        days: dormantDays,
        lastActivity: new Date(dormantStart).toISOString(),
        awakenedAt: new Date(awakeningTime).toISOString()
      },
      balance: balance,
      transactions: transactions,
      alerts: [
        {
          type: 'DORMANT_WHALE_ACTIVE',
          severity: 'CRITICAL',
          timestamp: awakeningTime,
          details: `Whale dormant for ${dormantDays} days suddenly active`
        }
      ]
    };
  }

  /**
   * Generate exchange run scenario
   */
  generateExchangeRunScenario() {
    const exchangeAddress = EXCHANGE_ADDRESSES[0];
    const normalDailyVolume = 2100000;
    const transactions = [];
    const startTime = this.baseTime - (6 * 60 * 60 * 1000); // 6 hours ago

    // Progressive increase in withdrawals
    const hourlyMultipliers = [1.15, 1.45, 2.2, 3.5, 4.8, 5.2];
    
    hourlyMultipliers.forEach((multiplier, hour) => {
      const txCount = Math.floor(10 * multiplier);
      
      for (let i = 0; i < txCount; i++) {
        const isWithdrawal = Math.random() > 0.2; // 80% withdrawals
        transactions.push({
          hash: this.generateTxHash(),
          from: isWithdrawal ? exchangeAddress : this.generateRandomAddress(),
          to: isWithdrawal ? this.generateRandomAddress() : exchangeAddress,
          amount: Math.floor((normalDailyVolume / 24) * multiplier * Math.random()),
          timestamp: startTime + (hour * 60 * 60 * 1000) + (i * 5 * 60 * 1000),
          block: this.blockHeight + (hour * 12) + i,
          fee: 0.0125,
          success: true,
          type: isWithdrawal ? 'withdrawal' : 'deposit'
        });
      }
    });

    return {
      scenario: 'exchange_run',
      exchange: {
        address: exchangeAddress,
        name: 'Major CEX Hot Wallet',
        normalDailyVolume: normalDailyVolume
      },
      period: {
        start: new Date(startTime).toISOString(),
        end: new Date(this.baseTime).toISOString(),
        duration: '6 hours'
      },
      transactions: transactions,
      metrics: {
        totalWithdrawals: transactions.filter(tx => tx.type === 'withdrawal').length,
        totalDeposits: transactions.filter(tx => tx.type === 'deposit').length,
        netOutflow: transactions.reduce((sum, tx) => {
          return sum + (tx.type === 'withdrawal' ? tx.amount : -tx.amount);
        }, 0),
        peakHour: 5,
        severity: 'CRITICAL'
      },
      alerts: hourlyMultipliers.map((mult, hour) => ({
        type: 'EXCHANGE_IMBALANCE',
        severity: hour < 2 ? 'LOW' : hour < 3 ? 'MEDIUM' : hour < 4 ? 'HIGH' : 'CRITICAL',
        timestamp: startTime + (hour * 60 * 60 * 1000),
        details: `Outflow ${Math.floor((mult - 1) * 100)}% above normal`
      }))
    };
  }

  /**
   * Generate validator exodus scenario
   */
  generateValidatorExodusScenario() {
    const transactions = [];
    const startTime = this.baseTime - (4 * 60 * 60 * 1000);
    
    VALIDATOR_ADDRESSES.forEach((validator, index) => {
      const unstakeTime = startTime + (index * 30 * 60 * 1000); // 30 min apart
      transactions.push({
        hash: this.generateTxHash(),
        from: validator,
        to: 'UNSTAKING_POOL',
        amount: 1250000 + (index * 500000), // Varying amounts
        timestamp: unstakeTime,
        block: this.blockHeight + (index * 6),
        fee: 0.0125,
        success: true,
        type: 'unbond',
        details: {
          era: 867 + index,
          unbondingPeriod: 28, // days
          commission: 5 + index
        }
      });
    });

    return {
      scenario: 'validator_exodus',
      validators: VALIDATOR_ADDRESSES.map((addr, i) => ({
        address: addr,
        name: `Veteran Validator #${i + 1}`,
        stake: transactions[i].amount,
        commission: 5 + i,
        reputation: 98.5 - i * 0.5
      })),
      transactions: transactions,
      impact: {
        totalStakeExiting: transactions.reduce((sum, tx) => sum + tx.amount, 0),
        validatorCount: transactions.length,
        networkSecurityImpact: 'MEDIUM',
        estimatedAPRChange: 0.05
      },
      alerts: [{
        type: 'VALIDATOR_CLUSTER_EXIT',
        severity: 'HIGH',
        timestamp: startTime,
        details: `${VALIDATOR_ADDRESSES.length} validators initiating unbonding within 2 hours`
      }]
    };
  }

  /**
   * Generate multi-whale convergence scenario
   */
  generateWhaleConvergenceScenario() {
    const sourceWhale = '1qnJN7FViy3HZaxZK9tGAA71zxHSBeUweirKqCaox4t8GT7';
    const targetAddress = this.generateRandomAddress();
    const transactions = [];
    const startTime = this.baseTime - (3 * 60 * 60 * 1000);

    WHALE_ADDRESSES.slice(0, 3).forEach((whale, index) => {
      const moveTime = startTime + (index * 2 * 60 * 60 * 1000); // 2 hours apart
      transactions.push({
        hash: this.generateTxHash(),
        from: whale,
        to: targetAddress,
        amount: 500000 + (index * 250000),
        timestamp: moveTime,
        block: this.blockHeight + (index * 24),
        fee: 0.0125,
        success: true,
        type: 'transfer',
        metadata: {
          dormantDays: 188 + (index * 50),
          lastCommonSource: sourceWhale,
          pattern: 'COORDINATED_MOVEMENT'
        }
      });
    });

    return {
      scenario: 'whale_convergence',
      whales: WHALE_ADDRESSES.slice(0, 3).map((addr, i) => ({
        address: addr,
        balance: 1000000 + (i * 500000),
        dormantDays: 188 + (i * 50),
        lastActivity: new Date(startTime - ((188 + i * 50) * 24 * 60 * 60 * 1000)).toISOString()
      })),
      convergencePoint: targetAddress,
      transactions: transactions,
      pattern: {
        type: 'COORDINATED_MOVEMENT',
        confidence: 0.94,
        commonSource: sourceWhale,
        totalVolume: transactions.reduce((sum, tx) => sum + tx.amount, 0),
        timeSpan: '6 hours'
      },
      prediction: {
        marketImpact: -5.7,
        liquidationRisk: 'HIGH',
        nextMoveExpected: '2-4 hours'
      },
      alerts: [{
        type: 'WHALE_CONVERGENCE',
        severity: 'CRITICAL',
        timestamp: startTime,
        details: 'Multiple dormant whales moving to same destination'
      }]
    };
  }

  /**
   * Generate behavioral anomaly scenario
   */
  generateBehavioralAnomalyScenario() {
    const address = WHALE_ADDRESSES[1];
    const normalTxSize = 38000;
    const normalHour = 22; // 10 PM UTC
    const transactions = [];

    // Generate normal pattern (last 30 days)
    for (let day = 30; day > 0; day--) {
      const timestamp = this.baseTime - (day * 24 * 60 * 60 * 1000);
      const normalTime = new Date(timestamp);
      normalTime.setUTCHours(normalHour, 0, 0, 0);
      
      transactions.push({
        hash: this.generateTxHash(),
        from: address,
        to: this.generateRandomAddress(),
        amount: normalTxSize + Math.floor(Math.random() * 5000 - 2500),
        timestamp: normalTime.getTime(),
        block: this.blockHeight - (day * 7200),
        fee: 0.0125,
        success: true,
        type: 'transfer',
        pattern: 'NORMAL'
      });
    }

    // Generate anomaly
    const anomalyTime = this.baseTime - (2 * 60 * 60 * 1000);
    transactions.push({
      hash: this.generateTxHash(),
      from: address,
      to: this.generateRandomAddress(),
      amount: normalTxSize * 50, // 50x normal size
      timestamp: anomalyTime,
      block: this.blockHeight,
      fee: 0.125,
      success: true,
      type: 'transfer',
      pattern: 'ANOMALY',
      flags: ['SIZE_ANOMALY', 'TIME_ANOMALY', 'NEW_RECIPIENT', 'ROUND_NUMBER']
    });

    return {
      scenario: 'behavioral_anomaly',
      address: address,
      normalPattern: {
        avgDailyTx: 1.2,
        avgSize: normalTxSize,
        preferredHour: normalHour,
        consistency: 94.5
      },
      transactions: transactions,
      anomaly: {
        transaction: transactions[transactions.length - 1],
        sizeMultiple: 50,
        timeDeviation: Math.abs(new Date(anomalyTime).getUTCHours() - normalHour),
        confidence: 0.98
      },
      alerts: [{
        type: 'BEHAVIORAL_ANOMALY',
        severity: 'HIGH',
        timestamp: anomalyTime,
        details: 'Transaction 50x larger than normal, 8 hours early'
      }]
    };
  }

  /**
   * Generate realistic historical data for testing
   */
  async generateHistoricalData() {
    const scenarios = [
      this.generateDormantWhaleScenario(),
      this.generateExchangeRunScenario(),
      this.generateValidatorExodusScenario(),
      this.generateWhaleConvergenceScenario(),
      this.generateBehavioralAnomalyScenario()
    ];

    // Save each scenario
    for (const scenario of scenarios) {
      const filename = path.join(__dirname, 'data', `${scenario.scenario}.json`);
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename, JSON.stringify(scenario, null, 2));
      console.log(`Generated: ${scenario.scenario}`);
    }

    // Generate combined dataset
    const combined = {
      generated: new Date().toISOString(),
      scenarios: scenarios.map(s => s.scenario),
      transactions: scenarios.flatMap(s => s.transactions),
      alerts: scenarios.flatMap(s => s.alerts),
      metadata: {
        totalTransactions: scenarios.reduce((sum, s) => sum + s.transactions.length, 0),
        totalAlerts: scenarios.reduce((sum, s) => sum + s.alerts.length, 0),
        timeRange: {
          start: new Date(Math.min(...scenarios.flatMap(s => s.transactions.map(t => t.timestamp)))).toISOString(),
          end: new Date(Math.max(...scenarios.flatMap(s => s.transactions.map(t => t.timestamp)))).toISOString()
        }
      }
    };

    await fs.writeFile(
      path.join(__dirname, 'data', 'combined-test-data.json'),
      JSON.stringify(combined, null, 2)
    );

    console.log('\nTest data generation complete!');
    console.log(`Total transactions: ${combined.metadata.totalTransactions}`);
    console.log(`Total alerts: ${combined.metadata.totalAlerts}`);
  }

  /**
   * Utility functions
   */
  generateTxHash() {
    return '0x' + Array.from({ length: 64 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  generateRandomAddress() {
    const prefix = '1';
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    return prefix + Array.from({ length: 47 }, () => 
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  }
}

// Run generator
const generator = new TestDataGenerator();
generator.generateHistoricalData().catch(console.error);