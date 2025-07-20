#!/usr/bin/env node

const WhaleMonitor = require('./src/monitor');
const { mainLogger } = require('./src/utils/logger');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env file if it exists
const dotenvPath = path.join(__dirname, '.env');
if (fs.existsSync(dotenvPath)) {
  require('dotenv').config({ path: dotenvPath });
  mainLogger.info('Loaded environment variables from .env');
}

// ASCII art banner
const banner = `
██████╗  ██████╗ ██╗     ██╗  ██╗ █████╗ ██████╗  ██████╗ ████████╗
██╔══██╗██╔═══██╗██║     ██║ ██╔╝██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝
██████╔╝██║   ██║██║     █████╔╝ ███████║██║  ██║██║   ██║   ██║   
██╔═══╝ ██║   ██║██║     ██╔═██╗ ██╔══██║██║  ██║██║   ██║   ██║   
██║     ╚██████╔╝███████╗██║  ██╗██║  ██║██████╔╝╚██████╔╝   ██║   
╚═╝      ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝  ╚═════╝    ╚═╝   
                    🐋 Whale Monitor v1.0 🐋
`;

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

// Show help
function showHelp() {
  console.log(banner);
  console.log('Usage: node index.js [command] [options]\n');
  console.log('Commands:');
  console.log('  start            Start continuous monitoring');
  console.log('  run              Run a single monitoring cycle');
  console.log('  demo             Run demo mode with sample scenarios');
  console.log('  stats            Show current statistics');
  console.log('  help             Show this help message\n');
  console.log('Options:');
  console.log('  --interval <min> Set check interval in minutes (default: 60)');
  console.log('  --limit <num>    Set top accounts limit (default: 1000)');
  console.log('  --quiet          Suppress non-critical output\n');
  console.log('Environment Variables:');
  console.log('  SUBSCAN_API_KEY  Your Subscan API key');
  console.log('  CHECK_INTERVAL   Check interval in minutes');
  console.log('  TOP_ACCOUNTS     Number of top accounts to monitor');
  console.log('  DATA_PATH        Path to store data files\n');
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
    }
  }
  
  return options;
}

// Main function
async function main() {
  console.log(banner);
  
  // Parse options
  const options = parseOptions(args.slice(1));
  
  // Create monitor instance
  const monitor = new WhaleMonitor(options);
  
  try {
    switch (command) {
      case 'start':
        mainLogger.section('Starting Continuous Monitoring');
        await monitor.startMonitoring();
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
          mainLogger.warn('Received SIGINT, shutting down gracefully...');
          monitor.stopMonitoring();
          process.exit(0);
        });
        
        process.on('SIGTERM', () => {
          mainLogger.warn('Received SIGTERM, shutting down gracefully...');
          monitor.stopMonitoring();
          process.exit(0);
        });
        
        // Keep process alive
        process.stdin.resume();
        break;
        
      case 'run':
        mainLogger.section('Running Single Monitoring Cycle');
        const result = await monitor.runCycle();
        
        if (result.firstRun) {
          mainLogger.info('This was the first run - baseline snapshot saved');
        } else {
          mainLogger.info(`Monitoring cycle complete: ${result.alerts.length} alerts found`);
        }
        break;
        
      case 'demo':
        mainLogger.section('Running Demo Mode');
        await monitor.runDemo();
        break;
        
      case 'stats':
        mainLogger.section('Current Statistics');
        const stats = monitor.getStats();
        mainLogger.info('Alert Statistics:', stats.alertStats);
        mainLogger.info('Storage Statistics:', stats.storageStats);
        break;
        
      case 'help':
      default:
        showHelp();
        break;
    }
    
  } catch (error) {
    mainLogger.error('Fatal error', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  mainLogger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Run main function
if (require.main === module) {
  main().catch(error => {
    mainLogger.error('Uncaught error', error);
    process.exit(1);
  });
}

module.exports = { WhaleMonitor };