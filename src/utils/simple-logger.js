const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

class Logger {
  constructor(module = 'MAIN') {
    this.module = module;
    this.logFile = path.join(__dirname, '../../logs', `${new Date().toISOString().split('T')[0]}.log`);
    this.debugMode = process.argv.includes('--debug') || process.argv.includes('--dev');
    
    // Ensure logs directory exists
    const logsDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  }

  _formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}] [${this.module}]`;
    
    let fullMessage = `${prefix} ${message}`;
    if (data) {
      fullMessage += '\n' + JSON.stringify(data, null, 2);
    }
    
    return { prefix, message, fullMessage, data };
  }

  _writeToFile(fullMessage) {
    try {
      fs.appendFileSync(this.logFile, fullMessage + '\n');
    } catch (error) {
      console.error(`${colors.red}Failed to write to log file:${colors.reset}`, error);
    }
  }

  debug(message, data = null) {
    if (!this.debugMode) return;
    
    const { prefix, fullMessage } = this._formatMessage('DEBUG', message, data);
    console.log(`${colors.gray}${prefix} ${message}${colors.reset}`);
    if (data) {
      console.log(`${colors.gray}${JSON.stringify(data, null, 2)}${colors.reset}`);
    }
    this._writeToFile(fullMessage);
  }

  info(message, data = null) {
    const { prefix, fullMessage } = this._formatMessage('INFO', message, data);
    console.log(`${colors.blue}${prefix}${colors.reset} ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
    this._writeToFile(fullMessage);
  }

  success(message, data = null) {
    const { prefix, fullMessage } = this._formatMessage('SUCCESS', message, data);
    console.log(`${colors.green}${prefix} ${message}${colors.reset}`);
    if (data) {
      console.log(`${colors.green}${JSON.stringify(data, null, 2)}${colors.reset}`);
    }
    this._writeToFile(fullMessage);
  }

  warn(message, data = null) {
    const { prefix, fullMessage } = this._formatMessage('WARN', message, data);
    console.log(`${colors.yellow}${prefix} ${message}${colors.reset}`);
    if (data) {
      console.log(`${colors.yellow}${JSON.stringify(data, null, 2)}${colors.reset}`);
    }
    this._writeToFile(fullMessage);
  }

  error(message, error = null) {
    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      ...error
    } : null;
    
    const { prefix, fullMessage } = this._formatMessage('ERROR', message, errorData);
    console.log(`${colors.red}${prefix} ${message}${colors.reset}`);
    if (error) {
      console.log(`${colors.red}${error.stack || JSON.stringify(errorData, null, 2)}${colors.reset}`);
    }
    this._writeToFile(fullMessage);
  }

  alert(severity, type, message, details = {}) {
    const icon = {
      CRITICAL: '🔴',
      IMPORTANT: '🟡',
      NOTABLE: '🟢',
      INFO: '🔵'
    }[severity] || '⚪';

    const color = {
      CRITICAL: colors.red,
      IMPORTANT: colors.yellow,
      NOTABLE: colors.green,
      INFO: colors.blue
    }[severity] || colors.white;

    console.log(`${colors.gray}${'─'.repeat(80)}${colors.reset}`);
    console.log(`${icon} ${color}${severity}${colors.reset} | ${type} | ${new Date().toISOString()}`);
    console.log(`${colors.bright}${message}${colors.reset}`);
    
    if (details.address) {
      console.log(`${colors.gray}Address: ${this._truncateAddress(details.address)}${colors.reset}`);
    }
    if (details.amount) {
      console.log(`${colors.gray}Amount: ${this._formatAmount(details.amount)} DOT${colors.reset}`);
    }
    if (details.extra) {
      console.log(`${colors.gray}${details.extra}${colors.reset}`);
    }
    
    console.log(`${colors.gray}${'─'.repeat(80)}${colors.reset}`);
    
    // Also log to file
    this._writeToFile(JSON.stringify({
      timestamp: new Date().toISOString(),
      severity,
      type,
      message,
      details
    }));
  }

  table(data, title = null) {
    if (title) {
      console.log(`\n${colors.cyan}${colors.bright}${title}${colors.reset}`);
      console.log(`${colors.cyan}${'='.repeat(title.length)}${colors.reset}`);
    }
    console.table(data);
  }

  progress(current, total, message = '') {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round(percentage / 2);
    const empty = 50 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    
    process.stdout.write(`\r${colors.cyan}${bar}${colors.reset} ${percentage}% ${message}`);
    
    if (current === total) {
      console.log(''); // New line when complete
    }
  }

  section(title) {
    console.log(`\n${colors.cyan}${'═'.repeat(80)}${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}  ${title}${colors.reset}`);
    console.log(`${colors.cyan}${'═'.repeat(80)}${colors.reset}\n`);
  }

  _truncateAddress(address) {
    if (!address || address.length < 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  }

  _formatAmount(amount) {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }
}

// Create singleton instances for different modules
module.exports = {
  Logger,
  mainLogger: new Logger('MAIN'),
  apiLogger: new Logger('API'),
  storageLogger: new Logger('STORAGE'),
  patternLogger: new Logger('PATTERNS'),
  alertLogger: new Logger('ALERTS'),
  monitorLogger: new Logger('MONITOR')
};