import { Router } from 'express';
import { z } from 'zod';
import { expensiveOperationLimiter, rateLimiter } from '../../middleware/rateLimiter.js';
import { GraphController } from '../../controllers/GraphController.js';
import { GraphQueries } from '../../services/GraphQueries.js';
import { RelationshipScorer } from '../../services/RelationshipScorer.js';
import { PathFinder } from '../../services/PathFinder.js';
import { GraphMetrics } from '../../services/GraphMetrics.js';
import { RealDataService } from '../../services/RealDataService.js';
import { createLogger, logMethodEntry, logMethodExit, logError, startPerformanceTimer, endPerformanceTimer } from '../../utils/logger.js';

const logger = createLogger('GraphRoutes');

const router = Router();

// Helper to get or create services from app locals
function getServices(req) {
  const trackerId = logMethodEntry('GraphRoutes', 'getServices');
  const databaseService = req.app.locals.db;

  if (!req.app.locals.graphServices) {
    logger.info('Initializing graph services for the first time');
    const serviceInitTimer = startPerformanceTimer('graph_services_init');

    try {
      // Create services once and cache them
      req.app.locals.graphServices = {
        graphQueries: new GraphQueries(databaseService),
        relationshipScorer: new RelationshipScorer(databaseService),
        pathFinder: null, // Will be created after graphQueries
        graphMetrics: new GraphMetrics(databaseService),
        realDataService: null, // Will be created with blockchain service
        graphController: null // Will be created after all services
      };

      logger.debug('Created core graph services');

      // Create PathFinder with graphQueries dependency
      req.app.locals.graphServices.pathFinder = new PathFinder(
        databaseService,
        req.app.locals.graphServices.graphQueries
      );

      logger.debug('Created PathFinder service');

      // Create RealDataService if blockchain is available
      const blockchainService = req.app.locals.blockchain;
      if (blockchainService) {
        req.app.locals.graphServices.realDataService = new RealDataService(
          blockchainService,
          databaseService
        );
        logger.debug('Created RealDataService');
      }

      // Create controller with all services
      req.app.locals.graphServices.graphController = new GraphController(
        databaseService,
        req.app.locals.graphServices.graphQueries,
        req.app.locals.graphServices.relationshipScorer,
        req.app.locals.graphServices.pathFinder,
        req.app.locals.graphServices.graphMetrics,
        req.app.locals.graphServices.realDataService
      );

      logger.debug('Created GraphController');
      endPerformanceTimer(serviceInitTimer, 'graph_services_init');
      logger.info('Graph services initialized successfully');
    } catch (error) {
      logError(error, { context: 'graph_services_initialization' });
      throw error;
    }
  } else {
    logger.debug('Using cached graph services');
  }

  logMethodExit('GraphRoutes', 'getServices', trackerId);
  return req.app.locals.graphServices;
}

// Validation schemas
const addressSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{46,}$/, 'Invalid Substrate address format');

const graphQuerySchema = z.object({
  depth: z.coerce.number().min(1).max(5).default(2),
  maxNodes: z.coerce.number().min(1).max(1000).default(100),
  minVolume: z.string().default('0'),
  minBalance: z.string().default('0'),
  direction: z.enum(['incoming', 'outgoing', 'both']).default('both'),
  layout: z.enum(['force', 'hierarchical', 'circular']).default('force'),
  includeRiskScores: z.coerce.boolean().default(false),
  riskThreshold: z.coerce.number().min(0).max(100).optional(),
  nodeTypes: z.array(z.enum(['regular', 'exchange', 'validator', 'pool', 'parachain'])).optional(),
  startTime: z.coerce.number().optional(),
  endTime: z.coerce.number().optional(),
  enableClustering: z.coerce.boolean().default(false),
  clusteringAlgorithm: z.enum(['louvain', 'label-propagation', 'connected-components']).default('louvain')
});

const pathQuerySchema = z.object({
  from: addressSchema,
  to: addressSchema,
  maxDepth: z.coerce.number().min(1).max(6).default(4),
  algorithm: z.enum(['dijkstra', 'bfs', 'weighted']).default('dijkstra'),
  includeAlternatives: z.coerce.boolean().default(false)
});

const patternsQuerySchema = z.object({
  depth: z.coerce.number().min(1).max(5).default(2),
  timeWindow: z.coerce.number().min(60).max(604800).default(86400), // 1 minute to 1 week
  sensitivity: z.enum(['low', 'medium', 'high']).default('medium')
});

const expandQuerySchema = z.object({
  cursor: z.string().min(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  direction: z.string().transform((val) => {
    // Handle direction with optional suffix (e.g., "outward:1")
    const direction = val.split(':')[0];
    if (!['inward', 'outward', 'both'].includes(direction)) {
      throw new Error(`Invalid direction: ${direction}`);
    }
    return direction;
  }).default('outward')
});

// Middleware to validate request
const validate = (schema, property = 'query') => {
  return (req, res, next) => {
    const validationTimer = startPerformanceTimer('request_validation');
    logger.debug(`Validating ${property} against schema`, {
      path: req.path,
      property,
      data: req[property]
    });

    try {
      const validated = schema.parse(req[property]);
      req[property] = validated;
      endPerformanceTimer(validationTimer, 'request_validation');
      logger.debug('Validation successful', { property, validated });
      next();
    } catch (error) {
      endPerformanceTimer(validationTimer, 'request_validation');
      logger.warn('Validation failed', {
        property,
        errors: error.errors,
        data: req[property]
      });

      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters',
          status: 400,
          details: error.errors
        }
      });
    }
  };
};

// Middleware to validate address parameter
const validateAddress = (req, res, next) => {
  logger.debug('Validating address parameter', { address: req.params.address });

  try {
    const address = addressSchema.parse(req.params.address);
    req.params.address = address;
    logger.debug('Address validation successful', { address });
    next();
  } catch (error) {
    logger.warn('Invalid address format', {
      address: req.params.address,
      error: error.message
    });

    res.status(400).json({
      error: {
        code: 'INVALID_ADDRESS',
        message: 'The provided address is not a valid Substrate address',
        status: 400,
        details: {
          address: req.params.address,
          expected: 'SS58 encoded address'
        }
      }
    });
  }
};

// Routes

// Shortest path endpoint (must be before /:address)
router.get(
  '/path',
  rateLimiter,
  validate(pathQuerySchema),
  async (req, res, next) => {
    const trackerId = logMethodEntry('GraphRoutes', 'getShortestPath', {
      from: req.query.from,
      to: req.query.to,
      maxDepth: req.query.maxDepth,
      algorithm: req.query.algorithm
    });

    try {
      const { graphController } = getServices(req);
      logger.info('Processing shortest path request', {
        from: req.query.from,
        to: req.query.to,
        algorithm: req.query.algorithm
      });

      await graphController.getShortestPath(req, res);
      logMethodExit('GraphRoutes', 'getShortestPath', trackerId);
    } catch (error) {
      logError(error, {
        endpoint: 'getShortestPath',
        query: req.query
      });
      logMethodExit('GraphRoutes', 'getShortestPath', trackerId);
      next(error);
    }
  }
);

// Progressive graph expansion endpoint (must be before /:address)
router.get(
  '/expand',
  rateLimiter,
  validate(expandQuerySchema),
  async (req, res, next) => {
    try {
      const { graphController } = getServices(req);
      await graphController.expandGraph(req, res);
    } catch (error) {
      next(error);
    }
  }
);

// Node metrics endpoint (specific route before /:address)
router.get(
  '/metrics/:address',
  rateLimiter,
  validateAddress,
  async (req, res, next) => {
    try {
      const { graphController } = getServices(req);
      await graphController.getNodeMetrics(req, res);
    } catch (error) {
      next(error);
    }
  }
);

// Pattern detection endpoint (specific route before /:address)
router.get(
  '/patterns/:address',
  expensiveOperationLimiter,
  validateAddress,
  validate(patternsQuerySchema),
  async (req, res, next) => {
    try {
      const { graphController } = getServices(req);
      await graphController.detectPatterns(req, res);
    } catch (error) {
      next(error);
    }
  }
);

// Main graph endpoint (must be last among parameterized routes)
router.get(
  '/:address',
  expensiveOperationLimiter,
  validateAddress,
  validate(graphQuerySchema),
  async (req, res, next) => {
    const trackerId = logMethodEntry('GraphRoutes', 'getGraph', {
      address: req.params.address,
      depth: req.query.depth,
      maxNodes: req.query.maxNodes,
      minVolume: req.query.minVolume,
      direction: req.query.direction
    });

    try {
      const { graphController } = getServices(req);
      logger.info('Processing graph generation request', {
        address: req.params.address,
        depth: req.query.depth,
        maxNodes: req.query.maxNodes
      });

      await graphController.getGraph(req, res);
      logMethodExit('GraphRoutes', 'getGraph', trackerId);
    } catch (error) {
      logError(error, {
        endpoint: 'getGraph',
        address: req.params.address,
        query: req.query
      });
      logMethodExit('GraphRoutes', 'getGraph', trackerId);
      next(error);
    }
  }
);

export default router;