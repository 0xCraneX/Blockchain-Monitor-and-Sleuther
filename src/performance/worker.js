import { parentPort, workerData } from 'worker_threads';
import { createLogger } from '../utils/logger.js';

const logger = createLogger(`worker-${workerData.workerId}`);

/**
 * Worker thread for parallel address processing
 */
class AddressProcessorWorker {
  constructor(workerId, options) {
    this.workerId = workerId;
    this.options = options;
    this.processedCount = 0;
    
    logger.info(`Worker ${workerId} initialized`);
  }

  /**
   * Process a batch of addresses
   */
  async processBatch(batch) {
    const startTime = Date.now();
    const results = {
      profiles: [],
      transfers: [],
      patterns: [],
      metrics: {
        processed: 0,
        cached: 0,
        errors: 0,
        transfersAnalyzed: 0
      }
    };
    
    try {
      for (const addressInfo of batch) {
        try {
          const profile = await this.processAddress(addressInfo);
          
          if (profile) {
            results.profiles.push(profile);
            results.metrics.processed++;
            results.metrics.transfersAnalyzed += profile.transactionCount || 0;
            
            // Extract patterns
            const patterns = this.extractBasicPatterns(profile);
            if (patterns.length > 0) {
              results.patterns.push(...patterns);
            }
          }
        } catch (error) {
          logger.error(`Error processing ${addressInfo.address}`, error);
          results.metrics.errors++;
        }
      }
      
      const duration = Date.now() - startTime;
      logger.debug(`Batch processed in ${duration}ms`, {
        addresses: batch.length,
        processed: results.metrics.processed
      });
      
      return results;
      
    } catch (error) {
      logger.error('Batch processing error', error);
      throw error;
    }
  }

  /**
   * Process single address (mock implementation)
   */
  async processAddress(addressInfo) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20));
    
    // Generate mock profile data
    const transactionCount = Math.floor(Math.random() * 1000);
    const daysSinceLastActivity = Math.floor(Math.random() * 365);
    
    return {
      address: addressInfo.address,
      name: addressInfo.name,
      type: addressInfo.type,
      transactionCount,
      totalVolumeSent: (BigInt(Math.floor(Math.random() * 1000000)) * BigInt(10 ** 10)).toString(),
      totalVolumeReceived: (BigInt(Math.floor(Math.random() * 1000000)) * BigInt(10 ** 10)).toString(),
      avgTransactionSize: (BigInt(Math.floor(Math.random() * 10000)) * BigInt(10 ** 10)).toString(),
      analysis: {
        daysSinceLastActivity,
        isDormant: daysSinceLastActivity > 180,
        avgDailyTransactions: transactionCount / Math.max(365 - daysSinceLastActivity, 1)
      },
      counterparties: this.generateMockCounterparties(),
      hourlyActivity: this.generateHourlyActivity(),
      dailyActivity: this.generateDailyActivity()
    };
  }

  /**
   * Extract basic patterns from profile
   */
  extractBasicPatterns(profile) {
    const patterns = [];
    
    // Dormant whale detection
    if (profile.analysis?.isDormant) {
      const totalVolume = BigInt(profile.totalVolumeSent || '0') + BigInt(profile.totalVolumeReceived || '0');
      if (totalVolume > BigInt(10000) * BigInt(10 ** 10)) {
        patterns.push({
          type: 'dormant_whale',
          address: profile.address,
          daysDormant: profile.analysis.daysSinceLastActivity,
          totalVolume: totalVolume.toString()
        });
      }
    }
    
    // High frequency trader
    if (profile.analysis?.avgDailyTransactions > 10) {
      patterns.push({
        type: 'high_frequency',
        address: profile.address,
        avgDaily: profile.analysis.avgDailyTransactions
      });
    }
    
    return patterns;
  }

  /**
   * Generate mock counterparties
   */
  generateMockCounterparties() {
    const count = Math.floor(Math.random() * 20);
    const counterparties = [];
    
    for (let i = 0; i < count; i++) {
      counterparties.push({
        address: `0x${Math.random().toString(16).substring(2, 42)}`,
        transactionCount: Math.floor(Math.random() * 100),
        totalVolume: (BigInt(Math.floor(Math.random() * 10000)) * BigInt(10 ** 10)).toString()
      });
    }
    
    return counterparties;
  }

  /**
   * Generate hourly activity pattern
   */
  generateHourlyActivity() {
    const activity = new Array(24).fill(0);
    
    // Create realistic pattern with peak hours
    const peakHour = 14 + Math.floor(Math.random() * 4);
    
    for (let hour = 0; hour < 24; hour++) {
      const distance = Math.abs(hour - peakHour);
      const base = Math.max(0, 100 - distance * 10);
      activity[hour] = Math.floor(base * (0.5 + Math.random() * 0.5));
    }
    
    return activity;
  }

  /**
   * Generate daily activity
   */
  generateDailyActivity() {
    const activity = {};
    const days = 30 + Math.floor(Math.random() * 335);
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Random activity with some patterns
      if (Math.random() > 0.3) {
        activity[dateStr] = Math.floor(Math.random() * 50);
      }
    }
    
    return activity;
  }
}

// Worker message handling
if (parentPort) {
  const worker = new AddressProcessorWorker(workerData.workerId, workerData.options);
  
  parentPort.on('message', async (message) => {
    try {
      switch (message.type) {
        case 'process_batch':
          const result = await worker.processBatch(message.batch);
          
          parentPort.postMessage({
            type: 'task_complete',
            taskId: message.taskId,
            result
          });
          
          // Send metrics update
          parentPort.postMessage({
            type: 'metrics',
            metrics: {
              transfersAnalyzed: result.metrics.transfersAnalyzed
            }
          });
          break;
          
        case 'shutdown':
          logger.info(`Worker ${worker.workerId} shutting down`);
          process.exit(0);
          break;
          
        default:
          logger.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      parentPort.postMessage({
        type: 'task_error',
        taskId: message.taskId,
        error: error.message
      });
    }
  });
}

export { AddressProcessorWorker };