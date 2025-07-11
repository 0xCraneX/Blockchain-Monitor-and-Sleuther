import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { AddressController } from '../../controllers/AddressController.js';

const router = Router();

// Validation schemas
const searchSchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().min(1).max(100).default(20)
});

const addressParamsSchema = z.object({
  address: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{48,}$/)
});

const transfersQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional()
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

// Initialize controller
const controller = new AddressController();

// Routes
router.get('/search', validate(searchSchema), async (req, res, next) => {
  try {
    const results = await controller.search(req.app.locals.db, req.query.q, req.query.limit);
    res.json({
      query: req.query.q,
      count: results.length,
      results
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:address', validate(addressParamsSchema, 'params'), async (req, res, next) => {
  try {
    const account = await controller.getAccount(
      req.app.locals.db, 
      req.app.locals.blockchain,
      req.params.address
    );
    
    if (!account) {
      return res.status(404).json({
        error: {
          message: 'Address not found',
          status: 404
        }
      });
    }
    
    res.json(account);
  } catch (error) {
    next(error);
  }
});

router.get('/:address/transfers', 
  validate(addressParamsSchema, 'params'),
  validate(transfersQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const transfers = await controller.getTransfers(
        req.app.locals.db,
        req.params.address,
        req.query
      );
      
      res.json({
        address: req.params.address,
        count: transfers.length,
        transfers
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/:address/relationships',
  validate(addressParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const relationships = await controller.getRelationships(
        req.app.locals.db,
        req.params.address,
        {
          depth: req.query.depth || 1,
          minVolume: req.query.minVolume || '0',
          limit: req.query.limit || 100
        }
      );
      
      res.json({
        address: req.params.address,
        count: relationships.length,
        relationships
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/:address/patterns',
  validate(addressParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const patterns = await controller.getPatterns(
        req.app.locals.db,
        req.params.address
      );
      
      res.json({
        address: req.params.address,
        count: patterns.length,
        patterns
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;