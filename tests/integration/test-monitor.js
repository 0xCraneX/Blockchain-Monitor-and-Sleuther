const WhaleMonitor = require('./src/monitor');
const { mainLogger } = require('./src/utils/simple-logger');

async function testMonitor() {
  mainLogger.section('Testing Whale Monitor - Demo Mode');
  
  // Create monitor with demo config
  const monitor = new WhaleMonitor({
    demoMode: true,
    topAccountsLimit: 5, // Small for demo
    checkInterval: 5 * 60 * 1000 // 5 minutes
  });
  
  try {
    // Run demo scenarios
    await monitor.runDemo();
    
    mainLogger.section('Monitor Statistics');
    const stats = monitor.getStats();
    mainLogger.info('Final statistics:', stats);
    
    mainLogger.success('Monitor test completed successfully! ✅');
    
  } catch (error) {
    mainLogger.error('Monitor test failed', error);
    process.exit(1);
  }
}

// Run the test
testMonitor().catch(error => {
  mainLogger.error('Uncaught error in test', error);
  process.exit(1);
});