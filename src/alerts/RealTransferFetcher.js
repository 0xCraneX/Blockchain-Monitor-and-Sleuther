const SubscanClient = require('../api/SubscanClient');
const FileStorage = require('../storage/FileStorage');
const { monitorLogger } = require('../utils/simple-logger');

class RealTransferFetcher {
  constructor(config = {}) {
    this.config = {
      lookbackHours: config.lookbackHours || 720, // 30 days = 720 hours
      minTransferAmount: config.minTransferAmount || 10000, // 10k DOT minimum
      batchSize: config.batchSize || 10, // Process accounts in batches
      ...config
    };
    
    this.api = new SubscanClient(config.subscanApiKey);
    this.storage = new FileStorage(config.dataPath || './data');
    this.processedTransfers = new Set(); // Track processed transfer hashes
  }

  async fetchRecentTransfers(accounts) {
    monitorLogger.section('Fetching Real Blockchain Transfers');
    const allAlerts = [];
    const cutoffTime = Date.now() - (this.config.lookbackHours * 60 * 60 * 1000);
    
    // Process accounts in batches to avoid rate limits
    for (let i = 0; i < accounts.length; i += this.config.batchSize) {
      const batch = accounts.slice(i, i + this.config.batchSize);
      monitorLogger.info(`Processing batch ${Math.floor(i/this.config.batchSize) + 1}/${Math.ceil(accounts.length/this.config.batchSize)}`);
      
      const batchPromises = batch.map(account => this.fetchAccountTransfers(account, cutoffTime));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          allAlerts.push(...result.value);
        } else if (result.status === 'rejected') {
          monitorLogger.warn(`Failed to fetch transfers for ${batch[idx].address.slice(0,8)}...`, {
            error: result.reason.message
          });
        }
      });
      
      // Rate limit between batches
      if (i + this.config.batchSize < accounts.length) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      }
    }
    
    return allAlerts;
  }

  async fetchAccountTransfers(account, cutoffTime) {
    try {
      const transfers = await this.api.getAccountTransfers(account.address, 100);
      const alerts = [];
      
      for (const transfer of transfers) {
        // Skip if already processed
        const transferId = `${transfer.hash}_${transfer.event_idx}`;
        if (this.processedTransfers.has(transferId)) continue;
        
        // Parse transfer data
        const timestamp = transfer.block_timestamp * 1000;
        if (timestamp < cutoffTime) break; // Transfers are ordered newest first
        
        const amount = parseFloat(transfer.amount || 0);
        if (amount < this.config.minTransferAmount) continue;
        
        // Determine transfer type and create alert
        const alert = this.createTransferAlert(transfer, account);
        if (alert) {
          alerts.push(alert);
          this.processedTransfers.add(transferId);
        }
      }
      
      return alerts;
    } catch (error) {
      monitorLogger.error(`Failed to fetch transfers for ${account.address}`, error);
      return [];
    }
  }

  createTransferAlert(transfer, account) {
    const amount = parseFloat(transfer.amount || 0);
    const timestamp = new Date(transfer.block_timestamp * 1000);
    
    // Determine alert type based on transfer characteristics
    let alertType, severity, title, description;
    
    // Check if this is a large transfer
    if (amount > 100000) {
      alertType = 'large_transfer';
      severity = 'high';
      title = 'Large Transfer Detected';
      description = `${amount.toLocaleString()} DOT transferred`;
      
      // Check if it's from/to an exchange
      if (account.accountType === 'exchange') {
        description += ` ${transfer.from === account.address ? 'from' : 'to'} ${account.identity || 'Exchange'}`;
      }
    } 
    // Check for exchange activity
    else if (account.accountType === 'exchange' && amount > this.config.minTransferAmount) {
      alertType = 'exchange_activity';
      severity = 'low';
      title = 'Exchange Activity';
      description = `${amount.toLocaleString()} DOT ${transfer.to === account.address ? 'deposited to' : 'withdrawn from'} ${account.identity || 'Exchange'}`;
    }
    // Regular whale movement
    else if (amount > 50000) {
      alertType = 'whale_movement';
      severity = 'medium';
      title = 'Whale Movement';
      description = `${account.identity || 'Whale'} moved ${amount.toLocaleString()} DOT`;
    } else {
      return null; // Skip smaller transfers
    }
    
    return {
      id: `real_${transfer.hash}_${transfer.event_idx}`,
      type: alertType,
      pattern: alertType,
      severity,
      title,
      description,
      message: `Real blockchain transfer detected`,
      timestamp: timestamp.toISOString(),
      address: account.address,
      amount: Math.floor(amount),
      metadata: {
        hash: transfer.hash,
        block: transfer.block_num,
        from: transfer.from,
        to: transfer.to,
        success: transfer.success,
        module: transfer.module,
        eventId: `${transfer.block_num}-${transfer.event_idx}`
      }
    };
  }

  // Load previously processed transfers to avoid duplicates
  async loadProcessedTransfers() {
    try {
      const processed = await this.storage.loadProcessedTransfers();
      if (processed && processed.transfers) {
        this.processedTransfers = new Set(processed.transfers);
        monitorLogger.info(`Loaded ${this.processedTransfers.size} previously processed transfers`);
      }
    } catch (error) {
      monitorLogger.warn('No processed transfers history found, starting fresh');
    }
  }

  // Save processed transfers for persistence
  async saveProcessedTransfers() {
    try {
      // Keep only recent transfers to prevent set from growing too large
      const recentTransfers = Array.from(this.processedTransfers).slice(-10000);
      await this.storage.saveProcessedTransfers({ 
        transfers: recentTransfers,
        lastUpdate: new Date().toISOString()
      });
    } catch (error) {
      monitorLogger.error('Failed to save processed transfers', error);
    }
  }
}

module.exports = RealTransferFetcher;