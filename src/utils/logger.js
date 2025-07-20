// Use chalk v4 which is CommonJS compatible
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

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
      console.error(chalk.red('Failed to write to log file:'), error);
    }
  }

  debug(message, data = null) {
    if (!this.debugMode) return;
    
    const { prefix, fullMessage } = this._formatMessage('DEBUG', message, data);
    console.log(chalk.gray(prefix), chalk.gray(message));
    if (data) {
      console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
    this._writeToFile(fullMessage);
  }

  info(message, data = null) {
    const { prefix, fullMessage } = this._formatMessage('INFO', message, data);
    console.log(chalk.blue(prefix), chalk.white(message));
    if (data) {
      console.log(chalk.white(JSON.stringify(data, null, 2)));
    }
    this._writeToFile(fullMessage);
  }

  success(message, data = null) {
    const { prefix, fullMessage } = this._formatMessage('SUCCESS', message, data);
    console.log(chalk.green(prefix), chalk.green(message));
    if (data) {
      console.log(chalk.green(JSON.stringify(data, null, 2)));
    }
    this._writeToFile(fullMessage);
  }

  warn(message, data = null) {
    const { prefix, fullMessage } = this._formatMessage('WARN', message, data);
    console.log(chalk.yellow(prefix), chalk.yellow(message));
    if (data) {
      console.log(chalk.yellow(JSON.stringify(data, null, 2)));
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
    console.log(chalk.red(prefix), chalk.red(message));
    if (error) {
      console.log(chalk.red(error.stack || JSON.stringify(errorData, null, 2)));
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
      CRITICAL: chalk.red,
      IMPORTANT: chalk.yellow,
      NOTABLE: chalk.green,
      INFO: chalk.blue
    }[severity] || chalk.white;

    console.log(chalk.gray('─'.repeat(80)));
    console.log(`${icon} ${color(severity)} | ${type} | ${new Date().toISOString()}`);
    console.log(chalk.white.bold(message));
    
    if (details.address) {
      console.log(chalk.gray(`Address: ${this._truncateAddress(details.address)}`));
    }
    if (details.amount) {
      console.log(chalk.gray(`Amount: ${this._formatAmount(details.amount)} DOT`));
    }
    if (details.extra) {
      console.log(chalk.gray(details.extra));
    }
    
    console.log(chalk.gray('─'.repeat(80)));
    
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
      console.log(chalk.cyan.bold(`\n${title}`));
      console.log(chalk.cyan('='.repeat(title.length)));
    }
    console.table(data);
  }

  progress(current, total, message = '') {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round(percentage / 2);
    const empty = 50 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    
    process.stdout.write(`\r${chalk.cyan(bar)} ${chalk.white(percentage + '%')} ${message}`);
    
    if (current === total) {
      console.log(''); // New line when complete
    }
  }

  section(title) {
    console.log('\n' + chalk.cyan('═'.repeat(80)));
    console.log(chalk.cyan.bold(`  ${title}`));
    console.log(chalk.cyan('═'.repeat(80)) + '\n');
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