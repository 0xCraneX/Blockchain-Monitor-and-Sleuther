import { Router } from 'express';
import { z } from 'zod';

const router = Router();

// Validation schemas
const investigationSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  addresses: z.array(z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{48,}$/)).min(1),
  filters: z.object({}).optional(),
  graphState: z.object({}).optional()
});

const sessionIdSchema = z.object({
  sessionId: z.string().min(1).max(100)
});

// Middleware to validate request
const validate = (schema, property = 'body') => {
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

// Get all investigations (for listing)
router.get('/', async (req, res, next) => {
  try {
    // For now, return empty array since we don't have persistent storage
    // In production, this would query the database for all investigations
    res.json({
      investigations: [],
      count: 0
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', validate(investigationSchema), async (req, res, next) => {
  try {
    const sessionId = `investigation_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const investigation = {
      sessionId,
      ...req.body
    };

    req.app.locals.db.saveInvestigation(investigation);

    res.status(201).json({
      sessionId,
      message: 'Investigation saved successfully'
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:sessionId', validate(sessionIdSchema, 'params'), async (req, res, next) => {
  try {
    const investigation = req.app.locals.db.getInvestigation(req.params.sessionId);

    if (!investigation) {
      return res.status(404).json({
        error: {
          message: 'Investigation not found',
          status: 404
        }
      });
    }

    res.json(investigation);
  } catch (error) {
    next(error);
  }
});

router.put('/:sessionId',
  validate(sessionIdSchema, 'params'),
  validate(investigationSchema),
  async (req, res, next) => {
    try {
      const investigation = {
        sessionId: req.params.sessionId,
        ...req.body
      };

      req.app.locals.db.saveInvestigation(investigation);

      res.json({
        message: 'Investigation updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;