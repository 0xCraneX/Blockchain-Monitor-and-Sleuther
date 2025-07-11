import { Router } from 'express';
import { searchRateLimiter } from '../middleware/rateLimiter.js';
import addressRoutes from './routes/addresses.js';
import graphRoutes from './routes/graph.js';
import investigationRoutes from './routes/investigations.js';
import statsRoutes from './routes/stats.js';
import { createRelationshipsRouter } from './routes/relationships.js';
import { DatabaseService } from '../services/DatabaseService.js';

const router = Router();

// API version
router.get('/', (req, res) => {
  res.json({
    name: 'Polkadot Analysis Tool API',
    version: '1.0.0',
    endpoints: {
      addresses: '/api/addresses',
      graph: '/api/graph',
      relationships: '/api/relationships',
      investigations: '/api/investigations',
      stats: '/api/stats'
    }
  });
});

// Mount routes
router.use('/addresses', searchRateLimiter, addressRoutes);
router.use('/graph', graphRoutes);
router.use('/investigations', investigationRoutes);
router.use('/stats', statsRoutes);

// Mount relationships router (factory function)
router.use('/relationships', (req, res, next) => {
  // Get database service from app locals
  const databaseService = req.app.locals.db;
  if (!databaseService) {
    return res.status(500).json({
      error: 'Database service not available'
    });
  }
  
  // Create and use relationships router
  const relationshipsRouter = createRelationshipsRouter(databaseService);
  relationshipsRouter(req, res, next);
});

export default router;