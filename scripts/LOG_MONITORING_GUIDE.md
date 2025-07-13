# Real-Time Log Monitoring Guide

This guide explains how to use the enhanced log monitoring tools for debugging and analyzing the Polkadot Analysis Tool.

## Quick Start

### 1. Basic Real-Time Monitoring

Monitor all logs with color-coded output:
```bash
node scripts/monitor-logs-enhanced.js
```

### 2. Filter by Component

Monitor specific components:
```bash
# Monitor GraphController only
node scripts/monitor-logs-enhanced.js -c GraphController

# Monitor RealDataService
node scripts/monitor-logs-enhanced.js -c RealDataService

# Monitor DatabaseService
node scripts/monitor-logs-enhanced.js -c DatabaseService
```

### 3. Filter by Log Level

```bash
# Show only errors and above
node scripts/monitor-logs-enhanced.js -l ERROR

# Show debug logs and above
node scripts/monitor-logs-enhanced.js -l DEBUG
```

### 4. Pattern Matching

Monitor specific event patterns:
```bash
# Monitor database queries
node scripts/monitor-logs-enhanced.js -p DATABASE_QUERY

# Monitor API requests
node scripts/monitor-logs-enhanced.js -p API_REQUEST

# Monitor service creation
node scripts/monitor-logs-enhanced.js -p SERVICE_CREATION
```

### 5. Request Flow Tracking

Track complete request flows:
```bash
node scripts/monitor-logs-enhanced.js -r
```

### 6. Save Important Logs

Save critical logs for later analysis:
```bash
node scripts/monitor-logs-enhanced.js --save -l ERROR
```

## Advanced Usage

### Combined Filters

Monitor GraphController database operations:
```bash
node scripts/monitor-logs-enhanced.js -c GraphController -p DATABASE_QUERY
```

### Statistics Dashboard

View real-time statistics:
```bash
node scripts/monitor-logs-enhanced.js -s
```

### Custom Pattern Search

Search for specific text patterns:
```bash
node scripts/monitor-logs-enhanced.js -g "timeout|slow|performance"
```

## Log Analysis

After collecting logs with `--save`, analyze them:

### Generate Complete Analysis Report
```bash
node scripts/analyze-logs.js
```

### Analyze Specific Categories
```bash
# Error patterns
node scripts/analyze-logs.js -c ERROR_PATTERNS

# Performance bottlenecks
node scripts/analyze-logs.js -c PERFORMANCE_BOTTLENECKS

# Component interactions
node scripts/analyze-logs.js -c COMPONENT_INTERACTIONS

# Request flows
node scripts/analyze-logs.js -c REQUEST_FLOW

# Security events
node scripts/analyze-logs.js -c SECURITY_EVENTS
```

### Generate Reports
```bash
# Generate markdown report
node scripts/analyze-logs.js -c ERROR_PATTERNS --format markdown -o error-report.md

# Generate JSON report
node scripts/analyze-logs.js --format json -o analysis-report.json
```

## Color Coding Reference

### Log Levels
- 💀 **FATAL** (Red background) - Critical system failures
- ❌ **ERROR** (Red) - Errors that need attention
- ⚠️  **WARN** (Yellow) - Warning conditions
- ℹ️  **INFO** (Green) - Informational messages
- 🔍 **DEBUG** (Blue) - Debug information
- 📝 **TRACE** (Gray) - Detailed trace logs

### Components
- 📊 **GraphController** (Cyan) - Graph operations
- 📡 **RealDataService** (Green) - Real data service
- 💿 **DatabaseService** (Blue) - Database operations
- 🔗 **WebSocketService** (Magenta) - WebSocket connections
- 🗃️  **CacheService** (Yellow) - Cache operations
- 🚦 **ApiRouter** (Bright Green) - API routing
- 🔍 **SubscanService** (Bright Blue) - Subscan integration
- 🎯 **PatternDetector** (Bright Magenta) - Pattern detection
- 📈 **RelationshipScorer** (Bright Yellow) - Relationship scoring

### Event Patterns
- 🔧 **SERVICE_CREATION** - Service initialization
- 📞 **METHOD_CALL** - Method invocations
- ✓ **CONDITION_CHECK** - Validation checks
- 🗄️  **DATABASE_QUERY** - Database operations
- 🌐 **API_REQUEST** - API calls
- 🔌 **WEBSOCKET** - WebSocket events
- 🕸️  **GRAPH_OPERATION** - Graph manipulations
- ⏱️  **PERFORMANCE** - Performance metrics
- 💾 **CACHE** - Cache operations
- 🚨 **ERROR_PATTERN** - Error conditions

## Performance Indicators

The monitor shows performance metrics with color coding:
- 🟢 **Green** - Fast operations (<500ms)
- 🟡 **Yellow** - Moderate operations (500-1000ms)
- 🔴 **Red** - Slow operations (>1000ms)

## Debugging Workflows

### 1. Debug Service Initialization
```bash
# Monitor service creation and initialization
node scripts/monitor-logs-enhanced.js -p SERVICE_CREATION -l DEBUG --save
```

### 2. Debug Slow Requests
```bash
# Track request flows and performance
node scripts/monitor-logs-enhanced.js -r -p PERFORMANCE --save

# Analyze performance bottlenecks
node scripts/analyze-logs.js -c PERFORMANCE_BOTTLENECKS
```

### 3. Debug Database Issues
```bash
# Monitor database queries
node scripts/monitor-logs-enhanced.js -c DatabaseService -p DATABASE_QUERY

# Look for slow queries
node scripts/monitor-logs-enhanced.js -g "duration.*[0-9]{4,}" -c DatabaseService
```

### 4. Debug WebSocket Connections
```bash
# Monitor WebSocket events
node scripts/monitor-logs-enhanced.js -c WebSocketService -p WEBSOCKET
```

### 5. Debug Graph Operations
```bash
# Monitor graph operations with request flow
node scripts/monitor-logs-enhanced.js -c GraphController -r --save

# Analyze component interactions
node scripts/analyze-logs.js -c COMPONENT_INTERACTIONS
```

## Tips

1. **Start broad, then narrow**: Begin with general monitoring, then filter based on what you find
2. **Use --save for post-mortem analysis**: Save logs during problem reproduction for detailed analysis
3. **Combine filters**: Use multiple filters to focus on specific scenarios
4. **Watch for patterns**: The pattern highlighting helps identify common issues
5. **Use request flow tracking**: Essential for understanding the complete lifecycle of API requests
6. **Regular analysis**: Run analysis periodically to identify trends and recurring issues

## Common Debugging Scenarios

### "The graph isn't loading"
```bash
node scripts/monitor-logs-enhanced.js -c GraphController -p GRAPH_OPERATION -r
```

### "API is slow"
```bash
node scripts/monitor-logs-enhanced.js -p API_REQUEST -g "duration.*[0-9]{4,}" --save
node scripts/analyze-logs.js -c PERFORMANCE_BOTTLENECKS
```

### "Getting database errors"
```bash
node scripts/monitor-logs-enhanced.js -c DatabaseService -l ERROR --save
node scripts/analyze-logs.js -c ERROR_PATTERNS
```

### "WebSocket disconnecting"
```bash
node scripts/monitor-logs-enhanced.js -c WebSocketService -p WEBSOCKET -l WARN
```

### "Security concerns"
```bash
node scripts/monitor-logs-enhanced.js --save
node scripts/analyze-logs.js -c SECURITY_EVENTS
```