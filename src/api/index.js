import { Router } from 'express';
import { searchRateLimiter } from '../middleware/rateLimiter.js';
import addressRoutes from './routes/addresses.js';
import graphRoutes from './routes/graph.js';
import investigationRoutes from './routes/investigations.js';
import statsRoutes from './routes/stats.js';
import nodesRoutes from './routes/nodes.js';
import { createRelationshipsRouter } from './routes/relationships.js';
import { createLogger, logApiRequest, logApiResponse, logError } from '../utils/logger.js';
import { performance } from 'perf_hooks';

const logger = createLogger('API');

const router = Router();

// Add request logging middleware
router.use((req, res, next) => {
  const startTime = performance.now();
  req.startTime = startTime;

  // Log incoming request
  logApiRequest(req);

  // Override res.json to log responses
  const originalJson = res.json;
  res.json = function(data) {
    const duration = performance.now() - startTime;
    logApiResponse(req, res, duration);

    // Log response data in debug mode
    if (process.env.LOG_LEVEL === 'debug') {
      logger.debug({
        type: 'api_response_data',
        path: req.path,
        method: req.method,
        dataSize: JSON.stringify(data).length,
        requestId: req.id
      }, 'Response data sent');
    }

    return originalJson.call(this, data);
  };

  next();
});

// API version
router.get('/', (req, res) => {
  logger.debug('API root endpoint accessed');
  res.json({
    name: 'Polkadot Analysis Tool API',
    version: '1.0.0',
    endpoints: {
      addresses: '/api/addresses',
      graph: '/api/graph',
      relationships: '/api/relationships',
      investigations: '/api/investigations',
      stats: '/api/stats',
      nodes: '/api/nodes'
    }
  });
});

// Mount routes with logging
router.use('/addresses', (req, res, next) => {
  logger.debug('Routing to addresses endpoint', { path: req.path, query: req.query });
  next();
}, searchRateLimiter, addressRoutes);

router.use('/graph', (req, res, next) => {
  logger.debug('Routing to graph endpoint', { path: req.path, query: req.query });
  next();
}, graphRoutes);

router.use('/investigations', (req, res, next) => {
  logger.debug('Routing to investigations endpoint', { path: req.path, query: req.query });
  next();
}, investigationRoutes);

router.use('/stats', (req, res, next) => {
  logger.debug('Routing to stats endpoint', { path: req.path, query: req.query });
  next();
}, statsRoutes);

router.use('/nodes', (req, res, next) => {
  logger.debug('Routing to nodes endpoint', { path: req.path, query: req.query });
  next();
}, nodesRoutes);

// Mount relationships router (factory function)
router.use('/relationships', (req, res, next) => {
  logger.debug('Routing to relationships endpoint', { path: req.path, query: req.query });

  // Get database service from app locals
  const databaseService = req.app.locals.db;
  if (!databaseService) {
    logger.error('Database service not available for relationships endpoint');
    return res.status(500).json({
      error: 'Database service not available'
    });
  }

  // Create and use relationships router
  try {
    const relationshipsRouter = createRelationshipsRouter(databaseService);
    relationshipsRouter(req, res, next);
  } catch (error) {
    logError(error, { endpoint: 'relationships', path: req.path });
    return res.status(500).json({
      error: 'Failed to initialize relationships router'
    });
  }
});

// Error handling middleware
router.use((error, req, res, _next) => {
  const duration = req.startTime ? performance.now() - req.startTime : 0;
  logError(error, {
    path: req.path,
    method: req.method,
    duration: `${duration.toFixed(2)}ms`,
    requestId: req.id
  });

  res.status(error.status || 500).json({
    error: error.message || 'Internal server error',
    requestId: req.id
  });
});

export default router;