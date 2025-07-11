import { Router } from 'express';
import { searchRateLimiter } from '../middleware/rateLimiter.js';
import addressRoutes from './routes/addresses.js';
import graphRoutes from './routes/graph.js';
import investigationRoutes from './routes/investigations.js';
import statsRoutes from './routes/stats.js';

const router = Router();

// API version
router.get('/', (req, res) => {
  res.json({
    name: 'Polkadot Analysis Tool API',
    version: '1.0.0',
    endpoints: {
      addresses: '/api/addresses',
      graph: '/api/graph',
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

export default router;