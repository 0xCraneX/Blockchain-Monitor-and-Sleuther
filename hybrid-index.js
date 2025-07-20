#!/usr/bin/env node

/**
 * Hybrid-Enabled Whale Monitor Entry Point
 * Safe production integration with instant rollback capability
 */

const HybridProductionBridge = require('./src/integration/HybridProductionBridge');
const { getFeatureFlags } = require('./src/integration/FeatureFlags');
const { mainLogger } = require('./src/utils/logger');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env file if it exists
const dotenvPath = path.join(__dirname, '.env');
if (fs.existsSync(dotenvPath)) {
  require('dotenv').config({ path: dotenvPath });
  mainLogger.info('Loaded environment variables from .env');
}

// Enhanced ASCII art banner
const banner = `
██████╗  ██████╗ ██╗     ██╗  ██╗ █████╗ ██████╗  ██████╗ ████████╗
██╔══██╗██╔═══██╗██║     ██║ ██╔╝██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝
██████╔╝██║   ██║██║     █████╔╝ ███████║██║  ██║██║   ██║   ██║   
██╔═══╝ ██║   ██║██║     ██╔═██╗ ██╔══██║██║  ██║██║   ██║   ██║   
██║     ╚██████╔╝███████╗██║  ██╗██║  ██║██████╔╝╚██████╔╝   ██║   
╚═╝      ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝  ╚═════╝    ╚═╝   
                    🐋 Hybrid Whale Monitor v2.0 🐋
                         ⚡ RPC + Subscan ⚡
`;

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

// Show help
function showHelp() {
  console.log(banner);
  console.log('Usage: node hybrid-index.js [command] [options]\n');
  console.log('Commands:');
  console.log('  start            Start hybrid monitoring (with safety controls)');
  console.log('  run              Run a single monitoring cycle');
  console.log('  demo             Run demo mode with sample scenarios');
  console.log('  stats            Show current statistics and metrics');
  console.log('  health           Show system health status');
  console.log('  flags            Show feature flag status');
  console.log('  rollback         Emergency rollback to legacy system');
  console.log('  help             Show this help message\n');
  console.log('Hybrid-Specific Commands:');
  console.log('  enable-parallel  Enable parallel mode for validation');
  console.log('  enable-hybrid    Enable hybrid system (gradual rollout)');
  console.log('  set-traffic <n>  Set hybrid traffic percentage (0-100)');
  console.log('  switch-legacy    Switch to legacy system');
  console.log('  switch-hybrid    Switch to hybrid system\n');
  console.log('Options:');
  console.log('  --interval <min> Set check interval in minutes (default: 60)');
  console.log('  --limit <num>    Set top accounts limit (default: 1000)');
  console.log('  --quiet          Suppress non-critical output');
  console.log('  --debug          Enable debug logging');
  console.log('  --force          Force operation (use with caution)\n');
  console.log('Environment Variables:');
  console.log('  SUBSCAN_API_KEY  Your Subscan API key');
  console.log('  CHECK_INTERVAL   Check interval in minutes');
  console.log('  TOP_ACCOUNTS     Number of top accounts to monitor');
  console.log('  DATA_PATH        Path to store data files');
  console.log('  POLKADOT_RPC_URL WebSocket RPC endpoint (for hybrid mode)\n');
  console.log('Safety Features:');
  console.log('  - Instant rollback capability via emergency command');
  console.log('  - Feature flags for safe gradual rollout');
  console.log('  - Parallel validation before traffic switching');
  console.log('  - Automated circuit breakers and error detection');
  console.log('  - Legacy system always available as fallback\n');
}

// Parse options
function parseOptions(args) {
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--interval' && args[i + 1]) {
      options.checkInterval = parseInt(args[i + 1]) * 60 * 1000;
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.topAccountsLimit = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--quiet') {
      options.quiet = true;
    } else if (args[i] === '--debug') {
      options.debug = true;
    } else if (args[i] === '--force') {
      options.force = true;
    }
  }
  
  return options;
}

// Global bridge instance
let bridge = null;

// Main function
async function main() {
  console.log(banner);
  
  // Parse options
  const options = parseOptions(args.slice(1));
  
  // Get feature flags
  const featureFlags = getFeatureFlags();
  
  try {
    switch (command) {
      case 'start':
        await startHybridMonitoring(options);
        break;
        
      case 'run':
        await runSingleCycle(options);
        break;
        
      case 'demo':
        await runDemo(options);
        break;
        
      case 'stats':
        await showStats();
        break;
        
      case 'health':
        await showHealth();
        break;
        
      case 'flags':
        showFeatureFlags();
        break;
        
      case 'rollback':
        await emergencyRollback(options);
        break;
        
      case 'enable-parallel':
        await enableParallelMode();
        break;
        
      case 'enable-hybrid':
        await enableHybridMode();
        break;
        
      case 'set-traffic':
        await setTrafficPercent(args[1], options);
        break;
        
      case 'switch-legacy':
        await switchToLegacy(options);
        break;
        
      case 'switch-hybrid':
        await switchToHybrid(options);
        break;
        
      case 'help':
      default:
        showHelp();
        break;
    }
    
  } catch (error) {
    mainLogger.error('Fatal error', error);
    
    // Attempt emergency rollback on critical errors
    if (bridge && !featureFlags.get('emergencyRollback')) {
      mainLogger.warn('Attempting emergency rollback due to fatal error...');
      try {
        await bridge.emergencyRollback('Fatal error occurred');
      } catch (rollbackError) {
        mainLogger.error('Emergency rollback also failed', rollbackError);
      }
    }
    
    process.exit(1);
  }
}

async function startHybridMonitoring(options) {
  mainLogger.section('Starting Hybrid Whale Monitor');
  
  // Create bridge configuration
  const bridgeConfig = {
    legacy: {
      topAccountsLimit: parseInt(process.env.TOP_ACCOUNTS_LIMIT || '1000'),
      checkInterval: parseInt(process.env.CHECK_INTERVAL_MINUTES || '60') * 60 * 1000,
      dataPath: process.env.DATA_PATH || './data',
      subscanApiKey: process.env.SUBSCAN_API_KEY || '',
      ...options
    },
    hybrid: {
      environment: 'production',
      rpc: {
        endpoints: [
          process.env.POLKADOT_RPC_URL || 'wss://rpc.polkadot.io',
          'wss://polkadot-rpc.dwellir.com',
          'wss://1rpc.io/dot'
        ]
      },
      monitoring: {
        topAccountsLimit: parseInt(process.env.TOP_ACCOUNTS_LIMIT || '1000'),
        enableRealTimeMode: true,
        enableHistoricalMode: false // Start conservative
      }
    }
  };
  
  // Create and start bridge
  bridge = new HybridProductionBridge(bridgeConfig);
  
  // Set up bridge event handlers
  setupBridgeEventHandlers(bridge);
  
  // Start the bridge
  await bridge.start();
  
  // Handle graceful shutdown
  setupGracefulShutdown(bridge);
  
  // Keep process alive
  process.stdin.resume();
  
  mainLogger.success('Hybrid monitoring started successfully');
  console.log('\\nHybrid Status:');
  console.log(`  Rollout Phase: ${bridge.featureFlags.get('rolloutPhase')}`);
  console.log(`  Hybrid Enabled: ${bridge.featureFlags.isHybridEnabled()}`);
  console.log(`  Parallel Mode: ${bridge.featureFlags.isParallelMode()}`);
  console.log(`  Traffic Split: ${bridge.featureFlags.getTrafficPercent()}% to hybrid`);
  console.log('\\nPress Ctrl+C to stop monitoring');
}

async function runSingleCycle(options) {
  mainLogger.section('Running Single Hybrid Monitoring Cycle');
  
  bridge = new HybridProductionBridge({
    legacy: { ...options },
    hybrid: { environment: 'test' }
  });
  
  await bridge.start();
  
  // Wait for one cycle to complete
  await new Promise(resolve => {
    bridge.once('alerts', (alerts) => {
      mainLogger.info(`Cycle complete: ${alerts.length} alerts found`);
      resolve();
    });
    
    // Timeout after 5 minutes
    setTimeout(resolve, 300000);
  });
  
  await bridge.stop();
}

async function runDemo(options) {
  mainLogger.section('Running Hybrid Demo Mode');
  
  // Enable demo features
  const featureFlags = getFeatureFlags();
  featureFlags.update({
    enableTestMode: true,
    enableDebugLogging: true
  });
  
  bridge = new HybridProductionBridge({
    legacy: { demoMode: true, ...options },
    hybrid: { environment: 'demo' }
  });
  
  await bridge.start();
  
  // Run demo scenarios
  if (bridge.legacyMonitor) {
    await bridge.legacyMonitor.runDemo();
  }
  
  await bridge.stop();
}

async function showStats() {
  mainLogger.section('Hybrid System Statistics');
  
  if (!bridge) {
    // Try to get stats from feature flags and existing data
    const featureFlags = getFeatureFlags();
    console.log('Feature Flags Status:');
    console.log(JSON.stringify(featureFlags.getRolloutStatus(), null, 2));
    return;
  }
  
  const metrics = bridge.getMetrics();
  
  console.log('\\n=== BRIDGE METRICS ===');
  console.log(`Uptime: ${Math.round(metrics.bridge.uptime / 1000)}s`);
  console.log(`Active System: ${metrics.bridge.activeSystem}`);
  console.log(`Validation Mode: ${metrics.bridge.validationMode}`);
  
  console.log('\\n=== ALERT METRICS ===');
  console.log(`Legacy Alerts: ${metrics.alerts.legacy}`);
  console.log(`Hybrid Alerts: ${metrics.alerts.hybrid}`);
  console.log(`Total Alerts: ${metrics.alerts.total}`);
  
  console.log('\\n=== PERFORMANCE COMPARISON ===');
  console.log(`Legacy Avg Latency: ${Math.round(metrics.performance.legacy.avgLatency)}ms`);
  console.log(`Hybrid Avg Latency: ${Math.round(metrics.performance.hybrid.avgLatency)}ms`);
  console.log(`Improvement Factor: ${metrics.performance.improvementFactor.toFixed(2)}x`);
  
  if (metrics.validation.latest) {
    console.log('\\n=== VALIDATION RESULTS ===');
    console.log(`Latest Accuracy: ${(metrics.validation.latest.accuracy * 100).toFixed(1)}%`);
    console.log(`Average Accuracy: ${(metrics.validation.averageAccuracy * 100).toFixed(1)}%`);
  }
  
  console.log('\\n=== ERROR RATES ===');
  Object.entries(metrics.errors).forEach(([system, count]) => {
    console.log(`${system}: ${count} errors`);
  });
}

async function showHealth() {
  mainLogger.section('System Health Status');
  
  if (!bridge) {
    console.log('Bridge not running - no health data available');
    return;
  }
  
  const health = bridge.getHealthStatus();
  
  console.log(`\\nOverall Health: ${health.overall ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
  console.log('\\nComponent Health:');
  Object.entries(health.components).forEach(([component, healthy]) => {
    console.log(`  ${component}: ${healthy ? '✅' : '❌'}`);
  });
  
  console.log('\\nHealth Details:');
  Object.entries(health.details).forEach(([key, value]) => {
    if (value !== null) {
      console.log(`  ${key}: ${typeof value === 'number' ? value.toFixed(3) : value}`);
    }
  });
}

function showFeatureFlags() {
  const featureFlags = getFeatureFlags();
  
  console.log('\\n=== FEATURE FLAGS STATUS ===');
  console.log(JSON.stringify(featureFlags.getAllFlags(), null, 2));
  
  console.log('\\n=== ROLLOUT STATUS ===');
  console.log(JSON.stringify(featureFlags.getRolloutStatus(), null, 2));
}

async function emergencyRollback(options) {
  mainLogger.section('Emergency Rollback');
  
  if (!options.force) {
    console.log('Emergency rollback requires --force flag for safety');
    console.log('This will immediately disable all hybrid features and switch to legacy only');
    console.log('Usage: node hybrid-index.js rollback --force');
    return;
  }
  
  const featureFlags = getFeatureFlags();
  
  console.log('🚨 EXECUTING EMERGENCY ROLLBACK 🚨');
  
  if (bridge) {
    await bridge.emergencyRollback('Manual emergency rollback command');
  } else {
    featureFlags.emergencyRollback('Manual emergency rollback command');
  }
  
  console.log('✅ Emergency rollback completed - system running in legacy mode only');
}

async function enableParallelMode() {
  const featureFlags = getFeatureFlags();
  
  console.log('Enabling parallel mode for validation...');
  
  featureFlags.update({
    enableHybridSystem: true,
    enableParallelMode: true,
    enableShadowMode: true, // Run hybrid but don't emit alerts
    rolloutPhase: 'parallel'
  });
  
  console.log('✅ Parallel mode enabled - hybrid system will run alongside legacy for validation');
}

async function enableHybridMode() {
  const featureFlags = getFeatureFlags();
  
  console.log('Enabling hybrid system...');
  
  featureFlags.update({
    enableHybridSystem: true,
    enableParallelMode: false,
    enableShadowMode: false,
    hybridTrafficPercent: 1, // Start with 1%
    rolloutPhase: 'gradual'
  });
  
  console.log('✅ Hybrid mode enabled with 1% traffic split');
}

async function setTrafficPercent(percent, options) {
  if (!percent || isNaN(percent)) {
    console.log('Usage: node hybrid-index.js set-traffic <percentage>');
    console.log('Example: node hybrid-index.js set-traffic 25');
    return;
  }
  
  const percentValue = parseInt(percent);
  
  if (percentValue < 0 || percentValue > 100) {
    console.log('Traffic percentage must be between 0 and 100');
    return;
  }
  
  if (percentValue > 10 && !options.force) {
    console.log(`Setting traffic to ${percentValue}% requires --force flag for safety`);
    console.log('This will route significant traffic to the hybrid system');
    console.log(`Usage: node hybrid-index.js set-traffic ${percentValue} --force`);
    return;
  }
  
  const featureFlags = getFeatureFlags();
  
  featureFlags.set('hybridTrafficPercent', percentValue);
  
  console.log(`✅ Hybrid traffic set to ${percentValue}%`);
}

async function switchToLegacy(options) {
  if (!bridge) {
    console.log('Bridge not running');
    return;
  }
  
  await bridge.switchToLegacy('Manual switch via command');
  console.log('✅ Switched to legacy system');
}

async function switchToHybrid(options) {
  if (!bridge) {
    console.log('Bridge not running');
    return;
  }
  
  if (!options.force) {
    console.log('Switching to hybrid requires --force flag for safety');
    console.log('Usage: node hybrid-index.js switch-hybrid --force');
    return;
  }
  
  await bridge.switchToHybrid('Manual switch via command');
  console.log('✅ Switched to hybrid system');
}

function setupBridgeEventHandlers(bridge) {
  bridge.on('alerts', (alerts) => {
    alerts.forEach(alert => {
      const source = alert.source || 'unknown';
      mainLogger.info(`[${source.toUpperCase()}] Alert: ${alert.type} - ${alert.amount || 'N/A'} DOT`);
    });
  });
  
  bridge.on('emergencyRollbackCompleted', (event) => {
    mainLogger.warn(`Emergency rollback completed: ${event.reason}`);
  });
  
  bridge.on('systemSwitched', (event) => {
    mainLogger.info(`System switched to ${event.to}: ${event.reason}`);
  });
  
  bridge.on('validationFailure', (event) => {
    mainLogger.warn(`Validation failure - accuracy: ${(event.accuracy * 100).toFixed(1)}%`);
  });
  
  bridge.on('highErrorRate', (event) => {
    mainLogger.error(`High error rate detected in ${event.system}: ${(event.errorRate * 100).toFixed(1)}%`);
  });
}

function setupGracefulShutdown(bridge) {
  process.on('SIGINT', async () => {
    mainLogger.warn('Received SIGINT, shutting down gracefully...');
    
    try {
      await bridge.stop();
      process.exit(0);
    } catch (error) {
      mainLogger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
  
  process.on('SIGTERM', async () => {
    mainLogger.warn('Received SIGTERM, shutting down gracefully...');
    
    try {
      await bridge.stop();
      process.exit(0);
    } catch (error) {
      mainLogger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  mainLogger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  
  // Attempt emergency rollback on unhandled rejections
  if (bridge) {
    bridge.emergencyRollback('Unhandled promise rejection').catch(err => {
      mainLogger.error('Emergency rollback failed:', err);
    });
  }
});

// Run main function
if (require.main === module) {
  main().catch(error => {
    mainLogger.error('Uncaught error', error);
    process.exit(1);
  });
}

module.exports = { HybridProductionBridge };