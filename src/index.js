import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import apiRouter from './api/index.js';
import { DatabaseService } from './services/DatabaseService.js';
import { BlockchainService } from './services/BlockchainService.js';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(rateLimiter);

// API routes
app.use('/api', apiRouter);

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  logger.info('Client connected', { id: socket.id });
  
  socket.on('subscribe:address', (address) => {
    socket.join(`address:${address}`);
    logger.info('Client subscribed to address', { id: socket.id, address });
  });
  
  socket.on('unsubscribe:address', (address) => {
    socket.leave(`address:${address}`);
    logger.info('Client unsubscribed from address', { id: socket.id, address });
  });
  
  socket.on('disconnect', () => {
    logger.info('Client disconnected', { id: socket.id });
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
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  logger.info('Shutting down gracefully...');
  
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  // Close database connections
  if (app.locals.db) {
    app.locals.db.close();
  }
  
  // Disconnect from blockchain
  if (app.locals.blockchain) {
    await app.locals.blockchain.disconnect();
  }
  
  process.exit(0);
}

// Start the application
initialize();