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
const SAVED_LOGS_DIR = path.join(process.cwd(), 'logs', 'analysis');

// Enhanced log levels with better visual distinction
const LOG_LEVELS = {
  'FATAL': { color: 'bgRed', priority: 6, icon: '💀', textColor: 'white' },
  'ERROR': { color: 'red', priority: 5, icon: '❌', textColor: 'redBright' },
  'WARN': { color: 'yellow', priority: 4, icon: '⚠️ ', textColor: 'yellowBright' },
  'INFO': { color: 'green', priority: 3, icon: 'ℹ️ ', textColor: 'greenBright' },
  'DEBUG': { color: 'blue', priority: 2, icon: '🔍', textColor: 'blueBright' },
  'TRACE': { color: 'gray', priority: 1, icon: '📝', textColor: 'gray' }
};

// Important event patterns
const EVENT_PATTERNS = {
  SERVICE_CREATION: {
    pattern: /service.*created|creating.*service|initializ/i,
    color: 'cyan',
    icon: '🔧',
    importance: 'high'
  },
  METHOD_CALL: {
    pattern: /method.*call|calling.*method|invoke/i,
    color: 'magenta',
    icon: '📞',
    importance: 'medium'
  },
  CONDITION_CHECK: {
    pattern: /condition|check|validat|verify/i,
    color: 'yellow',
    icon: '✓',
    importance: 'low'
  },
  DATABASE_QUERY: {
    pattern: /database.*query|executing.*query|SELECT|INSERT|UPDATE|DELETE/i,
    color: 'blue',
    icon: '🗄️',
    importance: 'high'
  },
  API_REQUEST: {
    pattern: /api.*request|GET|POST|PUT|DELETE.*\/api/i,
    color: 'green',
    icon: '🌐',
    importance: 'high'
  },
  WEBSOCKET: {
    pattern: /websocket|socket\.io|ws:|connection.*established/i,
    color: 'magentaBright',
    icon: '🔌',
    importance: 'high'
  },
  GRAPH_OPERATION: {
    pattern: /graph.*operation|node.*creat|edge.*add|relationship/i,
    color: 'cyanBright',
    icon: '🕸️',
    importance: 'high'
  },
  PERFORMANCE: {
    pattern: /performance|duration|timing|slow|latency/i,
    color: 'yellowBright',
    icon: '⏱️',
    importance: 'medium'
  },
  CACHE: {
    pattern: /cache.*hit|cache.*miss|caching|cached/i,
    color: 'blueBright',
    icon: '💾',
    importance: 'medium'
  },
  ERROR_PATTERN: {
    pattern: /error|exception|fail|crash|fatal/i,
    color: 'redBright',
    icon: '🚨',
    importance: 'critical'
  }
};

// Component filters
const COMPONENTS = {
  'GraphController': { color: 'cyan', icon: '📊' },
  'RealDataService': { color: 'green', icon: '📡' },
  'DatabaseService': { color: 'blue', icon: '💿' },
  'WebSocketService': { color: 'magenta', icon: '🔗' },
  'CacheService': { color: 'yellow', icon: '🗃️' },
  'ApiRouter': { color: 'greenBright', icon: '🚦' },
  'SubscanService': { color: 'blueBright', icon: '🔍' },
  'PatternDetector': { color: 'magentaBright', icon: '🎯' },
  'RelationshipScorer': { color: 'yellowBright', icon: '📈' },
  'System': { color: 'gray', icon: '⚙️' }
};

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  file: null,
  level: 'DEBUG',
  filter: null,
  component: null,
  follow: true,
  stats: false,
  json: false,
  save: false,
  pattern: null,
  tail: 200,
  requestFlow: false,
  highlight: true
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
    case '--component':
    case '-c':
      options.component = args[++i];
      break;
    case '--pattern':
    case '-p':
      options.pattern = args[++i];
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
    case '--save':
      options.save = true;
      break;
    case '--request-flow':
    case '-r':
      options.requestFlow = true;
      break;
    case '--no-highlight':
      options.highlight = false;
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
${chalk.bold('Enhanced Log Monitor - Real-time log analysis with pattern detection')}

${chalk.underline('Usage:')}
  node scripts/monitor-logs-enhanced.js [options]

${chalk.underline('Options:')}
  -f, --file <file>      Specific log file to monitor (default: latest)
  -l, --level <level>    Minimum log level to show (default: DEBUG)
  -g, --filter <regex>   Filter logs by regex pattern
  -c, --component <name> Filter by component (e.g., GraphController)
  -p, --pattern <name>   Highlight specific pattern (e.g., SERVICE_CREATION)
  -n, --tail <lines>     Number of lines to tail (default: 200)
  -s, --stats            Show log statistics
  -j, --json             Output raw JSON logs
  -r, --request-flow     Track and show request flows
  --save                 Save important log sections to file
  --no-follow            Don't follow new logs
  --no-highlight         Disable pattern highlighting
  -h, --help             Show this help message

${chalk.underline('Components:')}
${Object.entries(COMPONENTS).map(([name, config]) => 
  `  ${config.icon}  ${chalk[config.color](name)}`
).join('\n')}

${chalk.underline('Event Patterns:')}
${Object.entries(EVENT_PATTERNS).map(([name, config]) => 
  `  ${config.icon}  ${chalk[config.color](name.replace(/_/g, ' '))} (${config.importance})`
).join('\n')}

${chalk.underline('Examples:')}
  # Monitor GraphController debug logs
  node scripts/monitor-logs-enhanced.js -c GraphController -l DEBUG

  # Track API request flows
  node scripts/monitor-logs-enhanced.js -r -p API_REQUEST

  # Save error patterns for analysis
  node scripts/monitor-logs-enhanced.js -l ERROR --save

  # Monitor database operations
  node scripts/monitor-logs-enhanced.js -p DATABASE_QUERY -c DatabaseService
`);
}

// Statistics tracking
const stats = {
  total: 0,
  levels: {},
  components: {},
  patterns: {},
  requestFlows: new Map(),
  errors: [],
  performance: [],
  savedLogs: []
};

// Create saved logs directory if needed
if (options.save && !fs.existsSync(SAVED_LOGS_DIR)) {
  fs.mkdirSync(SAVED_LOGS_DIR, { recursive: true });
}

// Find the latest log file
function findLatestLogFile() {
  if (!fs.existsSync(LOG_DIR)) {
    console.error(chalk.red(`Log directory not found: ${LOG_DIR}`));
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

// Detect patterns in log
function detectPatterns(log) {
  const detectedPatterns = [];
  const searchText = JSON.stringify(log).toLowerCase();
  
  for (const [name, config] of Object.entries(EVENT_PATTERNS)) {
    if (config.pattern.test(searchText)) {
      detectedPatterns.push({ name, config });
    }
  }
  
  return detectedPatterns;
}

// Format log output with enhanced highlighting
function formatLog(log, patterns = []) {
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
  const context = log.context || log.name || 'System';
  const componentConfig = COMPONENTS[context] || COMPONENTS.System;
  const msg = log.msg || '';

  // Build output with enhanced formatting
  let output = '';
  
  // Timestamp
  output += chalk.gray(`[${timestamp}]`) + ' ';
  
  // Level with background for errors
  if (level === 'ERROR' || level === 'FATAL') {
    output += chalk[levelConfig.color](` ${level} `) + ' ';
  } else {
    output += `${levelConfig.icon} ${chalk[levelConfig.textColor](level.padEnd(5))} `;
  }
  
  // Component with icon
  output += `${componentConfig.icon} ${chalk[componentConfig.color](`[${context}]`.padEnd(22))} `;
  
  // Pattern indicators
  if (patterns.length > 0 && options.highlight) {
    output += patterns.map(p => p.config.icon).join('') + ' ';
  }
  
  // Message with pattern highlighting
  let formattedMsg = msg;
  if (options.highlight && patterns.length > 0) {
    // Highlight the most important pattern
    const mainPattern = patterns.sort((a, b) => {
      const priorities = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorities[b.config.importance] - priorities[a.config.importance];
    })[0];
    formattedMsg = chalk[mainPattern.config.color](msg);
  } else {
    formattedMsg = msg;
  }
  output += formattedMsg;

  // Add additional details based on log type
  if (log.type) {
    output += chalk.gray(` [${log.type}]`);
  }

  if (log.requestId) {
    output += chalk.cyan(` [ReqID: ${log.requestId}]`);
  }

  if (log.duration) {
    const duration = parseFloat(log.duration);
    let durationColor = 'green';
    if (duration > 1000) durationColor = 'red';
    else if (duration > 500) durationColor = 'yellow';
    output += chalk[durationColor](` [${duration.toFixed(2)}ms]`);
  }

  // Error details
  if (log.error || log.err) {
    const error = log.error || log.err;
    output += '\n' + chalk.red(`  └─ Error: ${error.message || error}`);
    if (error.stack) {
      const stackLines = error.stack.split('\n').slice(1, 4);
      stackLines.forEach(line => {
        output += '\n' + chalk.gray(`     ${line.trim()}`);
      });
    }
  }

  // Additional context for specific types
  if (log.type === 'database_query' && log.query) {
    output += '\n' + chalk.gray(`  └─ Query: ${log.query.substring(0, 100)}...`);
  } else if (log.type === 'api_request') {
    output += chalk.gray(` ${log.method} ${log.path}`);
  } else if (log.type === 'websocket_event') {
    output += chalk.gray(` Event: ${log.event}`);
  } else if (log.operation) {
    output += chalk.gray(` Op: ${log.operation}`);
  }

  return output;
}

// Track request flows
function trackRequestFlow(log) {
  if (!log.requestId) return;
  
  if (!stats.requestFlows.has(log.requestId)) {
    stats.requestFlows.set(log.requestId, {
      id: log.requestId,
      startTime: log.time,
      events: [],
      components: new Set(),
      patterns: new Set()
    });
  }
  
  const flow = stats.requestFlows.get(log.requestId);
  flow.events.push({
    time: log.time,
    level: log.level,
    component: log.context || 'System',
    message: log.msg,
    type: log.type,
    duration: log.duration
  });
  flow.components.add(log.context || 'System');
  
  const patterns = detectPatterns(log);
  patterns.forEach(p => flow.patterns.add(p.name));
}

// Save important logs
function saveImportantLog(log, patterns) {
  if (!options.save) return;
  
  const importance = patterns.some(p => 
    p.config.importance === 'critical' || p.config.importance === 'high'
  );
  
  if (!importance && log.level !== 50 && log.level !== 60) return;
  
  const filename = `important-logs-${new Date().toISOString().split('T')[0]}.json`;
  const filepath = path.join(SAVED_LOGS_DIR, filename);
  
  const logEntry = {
    timestamp: new Date(log.time || Date.now()),
    log,
    patterns: patterns.map(p => p.name),
    formatted: formatLog(log, patterns)
  };
  
  stats.savedLogs.push(logEntry);
  
  // Append to file
  fs.appendFileSync(filepath, JSON.stringify(logEntry) + '\n');
}

// Show request flow summary
function showRequestFlow(requestId) {
  const flow = stats.requestFlows.get(requestId);
  if (!flow) return;
  
  console.log(chalk.bold.underline(`\nRequest Flow: ${requestId}`));
  console.log(chalk.gray(`Components: ${[...flow.components].join(' → ')}`));
  console.log(chalk.gray(`Patterns: ${[...flow.patterns].join(', ')}`));
  
  const duration = flow.events[flow.events.length - 1].time - flow.startTime;
  console.log(chalk.gray(`Total Duration: ${duration}ms`));
  
  console.log(chalk.bold('\nFlow Timeline:'));
  flow.events.forEach((event, idx) => {
    const relativeTime = event.time - flow.startTime;
    const componentConfig = COMPONENTS[event.component] || COMPONENTS.System;
    console.log(`  ${componentConfig.icon} ${chalk[componentConfig.color](`[${relativeTime}ms]`)} ${event.message}`);
  });
  console.log();
}

// Update statistics
function updateStats(log, patterns) {
  stats.total++;
  
  // Level stats
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
  stats.levels[level] = (stats.levels[level] || 0) + 1;
  
  // Component stats
  const component = log.context || log.name || 'System';
  stats.components[component] = (stats.components[component] || 0) + 1;
  
  // Pattern stats
  patterns.forEach(p => {
    stats.patterns[p.name] = (stats.patterns[p.name] || 0) + 1;
  });
  
  // Error tracking
  if (level === 'ERROR' || level === 'FATAL') {
    stats.errors.push({
      time: log.time,
      component,
      message: log.msg,
      error: log.error || log.err
    });
  }
  
  // Performance tracking
  if (log.duration) {
    stats.performance.push({
      operation: log.operation || log.type || 'unknown',
      duration: parseFloat(log.duration),
      component,
      time: log.time
    });
  }
}

// Show statistics dashboard
function showStats() {
  console.clear();
  console.log(chalk.bold.underline('Enhanced Log Statistics Dashboard'));
  console.log(chalk.gray(`Last Updated: ${new Date().toLocaleTimeString()}`));
  console.log();
  
  // Overview
  console.log(chalk.bold('📊 Overview:'));
  console.log(`  Total Logs: ${chalk.cyan(stats.total)}`);
  console.log(`  Active Requests: ${chalk.cyan(stats.requestFlows.size)}`);
  console.log(`  Saved Important Logs: ${chalk.cyan(stats.savedLogs.length)}`);
  console.log();
  
  // Log levels
  console.log(chalk.bold('📈 Log Levels:'));
  Object.entries(stats.levels)
    .sort(([a], [b]) => LOG_LEVELS[b].priority - LOG_LEVELS[a].priority)
    .forEach(([level, count]) => {
      const config = LOG_LEVELS[level] || LOG_LEVELS.INFO;
      const percentage = ((count / stats.total) * 100).toFixed(1);
      const bar = '█'.repeat(Math.floor(percentage / 2));
      console.log(`  ${config.icon} ${chalk[config.textColor](level.padEnd(5))} ${count.toString().padStart(6)} ${chalk.gray(bar)} ${percentage}%`);
    });
  console.log();
  
  // Top components
  console.log(chalk.bold('🔧 Top Components:'));
  Object.entries(stats.components)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .forEach(([component, count]) => {
      const config = COMPONENTS[component] || COMPONENTS.System;
      console.log(`  ${config.icon} ${chalk[config.color](component.padEnd(20))} ${count.toString().padStart(6)}`);
    });
  console.log();
  
  // Pattern detection
  console.log(chalk.bold('🎯 Detected Patterns:'));
  Object.entries(stats.patterns)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .forEach(([pattern, count]) => {
      const config = EVENT_PATTERNS[pattern];
      if (config) {
        console.log(`  ${config.icon} ${chalk[config.color](pattern.replace(/_/g, ' ').padEnd(20))} ${count.toString().padStart(6)}`);
      }
    });
  console.log();
  
  // Recent errors
  if (stats.errors.length > 0) {
    console.log(chalk.bold.red(`🚨 Recent Errors (${stats.errors.length} total):`));
    stats.errors.slice(-5).forEach(error => {
      const time = new Date(error.time).toLocaleTimeString();
      console.log(`  ${chalk.red('•')} ${chalk.gray(`[${time}]`)} ${chalk.cyan(`[${error.component}]`)} ${error.message}`);
    });
    console.log();
  }
  
  // Performance insights
  if (stats.performance.length > 0) {
    const sorted = [...stats.performance].sort((a, b) => b.duration - a.duration);
    console.log(chalk.bold('⏱️  Slowest Operations:'));
    sorted.slice(0, 5).forEach(perf => {
      let color = 'green';
      if (perf.duration > 1000) color = 'red';
      else if (perf.duration > 500) color = 'yellow';
      console.log(`  ${chalk[color]('•')} ${perf.operation.padEnd(25)} ${chalk[color](perf.duration.toFixed(2) + 'ms')} ${chalk.gray(`[${perf.component}]`)}`);
    });
    
    const avg = stats.performance.reduce((sum, p) => sum + p.duration, 0) / stats.performance.length;
    console.log(chalk.bold('\n  Average Operation Time:'), chalk.magenta(avg.toFixed(2) + 'ms'));
  }
  
  console.log('\n' + chalk.gray('Press Ctrl+C to exit | R to show request flows'));
}

// Process log line
function processLogLine(line) {
  if (!line.trim()) return;
  
  const log = parseLogLine(line);
  
  // Convert numeric level to string
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
  
  // Level filter
  const minPriority = LOG_LEVELS[options.level]?.priority || LOG_LEVELS.INFO.priority;
  const logPriority = LOG_LEVELS[logLevel]?.priority || LOG_LEVELS.INFO.priority;
  if (logPriority < minPriority) return;
  
  // Component filter
  const component = log.context || log.name || 'System';
  if (options.component && component !== options.component) return;
  
  // Regex filter
  if (options.filter) {
    const searchText = JSON.stringify(log);
    if (!options.filter.test(searchText)) return;
  }
  
  // Detect patterns
  const patterns = detectPatterns(log);
  
  // Pattern filter
  if (options.pattern && !patterns.some(p => p.name === options.pattern)) return;
  
  // Update statistics
  updateStats(log, patterns);
  
  // Track request flow
  if (options.requestFlow) {
    trackRequestFlow(log);
  }
  
  // Save important logs
  saveImportantLog(log, patterns);
  
  // Stats mode
  if (options.stats) {
    return; // Don't output individual logs in stats mode
  }
  
  // Output formatted log
  console.log(formatLog(log, patterns));
  
  // Show request flow if completed
  if (options.requestFlow && log.type === 'api_response' && log.requestId) {
    setTimeout(() => showRequestFlow(log.requestId), 100);
  }
}

// Main monitoring function
async function monitorLogs() {
  const logFile = options.file || findLatestLogFile();
  
  console.log(chalk.green.bold('🚀 Enhanced Log Monitor Started'));
  console.log(chalk.gray(`Monitoring: ${logFile}`));
  console.log(chalk.gray(`Level: ${options.level} | Component: ${options.component || 'All'} | Pattern: ${options.pattern || 'All'}`));
  if (options.save) {
    console.log(chalk.yellow(`Saving important logs to: ${SAVED_LOGS_DIR}`));
  }
  console.log(chalk.gray('Press Ctrl+C to exit\n'));
  
  if (options.stats) {
    // Stats mode - refresh periodically
    setInterval(showStats, 1000);
    
    // Handle keyboard input for request flows
    process.stdin.setRawMode(true);
    process.stdin.on('data', (key) => {
      if (key.toString() === 'r' || key.toString() === 'R') {
        console.clear();
        console.log(chalk.bold('Recent Request Flows:'));
        const recentFlows = [...stats.requestFlows.entries()].slice(-5);
        recentFlows.forEach(([id, flow]) => {
          showRequestFlow(id);
        });
      }
    });
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
    
    // Show summary if saving logs
    if (options.save && stats.savedLogs.length > 0) {
      console.log(chalk.yellow(`\nSaved ${stats.savedLogs.length} important log entries to ${SAVED_LOGS_DIR}`));
    }
    
    process.exit(code || 0);
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n📊 Session Summary:'));
    console.log(`  Total Logs Processed: ${stats.total}`);
    console.log(`  Errors Detected: ${stats.errors.length}`);
    console.log(`  Request Flows Tracked: ${stats.requestFlows.size}`);
    if (options.save) {
      console.log(`  Important Logs Saved: ${stats.savedLogs.length}`);
    }
    console.log(chalk.gray('\nShutting down...'));
    tail.kill();
    process.exit(0);
  });
}

// Start monitoring
monitorLogs().catch(error => {
  console.error(chalk.red(`Error: ${error.message}`));
  process.exit(1);
});