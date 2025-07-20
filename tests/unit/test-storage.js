const FileStorage = require('../storage/FileStorage');
const { mainLogger } = require('../utils/simple-logger');

// Mock account data
const mockAccounts = [
  {
    address: '1FRMM8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
    balance: '15000000000000000',
    balanceFloat: 1500000,
    identity: 'Test Whale 1',
    lastActive: new Date().toISOString()
  },
  {
    address: '14ShUZUYUSPFLBBaKipQKbEoPEfPPaKBEta721NdXP721N',
    balance: '9500000000000000',
    balanceFloat: 950000,
    identity: 'Test Whale 2',
    lastActive: new Date(Date.now() - 86400000).toISOString() // 1 day ago
  },
  {
    address: '15cfSaBcTxNr8rV59cbhdMNCRagFr3GE6B3zZRsCp4QHHKPu',
    balance: '7200000000000000',
    balanceFloat: 720000,
    identity: null,
    lastActive: new Date(Date.now() - 86400000 * 35).toISOString() // 35 days ago
  }
];

async function testFileStorage() {
  mainLogger.section('Testing FileStorage System');
  
  const storage = new FileStorage();
  
  try {
    // Test 1: Save snapshot
    mainLogger.section('Test 1: Save Snapshot');
    
    await storage.saveSnapshot(mockAccounts);
    mainLogger.success('First snapshot saved');
    
    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Save another snapshot to test rotation
    const updatedAccounts = mockAccounts.map(acc => ({
      ...acc,
      balanceFloat: acc.balanceFloat * 1.05 // 5% increase
    }));
    
    await storage.saveSnapshot(updatedAccounts);
    mainLogger.success('Second snapshot saved (should rotate first to previous)');
    
    // Test 2: Load snapshots
    mainLogger.section('Test 2: Load Snapshots');
    
    const current = await storage.loadCurrentSnapshot();
    mainLogger.info('Current snapshot loaded', {
      timestamp: current.timestamp,
      accountCount: current.count,
      totalBalance: `${current.totalBalance.toFixed(2)} DOT`
    });
    
    const previous = await storage.loadPreviousSnapshot();
    mainLogger.info('Previous snapshot loaded', {
      timestamp: previous.timestamp,
      accountCount: previous.count,
      totalBalance: `${previous.totalBalance.toFixed(2)} DOT`
    });
    
    // Calculate balance change
    const balanceChange = ((current.totalBalance - previous.totalBalance) / previous.totalBalance * 100).toFixed(2);
    mainLogger.info(`Total balance change: ${balanceChange}%`);
    
    // Test 3: Save alerts
    mainLogger.section('Test 3: Save Alerts');
    
    const alerts = [
      {
        severity: 'CRITICAL',
        type: 'DORMANT_AWAKENING',
        message: 'Dormant whale awakens after 35 days',
        address: mockAccounts[2].address,
        amount: 50000
      },
      {
        severity: 'IMPORTANT',
        type: 'LARGE_MOVEMENT',
        message: 'Large transfer detected',
        address: mockAccounts[0].address,
        amount: 100000
      },
      {
        severity: 'NOTABLE',
        type: 'NEW_WHALE',
        message: 'New address entered top 1000',
        address: '1NewWhaleAddressXXXXXXXXXXXXXXXXXXXXXXXXXX',
        amount: 600000
      }
    ];
    
    for (const alert of alerts) {
      await storage.saveAlert(alert);
      mainLogger.debug(`Saved ${alert.severity} alert`);
    }
    
    mainLogger.success(`Saved ${alerts.length} alerts`);
    
    // Test 4: Load alerts
    mainLogger.section('Test 4: Load Alerts');
    
    const loadedAlerts = await storage.loadAlerts();
    mainLogger.info(`Loaded ${loadedAlerts.length} alerts for today`);
    
    mainLogger.table(
      loadedAlerts.map(a => ({
        severity: a.severity,
        type: a.type,
        address: a.address ? a.address.slice(0, 8) + '...' : 'N/A'
      })),
      'Today\'s Alerts'
    );
    
    // Test 5: Storage statistics
    mainLogger.section('Test 5: Storage Statistics');
    
    const stats = storage.getStats();
    mainLogger.info('Storage statistics:', stats);
    
    mainLogger.table([{
      'Current Snapshot': stats.snapshots.current?.size || 'None',
      'Previous Snapshot': stats.snapshots.previous?.size || 'None',
      'Archives': stats.snapshots.archiveCount,
      'Today\'s Alerts': stats.alerts.todayCount,
      'Alert Files': stats.alerts.totalFiles
    }], 'Storage Summary');
    
    mainLogger.success('All storage tests completed successfully! ✅');
    
  } catch (error) {
    mainLogger.error('Storage test failed', error);
    process.exit(1);
  }
}

// Run the test
testFileStorage().catch(error => {
  mainLogger.error('Uncaught error in test', error);
  process.exit(1);
});