import pino from 'pino';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { performance } from 'perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Enhanced debug mode - set to 'debug' for comprehensive logging
const logLevel = process.env.LOG_LEVEL || 'debug';
const isDevelopment = process.env.NODE_ENV === 'development';
const enableFileLogging = process.env.ENABLE_FILE_LOGGING === 'true';

// Create logs directory if it doesn't exist
const logsDir = join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create logger configuration
const pinoConfig = {
  level: logLevel,
  formatters: {
    bindings: (bindings) => {
      return {
        pid: bindings.pid,
        host: bindings.hostname,
        node_version: process.version,
        app: 'polkadot-analysis-tool'
      };
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: 'msg',
  errorKey: 'err'
};

// Set up multiple transports
const transports = [];

// Console transport
if (isDevelopment) {
  transports.push({
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'SYS:standard',
      messageFormat: '{levelLabel} [{context}] {msg}'
    }
  });
} else {
  transports.push({
    target: 'pino/file',
    options: { destination: 1 } // stdout
  });
}

// File transport for persistent logging
if (enableFileLogging || logLevel === 'debug') {
  transports.push({
    target: 'pino/file',
    options: {
      destination: join(logsDir, `app-${new Date().toISOString().split('T')[0]}.log`),
      mkdir: true
    }
  });
}

// Use transport if we have any
if (transports.length > 0) {
  pinoConfig.transport = {
    targets: transports
  };
}

// Create logger instance
export const logger = pino(pinoConfig);

// Performance tracking map
const performanceTrackers = new Map();

// Enhanced logging utilities
export const createLogger = (context) => {
  return logger.child({ context });
};

// Method entry/exit logging
export const logMethodEntry = (className, methodName, args = {}) => {
  const trackerId = `${className}.${methodName}-${Date.now()}`;
  performanceTrackers.set(trackerId, performance.now());

  logger.debug({
    type: 'method_entry',
    class: className,
    method: methodName,
    args: Object.keys(args).length > 0 ? args : undefined,
    trackerId
  }, `Entering ${className}.${methodName}`);

  return trackerId;
};

export const logMethodExit = (className, methodName, trackerId, result = undefined) => {
  const startTime = performanceTrackers.get(trackerId);
  const duration = startTime ? performance.now() - startTime : 0;
  performanceTrackers.delete(trackerId);

  logger.debug({
    type: 'method_exit',
    class: className,
    method: methodName,
    duration: `${duration.toFixed(2)}ms`,
    hasResult: result !== undefined,
    trackerId
  }, `Exiting ${className}.${methodName} (${duration.toFixed(2)}ms)`);
};

// Database query logging
export const logDatabaseQuery = (query, params = [], duration = null) => {
  logger.debug({
    type: 'database_query',
    query: query.substring(0, 500), // Truncate long queries
    params: params.length > 0 ? params : undefined,
    paramCount: params.length,
    duration: duration ? `${duration.toFixed(2)}ms` : undefined
  }, 'Database query executed');
};

// API request/response logging
export const logApiRequest = (req) => {
  logger.info({
    type: 'api_request',
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    requestId: req.id
  }, `${req.method} ${req.path}`);
};

export const logApiResponse = (req, res, duration) => {
  logger.info({
    type: 'api_response',
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    duration: `${duration.toFixed(2)}ms`,
    requestId: req.id
  }, `${req.method} ${req.path} - ${res.statusCode} (${duration.toFixed(2)}ms)`);
};

// WebSocket event logging
export const logWebSocketEvent = (eventType, socketId, data = {}) => {
  logger.debug({
    type: 'websocket_event',
    event: eventType,
    socketId,
    data: Object.keys(data).length > 0 ? data : undefined
  }, `WebSocket event: ${eventType}`);
};

// Error logging with stack trace
export const logError = (error, context = {}) => {
  logger.error({
    type: 'error',
    error: {
      message: error.message,
      name: error.name,
      stack: error.stack,
      code: error.code
    },
    context
  }, error.message);
};

// Performance monitoring
export const startPerformanceTimer = (operation) => {
  const timerId = `${operation}-${Date.now()}`;
  performanceTrackers.set(timerId, performance.now());
  return timerId;
};

export const endPerformanceTimer = (timerId, operation) => {
  const startTime = performanceTrackers.get(timerId);
  if (!startTime) {
    logger.warn(`Performance timer ${timerId} not found`);
    return;
  }

  const duration = performance.now() - startTime;
  performanceTrackers.delete(timerId);

  logger.debug({
    type: 'performance',
    operation,
    duration: `${duration.toFixed(2)}ms`,
    timerId
  }, `Performance: ${operation} took ${duration.toFixed(2)}ms`);

  return duration;
};

// Blockchain operation logging
export const logBlockchainOperation = (operation, details = {}) => {
  logger.debug({
    type: 'blockchain_operation',
    operation,
    ...details
  }, `Blockchain operation: ${operation}`);
};

// Cache operation logging
export const logCacheOperation = (operation, key, hit = null) => {
  logger.debug({
    type: 'cache_operation',
    operation,
    key,
    hit: hit !== null ? hit : undefined
  }, `Cache ${operation}: ${key}${hit !== null ? (hit ? ' (hit)' : ' (miss)') : ''}`);
};

// Memory usage logging
export const logMemoryUsage = () => {
  const used = process.memoryUsage();
  logger.debug({
    type: 'memory_usage',
    rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(used.external / 1024 / 1024)}MB`
  }, 'Memory usage snapshot');
};

// Periodic memory logging in debug mode
if (logLevel === 'debug') {
  setInterval(() => {
    logMemoryUsage();
  }, 60000); // Every minute
}

// Log unhandled errors with enhanced details
process.on('uncaughtException', (error) => {
  logger.fatal({
    type: 'uncaught_exception',
    error: {
      message: error.message,
      name: error.name,
      stack: error.stack,
      code: error.code
    },
    timestamp: new Date().toISOString()
  }, 'Uncaught exception - shutting down');

  // Give time for logs to flush
  setTimeout(() => {
    process.exit(1);
  }, 100);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({
    type: 'unhandled_rejection',
    reason: reason instanceof Error ? {
      message: reason.message,
      name: reason.name,
      stack: reason.stack
    } : reason,
    promise: promise.toString(),
    timestamp: new Date().toISOString()
  }, 'Unhandled rejection - shutting down');

  // Give time for logs to flush
  setTimeout(() => {
    process.exit(1);
  }, 100);
});

// Log process events
process.on('warning', (warning) => {
  logger.warn({
    type: 'process_warning',
    name: warning.name,
    message: warning.message,
    stack: warning.stack
  }, 'Process warning');
});

// Log when logger is initialized
logger.info({
  type: 'logger_initialized',
  level: logLevel,
  environment: process.env.NODE_ENV,
  fileLogging: enableFileLogging || logLevel === 'debug',
  logsDirectory: logsDir
}, 'Logger initialized with enhanced debugging');