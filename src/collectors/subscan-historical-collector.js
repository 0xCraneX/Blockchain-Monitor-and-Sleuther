import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ora from 'ora';
import chalk from 'chalk';

// Import SubscanService from parent project
import { subscanService } from '../../../src/services/SubscanService.js';

// Import utilities
import { createLogger, formatDOT, formatDuration, formatAddress } from '../utils/logger.js';
import { 
  ALL_INTERESTING_ADDRESSES, 
  COLLECTION_LIMITS, 
  PATHS,
  TIME_CONSTANTS 
} from '../utils/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createLogger('collector');

/**
 * SubscanHistoricalCollector - Collects historical blockchain data via Subscan API
 * 
 * This collector:
 * 1. Fetches transaction history for interesting addresses
 * 2. Builds behavioral profiles for each address
 * 3. Saves data for baseline analysis and anomaly detection
 * 
 * Rate limiting is handled automatically by the SubscanService
 */
export class SubscanHistoricalCollector {
  constructor(options = {}) {
    this.options = {
      maxAddresses: options.maxAddresses || COLLECTION_LIMITS.MAX_ADDRESSES,
      maxPagesPerAddress: options.maxPagesPerAddress || COLLECTION_LIMITS.MAX_PAGES_PER_ADDRESS,
      maxTransfersPerAddress: options.maxTransfersPerAddress || COLLECTION_LIMITS.MAX_TRANSFERS_PER_ADDRESS,
      customAddresses: options.customAddresses || [],
      ...options
    };
    
    this.outputDir = path.resolve(PATHS.HISTORICAL_DATA);
    this.stats = {
      startTime: Date.now(),
      addressesProcessed: 0,
      totalTransfers: 0,
      errors: []
    };
  }

  /**
   * Main entry point - runs the full collection process
   */
  async run() {
    logger.info('Starting Subscan historical data collection', {
      maxAddresses: this.options.maxAddresses,
      maxPagesPerAddress: this.options.maxPagesPerAddress
    });

    try {
      // Ensure output directory exists
      await fs.mkdir(this.outputDir, { recursive: true });
      
      // Get addresses to analyze
      const addresses = this.getAddressesToCollect();
      logger.info(`Found ${addresses.length} addresses to analyze`);
      
      // Create summary file
      const summaryPath = path.join(this.outputDir, 'collection-summary.json');
      await this.initializeSummary(summaryPath, addresses);
      
      // Process each address
      const profiles = [];
      for (let i = 0; i < addresses.length; i++) {
        const addressInfo = addresses[i];
        logger.progress(i + 1, addresses.length, `Processing ${addressInfo.name || formatAddress(addressInfo.address)}`);
        
        try {
          const profile = await this.collectAddressProfile(addressInfo);
          if (profile) {
            profiles.push(profile);
            await this.saveProfile(profile);
            this.stats.addressesProcessed++;
          }
        } catch (error) {
          logger.error(`Failed to collect data for ${addressInfo.address}`, error);
          this.stats.errors.push({
            address: addressInfo.address,
            error: error.message
          });
        }
        
        // Small delay between addresses to be respectful
        if (i < addresses.length - 1) {
          await this.delay(1000);
        }
      }
      
      // Save final summary
      await this.saveFinalSummary(summaryPath, profiles);
      
      // Print completion statistics
      this.printStats();
      
      return profiles;
      
    } catch (error) {
      logger.error('Fatal error during collection', error);
      throw error;
    }
  }

  /**
   * Get list of addresses to collect data for
   */
  getAddressesToCollect() {
    const addresses = [...ALL_INTERESTING_ADDRESSES];
    
    // Add any custom addresses
    if (this.options.customAddresses.length > 0) {
      this.options.customAddresses.forEach(addr => {
        addresses.push({
          address: addr,
          name: 'Custom',
          type: 'custom'
        });
      });
    }
    
    // Limit to configured maximum
    return addresses.slice(0, this.options.maxAddresses);
  }

  /**
   * Collect complete profile for a single address
   */
  async collectAddressProfile(addressInfo) {
    const spinner = ora(`Collecting data for ${addressInfo.name}`).start();
    
    try {
      // Initialize profile
      const profile = {
        address: addressInfo.address,
        name: addressInfo.name,
        type: addressInfo.type,
        identity: null,
        firstSeen: null,
        lastSeen: null,
        transactionCount: 0,
        totalVolumeSent: BigInt(0),
        totalVolumeReceived: BigInt(0),
        avgTransactionSize: BigInt(0),
        maxTransactionSent: BigInt(0),
        maxTransactionReceived: BigInt(0),
        counterparties: new Map(),
        dailyActivity: {},
        hourlyActivity: new Array(24).fill(0),
        transfers: [],
        metadata: {
          collectionTime: new Date().toISOString(),
          pagesCollected: 0,
          transfersCollected: 0
        }
      };
      
      // Get account info including identity
      spinner.text = `Getting account info for ${addressInfo.name}`;
      try {
        const accountInfo = await subscanService.getAccountInfo(addressInfo.address);
        profile.identity = accountInfo.identity;
        profile.balance = accountInfo.balance;
        logger.debug(`Account identity: ${accountInfo.identity?.display || 'None'}`);
      } catch (error) {
        logger.warn(`Could not fetch account info for ${addressInfo.address}: ${error.message}`);
      }
      
      // Collect transfers
      spinner.text = `Collecting transfers for ${addressInfo.name}`;
      await this.collectTransfers(profile, spinner);
      
      // Process collected data
      spinner.text = `Processing data for ${addressInfo.name}`;
      this.processProfile(profile);
      
      spinner.succeed(`Collected ${profile.transactionCount} transactions for ${addressInfo.name}`);
      
      return profile;
      
    } catch (error) {
      spinner.fail(`Failed to collect data for ${addressInfo.name}`);
      throw error;
    }
  }

  /**
   * Collect all transfers for an address
   */
  async collectTransfers(profile, spinner) {
    let page = 0;
    let hasMore = true;
    let totalCollected = 0;
    
    while (hasMore && page < this.options.maxPagesPerAddress && totalCollected < this.options.maxTransfersPerAddress) {
      try {
        // Update spinner
        if (page > 0) {
          spinner.text = `Collecting transfers for ${profile.name} (page ${page + 1})`;
        }
        
        // Fetch transfers
        const result = await subscanService.getTransfers(profile.address, {
          row: 100,
          page: page,
          direction: 'all'
        });
        
        if (!result.transfers || result.transfers.length === 0) {
          hasMore = false;
          break;
        }
        
        // Process each transfer
        for (const transfer of result.transfers) {
          if (totalCollected >= this.options.maxTransfersPerAddress) {
            hasMore = false;
            break;
          }
          
          this.processTransfer(profile, transfer);
          totalCollected++;
        }
        
        profile.metadata.pagesCollected++;
        profile.metadata.transfersCollected = totalCollected;
        
        // Check if we've reached the end
        if (result.transfers.length < 100) {
          hasMore = false;
        }
        
        page++;
        this.stats.totalTransfers += result.transfers.length;
        
        logger.debug(`Collected page ${page} for ${profile.address}`, {
          transfers: result.transfers.length,
          total: totalCollected
        });
        
      } catch (error) {
        logger.error(`Error collecting page ${page} for ${profile.address}`, error);
        hasMore = false;
      }
    }
  }

  /**
   * Process a single transfer and update profile
   */
  processTransfer(profile, transfer) {
    const value = BigInt(transfer.amount || '0');
    const timestamp = transfer.block_timestamp * 1000; // Convert to ms
    const date = new Date(timestamp);
    const dateStr = date.toISOString().split('T')[0];
    const hour = date.getHours();
    
    // Update transaction count
    profile.transactionCount++;
    
    // Update first/last seen
    if (!profile.firstSeen || timestamp < profile.firstSeen) {
      profile.firstSeen = timestamp;
    }
    if (!profile.lastSeen || timestamp > profile.lastSeen) {
      profile.lastSeen = timestamp;
    }
    
    // Determine direction and update volumes
    const isSender = transfer.from === profile.address;
    if (isSender) {
      profile.totalVolumeSent += value;
      if (value > profile.maxTransactionSent) {
        profile.maxTransactionSent = value;
      }
    } else {
      profile.totalVolumeReceived += value;
      if (value > profile.maxTransactionReceived) {
        profile.maxTransactionReceived = value;
      }
    }
    
    // Track counterparty
    const counterparty = isSender ? transfer.to : transfer.from;
    const counterpartyData = profile.counterparties.get(counterparty) || {
      address: counterparty,
      transactionCount: 0,
      volumeSent: BigInt(0),
      volumeReceived: BigInt(0),
      firstInteraction: timestamp,
      lastInteraction: timestamp
    };
    
    counterpartyData.transactionCount++;
    if (isSender) {
      counterpartyData.volumeSent += value;
    } else {
      counterpartyData.volumeReceived += value;
    }
    counterpartyData.lastInteraction = timestamp;
    profile.counterparties.set(counterparty, counterpartyData);
    
    // Track daily activity
    profile.dailyActivity[dateStr] = (profile.dailyActivity[dateStr] || 0) + 1;
    
    // Track hourly activity
    profile.hourlyActivity[hour]++;
    
    // Store transfer details (limited to save space)
    if (profile.transfers.length < 1000) {
      profile.transfers.push({
        hash: transfer.hash,
        from: transfer.from,
        to: transfer.to,
        value: value.toString(),
        timestamp,
        block: transfer.block_num,
        direction: isSender ? 'sent' : 'received'
      });
    }
  }

  /**
   * Process and finalize profile data
   */
  processProfile(profile) {
    // Calculate average transaction size
    const totalVolume = profile.totalVolumeSent + profile.totalVolumeReceived;
    if (profile.transactionCount > 0) {
      profile.avgTransactionSize = totalVolume / BigInt(profile.transactionCount);
    }
    
    // Convert BigInt values to strings for JSON serialization
    profile.totalVolumeSent = profile.totalVolumeSent.toString();
    profile.totalVolumeReceived = profile.totalVolumeReceived.toString();
    profile.avgTransactionSize = profile.avgTransactionSize.toString();
    profile.maxTransactionSent = profile.maxTransactionSent.toString();
    profile.maxTransactionReceived = profile.maxTransactionReceived.toString();
    
    // Convert counterparties Map to array and sort by volume
    profile.counterparties = Array.from(profile.counterparties.values())
      .map(cp => ({
        ...cp,
        volumeSent: cp.volumeSent.toString(),
        volumeReceived: cp.volumeReceived.toString(),
        totalVolume: (BigInt(cp.volumeSent) + BigInt(cp.volumeReceived)).toString()
      }))
      .sort((a, b) => {
        const volA = BigInt(a.totalVolume);
        const volB = BigInt(b.totalVolume);
        return volB > volA ? 1 : volB < volA ? -1 : 0;
      })
      .slice(0, 50); // Keep top 50 counterparties
    
    // Add analysis metadata
    profile.analysis = {
      daysSinceLastActivity: profile.lastSeen ? 
        Math.floor((Date.now() - profile.lastSeen) / TIME_CONSTANTS.ONE_DAY) : null,
      isDormant: profile.lastSeen ? 
        (Date.now() - profile.lastSeen) > TIME_CONSTANTS.SIX_MONTHS : false,
      avgDailyTransactions: Object.keys(profile.dailyActivity).length > 0 ?
        profile.transactionCount / Object.keys(profile.dailyActivity).length : 0,
      mostActiveHour: profile.hourlyActivity.indexOf(Math.max(...profile.hourlyActivity)),
      uniqueCounterparties: profile.counterparties.length
    };
  }

  /**
   * Save profile to file
   */
  async saveProfile(profile) {
    const filename = `${profile.address}.json`;
    const filepath = path.join(this.outputDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(profile, null, 2));
    logger.debug(`Saved profile to ${filename}`);
  }

  /**
   * Initialize collection summary file
   */
  async initializeSummary(summaryPath, addresses) {
    const summary = {
      collectionStart: new Date().toISOString(),
      totalAddresses: addresses.length,
      addresses: addresses.map(a => ({
        address: a.address,
        name: a.name,
        type: a.type,
        status: 'pending'
      })),
      stats: {}
    };
    
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  }

  /**
   * Save final collection summary
   */
  async saveFinalSummary(summaryPath, profiles) {
    const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
    
    // Update address statuses
    summary.addresses = summary.addresses.map(addr => {
      const profile = profiles.find(p => p.address === addr.address);
      return {
        ...addr,
        status: profile ? 'completed' : 'failed',
        transactionCount: profile?.transactionCount || 0,
        isDormant: profile?.analysis?.isDormant || false
      };
    });
    
    // Add statistics
    summary.stats = {
      collectionEnd: new Date().toISOString(),
      duration: formatDuration(Date.now() - this.stats.startTime),
      addressesProcessed: this.stats.addressesProcessed,
      totalTransfers: this.stats.totalTransfers,
      errors: this.stats.errors.length,
      dormantAddresses: profiles.filter(p => p.analysis.isDormant).length,
      activeAddresses: profiles.filter(p => !p.analysis.isDormant).length
    };
    
    // Find interesting patterns for demo
    summary.interestingFindings = this.findInterestingPatterns(profiles);
    
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    logger.success('Collection summary saved', { path: summaryPath });
  }

  /**
   * Find interesting patterns in collected data for hackathon demo
   */
  findInterestingPatterns(profiles) {
    const findings = {
      dormantWhales: [],
      highVolumeAddresses: [],
      unusualActivity: []
    };
    
    // Find dormant whales
    profiles
      .filter(p => p.analysis.isDormant && BigInt(p.totalVolumeSent) > BigInt(10000 * 10 ** 10))
      .forEach(p => {
        findings.dormantWhales.push({
          address: p.address,
          name: p.name,
          daysDormant: p.analysis.daysSinceLastActivity,
          lastSeen: new Date(p.lastSeen).toISOString(),
          totalVolume: formatDOT(BigInt(p.totalVolumeSent) + BigInt(p.totalVolumeReceived))
        });
      });
    
    // Find high volume addresses
    profiles
      .sort((a, b) => {
        const volA = BigInt(a.totalVolumeSent) + BigInt(a.totalVolumeReceived);
        const volB = BigInt(b.totalVolumeSent) + BigInt(b.totalVolumeReceived);
        return volB > volA ? 1 : volB < volA ? -1 : 0;
      })
      .slice(0, 5)
      .forEach(p => {
        findings.highVolumeAddresses.push({
          address: p.address,
          name: p.name,
          totalVolume: formatDOT(BigInt(p.totalVolumeSent) + BigInt(p.totalVolumeReceived)),
          transactionCount: p.transactionCount,
          avgSize: formatDOT(p.avgTransactionSize)
        });
      });
    
    return findings;
  }

  /**
   * Print collection statistics
   */
  printStats() {
    console.log('\n' + chalk.cyan('='.repeat(60)));
    console.log(chalk.cyan.bold('Collection Complete!'));
    console.log(chalk.cyan('='.repeat(60)));
    
    console.log(chalk.white(`\nDuration: ${formatDuration(Date.now() - this.stats.startTime)}`));
    console.log(chalk.white(`Addresses processed: ${this.stats.addressesProcessed}`));
    console.log(chalk.white(`Total transfers collected: ${this.stats.totalTransfers}`));
    
    if (this.stats.errors.length > 0) {
      console.log(chalk.yellow(`\nErrors encountered: ${this.stats.errors.length}`));
      this.stats.errors.forEach(err => {
        console.log(chalk.yellow(`  - ${formatAddress(err.address)}: ${err.error}`));
      });
    }
    
    console.log(chalk.green(`\nData saved to: ${this.outputDir}`));
    console.log(chalk.green(`Summary available at: ${path.join(this.outputDir, 'collection-summary.json')}`));
    
    console.log('\n' + chalk.cyan('='.repeat(60)) + '\n');
  }

  /**
   * Utility function to add delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const collector = new SubscanHistoricalCollector();
  collector.run().catch(error => {
    logger.error('Fatal error', error);
    process.exit(1);
  });
}

export default SubscanHistoricalCollector;