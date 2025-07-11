#!/usr/bin/env node

/**
 * Sample Data Generator for Polkadot Analysis Tool
 * Creates realistic blockchain data for demonstration and testing
 * 
 * Target Address: 13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk
 */

import { DatabaseService } from '../src/services/DatabaseService.js';
import { logger } from '../src/utils/logger.js';
import crypto from 'crypto';

// Target address for analysis
const TARGET_ADDRESS = '13RBN6UF43sxkxUrd2H4QSJccvLNGr6HY4v3mN2WtW59WaNk';

// Sample address pools for realistic data
const EXCHANGE_ADDRESSES = [
  '14Gn7SEmCgMX8n4AarXpJfbxWaHjwHbpU5sQqYXtUj1y5qr2', // Binance
  '15cfSaBcTxNr8rV59cbhdMNCRagFr3GE6B3zZRsCp4QHHKPu', // Kraken
  '16WqAE84oM2C9C8eZXhDZhYPShBM4JfZQW7yTz1a3xZZ3Zk5'  // Coinbase
];

const VALIDATOR_ADDRESSES = [
  '12xtAYsRUrmbniiWQqJtECiBQrMn8AypQcXhnQAc6RB6XkLW',
  '13UVJyLnbVp77Z2t6qZV4fNpRjDHppL6c7weMJobZmSPaZcn',
  '14E5nqKAp3oAJcmzgZhUD2RcptBeUBScxKHgJKU4HPNcKVf3'
];

const REGULAR_ADDRESSES = [
  '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5',
  '16ZL8yLyXv3V2L3MYZ4y4fxkAm4Qbf9w5M9e5QFxS8Ac2F1Z',
  '1461YPsKQ9R9UYfkGD4zHMhgZa7QGrWrZy9Z7XzS3r3r3r3',
  '122GKyy8mFt6kMX8a3E4gRJk2kLa5r7R4V5tGhJ9KfG2fG2H',
  '133PqZcF9vB5aE3xY7mE4vN6Q8cT4r2S9vG8Q6rE7vQ6pQ6'
];

const SUSPICIOUS_ADDRESSES = [
  '177MiXeRDVz5t7Y8Q9n6P5kL6r4r4r4r4r4r4r4r4r4r4r4', // Mixer
  '188DeFbHt6R5r5r5r5r5r5r5r5r5r5r5r5r5r5r5r5r5r5r', // Suspicious
  '199AbCdEf9s9s9s9s9s9s9s9s9s9s9s9s9s9s9s9s9s9s9s'  // Dark market
];

class SampleDataGenerator {
  constructor() {
    this.db = new DatabaseService();
    this.accounts = new Map();
    this.transfers = [];
  }

  async initialize() {
    try {
      await this.db.initialize();
      this.db.isInitialized = true;
      logger.info('Sample data generator initialized');
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Generate a realistic balance for an account type
   */
  generateBalance(type) {
    switch (type) {
      case 'exchange':
        return (Math.random() * 1000000 + 500000) * 1e12; // 500K-1.5M DOT
      case 'validator':
        return (Math.random() * 100000 + 50000) * 1e12;   // 50K-150K DOT
      case 'target':
        return (Math.random() * 50000 + 25000) * 1e12;    // 25K-75K DOT
      case 'suspicious':
        return (Math.random() * 10000 + 1000) * 1e12;     // 1K-11K DOT
      case 'regular':
      default:
        return (Math.random() * 1000 + 100) * 1e12;       // 100-1100 DOT
    }
  }

  /**
   * Generate transfer amounts based on account types
   */
  generateTransferAmount(fromType, toType) {
    if (fromType === 'exchange' || toType === 'exchange') {
      return (Math.random() * 10000 + 1000) * 1e12; // 1K-11K DOT
    }
    if (fromType === 'validator' || toType === 'validator') {
      return (Math.random() * 1000 + 100) * 1e12;   // 100-1100 DOT
    }
    if (fromType === 'suspicious' || toType === 'suspicious') {
      // Suspicious patterns: round numbers
      const amounts = [1000, 2000, 5000, 10000, 25000];
      return amounts[Math.floor(Math.random() * amounts.length)] * 1e12;
    }
    return (Math.random() * 100 + 10) * 1e12; // 10-110 DOT
  }

  /**
   * Create accounts with realistic data
   */
  async createAccounts() {
    logger.info('Creating sample accounts...');

    // Target account
    const targetAccount = {
      address: TARGET_ADDRESS,
      publicKey: crypto.randomBytes(32).toString('hex'),
      identityDisplay: 'Target Analysis Account',
      balance: this.generateBalance('target').toString(),
      firstSeenBlock: 1000000
    };
    this.accounts.set(TARGET_ADDRESS, { ...targetAccount, type: 'target' });
    await this.db.createAccount(targetAccount);

    // Exchange accounts
    for (let i = 0; i < EXCHANGE_ADDRESSES.length; i++) {
      const account = {
        address: EXCHANGE_ADDRESSES[i],
        publicKey: crypto.randomBytes(32).toString('hex'),
        identityDisplay: `Exchange ${i + 1}`,
        balance: this.generateBalance('exchange').toString(),
        firstSeenBlock: 900000 + i * 1000
      };
      this.accounts.set(EXCHANGE_ADDRESSES[i], { ...account, type: 'exchange' });
      await this.db.createAccount(account);
    }

    // Validator accounts
    for (let i = 0; i < VALIDATOR_ADDRESSES.length; i++) {
      const account = {
        address: VALIDATOR_ADDRESSES[i],
        publicKey: crypto.randomBytes(32).toString('hex'),
        identityDisplay: `Validator ${i + 1}`,
        balance: this.generateBalance('validator').toString(),
        firstSeenBlock: 800000 + i * 2000
      };
      this.accounts.set(VALIDATOR_ADDRESSES[i], { ...account, type: 'validator' });
      await this.db.createAccount(account);
    }

    // Regular accounts
    for (let i = 0; i < REGULAR_ADDRESSES.length; i++) {
      const account = {
        address: REGULAR_ADDRESSES[i],
        publicKey: crypto.randomBytes(32).toString('hex'),
        identityDisplay: `User ${i + 1}`,
        balance: this.generateBalance('regular').toString(),
        firstSeenBlock: 1100000 + i * 500
      };
      this.accounts.set(REGULAR_ADDRESSES[i], { ...account, type: 'regular' });
      await this.db.createAccount(account);
    }

    // Suspicious accounts
    for (let i = 0; i < SUSPICIOUS_ADDRESSES.length; i++) {
      const account = {
        address: SUSPICIOUS_ADDRESSES[i],
        publicKey: crypto.randomBytes(32).toString('hex'),
        identityDisplay: `Suspicious ${i + 1}`,
        balance: this.generateBalance('suspicious').toString(),
        firstSeenBlock: 1200000 + i * 100
      };
      this.accounts.set(SUSPICIOUS_ADDRESSES[i], { ...account, type: 'suspicious' });
      await this.db.createAccount(account);
    }

    logger.info(`Created ${this.accounts.size} sample accounts`);
  }

  /**
   * Generate realistic timestamps
   */
  generateTimestamp(baseTime, variance = 86400000) { // 1 day variance
    return new Date(baseTime + (Math.random() - 0.5) * variance).toISOString();
  }

  /**
   * Create realistic transfer patterns
   */
  async createTransfers() {
    logger.info('Creating sample transfers...');

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;

    let transferId = 1;
    let blockNumber = 1500000;

    // Direct transfers to/from target
    const allAddresses = [
      ...EXCHANGE_ADDRESSES,
      ...VALIDATOR_ADDRESSES, 
      ...REGULAR_ADDRESSES,
      ...SUSPICIOUS_ADDRESSES
    ];

    // Pattern 1: Regular activity with exchanges
    for (let i = 0; i < 15; i++) {
      const exchangeAddr = EXCHANGE_ADDRESSES[Math.floor(Math.random() * EXCHANGE_ADDRESSES.length)];
      const fromAccount = this.accounts.get(TARGET_ADDRESS);
      const toAccount = this.accounts.get(exchangeAddr);
      
      const transfer = {
        hash: crypto.randomBytes(32).toString('hex'),
        blockNumber: blockNumber++,
        timestamp: this.generateTimestamp(now - oneMonth + i * oneDay * 2),
        fromAddress: TARGET_ADDRESS,
        toAddress: exchangeAddr,
        value: this.generateTransferAmount(fromAccount.type, toAccount.type).toString(),
        fee: (Math.random() * 0.1 * 1e12).toString(),
        success: true,
        method: 'transfer',
        section: 'balances'
      };
      
      await this.db.createTransfer(transfer);
      transferId++;
    }

    // Pattern 2: Suspicious circular flow
    const suspiciousAddr = SUSPICIOUS_ADDRESSES[0];
    const middleAddr = REGULAR_ADDRESSES[0];
    
    // TARGET -> SUSPICIOUS -> MIDDLE -> TARGET
    const circularTransfers = [
      {
        hash: crypto.randomBytes(32).toString('hex'),
        blockNumber: blockNumber++,
        timestamp: this.generateTimestamp(now - oneWeek),
        fromAddress: TARGET_ADDRESS,
        toAddress: suspiciousAddr,
        value: (50000 * 1e12).toString(), // Exactly 50K DOT (suspicious round number)
        fee: (0.05 * 1e12).toString(),
        success: true,
        method: 'transfer',
        section: 'balances'
      },
      {
        hash: crypto.randomBytes(32).toString('hex'),
        blockNumber: blockNumber++,
        timestamp: this.generateTimestamp(now - oneWeek + 3600000), // 1 hour later
        fromAddress: suspiciousAddr,
        toAddress: middleAddr,
        value: (49500 * 1e12).toString(), // Minus fees
        fee: (0.05 * 1e12).toString(),
        success: true,
        method: 'transfer',
        section: 'balances'
      },
      {
        hash: crypto.randomBytes(32).toString('hex'),
        blockNumber: blockNumber++,
        timestamp: this.generateTimestamp(now - oneWeek + 7200000), // 2 hours later
        fromAddress: middleAddr,
        toAddress: TARGET_ADDRESS,
        value: (49000 * 1e12).toString(), // Minus more fees
        fee: (0.05 * 1e12).toString(),
        success: true,
        method: 'transfer',
        section: 'balances'
      }
    ];

    for (const transfer of circularTransfers) {
      await this.db.createTransfer(transfer);
    }

    // Pattern 3: High-frequency trading with validators
    for (let i = 0; i < 25; i++) {
      const validatorAddr = VALIDATOR_ADDRESSES[i % VALIDATOR_ADDRESSES.length];
      const isIncoming = Math.random() > 0.5;
      
      const transfer = {
        hash: crypto.randomBytes(32).toString('hex'),
        blockNumber: blockNumber++,
        timestamp: this.generateTimestamp(now - oneWeek + i * 3600000), // Every hour
        fromAddress: isIncoming ? validatorAddr : TARGET_ADDRESS,
        toAddress: isIncoming ? TARGET_ADDRESS : validatorAddr,
        value: this.generateTransferAmount('target', 'validator').toString(),
        fee: (Math.random() * 0.1 * 1e12).toString(),
        success: true,
        method: 'transfer',
        section: 'balances'
      };
      
      await this.db.createTransfer(transfer);
    }

    // Pattern 4: Recent rapid movements (suspicious)
    const rapidTransfers = [];
    const rapidBaseTime = now - oneDay;
    
    for (let i = 0; i < 5; i++) {
      const targetAddr = REGULAR_ADDRESSES[i % REGULAR_ADDRESSES.length];
      
      const transfer = {
        hash: crypto.randomBytes(32).toString('hex'),
        blockNumber: blockNumber++,
        timestamp: this.generateTimestamp(rapidBaseTime + i * 300000), // Every 5 minutes
        fromAddress: TARGET_ADDRESS,
        toAddress: targetAddr,
        value: (10000 * 1e12).toString(), // Exactly 10K DOT each
        fee: (0.05 * 1e12).toString(),
        success: true,
        method: 'transfer',
        section: 'balances'
      };
      
      await this.db.createTransfer(transfer);
    }

    // Pattern 5: Cross-network transfers between regular users
    for (let i = 0; i < 20; i++) {
      const fromAddr = allAddresses[Math.floor(Math.random() * allAddresses.length)];
      const toAddr = allAddresses[Math.floor(Math.random() * allAddresses.length)];
      
      if (fromAddr === toAddr) continue;
      
      const fromAccount = this.accounts.get(fromAddr);
      const toAccount = this.accounts.get(toAddr);
      
      const transfer = {
        hash: crypto.randomBytes(32).toString('hex'),
        blockNumber: blockNumber++,
        timestamp: this.generateTimestamp(now - oneMonth + Math.random() * oneMonth),
        fromAddress: fromAddr,
        toAddress: toAddr,
        value: this.generateTransferAmount(fromAccount.type, toAccount.type).toString(),
        fee: (Math.random() * 0.1 * 1e12).toString(),
        success: Math.random() > 0.05, // 5% failure rate
        method: 'transfer',
        section: 'balances'
      };
      
      await this.db.createTransfer(transfer);
    }

    logger.info('Sample transfers created successfully');
  }

  /**
   * Update account statistics
   */
  async updateStatistics() {
    logger.info('Updating statistics...');

    // Update total counts
    await this.db.updateStatistic('total_accounts', this.accounts.size);
    await this.db.updateStatistic('total_transfers', 75); // Approximate count
    await this.db.updateStatistic('total_volume', '5000000000000000000'); // 5M DOT
    await this.db.updateStatistic('last_sync_block', 1500100);

    logger.info('Statistics updated');
  }

  /**
   * Generate the complete sample dataset
   */
  async generate() {
    try {
      logger.info('Starting sample data generation...');
      
      await this.initialize();
      await this.createAccounts();
      await this.createTransfers();
      await this.updateStatistics();
      
      logger.info('✅ Sample data generation completed successfully!');
      logger.info(`Target address: ${TARGET_ADDRESS}`);
      logger.info(`Total accounts: ${this.accounts.size}`);
      logger.info('Data includes:');
      logger.info('- Regular P2P transfers');
      logger.info('- Suspicious circular flows');
      logger.info('- High-frequency validator interactions');
      logger.info('- Rapid movement patterns');
      logger.info('- Cross-network activity');
      
    } catch (error) {
      logger.error('Sample data generation failed:', error);
      throw error;
    } finally {
      await this.db.close();
    }
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new SampleDataGenerator();
  generator.generate()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Generation failed:', error);
      process.exit(1);
    });
}

export { SampleDataGenerator, TARGET_ADDRESS };