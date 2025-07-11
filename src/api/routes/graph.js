import { Router } from 'express';
import { z } from 'zod';
import { expensiveOperationLimiter, rateLimiter } from '../../middleware/rateLimiter.js';
import { GraphController } from '../../controllers/GraphController.js';
import { GraphQueries } from '../../services/GraphQueries.js';
import { RelationshipScorer } from '../../services/RelationshipScorer.js';
import { PathFinder } from '../../services/PathFinder.js';
import { GraphMetrics } from '../../services/GraphMetrics.js';

const router = Router();

// Helper to get or create services from app locals
function getServices(req) {
  const databaseService = req.app.locals.db;
  
  if (!req.app.locals.graphServices) {
    // Create services once and cache them
    req.app.locals.graphServices = {
      graphQueries: new GraphQueries(databaseService),
      relationshipScorer: new RelationshipScorer(databaseService),
      pathFinder: null, // Will be created after graphQueries
      graphMetrics: new GraphMetrics(databaseService),
      graphController: null // Will be created after all services
    };
    
    // Create PathFinder with graphQueries dependency
    req.app.locals.graphServices.pathFinder = new PathFinder(
      databaseService, 
      req.app.locals.graphServices.graphQueries
    );
    
    // Create controller with all services
    req.app.locals.graphServices.graphController = new GraphController(
      databaseService,
      req.app.locals.graphServices.graphQueries,
      req.app.locals.graphServices.relationshipScorer,
      req.app.locals.graphServices.pathFinder,
      req.app.locals.graphServices.graphMetrics
    );
  }
  
  return req.app.locals.graphServices;
}

// Validation schemas
const addressSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{48,}$/, 'Invalid Substrate address format');

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
  direction: z.enum(['inward', 'outward', 'both']).default('outward')
});

// Middleware to validate request
const validate = (schema, property = 'query') => {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req[property]);
      req[property] = validated;
      next();
    } catch (error) {
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
  try {
    const address = addressSchema.parse(req.params.address);
    req.params.address = address;
    next();
  } catch (error) {
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

// Main graph endpoint
router.get(
  '/:address',
  expensiveOperationLimiter,
  validateAddress,
  validate(graphQuerySchema),
  async (req, res, next) => {
    try {
      const { graphController } = getServices(req);
      await graphController.getGraph(req, res);
    } catch (error) {
      next(error);
    }
  }
);

// Shortest path endpoint
router.get(
  '/path',
  rateLimiter,
  validate(pathQuerySchema),
  async (req, res, next) => {
    try {
      const { graphController } = getServices(req);
      await graphController.getShortestPath(req, res);
    } catch (error) {
      next(error);
    }
  }
);

// Node metrics endpoint
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

// Pattern detection endpoint
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

// Progressive graph expansion endpoint
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

export default router;