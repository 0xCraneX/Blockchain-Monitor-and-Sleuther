#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import readline from 'readline';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_LEVELS = {
  'FATAL': { color: 'red', priority: 6, icon: '💀' },
  'ERROR': { color: 'red', priority: 5, icon: '❌' },
  'WARN': { color: 'yellow', priority: 4, icon: '⚠️' },
  'INFO': { color: 'green', priority: 3, icon: 'ℹ️' },
  'DEBUG': { color: 'blue', priority: 2, icon: '🔍' },
  'TRACE': { color: 'gray', priority: 1, icon: '📝' }
};

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  file: null,
  level: 'INFO',
  filter: null,
  follow: true,
  stats: false,
  json: false,
  context: null,
  tail: 100
};

// Process arguments
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--file':
    case '-f':
      options.file = args[++i];
      break;
    case '--level':
    case '-l':
      options.level = args[++i].toUpperCase();
      break;
    case '--filter':
    case '-g':
      options.filter = new RegExp(args[++i], 'i');
      break;
    case '--no-follow':
      options.follow = false;
      break;
    case '--stats':
    case '-s':
      options.stats = true;
      break;
    case '--json':
    case '-j':
      options.json = true;
      break;
    case '--context':
    case '-c':
      options.context = args[++i];
      break;
    case '--tail':
    case '-n':
      options.tail = parseInt(args[++i]);
      break;
    case '--help':
    case '-h':
      showHelp();
      process.exit(0);
  }
}

function showHelp() {
  console.log(`
${chalk.bold('Log Monitor - Real-time log analysis tool')}

${chalk.underline('Usage:')}
  node scripts/monitor-logs.js [options]

${chalk.underline('Options:')}
  -f, --file <file>      Specific log file to monitor (default: latest)
  -l, --level <level>    Minimum log level to show (default: INFO)
  -g, --filter <regex>   Filter logs by regex pattern
  -c, --context <name>   Filter by logger context (e.g., GraphController)
  -n, --tail <lines>     Number of lines to tail (default: 100)
  -s, --stats            Show log statistics
  -j, --json             Output raw JSON logs
  --no-follow            Don't follow new logs
  -h, --help             Show this help message

${chalk.underline('Examples:')}
  # Monitor all INFO+ logs
  node scripts/monitor-logs.js

  # Monitor only ERROR logs from GraphController
  node scripts/monitor-logs.js -l ERROR -c GraphController

  # Filter for database queries
  node scripts/monitor-logs.js -g "database_query"

  # Show log statistics
  node scripts/monitor-logs.js --stats

${chalk.underline('Log Levels:')}
  ${Object.entries(LOG_LEVELS).map(([level, config]) => 
    `  ${config.icon}  ${chalk[config.color](level.padEnd(5))} (priority: ${config.priority})`
  ).join('\n')}
`);
}

// Statistics tracking
const stats = {
  total: 0,
  levels: {},
  contexts: {},
  types: {},
  errors: [],
  performance: []
};

// Find the latest log file
function findLatestLogFile() {
  if (!fs.existsSync(LOG_DIR)) {
    console.error(chalk.red(`Log directory not found: ${LOG_DIR}`));
    console.log(chalk.yellow('Make sure the application has been run with file logging enabled.'));
    console.log(chalk.yellow('Set ENABLE_FILE_LOGGING=true or LOG_LEVEL=debug'));
    process.exit(1);
  }

  const files = fs.readdirSync(LOG_DIR)
    .filter(f => f.startsWith('app-') && f.endsWith('.log'))
    .map(f => ({
      name: f,
      path: path.join(LOG_DIR, f),
      mtime: fs.statSync(path.join(LOG_DIR, f)).mtime
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    console.error(chalk.red('No log files found'));
    process.exit(1);
  }

  return files[0].path;
}

// Parse log line
function parseLogLine(line) {
  try {
    const log = JSON.parse(line);
    return log;
  } catch (error) {
    // Not JSON, return as raw text
    return { msg: line, level: 'INFO' };
  }
}

// Format log output
function formatLog(log) {
  if (options.json) {
    return JSON.stringify(log);
  }

  // Convert numeric level to string if needed
  let level;
  if (typeof log.level === 'number') {
    const levelMap = {
      10: 'TRACE',
      20: 'DEBUG', 
      30: 'INFO',
      40: 'WARN',
      50: 'ERROR',
      60: 'FATAL'
    };
    level = levelMap[log.level] || 'INFO';
  } else {
    level = (log.level || 'INFO').toUpperCase();
  }
  
  const levelConfig = LOG_LEVELS[level] || LOG_LEVELS.INFO;
  const timestamp = log.time ? new Date(log.time).toLocaleTimeString() : '';
  const context = log.context || 'System';
  const msg = log.msg || '';

  let output = `${chalk.gray(timestamp)} `;
  output += `${levelConfig.icon} ${chalk[levelConfig.color](level.padEnd(5))} `;
  output += `[${chalk.cyan(context.padEnd(20))}] `;
  output += msg;

  // Add additional details
  if (log.type) {
    output += chalk.gray(` (${log.type})`);
  }

  if (log.duration) {
    output += chalk.magenta(` [${log.duration}]`);
  }

  if (log.error) {
    output += '\n' + chalk.red(`  Error: ${log.error.message}`);
    if (log.error.stack) {
      output += '\n' + chalk.gray(log.error.stack.split('\n').map(l => '    ' + l).join('\n'));
    }
  }

  // Add key details based on type
  if (log.type === 'api_request') {
    output += chalk.gray(` ${log.method} ${log.path}`);
  } else if (log.type === 'api_response') {
    output += chalk.gray(` ${log.statusCode} in ${log.duration}`);
  } else if (log.type === 'database_query') {
    output += '\n' + chalk.gray(`  Query: ${(log.query || '').substring(0, 100)}...`);
  } else if (log.type === 'websocket_event') {
    output += chalk.gray(` ${log.event} from ${log.socketId}`);
  }

  return output;
}

// Update statistics
function updateStats(log) {
  stats.total++;
  
  // Convert numeric level to string if needed
  let level;
  if (typeof log.level === 'number') {
    // Pino numeric levels: 10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal
    const levelMap = {
      10: 'TRACE',
      20: 'DEBUG', 
      30: 'INFO',
      40: 'WARN',
      50: 'ERROR',
      60: 'FATAL'
    };
    level = levelMap[log.level] || 'INFO';
  } else {
    level = (log.level || 'INFO').toUpperCase();
  }
  
  stats.levels[level] = (stats.levels[level] || 0) + 1;
  
  const context = log.context || 'System';
  stats.contexts[context] = (stats.contexts[context] || 0) + 1;
  
  if (log.type) {
    stats.types[log.type] = (stats.types[log.type] || 0) + 1;
  }
  
  if (level === 'ERROR' || level === 'FATAL') {
    stats.errors.push({
      time: log.time,
      context,
      message: log.msg,
      error: log.error
    });
  }
  
  if (log.duration) {
    const duration = parseFloat(log.duration);
    if (!isNaN(duration)) {
      stats.performance.push({
        operation: log.operation || log.type || 'unknown',
        duration,
        time: log.time
      });
    }
  }
}

// Show statistics
function showStats() {
  console.clear();
  console.log(chalk.bold.underline('Log Statistics'));
  console.log();
  
  console.log(chalk.bold('Total Logs:'), stats.total);
  console.log();
  
  console.log(chalk.bold('By Level:'));
  Object.entries(stats.levels)
    .sort(([a], [b]) => LOG_LEVELS[b].priority - LOG_LEVELS[a].priority)
    .forEach(([level, count]) => {
      const config = LOG_LEVELS[level] || LOG_LEVELS.INFO;
      const percentage = ((count / stats.total) * 100).toFixed(1);
      console.log(`  ${config.icon} ${chalk[config.color](level.padEnd(5))} ${count.toString().padStart(6)} (${percentage}%)`);
    });
  console.log();
  
  console.log(chalk.bold('Top Contexts:'));
  Object.entries(stats.contexts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .forEach(([context, count]) => {
      console.log(`  ${chalk.cyan(context.padEnd(25))} ${count.toString().padStart(6)}`);
    });
  console.log();
  
  console.log(chalk.bold('Top Event Types:'));
  Object.entries(stats.types)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .forEach(([type, count]) => {
      console.log(`  ${chalk.blue(type.padEnd(25))} ${count.toString().padStart(6)}`);
    });
  console.log();
  
  if (stats.errors.length > 0) {
    console.log(chalk.bold.red(`Recent Errors (${stats.errors.length} total):`));
    stats.errors.slice(-5).forEach(error => {
      console.log(`  ${chalk.red('•')} ${error.message}`);
    });
    console.log();
  }
  
  if (stats.performance.length > 0) {
    const sorted = [...stats.performance].sort((a, b) => b.duration - a.duration);
    console.log(chalk.bold('Slowest Operations:'));
    sorted.slice(0, 5).forEach(perf => {
      console.log(`  ${chalk.yellow(perf.operation.padEnd(25))} ${chalk.magenta(perf.duration.toFixed(2) + 'ms')}`);
    });
    
    const avg = stats.performance.reduce((sum, p) => sum + p.duration, 0) / stats.performance.length;
    console.log(chalk.bold('\nAverage Operation Time:'), chalk.magenta(avg.toFixed(2) + 'ms'));
  }
  
  console.log('\n' + chalk.gray('Press Ctrl+C to exit'));
}

// Process log line
function processLogLine(line) {
  if (!line.trim()) return;
  
  const log = parseLogLine(line);
  
  // Convert numeric level to string if needed
  let logLevel;
  if (typeof log.level === 'number') {
    const levelMap = {
      10: 'TRACE',
      20: 'DEBUG', 
      30: 'INFO',
      40: 'WARN',
      50: 'ERROR',
      60: 'FATAL'
    };
    logLevel = levelMap[log.level] || 'INFO';
  } else {
    logLevel = (log.level || 'INFO').toUpperCase();
  }
  
  const minPriority = LOG_LEVELS[options.level]?.priority || LOG_LEVELS.INFO.priority;
  const logPriority = LOG_LEVELS[logLevel]?.priority || LOG_LEVELS.INFO.priority;
  
  if (logPriority < minPriority) return;
  
  // Apply context filter
  if (options.context && log.context !== options.context) return;
  
  // Apply regex filter
  if (options.filter) {
    const searchText = JSON.stringify(log);
    if (!options.filter.test(searchText)) return;
  }
  
  // Update statistics
  if (options.stats) {
    updateStats(log);
    return;
  }
  
  // Output formatted log
  console.log(formatLog(log));
}

// Main monitoring function
async function monitorLogs() {
  const logFile = options.file || findLatestLogFile();
  console.log(chalk.green(`Monitoring log file: ${logFile}`));
  console.log(chalk.gray('Press Ctrl+C to exit\n'));
  
  if (options.stats) {
    // Stats mode - refresh periodically
    setInterval(showStats, 1000);
  }
  
  // Use tail command for efficient following
  const tailArgs = ['-f', '-n', options.tail.toString(), logFile];
  if (!options.follow) {
    tailArgs.shift(); // Remove -f flag
  }
  
  const tail = spawn('tail', tailArgs);
  
  const rl = readline.createInterface({
    input: tail.stdout,
    output: null,
    terminal: false
  });
  
  rl.on('line', processLogLine);
  
  tail.stderr.on('data', (data) => {
    console.error(chalk.red(`Error: ${data}`));
  });
  
  tail.on('error', (error) => {
    console.error(chalk.red(`Failed to start tail: ${error.message}`));
    process.exit(1);
  });
  
  tail.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(chalk.red(`Tail process exited with code ${code}`));
    }
    process.exit(code || 0);
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\nShutting down log monitor...'));
    tail.kill();
    process.exit(0);
  });
}

// Start monitoring
monitorLogs().catch(error => {
  console.error(chalk.red(`Error: ${error.message}`));
  process.exit(1);
});