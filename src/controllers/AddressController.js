import { logger } from '../utils/logger.js';

export class AddressController {
  async search(db, query, limit) {
    try {
      const results = db.searchAccounts(query, limit);
      logger.debug('Address search completed', { query, resultCount: results.length });
      return results;
    } catch (error) {
      logger.error('Address search failed', { query, error });
      throw error;
    }
  }

  async getAccount(db, blockchain, address) {
    try {
      // Try to get from database first
      let account = db.getAccount(address);
      
      // If not in database or data is stale, fetch from blockchain
      if (!account || this.isDataStale(account.updated_at)) {
        const chainData = await blockchain.getAccount(address);
        
        // Update database
        account = db.createAccount({
          address: chainData.address,
          publicKey: null, // Would need to derive this
          identityDisplay: chainData.identity?.display,
          balance: chainData.balance,
          firstSeenBlock: account?.first_seen_block || null
        });
        
        // Update identity if available
        if (chainData.identity) {
          db.updateAccountIdentity(address, {
            ...chainData.identity,
            verified: false // Would need to check judgements
          });
        }
      }
      
      return account;
    } catch (error) {
      logger.error('Failed to get account', { address, error });
      throw error;
    }
  }

  async getTransfers(db, address, options) {
    try {
      const transfers = db.getTransfers(address, options);
      
      // Enhance transfers with account info
      const enhancedTransfers = transfers.map(transfer => ({
        ...transfer,
        direction: transfer.from_address === address ? 'out' : 'in',
        counterparty: transfer.from_address === address ? transfer.to_address : transfer.from_address
      }));
      
      return enhancedTransfers;
    } catch (error) {
      logger.error('Failed to get transfers', { address, options, error });
      throw error;
    }
  }

  async getRelationships(db, address, options) {
    try {
      const relationships = db.getRelationships(address, options);
      
      // Enhance with account info for connected addresses
      const enhancedRelationships = await Promise.all(
        relationships.map(async (rel) => {
          const connectedAccount = db.getAccount(rel.connected_address);
          return {
            ...rel,
            identity: connectedAccount?.identity_display || null,
            risk_score: connectedAccount?.risk_score || 0
          };
        })
      );
      
      return enhancedRelationships;
    } catch (error) {
      logger.error('Failed to get relationships', { address, options, error });
      throw error;
    }
  }

  async getPatterns(db, address) {
    try {
      const patterns = db.getPatterns(address);
      return patterns;
    } catch (error) {
      logger.error('Failed to get patterns', { address, error });
      throw error;
    }
  }

  isDataStale(updatedAt, maxAgeHours = 24) {
    if (!updatedAt) return true;
    const age = Date.now() - new Date(updatedAt).getTime();
    return age > maxAgeHours * 60 * 60 * 1000;
  }
}