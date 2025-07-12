import express from 'express';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import apiRouter from './api/index.js';
import { DatabaseService } from './services/DatabaseService.js';
import { BlockchainService } from './services/BlockchainService.js';
import { GraphWebSocket } from './services/GraphWebSocket.js';
import {
  configureSecurityHeaders,
  globalLimiter,
  securityMonitoringMiddleware,
  monitor
} from './security/index.js';
import {
  getWebSocketCorsConfig,
  initializeSecurityConfig,
  validateSecurityEnvironment
} from '../config/security.js';

// Load environment variables
dotenv.config();

// Validate security configuration early
const securityErrors = validateSecurityEnvironment();
if (securityErrors.length > 0 && process.env.NODE_ENV === 'production') {
  logger.error('Security configuration validation failed:', securityErrors);
  process.exit(1);
}

// Initialize security configuration
const securityConfig = initializeSecurityConfig();
logger.info(`Server starting with security configuration for: ${securityConfig.environment}`);

const app = express();
const server = createServer(app);

// Enhanced WebSocket configuration with security
const wsConfig = getWebSocketCorsConfig();
const io = new Server(server, {
  cors: wsConfig,
  allowEIO3: false, // Disable legacy Engine.IO support
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6, // 1MB max message size
  allowRequest: (req, callback) => {
    // Additional WebSocket security checks
    const origin = req.headers.origin;
    const allowedOrigins = wsConfig.origin;

    if (!origin) {
      if (securityConfig.environment === 'production') {
        return callback(new Error('Origin header required'), false);
      }
      // In development, allow connections without origin header (for local testing)
      return callback(null, true);
    }

    if (Array.isArray(allowedOrigins) && !allowedOrigins.includes(origin)) {
      monitor.logSecurityEvent({
        type: 'websocket_unauthorized_origin',
        origin,
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      });
      return callback(new Error('Origin not allowed'), false);
    }

    callback(null, true);
  }
});

// Security middleware - ORDER MATTERS!
configureSecurityHeaders(app); // Must be first
app.use(compression());
app.use(globalLimiter); // Global rate limiting
app.use(securityMonitoringMiddleware); // Security monitoring
app.use(express.json({
  limit: '10mb',
  strict: true,
  type: 'application/json'
}));
app.use(express.urlencoded({
  extended: false,
  limit: '10mb'
}));
app.use(express.static('public', {
  maxAge: securityConfig.environment === 'production' ? '1d' : 0,
  etag: false,
  lastModified: false
}));
app.use(rateLimiter); // Legacy rate limiter (can be removed if not needed)

// API routes
app.use('/api', apiRouter);

// Initialize GraphWebSocket service with security monitoring
const graphWebSocket = new GraphWebSocket();
graphWebSocket.initializeHandlers(io);

// Enhanced WebSocket security monitoring
io.on('connection', (socket) => {
  const clientInfo = {
    id: socket.id,
    ip: socket.handshake.address,
    userAgent: socket.handshake.headers['user-agent'],
    origin: socket.handshake.headers.origin,
    timestamp: new Date().toISOString()
  };

  logger.info('WebSocket connection established', clientInfo);

  // Track connection for monitoring
  monitor.logSecurityEvent({
    type: 'websocket_connection',
    ...clientInfo
  });

  // Set connection limits
  socket.setMaxListeners(10);

  // Monitor for unusual activity
  let messageCount = 0;
  const startTime = Date.now();

  socket.onAny(() => {
    messageCount++;
    const duration = Date.now() - startTime;

    // Rate limiting: max 60 messages per minute
    if (messageCount > 60 && duration < 60000) {
      monitor.logSecurityEvent({
        type: 'websocket_rate_limit',
        socketId: socket.id,
        messageCount,
        duration,
        ip: clientInfo.ip
      });

      socket.emit('error', {
        message: 'Rate limit exceeded',
        code: 'WEBSOCKET_RATE_LIMIT'
      });
      socket.disconnect(true);
      return;
    }
  });

  socket.on('disconnect', (reason) => {
    logger.info('WebSocket disconnected', {
      id: socket.id,
      reason,
      duration: Date.now() - startTime,
      messageCount
    });
  });

  socket.on('error', (error) => {
    monitor.logSecurityEvent({
      type: 'websocket_error',
      socketId: socket.id,
      error: error.message,
      ip: clientInfo.ip
    });
  });
});

// Error handling
app.use(errorHandler);

// Initialize services
async function initialize() {
  try {
    // Initialize database
    const db = new DatabaseService();
    await db.initialize();
    logger.info('Database initialized');

    // Initialize blockchain connection
    const blockchain = new BlockchainService();
    await blockchain.connect();
    logger.info('Blockchain connection established');

    // Make services available globally
    app.locals.db = db;
    app.locals.blockchain = blockchain;
    app.locals.io = io;
    app.locals.graphWebSocket = graphWebSocket;

    // Start server
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || 'localhost';

    server.listen(port, host, () => {
      logger.info(`Server running at http://${host}:${port}`);
    });
  } catch (error) {
    logger.error('Failed to initialize application', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For Nodemon

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  monitor.logSecurityEvent({
    type: 'uncaught_exception',
    error: error.message,
    stack: error.stack
  });
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  monitor.logSecurityEvent({
    type: 'unhandled_rejection',
    reason: reason?.message || reason,
    stack: reason?.stack
  });
  shutdown('UNHANDLED_REJECTION');
});

async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Log shutdown event for security monitoring
  monitor.logSecurityEvent({
    type: 'server_shutdown',
    signal,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });

  // Set a timeout for forced shutdown
  const forceShutdownTimeout = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000); // 10 seconds

  try {
    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Close all WebSocket connections gracefully
    io.emit('server_shutdown', {
      message: 'Server is shutting down',
      gracePeriod: 5000
    });

    // Wait a moment for clients to disconnect
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Force close any remaining connections
    io.close(() => {
      logger.info('WebSocket server closed');
    });

    // Close database connections
    if (app.locals.db) {
      await app.locals.db.close();
      logger.info('Database connections closed');
    }

    // Disconnect from blockchain
    if (app.locals.blockchain) {
      await app.locals.blockchain.disconnect();
      logger.info('Blockchain connection closed');
    }

    // Final security event log
    monitor.logSecurityEvent({
      type: 'server_shutdown_complete',
      signal,
      uptime: process.uptime()
    });

    clearTimeout(forceShutdownTimeout);
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    clearTimeout(forceShutdownTimeout);
    process.exit(1);
  }
}

// Start the application
initialize();

// Export for testing
export { app, server };