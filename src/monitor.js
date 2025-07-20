const SubscanClient = require('./api/SubscanClient');
const FileStorage = require('./storage/FileStorage');
const PatternDetector = require('./patterns/PatternDetector');
const AlertManager = require('./alerts/AlertManager');
const { monitorLogger } = require('./utils/logger');
const UnknownAddressAnalyzer = require('./integration/analyze-unknown');

class WhaleMonitor {
  constructor(config = {}) {
    this.config = {
      topAccountsLimit: parseInt(process.env.TOP_ACCOUNTS_LIMIT || '1000'),
      checkInterval: parseInt(process.env.CHECK_INTERVAL_MINUTES || '60') * 60 * 1000,
      dataPath: process.env.DATA_PATH || './data',
      subscanApiKey: process.env.SUBSCAN_API_KEY || '',
      demoMode: process.env.DEMO_MODE === 'true',
      ...config
    };
    
    // Initialize components
    this.api = new SubscanClient(this.config.subscanApiKey);
    this.storage = new FileStorage(this.config.dataPath);
    this.detector = new PatternDetector();
    this.alertManager = new AlertManager(this.storage);
    
    monitorLogger.info('WhaleMonitor initialized', {
      topAccounts: this.config.topAccountsLimit,
      checkInterval: `${this.config.checkInterval / 60000} minutes`,
      dataPath: this.config.dataPath,
      demoMode: this.config.demoMode
    });
  }

  // Fetch current top accounts from API
  async fetchTopAccounts() {
    monitorLogger.section('Fetching Top Accounts');
    
    try {
      const startTime = Date.now();
      const accounts = await this.api.getAllTopAccounts(this.config.topAccountsLimit);
      const duration = Date.now() - startTime;
      
      monitorLogger.success(`Fetched ${accounts.length} accounts in ${duration}ms`);
      
      // Log summary statistics
      const totalBalance = accounts.reduce((sum, acc) => sum + acc.balanceFloat, 0);
      const avgBalance = totalBalance / accounts.length;
      
      monitorLogger.info('Account statistics', {
        count: accounts.length,
        totalBalance: `${totalBalance.toLocaleString()} DOT`,
        averageBalance: `${avgBalance.toLocaleString()} DOT`,
        topBalance: `${accounts[0]?.balanceFloat.toLocaleString()} DOT`,
        bottomBalance: `${accounts[accounts.length - 1]?.balanceFloat.toLocaleString()} DOT`
      });
      
      return accounts;
    } catch (error) {
      monitorLogger.error('Failed to fetch accounts', error);
      throw error;
    }
  }

  // Run one monitoring cycle
  async runCycle() {
    monitorLogger.section('Starting Monitoring Cycle');
    const cycleStart = Date.now();
    
    try {
      // Step 1: Fetch current accounts
      const currentAccounts = await this.fetchTopAccounts();
      
      // Step 2: Load previous snapshot
      monitorLogger.section('Loading Previous Data');
      const previousSnapshot = await this.storage.loadPreviousSnapshot();
      
      if (!previousSnapshot) {
        monitorLogger.warn('No previous snapshot found - this is the first run');
        // Save current as baseline
        await this.storage.saveSnapshot(currentAccounts);
        monitorLogger.success('Saved initial baseline snapshot');
        return { alerts: [], firstRun: true };
      }
      
      monitorLogger.info(`Previous snapshot from ${previousSnapshot.timestamp} with ${previousSnapshot.count} accounts`);
      
      // Step 3: Save current snapshot (rotates previous)
      monitorLogger.section('Saving Current Snapshot');
      await this.storage.saveSnapshot(currentAccounts);
      monitorLogger.success('Current snapshot saved');
      
      // Step 4: Run pattern detection
      monitorLogger.section('Running Pattern Detection');
      const currentSnapshot = {
        timestamp: new Date().toISOString(),
        count: currentAccounts.length,
        totalBalance: currentAccounts.reduce((sum, acc) => sum + acc.balanceFloat, 0),
        accounts: currentAccounts
      };
      
      const alerts = await this.detector.detectAllPatterns(currentSnapshot, previousSnapshot);
      
      // Step 5: Process alerts
      if (alerts.length > 0) {
        monitorLogger.section('Processing Alerts');
        await this.alertManager.processAlerts(alerts);
      } else {
        monitorLogger.success('No suspicious patterns detected');
      }
      
      // Step 6: Log cycle completion
      const cycleDuration = Date.now() - cycleStart;
      monitorLogger.success(`Monitoring cycle completed in ${cycleDuration}ms`, {
        alertsFound: alerts.length,
        criticalAlerts: alerts.filter(a => a.severity === 'CRITICAL').length
      });
      
      return { alerts, firstRun: false };
      
    } catch (error) {
      monitorLogger.error('Monitoring cycle failed', error);
      throw error;
    }
  }

  // Start continuous monitoring
  async startMonitoring() {
    monitorLogger.section('Starting Whale Monitor');
    
    // Run initial cycle
    monitorLogger.info('Running initial monitoring cycle...');
    const initialResult = await this.runCycle();
    
    if (initialResult.firstRun) {
      monitorLogger.info(`Waiting ${this.config.checkInterval / 60000} minutes before next check...`);
    }
    
    // Set up interval for continuous monitoring
    this.monitorInterval = setInterval(async () => {
      monitorLogger.section(`Scheduled Check - ${new Date().toLocaleString()}`);
      
      try {
        await this.runCycle();
      } catch (error) {
        monitorLogger.error('Scheduled monitoring cycle failed', error);
        // Continue monitoring despite errors
      }
      
    }, this.config.checkInterval);
    
    monitorLogger.success('Continuous monitoring started', {
      interval: `${this.config.checkInterval / 60000} minutes`,
      nextCheck: new Date(Date.now() + this.config.checkInterval).toLocaleString()
    });
  }

  // Stop monitoring
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      monitorLogger.info('Monitoring stopped');
    }
  }

  // Run demo with mock scenarios
  async runDemo() {
    monitorLogger.section('Running Demo Mode');
    
    // Create demo snapshots
    const demoSnapshots = this.createDemoSnapshots();
    
    for (let i = 0; i < demoSnapshots.length - 1; i++) {
      monitorLogger.section(`Demo Scenario ${i + 1}: ${demoSnapshots[i + 1].scenario}`);
      
      const previousSnapshot = demoSnapshots[i];
      const currentSnapshot = demoSnapshots[i + 1];
      
      // Save snapshots
      await this.storage.saveSnapshot(previousSnapshot.accounts);
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
      await this.storage.saveSnapshot(currentSnapshot.accounts);
      
      // Run detection
      const alerts = await this.detector.detectAllPatterns(currentSnapshot, previousSnapshot);
      
      // Process alerts
      if (alerts.length > 0) {
        await this.alertManager.processAlerts(alerts);
      } else {
        monitorLogger.info('No alerts for this scenario');
      }
      
      // Wait before next scenario
      if (i < demoSnapshots.length - 2) {
        monitorLogger.info('Next scenario in 3 seconds...\n');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    monitorLogger.success('Demo completed!');
  }

  // Create demo snapshots for testing
  createDemoSnapshots() {
    const baseTime = Date.now();
    
    return [
      // Initial state
      {
        scenario: 'Initial State',
        timestamp: new Date(baseTime - 3600000).toISOString(),
        count: 5,
        totalBalance: 10000000,
        accounts: [
          {
            address: '1DORMANT8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
            balance: '30000000000000000',
            balanceFloat: 3000000,
            identity: 'Dormant Whale',
            lastActive: new Date(baseTime - 365 * 24 * 60 * 60 * 1000).toISOString()
          },
          {
            address: '2ACTIVE8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
            balance: '25000000000000000',
            balanceFloat: 2500000,
            identity: 'Active Trader',
            lastActive: new Date(baseTime - 3600000).toISOString()
          },
          {
            address: '3STABLE8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
            balance: '20000000000000000',
            balanceFloat: 2000000,
            identity: 'Stable Holder',
            lastActive: new Date(baseTime - 86400000).toISOString()
          },
          {
            address: '4MEDIUM8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
            balance: '15000000000000000',
            balanceFloat: 1500000,
            identity: 'Medium Whale',
            lastActive: new Date(baseTime - 86400000).toISOString()
          },
          {
            address: '5SMALL8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
            balance: '10000000000000000',
            balanceFloat: 1000000,
            identity: 'Small Whale',
            lastActive: new Date(baseTime - 172800000).toISOString()
          }
        ]
      },
      // Scenario 1: Dormant whale awakens
      {
        scenario: 'Dormant Whale Awakens',
        timestamp: new Date(baseTime).toISOString(),
        count: 5,
        totalBalance: 9500000,
        accounts: [
          {
            address: '1DORMANT8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
            balance: '25000000000000000',
            balanceFloat: 2500000, // Lost 500k
            identity: 'Dormant Whale',
            lastActive: new Date(baseTime).toISOString() // Now active!
          },
          {
            address: '2ACTIVE8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
            balance: '25000000000000000',
            balanceFloat: 2500000,
            identity: 'Active Trader',
            lastActive: new Date(baseTime).toISOString()
          },
          {
            address: '3STABLE8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
            balance: '20000000000000000',
            balanceFloat: 2000000,
            identity: 'Stable Holder',
            lastActive: new Date(baseTime - 86400000).toISOString()
          },
          {
            address: '4MEDIUM8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
            balance: '15000000000000000',
            balanceFloat: 1500000,
            identity: 'Medium Whale',
            lastActive: new Date(baseTime - 86400000).toISOString()
          },
          {
            address: '5SMALL8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
            balance: '10000000000000000',
            balanceFloat: 1000000,
            identity: 'Small Whale',
            lastActive: new Date(baseTime - 172800000).toISOString()
          }
        ]
      },
      // Scenario 2: Coordinated movement
      {
        scenario: 'Coordinated Whale Movement',
        timestamp: new Date(baseTime + 3600000).toISOString(),
        count: 5,
        totalBalance: 9500000,
        accounts: [
          {
            address: '1DORMANT8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
            balance: '20000000000000000',
            balanceFloat: 2000000, // Lost another 500k
            identity: 'Dormant Whale',
            lastActive: new Date(baseTime + 3600000).toISOString()
          },
          {
            address: '2ACTIVE8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
            balance: '35000000000000000',
            balanceFloat: 3500000, // Gained 1M!
            identity: 'Active Trader',
            lastActive: new Date(baseTime + 3600000).toISOString()
          },
          {
            address: '3STABLE8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
            balance: '15000000000000000',
            balanceFloat: 1500000, // Lost 500k
            identity: 'Stable Holder',
            lastActive: new Date(baseTime + 3600000).toISOString()
          },
          {
            address: '4MEDIUM8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
            balance: '10000000000000000',
            balanceFloat: 1000000, // Lost 500k
            identity: 'Medium Whale',
            lastActive: new Date(baseTime + 3600000).toISOString()
          },
          {
            address: '5SMALL8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
            balance: '5000000000000000',
            balanceFloat: 500000, // Lost 500k
            identity: 'Small Whale',
            lastActive: new Date(baseTime + 3600000).toISOString()
          }
        ]
      }
    ];
  }

  // Get monitoring statistics
  getStats() {
    return {
      alertStats: this.alertManager.getStats(),
      storageStats: this.storage.getStats(),
      isMonitoring: !!this.monitorInterval
    };
  }
}

module.exports = WhaleMonitor;