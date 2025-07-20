const AlertManager = require('./src/alerts/AlertManager');
const FileStorage = require('./src/storage/FileStorage');
const { mainLogger } = require('./src/utils/simple-logger');

// Create mock alerts
function createMockAlerts() {
  return [
    {
      severity: 'CRITICAL',
      type: 'DORMANT_AWAKENING',
      message: 'Dormant whale awakens after 365 days!',
      address: '1FRMM8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
      amount: 1500000,
      daysDormant: 365,
      timestamp: new Date().toISOString()
    },
    {
      severity: 'CRITICAL',
      type: 'LARGE_MOVEMENT',
      message: 'Large outgoing transfer detected',
      address: '14ShUZUYUSPFLBBaKipQKbEoPEfPPaKBEta721NdXP721N',
      amount: 2500000,
      direction: 'outgoing',
      percentChange: 75.5,
      timestamp: new Date().toISOString()
    },
    {
      severity: 'IMPORTANT',
      type: 'COORDINATION_DETECTED',
      message: '5 whales moved within 60 minutes',
      whaleCount: 5,
      totalVolume: 8500000,
      timestamp: new Date().toISOString()
    },
    {
      severity: 'IMPORTANT',
      type: 'UNBONDING_DETECTED',
      message: 'Potential unbonding detected',
      address: '15cfSaBcTxNr8rV59cbhdMNCRagFr3GE6B3zZRsCp4QHHKPu',
      amount: 750000,
      unbondingCompleteDate: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
      timestamp: new Date().toISOString()
    },
    {
      severity: 'NOTABLE',
      type: 'NEW_WHALE',
      message: 'New whale entered top 1000',
      address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa1A1zP1eP5QGe',
      amount: 500000,
      rank: 847,
      timestamp: new Date().toISOString()
    },
    {
      severity: 'NOTABLE',
      type: 'RAPID_DRAINING',
      message: 'Account draining detected',
      address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN21BvBMSEYstWe',
      amount: 125000,
      percentChange: 45.2,
      timestamp: new Date().toISOString()
    }
  ];
}

async function testAlertManager() {
  mainLogger.section('Testing Alert Manager');
  
  // Initialize components
  const storage = new FileStorage('./test-data');
  const alertManager = new AlertManager(storage);
  
  try {
    // Test 1: Process and display alerts
    mainLogger.section('Test 1: Process Multiple Alerts');
    const mockAlerts = createMockAlerts();
    await alertManager.processAlerts(mockAlerts);
    
    // Test 2: Get alerts by severity
    mainLogger.section('Test 2: Query Alerts by Severity');
    const criticalAlerts = alertManager.getAlertsBySeverity('CRITICAL');
    mainLogger.info(`Found ${criticalAlerts.length} critical alerts`);
    
    const importantAlerts = alertManager.getAlertsBySeverity('IMPORTANT');
    mainLogger.info(`Found ${importantAlerts.length} important alerts`);
    
    const notableAlerts = alertManager.getAlertsBySeverity('NOTABLE');
    mainLogger.info(`Found ${notableAlerts.length} notable alerts`);
    
    // Test 3: Get alerts by type
    mainLogger.section('Test 3: Query Alerts by Type');
    const movementAlerts = alertManager.getAlertsByType('LARGE_MOVEMENT');
    mainLogger.info(`Found ${movementAlerts.length} movement alerts`);
    
    // Test 4: Get recent alerts
    mainLogger.section('Test 4: Get Recent Alerts');
    const recentAlerts = alertManager.getRecentAlerts(5); // Last 5 minutes
    mainLogger.info(`Found ${recentAlerts.length} alerts in the last 5 minutes`);
    
    // Test 5: Display statistics
    mainLogger.section('Test 5: Alert Statistics');
    const stats = alertManager.getStats();
    mainLogger.info('Alert statistics:', stats);
    
    // Test 6: Test with no alerts
    mainLogger.section('Test 6: Empty Alert List');
    await alertManager.processAlerts([]);
    
    // Test 7: Test critical alert notification
    mainLogger.section('Test 7: Critical Alert Special Handling');
    const criticalOnly = mockAlerts.filter(a => a.severity === 'CRITICAL');
    await alertManager.processAlerts(criticalOnly);
    
    mainLogger.success('All alert manager tests completed successfully! ✅');
    
    // Cleanup test data
    const fs = require('fs');
    if (fs.existsSync('./test-data')) {
      fs.rmSync('./test-data', { recursive: true, force: true });
      mainLogger.info('Test data cleaned up');
    }
    
  } catch (error) {
    mainLogger.error('Alert manager test failed', error);
    process.exit(1);
  }
}

// Run the test
testAlertManager().catch(error => {
  mainLogger.error('Uncaught error in test', error);
  process.exit(1);
});