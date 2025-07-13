#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import chalk from 'chalk';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SAVED_LOGS_DIR = path.join(process.cwd(), 'logs', 'analysis');

// Analysis categories
const ANALYSIS_CATEGORIES = {
  REQUEST_FLOW: {
    name: 'Request Flow Analysis',
    icon: '🔄',
    analyze: analyzeRequestFlows
  },
  ERROR_PATTERNS: {
    name: 'Error Pattern Analysis',
    icon: '🚨',
    analyze: analyzeErrorPatterns
  },
  PERFORMANCE_BOTTLENECKS: {
    name: 'Performance Bottleneck Analysis',
    icon: '⏱️',
    analyze: analyzePerformance
  },
  COMPONENT_INTERACTIONS: {
    name: 'Component Interaction Analysis',
    icon: '🔗',
    analyze: analyzeComponentInteractions
  },
  SECURITY_EVENTS: {
    name: 'Security Event Analysis',
    icon: '🔒',
    analyze: analyzeSecurityEvents
  }
};

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  file: null,
  category: null,
  output: 'console',
  format: 'text',
  dateRange: null
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--file':
    case '-f':
      options.file = args[++i];
      break;
    case '--category':
    case '-c':
      options.category = args[++i];
      break;
    case '--output':
    case '-o':
      options.output = args[++i];
      break;
    case '--format':
      options.format = args[++i];
      break;
    case '--date':
    case '-d':
      options.dateRange = args[++i];
      break;
    case '--help':
    case '-h':
      showHelp();
      process.exit(0);
  }
}

function showHelp() {
  console.log(`
${chalk.bold('Log Analysis Tool - Analyze saved log patterns')}

${chalk.underline('Usage:')}
  node scripts/analyze-logs.js [options]

${chalk.underline('Options:')}
  -f, --file <file>      Specific log file to analyze
  -c, --category <cat>   Analysis category (see below)
  -o, --output <file>    Output file for results (default: console)
  -d, --date <range>     Date range (e.g., "2025-07-13" or "2025-07-12..2025-07-13")
  --format <fmt>         Output format: text, json, markdown (default: text)
  -h, --help             Show this help message

${chalk.underline('Analysis Categories:')}
${Object.entries(ANALYSIS_CATEGORIES).map(([key, cat]) => 
  `  ${cat.icon}  ${key.padEnd(25)} - ${cat.name}`
).join('\n')}

${chalk.underline('Examples:')}
  # Analyze all error patterns
  node scripts/analyze-logs.js -c ERROR_PATTERNS

  # Analyze today's performance issues
  node scripts/analyze-logs.js -c PERFORMANCE_BOTTLENECKS -d $(date +%Y-%m-%d)

  # Generate markdown report of request flows
  node scripts/analyze-logs.js -c REQUEST_FLOW --format markdown -o request-flow-report.md
`);
}

// Load saved logs
async function loadLogs() {
  if (!fs.existsSync(SAVED_LOGS_DIR)) {
    console.error(chalk.red(`Saved logs directory not found: ${SAVED_LOGS_DIR}`));
    console.log(chalk.yellow('Run the enhanced monitor with --save flag first'));
    process.exit(1);
  }

  const logs = [];
  let files = fs.readdirSync(SAVED_LOGS_DIR)
    .filter(f => f.startsWith('important-logs-') && f.endsWith('.json'));

  // Filter by date if specified
  if (options.dateRange) {
    const dates = options.dateRange.split('..');
    const startDate = new Date(dates[0]);
    const endDate = dates[1] ? new Date(dates[1]) : startDate;
    
    files = files.filter(f => {
      const fileDate = f.match(/important-logs-(\d{4}-\d{2}-\d{2})/)[1];
      const date = new Date(fileDate);
      return date >= startDate && date <= endDate;
    });
  }

  // Load specific file or all files
  if (options.file) {
    files = [options.file];
  }

  for (const file of files) {
    const filepath = path.join(SAVED_LOGS_DIR, file);
    try {
      const content = fs.readFileSync(filepath, 'utf8');
      const lines = content.trim().split('\n');
      lines.forEach(line => {
        try {
          logs.push(JSON.parse(line));
        } catch (e) {
          // Skip invalid lines
        }
      });
    } catch (error) {
      console.error(chalk.red(`Error reading file ${file}: ${error.message}`));
    }
  }

  return logs;
}

// Analysis functions
function analyzeRequestFlows(logs) {
  const flows = new Map();
  
  logs.forEach(entry => {
    const log = entry.log;
    if (!log.requestId) return;
    
    if (!flows.has(log.requestId)) {
      flows.set(log.requestId, {
        id: log.requestId,
        events: [],
        components: new Set(),
        duration: null,
        status: 'unknown'
      });
    }
    
    const flow = flows.get(log.requestId);
    flow.events.push({
      time: log.time,
      component: log.context || 'System',
      message: log.msg,
      level: log.level,
      patterns: entry.patterns
    });
    flow.components.add(log.context || 'System');
    
    // Determine status
    if (log.level >= 50) flow.status = 'error';
    else if (log.statusCode >= 400) flow.status = 'failed';
    else if (log.type === 'api_response') flow.status = 'completed';
  });
  
  // Calculate durations
  flows.forEach(flow => {
    if (flow.events.length > 1) {
      const first = flow.events[0].time;
      const last = flow.events[flow.events.length - 1].time;
      flow.duration = last - first;
    }
  });
  
  return {
    title: 'Request Flow Analysis',
    summary: {
      totalFlows: flows.size,
      completedFlows: [...flows.values()].filter(f => f.status === 'completed').length,
      errorFlows: [...flows.values()].filter(f => f.status === 'error').length,
      avgDuration: calculateAverage([...flows.values()].map(f => f.duration).filter(Boolean))
    },
    details: [...flows.values()].sort((a, b) => (b.duration || 0) - (a.duration || 0)).slice(0, 10),
    insights: generateRequestFlowInsights(flows)
  };
}

function analyzeErrorPatterns(logs) {
  const errors = logs.filter(entry => {
    const level = entry.log.level;
    return (typeof level === 'number' && level >= 50) || 
           (typeof level === 'string' && ['ERROR', 'FATAL'].includes(level.toUpperCase()));
  });
  
  const errorsByComponent = {};
  const errorsByType = {};
  const errorTimeline = {};
  
  errors.forEach(entry => {
    const component = entry.log.context || 'System';
    const errorType = entry.log.error?.name || entry.log.error?.type || 'Unknown';
    const hour = new Date(entry.log.time).getHours();
    
    errorsByComponent[component] = (errorsByComponent[component] || 0) + 1;
    errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
    errorTimeline[hour] = (errorTimeline[hour] || 0) + 1;
  });
  
  return {
    title: 'Error Pattern Analysis',
    summary: {
      totalErrors: errors.length,
      uniqueComponents: Object.keys(errorsByComponent).length,
      uniqueTypes: Object.keys(errorsByType).length,
      peakHour: Object.entries(errorTimeline).sort(([,a], [,b]) => b - a)[0]?.[0]
    },
    details: {
      byComponent: sortObject(errorsByComponent),
      byType: sortObject(errorsByType),
      timeline: errorTimeline,
      recentErrors: errors.slice(-10).map(e => ({
        time: new Date(e.log.time).toLocaleString(),
        component: e.log.context,
        message: e.log.msg,
        type: e.log.error?.name
      }))
    },
    insights: generateErrorInsights(errors, errorsByComponent, errorsByType)
  };
}

function analyzePerformance(logs) {
  const perfLogs = logs.filter(entry => entry.log.duration);
  
  const operations = {};
  const slowOperations = [];
  const componentPerf = {};
  
  perfLogs.forEach(entry => {
    const duration = parseFloat(entry.log.duration);
    const operation = entry.log.operation || entry.log.type || 'unknown';
    const component = entry.log.context || 'System';
    
    if (!operations[operation]) {
      operations[operation] = { count: 0, total: 0, max: 0, min: Infinity };
    }
    
    operations[operation].count++;
    operations[operation].total += duration;
    operations[operation].max = Math.max(operations[operation].max, duration);
    operations[operation].min = Math.min(operations[operation].min, duration);
    
    if (duration > 1000) {
      slowOperations.push({
        time: new Date(entry.log.time).toLocaleString(),
        operation,
        component,
        duration,
        message: entry.log.msg
      });
    }
    
    if (!componentPerf[component]) {
      componentPerf[component] = { count: 0, total: 0 };
    }
    componentPerf[component].count++;
    componentPerf[component].total += duration;
  });
  
  // Calculate averages
  Object.values(operations).forEach(op => {
    op.avg = op.total / op.count;
  });
  
  Object.values(componentPerf).forEach(comp => {
    comp.avg = comp.total / comp.count;
  });
  
  return {
    title: 'Performance Analysis',
    summary: {
      totalOperations: perfLogs.length,
      avgDuration: calculateAverage(perfLogs.map(e => parseFloat(e.log.duration))),
      slowOperations: slowOperations.length,
      slowestOperation: Object.entries(operations).sort(([,a], [,b]) => b.avg - a.avg)[0]?.[0]
    },
    details: {
      operations: Object.entries(operations)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 10),
      slowOperations: slowOperations.sort((a, b) => b.duration - a.duration).slice(0, 10),
      componentPerformance: Object.entries(componentPerf)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.avg - a.avg)
    },
    insights: generatePerformanceInsights(operations, slowOperations, componentPerf)
  };
}

function analyzeComponentInteractions(logs) {
  const interactions = new Map();
  const components = new Set();
  
  // Group logs by request ID to track interactions
  const requestGroups = new Map();
  logs.forEach(entry => {
    const requestId = entry.log.requestId;
    if (!requestId) return;
    
    if (!requestGroups.has(requestId)) {
      requestGroups.set(requestId, []);
    }
    requestGroups.get(requestId).push(entry);
  });
  
  // Analyze interactions within each request
  requestGroups.forEach(group => {
    group.sort((a, b) => a.log.time - b.log.time);
    
    for (let i = 0; i < group.length - 1; i++) {
      const from = group[i].log.context || 'System';
      const to = group[i + 1].log.context || 'System';
      
      components.add(from);
      components.add(to);
      
      const key = `${from} → ${to}`;
      if (!interactions.has(key)) {
        interactions.set(key, { count: 0, patterns: new Set() });
      }
      
      const interaction = interactions.get(key);
      interaction.count++;
      group[i].patterns.forEach(p => interaction.patterns.add(p));
    }
  });
  
  return {
    title: 'Component Interaction Analysis',
    summary: {
      totalComponents: components.size,
      totalInteractions: [...interactions.values()].reduce((sum, i) => sum + i.count, 0),
      uniqueInteractionPaths: interactions.size,
      mostActiveComponent: findMostActive(interactions)
    },
    details: {
      interactions: [...interactions.entries()]
        .map(([path, data]) => ({
          path,
          count: data.count,
          patterns: [...data.patterns]
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      componentActivity: calculateComponentActivity(interactions, components)
    },
    insights: generateInteractionInsights(interactions, components)
  };
}

function analyzeSecurityEvents(logs) {
  const securityPatterns = [
    { pattern: /auth|login|token|credential/i, type: 'authentication' },
    { pattern: /denied|forbidden|unauthorized/i, type: 'authorization' },
    { pattern: /injection|xss|csrf/i, type: 'attack_attempt' },
    { pattern: /rate.?limit|throttl/i, type: 'rate_limiting' },
    { pattern: /encrypt|decrypt|hash/i, type: 'cryptography' },
    { pattern: /validat|sanitiz/i, type: 'validation' }
  ];
  
  const securityEvents = [];
  const eventsByType = {};
  const eventsByComponent = {};
  
  logs.forEach(entry => {
    const text = JSON.stringify(entry.log).toLowerCase();
    
    securityPatterns.forEach(({ pattern, type }) => {
      if (pattern.test(text)) {
        securityEvents.push({
          time: new Date(entry.log.time).toLocaleString(),
          type,
          component: entry.log.context || 'System',
          message: entry.log.msg,
          level: entry.log.level,
          patterns: entry.patterns
        });
        
        eventsByType[type] = (eventsByType[type] || 0) + 1;
        const component = entry.log.context || 'System';
        eventsByComponent[component] = (eventsByComponent[component] || 0) + 1;
      }
    });
  });
  
  return {
    title: 'Security Event Analysis',
    summary: {
      totalEvents: securityEvents.length,
      uniqueTypes: Object.keys(eventsByType).length,
      affectedComponents: Object.keys(eventsByComponent).length,
      mostCommonType: Object.entries(eventsByType).sort(([,a], [,b]) => b - a)[0]?.[0]
    },
    details: {
      byType: sortObject(eventsByType),
      byComponent: sortObject(eventsByComponent),
      recentEvents: securityEvents.slice(-20),
      criticalEvents: securityEvents.filter(e => 
        e.type === 'attack_attempt' || 
        (typeof e.level === 'number' && e.level >= 50)
      )
    },
    insights: generateSecurityInsights(securityEvents, eventsByType, eventsByComponent)
  };
}

// Helper functions
function calculateAverage(numbers) {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function sortObject(obj) {
  return Object.entries(obj)
    .sort(([,a], [,b]) => b - a)
    .reduce((sorted, [key, value]) => {
      sorted[key] = value;
      return sorted;
    }, {});
}

function findMostActive(interactions) {
  const componentCounts = {};
  
  interactions.forEach((data, path) => {
    const [from, to] = path.split(' → ');
    componentCounts[from] = (componentCounts[from] || 0) + data.count;
    componentCounts[to] = (componentCounts[to] || 0) + data.count;
  });
  
  return Object.entries(componentCounts).sort(([,a], [,b]) => b - a)[0]?.[0];
}

function calculateComponentActivity(interactions, components) {
  const activity = {};
  
  components.forEach(comp => {
    activity[comp] = { outgoing: 0, incoming: 0, total: 0 };
  });
  
  interactions.forEach((data, path) => {
    const [from, to] = path.split(' → ');
    activity[from].outgoing += data.count;
    activity[to].incoming += data.count;
    activity[from].total += data.count;
    activity[to].total += data.count;
  });
  
  return Object.entries(activity)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.total - a.total);
}

// Insight generation functions
function generateRequestFlowInsights(flows) {
  const insights = [];
  
  const slowFlows = [...flows.values()].filter(f => f.duration > 5000);
  if (slowFlows.length > 0) {
    insights.push({
      type: 'performance',
      severity: 'warning',
      message: `${slowFlows.length} request flows took more than 5 seconds`,
      recommendation: 'Investigate slow endpoints and optimize database queries'
    });
  }
  
  const errorRate = [...flows.values()].filter(f => f.status === 'error').length / flows.size;
  if (errorRate > 0.05) {
    insights.push({
      type: 'reliability',
      severity: 'critical',
      message: `Error rate is ${(errorRate * 100).toFixed(1)}% (above 5% threshold)`,
      recommendation: 'Review error logs and implement better error handling'
    });
  }
  
  return insights;
}

function generateErrorInsights(errors, byComponent, byType) {
  const insights = [];
  
  // Component-specific insights
  const topComponent = Object.entries(byComponent).sort(([,a], [,b]) => b - a)[0];
  if (topComponent && topComponent[1] > errors.length * 0.3) {
    insights.push({
      type: 'component_health',
      severity: 'warning',
      message: `${topComponent[0]} is responsible for ${((topComponent[1] / errors.length) * 100).toFixed(1)}% of errors`,
      recommendation: `Focus debugging efforts on ${topComponent[0]} component`
    });
  }
  
  // Error type insights
  if (byType['TypeError'] > 5) {
    insights.push({
      type: 'code_quality',
      severity: 'warning',
      message: `${byType['TypeError']} TypeErrors detected`,
      recommendation: 'Add type checking and validation to prevent runtime type errors'
    });
  }
  
  return insights;
}

function generatePerformanceInsights(operations, slowOps, componentPerf) {
  const insights = [];
  
  // Slow operation insights
  if (slowOps.length > 10) {
    insights.push({
      type: 'performance',
      severity: 'critical',
      message: `${slowOps.length} operations took more than 1 second`,
      recommendation: 'Implement caching and optimize database queries'
    });
  }
  
  // Operation-specific insights
  const dbOps = Object.entries(operations).filter(([name]) => 
    name.includes('database') || name.includes('query')
  );
  if (dbOps.length > 0) {
    const avgDbTime = dbOps.reduce((sum, [, stats]) => sum + stats.avg, 0) / dbOps.length;
    if (avgDbTime > 100) {
      insights.push({
        type: 'database',
        severity: 'warning',
        message: `Average database operation time is ${avgDbTime.toFixed(2)}ms`,
        recommendation: 'Consider adding database indexes or connection pooling'
      });
    }
  }
  
  return insights;
}

function generateInteractionInsights(interactions, components) {
  const insights = [];
  
  // Coupling insights
  const highTrafficPaths = [...interactions.entries()]
    .filter(([, data]) => data.count > 100)
    .map(([path]) => path);
  
  if (highTrafficPaths.length > 0) {
    insights.push({
      type: 'architecture',
      severity: 'info',
      message: `${highTrafficPaths.length} high-traffic interaction paths detected`,
      recommendation: 'Consider implementing caching or message queuing for these paths'
    });
  }
  
  return insights;
}

function generateSecurityInsights(events, byType, byComponent) {
  const insights = [];
  
  if (byType['attack_attempt'] > 0) {
    insights.push({
      type: 'security',
      severity: 'critical',
      message: `${byType['attack_attempt']} potential attack attempts detected`,
      recommendation: 'Review security logs and strengthen input validation'
    });
  }
  
  if (byType['authorization'] > 10) {
    insights.push({
      type: 'security',
      severity: 'warning',
      message: `${byType['authorization']} authorization failures detected`,
      recommendation: 'Review access control policies and user permissions'
    });
  }
  
  return insights;
}

// Output formatters
function formatText(result) {
  console.log(chalk.bold.underline(`\n${result.title}`));
  console.log();
  
  // Summary
  console.log(chalk.bold('Summary:'));
  Object.entries(result.summary).forEach(([key, value]) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    console.log(`  ${label}: ${chalk.cyan(value)}`);
  });
  console.log();
  
  // Details
  if (result.details) {
    console.log(chalk.bold('Details:'));
    console.log(JSON.stringify(result.details, null, 2));
    console.log();
  }
  
  // Insights
  if (result.insights && result.insights.length > 0) {
    console.log(chalk.bold('Insights:'));
    result.insights.forEach(insight => {
      const color = insight.severity === 'critical' ? 'red' : 
                   insight.severity === 'warning' ? 'yellow' : 'blue';
      console.log(`  ${chalk[color]('•')} ${insight.message}`);
      console.log(`    ${chalk.gray('→')} ${insight.recommendation}`);
    });
  }
}

function formatJSON(result) {
  return JSON.stringify(result, null, 2);
}

function formatMarkdown(result) {
  let md = `# ${result.title}\n\n`;
  
  md += `## Summary\n\n`;
  Object.entries(result.summary).forEach(([key, value]) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    md += `- **${label}**: ${value}\n`;
  });
  md += '\n';
  
  if (result.insights && result.insights.length > 0) {
    md += `## Insights\n\n`;
    result.insights.forEach(insight => {
      const icon = insight.severity === 'critical' ? '🔴' : 
                  insight.severity === 'warning' ? '🟡' : '🔵';
      md += `${icon} **${insight.message}**\n`;
      md += `   - Recommendation: ${insight.recommendation}\n\n`;
    });
  }
  
  if (result.details) {
    md += `## Detailed Analysis\n\n`;
    md += '```json\n';
    md += JSON.stringify(result.details, null, 2);
    md += '\n```\n';
  }
  
  return md;
}

// Main analysis function
async function analyze() {
  console.log(chalk.blue('Loading saved logs...'));
  const logs = await loadLogs();
  
  if (logs.length === 0) {
    console.error(chalk.red('No logs found to analyze'));
    process.exit(1);
  }
  
  console.log(chalk.green(`Loaded ${logs.length} log entries`));
  
  // Run analysis
  let results = [];
  
  if (options.category) {
    const category = ANALYSIS_CATEGORIES[options.category];
    if (!category) {
      console.error(chalk.red(`Unknown category: ${options.category}`));
      process.exit(1);
    }
    results.push(category.analyze(logs));
  } else {
    // Run all analyses
    for (const [key, category] of Object.entries(ANALYSIS_CATEGORIES)) {
      console.log(chalk.gray(`Running ${category.name}...`));
      results.push(category.analyze(logs));
    }
  }
  
  // Format and output results
  let output = '';
  
  results.forEach(result => {
    switch (options.format) {
      case 'json':
        output += formatJSON(result) + '\n';
        break;
      case 'markdown':
        output += formatMarkdown(result) + '\n';
        break;
      default:
        formatText(result);
    }
  });
  
  // Save to file if specified
  if (options.output !== 'console') {
    fs.writeFileSync(options.output, output);
    console.log(chalk.green(`\nResults saved to: ${options.output}`));
  } else if (options.format !== 'text') {
    console.log(output);
  }
}

// Run analysis
analyze().catch(error => {
  console.error(chalk.red(`Error: ${error.message}`));
  process.exit(1);
});