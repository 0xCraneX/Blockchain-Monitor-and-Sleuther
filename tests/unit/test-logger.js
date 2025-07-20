// Test the logger utility
const { mainLogger, apiLogger, alertLogger } = require('../utils/simple-logger');

console.log('🧪 Testing Logger Utility...\n');

// Test main logger
mainLogger.section('Testing Main Logger');
mainLogger.info('This is an info message');
mainLogger.success('This is a success message');
mainLogger.warn('This is a warning message');
mainLogger.error('This is an error message', new Error('Test error'));
mainLogger.debug('This is a debug message (only visible with --debug flag)');

// Test progress bar
console.log('\nTesting progress bar:');
for (let i = 0; i <= 10; i++) {
  mainLogger.progress(i, 10, `Processing ${i}/10`);
  // Simulate work
  for (let j = 0; j < 10000000; j++) {}
}

// Test table
mainLogger.table([
  { address: '1ABC...XYZ', balance: 1000000, change: '+5.2%' },
  { address: '2DEF...UVW', balance: 500000, change: '-2.1%' },
  { address: '3GHI...RST', balance: 2000000, change: '+12.5%' }
], 'Top Whale Movements');

// Test alerts
alertLogger.section('Testing Alert System');
alertLogger.alert('CRITICAL', 'DORMANT_AWAKENING', 'Dormant whale awakens after 423 days!', {
  address: '1FRMM8PEEpiSnzr7eaAXWJfAYV8G2jhMmfgvNj8dyV24fg',
  amount: 1500000,
  extra: 'Last active: 2023-01-15'
});

alertLogger.alert('IMPORTANT', 'LARGE_MOVEMENT', 'Large transfer detected', {
  address: '14ShUZUYUSPFLBBaKipQKbEoPEfPPaKBEta721NdXP721N',
  amount: 250000
});

alertLogger.alert('NOTABLE', 'NEW_WHALE', 'New whale entered top 1000', {
  address: '15cfSaBcTxNr8rV59cbhdMNCRagFr3GE6B3zZRsCp4QHHKPu',
  amount: 75000
});

// Test API logger
apiLogger.section('Testing API Logger');
apiLogger.info('Making API request to Subscan...', {
  endpoint: '/api/scan/accounts/top',
  params: { limit: 1000 }
});
apiLogger.success('API request successful', {
  responseTime: '234ms',
  resultCount: 1000
});

console.log('\n✅ Logger test complete! Check logs/ directory for log files.\n');