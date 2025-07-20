#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Tail } = require('tail');

// Get log type from command line argument
const logType = process.argv[2] || 'app';
const LOGS_DIR = path.join(__dirname, '../logs');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function formatLogEntry(data) {
  try {
    const parsed = JSON.parse(data);
    const { timestamp, level, module, message, ...rest } = parsed;
    
    // Color based on level
    const levelColors = {
      error: colors.red,
      warn: colors.yellow,
      info: colors.blue,
      debug: colors.gray
    };
    
    const color = levelColors[level] || colors.reset;
    
    // Format output
    let output = `${colors.gray}[${timestamp}]${colors.reset} `;
    output += `${color}[${level.toUpperCase()}]${colors.reset} `;
    output += `${colors.cyan}[${module}]${colors.reset} `;
    output += message;
    
    // Add structured data if present
    if (Object.keys(rest).length > 0) {
      // Special formatting for alerts
      if (rest.isAlert) {
        const { severity, type, details } = rest;
        output = '\n' + colors.gray + '─'.repeat(80) + colors.reset + '\n';
        output += formatAlert(severity, type, message, details);
        output += colors.gray + '─'.repeat(80) + colors.reset;
      } else if (rest.type === 'performance') {
        output += ` ${colors.magenta}[${rest.metric}: ${rest.value}ms]${colors.reset}`;
      } else if (rest.type === 'api') {
        output += ` ${colors.green}[${rest.endpoint}]${colors.reset} ${rest.duration}ms - ${rest.status}`;
      } else {
        output += '\n' + colors.gray + JSON.stringify(rest, null, 2) + colors.reset;
      }
    }
    
    return output;
  } catch (e) {
    // If not JSON, return as-is
    return data;
  }
}

function formatAlert(severity, type, message, details) {
  const icons = {
    CRITICAL: '🔴',
    IMPORTANT: '🟡',
    NOTABLE: '🟢',
    INFO: '🔵'
  };
  
  const severityColors = {
    CRITICAL: colors.red,
    IMPORTANT: colors.yellow,
    NOTABLE: colors.green,
    INFO: colors.blue
  };
  
  const icon = icons[severity] || '⚪';
  const color = severityColors[severity] || colors.reset;
  
  let output = `${icon} ${color}${severity}${colors.reset} | ${type}\n`;
  output += `${colors.bright}${message}${colors.reset}\n`;
  
  if (details.address) {
    output += `${colors.gray}Address: ${details.address}${colors.reset}\n`;
  }
  if (details.amount) {
    output += `${colors.gray}Amount: ${details.amount} DOT${colors.reset}\n`;
  }
  if (details.extra) {
    output += `${colors.gray}${details.extra}${colors.reset}\n`;
  }
  
  return output;
}

function getLogFile(type) {
  const date = new Date().toISOString().split('T')[0];
  const logFile = path.join(LOGS_DIR, `${type}-${date}.log`);
  
  // Check if file exists
  if (!fs.existsSync(logFile)) {
    console.error(`${colors.red}❌ Log file not found: ${logFile}${colors.reset}`);
    console.log(`\nAvailable log types:`);
    
    // List available log files
    if (fs.existsSync(LOGS_DIR)) {
      const files = fs.readdirSync(LOGS_DIR)
        .filter(f => f.endsWith('.log'))
        .map(f => f.replace(/-\d{4}-\d{2}-\d{2}\.log$/, ''))
        .filter((v, i, a) => a.indexOf(v) === i);
      
      files.forEach(f => console.log(`  - ${f}`));
    }
    
    process.exit(1);
  }
  
  return logFile;
}

function startTailing() {
  const logFile = getLogFile(logType);
  
  console.log(`${colors.cyan}📜 Tailing ${logType} logs...${colors.reset}`);
  console.log(`${colors.gray}File: ${logFile}${colors.reset}`);
  console.log(`${colors.gray}Press Ctrl+C to stop${colors.reset}\n`);
  
  // Create tail instance
  const tail = new Tail(logFile, {
    follow: true,
    logger: console
  });
  
  // Handle new lines
  tail.on('line', (data) => {
    console.log(formatLogEntry(data));
  });
  
  // Handle errors
  tail.on('error', (error) => {
    console.error(`${colors.red}❌ Tail error: ${error}${colors.reset}`);
  });
  
  // Handle process termination
  process.on('SIGINT', () => {
    console.log(`\n${colors.yellow}👋 Stopping log tail...${colors.reset}`);
    tail.unwatch();
    process.exit(0);
  });
}

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
${colors.bright}Log Tail Utility${colors.reset}

Usage: node tail-logs.js [log-type]

Log types:
  - app      Application logs (default)
  - error    Error logs only
  - alerts   Alert logs only

Examples:
  node tail-logs.js          # Tail app logs
  node tail-logs.js alerts   # Tail alert logs
  node tail-logs.js error    # Tail error logs

Or use npm scripts:
  npm run logs:tail          # Tail app logs
  npm run logs:tail:alerts   # Tail alert logs
  npm run logs:tail:errors   # Tail error logs
`);
  process.exit(0);
}

// Start tailing
startTailing();