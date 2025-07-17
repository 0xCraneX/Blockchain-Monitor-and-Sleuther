import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ora from 'ora';
import chalk from 'chalk';

import { createLogger, formatDOT, formatDuration, formatAddress } from '../utils/logger.js';
import { PATHS, TIME_CONSTANTS, ANOMALY_THRESHOLDS } from '../utils/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createLogger('baseline');

/**
 * BaselineBuilder - Analyzes collected historical data to build behavioral baselines
 * 
 * This analyzer:
 * 1. Reads all collected address profiles
 * 2. Calculates statistical baselines for normal behavior
 * 3. Identifies patterns and relationships
 * 4. Saves baseline data for anomaly detection
 */
export class BaselineBuilder {
  constructor(options = {}) {
    this.options = {
      inputDir: options.inputDir || PATHS.HISTORICAL_DATA,
      outputDir: options.outputDir || PATHS.BASELINES,
      ...options
    };
    
    this.profiles = [];
    this.baseline = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      addresses: {},
      globalStats: {},
      xcmRoutes: {},
      patterns: {}
    };
  }

  /**
   * Main entry point - builds baseline from collected data
   */
  async build() {
    logger.info('Starting baseline analysis');
    const startTime = Date.now();

    try {
      // Load all profiles
      await this.loadProfiles();
      
      if (this.profiles.length === 0) {
        logger.error('No profiles found to analyze');
        return null;
      }
      
      // Build individual address baselines
      logger.info('Building address baselines...');
      await this.buildAddressBaselines();
      
      // Calculate global statistics
      logger.info('Calculating global statistics...');
      await this.calculateGlobalStats();
      
      // Analyze XCM patterns
      logger.info('Analyzing cross-chain patterns...');
      await this.analyzeXCMPatterns();
      
      // Detect behavioral patterns
      logger.info('Detecting behavioral patterns...');
      await this.detectPatterns();
      
      // Save baseline
      await this.saveBaseline();
      
      // Print summary
      this.printSummary();
      
      logger.success(`Baseline built in ${formatDuration(Date.now() - startTime)}`);
      return this.baseline;
      
    } catch (error) {
      logger.error('Failed to build baseline', error);
      throw error;
    }
  }

  /**
   * Load all profile files from historical data directory
   */
  async loadProfiles() {
    const spinner = ora('Loading address profiles').start();
    
    try {
      const files = await fs.readdir(this.options.inputDir);
      const profileFiles = files.filter(f => f.endsWith('.json') && f !== 'collection-summary.json');
      
      for (const file of profileFiles) {
        try {
          const data = await fs.readFile(path.join(this.options.inputDir, file), 'utf8');
          const profile = JSON.parse(data);
          this.profiles.push(profile);
        } catch (error) {
          logger.warn(`Failed to load profile ${file}: ${error.message}`);
        }
      }
      
      spinner.succeed(`Loaded ${this.profiles.length} address profiles`);
    } catch (error) {
      spinner.fail('Failed to load profiles');
      throw error;
    }
  }

  /**
   * Build baseline for each address
   */
  async buildAddressBaselines() {
    for (const profile of this.profiles) {
      const baseline = {
        // Basic info
        address: profile.address,
        name: profile.name,
        type: profile.type,
        identity: profile.identity?.display || null,
        
        // Activity metrics
        firstSeen: profile.firstSeen,
        lastSeen: profile.lastSeen,
        totalTransactions: profile.transactionCount,
        isDormant: profile.analysis?.isDormant || false,
        daysSinceLastActivity: profile.analysis?.daysSinceLastActivity || 0,
        
        // Volume metrics (in string format for JSON)
        avgTransactionSize: profile.avgTransactionSize,
        maxTransactionSent: profile.maxTransactionSent,
        maxTransactionReceived: profile.maxTransactionReceived,
        totalVolumeSent: profile.totalVolumeSent,
        totalVolumeReceived: profile.totalVolumeReceived,
        
        // Behavioral patterns
        avgDailyTransactions: profile.analysis?.avgDailyTransactions || 0,
        mostActiveHour: profile.analysis?.mostActiveHour || 0,
        uniqueCounterparties: profile.analysis?.uniqueCounterparties || 0,
        
        // Time-based patterns
        activityPattern: this.analyzeActivityPattern(profile),
        
        // Relationship data
        topCounterparties: profile.counterparties.slice(0, 10).map(cp => ({
          address: cp.address,
          transactionCount: cp.transactionCount,
          totalVolume: cp.totalVolume
        }))
      };
      
      // Calculate additional metrics
      baseline.metrics = this.calculateAddressMetrics(profile);
      
      this.baseline.addresses[profile.address] = baseline;
    }
    
    logger.info(`Built baselines for ${Object.keys(this.baseline.addresses).length} addresses`);
  }

  /**
   * Analyze activity pattern for an address
   */
  analyzeActivityPattern(profile) {
    const pattern = {
      type: 'unknown',
      frequency: 'unknown',
      volumeProfile: 'unknown'
    };
    
    // Determine activity type
    if (profile.analysis?.isDormant) {
      pattern.type = 'dormant';
    } else if (profile.analysis?.daysSinceLastActivity < 7) {
      pattern.type = 'active';
    } else if (profile.analysis?.daysSinceLastActivity < 30) {
      pattern.type = 'semi-active';
    } else {
      pattern.type = 'inactive';
    }
    
    // Determine frequency
    if (profile.analysis?.avgDailyTransactions > 10) {
      pattern.frequency = 'high';
    } else if (profile.analysis?.avgDailyTransactions > 1) {
      pattern.frequency = 'medium';
    } else if (profile.analysis?.avgDailyTransactions > 0.1) {
      pattern.frequency = 'low';
    } else {
      pattern.frequency = 'very-low';
    }
    
    // Determine volume profile
    const avgSize = BigInt(profile.avgTransactionSize || '0');
    const oneDOT = BigInt(10 ** 10);
    
    if (avgSize > BigInt(10000) * oneDOT) {
      pattern.volumeProfile = 'whale';
    } else if (avgSize > BigInt(1000) * oneDOT) {
      pattern.volumeProfile = 'high-volume';
    } else if (avgSize > BigInt(100) * oneDOT) {
      pattern.volumeProfile = 'medium-volume';
    } else {
      pattern.volumeProfile = 'low-volume';
    }
    
    return pattern;
  }

  /**
   * Calculate additional metrics for an address
   */
  calculateAddressMetrics(profile) {
    const metrics = {
      // Calculate average time between transactions
      avgTimeBetweenTransactions: 0,
      
      // Calculate transaction size variance
      transactionSizeVariance: 0,
      
      // Identify if this looks like an exchange/service
      behaviorType: 'unknown'
    };
    
    // Average time between transactions
    if (profile.transactionCount > 1 && profile.firstSeen && profile.lastSeen) {
      const timeSpan = profile.lastSeen - profile.firstSeen;
      metrics.avgTimeBetweenTransactions = Math.floor(timeSpan / (profile.transactionCount - 1));
    }
    
    // Behavior type detection
    if (profile.type === 'exchange') {
      metrics.behaviorType = 'exchange';
    } else if (profile.uniqueCounterparties > 100 && profile.transactionCount > 1000) {
      metrics.behaviorType = 'service';
    } else if (profile.uniqueCounterparties < 10 && profile.transactionCount < 100) {
      metrics.behaviorType = 'personal';
    } else {
      metrics.behaviorType = 'mixed';
    }
    
    return metrics;
  }

  /**
   * Calculate global statistics across all addresses
   */
  async calculateGlobalStats() {
    const stats = {
      totalAddresses: this.profiles.length,
      totalTransactions: 0,
      totalVolume: BigInt(0),
      avgTransactionsPerAddress: 0,
      medianTransactionSize: BigInt(0),
      
      // Activity distribution
      dormantAddresses: 0,
      activeAddresses: 0,
      semiActiveAddresses: 0,
      
      // Time-based stats
      oldestActivity: null,
      newestActivity: null,
      
      // Behavioral categories
      behaviorTypes: {
        exchange: 0,
        service: 0,
        personal: 0,
        mixed: 0,
        unknown: 0
      }
    };
    
    // Collect all transaction sizes for median calculation
    const allTransactionSizes = [];
    
    for (const profile of this.profiles) {
      stats.totalTransactions += profile.transactionCount;
      stats.totalVolume += BigInt(profile.totalVolumeSent || '0') + BigInt(profile.totalVolumeReceived || '0');
      
      // Activity classification
      if (profile.analysis?.isDormant) {
        stats.dormantAddresses++;
      } else if (profile.analysis?.daysSinceLastActivity < 30) {
        stats.activeAddresses++;
      } else {
        stats.semiActiveAddresses++;
      }
      
      // Time bounds
      if (!stats.oldestActivity || profile.firstSeen < stats.oldestActivity) {
        stats.oldestActivity = profile.firstSeen;
      }
      if (!stats.newestActivity || profile.lastSeen > stats.newestActivity) {
        stats.newestActivity = profile.lastSeen;
      }
      
      // Behavior types
      const behaviorType = this.baseline.addresses[profile.address]?.metrics?.behaviorType || 'unknown';
      stats.behaviorTypes[behaviorType]++;
      
      // Collect transaction sizes
      if (profile.avgTransactionSize && profile.avgTransactionSize !== '0') {
        allTransactionSizes.push(BigInt(profile.avgTransactionSize));
      }
    }
    
    // Calculate averages
    stats.avgTransactionsPerAddress = stats.totalTransactions / stats.totalAddresses;
    
    // Calculate median transaction size
    if (allTransactionSizes.length > 0) {
      allTransactionSizes.sort((a, b) => a > b ? 1 : a < b ? -1 : 0);
      const mid = Math.floor(allTransactionSizes.length / 2);
      stats.medianTransactionSize = allTransactionSizes[mid];
    }
    
    // Convert BigInt to string for JSON
    stats.totalVolume = stats.totalVolume.toString();
    stats.medianTransactionSize = stats.medianTransactionSize.toString();
    
    // Add percentage calculations
    stats.percentages = {
      dormant: (stats.dormantAddresses / stats.totalAddresses * 100).toFixed(1),
      active: (stats.activeAddresses / stats.totalAddresses * 100).toFixed(1),
      semiActive: (stats.semiActiveAddresses / stats.totalAddresses * 100).toFixed(1)
    };
    
    this.baseline.globalStats = stats;
    
    logger.debug('Global statistics calculated', {
      totalAddresses: stats.totalAddresses,
      dormantPercentage: stats.percentages.dormant + '%'
    });
  }

  /**
   * Analyze cross-chain (XCM) patterns
   */
  async analyzeXCMPatterns() {
    // For the hackathon, we'll create estimated XCM patterns
    // In production, this would analyze actual XCM transfers
    
    const xcmRoutes = {
      'polkadot->assetHub': {
        estimatedDailyVolume: '1000000000000000', // 100k DOT
        estimatedDailyTransactions: 50,
        peakHours: [14, 15, 16], // UTC
        commonAddresses: []
      },
      'polkadot->moonbeam': {
        estimatedDailyVolume: '500000000000000', // 50k DOT
        estimatedDailyTransactions: 30,
        peakHours: [2, 3, 4], // UTC (Asia active)
        commonAddresses: []
      },
      'polkadot->acala': {
        estimatedDailyVolume: '300000000000000', // 30k DOT
        estimatedDailyTransactions: 20,
        peakHours: [10, 11, 12], // UTC
        commonAddresses: []
      }
    };
    
    // Try to identify potential bridge addresses from our data
    for (const profile of this.profiles) {
      if (profile.type === 'bridge' || profile.name?.toLowerCase().includes('bridge')) {
        // Add to XCM route data
        const route = profile.name.toLowerCase().includes('moonbeam') ? 'polkadot->moonbeam' :
                     profile.name.toLowerCase().includes('acala') ? 'polkadot->acala' :
                     'polkadot->assetHub';
        
        if (xcmRoutes[route]) {
          xcmRoutes[route].commonAddresses.push({
            address: profile.address,
            volume: (BigInt(profile.totalVolumeSent || '0') + BigInt(profile.totalVolumeReceived || '0')).toString()
          });
        }
      }
    }
    
    this.baseline.xcmRoutes = xcmRoutes;
  }

  /**
   * Detect interesting patterns for anomaly detection
   */
  async detectPatterns() {
    const patterns = {
      // Addresses that haven't moved in 6+ months but have significant balance
      dormantWhales: [],
      
      // Addresses with highly variable transaction sizes
      erraticBehavior: [],
      
      // Potential wash trading patterns (high frequency, similar amounts)
      suspiciousPatterns: [],
      
      // Addresses that interact with many exchanges
      exchangeHeavyUsers: []
    };
    
    for (const profile of this.profiles) {
      const baseline = this.baseline.addresses[profile.address];
      
      // Dormant whales
      if (baseline.isDormant && BigInt(baseline.totalVolumeSent || '0') > BigInt(10000 * 10 ** 10)) {
        patterns.dormantWhales.push({
          address: profile.address,
          name: profile.name,
          daysDormant: baseline.daysSinceLastActivity,
          totalVolume: formatDOT(BigInt(baseline.totalVolumeSent) + BigInt(baseline.totalVolumeReceived)),
          lastSeen: new Date(baseline.lastSeen).toISOString()
        });
      }
      
      // Exchange heavy users
      const exchangeInteractions = profile.counterparties.filter(cp => 
        this.baseline.addresses[cp.address]?.type === 'exchange'
      ).length;
      
      if (exchangeInteractions >= 3) {
        patterns.exchangeHeavyUsers.push({
          address: profile.address,
          name: profile.name,
          exchangeCount: exchangeInteractions,
          totalTransactions: baseline.totalTransactions
        });
      }
    }
    
    // Sort patterns by interest
    patterns.dormantWhales.sort((a, b) => b.daysDormant - a.daysDormant);
    
    this.baseline.patterns = patterns;
    
    logger.info('Pattern detection complete', {
      dormantWhales: patterns.dormantWhales.length,
      exchangeHeavyUsers: patterns.exchangeHeavyUsers.length
    });
  }

  /**
   * Save baseline to file
   */
  async saveBaseline() {
    await fs.mkdir(this.options.outputDir, { recursive: true });
    
    const filename = `baseline-${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(this.options.outputDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(this.baseline, null, 2));
    
    // Also save as 'latest.json' for easy access
    const latestPath = path.join(this.options.outputDir, 'latest.json');
    await fs.writeFile(latestPath, JSON.stringify(this.baseline, null, 2));
    
    logger.success(`Baseline saved to ${filename}`);
  }

  /**
   * Print summary of baseline analysis
   */
  printSummary() {
    console.log('\n' + chalk.cyan('='.repeat(60)));
    console.log(chalk.cyan.bold('Baseline Analysis Complete'));
    console.log(chalk.cyan('='.repeat(60)));
    
    const stats = this.baseline.globalStats;
    console.log(chalk.white(`\nAddresses analyzed: ${stats.totalAddresses}`));
    console.log(chalk.white(`Total transactions: ${stats.totalTransactions.toLocaleString()}`));
    console.log(chalk.white(`Total volume: ${formatDOT(stats.totalVolume)}`));
    
    console.log(chalk.white('\nActivity Distribution:'));
    console.log(chalk.green(`  Active (< 30 days): ${stats.activeAddresses} (${stats.percentages.active}%)`));
    console.log(chalk.yellow(`  Semi-active: ${stats.semiActiveAddresses} (${stats.percentages.semiActive}%)`));
    console.log(chalk.red(`  Dormant (> 180 days): ${stats.dormantAddresses} (${stats.percentages.dormant}%)`));
    
    console.log(chalk.white('\nInteresting Findings:'));
    console.log(chalk.yellow(`  Dormant whales: ${this.baseline.patterns.dormantWhales.length}`));
    if (this.baseline.patterns.dormantWhales.length > 0) {
      const oldest = this.baseline.patterns.dormantWhales[0];
      console.log(chalk.yellow(`    Oldest: ${oldest.name} (${oldest.daysDormant} days)`));
    }
    
    console.log(chalk.cyan(`\nBaseline data saved to: ${this.options.outputDir}`));
    console.log('\n' + chalk.cyan('='.repeat(60)) + '\n');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const builder = new BaselineBuilder();
  builder.build().catch(error => {
    logger.error('Fatal error', error);
    process.exit(1);
  });
}

export default BaselineBuilder;