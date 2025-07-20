const PatternDetector = require('../patterns/PatternDetector');
const { mainLogger } = require('../utils/simple-logger');

// Create mock snapshots with various patterns
function createMockSnapshots() {
  const baseTime = Date.now();
  
  const previousSnapshot = {
    timestamp: new Date(baseTime - 3600000).toISOString(), // 1 hour ago
    count: 5,
    totalBalance: 5000000,
    accounts: [
      // Dormant whale (200 days inactive)
      {
        address: '1DORMANT8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
        balance: '20000000000000000',
        balanceFloat: 2000000,
        identity: 'Dormant Whale',
        lastActive: new Date(baseTime - 200 * 24 * 60 * 60 * 1000).toISOString()
      },
      // Active trader
      {
        address: '2ACTIVE8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
        balance: '15000000000000000',
        balanceFloat: 1500000,
        identity: 'Active Trader',
        lastActive: new Date(baseTime - 3600000).toISOString()
      },
      // Whale for unbonding test
      {
        address: '3UNBOND8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
        balance: '10000000000000000',
        balanceFloat: 1000000,
        identity: 'Unbonding Whale',
        lastActive: new Date(baseTime - 86400000).toISOString()
      },
      // Stable holder
      {
        address: '4STABLE8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
        balance: '5000000000000000',
        balanceFloat: 500000,
        identity: 'Stable Holder',
        lastActive: new Date(baseTime - 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      // Account that will exit top list
      {
        address: '5EXIT8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
        balance: '100000000000000',
        balanceFloat: 10000,
        identity: 'Exiting Whale',
        lastActive: new Date(baseTime - 86400000).toISOString()
      }
    ]
  };
  
  const currentSnapshot = {
    timestamp: new Date(baseTime).toISOString(),
    count: 5,
    totalBalance: 5500000,
    accounts: [
      // Dormant whale awakens (moves funds)
      {
        address: '1DORMANT8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
        balance: '18000000000000000',
        balanceFloat: 1800000, // Lost 200k DOT
        identity: 'Dormant Whale',
        lastActive: new Date(baseTime).toISOString() // Now active!
      },
      // Active trader makes large movement
      {
        address: '2ACTIVE8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
        balance: '25000000000000000',
        balanceFloat: 2500000, // Gained 1M DOT
        identity: 'Active Trader',
        lastActive: new Date(baseTime).toISOString()
      },
      // Unbonding detected
      {
        address: '3UNBOND8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
        balance: '2000000000000000',
        balanceFloat: 200000, // Lost 800k DOT (unbonding)
        identity: 'Unbonding Whale',
        lastActive: new Date(baseTime).toISOString()
      },
      // Stable holder (coordinated movement)
      {
        address: '4STABLE8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
        balance: '3000000000000000',
        balanceFloat: 300000, // Lost 200k DOT
        identity: 'Stable Holder',
        lastActive: new Date(baseTime).toISOString()
      },
      // New whale enters
      {
        address: '6NEWWHALE8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
        balance: '7000000000000000',
        balanceFloat: 700000, // New entry
        identity: 'New Whale',
        lastActive: new Date(baseTime).toISOString()
      }
    ]
  };
  
  return { previousSnapshot, currentSnapshot };
}

async function testPatternDetection() {
  mainLogger.section('Testing Pattern Detection System');
  
  const detector = new PatternDetector();
  const { previousSnapshot, currentSnapshot } = createMockSnapshots();
  
  try {
    // Test individual patterns
    mainLogger.section('Test 1: Dormant Awakening Detection');
    const dormantAlerts = detector.detectDormantAwakening(currentSnapshot, previousSnapshot);
    mainLogger.info(`Found ${dormantAlerts.length} dormant awakenings`);
    dormantAlerts.forEach(alert => {
      mainLogger.alert(alert.severity, alert.type, alert.message, {
        address: alert.address,
        amount: alert.amount,
        extra: `Last active: ${alert.daysDormant} days ago`
      });
    });
    
    mainLogger.section('Test 2: Large Movement Detection');
    const movementAlerts = detector.detectLargeMovements(currentSnapshot, previousSnapshot);
    mainLogger.info(`Found ${movementAlerts.length} large movements`);
    movementAlerts.forEach(alert => {
      mainLogger.alert(alert.severity, alert.type, alert.message, {
        address: alert.address,
        amount: alert.amount
      });
    });
    
    mainLogger.section('Test 3: Unbonding Detection');
    const unbondingAlerts = detector.detectUnbonding(currentSnapshot, previousSnapshot);
    mainLogger.info(`Found ${unbondingAlerts.length} unbonding activities`);
    unbondingAlerts.forEach(alert => {
      mainLogger.alert(alert.severity, alert.type, alert.message, {
        address: alert.address,
        amount: alert.amount,
        extra: `Unbonding completes: ${new Date(alert.unbondingCompleteDate).toLocaleDateString()}`
      });
    });
    
    mainLogger.section('Test 4: New Whale Detection');
    const whaleAlerts = detector.detectNewWhales(currentSnapshot, previousSnapshot);
    mainLogger.info(`Found ${whaleAlerts.length} whale changes`);
    whaleAlerts.forEach(alert => {
      mainLogger.alert(alert.severity, alert.type, alert.message, {
        address: alert.address,
        amount: alert.amount
      });
    });
    
    mainLogger.section('Test 5: Coordination Detection');
    const coordinationAlerts = detector.detectCoordination(currentSnapshot, previousSnapshot);
    mainLogger.info(`Found ${coordinationAlerts.length} coordination patterns`);
    coordinationAlerts.forEach(alert => {
      mainLogger.alert(alert.severity, alert.type, alert.message, {
        extra: `${alert.whaleCount} whales moved ${alert.totalVolume.toFixed(2)} DOT`
      });
    });
    
    mainLogger.section('Test 6: Flow Pattern Detection');
    const flowAlerts = detector.detectFlowPatterns(currentSnapshot, previousSnapshot);
    mainLogger.info(`Found ${flowAlerts.length} flow patterns`);
    flowAlerts.forEach(alert => {
      mainLogger.alert(alert.severity, alert.type, alert.message, {
        address: alert.address,
        amount: alert.amount
      });
    });
    
    // Test all patterns at once
    mainLogger.section('Test 7: Detect All Patterns');
    const allAlerts = await detector.detectAllPatterns(currentSnapshot, previousSnapshot);
    
    mainLogger.table(
      allAlerts.map(a => ({
        severity: a.severity,
        type: a.type,
        address: a.address ? a.address.slice(0, 8) + '...' : 'Multiple',
        amount: a.amount ? `${a.amount.toFixed(2)} DOT` : a.totalVolume ? `${a.totalVolume.toFixed(2)} DOT` : 'N/A'
      })),
      'All Detected Patterns Summary'
    );
    
    mainLogger.success('All pattern detection tests completed successfully! ✅');
    
    // Display summary statistics
    const stats = {
      'Total Alerts': allAlerts.length,
      'Critical': allAlerts.filter(a => a.severity === 'CRITICAL').length,
      'Important': allAlerts.filter(a => a.severity === 'IMPORTANT').length,
      'Notable': allAlerts.filter(a => a.severity === 'NOTABLE').length
    };
    
    mainLogger.table([stats], 'Detection Statistics');
    
  } catch (error) {
    mainLogger.error('Pattern detection test failed', error);
    process.exit(1);
  }
}

// Run the test
testPatternDetection().catch(error => {
  mainLogger.error('Uncaught error in test', error);
  process.exit(1);
});