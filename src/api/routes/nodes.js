import { Router } from 'express';
import { z } from 'zod';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('NodesRoutes');
const router = Router();

// Validation schema
const addressSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{46,}$/, 'Invalid Substrate address format');

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
        status: 400
      }
    });
  }
};

// Get detailed node information
router.get('/:address', validateAddress, async (req, res, next) => {
  try {
    const { address } = req.params;
    const db = req.app.locals.db;
    const blockchain = req.app.locals.blockchain;

    logger.info(`Node details requested for ${address}`);

    // Get account information
    const account = await db.getAccount(address);
    let balance = '0';
    let identity = null;

    // Try to get on-chain data if available
    if (blockchain && blockchain.api && blockchain.api.isConnected) {
      try {
        const accountInfo = await blockchain.api.query.system.account(address);
        balance = accountInfo.data.free.toString();

        // Get identity if available
        const identityInfo = await blockchain.api.query.identity.identityOf(address);
        if (identityInfo.isSome) {
          const info = identityInfo.unwrap().info;
          identity = {
            display: info.display.asRaw.toHuman(),
            legal: info.legal.asRaw.toHuman(),
            web: info.web.asRaw.toHuman(),
            twitter: info.twitter.asRaw.toHuman()
          };
        }
      } catch (err) {
        logger.warn(`Failed to fetch on-chain data for ${address}:`, err.message);
      }
    }

    // Get transfer statistics
    const transferStats = await db.getTransferStatistics(address);

    // Determine node type based on various factors
    let nodeType = 'regular';
    const tags = [];

    if (account) {
      // Check for exchange patterns
      if (transferStats.uniqueCounterparties > 1000 && transferStats.totalVolume > BigInt('1000000000000000')) {
        nodeType = 'exchange';
        tags.push('Exchange');
      }

      // Check for validator
      if (identity && identity.display && identity.display.includes('Validator')) {
        nodeType = 'validator';
        tags.push('Validator');
      }

      // Check for high risk patterns
      if (transferStats.rapidMovementCount > 10) {
        tags.push('High Activity');
      }
    }

    res.json({
      address,
      identity,
      nodeType,
      balance,
      firstSeen: account ? account.first_seen : Date.now(),
      lastActive: account ? account.last_active : Date.now(),
      totalIncoming: transferStats.totalIncoming.toString(),
      totalOutgoing: transferStats.totalOutgoing.toString(),
      incomingCount: transferStats.incomingCount,
      outgoingCount: transferStats.outgoingCount,
      degree: transferStats.incomingCount + transferStats.outgoingCount,
      tags,
      metadata: {
        hasSubIdentity: false,
        hasProxy: false,
        isMultisig: false
      }
    });

  } catch (error) {
    logger.error(`Error getting node details for ${req.params.address}:`, error);
    next(error);
  }
});

export default router;