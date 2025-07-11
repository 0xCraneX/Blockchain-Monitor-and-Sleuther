import { Router } from 'express';
import { z } from 'zod';

const router = Router();

// Validation schemas
const statsQuerySchema = z.object({
  metric: z.string().optional(),
  days: z.coerce.number().min(1).max(365).default(30)
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
router.get('/', validate(statsQuerySchema), async (req, res, next) => {
  try {
    const { metric, days } = req.query;
    
    if (metric) {
      // Get specific metric
      const stats = req.app.locals.db.getStatistics(metric, days);
      res.json({
        metric,
        days,
        data: stats
      });
    } else {
      // Get overview stats
      const overview = {
        totalAccounts: 0,
        totalTransfers: 0,
        totalVolume: '0',
        lastSyncBlock: 0,
        syncStatus: 'idle'
      };
      
      // TODO: Calculate actual stats from database
      res.json(overview);
    }
  } catch (error) {
    next(error);
  }
});

router.get('/sync', async (req, res, next) => {
  try {
    const chainId = req.query.chain || 'polkadot';
    const syncStatus = req.app.locals.db.getSyncStatus(chainId);
    
    res.json({
      chainId,
      status: syncStatus || {
        last_processed_block: 0,
        status: 'idle',
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;