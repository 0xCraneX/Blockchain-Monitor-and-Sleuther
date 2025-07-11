import { Router } from 'express';
import { z } from 'zod';
import { expensiveOperationLimiter } from '../../middleware/rateLimiter.js';

const router = Router();

// Validation schemas
const graphQuerySchema = z.object({
  address: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{48,}$/),
  depth: z.coerce.number().min(1).max(4).default(2),
  minVolume: z.string().default('0'),
  maxNodes: z.coerce.number().min(10).max(500).default(100)
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
          message: 'Validation error',
          details: error.errors
        }
      });
    }
  };
};

// Routes
router.get('/', expensiveOperationLimiter, validate(graphQuerySchema), async (req, res, next) => {
  try {
    const { address, depth, minVolume, maxNodes } = req.query;
    
    // TODO: Implement graph generation logic
    const graph = {
      nodes: [],
      edges: [],
      metadata: {
        centerAddress: address,
        depth,
        minVolume,
        totalNodes: 0,
        totalEdges: 0
      }
    };
    
    res.json(graph);
  } catch (error) {
    next(error);
  }
});

export default router;