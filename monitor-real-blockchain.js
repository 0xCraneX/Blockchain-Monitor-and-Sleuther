#!/usr/bin/env node

const SubscanClient = require('./src/api/SubscanClient');
const FileStorage = require('./src/storage/FileStorage');
const AlertManager = require('./src/alerts/AlertManager');
const RealTransferFetcher = require('./src/alerts/RealTransferFetcher');
const BalanceChangeMonitor = require('./src/alerts/BalanceChangeMonitor');
const RealtimeMonitor = require('./src/monitor/RealtimeMonitor');
const { monitorLogger } = require('./src/utils/simple-logger');

require('dotenv').config();

class RealBlockchainMonitor {
  constructor() {
    this.config = {
      subscanApiKey: process.env.SUBSCAN_API_KEY || '',
      dataPath: './data',
      topAccounts: 100,
      checkInterval: 5 * 60 * 1000, // 5 minutes
      enableRealtime: process.env.ENABLE_REALTIME !== 'false'
    };
    
    // Initialize components
    this.api = new SubscanClient(this.config.subscanApiKey);
    this.storage = new FileStorage(this.config.dataPath);
    this.alertManager = new AlertManager(this.storage);
    
    this.transferFetcher = new RealTransferFetcher({
      subscanApiKey: this.config.subscanApiKey,
      dataPath: this.config.dataPath,
      lookbackHours: 24,
      minTransferAmount: 10000
    });
    
    this.balanceMonitor = new BalanceChangeMonitor({
      minChangeAmount: 1000,
      minChangePercent: 0.01
    });
    
    if (this.config.enableRealtime) {
      this.realtimeMonitor = new RealtimeMonitor({
        wsEndpoint: process.env.WS_ENDPOINT || 'wss://rpc.polkadot.io',
        minTransferAmount: 10000,
        onAlert: (alert) => this.handleRealtimeAlert(alert)
      });
    }
    
    this.isRunning = false;
  }

  async handleRealtimeAlert(alert) {
    monitorLogger.info('Real-time alert received', {
      type: alert.type,
      address: alert.address.slice(0, 8) + '...',
      amount: alert.amount
    });
    
    // Process and save the alert
    await this.alertManager.processAlerts([alert]);
  }

  async fetchCurrentAccounts() {
    try {
      monitorLogger.section('Fetching Current Top Accounts');
      const accounts = await this.api.getAllTopAccounts(this.config.topAccounts);
      
      monitorLogger.success(`Fetched ${accounts.length} accounts`);
      
      // Save as current snapshot
      await this.storage.saveSnapshot(accounts);
      
      return accounts;
    } catch (error) {
      monitorLogger.error('Failed to fetch accounts', error);
      throw error;
    }
  }

  async runMonitoringCycle() {
    monitorLogger.section('Starting Real Blockchain Monitoring Cycle');
    const startTime = Date.now();
    const allAlerts = [];
    
    try {
      // 1. Fetch current account data
      const currentAccounts = await this.fetchCurrentAccounts();
      
      // 2. Load previous snapshot for comparison
      const previousSnapshot = await this.storage.loadPreviousSnapshot();
      
      if (previousSnapshot) {
        // 3. Detect balance changes
        monitorLogger.section('Detecting Balance Changes');
        const currentSnapshot = {
          timestamp: new Date().toISOString(),
          count: currentAccounts.length,
          totalBalance: currentAccounts.reduce((sum, acc) => sum + acc.balanceFloat, 0),
          accounts: currentAccounts
        };
        
        const balanceAlerts = await this.balanceMonitor.detectBalanceChanges(
          currentSnapshot,
          previousSnapshot
        );
        
        if (balanceAlerts.length > 0) {
          monitorLogger.info(`Found ${balanceAlerts.length} balance change alerts`);
          allAlerts.push(...balanceAlerts);
        }
      }
      
      // 4. Fetch real transfers
      monitorLogger.section('Fetching Real Blockchain Transfers');
      await this.transferFetcher.loadProcessedTransfers();
      const transferAlerts = await this.transferFetcher.fetchRecentTransfers(currentAccounts);
      
      if (transferAlerts.length > 0) {
        monitorLogger.info(`Found ${transferAlerts.length} transfer alerts`);
        allAlerts.push(...transferAlerts);
      }
      
      await this.transferFetcher.saveProcessedTransfers();
      
      // 5. Process all alerts
      if (allAlerts.length > 0) {
        monitorLogger.section('Processing Real Blockchain Alerts');
        await this.alertManager.processAlerts(allAlerts);
        
        // Log summary
        const criticalCount = allAlerts.filter(a => a.severity === 'critical').length;
        const highCount = allAlerts.filter(a => a.severity === 'high').length;
        
        monitorLogger.success(`Processed ${allAlerts.length} real alerts`, {
          critical: criticalCount,
          high: highCount,
          medium: allAlerts.length - criticalCount - highCount
        });
      } else {
        monitorLogger.info('No significant blockchain activity detected');
      }
      
      // 6. Log cycle completion
      const duration = Date.now() - startTime;
      monitorLogger.success(`Monitoring cycle completed in ${duration}ms`);
      
      return allAlerts;
      
    } catch (error) {
      monitorLogger.error('Monitoring cycle failed', error);
      throw error;
    }
  }

  async startRealTimeMonitoring(accounts) {
    if (!this.realtimeMonitor || !this.config.enableRealtime) {
      monitorLogger.info('Real-time monitoring is disabled');
      return;
    }
    
    try {
      // Only watch top 20 accounts to avoid overwhelming the RPC
      const topAccounts = accounts.slice(0, 20);
      await this.realtimeMonitor.watchAccounts(topAccounts);
      
      monitorLogger.success('Real-time monitoring active for top 20 accounts');
    } catch (error) {
      monitorLogger.error('Failed to start real-time monitoring', error);
      // Continue with periodic monitoring even if real-time fails
    }
  }

  async start() {
    if (this.isRunning) {
      monitorLogger.warn('Monitor is already running');
      return;
    }
    
    this.isRunning = true;
    monitorLogger.section('Starting Real Blockchain Monitor');
    
    try {
      // Run initial cycle
      const accounts = await this.fetchCurrentAccounts();
      await this.runMonitoringCycle();
      
      // Start real-time monitoring if enabled
      await this.startRealTimeMonitoring(accounts);
      
      // Set up periodic monitoring
      this.intervalId = setInterval(async () => {
        try {
          await this.runMonitoringCycle();
        } catch (error) {
          monitorLogger.error('Periodic monitoring cycle failed', error);
        }
      }, this.config.checkInterval);
      
      monitorLogger.success('Real blockchain monitoring started', {
        checkInterval: `${this.config.checkInterval / 60000} minutes`,
        realtimeEnabled: this.config.enableRealtime,
        topAccounts: this.config.topAccounts
      });
      
    } catch (error) {
      monitorLogger.error('Failed to start monitor', error);
      this.stop();
      throw error;
    }
  }

  async stop() {
    monitorLogger.info('Stopping real blockchain monitor...');
    
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    if (this.realtimeMonitor) {
      await this.realtimeMonitor.disconnect();
    }
    
    monitorLogger.success('Monitor stopped');
  }
}

// Handle process termination
async function handleShutdown(monitor) {
  console.log('\n🛑 Shutting down monitor...');
  await monitor.stop();
  process.exit(0);
}

// Main execution
async function main() {
  const monitor = new RealBlockchainMonitor();
  
  // Set up graceful shutdown
  process.on('SIGINT', () => handleShutdown(monitor));
  process.on('SIGTERM', () => handleShutdown(monitor));
  
  try {
    await monitor.start();
    
    // Keep the process alive
    process.stdin.resume();
    
  } catch (error) {
    console.error('❌ Failed to start monitor:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = RealBlockchainMonitor;